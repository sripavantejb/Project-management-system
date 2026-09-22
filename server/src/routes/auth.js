import express from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { User } from '../models/User.js'
import { Tenant } from '../models/Tenant.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import {
  requireAuth,
  signAccessToken,
  signRefreshToken,
} from '../middleware/auth.js'
import {
  assertSeatAvailable,
  assertAdminSlotAvailable,
  isCompanyAdminRole,
  countCompanyAdmins,
  withTenant,
} from '../middleware/tenant.js'
import {
  normalizeTenantFeatures,
  tenantIsAccessible,
  tenantBlockMessage,
} from '../lib/tenantFeatures.js'
import { defaultPermissionsForRole } from '../lib/permissions.js'

const BUILTIN_INVITE_ROLES = [
  'admin',
  'owner',
  'hr',
  'project_manager',
  'designer',
  'site_supervisor',
  'vendor',
  'client',
]

const router = express.Router()

function serializeTenant(tenant) {
  if (!tenant) return null
  return {
    id: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    seatLimit: tenant.seatLimit,
    adminLimit: tenant.adminLimit ?? 3,
    subscriptionPlan: tenant.subscriptionPlan || 'pro',
    cancelledAt: tenant.cancelledAt || null,
    features: normalizeTenantFeatures(tenant.features),
    logoUrl: tenant.logoUrl || '',
    brandColor: tenant.brandColor || '',
    notice: tenant.notice?.active
      ? {
          title: tenant.notice.title || '',
          message: tenant.notice.message || '',
          variant: tenant.notice.variant || 'info',
          dismissible: tenant.notice.dismissible !== false,
          blocking: !!tenant.notice.blocking,
          updatedAt: tenant.notice.updatedAt || null,
        }
      : null,
    customRoles: (tenant.customRoles || []).map((role) => ({
      key: role.key,
      label: role.label,
      basedOn: role.basedOn || 'designer',
      permissions:
        role.permissions && typeof role.permissions === 'object'
          ? role.permissions
          : {},
      createdAt: role.createdAt || null,
    })),
  }
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    // Open self-serve register only when explicitly enabled
    if (process.env.ALLOW_PUBLIC_REGISTER !== 'true') {
      throw new AppError(
        'Public registration is disabled. Ask your workspace admin for an invite.',
        403,
      )
    }

    const data = registerSchema.parse(req.body)
    await assertSeatAvailable(req.tenantId)

    const exists = await User.findOne({
      tenantId: req.tenantId,
      email: data.email.toLowerCase(),
    })
    if (exists) throw new AppError('Email already registered in this workspace', 409)

    const user = await User.create(
      withTenant(req, {
        ...data,
        email: data.email.toLowerCase(),
        role: 'project_manager',
      }),
    )

    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user)
    user.refreshTokens = [refreshToken]
    await user.save()

    res.status(201).json({
      success: true,
      user: user.toSafeJSON(),
      accessToken,
      refreshToken,
      tenant: {
        id: req.tenant._id,
        name: req.tenant.name,
        slug: req.tenant.slug,
      },
    })
  }),
)

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body)
    const email = data.email.toLowerCase()

    // Platform admins can log in from any workspace slug
    let user = await User.findOne({
      tenantId: req.tenantId,
      email,
    }).select('+password +refreshTokens')

    if (!user) {
      user = await User.findOne({
        email,
        isPlatformAdmin: true,
      }).select('+password +refreshTokens')
    }

    if (!user) throw new AppError('Invalid email or password', 401)

    const ok = await user.comparePassword(data.password)
    if (!ok) throw new AppError('Invalid email or password', 401)

    if (!user.isActive) throw new AppError('Account is deactivated', 403)

    // A blocked company still isn't allowed to sign in — but a platform
    // admin logging in with this same endpoint must never be judged by
    // whichever company's slug happened to be on the request.
    if (!user.isPlatformAdmin && !tenantIsAccessible(req.tenant)) {
      throw new AppError(tenantBlockMessage(req.tenant), 403, 'TENANT_BLOCKED')
    }

    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user)
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken]
    await user.save()

    res.json({
      success: true,
      user: user.toSafeJSON(),
      accessToken,
      refreshToken,
      tenant: serializeTenant(req.tenant),
    })
  }),
)

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body
    if (!refreshToken) throw new AppError('Refresh token required', 400)

    let payload
    try {
      const jwt = await import('jsonwebtoken')
      payload = jwt.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    } catch {
      throw new AppError('Invalid refresh token', 401)
    }

    const user = await User.findById(payload.sub).select('+refreshTokens')
    if (!user || !user.refreshTokens?.includes(refreshToken)) {
      throw new AppError('Invalid refresh token', 401)
    }

    const accessToken = signAccessToken(user)
    const newRefresh = signRefreshToken(user)
    // Keep the presented token valid too (grace for a second tab / a request
    // that raced this one), instead of instantly revoking it — revoking used
    // to log users out mid-session. Cap the list so it can't grow unbounded.
    user.refreshTokens = [...user.refreshTokens, newRefresh].slice(-10)
    await user.save()

    res.json({ success: true, accessToken, refreshToken: newRefresh })
  }),
)

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body
    const user = await User.findById(req.user._id).select('+refreshTokens')
    if (user && refreshToken) {
      user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken)
      await user.save()
    }
    res.json({ success: true })
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    let tenant = null
    if (req.user.tenantId) {
      tenant = await Tenant.findById(req.user.tenantId).select(
        'name slug status seatLimit adminLimit subscriptionPlan cancelledAt features logoUrl brandColor notice customRoles',
      )
    }
    res.json({
      success: true,
      user: req.user.toSafeJSON(),
      tenant: tenant
        ? serializeTenant(tenant)
        : req.tenant
          ? serializeTenant(req.tenant)
          : null,
    })
  }),
)

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = [
      'name',
      'phone',
      'title',
      'avatar',
      'company',
      'onboardingCompleted',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key]
    }
    await req.user.save()
    res.json({ success: true, user: req.user.toSafeJSON() })
  }),
)

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1).optional(),
      password: z.string().min(6),
    })
    const { currentPassword, password } = schema.parse(req.body)
    const user = await User.findById(req.user._id).select('+password')
    if (!user) throw new AppError('User not found', 404)

    if (!user.mustChangePassword) {
      if (!currentPassword) throw new AppError('Current password required', 400)
      const ok = await user.comparePassword(currentPassword)
      if (!ok) throw new AppError('Current password is incorrect', 401)
    }

    user.password = password
    user.mustChangePassword = false
    await user.save()
    res.json({ success: true, message: 'Password updated' })
  }),
)

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = z.string().email().parse(req.body.email).toLowerCase()
    const user = await User.findOne({ tenantId: req.tenantId, email })
    if (!user) {
      return res.json({
        success: true,
        message: 'If that email exists, a reset link was sent.',
      })
    }

    const token = crypto.randomBytes(32).toString('hex')
    user.resetPasswordToken = token
    user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 60)
    await user.save()

    res.json({
      success: true,
      message: 'If that email exists, a reset link was sent.',
      ...(process.env.NODE_ENV !== 'production' && { resetToken: token }),
    })
  }),
)

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      token: z.string().min(10),
      password: z.string().min(6),
    })
    const { token, password } = schema.parse(req.body)
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordToken +resetPasswordExpires +password')

    if (!user) throw new AppError('Invalid or expired reset token', 400)
    user.password = password
    user.mustChangePassword = false
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    res.json({ success: true, message: 'Password updated' })
  }),
)

router.post(
  '/invite',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (
      !['admin', 'owner', 'hr'].includes(req.user.role) &&
      !req.user.isPlatformAdmin
    ) {
      throw new AppError('Only company management can invite users', 403)
    }

    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      role: z.string().min(2).max(48),
    })
    const data = schema.parse(req.body)
    // Always attach invites to the workspace currently selected (slug header),
    // not the inviter's home tenant — otherwise people can land in the wrong
    // company and disappear from People.
    const tenantId = req.tenantId || req.user.tenantId
    if (!tenantId) {
      throw new AppError('No workspace selected for this invite', 400)
    }
    const tenant =
      req.tenant ||
      (tenantId ? await Tenant.findById(tenantId) : null)

    const customKeys = (tenant?.customRoles || []).map((r) => r.key)
    const allowedRoles = [...BUILTIN_INVITE_ROLES, ...customKeys]
    if (!allowedRoles.includes(data.role)) {
      throw new AppError('Invalid role for this workspace', 400)
    }

    if (
      req.user.role === 'hr' &&
      ['admin', 'owner', 'hr'].includes(data.role) &&
      !req.user.isPlatformAdmin
    ) {
      throw new AppError('Only an Admin or Owner can invite management users', 403)
    }
    const email = data.email.toLowerCase()

    await assertSeatAvailable(tenantId)
    if (isCompanyAdminRole(data.role)) {
      await assertAdminSlotAvailable(tenantId)
    }

    const exists = await User.findOne({ tenantId, email })
    if (exists) throw new AppError('User already exists in this workspace', 409)

    const inviteToken = crypto.randomBytes(24).toString('hex')
    const tempPassword = crypto.randomBytes(8).toString('hex')
    const customRole = (tenant?.customRoles || []).find(
      (r) => r.key === data.role,
    )
    const seedPermissions = customRole
      ? defaultPermissionsForRole(data.role, tenant.customRoles)
      : {}

    const user = await User.create({
      name: data.name,
      email,
      role: data.role,
      tenantId,
      password: tempPassword,
      inviteToken,
      mustChangePassword: true,
      onboardingCompleted: false,
      ...(Object.keys(seedPermissions).length
        ? { permissions: seedPermissions }
        : {}),
    })

    res.status(201).json({
      success: true,
      user: user.toSafeJSON(),
      inviteToken,
      tempPassword,
    })
  }),
)

export default router
