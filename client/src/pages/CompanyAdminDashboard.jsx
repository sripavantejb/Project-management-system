import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  FolderKanban,
  Search,
  SunMedium,
  Wallet,
} from 'lucide-react'
import { api, useAuthStore } from '../lib/api'
import { formatInr, formatInrCompact, stageLabel } from '../lib/format'
import { EmptyState, SkeletonCard } from '../components/ui'
import { cn } from '../lib/utils'

const RANGES = [
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: '12m', label: '12 months' },
  { key: 'all', label: 'All time' },
]

const STAGE_ORDER = [
  { key: 'design', label: 'Design' },
  { key: 'planning', label: 'Planning' },
  { key: 'procurement', label: 'Buying' },
  { key: 'execution', label: 'Site' },
  { key: 'handover', label: 'Handover' },
]

function formatShortDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return '—'
  }
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function statusTone(row) {
  if (row.isDelayed || row.status === 'delayed') return 'delayed'
  if (row.status === 'completed') return 'completed'
  if (row.status === 'on_hold') return 'on_hold'
  return 'in_progress'
}

const STATUS_META = {
  in_progress: { label: 'In progress', dot: '#a27b5c' },
  completed: { label: 'Completed', dot: '#2d5a46' },
  delayed: { label: 'Delayed', dot: '#9e3b3b' },
  on_hold: { label: 'On hold', dot: '#c4823f' },
}

export function CompanyAdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const [range, setRange] = useState('30d')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['company-admin-dashboard', range],
    queryFn: () => api(`/company-admin/dashboard?range=${range}`),
  })

  const d = data?.data
  const kpis = d?.kpis
  const budget = d?.budget
  const timeline = d?.timeline || []
  const firstName = user?.name?.split(' ')[0] || 'there'

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(STAGE_ORDER.map((s) => [s.key, 0]))
    for (const row of timeline) {
      if (counts[row.currentStage] != null) counts[row.currentStage] += 1
    }
    return counts
  }, [timeline])

  const bars = useMemo(() => {
    const rows = (budget?.projects || []).slice(0, 6)
    const max = Math.max(
      1,
      ...rows.flatMap((row) => [Number(row.budget) || 0, Number(row.spent) || 0]),
    )
    return rows.map((row) => ({
      ...row,
      budgetH: Math.max(6, Math.round(((Number(row.budget) || 0) / max) * 100)),
      spentH: Math.max(4, Math.round(((Number(row.spent) || 0) / max) * 100)),
    }))
  }, [budget?.projects])

  const spotlight = useMemo(() => {
    const byBudget = [...timeline].sort((a, b) => (b.budget || 0) - (a.budget || 0))
    const attention =
      timeline.find((row) => row.isDelayed || row.status === 'delayed') ||
      [...timeline].sort((a, b) => (b.progress || 0) - (a.progress || 0))[0]
    return {
      lead: byBudget[0] || null,
      focus: attention && attention.id !== byBudget[0]?.id ? attention : byBudget[1] || null,
    }
  }, [timeline])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return timeline.filter((row) => {
      const tone = statusTone(row)
      if (statusFilter !== 'all' && tone !== statusFilter) return false
      if (!q) return true
      return `${row.name} ${row.clientName || ''}`.toLowerCase().includes(q)
    })
  }, [timeline, query, statusFilter])

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-[1440px] gap-4 lg:grid-cols-12">
        <SkeletonCard className="h-80 lg:col-span-5" />
        <SkeletonCard className="h-80 lg:col-span-3" />
        <SkeletonCard className="h-80 lg:col-span-4" />
        <SkeletonCard className="h-72 lg:col-span-12" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Could not load company dashboard"
        description={error?.message || 'Try again in a moment.'}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    )
  }

  const utilization = Number(kpis?.budgetUtilization) || 0
  const spendPct = Math.min(100, Math.max(0, utilization))
  const pipeline = kpis?.pipelineValue || 0
  const vendorTotal = (d?.topVendors || []).reduce((sum, vendor) => sum + (vendor.value || 0), 0)

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1440px] space-y-4 pb-8 transition-opacity',
        isFetching && 'opacity-80',
      )}
    >
      <header className="flex flex-col gap-4 px-1 pt-1 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bronze)_22%,var(--bg-surface))] text-[var(--bronze)]">
            <SunMedium className="h-4 w-4" />
          </span>
          <div>
            <h1 className="font-display text-[28px] font-medium leading-none tracking-[-0.03em] text-primary sm:text-[34px]">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-2 max-w-md text-[13.5px] text-secondary">
              Stay on top of the studio — budget, pipeline, and the projects moving today.
            </p>
          </div>
        </div>
        <div className="flex w-fit items-center gap-1 rounded-full bg-surface p-1 shadow-[0_10px_30px_-18px_rgba(30,32,34,0.45)]">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition',
                range === item.key
                  ? 'bg-[var(--create-bg)] text-[var(--create-fg)]'
                  : 'text-secondary hover:bg-surface-raised hover:text-primary',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.9fr)_minmax(280px,1fr)]">
        <section className="flex flex-col gap-4">
          <article className="rounded-[28px] bg-surface p-5 shadow-[0_24px_50px_-36px_rgba(30,32,34,0.55)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-secondary">Studio budget</p>
              <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-secondary">
                {d?.rangeLabel}
              </span>
            </div>
            <p
              className="mt-3 font-display text-[40px] font-medium leading-none tracking-[-0.04em] text-primary sm:text-[46px]"
              title={formatInr(kpis?.totalBudget || 0)}
            >
              {formatInrCompact(kpis?.totalBudget || 0)}
            </p>
            <p className="mt-3 text-[13px] text-emerald-700">
              {spendPct.toFixed(spendPct % 1 ? 1 : 0)}% of the budget is already in motion
              {kpis?.projectDelta != null
                ? ` · ${kpis.projectDelta >= 0 ? '+' : ''}${kpis.projectDelta} projects this period`
                : ''}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/finance"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--create-bg)] px-4 py-2.5 text-[13px] font-semibold text-[var(--create-fg)]"
              >
                <Wallet className="h-3.5 w-3.5" />
                Open revenue
              </Link>
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 rounded-full bg-surface-raised px-4 py-2.5 text-[13px] font-semibold text-primary"
              >
                All projects
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-5 rounded-[22px] bg-surface-raised p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-medium text-primary">
                  Stages <span className="font-normal text-secondary">· {timeline.length} projects</span>
                </p>
                <Link to="/portfolio" className="text-[12px] font-medium text-[var(--bronze)]">
                  Portfolio
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STAGE_ORDER.map((stage) => (
                  <div key={stage.key} className="rounded-[16px] bg-surface px-3 py-2.5">
                    <p className="text-[11px] text-secondary">{stage.label}</p>
                    <p className="mt-1 font-display text-[20px] font-medium leading-none text-primary">
                      {stageCounts[stage.key] || 0}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="font-medium text-primary">Budget used</span>
                <span className="tabular-nums text-secondary">
                  {formatInrCompact(kpis?.totalSpent || 0)} of {formatInrCompact(kpis?.totalBudget || 0)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-[var(--bronze)]"
                  style={{ width: `${spendPct}%` }}
                />
              </div>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-2">
            <ProjectPass project={spotlight.lead} tone="ink" empty="No projects yet" />
            <ProjectPass project={spotlight.focus} tone="bronze" empty="Nothing else in motion" />
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid shrink-0 grid-cols-2 gap-3">
            <MetricTile
              featured
              label="Pipeline"
              value={formatInrCompact(pipeline)}
              title={formatInr(pipeline)}
              hint={`${kpis?.activeLeads ?? 0} open enquiries`}
              delta={
                range !== 'all' && kpis?.leadsInRange
                  ? `${kpis.leadsInRange} new`
                  : null
              }
              to="/leads"
            />
            <MetricTile
              label="Spent"
              value={formatInrCompact(kpis?.totalSpent || 0)}
              title={formatInr(kpis?.totalSpent || 0)}
              hint={
                budget?.spendDelta != null
                  ? `${budget.spendDelta >= 0 ? '+' : ''}${budget.spendDelta}% vs prior`
                  : 'Approved spend'
              }
              to="/finance"
            />
            <MetricTile
              label="Quotes"
              value={String(kpis?.approvedBoqs ?? 0)}
              hint={`${kpis?.totalBoqs ?? 0} sheets in the studio`}
              to="/boq"
            />
            <MetricTile
              label="Committed"
              value={formatInrCompact(budget?.committedAmount || 0)}
              title={formatInr(budget?.committedAmount || 0)}
              hint="Raised on purchase orders"
              to="/procurement"
            />
          </div>
          <StudioSpread
            total={kpis?.totalProjects ?? timeline.length}
            delayed={d?.projectCounts?.delayed ?? 0}
            finished={d?.projectCounts?.completed ?? 0}
            segments={d?.statusOverview || []}
          />
        </section>

        <section className="flex flex-col gap-4 self-start">
          <article className="rounded-[28px] bg-surface p-5 shadow-[0_24px_50px_-36px_rgba(30,32,34,0.55)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-[20px] font-medium tracking-[-0.03em] text-primary">
                  Budget and spend
                </h2>
                <p className="mt-1 text-[12.5px] text-secondary">
                  The busiest projects in this view
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--bronze)]" />
                  Budget
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--shell-text-strong)]" />
                  Spend
                </span>
              </div>
            </div>
            {bars.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-secondary">
                No budget rows yet
              </p>
            ) : (
              <div className="mt-6 flex h-44 items-end gap-3">
                {bars.map((row) => (
                  <div key={row.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div
                        className="w-[38%] max-w-4 rounded-t-full bg-[color-mix(in_srgb,var(--bronze)_45%,var(--bg-surface))]"
                        style={{ height: `${row.budgetH}%` }}
                        title={`Budget ${formatInr(row.budget)}`}
                      />
                      <div
                        className="w-[38%] max-w-4 rounded-t-full bg-[var(--shell-text-strong)]"
                        style={{ height: `${row.spentH}%` }}
                        title={`Spend ${formatInr(row.spent)}`}
                      />
                    </div>
                    <p className="w-full truncate text-center text-[10px] text-secondary">
                      {String(row.name || '').split(' ')[0]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-[28px] bg-surface p-5 shadow-[0_24px_50px_-36px_rgba(30,32,34,0.45)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-medium text-primary">Materials</h2>
              <Link to="/procurement" className="text-[12px] font-medium text-[var(--bronze)]">
                Open
              </Link>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="font-display text-[28px] font-medium leading-none text-primary">
                {d?.materials?.coveragePct != null ? `${d.materials.coveragePct}%` : '0%'}
              </p>
              <p className="text-right text-[12px] text-secondary">
                {d?.materials?.poLines ?? 0} PO lines
                <br />
                {d?.materials?.approvedBoqLines ?? 0} quote lines
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-[var(--shell-text-strong)]"
                style={{ width: `${Math.min(100, d?.materials?.coveragePct || 0)}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(d?.materials?.poStatus || [])
                .filter((row) => row.value > 0)
                .map((row) => (
                  <span
                    key={row.key}
                    className="rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-secondary"
                  >
                    {row.label} · {row.value}
                  </span>
                ))}
              {!(d?.materials?.poStatus || []).some((row) => row.value > 0) && (
                <span className="text-[12px] text-muted">No purchase orders in this range</span>
              )}
            </div>
            <ul className="mt-4 space-y-2">
              {(d?.topVendors || []).slice(0, 6).map((vendor) => (
                <li key={vendor.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="truncate text-primary">{vendor.name}</span>
                  <span className="shrink-0 tabular-nums text-secondary" title={formatInr(vendor.value)}>
                    {formatInrCompact(vendor.value)}
                  </span>
                </li>
              ))}
              {!d?.topVendors?.length && (
                <li className="text-[13px] text-secondary">No vendor spend in this range</li>
              )}
            </ul>
            {vendorTotal > 0 && (
              <p className="mt-3 text-[11px] text-muted">
                {formatInrCompact(vendorTotal)} across the top vendors
              </p>
            )}
          </article>
        </section>
      </div>

      <section className="rounded-[28px] bg-surface p-4 shadow-[0_24px_50px_-36px_rgba(30,32,34,0.5)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[22px] font-medium tracking-[-0.03em] text-primary">
              Schedule
            </h2>
            <p className="text-[12.5px] text-secondary">Every project on one timeline</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-full bg-surface-raised px-3 text-secondary">
              <Search className="h-3.5 w-3.5" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-28 bg-transparent text-[13px] text-primary outline-none placeholder:text-muted sm:w-40"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-full bg-surface-raised px-3 text-[13px] text-primary outline-none"
            >
              <option value="all">All statuses</option>
              <option value="in_progress">In progress</option>
              <option value="delayed">Delayed</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <StudioGantt rows={rows} />
      </section>
    </div>
  )
}

function dayStart(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(value, days) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

function startOfMonth(value) {
  const date = dayStart(value)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function place(date, min, max) {
  const span = max.getTime() - min.getTime() || 1
  return Math.min(100, Math.max(0, ((date.getTime() - min.getTime()) / span) * 100))
}

function StudioSpread({ total, delayed, finished, segments }) {
  const rows = (segments || []).filter((seg) => seg.key !== 'empty')
  const sum = rows.reduce((count, seg) => count + (seg.value || 0), 0) || 1
  return (
    <article className="flex min-h-[220px] flex-1 flex-col rounded-[28px] bg-surface p-5 shadow-[0_24px_50px_-36px_rgba(30,32,34,0.5)]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[20px] font-medium tracking-[-0.03em] text-primary">
            Across the studio
          </h2>
          <p className="mt-1 text-[12.5px] text-secondary">
            {delayed} delayed · {finished} finished
          </p>
        </div>
        <p className="font-display text-[36px] font-medium leading-none tracking-[-0.04em] text-primary">
          {total}
        </p>
      </div>
      <div className="mt-5 flex flex-1 flex-col justify-evenly gap-4">
        {rows.length === 0 && (
          <p className="text-[13px] text-secondary">No projects in this view yet.</p>
        )}
        {rows.map((seg) => {
          const pct = Math.round(((seg.value || 0) / sum) * 100)
          return (
            <div key={seg.key}>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="inline-flex items-center gap-2 font-medium text-primary">
                  <span className="h-2 w-2 rounded-full" style={{ background: seg.color }} />
                  {seg.label}
                </span>
                <span className="tabular-nums text-secondary">
                  {seg.value} · {pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: seg.color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

const BAR_COLOR = {
  in_progress: '#a27b5c',
  delayed: '#9e3b3b',
  on_hold: '#c4823f',
  completed: '#2d5a46',
}

function StudioGantt({ rows }) {
  const now = dayStart(new Date())
  const dated = rows.filter((row) => row.startDate || row.endDate)
  const minDate = dated.length
    ? dayStart(Math.min(...dated.map((row) => new Date(row.startDate || row.endDate))))
    : addDays(now, -21)
  const maxDate = dated.length
    ? dayStart(Math.max(...dated.map((row) => new Date(row.endDate || row.startDate))))
    : addDays(now, 70)
  const paddedMin = addDays(minDate > now ? addDays(now, -7) : minDate, -5)
  const paddedMax = addDays(maxDate < now ? addDays(now, 14) : maxDate, 8)
  // Start and end on month boundaries. Otherwise January is clamped to the
  // left edge and February, a few days later, is drawn on top of it.
  const min = startOfMonth(paddedMin)
  const max = new Date(paddedMax.getFullYear(), paddedMax.getMonth() + 1, 1)
  const months = []
  const cursor = new Date(min)
  while (cursor < max) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const today = place(now, min, max)

  if (!rows.length) {
    return (
      <p className="px-3 py-10 text-center text-[13px] text-secondary">
        No projects match this view
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 240 + months.length * 72 }}>
        <div className="grid grid-cols-[200px_1fr] items-end pb-2 sm:grid-cols-[240px_1fr]">
          <span className="px-2 text-[11px] font-medium text-muted">Project</span>
          <div className="relative h-6">
            {months.map((month, index) => {
              const left = place(month, min, max)
              const next = months[index + 1]
              const nextLeft = next ? place(next, min, max) : 100
              if (nextLeft - left < 4) return null
              return (
                <span
                  key={month.toISOString()}
                  className="absolute top-0 whitespace-nowrap text-[11px] font-medium text-muted"
                  style={{ left: `${left}%` }}
                >
                  {month.toLocaleDateString('en-IN', { month: 'short' })}
                </span>
              )
            })}
          </div>
        </div>
        <ul>
          {rows.map((row) => {
            const tone = statusTone(row)
            const meta = STATUS_META[tone]
            const start = row.startDate ? dayStart(row.startDate) : null
            const end = row.endDate ? dayStart(row.endDate) : null
            const left = start ? place(start, min, max) : today
            const right = end ? place(end < (start || end) ? addDays(start || end, 14) : end, min, max) : Math.min(100, left + 6)
            const width = Math.max(end && start ? 1.2 : 6, right - left)
            return (
              <li
                key={row.id}
                className="grid grid-cols-[200px_1fr] items-center border-t border-border py-2 sm:grid-cols-[240px_1fr]"
              >
                <Link to={`/projects/${row.id}/overview`} className="min-w-0 px-2">
                  <p className="truncate text-[13.5px] font-medium text-primary">{row.name}</p>
                  <p className="truncate text-[11px] text-muted">
                    {row.clientName || stageLabel(row.currentStage)}
                  </p>
                </Link>
                <div className="relative h-9">
                  {months.map((month) => (
                    <span
                      key={month.toISOString()}
                      className="absolute inset-y-0 w-px bg-surface-raised"
                      style={{ left: `${place(month, min, max)}%` }}
                    />
                  ))}
                  <span
                    className="absolute inset-y-0 z-[1] w-px bg-primary/30"
                    style={{ left: `${today}%` }}
                  />
                  {!start && !end ? (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted">
                      No dates yet
                    </span>
                  ) : (
                    <span
                      className="absolute top-1/2 z-[2] h-3.5 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: BAR_COLOR[tone] || '#a27b5c',
                      }}
                      title={`${meta.label}${start ? ` · ${formatShortDate(row.startDate)}` : ''}${end ? ` – ${formatShortDate(row.endDate)}` : ''}`}
                    >
                      <span
                        className="block h-full rounded-full bg-black/15"
                        style={{ width: `${Math.min(100, row.progress || 0)}%` }}
                      />
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function MetricTile({ featured, tone, label, value, title, hint, delta, to }) {
  const wash =
    tone === 'warn'
      ? 'bg-[color-mix(in_srgb,#9e3b3b_14%,var(--bg-surface))]'
      : tone === 'sage'
        ? 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg-surface))]'
        : 'bg-surface shadow-[0_24px_50px_-36px_rgba(30,32,34,0.5)]'
  return (
    <Link
      to={to}
      title={title}
      className={cn(
        'flex h-fit flex-col self-start rounded-[22px] px-4 py-3.5 transition hover:-translate-y-0.5',
        featured
          ? 'bg-[var(--bronze)] text-[#faf9f7] shadow-[0_18px_40px_-24px_rgba(122,87,59,0.8)]'
          : wash,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-[13px] font-medium', featured ? 'text-[#faf9f7]/90' : 'text-secondary')}>{label}</p>
        {delta && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={
              featured
                ? { background: 'rgba(255,255,255,0.18)' }
                : { background: 'color-mix(in srgb, var(--bronze) 22%, var(--bg-surface))', color: 'var(--bronze)' }
            }
          >
            {delta}
          </span>
        )}
      </div>
      <p className={cn(
        'mt-3 font-display text-[24px] font-medium leading-none tracking-[-0.04em] sm:text-[26px]',
        featured ? '' : tone === 'warn' ? 'text-[#9e3b3b]' : 'text-primary',
      )}>
        {value}
      </p>
      <p className={cn('mt-1.5 text-[12px]', featured ? 'opacity-80' : 'text-muted')}>{hint}</p>
    </Link>
  )
}

function ProjectPass({ project, tone, empty }) {
  const ink = tone === 'ink'
  if (!project) {
    return (
      <div className="flex min-h-[132px] items-center justify-center rounded-[24px] bg-surface px-4 text-[13px] text-muted shadow-[0_24px_50px_-36px_rgba(30,32,34,0.45)]">
        {empty}
      </div>
    )
  }
  return (
    <Link
      to={`/projects/${project.id}/overview`}
      className={cn(
        'flex min-h-[132px] flex-col justify-between rounded-[24px] p-4',
        ink ? 'bg-[var(--shell-text-strong)] text-[var(--bg-canvas)]' : 'bg-[var(--bronze)] text-[#faf9f7]',
      )}
    >
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.12em] opacity-70">
        <span>{ink ? 'Largest' : project.isDelayed ? 'Needs a look' : 'In motion'}</span>
        <span>{project.progress || 0}%</span>
      </div>
      <div>
        <p className="truncate font-display text-[18px] font-medium tracking-[-0.03em]">
          {project.name}
        </p>
        <p className="mt-1 truncate text-[12px] opacity-75">
          {project.clientName || stageLabel(project.currentStage)} · {formatInrCompact(project.budget)}
        </p>
      </div>
    </Link>
  )
}
