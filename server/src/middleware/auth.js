import jwt from 'jsonwebtoken'
import { AppError } from './errorHandler.js'
import { User } from '../models/User.js'
import { Tenant } from '../models/Tenant.js'

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
      isPlatformAdmin: !!user.isPlatformAdmin,
    },
    process.env.JWT_ACCESS_SECRET,
    // Long-lived access token so normal use does not force a refresh every
    // few minutes. Session end is driven by refresh expiry / explicit logout.
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '7d' },
  )
}

export function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tenantId: user.tenantId ? String(user.tenantId) : null,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d' },
  )
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new AppError('Authentication required', 401)

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    const user = await User.findById(payload.sub).select('-password')
    if (!user || !user.isActive) throw new AppError('User not found', 401)

    // Platform admins can operate across tenants. Everyone else must stay in
    // their home workspace — if the client still has a stale X-Tenant-Slug
    // (e.g. default "cubic"), snap back to the account's real company.
    if (
      !user.isPlatformAdmin &&
      req.tenantId &&
      user.tenantId &&
      String(user.tenantId) !== String(req.tenantId)
    ) {
      const home = await Tenant.findById(user.tenantId)
      if (!home) {
        throw new AppError('Wrong workspace for this account', 403)
      }
      req.tenant = home
      req.tenantId = home._id
    }

    req.user = user
    next()
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401))
    }
    next(err)
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401))
    if (req.user.isPlatformAdmin) return next()
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403))
    }
    next()
  }
}
