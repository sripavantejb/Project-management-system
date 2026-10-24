/** Client-side tenant page gates (mirrors server/src/lib/tenantFeatures.js). */

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

export const SUBSCRIPTION_PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

const LEGACY_FALLBACKS = {
  billing: 'finance',
  reports: 'portfolio',
}

export function defaultTenantFeatures() {
  return Object.fromEntries(TENANT_FEATURE_KEYS.map((f) => [f.key, true]))
}

export function normalizeTenantFeatures(raw) {
  const base = defaultTenantFeatures()
  if (!raw || typeof raw !== 'object') return base
  for (const { key } of TENANT_FEATURE_KEYS) {
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

export function tenantHasFeature(tenant, key) {
  if (!tenant?.features) return true
  return normalizeTenantFeatures(tenant.features)[key] !== false
}

export function featureKeysByGroup() {
  const groups = []
  const map = new Map()
  for (const item of TENANT_FEATURE_KEYS) {
    if (!map.has(item.group)) {
      map.set(item.group, [])
      groups.push(item.group)
    }
    map.get(item.group).push(item)
  }
  return groups.map((group) => ({ group, items: map.get(group) }))
}

export function applyTenantFeatureLimitsToCapabilities(caps, tenant) {
  if (!tenant) return caps
  const features = normalizeTenantFeatures(tenant.features)
  const next = { ...caps }

  if (features.companyAdmin === false) next.companyAdmin = false
  if (features.approvals === false) next.approvals = false
  if (features.portfolio === false) next.portfolio = false
  if (features.reports === false) next.reports = false
  if (features.liveBoard === false) next.liveBoard = false
  if (features.myWork === false) next.myWork = false
  if (features.attendance === false) next.attendance = false
  if (features.billing === false) next.billing = false

  if (features.projects === false) {
    next.projects = false
    next.createProject = false
    next.manageProjects = false
    next.createTask = false
    next.manageTasks = false
    next.manageFiles = false
    next.projectTabs = {
      overview: false,
      tasks: false,
      procurement: false,
      site: false,
      files: false,
      team: false,
    }
  }
  if (features.boq === false) next.boq = false
  if (features.procurement === false) {
    next.procurement = false
    next.projectTabs = { ...next.projectTabs, procurement: false }
  }
  if (features.site === false) {
    next.siteFeed = false
    next.mobile = false
    next.projectTabs = { ...next.projectTabs, site: false }
  }
  if (features.finance === false) next.finance = false
  if (features.leads === false) next.leads = false
  if (features.people === false) next.people = false
  if (features.impact === false) next.impact = false
  if (features.inventory === false) next.inventory = false

  return next
}
