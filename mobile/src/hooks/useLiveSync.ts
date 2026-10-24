import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { syncSocketAuth, disconnectSocket } from '../lib/socket'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import { mailUserId, isCurrentUser } from '../utils/chatUtils'
import type { MailThread, Message, Notification } from '../types/models'

/**
 * Real-time sync: notifications, mail, permissions.
 * Prefer surgical cache updates over broad invalidation so Home and Inbox
 * do not re-fetch everything on every message.
 */
export function useLiveSync() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const setTenant = useAuthStore((s) => s.setTenant)
  const pushToast = useToastStore((s) => s.push)
  const queryClient = useQueryClient()

  useEffect(() => {
    const userId = user?.id
    if (!userId) {
      disconnectSocket()
      return undefined
    }

    const socket = syncSocketAuth()
    if (!socket) return undefined

    const onNotification = (payload: Partial<Notification> & { title?: string; body?: string; type?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      if (payload?.title) {
        pushToast({
          title: payload.title,
          body: payload.body,
          type: payload.type,
        })
      }
    }

    const onMail = (payload: { message?: Message; from?: { name?: string } }) => {
      const message = payload?.message
      if (!message) return

      const peerId = isCurrentUser(message.from, userId)
        ? mailUserId(message.to)
        : mailUserId(message.from)
      if (!peerId) return

      queryClient.setQueryData<{ other: MailThread['user']; messages: Message[] }>(
        ['mail-conversation', peerId],
        (old) => {
          if (!old) return old
          if (old.messages.some((m) => m._id === message._id)) return old
          return { ...old, messages: [...old.messages, message] }
        },
      )

      queryClient.setQueryData<MailThread[]>(['mail-threads'], (old) => {
        if (!old) {
          queryClient.invalidateQueries({ queryKey: ['mail-threads'] })
          return old
        }
        const idx = old.findIndex((t) => String(t.user._id) === String(peerId))
        const incoming = !isCurrentUser(message.from, userId)
        if (idx === -1) {
          queryClient.invalidateQueries({ queryKey: ['mail-threads'] })
          return old
        }
        const current = old[idx]
        const next: MailThread = {
          ...current,
          lastMessage: message,
          unread: incoming ? (current.unread || 0) + 1 : current.unread || 0,
        }
        return [next, ...old.slice(0, idx), ...old.slice(idx + 1)]
      })

      const fromName = payload?.from?.name || message.from?.name || 'Someone'
      pushToast({
        title: `${fromName} sent a message`,
        body: message.body?.slice(0, 120),
        type: 'mail',
      })
    }

    const onPermissions = (payload: { permissions?: Record<string, boolean> }) => {
      const current = useAuthStore.getState().user
      if (current) {
        setUser({
          ...current,
          permissions: payload?.permissions || {},
        })
      }
      authApi
        .me()
        .then((result) => {
          if (result?.user) setUser(result.user)
          if (result?.tenant) setTenant(result.tenant)
        })
        .catch(() => {})
    }

    if (!socket.connected) socket.connect()
    socket.on('notification:new', onNotification)
    socket.on('mail:new', onMail)
    socket.on('permissions:updated', onPermissions)

    return () => {
      socket.off('notification:new', onNotification)
      socket.off('mail:new', onMail)
      socket.off('permissions:updated', onPermissions)
    }
  }, [user?.id, pushToast, queryClient, setTenant, setUser])
}
