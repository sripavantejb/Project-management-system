import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import {
  tenantFilter,
  withTenant,
  assertTenantDoc,
  isCompanyAdminRole,
} from '../middleware/tenant.js'
import {
  ApprovalRule,
  ApprovalType,
  BUILTIN_APPROVAL_TYPE_KEYS,
} from '../models/Approval.js'
import { User, ROLES } from '../models/User.js'
import { ProjectFile } from '../models/LeadQuotationFile.js'
import { Expense } from '../models/ProcurementFinance.js'
import { Task } from '../models/Task.js'
import {
  computeBands,
  listApprovalTypes,
  pickRule,
  resolveApproverUser,
} from '../lib/approvals.js'

const router = express.Router()

/** Approval routing + inbox for pending sign-offs. */
function requireApprovalAdmin(req, _res, next) {
  if (req.user?.isPlatformAdmin || isCompanyAdminRole(req.user?.role)) return next()
  next(new AppError('Only owners and admins can change approval routing', 403))
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
}

/** Null out a blank/absent bound rather than coercing it to 0. */
function parseBound(raw) {
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new AppError('Amounts must be positive numbers', 400)
  return n
}

/* ─── Types ─── */

router.get(
  '/types',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, types: await listApprovalTypes(req.tenantId) })
  }),
)

router.post(
  '/types',
  requireAuth,
  requireApprovalAdmin,
  asyncHandler(async (req, res) => {
    const label = String(req.body.label || '').trim()
    if (!label) throw new AppError('label is required', 400)

    const key = slugify(req.body.key || label)
    if (!key) throw new AppError('Invalid type name', 400)
    if (BUILTIN_APPROVAL_TYPE_KEYS.includes(key)) {
      throw new AppError(`"${label}" is already a built-in approval type`, 409)
    }

    const clash = await ApprovalType.findOne(tenantFilter(req, { key }))
    if (clash) throw new AppError(`An approval type named "${label}" already exists`, 409)

    const type = await ApprovalType.create(
      withTenant(req, {
        key,
        label,
        description: String(req.body.description || '').trim(),
        createdBy: req.user._id,
      }),
    )

    res.status(201).json({ success: true, type: { ...type.toObject(), isBuiltin: false } })
  }),
)

router.delete(
  '/types/:id',
  requireAuth,
  requireApprovalAdmin,
  asyncHandler(async (req, res) => {
    const type = await ApprovalType.findById(req.params.id)
    assertTenantDoc(type, req, 'Approval type')

    // Deleting a type would orphan its rules into something unroutable, so
    // clear them in the same breath and say how many went.
    const { deletedCount } = await ApprovalRule.deleteMany(
      tenantFilter(req, { entityType: type.key }),
    )
    await type.deleteOne()

    res.json({ success: true, removedRules: deletedCount || 0 })
  }),
)

/* ─── Rules ─── */

router.get(
  '/rules',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = req.query.entityType
      ? tenantFilter(req, { entityType: String(req.query.entityType) })
      : tenantFilter(req, {})

    const rules = await ApprovalRule.find(filter)
      .populate('approverUser', 'name email avatar role')
      .sort({ entityType: 1, minAmount: 1 })
      .lean()

    res.json({ success: true, rules })
  }),
)

router.post(
  '/rules',
  requireAuth,
  requireApprovalAdmin,
  asyncHandler(async (req, res) => {
    const entityType = String(req.body.entityType || '').trim()
    if (!entityType) throw new AppError('entityType is required', 400)

    const types = await listApprovalTypes(req.tenantId)
    if (!types.some((t) => t.key === entityType)) {
      throw new AppError('Unknown approval type', 400)
    }

    const approverRole = String(req.body.approverRole || '').trim()
    if (!approverRole) throw new AppError('An approver role is required', 400)

    const minAmount = parseBound(req.body.minAmount) ?? 0
    const maxAmount = parseBound(req.body.maxAmount)
    if (maxAmount != null && maxAmount <= minAmount) {
      throw new AppError('The upper limit must be greater than the lower limit', 400)
    }

    let approverUser = null
    if (req.body.approverUser) {
      const user = await User.findOne(
        tenantFilter(req, { _id: req.body.approverUser }),
      ).select('_id')
      if (!user) throw new AppError('That approver is not in this workspace', 400)
      approverUser = user._id
    }

    const rule = await ApprovalRule.create(
      withTenant(req, {
        entityType,
        minAmount,
        maxAmount,
        approverRole,
        approverUser,
        createdBy: req.user._id,
      }),
    )

    await rule.populate('approverUser', 'name email avatar role')
    res.status(201).json({ success: true, rule })
  }),
)

router.patch(
  '/rules/:id',
  requireAuth,
  requireApprovalAdmin,
  asyncHandler(async (req, res) => {
    const rule = await ApprovalRule.findById(req.params.id)
    assertTenantDoc(rule, req, 'Approval rule')

    if (req.body.minAmount !== undefined) rule.minAmount = parseBound(req.body.minAmount) ?? 0
    if (req.body.maxAmount !== undefined) rule.maxAmount = parseBound(req.body.maxAmount)
    if (rule.maxAmount != null && rule.maxAmount <= rule.minAmount) {
      throw new AppError('The upper limit must be greater than the lower limit', 400)
    }

    if (req.body.approverRole !== undefined) {
      const role = String(req.body.approverRole).trim()
      if (!role) throw new AppError('An approver role is required', 400)
      rule.approverRole = role
    }

    if (req.body.approverUser !== undefined) {
      if (!req.body.approverUser) {
        rule.approverUser = null
      } else {
        const user = await User.findOne(
          tenantFilter(req, { _id: req.body.approverUser }),
        ).select('_id')
        if (!user) throw new AppError('That approver is not in this workspace', 400)
        rule.approverUser = user._id
      }
    }

    if (req.body.isActive !== undefined) rule.isActive = !!req.body.isActive

    await rule.save()
    await rule.populate('approverUser', 'name email avatar role')
    res.json({ success: true, rule })
  }),
)

router.delete(
  '/rules/:id',
  requireAuth,
  requireApprovalAdmin,
  asyncHandler(async (req, res) => {
    const rule = await ApprovalRule.findById(req.params.id)
    assertTenantDoc(rule, req, 'Approval rule')
    await rule.deleteOne()
    res.json({ success: true })
  }),
)

/* ─── Flow overview ─── */

/**
 * Everything the admin panel needs to draw the routing map in one call: each
 * type, its bands in order, and the person each band currently lands on —
 * resolved the same way a real record would resolve it, so what the panel
 * shows is what will actually happen.
 */
router.get(
  '/flow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [types, rules, members] = await Promise.all([
      listApprovalTypes(req.tenantId),
      ApprovalRule.find(tenantFilter(req, {}))
        .populate('approverUser', 'name email avatar role')
        .sort({ minAmount: 1 })
        .lean(),
      User.find(tenantFilter(req, { isActive: { $ne: false } }))
        .select('_id name email avatar role')
        .sort({ createdAt: 1 })
        .lean(),
    ])

    // Resolve role → person here rather than per-rule, so the panel can show
    // "falls to nobody" for a role the workspace has no one in.
    const firstByRole = new Map()
    for (const m of members) {
      if (!firstByRole.has(m.role)) firstByRole.set(m.role, m)
    }

    const flow = types.map((type) => {
      const forType = rules.filter((r) => r.entityType === type.key)
      const withApprover = forType.map((r) => ({
        ...r,
        resolvedApprover: r.approverUser || firstByRole.get(r.approverRole) || null,
      }))
      const byId = new Map(withApprover.map((r) => [String(r._id), r]))

      // Hand clients the effective bands, not the raw overlapping rules, so
      // every surface shows the same thing the engine will actually do.
      const bands = computeBands(forType, !!type.amountPath).map((b) => ({
        ...b,
        rule: byId.get(b.ruleId) || null,
      }))

      return { ...type, rules: withApprover, bands }
    })

    res.json({ success: true, flow, members, roles: ROLES })
  }),
)

/**
 * "If I raised one of these for ₹X today, who'd get it?" — the panel's
 * what-if box, and a cheap way to sanity-check a policy before saving it.
 */
router.get(
  '/preview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const entityType = String(req.query.entityType || '').trim()
    if (!entityType) throw new AppError('entityType is required', 400)

    const rules = await ApprovalRule.find(
      tenantFilter(req, { entityType, isActive: { $ne: false } }),
    )
      .populate('approverUser', 'name email avatar role')
      .lean()

    const rule = pickRule(rules, req.query.amount)
    if (!rule) return res.json({ success: true, rule: null, approver: null })

    const approverId = await resolveApproverUser(req.tenantId, rule)
    const approver = approverId
      ? await User.findById(approverId).select('name email avatar role').lean()
      : null

    res.json({ success: true, rule, approver })
  }),
)

/**
 * Pending sign-offs for the current user (and optionally all pending for admins).
 * Drawing/file approvals are first-class; expenses and tasks pending sign-off are included.
 */
router.get(
  '/inbox',
  requireAuth,
  asyncHandler(async (req, res) => {
    const mineOnly = req.query.scope !== 'all'
    const isAdmin =
      req.user?.isPlatformAdmin || isCompanyAdminRole(req.user?.role)
    const userId = req.user._id

    const fileFilter = tenantFilter(req, { approvalStatus: 'pending' })
    if (mineOnly || !isAdmin) {
      fileFilter.approver = userId
    }

    const files = await ProjectFile.find(fileFilter)
      .populate('approver', 'name avatar role')
      .populate('requestedBy', 'name avatar role')
      .populate('projectId', 'name code clientName')
      .sort({ requestedAt: -1 })
      .lean()

    const expenseFilter = tenantFilter(req, { status: 'pending' })
    if (mineOnly || !isAdmin) {
      expenseFilter.$or = [{ approver: userId }, { approver: null }]
    }
    const expenses = await Expense.find(expenseFilter)
      .populate('approver', 'name avatar role')
      .populate('projectId', 'name code')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()

    const taskFilter = tenantFilter(req, {
      requiresApproval: true,
      approvalStatus: 'pending',
    })
    if (mineOnly || !isAdmin) {
      // A task can end up pending with no approver (its rule's role has
      // nobody active in it) — surface those too rather than letting them
      // sit invisible to everyone but an admin's "All pending" view.
      taskFilter.$or = [{ approver: userId }, { approver: null }]
    }
    const tasks = await Task.find(taskFilter)
      .populate('approver', 'name avatar role')
      .populate('projectId', 'name code')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()

    const items = [
      ...files.map((f) => ({
        kind: 'file',
        id: String(f._id),
        title: f.name,
        subtitle: f.projectId?.name || 'Project file',
        status: f.approvalStatus,
        requestedAt: f.requestedAt || f.updatedAt,
        requestedBy: f.requestedBy,
        approver: f.approver,
        projectId: f.projectId?._id || f.projectId,
        projectName: f.projectId?.name || '',
        folder: f.folder,
        previewUrl: f.versions?.[f.versions.length - 1]?.url || '',
        note: f.approvalNote || '',
        link: `/projects/${f.projectId?._id || f.projectId}/files`,
      })),
      ...expenses.map((e) => ({
        kind: 'expense',
        id: String(e._id),
        title: e.description || e.category || 'Expense',
        subtitle: e.projectId?.name || 'Expense',
        status: e.status,
        amount: e.amount,
        requestedAt: e.createdAt,
        approver: e.approver,
        projectId: e.projectId?._id || e.projectId,
        projectName: e.projectId?.name || '',
        link: '/money?tab=approvals',
      })),
      ...tasks.map((t) => ({
        kind: 'task',
        id: String(t._id),
        title: t.title,
        subtitle: t.projectId?.name || 'Task',
        status: t.approvalStatus,
        requestedAt: t.updatedAt,
        approver: t.approver,
        projectId: t.projectId?._id || t.projectId,
        projectName: t.projectId?.name || '',
        link: t.projectId
          ? `/projects/${t.projectId._id || t.projectId}/tasks`
          : '/my-work',
      })),
    ].sort(
      (a, b) =>
        new Date(b.requestedAt || 0).getTime() -
        new Date(a.requestedAt || 0).getTime(),
    )

    res.json({
      success: true,
      items,
      counts: {
        files: files.length,
        expenses: expenses.length,
        tasks: tasks.length,
        total: items.length,
      },
    })
  }),
)

export default router
