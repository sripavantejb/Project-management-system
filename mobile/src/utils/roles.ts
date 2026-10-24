import type { CustomRole, Role, User } from '../types/models'
import type { MobileHomeTarget } from '../navigation/types'

/** Ported 1:1 from client/src/lib/roles.js so mobile nav/permissions gates
 * make the same decisions the web app does against the same API responses. */

export const ADMIN_PORTAL_ROLES: Role[] = ['admin', 'owner', 'hr']
export const COMPANY_ADMIN_ROLES: Role[] = ['admin', 'owner']
export const OPS_PORTAL_ROLES: Role[] = ['admin', 'owner', 'hr']

export const ACCESS_TOGGLES: { key: string; label: string; group: string }[] = [
  { key: 'projects.create', label: 'Create projects', group: 'Projects' },
  { key: 'projects.manage', label: 'Manage projects & team', group: 'Projects' },
  { key: 'tasks.create', label: 'Create tasks', group: 'Tasks' },
  { key: 'tasks.manage', label: 'Manage all task fields', group: 'Tasks' },
  { key: 'boq', label: 'BOQ / Quotes', group: 'Modules' },
  { key: 'procurement', label: 'Materials', group: 'Modules' },
  { key: 'site', label: 'Site updates', group: 'Modules' },
  { key: 'files.manage', label: 'Upload drawings & files', group: 'Modules' },
  { key: 'finance', label: 'Revenue / billing', group: 'Modules' },
  { key: 'leads', label: 'New enquiries', group: 'Modules' },
  { key: 'portfolio', label: 'Dashboard + Reports', group: 'Modules' },
  { key: 'impact', label: 'Impact Points', group: 'Modules' },
  { key: 'people', label: 'People directory', group: 'Company' },
]

const ACCESS_TOGGLE_KEYS = ACCESS_TOGGLES.map((item) => item.key)

export function defaultPermissionsForRole(role: Role): Record<string, boolean> {
  if (role === 'admin' || role === 'owner') {
    return Object.fromEntries(ACCESS_TOGGLE_KEYS.map((k) => [k, true]))
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
  return {}
}

export function permissionsForUser(user: User | null): Record<string, boolean> {
  if (!user) return {}
  if (user.isPlatformAdmin) {
    return Object.fromEntries(ACCESS_TOGGLE_KEYS.map((k) => [k, true]))
  }
  return { ...defaultPermissionsForRole(user.role), ...(user.permissions || {}) }
}

export function isAdminRole(user: User | null): boolean {
  return !!user && ADMIN_PORTAL_ROLES.includes(user.role)
}

export function isCompanyAdmin(user: User | null): boolean {
  return !!user && COMPANY_ADMIN_ROLES.includes(user.role)
}

export function canUseAttendance(user: User | null): boolean {
  return !!user && user.role !== 'client' && user.role !== 'vendor'
}

export function canReviewAttendance(user: User | null): boolean {
  if (!user) return false
  return !!user.isPlatformAdmin || ADMIN_PORTAL_ROLES.includes(user.role)
}

export interface Capabilities {
  companyAdmin: boolean
  people: boolean
  managePeople: boolean
  portfolio: boolean
  leads: boolean
  finance: boolean
  procurement: boolean
  siteFeed: boolean
  impact: boolean
  projects: boolean
  myWork: boolean
  inbox: boolean
  settings: boolean
  platform: boolean
  createProject: boolean
  manageProjects: boolean
  createTask: boolean
  manageTasks: boolean
  manageFiles: boolean
  boq: boolean
  reports: boolean
  inventory: boolean
}

export function capabilitiesForUser(user: User | null): Capabilities {
  if (!user) {
    return {
      companyAdmin: false,
      people: false,
      managePeople: false,
      portfolio: false,
      leads: false,
      finance: false,
      procurement: false,
      siteFeed: false,
      impact: false,
      projects: false,
      myWork: false,
      inbox: false,
      settings: false,
      platform: false,
      createProject: false,
      manageProjects: false,
      createTask: false,
      manageTasks: false,
      manageFiles: false,
      boq: false,
      reports: false,
      inventory: false,
    }
  }

  const role = user.role
  const companyAdmin = COMPANY_ADMIN_ROLES.includes(role)
  const permissions = permissionsForUser(user)
  const isClientOrVendor = role === 'client' || role === 'vendor'

  return {
    companyAdmin: companyAdmin || !!user.isPlatformAdmin,
    people: !!permissions.people,
    managePeople: !!user.isPlatformAdmin || ['admin', 'owner'].includes(role),
    portfolio: !!permissions.portfolio,
    leads: !!permissions.leads,
    finance: !!permissions.finance,
    procurement: !!permissions.procurement,
    siteFeed: !!permissions.site,
    impact: !!permissions.impact,
    projects: true,
    myWork: !isClientOrVendor,
    inbox: true,
    settings: true,
    platform: !!user.isPlatformAdmin,
    createProject: !!permissions['projects.create'],
    manageProjects: !!permissions['projects.manage'],
    createTask: !!permissions['tasks.create'],
    manageTasks: !!permissions['tasks.manage'],
    manageFiles: !!permissions['files.manage'],
    boq: !!permissions.boq,
    reports: !!permissions.portfolio,
    inventory: companyAdmin || !!user.isPlatformAdmin,
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  owner: 'Owner',
  hr: 'HR',
  project_manager: 'Project manager',
  designer: 'Designer',
  site_supervisor: 'Site supervisor',
  client: 'Client',
  vendor: 'Vendor',
}

/**
 * Custom roles live on the tenant, so a label lookup has to consider them —
 * otherwise a "Quantity surveyor" shows up as the raw `quantity_surveyor` key.
 * Ported from client/src/lib/roles.js roleLabelFor.
 */
export function roleLabelFor(role?: string | null, customRoles: CustomRole[] = []): string {
  if (!role) return '—'
  const builtIn = (ROLE_LABELS as Record<string, string>)[role]
  if (builtIn) return builtIn
  const custom = customRoles.find((r) => r.key === role)
  if (custom?.label) return custom.label
  return String(role)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function canInviteUsers(user: User | null): boolean {
  if (!user) return false
  if (user.isPlatformAdmin) return true
  return ['admin', 'owner', 'hr'].includes(user.role)
}

export const INVITE_ROLE_OPTIONS: { value: Role; label: string }[] = (
  Object.keys(ROLE_LABELS) as Role[]
).map((value) => ({ value, label: ROLE_LABELS[value] }))

/** Mirrors client/src/lib/roles.js homePathForUser for mobile navigation targets. */
export function homePathForUser(user: User | null, portal: 'staff' | 'admin' = 'staff'): MobileHomeTarget | null {
  if (!user) return null
  if (user.mustChangePassword) return { tab: 'More', screen: 'ProfileHub', params: { screen: 'ChangePassword' } }
  if (!user.onboardingCompleted) return null

  if (portal === 'admin') {
    if (user.isPlatformAdmin && !isAdminRole(user)) return { tab: 'More', screen: 'PlatformAdmin', params: { screen: 'PlatformOverview' } }
    if (user.role === 'hr' || isAdminRole(user)) return { tab: 'More', screen: 'ProfileHub', params: { screen: 'People' } }
    return { tab: 'Home', screen: 'HomeMain' }
  }

  if (user.role === 'site_supervisor') return { tab: 'Home', screen: 'SiteSupervisor' }
  if (user.isPlatformAdmin && !isAdminRole(user)) return { tab: 'More', screen: 'PlatformAdmin', params: { screen: 'PlatformOverview' } }
  if (user.role === 'hr') return { tab: 'More', screen: 'ProfileHub', params: { screen: 'People' } }
  return { tab: 'Home', screen: 'HomeMain', params: { view: 'assigned' } }
}
