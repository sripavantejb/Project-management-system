/* Cubic work-session service worker
 * Shows an OS popup while you are on YouTube / another tab.
 * Does not inject into other sites — browsers forbid that.
 */

const TAG = 'cubic-work-session'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(Promise.resolve())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'show') {
    event.waitUntil(showWorkNotification(data))
  }
  if (data.type === 'clear') {
    event.waitUntil(clearWorkNotification())
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'work-session-focus' })
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return undefined
    }),
  )
})

async function showWorkNotification(data) {
  const title = data.title || 'Working on it'
  const body = data.body || 'Timer is running'
  const url = data.url || '/'
  await self.registration.showNotification(title, {
    body,
    tag: TAG,
    renotify: false,
    requireInteraction: true,
    silent: true,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url },
  })
}

async function clearWorkNotification() {
  const list = await self.registration.getNotifications({ tag: TAG })
  for (const n of list) n.close()
}
