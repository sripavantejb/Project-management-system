import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns'
import {
  AlertCircle,
  Activity,
  CircleDot,
  Clock3,
  Flame,
  Radio,
  Search,
  UserRound,
} from 'lucide-react'
import { api, useAuthStore } from '../lib/api'
import {
  getTaskPriority,
  getTaskStatus,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../lib/taskStatus'
import { roleLabelFor } from '../lib/roles'
import { cn } from '../lib/utils'
import { PageToolbar, ToolbarPills } from '../components/layout/PageToolbar'
import {
  Avatar,
  EmptyState,
  ProgressBar,
  SkeletonCard,
  StatusChip,
} from '../components/ui'

const STATUS_FILTERS = [
  { key: 'all', label: 'All open' },
  { key: 'in_progress', label: 'Working' },
  { key: 'todo', label: 'Not started' },
  { key: 'review', label: 'Needs check' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'unassigned', label: 'Unassigned' },
]

function formatDue(value) {
  if (!value) return 'No due date'
  try {
    const d = new Date(value)
    if (isToday(d)) return 'Due today'
    if (isTomorrow(d)) return 'Due tomorrow'
    return format(d, 'd MMM')
  } catch {
    return 'No due date'
  }
}

export function LiveDashboardPage() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const [statusFilter, setStatusFilter] = useState('all')
  const [personId, setPersonId] = useState('all')
  const [q, setQ] = useState('')

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } =
    useQuery({
      queryKey: ['live-board'],
      queryFn: () => api('/tasks/live-board'),
      refetchInterval: 12_000,
      refetchOnWindowFocus: true,
    })

  const board = data?.data
  const counts = board?.counts || {}
  const team = board?.team || []
  const tasks = board?.tasks || []

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusFilter === 'in_progress' && t.status !== 'in_progress') return false
      if (statusFilter === 'todo' && t.status !== 'todo') return false
      if (statusFilter === 'review' && t.status !== 'review') return false
      if (statusFilter === 'overdue' && !t.overdue) return false
      if (statusFilter === 'urgent' && t.priority !== 'urgent') return false
      if (statusFilter === 'unassigned' && t.assignee) return false
      if (personId !== 'all') {
        if (String(t.assignee?._id || '') !== personId) return false
      }
      if (!needle) return true
      const hay = [
        t.title,
        t.project?.name,
        t.assignee?.name,
        t.assignedBy?.name,
        t.priority,
        t.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [tasks, statusFilter, personId, q])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-4 pb-10">
        <SkeletonCard className="h-16" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <SkeletonCard className="h-40" />
        <SkeletonCard className="h-96" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load live board"
        description={error?.message || 'Check your connection and try again.'}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    )
  }

  const meId = String(user?._id || '')

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1500px] space-y-4 pb-10 transition-opacity',
        isFetching && 'opacity-95',
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Live board
          </div>
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-primary">
            Live operational board
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-secondary">
            Open tasks across the team — assignee, who assigned it, and priority
            — refreshing automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-secondary">
          <Radio className="h-3.5 w-3.5 text-accent" />
          {dataUpdatedAt
            ? `Updated ${formatDistanceToNowStrict(dataUpdatedAt)} ago`
            : 'Live'}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Open tasks" value={counts.open ?? 0} icon={Activity} />
        <Kpi
          label="Working now"
          value={counts.in_progress ?? 0}
          icon={CircleDot}
          accent
        />
        <Kpi
          label="Needs check"
          value={counts.review ?? 0}
          icon={Clock3}
        />
        <Kpi
          label="Urgent"
          value={counts.urgent ?? 0}
          icon={Flame}
          danger={(counts.urgent ?? 0) > 0}
        />
        <Kpi
          label="Overdue"
          value={counts.overdue ?? 0}
          danger={(counts.overdue ?? 0) > 0}
        />
        <Kpi
          label="Unassigned"
          value={counts.unassigned ?? 0}
          icon={UserRound}
        />
      </section>

      <section className="rounded-[12px] border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13.5px] font-medium text-primary">
              Team workload
            </h2>
            <p className="mt-0.5 text-[11px] text-secondary">
              How many open tasks each person holds right now
            </p>
          </div>
          <span className="text-[12px] tabular-nums text-secondary">
            {counts.peopleWithWork ?? 0} people with open work
          </span>
        </div>

        {team.length === 0 ? (
          <p className="py-8 text-center text-sm text-secondary">
            No open project tasks yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {team.map((row) => {
              const id = String(row.user._id)
              const selected = personId === id
              const isMe = id === meId
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPersonId(selected ? 'all' : id)}
                  className={cn(
                    'rounded-[10px] border p-3 text-left transition',
                    selected
                      ? 'border-accent bg-[var(--nav-active-bg)]'
                      : 'border-border bg-canvas hover:border-accent/40',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Avatar
                      name={row.user.name}
                      src={row.user.avatar}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-primary">
                          {row.user.name}
                        </p>
                        {isMe ? (
                          <span className="rounded bg-active px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                            You
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] text-secondary">
                        {roleLabelFor(row.user.role, tenant?.customRoles)}
                        {row.user.title ? ` · ${row.user.title}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-semibold tabular-nums leading-none text-primary">
                        {row.open}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-secondary">
                        open
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar value={row.load} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                    <MiniStat
                      label="Working"
                      value={row.in_progress}
                      color={getTaskStatus('in_progress').dot}
                    />
                    <MiniStat
                      label="Queued"
                      value={row.todo}
                      color={getTaskStatus('todo').dot}
                    />
                    <MiniStat
                      label="Check"
                      value={row.review}
                      color={getTaskStatus('review').dot}
                    />
                    {(row.urgent > 0 || row.high > 0) && (
                      <MiniStat
                        label="Hot"
                        value={row.urgent + row.high}
                        color={getTaskPriority('urgent').color}
                      />
                    )}
                    {row.overdue > 0 && (
                      <MiniStat
                        label="Late"
                        value={row.overdue}
                        color="var(--status-delayed)"
                      />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <PageToolbar
        left={
          <>
            <ToolbarPills
              items={STATUS_FILTERS}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            {personId !== 'all' ? (
              <button
                type="button"
                onClick={() => setPersonId('all')}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-primary"
              >
                Clear person filter
              </button>
            ) : null}
          </>
        }
        right={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search task, person, project…"
              className="h-9 w-[220px] rounded-full border border-border bg-surface pl-8 pr-3 text-[12.5px] text-primary outline-none placeholder:text-secondary focus:border-accent sm:w-[280px]"
            />
          </div>
        }
      />

      <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[13.5px] font-medium text-primary">
              Open tasks
            </h2>
            <p className="text-[11px] text-secondary">
              Priority · assignee · who assigned · due date
            </p>
          </div>
          <span className="text-[12px] tabular-nums text-secondary">
            {filtered.length} shown
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing matches"
            description="Try another filter, or clear the person filter."
            className="py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="border-b border-border bg-canvas text-[11px] uppercase tracking-[0.06em] text-secondary">
                  <th className="px-4 py-2.5 font-medium">Priority</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Assignee</th>
                  <th className="px-4 py-2.5 font-medium">Assigned by</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const pri = getTaskPriority(t.priority)
                  const st = getTaskStatus(t.status)
                  return (
                    <tr
                      key={t._id}
                      className="border-b border-border/70 last:border-0 hover:bg-canvas/80"
                    >
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: `${pri.color}18`,
                            color: pri.color,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: pri.color }}
                          />
                          {pri.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={t.link}
                          className="block max-w-[320px] truncate text-[13px] font-medium text-primary hover:text-accent hover:underline"
                        >
                          {t.title}
                        </Link>
                        <p className="mt-0.5 truncate text-[11px] text-secondary">
                          {t.project?.name || 'Project'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip
                          status={t.status}
                          label={st.shortLabel}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {t.assignee ? (
                          <PersonCell
                            name={t.assignee.name}
                            avatar={t.assignee.avatar}
                          />
                        ) : (
                          <span className="text-[12px] text-status-delayed">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.assignedBy ? (
                          <PersonCell
                            name={t.assignedBy.name}
                            avatar={t.assignedBy.avatar}
                          />
                        ) : (
                          <span className="text-[12px] text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-[12px] tabular-nums',
                            t.overdue
                              ? 'font-semibold text-status-delayed'
                              : 'text-secondary',
                          )}
                        >
                          {formatDue(t.dueDate)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-[11px] text-secondary">
        Status legend:{' '}
        {TASK_STATUSES.filter((s) => s.value !== 'done')
          .map((s) => s.shortLabel)
          .join(' · ')}
        {' · '}
        Priority:{' '}
        {TASK_PRIORITIES.map((p) => p.label).join(' · ')}
      </p>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, accent, danger }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-secondary">
          {label}
        </p>
        {Icon ? (
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              danger
                ? 'text-status-delayed'
                : accent
                  ? 'text-accent'
                  : 'text-secondary',
            )}
          />
        ) : null}
      </div>
      <p
        className={cn(
          'mt-1.5 text-[26px] font-semibold tabular-nums tracking-tight',
          danger
            ? 'text-status-delayed'
            : accent
              ? 'text-accent'
              : 'text-primary',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-secondary ring-1 ring-border">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="tabular-nums font-semibold text-primary">{value}</span>
      {label}
    </span>
  )
}

function PersonCell({ name, avatar }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={name} src={avatar} size="xs" />
      <span className="truncate text-[12.5px] font-medium text-primary">
        {name}
      </span>
    </div>
  )
}
