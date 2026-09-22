import { Tenant } from '../models/Tenant.js'
import { User } from '../models/User.js'
import { Project } from '../models/Project.js'
import { Task } from '../models/Task.js'
import { Space } from '../models/Space.js'
import { Channel, ChannelMessage } from '../models/Channel.js'
import { Message } from '../models/Message.js'
import { Lead, Quotation, ProjectFile } from '../models/LeadQuotationFile.js'
import { ActivityLog, Notification, Comment } from '../models/Activity.js'
import {
  Vendor,
  PurchaseOrder,
  Rfq,
  Expense,
  Payment,
  SiteUpdate,
  Snag,
} from '../models/ProcurementFinance.js'
import { WorkspaceSettings } from '../models/WorkspaceSettings.js'
import { AppError } from './errorHandler.js'
import {
  tenantBlockMessage,
  tenantIsAccessible,
} from '../lib/tenantFeatures.js'

const RESERVED = new Set([
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'static',
  'assets',
])

export function slugFromHost(host = '') {
  const hostname = String(host).split(':')[0].toLowerCase()
  if (
    !hostname ||
    hostname === 'localhost' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return null
  }
  const parts = hostname.split('.')
  // acme.editcomedia.com → acme
  if (parts.length >= 3) {
    const sub = parts[0]
    if (RESERVED.has(sub)) return null
    return sub
  }
  return null
}

/**
 * Resolve tenant from:
 * 1) X-Tenant-Slug header (local / Vercel)
 * 2) Subdomain of Host
 * 3) DEFAULT_TENANT_SLUG / "cubic"
 */
export async function resolveTenant(req, _res, next) {
  try {
    const headerSlug = String(req.headers['x-tenant-slug'] || '')
      .trim()
      .toLowerCase()
    const hostSlug = slugFromHost(req.headers.host || '')
    const slug =
      headerSlug ||
      hostSlug ||
      process.env.DEFAULT_TENANT_SLUG ||
      'cubic'

    let tenant = await Tenant.findOne({ slug })
    if (!tenant && slug === (process.env.DEFAULT_TENANT_SLUG || 'cubic')) {
      tenant = await ensureDefaultTenant()
    }

    if (!tenant) {
      return next(new AppError(`Workspace "${slug}" not found`, 404))
    }
    if (!tenantIsAccessible(tenant)) {
      return next(new AppError(tenantBlockMessage(tenant), 403, 'TENANT_BLOCKED'))
    }

    req.tenant = tenant
    req.tenantId = tenant._id
    next()
  } catch (err) {
    next(err)
  }
}

async function backfillTenantId(Model, tenantId) {
  await Model.updateMany(
    { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
    { $set: { tenantId } },
  )
}

export async function ensureDefaultTenant({ skipBackfill = false } = {}) {
  const slug = process.env.DEFAULT_TENANT_SLUG || 'cubic'
  let tenant = await Tenant.findOne({ slug })
  if (!tenant) {
    tenant = await Tenant.create({
      name: process.env.DEFAULT_TENANT_NAME || 'Cubic Studio',
      slug,
      status: 'active',
      seatLimit: Number(process.env.DEFAULT_TENANT_SEATS) || 100,
      adminLimit: Number(process.env.DEFAULT_ADMIN_LIMIT) || 3,
    })
  } else if (tenant.adminLimit == null) {
    tenant.adminLimit = Number(process.env.DEFAULT_ADMIN_LIMIT) || 3
    await tenant.save()
  }

  if (skipBackfill) return tenant

  const id = tenant._id
  await Promise.all([
    backfillTenantId(User, id),
    backfillTenantId(Project, id),
    backfillTenantId(Task, id),
    backfillTenantId(Space, id),
    backfillTenantId(Channel, id),
    backfillTenantId(ChannelMessage, id),
    backfillTenantId(Message, id),
    backfillTenantId(Lead, id),
    backfillTenantId(Quotation, id),
    backfillTenantId(ProjectFile, id),
    backfillTenantId(ActivityLog, id),
    backfillTenantId(Notification, id),
    backfillTenantId(Comment, id),
    backfillTenantId(Vendor, id),
    backfillTenantId(PurchaseOrder, id),
    backfillTenantId(Rfq, id),
    backfillTenantId(Expense, id),
    backfillTenantId(Payment, id),
    backfillTenantId(SiteUpdate, id),
    backfillTenantId(Snag, id),
    backfillTenantId(WorkspaceSettings, id),
  ])

  // Promote first admin if none marked
  const hasPlatformAdmin = await User.exists({ isPlatformAdmin: true })
  if (!hasPlatformAdmin) {
    const platformEmail = (
      process.env.PLATFORM_ADMIN_EMAIL || ''
    ).toLowerCase()
    let admin = platformEmail
      ? await User.findOne({ email: platformEmail })
      : await User.findOne({ role: 'admin' }).sort({ createdAt: 1 })
    if (admin) {
      admin.isPlatformAdmin = true
      await admin.save()
      console.log(`Promoted platform admin: ${admin.email}`)
    }
  }

  // Drop legacy unique-on-name for channels so tenants can share names
  try {
    await Channel.collection.dropIndex('name_1')
  } catch {
    /* index may not exist */
  }
  try {
    await User.collection.dropIndex('email_1')
  } catch {
    /* keep non-unique email index from schema if present */
  }
  try {
    await Channel.syncIndexes()
    await User.syncIndexes()
    await WorkspaceSettings.syncIndexes()
  } catch (err) {
    console.warn('Index sync warning:', err.message)
  }

  return tenant
}

export function tenantFilter(req, extra = {}) {
  if (!req.tenantId) return { ...extra }
  return { ...extra, tenantId: req.tenantId }
}

/** Merge tenantId into create payloads */
export function withTenant(req, data = {}) {
  return { ...data, tenantId: req.tenantId }
}

export function assertTenantDoc(doc, req, label = 'Resource') {
  if (!doc) throw new AppError(`${label} not found`, 404)
  if (
    doc.tenantId &&
    req.tenantId &&
    String(doc.tenantId) !== String(req.tenantId) &&
    !req.user?.isPlatformAdmin
  ) {
    throw new AppError(`${label} not found`, 404)
  }
  return doc
}

export async function assertSeatAvailable(tenantId) {
  const tenant = await Tenant.findById(tenantId)
  if (!tenant) throw new AppError('Workspace not found', 404)
  const count = await User.countDocuments({
    tenantId,
    isActive: true,
    isPlatformAdmin: { $ne: true },
  })
  if (count >= (tenant.seatLimit || 30)) {
    throw new AppError(
      `Seat limit reached (${tenant.seatLimit}). Upgrade or remove a user.`,
      403,
    )
  }
  return { tenant, count }
}

/** Company management seats: admin + owner roles (not HR / staff). */
export const COMPANY_ADMIN_ROLES = ['admin', 'owner']

export function isCompanyAdminRole(role) {
  return COMPANY_ADMIN_ROLES.includes(String(role || ''))
}

export async function countCompanyAdmins(tenantId) {
  return User.countDocuments({
    tenantId,
    isActive: true,
    isPlatformAdmin: { $ne: true },
    role: { $in: COMPANY_ADMIN_ROLES },
  })
}

/**
 * Enforce platform-set max admins when inviting / promoting to admin|owner.
 * Pass `{ excludeUserId }` when changing an existing user's role so they
 * are not double-counted.
 */
export async function assertAdminSlotAvailable(
  tenantId,
  { excludeUserId = null } = {},
) {
  const tenant = await Tenant.findById(tenantId)
  if (!tenant) throw new AppError('Workspace not found', 404)
  const limit = Math.max(1, Number(tenant.adminLimit) || 3)
  const filter = {
    tenantId,
    isActive: true,
    isPlatformAdmin: { $ne: true },
    role: { $in: COMPANY_ADMIN_ROLES },
  }
  if (excludeUserId) filter._id = { $ne: excludeUserId }
  const count = await User.countDocuments(filter)
  if (count >= limit) {
    throw new AppError(
      `Admin limit reached (${count}/${limit}). Ask Editco platform to raise the company admin cap.`,
      403,
    )
  }
  return { tenant, count, limit }
}

export function requirePlatformAdmin(req, _res, next) {
  if (!req.user?.isPlatformAdmin) {
    return next(new AppError('Platform admin only', 403))
  }
  next()
}
