export type Role =
  | 'admin'
  | 'owner'
  | 'hr'
  | 'project_manager'
  | 'designer'
  | 'site_supervisor'
  | 'vendor'
  | 'client'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatar?: string
  phone?: string
  title?: string
  company?: string
  tenantId?: string
  isPlatformAdmin: boolean
  permissions: Record<string, boolean>
  mustChangePassword: boolean
  onboardingCompleted: boolean
  googleCalendarConnected?: boolean
  createdAt?: string
}

/** A message the platform owner is showing this whole workspace. */
export interface TenantNotice {
  title: string
  message: string
  variant: 'info' | 'warning' | 'urgent'
  dismissible: boolean
  /** Freezes the app behind the message until the platform owner lifts it. */
  blocking: boolean
  /** Identity of this wording — a re-edit re-shows it to people who dismissed. */
  updatedAt: string | null
}

export interface Tenant {
  id: string
  name: string
  slug: string
  status?: string
  seatLimit?: number
  /** How many admin/owner seats the platform allows this workspace. */
  adminLimit?: number
  /** Company logo, printed on quotations and tax invoices. */
  logoUrl?: string
  /** Sits behind the company logo; empty means use a neutral surface. */
  brandColor?: string
  notice?: TenantNotice | null
  /** Extra roles this workspace defined on top of the built-in set. */
  customRoles?: CustomRole[]
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface ChecklistItem {
  _id?: string
  text: string
  done: boolean
}

export interface Task {
  _id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  progress?: number
  isPersonal?: boolean
  isMilestone?: boolean
  requiresApproval?: boolean
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected'
  dueDate?: string | null
  startDate?: string | null
  stage?: string
  tags?: string[]
  attachments?: { url: string; name?: string; mime?: string }[]
  checklist?: ChecklistItem[]
  customFields?: Record<string, unknown>
  timeEstimate?: number | null
  timeSpent?: number
  timeTrackingStartedAt?: string | null
  projectId?: { _id: string; name: string; coverImage?: string } | string | null
  assignee?: { _id: string; name: string; avatar?: string } | string | null
  createdBy?: { _id: string; name: string; avatar?: string } | string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  _id: string
  body: string
  author: { _id: string; name: string; avatar?: string }
  assignedTo?: { _id: string; name: string; avatar?: string }
  resolved?: boolean
  createdAt: string
}

/**
 * A comment as returned by `/comments/assigned`, where the server populates
 * the parent task (and its project) so the list can show context without a
 * second round-trip. Plain `Comment` stays the shape used inside a task.
 */
export interface AssignedComment extends Comment {
  mentions?: { _id: string; name: string; avatar?: string }[]
  taskId?: {
    _id: string
    title: string
    status?: string
    projectId?: { _id: string; name: string } | string
  } | null
}

/** Shared shape for a populated user reference across approval payloads. */
export interface UserSummary {
  _id: string
  name: string
  email?: string
  avatar?: string
  role?: string
}

export interface ApprovalType {
  _id: string | null
  key: string
  label: string
  description?: string
  /** Field the thresholds compare against; null means the type has no amount. */
  amountPath: string | null
  isBuiltin: boolean
  isActive?: boolean
}

export interface ApprovalRule {
  _id: string
  entityType: string
  minAmount: number
  maxAmount: number | null
  approverRole: string
  approverUser?: UserSummary | null
  isActive?: boolean
  /** Role resolved to a real person, or null when nobody holds that role. */
  resolvedApprover?: UserSummary | null
}

/**
 * One stretch of amounts and who handles it. The server collapses overlapping
 * rules into these, so clients never re-implement the routing logic.
 * `max: null` means "and above"; `shadowed` marks a rule that never fires.
 */
export interface ApprovalBand {
  ruleId: string
  min: number
  max: number | null
  shadowed: boolean
  rule: ApprovalRule | null
}

export interface ApprovalFlowType extends ApprovalType {
  rules: ApprovalRule[]
  bands: ApprovalBand[]
}

export type CustomFieldType = 'text' | 'number' | 'select' | 'user'

export interface CustomFieldDefinition {
  _id: string
  name: string
  slug: string
  type: CustomFieldType
  options?: string[]
  order?: number
  isActive?: boolean
  createdAt?: string
}

export interface ActivityLogItem {
  _id: string
  type: string
  message: string
  actor?: { _id: string; name: string; avatar?: string }
  projectId?: { _id: string; name: string } | string
  createdAt: string
}

export interface ProjectStage {
  key: string
  label: string
  status: 'not_started' | 'in_progress' | 'completed'
  progress: number
}

export interface ProjectMember {
  user: { _id: string; name: string; avatar?: string; role?: string; email?: string; title?: string }
  role?: string
}

export interface Project {
  _id: string
  code?: string
  name: string
  clientName: string
  clientPhone?: string
  type: 'residential' | 'commercial' | 'renovation' | 'custom' | 'blank' | string
  location?: string
  startDate?: string
  endDate?: string
  budget?: number
  spent?: number
  progress?: number
  coverImage?: string
  description?: string
  status: 'in_progress' | 'completed' | 'on_hold' | 'delayed' | string
  currentStage?: string
  isDelayed?: boolean
  stages?: ProjectStage[]
  projectManager?: { _id: string; name: string; avatar?: string }
  members?: ProjectMember[]
  meetingNotes?: import('./ops').MeetingNote[]
  createdAt: string
  updatedAt: string
}

export interface ProjectStats {
  openTasks: number
  pendingApprovals: number
  budgetVsSpent: { budget: number; spent: number; pct: number }
  latestActivity: ActivityLogItem | null
}

export interface ProjectFile {
  _id: string
  projectId: string
  folder: string
  name: string
  mime?: string
  status: 'draft' | 'sent' | 'approved' | 'rejected' | string
  /** Sign-off lifecycle, separate from the folder status. */
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected'
  approvalType?: string
  approver?: { _id: string; name: string; avatar?: string } | string | null
  requestedBy?: { _id: string; name: string } | string | null
  requestedAt?: string
  decidedBy?: { _id: string; name: string } | string | null
  decidedAt?: string
  approvalNote?: string
  decisionNote?: string
  clientVisible?: boolean
  currentVersion: number
  versions: { version: number; url: string; note?: string; uploadedBy?: string; createdAt?: string }[]
  updatedAt: string
}

export interface Notification {
  _id: string
  type: string
  title: string
  body?: string
  link?: string
  read: boolean
  later?: boolean
  cleared?: boolean
  createdAt: string
}

export interface MailUser {
  _id: string
  id?: string
  name: string
  email: string
  avatar?: string
  role?: string
  title?: string
  company?: string
}

export interface Message {
  _id: string
  from: MailUser
  to: MailUser
  subject?: string
  body: string
  readAt?: string | null
  createdAt: string
}

export interface MailThread {
  user: MailUser
  lastMessage: Message
  unread: number
}

export interface HomeTasksBucket {
  today: Task[]
  upcoming: Task[]
  overdue: Task[]
  next: Task[]
  unscheduled: Task[]
  assigned: Task[]
  done: Task[]
  delegated: Task[]
  personal: Task[]
  priorities: Task[]
}

export interface HomeData {
  greeting: string
  tasks: HomeTasksBucket
  agenda: Task[]
  assignedComments: Comment[]
  recents: Task[]
  approvals: Task[]
  activity: ActivityLogItem[]
  mentions: ActivityLogItem[]
  notifications: Notification[]
}

export interface ImpactBadge {
  key: string
  label: string
  earned: boolean
  [k: string]: unknown
}

export interface ImpactScore {
  totalPoints: number
  level?: string
  badges?: string[]
  [k: string]: unknown
}

export interface ImpactData {
  score: ImpactScore
  badges: ImpactBadge[]
  breakdown: { category: string; points: number; count: number }[]
  trend: { date: string; points: number }[]
  timeline: {
    _id: string
    points: number
    reason: string
    category?: string
    createdAt: string
    projectId?: { _id: string; name: string }
  }[]
  canManage: boolean
}

export interface ImpactAchievement {
  key: string
  label: string
  minPoints: number
  description?: string
}

export interface ImpactRule {
  _id: string
  key: string
  label: string
  description?: string
  category: string
  points: number
  weight: number
  enabled: boolean
  auto: boolean
}

export interface ImpactLeaderboardRow {
  rank: number
  user: { _id: string; name: string; avatar?: string; role: string; title?: string }
  totalPoints: number
  weeklyPoints: number
  monthlyPoints: number
  badges: string[]
  /** Points for the requested period — what the board is ranked on. */
  points: number
}

export type ImpactPeriod = 'weekly' | 'monthly' | 'all'

export interface ImpactTimelineEntry {
  _id: string
  points: number
  reason: string
  category?: string
  createdAt: string
  userId?: { _id: string; name: string; avatar?: string; role?: string }
  awardedBy?: { _id: string; name: string; avatar?: string }
  projectId?: { _id: string; name: string }
}

export interface ImpactOverview {
  me: ImpactScore
  badges: ImpactBadge[]
  top: {
    rank: number
    user: { _id: string; name: string; avatar?: string; role: string; title?: string }
    totalPoints: number
    weeklyPoints: number
    monthlyPoints: number
    badges: string[]
  }[]
  company: {
    scope: 'company' | 'self'
    breakdown: { category: string; points: number; count: number }[]
    trend: { date: string; points: number }[]
    timeline: ImpactTimelineEntry[]
  }
  rules: ImpactRule[]
  people: { _id: string; name: string; avatar?: string; role: string; title?: string; isActive?: boolean }[]
  achievements: ImpactAchievement[]
  canManage: boolean
}

export interface ActivityEntry {
  _id: string
  action: string
  entityType?: string
  entityName?: string
  actor?: { _id: string; name: string; avatar?: string }
  projectId?: { _id: string; name: string }
  createdAt: string
}

export interface CustomRole {
  key: string
  label: string
  basedOn: string
  permissions?: Record<string, boolean>
  createdAt?: string
}

export interface ApiError {
  status?: number
  message: string
  data?: unknown
}

/** GET /tasks/live-board — the open workload across the whole company. */
export interface LiveBoardPerson {
  user: { _id: string; name: string; avatar?: string; role?: string; title?: string }
  open: number
  todo: number
  in_progress: number
  review: number
  urgent: number
  high: number
  overdue: number
  /** 0–100, relative to the busiest person — drives the load bar. */
  load: number
}

export interface LiveBoardTask {
  _id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  stage?: string
  dueDate: string | null
  updatedAt: string
  overdue: boolean
  project: { _id: string; name: string } | null
  assignee: { _id: string; name: string; avatar?: string } | null
  assignedBy: { _id: string; name: string; avatar?: string } | null
}

export interface LiveBoard {
  generatedAt: string
  counts: {
    open: number
    todo: number
    in_progress: number
    review: number
    urgent: number
    overdue: number
    unassigned: number
    peopleWithWork: number
  }
  team: LiveBoardPerson[]
  tasks: LiveBoardTask[]
}
