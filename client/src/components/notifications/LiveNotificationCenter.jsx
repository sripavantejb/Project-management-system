import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-transparent bg-[var(--nav-active-bg)]',
    cta: 'Review task',
  },
  task_moved: {
    icon: ClipboardCheck,
    label: 'TASK UPDATED',
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-transparent bg-[var(--nav-active-bg)]',
    cta: 'Open task',
  },
  task: {
    icon: ClipboardCheck,
    label: 'TASK ASSIGNED',
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-transparent bg-[var(--nav-active-bg)]',
    cta: 'Review task',
  },
  lead_assigned: {
    icon: ClipboardCheck,
    label: 'TASK ASSIGNED',
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-transparent bg-[var(--nav-active-bg)]',
    cta: 'Review task',
  },
  mention: {
    icon: AtSign,
    label: 'MENTION',
    labelColor: 'text-secondary',
    iconColor: 'text-secondary',
    card: 'border-transparent bg-surface-raised',
    cta: 'Review comment',
  },
  mail: {
    icon: Mail,
    label: 'MESSAGE',
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-transparent bg-[var(--nav-active-bg)]',
    cta: 'Open message',
  },
  approval_requested: {
    icon: BadgeCheck,
    label: 'APPROVAL NEEDED',
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-accent/30 bg-[var(--nav-active-bg)]',
    cta: 'Open inbox',
  },
  approval_decided: {
    icon: BadgeCheck,
    label: 'DECISION',
    labelColor: 'text-secondary',
    iconColor: 'text-secondary',
    card: 'border-transparent bg-surface-raised',
    cta: 'View file',
  },
  deadline: {
    icon: AlertCircle,
    label: 'DEADLINE',
    labelColor: 'text-accent',
    iconColor: 'text-accent',
    card: 'border-amber-500/30 bg-amber-500/10',
    cta: 'Open task',
  },
  default: {
    icon: Bell,
    label: 'UPDATE',
    labelColor: 'text-secondary',
    iconColor: 'text-secondary',
    card: 'border-transparent bg-surface-raised',
    cta: 'Review',
  },
}

const PRIORITY_LABEL = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Normal',
  low: 'Low',
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

function contextLine(item) {
  const meta = item.meta || {}
  const bits = []
  if (meta.projectName) bits.push(meta.projectName)
  if (meta.folder) bits.push(String(meta.folder).replace(/_/g, ' '))
  if (meta.priority && PRIORITY_LABEL[meta.priority]) {
    bits.push(`${PRIORITY_LABEL[meta.priority]} priority`)
  }
  const due = meta.dueDate ? formatDate(meta.dueDate) : ''
  if (due) bits.push(`Due ${due}`)
  return bits.join(' · ')
}

function AlertRow({ item, onDismiss, onReview, onDecide, deciding }) {
  const config = TYPES[item.type] || TYPES.default
  const Icon = config.icon
  const meta = item.meta || {}
  const actor = meta.actor?.name || ''
  const context = contextLine(item)
  const isApproval =
    item.type === 'approval_requested' && meta.entityKind === 'file' && meta.fileId
  const headline =
    meta.fileName || meta.taskTitle || item.body || item.title

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'relative mb-3 rounded-2xl border px-4 py-3.5 pr-10',
        config.card,
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss alert"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-lg text-secondary transition hover:bg-surface hover:text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconColor)} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'text-[10px] font-bold tracking-[0.12em]',
                config.labelColor,
              )}
            >
              {config.label}
            </span>
            <span className="text-[13px] font-semibold text-primary">
              {headline}
            </span>
          </div>

          <p className="mt-1 text-[12px] leading-relaxed text-secondary">
            {item.type === 'mention' && meta.commentBody
              ? `“${meta.commentBody}”`
              : item.type === 'approval_requested'
                ? item.body || item.title
                : item.title}
          </p>

          {meta.note ? (
            <p className="mt-1 text-[11px] italic text-secondary">
              “{meta.note}”
            </p>
          ) : null}

          {context && (
            <p className="mt-1 text-[11px] text-secondary">{context}</p>
          )}

          {meta.previewUrl ? (
            <button
              type="button"
              onClick={() => window.open(assetUrl(meta.previewUrl), '_blank')}
              className="mt-2 text-[11px] font-semibold text-accent hover:underline"
            >
              Open drawing
            </button>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-secondary">
              {actor ? `From ${actor}` : 'Workspace'}
              {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}
            </p>
            {isApproval ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => onDecide(item, 'rejected')}
                  className="inline-flex h-8 items-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-[12px] font-semibold text-red-600 transition hover:bg-red-500/15 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => onDecide(item, 'approved')}
                  className="inline-flex h-8 items-center rounded-lg bg-[var(--accent)] px-3.5 text-[12px] font-semibold text-[#171717] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onReview}
                className="inline-flex h-8 items-center rounded-lg bg-[var(--accent)] px-3.5 text-[12px] font-semibold text-[#171717] transition hover:bg-[var(--accent-hover)]"
              >
                {config.cta}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function LiveNotificationCenter() {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id || user?._id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [alerts, setAlerts] = useState([])
  const [decidingId, setDecidingId] = useState(null)
  const seenIds = useRef(loadSeen())

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
        return [...prev, { ...payload, _id: id }]
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

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([12, 60, 12])
      }
    },
    [qc],
  )

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
        /* ignore transient errors */
      }
    }

    pull()
    const id = window.setInterval(pull, 5000)
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

  const markRead = useCallback(
    (id) => {
      if (!id) return
      api(`/notifications/${id}/read`, { method: 'PATCH' })
        .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
        .catch(() => {})
    },
    [qc],
  )

  const dismissOne = useCallback(
    (id) => {
      markRead(id)
      setAlerts((prev) => prev.filter((a) => String(a._id) !== String(id)))
    },
    [markRead],
  )

  const closeAll = useCallback(() => {
    setAlerts([])
  }, [])

  const review = useCallback(
    (item) => {
      markRead(item._id)
      setAlerts((prev) => prev.filter((a) => String(a._id) !== String(item._id)))
      navigate(item.link || '/inbox?tab=primary')
    },
    [markRead, navigate],
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
        markRead(item._id)
        setAlerts((prev) => prev.filter((a) => String(a._id) !== String(item._id)))
        qc.invalidateQueries({ queryKey: ['files'] })
        qc.invalidateQueries({ queryKey: ['approvals'] })
      } catch (e) {
        toast(e.message || 'Could not decide', { type: 'error' })
      } finally {
        setDecidingId(null)
      }
    },
    [markRead, qc],
  )

  if (!userId) return null

  const hasApproval = alerts.some((a) => a.type === 'approval_requested')

  return createPortal(
    <AnimatePresence>
      {alerts.length > 0 && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAll}
          />

          <motion.div
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="relative flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-surface shadow-[0_30px_90px_rgba(9,20,38,0.35)]"
          >
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--nav-active-bg)]">
                <AlertCircle className="h-4 w-4 text-accent" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-primary">
                  {hasApproval
                    ? 'Approval needed'
                    : 'New work assigned to you'}
                </h2>
                <p className="mt-0.5 text-[12px] text-secondary">
                  {hasApproval
                    ? 'Review the drawing and approve or reject from here'
                    : 'Please review and acknowledge these updates to proceed'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAll}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-secondary transition hover:bg-surface-raised hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence initial={false}>
                {alerts.map((item) => (
                  <AlertRow
                    key={item._id}
                    item={item}
                    onDismiss={() => dismissOne(item._id)}
                    onReview={() => review(item)}
                    onDecide={decide}
                    deciding={decidingId === item._id}
                  />
                ))}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
              <p className="text-[12px] text-secondary">
                {alerts.length} alert{alerts.length > 1 ? 's' : ''} remaining
              </p>
              <button
                type="button"
                onClick={closeAll}
                className="inline-flex h-9 items-center rounded-xl bg-[#171717] px-4 text-[13px] font-semibold text-white transition hover:bg-[#1e293b]"
              >
                Close popup
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
