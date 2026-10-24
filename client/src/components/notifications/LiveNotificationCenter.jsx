import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  AtSign,
  Bell,
  ClipboardCheck,
  Mail,
  AlertCircle,
  BadgeCheck,
  X,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../../lib/api'
import { syncSocketAuth } from '../../lib/socket'
import { cn } from '../../lib/utils'
import { toast } from '../ui'

const TYPES = {
  task_assigned: {
    icon: ClipboardCheck,
    label: 'TASK ASSIGNED',
    accent: 'text-accent',
    bar: 'border-[var(--accent)]/30 bg-[var(--nav-active-bg)]',
    cta: 'Open',
  },
  task_moved: {
    icon: ClipboardCheck,
    label: 'TASK UPDATED',
    accent: 'text-accent',
    bar: 'border-[var(--accent)]/30 bg-[var(--nav-active-bg)]',
    cta: 'Open',
  },
  task: {
    icon: ClipboardCheck,
    label: 'TASK ASSIGNED',
    accent: 'text-accent',
    bar: 'border-[var(--accent)]/30 bg-[var(--nav-active-bg)]',
    cta: 'Open',
  },
  lead_assigned: {
    icon: ClipboardCheck,
    label: 'ENQUIRY',
    accent: 'text-accent',
    bar: 'border-[var(--accent)]/30 bg-[var(--nav-active-bg)]',
    cta: 'Open',
  },
  mention: {
    icon: AtSign,
    label: 'MENTION',
    accent: 'text-secondary',
    bar: 'border-border bg-surface',
    cta: 'View',
  },
  mail: {
    icon: Mail,
    label: 'MESSAGE',
    accent: 'text-accent',
    bar: 'border-[var(--accent)]/30 bg-[var(--nav-active-bg)]',
    cta: 'Open',
  },
  approval_requested: {
    icon: BadgeCheck,
    label: 'APPROVAL',
    accent: 'text-accent',
    bar: 'border-accent/40 bg-[var(--nav-active-bg)]',
    cta: 'Review',
  },
  approval_decided: {
    icon: BadgeCheck,
    label: 'DECISION',
    accent: 'text-secondary',
    bar: 'border-border bg-surface',
    cta: 'View',
  },
  deadline: {
    icon: AlertCircle,
    label: 'DEADLINE',
    accent: 'text-amber-700',
    bar: 'border-amber-500/40 bg-amber-500/10',
    cta: 'Open',
  },
  default: {
    icon: Bell,
    label: 'UPDATE',
    accent: 'text-secondary',
    bar: 'border-border bg-surface',
    cta: 'Open',
  },
}

const POPUP_TYPES = new Set([
  'task_assigned',
  'task_moved',
  'task',
  'lead_assigned',
  'mention',
  'mail',
  'approval_requested',
  'approval_decided',
  'deadline',
])
const SEEN_KEY = 'cubic-live-notif-seen'
const RECENT_MS = 10 * 60 * 1000
const AUTO_DISMISS_MS = 10_000

function loadSeen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function persistSeen(set) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-80)))
  } catch {
    /* ignore */
  }
}

function formatDate(value) {
  if (!value) return ''
  try {
    return format(new Date(value), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

/**
 * Soft top strip (Slack / Linear style) — never a blocking modal.
 * Sits under the work-status bar and does not freeze the page.
 */
export function LiveNotificationCenter() {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || user?._id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [alerts, setAlerts] = useState([])
  const [decidingId, setDecidingId] = useState(null)
  const seenIds = useRef(loadSeen())
  const timers = useRef(new Map())

  const clearAuto = useCallback((id) => {
    const t = timers.current.get(String(id))
    if (t) {
      window.clearTimeout(t)
      timers.current.delete(String(id))
    }
  }, [])

  const dismissOne = useCallback(
    (id) => {
      clearAuto(id)
      setAlerts((prev) => prev.filter((a) => String(a._id) !== String(id)))
      if (id) {
        api(`/notifications/${id}/read`, { method: 'PATCH' })
          .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
          .catch(() => {})
      }
    },
    [clearAuto, qc],
  )

  const enqueue = useCallback(
    (payload) => {
      if (!payload) return
      const id = String(payload._id || crypto.randomUUID())
      if (seenIds.current.has(id)) return
      if (payload.type && !POPUP_TYPES.has(payload.type)) return

      seenIds.current.add(id)
      persistSeen(seenIds.current)
      setAlerts((prev) => {
        if (prev.some((p) => String(p._id) === id)) return prev
        return [...prev, { ...payload, _id: id }].slice(-4)
      })

      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['home'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['mail-threads'] })
      if (payload.type === 'mail') {
        qc.invalidateQueries({ queryKey: ['mail-thread'] })
      }
      if (payload.meta?.channelId || payload.link?.includes('/channels/')) {
        qc.invalidateQueries({ queryKey: ['channel-messages'] })
        qc.invalidateQueries({ queryKey: ['channels'] })
      }

      // Approvals stay until acted on; everything else soft-dismisses
      if (payload.type !== 'approval_requested') {
        clearAuto(id)
        timers.current.set(
          id,
          window.setTimeout(() => dismissOne(id), AUTO_DISMISS_MS),
        )
      }
    },
    [qc, clearAuto, dismissOne],
  )

  useEffect(() => {
    return () => {
      for (const t of timers.current.values()) window.clearTimeout(t)
      timers.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined

    const socket = syncSocketAuth()
    if (!socket) return undefined

    const onNotification = (payload) => enqueue(payload)
    const onMail = () => {
      qc.invalidateQueries({ queryKey: ['mail-threads'] })
      qc.invalidateQueries({ queryKey: ['mail-thread'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }

    if (!socket.connected) socket.connect()
    socket.on('notification:new', onNotification)
    socket.on('mail:new', onMail)

    return () => {
      socket.off('notification:new', onNotification)
      socket.off('mail:new', onMail)
    }
  }, [userId, enqueue, qc])

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false

    const pull = async () => {
      try {
        const data = await api('/notifications')
        if (cancelled) return
        const now = Date.now()
        const fresh = (data?.notifications || [])
          .filter((n) => !n.read && POPUP_TYPES.has(n.type))
          .filter((n) => {
            const created = new Date(n.createdAt).getTime()
            return Number.isFinite(created) && now - created < RECENT_MS
          })
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
        for (const n of fresh) enqueue(n)
      } catch {
        /* ignore */
      }
    }

    pull()
    const id = window.setInterval(pull, 8000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    window.addEventListener('focus', pull)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('focus', pull)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, enqueue])

  const review = useCallback(
    (item) => {
      dismissOne(item._id)
      navigate(item.link || '/inbox?tab=primary')
    },
    [dismissOne, navigate],
  )

  const decide = useCallback(
    async (item, decision) => {
      const fileId = item.meta?.fileId
      if (!fileId) return
      setDecidingId(item._id)
      try {
        await api(`/files/${fileId}/decide`, {
          method: 'POST',
          body: JSON.stringify({ decision }),
        })
        toast(
          decision === 'approved' ? 'Drawing approved' : 'Drawing rejected',
          { type: 'success' },
        )
        dismissOne(item._id)
        qc.invalidateQueries({ queryKey: ['files'] })
        qc.invalidateQueries({ queryKey: ['approvals'] })
      } catch (e) {
        toast(e.message || 'Could not decide', { type: 'error' })
      } finally {
        setDecidingId(null)
      }
    },
    [dismissOne, qc],
  )

  if (!userId || alerts.length === 0) return null

  return (
    <div
      className="flex shrink-0 flex-col gap-1 border-b border-border/60 bg-canvas px-2 py-1.5 print:hidden sm:px-4"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {alerts.map((item) => {
          const config = TYPES[item.type] || TYPES.default
          const Icon = config.icon
          const meta = item.meta || {}
          const actor = meta.actor?.name || ''
          const headline =
            meta.fileName || meta.taskTitle || item.body || item.title
          const isApproval =
            item.type === 'approval_requested' &&
            meta.entityKind === 'file' &&
            meta.fileId

          return (
            <motion.div
              key={item._id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'mx-auto flex w-full max-w-4xl items-center gap-2 rounded-xl border px-3 py-2 shadow-sm',
                config.bar,
              )}
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', config.accent)} />
              <span
                className={cn(
                  'hidden shrink-0 text-[9px] font-bold tracking-[0.12em] sm:inline',
                  config.accent,
                )}
              >
                {config.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-primary">
                  {headline}
                </p>
                <p className="truncate text-[11px] text-secondary">
                  {actor ? `From ${actor}` : item.title}
                  {meta.projectName ? ` · ${meta.projectName}` : ''}
                  {meta.dueDate ? ` · Due ${formatDate(meta.dueDate)}` : ''}
                </p>
              </div>

              {isApproval ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={decidingId === item._id}
                    onClick={() => decide(item, 'rejected')}
                    className="h-7 rounded-lg border border-red-500/30 bg-red-500/10 px-2 text-[11px] font-semibold text-red-600 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={decidingId === item._id}
                    onClick={() => decide(item, 'approved')}
                    className="h-7 rounded-lg bg-[var(--accent)] px-2.5 text-[11px] font-semibold text-[#171717] disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => review(item)}
                  className="h-7 shrink-0 rounded-lg bg-[var(--accent)] px-2.5 text-[11px] font-semibold text-[#171717]"
                >
                  {config.cta}
                </button>
              )}

              {meta.previewUrl ? (
                <button
                  type="button"
                  onClick={() => window.open(assetUrl(meta.previewUrl), '_blank')}
                  className="hidden h-7 shrink-0 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-primary sm:inline-flex sm:items-center"
                >
                  Drawing
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => dismissOne(item._id)}
                aria-label="Dismiss"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-black/5 hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
