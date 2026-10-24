/** Tenant-level page / module gates (controlled by platform admin per company). */

export const TENANT_FEATURE_KEYS = [
  { key: 'companyAdmin', label: 'Company', page: '/company-admin', group: 'Ops' },
  { key: 'approvals', label: 'Approvals', page: '/approvals', group: 'Ops' },
  { key: 'portfolio', label: 'Dashboard', page: '/portfolio', group: 'Ops' },
  { key: 'reports', label: 'Reports', page: '/reports', group: 'Ops' },
  { key: 'liveBoard', label: 'Live board', page: '/live-board', group: 'Work' },
  { key: 'projects', label: 'Projects', page: '/projects', group: 'Work' },
  { key: 'myWork', label: 'My work', page: '/?view=assigned', group: 'Work' },
  { key: 'attendance', label: 'Attendance', page: '/attendance', group: 'Work' },
  { key: 'leads', label: 'New enquiries', page: '/leads', group: 'Modules' },
  { key: 'boq', label: 'BOQ / Quotes', page: '/boq', group: 'Modules' },
  { key: 'procurement', label: 'Materials', page: '/procurement', group: 'Modules' },
  { key: 'finance', label: 'Revenue', page: '/finance', group: 'Modules' },
  { key: 'billing', label: 'Billing', page: '/billing', group: 'Modules' },
  { key: 'inventory', label: 'Inventory', page: '/inventory', group: 'Modules' },
  { key: 'site', label: 'Site updates', page: '/site-feed', group: 'Modules' },
  { key: 'impact', label: 'Impact Points', page: '/impact', group: 'Modules' },
  { key: 'people', label: 'People & invites', page: '/people', group: 'Company' },
]

export const TENANT_FEATURE_KEY_LIST = TENANT_FEATURE_KEYS.map((f) => f.key)

export const SUBSCRIPTION_PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

export function defaultTenantFeatures() {
  return Object.fromEntries(TENANT_FEATURE_KEY_LIST.map((key) => [key, true]))
}

/** Legacy keys → new page keys when upgrading older tenant.features docs. */
const LEGACY_FALLBACKS = {
  billing: 'finance',
  reports: 'portfolio',
  liveBoard: null,
  myWork: null,
  attendance: null,
  approvals: null,
  companyAdmin: null,
}

export function normalizeTenantFeatures(raw) {
  const base = defaultTenantFeatures()
  if (!raw || typeof raw !== 'object') return base
  for (const key of TENANT_FEATURE_KEY_LIST) {
    if (typeof raw[key] === 'boolean') {
      base[key] = raw[key]
      continue
    }
    const legacy = LEGACY_FALLBACKS[key]
    if (legacy && typeof raw[legacy] === 'boolean') {
      base[key] = raw[legacy]
    }
  }
  return base
}

export function sanitizeTenantFeatures(value) {
  const input = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    TENANT_FEATURE_KEY_LIST.filter((key) => typeof input[key] === 'boolean').map(
      (key) => [key, input[key]],
    ),
  )
}

export function resolveTenantFeatures(tenant) {
  return normalizeTenantFeatures(tenant?.features)
}

export function tenantHasFeature(tenant, key) {
  if (!tenant) return true
  const features = resolveTenantFeatures(tenant)
  return features[key] !== false
}

/** Map tenant feature keys → permission keys used in the app. */
const FEATURE_TO_PERMISSIONS = {
  projects: ['projects.create', 'projects.manage', 'tasks.create', 'tasks.manage', 'files.manage'],
  boq: ['boq'],
  procurement: ['procurement'],
  site: ['site'],
  finance: ['finance'],
  billing: ['finance'],
  leads: ['leads'],
  portfolio: ['portfolio'],
  reports: ['portfolio'],
  people: ['people'],
  impact: ['impact'],
  inventory: ['inventory'],
}

export function applyTenantFeatureLimits(userPermissions, tenant) {
  if (!tenant) return userPermissions
  const features = resolveTenantFeatures(tenant)
  const out = { ...userPermissions }
  for (const [featureKey, permKeys] of Object.entries(FEATURE_TO_PERMISSIONS)) {
    if (features[featureKey] === false) {
      for (const perm of permKeys) out[perm] = false
    }
  }
  return out
}

export function tenantIsAccessible(tenant) {
  if (!tenant) return true
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') return false
  if (tenant.cancelledAt) return false
  return true
}

export function tenantBlockMessage(tenant) {
  if (tenant?.status === 'cancelled' || tenant?.cancelledAt) {
    return 'Your trial version has been completed, so workspace access has been stopped. Contact Editco to reactivate.'
  }
  if (tenant?.status === 'suspended') {
    return 'This workspace is suspended. Contact Editco support.'
  }
  return 'This workspace is not available.'
}
