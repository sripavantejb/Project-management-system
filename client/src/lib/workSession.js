/**
 * Cross-tab + reopen persistence for the active work timer.
 * Backend (Mongo timeTrackingStartedAt) is source of truth;
 * localStorage + BroadcastChannel keep every Cubic tab in sync
 * and restore the strip instantly after closing the browser.
 */

const STORAGE_KEY = 'cubic-active-work'
const CHANNEL = 'cubic-work-session'
const BASE_TITLE = 'Cubic'

let channel = null

function getChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL)
    } catch {
      channel = null
    }
  }
  return channel
}

export function readCachedWorkSession(userId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.timeTrackingStartedAt) return null
    if (userId && parsed.userId && String(parsed.userId) !== String(userId)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeCachedWorkSession(userId, task) {
  if (!task?.timeTrackingStartedAt) {
    clearCachedWorkSession()
    return
  }
  const projectName =
    typeof task.projectId === 'object' ? task.projectId?.name || null : null
  const projectId =
    typeof task.projectId === 'object'
      ? task.projectId?._id || null
      : task.projectId || null

  const payload = {
    userId: userId ? String(userId) : null,
    _id: String(task._id),
    title: task.title || 'Task',
    status: task.status || 'in_progress',
    workLabel: task.workLabel || 'Working on it',
    timeSpent: Number(task.timeSpent) || 0,
    timeTrackingStartedAt: task.timeTrackingStartedAt,
    isPersonal: !!task.isPersonal,
    projectId,
    projectName,
    cachedAt: new Date().toISOString(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
  broadcastWorkSession({ type: 'sync', task: payload })
}

export function clearCachedWorkSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  broadcastWorkSession({ type: 'clear' })
}

function broadcastWorkSession(message) {
  const ch = getChannel()
  if (ch) {
    try {
      ch.postMessage(message)
    } catch {
      /* ignore */
    }
  }
  // storage event fallback for older browsers: touch a ping key
  try {
    localStorage.setItem(
      `${STORAGE_KEY}:ping`,
      String(Date.now()),
    )
  } catch {
    /* ignore */
  }
}

/** Subscribe to other tabs starting/stopping work. Returns unsubscribe. */
export function subscribeWorkSession(onMessage) {
  const ch = getChannel()
  const onBroadcast = (e) => onMessage(e.data)
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY || e.key === `${STORAGE_KEY}:ping`) {
      onMessage({ type: 'storage' })
    }
  }
  if (ch) ch.addEventListener('message', onBroadcast)
  window.addEventListener('storage', onStorage)
  return () => {
    if (ch) ch.removeEventListener('message', onBroadcast)
    window.removeEventListener('storage', onStorage)
  }
}

/** Live tab title like Harvest/Toggl so other browser tabs still show the session. */
export function applyWorkSessionTitle(elapsed, taskTitle) {
  if (typeof document === 'undefined') return
  if (!elapsed) {
    if (document.title.startsWith('▶') || document.title.includes(' · ')) {
      document.title = BASE_TITLE
    }
    return
  }
  const short = (taskTitle || 'Task').slice(0, 40)
  document.title = `▶ ${elapsed} · ${short}`
}

export function restoreBaseTitle() {
  if (typeof document === 'undefined') return
  document.title = BASE_TITLE
}

/** Optional OS badge (Chromium / installed PWA) — silent, not a notification. */
export function setWorkSessionBadge(running) {
  try {
    if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
      if (running) navigator.setAppBadge(1)
      else if (navigator.clearAppBadge) navigator.clearAppBadge()
    }
  } catch {
    /* unsupported */
  }
}
