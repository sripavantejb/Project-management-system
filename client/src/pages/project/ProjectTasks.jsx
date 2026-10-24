import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { format, isPast, isToday } from 'date-fns'
import {
  Plus,
  Search,
  Circle,
  CheckCircle2,
  ChevronDown,
  Calendar,
  User,
  UserCheck,
  Timer,
} from 'lucide-react'
import { api, useAuthStore } from '../../lib/api'
import { capabilitiesForUser } from '../../lib/roles'
import { toast } from '../../components/ui'
import { TaskDetailPanel } from './TaskDetailPanel'
import { cn } from '../../lib/utils'
import {
  PILL_ACTIVE,
  PILL_IDLE,
  PILL_TRACK,
} from '../../components/layout/PageToolbar'
import { ProjectTabBar } from './ProjectPageShell'
import {
  formatTrackedSeconds,
  getTaskStatus,
  isLaterDue,
  liveTrackedSeconds,
  nextTaskStatus,
  openNativeDatePicker,
} from '../../lib/taskStatus'

const GROUPS = [
  {
    key: 'todo',
    label: 'Not started',
    hint: 'Waiting to begin',
    dot: 'bg-[#aeaeb2]',
    tint: 'bg-black/[0.02]',
  },
  {
    key: 'in_progress',
    label: 'Working on it',
    hint: 'Happening now',
    dot: 'bg-[var(--accent)]',
    tint: 'bg-black/[0.02]',
  },
  {
    key: 'review',
    label: 'Needs check',
    hint: 'Ready for review',
    dot: 'bg-amber-500',
    tint: 'bg-black/[0.02]',
  },
  {
    key: 'done',
    label: 'Finished',
    hint: 'Done',
    dot: 'bg-[#34c759]',
    tint: 'bg-black/[0.02]',
  },
]

const LATER_GROUP = {
  key: 'later',
  label: 'Later',
  hint: 'Scheduled for a future date',
  dot: 'bg-[#5b8def]',
  tint: 'bg-black/[0.02]',
}

const PRIORITY = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700' },
  high: { label: 'High', className: 'bg-orange-50 text-orange-700' },
  medium: { label: 'Normal', className: 'bg-black/[0.04] text-secondary' },
  low: { label: 'Low', className: 'bg-transparent text-secondary' },
}

function dueLabel(dueDate) {
  if (!dueDate) return { text: 'No date', className: 'text-secondary' }
  const d = new Date(dueDate)
  const text = format(d, 'dd MMM')
  if (isToday(d)) return { text: `Today`, className: 'text-[#0d7a4f] font-bold' }
  if (isPast(d)) return { text: `Late · ${text}`, className: 'text-red-600 font-bold' }
  return { text, className: 'text-secondary' }
}

export function ProjectTasks() {
  const { id } = useParams()
  const { project } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStatus, setCreateStatus] = useState('todo')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [filter, setFilter] = useState('open')
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const caps = capabilitiesForUser(user, tenant)

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api('/users'),
  })
  const users = usersData?.users || []

  useEffect(() => {
    const taskFromUrl = searchParams.get('task')
    if (taskFromUrl) setSelectedId(taskFromUrl)
  }, [searchParams])

  const closeTask = () => {
    setSelectedId(null)
    if (searchParams.has('task')) {
      const next = new URLSearchParams(searchParams)
      next.delete('task')
      setSearchParams(next, { replace: true })
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api(`/tasks?projectId=${id}`),
  })

  const tasks = useMemo(() => {
    let list = data?.tasks || []
    if (filter === 'open') list = list.filter((t) => t.status !== 'done')
    if (filter === 'done') list = list.filter((t) => t.status === 'done')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) => t.title?.toLowerCase().includes(q))
    }
    return list
  }, [data?.tasks, search, filter])

  const patch = useMutation({
    mutationFn: ({ taskId, body }) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', id] })
      qc.invalidateQueries({ queryKey: ['home'] })
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['active-timer'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(GROUPS.map((g) => [g.key, []]))
    map.later = []
    for (const t of tasks) {
      if (t.status !== 'done' && isLaterDue(t.dueDate)) {
        map.later.push(t)
        continue
      }
      const k = map[t.status] ? t.status : 'todo'
      map[k].push(t)
    }
    map.later.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )
    return map
  }, [tasks])

  const allTasks = data?.tasks || []
  const counts = {
    open: allTasks.filter((t) => t.status !== 'done').length,
    done: allTasks.filter((t) => t.status === 'done').length,
    late: allTasks.filter(
      (t) =>
        t.status !== 'done' &&
        t.dueDate &&
        isPast(new Date(t.dueDate)) &&
        !isToday(new Date(t.dueDate)),
    ).length,
    later: allTasks.filter((t) => t.status !== 'done' && isLaterDue(t.dueDate))
      .length,
  }

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--bg-canvas)] p-4">
        <div className="h-40 animate-pulse rounded-2xl bg-black/[0.06]" />
      </div>
    )
  }

  const visibleGroups =
    filter === 'open'
      ? [...GROUPS.filter((g) => g.key !== 'done'), LATER_GROUP]
      : filter === 'done'
        ? GROUPS.filter((g) => g.key === 'done')
        : [...GROUPS, LATER_GROUP]

  const gridClass =
    filter === 'all'
      ? 'grid-cols-1 sm:grid-cols-2'
      : filter === 'done'
        ? 'grid-cols-1 max-w-2xl'
        : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-4'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-canvas)]">
      <ProjectTabBar
        left={
          <>
            <h2 className="shrink-0 text-[13px] font-semibold tracking-tight text-primary">
              Tasks
            </h2>
            <div className={PILL_TRACK}>
              {[
                { id: 'open', label: 'Active', count: counts.open },
                { id: 'done', label: 'Finished', count: counts.done },
                { id: 'all', label: 'All', count: allTasks.length },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                    filter === f.id ? PILL_ACTIVE : PILL_IDLE,
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'tabular-nums',
                      filter === f.id ? 'text-primary' : 'text-secondary',
                    )}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
            {counts.late > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">
                Late {counts.late}
              </span>
            )}
            {counts.later > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#5b8def]/10 px-2 py-1 text-[11px] font-bold text-[#3b6fd4]">
                Later {counts.later}
              </span>
            )}
          </>
        }
        right={
          <>
            <div className="relative min-w-[140px] max-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find…"
                className="h-8 w-full rounded-full border border-border bg-surface-raised pl-8 pr-3 text-[12px] outline-none focus:border-[var(--accent)]/50 focus:bg-surface"
              />
            </div>
            {caps.createTask && (
              <button
                type="button"
                onClick={() => {
                  setCreateStatus('todo')
                  setCreateOpen(true)
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] px-3 text-[12px] font-semibold text-[#171717] hover:bg-[var(--accent-hover)]"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        <div className={cn('grid gap-3', gridClass)}>
          {visibleGroups.map((g) => {
            const list = byStatus[g.key] || []
            const closed = collapsed[g.key]
            return (
              <section
                key={g.key}
                className={cn(
                  'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
                  filter === 'all' && 'min-h-[180px]',
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((s) => ({ ...s, [g.key]: !s[g.key] }))
                  }
                  className={cn(
                    'flex w-full items-center gap-2 px-3.5 py-2.5 text-left',
                    g.tint,
                  )}
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-secondary transition',
                      closed && '-rotate-90',
                    )}
                  />
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', g.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-primary">
                      {g.label}
                    </p>
                    <p className="text-[10px] text-secondary">{g.hint}</p>
                  </div>
                  <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
                    {list.length}
                  </span>
                </button>

                {!closed && (
                  <div className="flex flex-1 flex-col divide-y divide-border">
                    {list.length === 0 && (
                      <p className="px-3 py-8 text-center text-[11px] text-secondary">
                        Nothing here yet
                      </p>
                    )}
                    {list.map((t) => (
                      <TaskCard
                        key={t._id}
                        task={t}
                        users={users}
                        canManage={caps.manageTasks}
                        onOpen={() => setSelectedId(t._id)}
                        onPatch={(body) =>
                          patch.mutate({ taskId: t._id, body })
                        }
                      />
                    ))}
                    {caps.createTask && g.key !== 'later' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreateStatus(g.key === 'done' ? 'todo' : g.key)
                          setCreateOpen(true)
                        }}
                        className="mt-auto flex w-full items-center justify-center gap-1 py-2.5 text-[11px] font-semibold text-[#0d7a4f] hover:bg-black/[0.02]"
                      >
                        <Plus className="h-3 w-3" />
                        Add task
                      </button>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <TaskDetailPanel
        open={createOpen}
        mode="create"
        projectId={id}
        projectName={project?.name}
        initialStatus={createStatus}
        onClose={() => setCreateOpen(false)}
        onCreated={(task) => {
          setCreateOpen(false)
          if (task?._id) setSelectedId(task._id)
          qc.invalidateQueries({ queryKey: ['tasks', id] })
          qc.invalidateQueries({ queryKey: ['home'] })
        }}
      />
      <TaskDetailPanel
        open={!!selectedId}
        mode="edit"
        taskId={selectedId}
        projectId={id}
        projectName={project?.name}
        onClose={closeTask}
      />
    </div>
  )
}

function firstName(userOrName) {
  if (!userOrName) return ''
  const name =
    typeof userOrName === 'string' ? userOrName : userOrName.name || ''
  return name.split(' ')[0] || name
}

function TaskCard({ task, users, canManage, onOpen, onPatch }) {
  const dueInputRef = useRef(null)
  const [, setTick] = useState(0)
  const status = task.status || 'todo'
  const statusMeta = getTaskStatus(status)
  const next = nextTaskStatus(status)
  const done = status === 'done'
  const assigneeId = task.assignee?._id || task.assignee || ''
  const due = dueLabel(task.dueDate)
  const pri = PRIORITY[task.priority] || PRIORITY.medium
  const assigneeUser =
    users.find((u) => String(u._id) === String(assigneeId)) || task.assignee
  const assigneeName = firstName(assigneeUser) || 'Anyone'
  const assignedByUser = task.assignedBy || task.createdBy
  const assignedByName = firstName(assignedByUser) || '—'
  const timerRunning = !!task.timeTrackingStartedAt

  useEffect(() => {
    if (!timerRunning) return undefined
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [timerRunning])

  const trackedLabel = timerRunning
    ? formatTrackedSeconds(
        liveTrackedSeconds(task.timeSpent, task.timeTrackingStartedAt),
      )
    : Number(task.timeSpent) > 0
      ? formatTrackedSeconds(task.timeSpent)
      : null

  return (
    <div className="px-2.5 py-2 hover:bg-black/[0.02]">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onPatch({ status: next.value })}
          className="mt-0.5 shrink-0"
          title={
            status === 'todo'
              ? 'Start work — timer starts'
              : status === 'in_progress'
                ? 'Next step — timer stops'
                : `${statusMeta.shortLabel} → ${next.shortLabel}`
          }
          aria-label={`Advance status to ${next.shortLabel}`}
        >
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : status === 'in_progress' ? (
            <Circle
              className="h-4 w-4 fill-[var(--accent)]/25 text-[var(--accent)]"
              strokeWidth={2.5}
            />
          ) : status === 'review' ? (
            <Circle
              className="h-4 w-4 fill-amber-500/30 text-amber-500"
              strokeWidth={2.5}
            />
          ) : (
            <Circle className="h-4 w-4 text-secondary" />
          )}
        </button>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              onClick={onOpen}
              className={cn(
                'min-w-0 flex-1 truncate text-left text-[13px] font-semibold leading-snug text-primary hover:text-[#0d7a4f]',
                done && 'font-medium text-secondary line-through',
              )}
            >
              {task.title}
            </button>
            {trackedLabel ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-[9px] font-bold tabular-nums',
                  timerRunning
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'bg-black/[0.04] text-secondary',
                )}
                title={timerRunning ? 'Timer running' : 'Time spent'}
              >
                <Timer className="h-2.5 w-2.5" />
                {trackedLabel}
              </span>
            ) : null}
          </div>

          {/* For / By / Date — clear ownership */}
          <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
            <label
              className="relative flex min-w-0 items-center gap-1 overflow-hidden rounded-md bg-black/[0.04] px-1.5 py-1"
              title={`For: ${assigneeName}`}
            >
              <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-secondary">
                For
              </span>
              <User className="h-2.5 w-2.5 shrink-0 text-secondary" />
              <select
                value={assigneeId}
                disabled={!canManage}
                onChange={(e) =>
                  onPatch({ assignee: e.target.value || null })
                }
                className="min-w-0 flex-1 appearance-none truncate bg-transparent text-[10px] font-semibold text-primary outline-none"
              >
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name?.split(' ')[0] || u.name}
                  </option>
                ))}
              </select>
            </label>

            <div
              className="flex min-w-0 items-center gap-1 overflow-hidden rounded-md bg-black/[0.04] px-1.5 py-1"
              title={`Assigned by: ${assignedByName}`}
            >
              <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-secondary">
                By
              </span>
              <UserCheck className="h-2.5 w-2.5 shrink-0 text-secondary" />
              <span className="min-w-0 truncate text-[10px] font-semibold text-primary">
                {assignedByName}
              </span>
            </div>

            <button
              type="button"
              disabled={!canManage}
              title={due.text}
              onClick={() => openNativeDatePicker(dueInputRef.current)}
              className="relative flex min-w-0 cursor-pointer items-center gap-1 overflow-hidden rounded-md bg-black/[0.04] px-1.5 py-1 text-left disabled:cursor-not-allowed"
            >
              <span className="pointer-events-none shrink-0 text-[8px] font-bold uppercase tracking-wide text-secondary">
                Date
              </span>
              <Calendar className="pointer-events-none h-2.5 w-2.5 shrink-0 text-secondary" />
              <span
                className={cn(
                  'pointer-events-none min-w-0 flex-1 truncate text-[10px] font-semibold',
                  due.className,
                )}
              >
                {task.dueDate
                  ? format(new Date(task.dueDate), 'dd MMM')
                  : '—'}
              </span>
              <input
                ref={dueInputRef}
                type="date"
                tabIndex={-1}
                disabled={!canManage}
                value={
                  task.dueDate
                    ? format(new Date(task.dueDate), 'yyyy-MM-dd')
                    : ''
                }
                onChange={(e) =>
                  onPatch({
                    dueDate: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
                className="pointer-events-none absolute inset-0 opacity-0"
              />
            </button>

            <select
              value={task.priority || 'medium'}
              disabled={!canManage}
              onChange={(e) => onPatch({ priority: e.target.value })}
              title="Priority"
              className={cn(
                'min-w-0 truncate rounded-md px-1.5 py-1 text-[10px] font-bold outline-none',
                pri.className,
              )}
            >
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
