import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, ExternalLink, Square } from 'lucide-react'
import { api } from '../../lib/api'
import { syncSocketAuth } from '../../lib/socket'
import {
  formatTrackedSeconds,
  liveTrackedSeconds,
} from '../../lib/taskStatus'
import {
  applyWorkSessionTitle,
  clearCachedWorkSession,
  readCachedWorkSession,
  restoreBaseTitle,
  setWorkSessionBadge,
  subscribeWorkSession,
  writeCachedWorkSession,
} from '../../lib/workSession'
import {
  clearWorkAwayPopup,
  ensureWorkSessionNotifyPermission,
  startAwayPopupUpdates,
  stopAwayPopupUpdates,
} from '../../lib/workSessionNotify'
import { toast } from '../ui'
import { cn } from '../../lib/utils'

function cacheFingerprint(task) {
  if (!task?.timeTrackingStartedAt) return ''
  return `${task._id}|${task.timeTrackingStartedAt}|${task.timeSpent ?? 0}`
}

/**
 * Persistent work strip (Harvest / Toggl pattern).
 * Backend owns the timer; local cache restores after browser close;
 * OS popup when you leave for YouTube (with notification permission).
 */
export function WorkStatusBar({ userId }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tick, setTick] = useState(() => Date.now())
  const [stopping, setStopping] = useState(false)
  const [cache, setCache] = useState(() => readCachedWorkSession(userId))
  const lastWrittenRef = useRef('')
  const taskRef = useRef(null)

  const { data, isFetched } = useQuery({
    queryKey: ['active-timer'],
    queryFn: () => api('/tasks/active-timer'),
    enabled: !!userId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const serverTask = data?.task || null

  const task = useMemo(() => {
    if (serverTask?.timeTrackingStartedAt) return serverTask
    if (!isFetched && cache?.timeTrackingStartedAt) {
      return {
        _id: cache._id,
        title: cache.title,
        status: cache.status,
        workLabel: cache.workLabel,
        timeSpent: cache.timeSpent,
        timeTrackingStartedAt: cache.timeTrackingStartedAt,
        isPersonal: cache.isPersonal,
        projectId: cache.projectId
          ? { _id: cache.projectId, name: cache.projectName }
          : null,
      }
    }
    return null
  }, [serverTask, cache, isFetched])

  taskRef.current = task
  const running = !!task?.timeTrackingStartedAt
  const taskId = task?._id ? String(task._id) : ''
  const startedAt = task?.timeTrackingStartedAt
    ? String(task.timeTrackingStartedAt)
    : ''
  const taskTitle = task?.title || ''
  const timeSpent = Number(task?.timeSpent) || 0
  const projectName =
    typeof task?.projectId === 'object'
      ? task.projectId?.name || ''
      : task?.projectName || ''
  const projectId =
    typeof task?.projectId === 'object'
      ? task.projectId?._id
      : task?.projectId

  // Persist server timer to localStorage (skip if unchanged — avoids loops)
  useEffect(() => {
    if (!userId) return
    if (serverTask?.timeTrackingStartedAt) {
      const fp = cacheFingerprint(serverTask)
      if (fp === lastWrittenRef.current) return
      lastWrittenRef.current = fp
      writeCachedWorkSession(userId, serverTask)
      setCache((prev) =>
        cacheFingerprint(prev) === fp ? prev : readCachedWorkSession(userId),
      )
      setWorkSessionBadge(true)
      return
    }
    if (isFetched) {
      if (lastWrittenRef.current === '') return
      lastWrittenRef.current = ''
      clearCachedWorkSession()
      setCache(null)
      setWorkSessionBadge(false)
      restoreBaseTitle()
    }
  }, [userId, serverTask, isFetched])

  // Other Cubic tabs only
  useEffect(() => {
    if (!userId) return undefined
    return subscribeWorkSession((msg) => {
      if (msg?.type === 'clear') {
        lastWrittenRef.current = ''
        setCache(null)
        qc.setQueryData(['active-timer'], { success: true, task: null })
        restoreBaseTitle()
        setWorkSessionBadge(false)
        return
      }
      if (msg?.type === 'sync' && msg.task) {
        const fp = cacheFingerprint(msg.task)
        setCache((prev) => (cacheFingerprint(prev) === fp ? prev : msg.task))
      }
      if (msg?.type === 'storage') {
        const next = readCachedWorkSession(userId)
        setCache((prev) =>
          cacheFingerprint(prev) === cacheFingerprint(next) ? prev : next,
        )
        qc.invalidateQueries({ queryKey: ['active-timer'] })
      }
    })
  }, [userId, qc])

  // Live clock + tab title
  useEffect(() => {
    if (!running) {
      restoreBaseTitle()
      return undefined
    }
    const id = window.setInterval(() => {
      const now = Date.now()
      setTick(now)
      const t = taskRef.current
      if (!t?.timeTrackingStartedAt) return
      applyWorkSessionTitle(
        formatTrackedSeconds(
          liveTrackedSeconds(t.timeSpent, t.timeTrackingStartedAt, now),
        ),
        t.title,
      )
    }, 1000)
    applyWorkSessionTitle(
      formatTrackedSeconds(liveTrackedSeconds(timeSpent, startedAt)),
      taskTitle,
    )
    setWorkSessionBadge(true)
    return () => {
      window.clearInterval(id)
      restoreBaseTitle()
    }
  }, [running, taskId, startedAt, timeSpent, taskTitle])

  // Socket refresh
  useEffect(() => {
    if (!userId) return undefined
    const socket = syncSocketAuth()
    if (!socket) return undefined
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['active-timer'] })
    }
    if (!socket.connected) socket.connect()
    socket.on('timer:updated', refresh)
    return () => {
      socket.off('timer:updated', refresh)
    }
  }, [userId, qc])

  // Permission once when work starts
  useEffect(() => {
    if (!running) return
    ensureWorkSessionNotifyPermission().catch(() => {})
  }, [running])

  // Away popup — only on visibility change, never invalidate in a loop
  useEffect(() => {
    if (!running) {
      stopAwayPopupUpdates()
      clearWorkAwayPopup()
      return undefined
    }

    const snapshot = () => {
      const t = taskRef.current
      if (!t?.timeTrackingStartedAt) return { running: false }
      const pName =
        typeof t.projectId === 'object'
          ? t.projectId?.name
          : t.projectName || null
      return {
        running: true,
        title: t.title,
        projectName: pName,
        elapsed: formatTrackedSeconds(
          liveTrackedSeconds(
            t.timeSpent,
            t.timeTrackingStartedAt,
            Date.now(),
          ),
        ),
        url: window.location.href,
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        startAwayPopupUpdates(snapshot)
      } else {
        stopAwayPopupUpdates()
        clearWorkAwayPopup()
        // Soft refresh once when returning — not on every effect run
        qc.invalidateQueries({ queryKey: ['active-timer'] })
      }
    }

    // If already hidden when effect mounts, show popup once
    if (document.visibilityState === 'hidden') {
      startAwayPopupUpdates(snapshot)
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stopAwayPopupUpdates()
    }
  }, [running, taskId, qc])

  const elapsed = running
    ? formatTrackedSeconds(
        liveTrackedSeconds(timeSpent, startedAt, tick),
      )
    : '0:00:00'

  const openTask = () => {
    if (!taskId) return
    if (task?.isPersonal || !projectId) {
      navigate('/?view=assigned')
      return
    }
    navigate(`/projects/${projectId}/tasks?task=${taskId}`)
  }

  const stopTimer = async () => {
    if (!taskId || stopping) return
    setStopping(true)
    try {
      const spent = liveTrackedSeconds(timeSpent, startedAt)
      await api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          timeSpent: spent,
          timeTrackingStartedAt: null,
          timeTrackingUserId: null,
        }),
      })
      lastWrittenRef.current = ''
      clearCachedWorkSession()
      setCache(null)
      restoreBaseTitle()
      setWorkSessionBadge(false)
      stopAwayPopupUpdates()
      clearWorkAwayPopup()
      qc.setQueryData(['active-timer'], { success: true, task: null })
      qc.invalidateQueries({ queryKey: ['active-timer'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast('Timer stopped', { type: 'success' })
    } catch (e) {
      toast(e.message || 'Could not stop timer', { type: 'error' })
    } finally {
      setStopping(false)
    }
  }

  return (
    <AnimatePresence initial={false}>
      {running ? (
        <motion.div
          key="work-status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="sticky top-0 z-30 shrink-0 overflow-hidden print:hidden"
        >
          <div
            className={cn(
              'flex items-center gap-3 border-b px-3 py-2 sm:px-5',
              'border-emerald-500/20 bg-emerald-50/90 text-emerald-950',
              'backdrop-blur-md dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-50',
            )}
            role="status"
            aria-live="polite"
            aria-label="Active work session"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                  {task?.workLabel || 'Working on it'}
                </span>
                <button
                  type="button"
                  onClick={openTask}
                  className="truncate text-left text-[13px] font-semibold hover:underline"
                  title={taskTitle}
                >
                  {taskTitle}
                </button>
                {projectName ? (
                  <span className="truncate text-[12px] opacity-70">
                    · {projectName}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 text-[13px] font-bold tabular-nums text-emerald-950 shadow-sm dark:bg-black/30 dark:text-emerald-50">
                <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                {elapsed}
              </span>

              <button
                type="button"
                onClick={openTask}
                className="hidden h-8 items-center gap-1 rounded-lg border border-emerald-600/20 bg-white/70 px-2.5 text-[12px] font-semibold transition hover:bg-white sm:inline-flex dark:border-emerald-400/20 dark:bg-black/20 dark:hover:bg-black/35"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </button>

              <button
                type="button"
                onClick={stopTimer}
                disabled={stopping}
                title="Stop timer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-900 px-2.5 text-[12px] font-semibold text-white transition hover:bg-emerald-950 disabled:opacity-60 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                Stop
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
