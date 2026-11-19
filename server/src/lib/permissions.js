import { AppError } from '../middleware/errorHandler.js'
import {
  applyTenantFeatureLimits,
} from './tenantFeatures.js'

export const PERMISSION_KEYS = [
  'projects.create',
  'projects.manage',
  'tasks.create',
  'tasks.manage',
  'boq',
  'procurement',
  'site',
  'files.manage',
  'finance',
  'leads',
  'portfolio',
  'people',
  'impact',
]

const ALL_ENABLED = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true]))

const ROLE_DEFAULTS = {
  admin: ALL_ENABLED,
  owner: ALL_ENABLED,
  hr: {
    'projects.create': true,
    'projects.manage': true,
    'tasks.create': true,
    'tasks.manage': true,
    people: true,
    impact: true,
  },
  project_manager: { impact: true },
  designer: { impact: true },
  site_supervisor: { impact: true },
  dept_design: {
    impact: true,
    boq: true,
    'files.manage': true,
    'tasks.create': true,
  },
  dept_site: {
    impact: true,
    site: true,
    'tasks.create': true,
    'tasks.manage': true,
  },
  dept_procurement: {
    impact: true,
    procurement: true,
    'tasks.create': true,
  },
  dept_accounts: {
    impact: true,
    finance: true,
  },
  dept_sales: {
    impact: true,
    leads: true,
  },
  dept_admin: {
    impact: true,
    people: true,
    'projects.create': true,
    'tasks.create': true,
  },
}

function overridesFor(user) {
  if (!user?.permissions) return {}
  if (user.permissions instanceof Map) return Object.fromEntries(user.permissions)
  if (typeof user.permissions.toObject === 'function') {
    return user.permissions.toObject()
  }
  return user.permissions
}

export function defaultPermissionsForRole(role, customRoles = [], _seen = null) {
  if (ROLE_DEFAULTS[role]) return { ...ROLE_DEFAULTS[role] }
  const custom = (customRoles || []).find((r) => r.key === role)
  if (!custom) return {}
  const seen = _seen || new Set()
  if (seen.has(role)) return {}
  seen.add(role)
  const base = defaultPermissionsForRole(
    custom.basedOn || 'designer',
    customRoles,
    seen,
  )
  const extras =
    custom.permissions && typeof custom.permissions === 'object'
      ? custom.permissions
      : {}
  return { ...base, ...extras }
}

/** Full true/false map for every permission key (People page saves this). */
export function normalizePermissionMap(value = {}) {
  const input = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, !!input[key]]),
  )
}

export function resolvePermissions(user, tenant = null) {
  if (!user) return {}
  // Platform admins mirror the client: full access while supporting a company,
  // without being blocked by that company's feature toggles.
  if (user.isPlatformAdmin) {
    return { ...ALL_ENABLED }
  }
  // Built-in company admins keep the full role map. Stale per-user overrides
  // (e.g. portfolio:false) and tenant feature toggles must not lock them out
  // of core ops pages like Dashboard.
  if (user.role === 'admin' || user.role === 'owner') {
    return { ...ALL_ENABLED }
  }
  const perms = {
    ...defaultPermissionsForRole(user.role, tenant?.customRoles),
    ...overridesFor(user),
  }
  return applyTenantFeatureLimits(perms, tenant)
}

export function hasPermission(user, key, tenant = null) {
  return !!resolvePermissions(user, tenant)[key]
}

export function canManageEmployeeAccess(user) {
  return !!(
    user?.isPlatformAdmin || ['admin', 'owner'].includes(user?.role)
  )
}

export function requirePermission(key) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401))
    if (!hasPermission(req.user, key, req.tenant)) {
      return next(new AppError('Insufficient permissions', 403))
    }
    next()
  }
}

/** Keep only explicit boolean overrides (partial maps OK). */
export function sanitizePermissionOverrides(value) {
  const input = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    PERMISSION_KEYS.filter((key) => typeof input[key] === 'boolean').map(
      (key) => [key, !!input[key]],
    ),
  )
}
