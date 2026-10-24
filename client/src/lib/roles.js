import { applyTenantFeatureLimitsToCapabilities } from './tenantFeatures.js'

/** Roles that can open the People / Admin portal */
export const ADMIN_PORTAL_ROLES = ['admin', 'owner', 'hr']

/** Roles with the company-wide ops dashboard */
export const COMPANY_ADMIN_ROLES = ['admin', 'owner']

/** Roles that see company ops pages (leads, finance, materials, reports, portfolio) */
export const OPS_PORTAL_ROLES = ['admin', 'owner', 'hr']

const EMPLOYEE_ROLES = [
  'project_manager',
  'designer',
  'site_supervisor',
  'client',
  'vendor',
]

export const ACCESS_TOGGLES = [
  { key: 'projects.create', label: 'Create projects', group: 'Projects' },
  { key: 'projects.manage', label: 'Manage projects & team tab', group: 'Projects' },
  { key: 'tasks.create', label: 'Create tasks', group: 'Tasks' },
  { key: 'tasks.manage', label: 'Manage all task fields', group: 'Tasks' },
  { key: 'boq', label: 'BOQ / Quotes workspace', group: 'Modules' },
  { key: 'procurement', label: 'Materials page + project Materials tab', group: 'Modules' },
  { key: 'site', label: 'Site updates page + project Site tab', group: 'Modules' },
  { key: 'files.manage', label: 'Upload drawings & files', group: 'Modules' },
  { key: 'finance', label: 'Revenue / finance page', group: 'Modules' },
  { key: 'leads', label: 'New enquiries page', group: 'Modules' },
  { key: 'portfolio', label: 'Dashboard + Reports pages', group: 'Modules' },
  { key: 'impact', label: 'Impact Points leaderboard', group: 'Modules' },
  { key: 'people', label: 'People directory', group: 'Company' },
]

const ALL_PERMISSION_KEYS = ACCESS_TOGGLES.map((item) => item.key)

export function defaultPermissionsForRole(role, customRoles = [], _seen = null) {
  if (role === 'admin' || role === 'owner') {
    return Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, true]))
  }
  if (role === 'hr') {
    return {
      'projects.create': true,
      'projects.manage': true,
      'tasks.create': true,
      'tasks.manage': true,
      people: true,
      impact: true,
    }
  }
  if (['project_manager', 'designer', 'site_supervisor'].includes(role)) {
    return { impact: true }
  }
  if (role === 'client' || role === 'vendor') {
    return {}
  }
  // Department templates used as “Based on” for custom roles
  if (role === 'dept_design') {
    return { impact: true, boq: true, 'files.manage': true, 'tasks.create': true }
  }
  if (role === 'dept_site') {
    return { impact: true, site: true, 'tasks.create': true, 'tasks.manage': true }
  }
  if (role === 'dept_procurement') {
    return { impact: true, procurement: true, 'tasks.create': true }
  }
  if (role === 'dept_accounts') {
    return { impact: true, finance: true }
  }
  if (role === 'dept_sales') {
    return { impact: true, leads: true }
  }
  if (role === 'dept_admin') {
    return {
      impact: true,
      people: true,
      'projects.create': true,
      'tasks.create': true,
    }
  }
  const custom = (customRoles || []).find((r) => r.key === role)
  if (custom) {
    const seen = _seen || new Set()
    if (seen.has(role)) return { impact: true }
    seen.add(role)
    return {
      ...defaultPermissionsForRole(
        custom.basedOn || 'designer',
        customRoles,
        seen,
      ),
      ...(custom.permissions && typeof custom.permissions === 'object'
        ? custom.permissions
        : {}),
    }
  }
  return {}
}

/** Built-in roles + department templates + existing custom roles. */
export function customRoleBaseOptions(customRoles = []) {
  const custom = (customRoles || []).map((r) => ({
    value: r.key,
    label: `${r.label} (custom)`,
  }))
  return [
    ...CUSTOM_ROLE_BASE_OPTIONS,
    ...DEPARTMENT_BASE_OPTIONS,
    ...custom,
  ]
}

export function permissionsForUser(user, tenant = null) {
  if (!user) return {}
  if (user.isPlatformAdmin) {
    return Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, true]))
  }
  return {
    ...defaultPermissionsForRole(user.role, tenant?.customRoles),
    ...(user.permissions || {}),
  }
}

export function isAdminRole(user) {
  if (!user) return false
  return ADMIN_PORTAL_ROLES.includes(user.role)
}

export function isCompanyAdmin(user) {
  if (!user) return false
  return COMPANY_ADMIN_ROLES.includes(user.role)
}

export function isOpsRole(user) {
  if (!user) return false
  return OPS_PORTAL_ROLES.includes(user.role)
}

export function isEmployeeRole(user) {
  if (!user) return false
  return EMPLOYEE_ROLES.includes(user.role)
}

export function canInviteUsers(user) {
  if (!user) return false
  if (user.isPlatformAdmin) return true
  return ['admin', 'owner', 'hr'].includes(user.role)
}

export function canCreateProjects(user, tenant = null) {
  if (!user) return false
  return !!permissionsForUser(user, tenant)['projects.create']
}

/** Capability map used by nav, route gates, and project tabs. */
export function capabilitiesForUser(user, tenant = null) {
  if (!user) {
    return {
      companyAdmin: false,
      approvals: false,
      people: false,
      portfolio: false,
      leads: false,
      finance: false,
      billing: false,
      procurement: false,
      reports: false,
      siteFeed: false,
      impact: false,
      inventory: false,
      projects: false,
      myWork: false,
      liveBoard: false,
      attendance: false,
      inbox: false,
      settings: false,
      mobile: false,
      platform: false,
      createProject: false,
      projectTabs: {
        overview: false,
        tasks: false,
        procurement: false,
        site: false,
        files: false,
        team: false,
      },
    }
  }

  const role = user.role
  const companyAdmin = COMPANY_ADMIN_ROLES.includes(role)
  const permissions = permissionsForUser(user, tenant)
  const employee = EMPLOYEE_ROLES.includes(role)
  const isClientOrVendor = role === 'client' || role === 'vendor'
  const staffWork = !isClientOrVendor

  const base = {
    companyAdmin: companyAdmin || !!user.isPlatformAdmin,
    approvals: companyAdmin || !!user.isPlatformAdmin,
    people: !!permissions.people,
    managePeople:
      !!user.isPlatformAdmin || ['admin', 'owner'].includes(user.role),
    portfolio: !!permissions.portfolio,
    leads: !!permissions.leads,
    finance: !!permissions.finance,
    billing: !!permissions.finance,
    procurement: !!permissions.procurement,
    reports: !!permissions.portfolio,
    siteFeed: !!permissions.site,
    impact: !!permissions.impact,
    inventory: companyAdmin || !!user.isPlatformAdmin,
    projects: true,
    myWork: staffWork,
    liveBoard: staffWork,
    attendance: staffWork,
    inbox: true,
    settings: true,
    mobile: !!permissions.site,
    platform: !!user.isPlatformAdmin,
    createProject: !!permissions['projects.create'],
    manageProjects: !!permissions['projects.manage'],
    createTask: !!permissions['tasks.create'],
    manageTasks: !!permissions['tasks.manage'],
    manageFiles: !!permissions['files.manage'],
    boq: !!permissions.boq,
    projectTabs: {
      overview: true,
      tasks: true,
      procurement: !!permissions.procurement,
      site: !!permissions.site,
      files: true,
      team: !!permissions['projects.manage'],
    },
    employee,
  }

  if (user.isPlatformAdmin) return base

  return applyTenantFeatureLimitsToCapabilities(base, tenant)
}

/**
 * Post-login / GuestOnly home path by role.
 * @param {object} user
 * @param {'staff'|'admin'} [portal] — login portal mode
 */
export function homePathForUser(user, portal = 'staff') {
  if (!user) return '/login'
  if (user.mustChangePassword) return '/settings'
  if (!user.onboardingCompleted) return '/onboarding'

  if (portal === 'admin') {
    if (user.isPlatformAdmin && !isAdminRole(user)) return '/platform'
    if (isCompanyAdmin(user)) return '/company-admin'
    if (user.role === 'hr' || isAdminRole(user)) return '/admin'
    return null
  }

  if (user.role === 'site_supervisor') return '/mobile'
  if (user.isPlatformAdmin && !isAdminRole(user)) return '/platform'
  if (isCompanyAdmin(user)) return '/company-admin'
  if (user.role === 'hr') return '/admin'
  return '/'
}

export const INVITE_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
  { value: 'hr', label: 'HR' },
  { value: 'project_manager', label: 'Project manager' },
  { value: 'designer', label: 'Designer' },
  { value: 'site_supervisor', label: 'Site supervisor' },
  { value: 'client', label: 'Client' },
  { value: 'vendor', label: 'Vendor' },
]

export const CUSTOM_ROLE_BASE_OPTIONS = [
  { value: 'project_manager', label: 'Project manager' },
  { value: 'designer', label: 'Designer' },
  { value: 'site_supervisor', label: 'Site supervisor' },
  { value: 'hr', label: 'HR' },
  { value: 'client', label: 'Client' },
  { value: 'vendor', label: 'Vendor' },
]

/** Department templates for “Based on” when creating a custom role */
export const DEPARTMENT_BASE_OPTIONS = [
  { value: 'dept_design', label: 'Design department' },
  { value: 'dept_site', label: 'Site / execution department' },
  { value: 'dept_procurement', label: 'Procurement department' },
  { value: 'dept_accounts', label: 'Accounts / finance department' },
  { value: 'dept_sales', label: 'Sales / enquiries department' },
  { value: 'dept_admin', label: 'Admin department' },
]

export const NEW_CUSTOM_ROLE_VALUE = '__new_custom_role__'

export const ROLE_LABELS = Object.fromEntries(
  INVITE_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

export function roleLabelFor(role, customRoles = []) {
  if (!role) return '—'
  if (ROLE_LABELS[role]) return ROLE_LABELS[role]
  const custom = (customRoles || []).find((r) => r.key === role)
  if (custom?.label) return custom.label
  return String(role)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function inviteRoleOptions(customRoles = [], { allowCreate = true } = {}) {
  const custom = (customRoles || []).map((r) => ({
    value: r.key,
    label: r.label,
  }))
  return [
    ...INVITE_ROLE_OPTIONS,
    ...custom,
    ...(allowCreate
      ? [{ value: NEW_CUSTOM_ROLE_VALUE, label: '+ New custom role' }]
      : []),
  ]
}
