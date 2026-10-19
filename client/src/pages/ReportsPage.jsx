import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CheckSquare,
  Clock3,
  Download,
  FolderKanban,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { api } from '../lib/api'
import { formatInr, stageLabel } from '../lib/format'
import {
  PageToolbar,
  ToolbarPills,
} from '../components/layout/PageToolbar'
import {
  Avatar,
  Button,
  EmptyState,
  Input,
  SkeletonCard,
} from '../components/ui'
import { cn } from '../lib/utils'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'people', label: 'People' },
  { key: 'projects', label: 'Projects' },
]

const PEOPLE_SORT = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'open', label: 'Open' },
  { key: 'rate', label: 'Completion' },
]

const PROJECT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'risk', label: 'At risk' },
  { key: 'ontrack', label: 'On track' },
]

const CHART_TOOLTIP = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  boxShadow: 'none',
  fontSize: 12,
}

function roleLabel(role) {
  return String(role || 'member')
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export function ReportsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api('/reports/overview'),
  })
  const [tab, setTab] = useState('overview')
  const [query, setQuery] = useState('')
  const [askedQuery, setAskedQuery] = useState('')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [peopleSort, setPeopleSort] = useState('overdue')
  const [projectSearch, setProjectSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')

  const d = data?.data

  const answer = useMemo(() => {
    if (!askedQuery.trim() || !d) return null
    const q = askedQuery.toLowerCase()
    if (q.includes('risk') || q.includes('delay')) {
      return `${d.health.delayed} project(s) are delayed. On-time rate is ${d.health.onTimePct}%.`
    }
    if (q.includes('pipeline') || q.includes('crm')) {
      return `Open CRM pipeline value is ${formatInr(d.crmPipelineValue)}.`
    }
    if (q.includes('budget') || q.includes('variance')) {
      return `Portfolio budget variance (quoted − spent) is ${formatInr(d.budgetVariance)}.`
    }
    if (q.includes('team')) {
      const top = [...(d.teamPerf || [])].sort((a, b) => b.done - a.done)[0]
      return top
        ? `${top.user.name} leads completions with ${top.done} done, ${top.open} open, and a ${top.completionRate}% completion rate.`
        : 'No team data.'
    }
    if (q.includes('overdue')) {
      const people = [...(d.teamPerf || [])]
        .filter((person) => person.overdue > 0)
        .sort((a, b) => b.overdue - a.overdue)
      return people.length
        ? `${people[0].user.name} has the highest overdue workload (${people[0].overdue}). ${d.taskCompletion.overdue} tasks are overdue company-wide.`
        : 'There are no overdue assigned tasks.'
    }
    return 'Try: “which projects are at risk”, “pipeline value”, “budget variance”, or “team performance”.'
  }, [askedQuery, d])

  const stageChart = (d?.leadStages || []).map((s) => ({
    name: stageLabel(s.stage).split(' ')[0],
    count: s.count,
  }))

  const taskChart = (d?.taskStatus || []).map((item) => ({
    name:
      {
        todo: 'To do',
        in_progress: 'In progress',
        review: 'Review',
        done: 'Done',
      }[item.status] || item.status,
    count: item.count,
  }))

  const roles = useMemo(
    () => [...new Set((d?.teamPerf || []).map(({ user }) => user.role))].sort(),
    [d?.teamPerf],
  )

  const people = useMemo(() => {
    const term = peopleSearch.trim().toLowerCase()
    return [...(d?.teamPerf || [])]
      .filter(({ user }) => {
        const matchesRole = roleFilter === 'all' || user.role === roleFilter
        const matchesSearch =
          !term ||
          [user.name, user.title, user.role]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term))
        return matchesRole && matchesSearch
      })
      .sort((a, b) => {
        if (peopleSort === 'open') return b.open - a.open || b.overdue - a.overdue
        if (peopleSort === 'rate') {
          return b.completionRate - a.completionRate || b.done - a.done
        }
        return b.overdue - a.overdue || b.open - a.open
      })
  }, [d?.teamPerf, peopleSearch, roleFilter, peopleSort])

  const projects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase()
    return [...(d?.projectHealth || [])]
      .filter((p) => {
        if (projectFilter === 'risk' && !(p.isDelayed || p.overdue > 0)) {
          return false
        }
        if (projectFilter === 'ontrack' && (p.isDelayed || p.overdue > 0)) {
          return false
        }
        if (!term) return true
        return String(p.name || '')
          .toLowerCase()
          .includes(term)
      })
      .slice(0, projectSearch.trim() || projectFilter !== 'all' ? 80 : 24)
  }, [d?.projectHealth, projectSearch, projectFilter])

  const completionPct = d?.taskCompletion?.total
    ? Math.round((d.taskCompletion.done / d.taskCompletion.total) * 100)
    : 0

  const exportPeople = () => {
    if (!people.length) return
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      [
        'Name',
        'Role',
        'Status',
        'Assigned',
        'Done',
        'Open',
        'In progress',
        'Review',
        'Overdue',
        'Completion %',
        'Tracked hours',
      ],
      ...people.map((person) => [
        person.user.name,
        person.user.role,
        person.user.isActive === false ? 'Inactive' : 'Active',
        person.total,
        person.done,
        person.open,
        person.inProgress,
        person.review,
        person.overdue,
        person.completionRate,
        person.trackedHours,
      ]),
    ]
    const blob = new Blob(
      [rows.map((row) => row.map(escape).join(',')).join('\n')],
      { type: 'text/csv;charset=utf-8' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `team-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <SkeletonCard className="h-12" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="rounded-2xl bg-white px-8 py-10 text-center ring-1 ring-black/[0.06]">
          <AlertTriangle className="mx-auto h-7 w-7 text-red-500" />
          <h2 className="mt-3 text-lg font-semibold text-primary">
            Reports could not be loaded
          </h2>
          <Button className="mt-4" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-12">
      <PageToolbar
        left={<ToolbarPills items={TABS} value={tab} onChange={setTab} />}
        right={
          <>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 text-[12px] font-semibold text-secondary transition hover:bg-[#ebebed] hover:text-primary disabled:opacity-50"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
              />
              Refresh
            </button>
            {tab === 'people' && (
              <Button onClick={exportPeople} disabled={!people.length}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            )}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="On-time"
          value={`${d?.health?.onTimePct ?? 0}%`}
          hint={`${d?.health?.total ?? 0} projects`}
          progress={d?.health?.onTimePct ?? 0}
        />
        <Kpi
          icon={CheckSquare}
          label="Tasks done"
          value={`${completionPct}%`}
          hint={`${d?.taskCompletion?.done ?? 0} of ${d?.taskCompletion?.total ?? 0}`}
          progress={completionPct}
        />
        <Kpi
          icon={Users}
          label="Workforce"
          value={(d?.teamPerf || []).filter((p) => p.user.isActive !== false)
            .length}
          hint={`${d?.taskCompletion?.overdue ?? 0} overdue tasks`}
        />
        <Kpi
          icon={FolderKanban}
          label="Budget variance"
          value={formatInr(d?.budgetVariance)}
          hint={`Pipeline ${formatInr(d?.crmPipelineValue)}`}
        />
      </section>

      {tab === 'overview' && (
        <>
          <section className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.04] sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f7] text-[#1d1d1f]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                  Ask reports
                </h3>
                <p className="text-[12px] text-[#86868b]">
                  Risk, workload, pipeline, or budgets
                </p>
              </div>
            </div>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                setAskedQuery(query.trim())
              }}
            >
              <Input
                className="h-10 rounded-xl border-black/[0.08] bg-[#fbfbfd]"
                placeholder='e.g. "which projects are at risk"'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" disabled={!query.trim()}>
                Ask
              </Button>
            </form>
            {answer && (
              <p className="mt-3 rounded-xl bg-[#f5f5f7] px-4 py-3 text-[13px] leading-relaxed text-[#1d1d1f]/90">
                {answer}
              </p>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Task distribution"
              subtitle={`${d?.taskCompletion?.unassigned ?? 0} unassigned`}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={taskChart}
                    margin={{ top: 8, right: 8, left: -18 }}
                  >
                    <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="#86868b" fontSize={11} />
                    <YAxis
                      stroke="#86868b"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel
              title="CRM pipeline"
              subtitle={`${formatInr(d?.crmPipelineValue)} open value`}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stageChart}
                    margin={{ top: 8, right: 8, left: -18 }}
                  >
                    <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="#86868b" fontSize={11} />
                    <YAxis
                      stroke="#86868b"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                    <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat
              icon={AlertTriangle}
              label="Delayed projects"
              value={d?.health?.delayed ?? 0}
            />
            <MiniStat
              icon={Clock3}
              label="POs in transit"
              value={d?.vendorPerformance?.inTransit ?? 0}
            />
            <MiniStat
              icon={Receipt}
              label="Delivered POs"
              value={`${d?.vendorPerformance?.delivered ?? 0} / ${d?.vendorPerformance?.totalPOs ?? 0}`}
            />
          </div>
        </>
      )}

      {tab === 'people' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868b]" />
              <input
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
                placeholder="Search people…"
                className="h-9 w-[200px] rounded-full border-0 bg-[#f5f5f7] pl-8 pr-3 text-[12px] outline-none ring-1 ring-black/[0.04] focus:bg-white focus:ring-[var(--accent)]/40"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-full border-0 bg-[#f5f5f7] px-3 text-[12px] font-medium text-secondary outline-none ring-1 ring-black/[0.04]"
            >
              <option value="all">All roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
            <ToolbarPills
              items={PEOPLE_SORT}
              value={peopleSort}
              onChange={setPeopleSort}
            />
          </div>

          {!people.length ? (
            <div className="rounded-2xl bg-white py-2 ring-1 ring-black/[0.04]">
              <EmptyState
                icon={Users}
                title="No people match"
                description="Try another search or role filter."
              />
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] divide-y divide-black/[0.04]">
              {people.map((person) => (
                <li
                  key={person.user._id}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar
                      src={person.user.avatar}
                      name={person.user.name}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[#1d1d1f]">
                        {person.user.name}
                      </p>
                      <p className="truncate text-[12px] text-[#86868b]">
                        {person.user.title || roleLabel(person.user.role)}
                        {person.user.isActive === false ? ' · Inactive' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center sm:w-[280px]">
                    <StatChip label="Done" value={person.done} />
                    <StatChip label="Open" value={person.open} />
                    <StatChip
                      label="Overdue"
                      value={person.overdue}
                      danger={person.overdue > 0}
                    />
                    <StatChip label="Hrs" value={person.trackedHours} />
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-36">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f5f5f7]">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          person.completionRate >= 75
                            ? 'bg-emerald-500'
                            : person.completionRate >= 40
                              ? 'bg-[var(--accent)]'
                              : 'bg-amber-400',
                        )}
                        style={{ width: `${person.completionRate}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-[#6e6e73]">
                      {person.completionRate}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'projects' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarPills
              items={PROJECT_FILTERS}
              value={projectFilter}
              onChange={setProjectFilter}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868b]" />
              <input
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-9 w-[220px] rounded-full border-0 bg-[#f5f5f7] pl-8 pr-3 text-[12px] outline-none ring-1 ring-black/[0.04] focus:bg-white focus:ring-[var(--accent)]/40"
              />
            </div>
            <span className="text-[11px] text-[#86868b]">
              {(d?.projectHealth || []).length} total
              {!projectSearch && projectFilter === 'all'
                ? ' · showing top 24'
                : ` · ${projects.length} shown`}
            </span>
          </div>

          {!projects.length ? (
            <div className="rounded-2xl bg-white py-2 ring-1 ring-black/[0.04]">
              <EmptyState
                icon={FolderKanban}
                title="No projects match"
                description="Type a name or switch filters — we never dump 100 cards at once."
              />
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <li
                  key={project._id}
                  className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.05] transition hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/projects/${project._id}`}
                        className="truncate text-[14px] font-semibold text-[#1d1d1f] hover:text-[#0071e3]"
                      >
                        {project.name}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-[#86868b]">
                        {project.done}/{project.totalTasks} tasks done
                      </p>
                    </div>
                    {project.overdue > 0 || project.isDelayed ? (
                      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        {project.overdue > 0
                          ? `${project.overdue} overdue`
                          : 'Delayed'}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        On track
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f5f5f7]">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          project.isDelayed || project.overdue > 0
                            ? 'bg-red-400'
                            : 'bg-[var(--accent)]',
                        )}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-[#6e6e73]">
                      {project.progress}%
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-[#86868b]">
                    <span>Budget {formatInr(project.budget)}</span>
                    <span>Spent {formatInr(project.spent)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, hint, progress }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/[0.04] transition hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
          {label}
        </p>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-[#1d1d1f]">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-[#86868b]">{hint}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#f5f5f7]">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05]">
      <div className="border-b border-black/[0.04] px-4 py-3 sm:px-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-[12px] text-[#86868b]">{subtitle}</p>
        )}
      </div>
      <div className="px-3 pb-3 pt-2 sm:px-4">{children}</div>
    </section>
  )
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-black/[0.04]">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f7]">
        <Icon className="h-4 w-4 text-[#1d1d1f]" />
      </span>
      <div>
        <p className="text-[11px] text-[#86868b]">{label}</p>
        <p className="text-[16px] font-semibold tabular-nums text-[#1d1d1f]">
          {value}
        </p>
      </div>
    </div>
  )
}

function StatChip({ label, value, danger }) {
  return (
    <div>
      <p className="text-[10px] text-[#86868b]">{label}</p>
      <p
        className={cn(
          'text-[13px] font-semibold tabular-nums',
          danger ? 'text-red-600' : 'text-[#1d1d1f]',
        )}
      >
        {value}
      </p>
    </div>
  )
}
