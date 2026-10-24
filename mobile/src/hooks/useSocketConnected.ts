import { useEffect, useState } from 'react'
import { getSocket, syncSocketAuth } from '../lib/socket'
import { useAuthStore } from '../store/authStore'

/** Tracks whether live chat/notifications are actually connected. */
export function useSocketConnected() {
  const userId = useAuthStore((s) => s.user?.id)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!userId) {
      setConnected(false)
      return undefined
    }

    const socket = syncSocketAuth() || getSocket()
    if (!socket) {
      setConnected(false)
      return undefined
    }

    const sync = () => setConnected(socket.connected)
    sync()
    socket.on('connect', sync)
    socket.on('disconnect', sync)
    return () => {
      socket.off('connect', sync)
      socket.off('disconnect', sync)
    }
  }, [userId])

  return connected
}
