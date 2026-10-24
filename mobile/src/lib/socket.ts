import { io, type Socket } from 'socket.io-client'
import { API_ORIGIN, isTunneledOrigin } from '../constants/env'
import { useAuthStore } from '../store/authStore'

let socket: Socket | null = null

function currentToken() {
  return useAuthStore.getState().accessToken || null
}

/**
 * Singleton Socket.IO client.
 * Public tunnels (Cloudflare / loca.lt / exp.direct) usually cannot upgrade
 * WebSockets through Metro, so those sessions start on HTTP long-polling.
 */
export function getSocket() {
  const token = currentToken()
  if (!token) return null

  if (!socket) {
    const tunneled = isTunneledOrigin()
    socket = io(API_ORIGIN, {
      transports: tunneled ? ['polling'] : ['websocket', 'polling'],
      upgrade: !tunneled,
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4_000,
      reconnectionAttempts: Infinity,
      timeout: 8_000,
      auth: { token },
    })

    socket.on('connect_error', () => {
      const next = currentToken()
      const auth = socket?.auth as { token?: string } | undefined
      if (next && next !== auth?.token) {
        socket!.auth = { token: next }
        socket!.connect()
      }
    })
  } else {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
  }

  return socket
}

export function syncSocketAuth() {
  const token = currentToken()
  if (!token) {
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

export function isSocketConnected() {
  return !!socket?.connected
}
