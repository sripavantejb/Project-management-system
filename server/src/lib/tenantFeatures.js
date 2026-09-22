/** Tenant-level module gates (controlled by Editco platform admin). */
export const TENANT_FEATURE_KEYS = [
  { key: 'projects', label: 'Projects & tasks', group: 'Core' },
  { key: 'boq', label: 'BOQ / Quotes', group: 'Modules' },
  { key: 'procurement', label: 'Materials / procurement', group: 'Modules' },
  { key: 'site', label: 'Site updates', group: 'Modules' },
  { key: 'finance', label: 'Finance / revenue', group: 'Modules' },
  { key: 'leads', label: 'New enquiries / CRM', group: 'Modules' },
  { key: 'portfolio', label: 'Dashboard & reports', group: 'Modules' },
  { key: 'people', label: 'People & invites', group: 'Company' },
  { key: 'impact', label: 'Impact points', group: 'Modules' },
  { key: 'inventory', label: 'Inventory', group: 'Modules' },
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

export function normalizeTenantFeatures(raw) {
  const base = defaultTenantFeatures()
  if (!raw || typeof raw !== 'object') return base
  for (const key of TENANT_FEATURE_KEY_LIST) {
    if (typeof raw[key] === 'boolean') base[key] = raw[key]
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
  leads: ['leads'],
  portfolio: ['portfolio'],
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
