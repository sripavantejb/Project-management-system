import { io } from 'socket.io-client'
import { apiOrigin, useAuthStore } from './api'

let socket = null

function isLocalHost(url) {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return /localhost|127\.0\.0\.1/i.test(String(url || ''))
  }
}

/**
 * Prefer the real API host so websockets are not dropped by the Vite proxy.
 * Never point a hosted page at localhost (common misconfigured VITE_API_URL).
 * Vercel serverless has no Socket.IO — skip connecting there.
 */
function socketUrl() {
  const pageIsLocal =
    typeof window !== 'undefined' && isLocalHost(window.location.href)

  // Hosted SPA (Vercel): never dial the developer's machine, even if env is wrong.
  if (typeof window !== 'undefined' && !pageIsLocal) {
    return null
  }

  const raw = (import.meta.env.VITE_API_URL || '').trim()
  let url = null
  if (raw && /^https?:\/\//i.test(raw)) {
    url = raw.replace(/\/api\/?$/, '')
  } else if (import.meta.env.DEV) {
    // Same-origin so Vite's /socket.io proxy is used.
    url = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  } else {
    url = apiOrigin() || null
  }

  if (!url) return null

  // Production/preview must never dial the developer's machine.
  if (!import.meta.env.DEV && isLocalHost(url)) return null

  // Socket.IO is unavailable on Vercel serverless API hosts.
  try {
    if (new URL(url).hostname.endsWith('.vercel.app')) return null
  } catch {
    /* ignore */
  }

  return url
}

function currentToken() {
  return useAuthStore.getState().accessToken || null
}

/**
 * Singleton Socket.IO client — JWT auth on every connect.
 * Server auto-joins `user:{id}`; never emit join:user with a client-chosen id.
 * Returns null when realtime is unavailable (Vercel / misconfigured URL).
 */
export function getSocket() {
  const token = currentToken()
  if (!token) return null

  const url = socketUrl()
  if (!url) return null

  if (!socket) {
    socket = io(url, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionAttempts: Infinity,
      auth: { token },
    })

    socket.on('connect_error', (err) => {
      // Token expired — try once with the latest store token
      const next = currentToken()
      if (next && next !== socket.auth?.token) {
        socket.auth = { token: next }
        socket.connect()
      } else if (import.meta.env.DEV) {
        console.warn('[socket]', err?.message || err)
      }
    })
  } else {
    // Keep auth in sync after token refresh
    socket.auth = { token }
    if (!socket.connected) socket.connect()
  }

  return socket
}

/** Call after login / token refresh so the next connect uses a fresh JWT. */
export function syncSocketAuth() {
  const token = currentToken()
  if (!token) {
    disconnectSocket()
    return null
  }
  if (!socketUrl()) {
    disconnectSocket()
    return null
  }
  if (!socket) return getSocket()
  socket.auth = { token }
  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
