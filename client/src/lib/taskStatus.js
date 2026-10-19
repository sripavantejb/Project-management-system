import { isAfter, startOfDay } from 'date-fns'

/** Single source of truth for task status + priority visuals */

export const TASK_STATUS_ORDER = ['todo', 'in_progress', 'review', 'done']

export const TASK_STATUSES = [
  {
    value: 'todo',
    label: 'NOT STARTED',
    shortLabel: 'Not started',
    hint: 'Waiting to begin',
    nextHint: 'Start working',
    progress: 0,
    dot: '#9a9a9a',
    bg: '#f1f5f9',
    text: '#707070',
  },
  {
    value: 'in_progress',
    label: 'WORKING ON IT',
    shortLabel: 'Working on it',
    hint: 'Happening now',
    nextHint: 'Send for check',
    progress: 40,
    dot: '#3b82f6',
    bg: 'var(--nav-active-bg)',
    text: 'var(--accent-hover)',
  },
  {
    value: 'review',
    label: 'NEEDS CHECK',
    shortLabel: 'Needs check',
    hint: 'Ready for review',
    nextHint: 'Mark finished',
    progress: 80,
    dot: '#f59e0b',
    bg: '#fffbeb',
    text: '#b45309',
  },
  {
    value: 'done',
    label: 'FINISHED',
    shortLabel: 'Finished',
    hint: 'Done',
    nextHint: 'Reopen task',
    progress: 100,
    dot: '#10b981',
    bg: 'var(--nav-active-bg)',
    text: '#047857',
  },
]

export const TASK_PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: '#ef4444' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'medium', label: 'Normal', color: '#3b82f6' },
  { value: 'low', label: 'Low', color: '#6b6b70' },
]

export function getTaskStatus(value) {
  return (
    TASK_STATUSES.find((s) => s.value === value) || TASK_STATUSES[0]
  )
}

/** Due after today (calendar day). Used to park scheduled work in Later. */
export function isLaterDue(dueDate) {
  if (!dueDate) return false
  return isAfter(startOfDay(new Date(dueDate)), startOfDay(new Date()))
}

/** Open the native date picker on click (opacity-0 inputs ignore mouse otherwise). */
export function openNativeDatePicker(input) {
  if (!input || input.disabled) return
  input.focus({ preventScroll: true })
  try {
    if (typeof input.showPicker === 'function') input.showPicker()
  } catch {
    /* ignore — older browsers, or picker already open */
  }
}

/** Advance one step: Not started → Working on it → Needs check → Finished → Not started */
export function nextTaskStatus(value) {
  const i = TASK_STATUS_ORDER.indexOf(value)
  const next =
    i < 0
      ? 'in_progress'
      : TASK_STATUS_ORDER[(i + 1) % TASK_STATUS_ORDER.length]
  return getTaskStatus(next)
}

export function taskProgressForStatus(value) {
  return getTaskStatus(value).progress
}

export function getTaskPriority(value) {
  return (
    TASK_PRIORITIES.find((p) => p.value === value) || TASK_PRIORITIES[2]
  )
}

/** Parse "2h", "30m", "2h 30m", "1.5h", or plain minutes into minutes */
export function parseTimeEstimate(input) {
  if (input == null || input === '') return null
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.max(0, Math.round(input))
  }
  const s = String(input).trim().toLowerCase()
  if (!s) return null
  if (/^\d+$/.test(s)) return parseInt(s, 10)

  let total = 0
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/)
  const m = s.match(/(\d+)\s*m/)
  if (h) total += Math.round(parseFloat(h[1]) * 60)
  if (m) total += parseInt(m[1], 10)
  if (!h && !m) {
    const n = Number(s)
    return Number.isFinite(n) ? Math.round(n) : null
  }
  return total
}

export function formatTimeEstimate(minutes) {
  if (minutes == null || minutes === '' || Number(minutes) <= 0) return ''
  const n = Math.round(Number(minutes))
  const h = Math.floor(n / 60)
  const m = n % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** Format tracked seconds as H:MM:SS */
export function formatTrackedSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Live total when a timer may be running */
export function liveTrackedSeconds(timeSpent, timeTrackingStartedAt, now = Date.now()) {
  const base = Math.max(0, Number(timeSpent) || 0)
  if (!timeTrackingStartedAt) return base
  const started = new Date(timeTrackingStartedAt).getTime()
  if (!Number.isFinite(started)) return base
  return base + Math.max(0, Math.floor((now - started) / 1000))
}
