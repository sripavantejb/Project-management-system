/**
 * OS popup while you leave Cubic (YouTube, Gmail, etc.).
 * Web apps cannot draw UI on other sites — Harvest/Toggl use the same
 * browser Notification + service worker pattern.
 */

const SW_URL = '/work-session-sw.js'
const PERM_ASKED_KEY = 'cubic-work-notify-asked'

let registrationPromise = null
let updateTimer = null

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function ensureWorkSessionNotifyPermission() {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission === 'granted') {
    await ensureServiceWorker()
    return 'granted'
  }
  if (Notification.permission === 'denied') return 'denied'

  // Ask once per browser profile when they first start work
  const asked = localStorage.getItem(PERM_ASKED_KEY)
  if (asked === 'denied') return 'denied'

  const result = await Notification.requestPermission()
  localStorage.setItem(PERM_ASKED_KEY, result)
  if (result === 'granted') await ensureServiceWorker()
  return result
}

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .catch((err) => {
        console.warn('[work-session] SW register failed', err)
        registrationPromise = null
        return null
      })
  }
  return registrationPromise
}

async function postToSw(message) {
  const reg = await ensureServiceWorker()
  if (!reg) return false
  const ready = await navigator.serviceWorker.ready
  const worker = ready.active || reg.active
  if (worker) {
    worker.postMessage(message)
    return true
  }
  return false
}

function buildBody(elapsed, projectName) {
  const parts = [`Timer ${elapsed}`]
  if (projectName) parts.push(projectName)
  parts.push('Click to return to Cubic')
  return parts.join(' · ')
}

/** Show / refresh the away popup (sticky until you come back or stop). */
export async function showWorkAwayPopup({
  title,
  elapsed,
  projectName,
  url,
}) {
  if (!notificationsSupported()) return
  if (Notification.permission !== 'granted') return

  const payload = {
    type: 'show',
    title: `▶ Working on it · ${title || 'Task'}`,
    body: buildBody(elapsed, projectName),
    url: url || window.location.href,
  }

  const viaSw = await postToSw(payload)
  if (!viaSw) {
    // Fallback without SW
    try {
      const existing = await (async () => {
        if (navigator.serviceWorker?.ready) {
          const reg = await navigator.serviceWorker.ready
          return reg.getNotifications?.({ tag: 'cubic-work-session' })
        }
        return null
      })()
      if (existing) for (const n of existing) n.close()
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-new
    new Notification(payload.title, {
      body: payload.body,
      tag: 'cubic-work-session',
      requireInteraction: true,
      silent: true,
      icon: '/favicon.svg',
    })
  }
}

export async function clearWorkAwayPopup() {
  stopAwayPopupUpdates()
  if (!notificationsSupported()) return
  const viaSw = await postToSw({ type: 'clear' })
  if (!viaSw && Notification.permission === 'granted') {
    try {
      // Close any page-created notifications by replacing with empty short-lived
      const n = new Notification(' ', { tag: 'cubic-work-session', silent: true })
      n.close()
    } catch {
      /* ignore */
    }
  }
}

/**
 * While Cubic is in the background, keep a sticky OS popup updated.
 * Call when visibility goes hidden and a timer is running.
 */
export function startAwayPopupUpdates(getSnapshot) {
  stopAwayPopupUpdates()
  const tick = () => {
    if (document.visibilityState === 'visible') {
      clearWorkAwayPopup()
      return
    }
    const snap = typeof getSnapshot === 'function' ? getSnapshot() : null
    if (!snap?.running) {
      clearWorkAwayPopup()
      return
    }
    showWorkAwayPopup(snap)
  }
  tick()
  // Browsers throttle background timers; 30s is enough as a reminder
  updateTimer = window.setInterval(tick, 30_000)
}

export function stopAwayPopupUpdates() {
  if (updateTimer) {
    window.clearInterval(updateTimer)
    updateTimer = null
  }
}
