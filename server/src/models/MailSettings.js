import mongoose from 'mongoose'

/**
 * Per-workspace outbound email (SMTP / app password) and who gets which
 * alerts (popup + email). One document per tenant.
 */

export const NOTIFICATION_EVENTS = [
  {
    key: 'task_assigned',
    label: 'Task assigned',
    description: 'When someone is given a task',
  },
  {
    key: 'task_moved',
    label: 'Task moved / status change',
    description: 'When a task changes status, stage, or due date',
  },
  {
    key: 'deadline',
    label: 'Task deadlines',
    description: 'Reminders before a task due date',
  },
  {
    key: 'approval_requested',
    label: 'Approval requested',
    description: 'Drawings and other items needing sign-off',
  },
  {
    key: 'approval_decided',
    label: 'Approval decided',
    description: 'When an approval is approved or rejected',
  },
  {
    key: 'lead_assigned',
    label: 'Enquiry assigned',
    description: 'New enquiry follow-ups',
  },
  {
    key: 'mention',
    label: 'Mentions & comments',
    description: 'When someone @mentions you',
  },
  {
    key: 'mail',
    label: 'Internal mail',
    description: 'In-app messages between teammates',
  },
]

const eventPrefSchema = new mongoose.Schema(
  {
    popup: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    /** Primary actor (assignee / approver / mentioned user) */
    notifyTarget: { type: Boolean, default: true },
    /** Person who triggered the action (assigner, requester) */
    notifyActor: { type: Boolean, default: true },
    /** Workspace owners and admins */
    notifyAdmins: { type: Boolean, default: true },
    /** Days before due date (deadline event only) */
    daysBefore: { type: Number, default: 1, min: 0, max: 30 },
  },
  { _id: false },
)

function defaultEventPrefs() {
  const out = {}
  for (const e of NOTIFICATION_EVENTS) {
    // Status/stage clicks stay quiet — only assignment & deadlines fan out wider
    const isAssignmentOrDeadline =
      e.key === 'task_assigned' || e.key === 'deadline'
    out[e.key] = {
      popup: true,
      email: e.key !== 'task_moved',
      notifyTarget: true,
      notifyActor: isAssignmentOrDeadline,
      notifyAdmins:
        isAssignmentOrDeadline || e.key === 'approval_requested',
      daysBefore: 1,
    }
  }
  return out
}

const mailSettingsSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: false },
    host: { type: String, default: 'smtp.gmail.com', trim: true },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    user: { type: String, default: '', trim: true },
    /** App password / SMTP password — never returned in full to the client */
    pass: { type: String, default: '' },
    fromName: { type: String, default: 'Cubic', trim: true },
    fromEmail: { type: String, default: '', trim: true },
    events: {
      type: mongoose.Schema.Types.Mixed,
      default: defaultEventPrefs,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

export function getDefaultEventPrefs() {
  return defaultEventPrefs()
}

export function sanitizeMailSettings(doc) {
  if (!doc) return null
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  const hasPass = Boolean(o.pass)
  delete o.pass
  o.hasPassword = hasPass
  o.passwordSet = hasPass
  o.events = { ...defaultEventPrefs(), ...(o.events || {}) }
  return o
}

export const MailSettings = mongoose.model('MailSettings', mailSettingsSchema)
