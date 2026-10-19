import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  ClipboardList,
  FolderKanban,
  Percent,
  Truck,
  Wallet,
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  Store,
} from 'lucide-react'
import { api } from '../lib/api'
import { formatInr, formatInrCompact, stageLabel } from '../lib/format'
import {
  PageToolbar,
  ToolbarLink,
  ToolbarPills,
} from '../components/layout/PageToolbar'
import {
  Avatar,
  EmptyState,
  ProgressBar,
  SkeletonCard,
  StatusChip,
} from '../components/ui'
import { cn } from '../lib/utils'

const RANGES = [
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: '12m', label: '12 months' },
  { key: 'all', label: 'All time' },
]

function formatShortDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function relativeTime(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function statusTone(row) {
  if (row.isDelayed || row.status === 'delayed') return 'delayed'
  if (row.status === 'completed') return 'completed'
  if (row.status === 'on_hold') return 'on_hold'
  return 'in_progress'
}

export function CompanyAdminDashboard() {
  const [range, setRange] = useState('30d')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['company-admin-dashboard', range],
    queryFn: () => api(`/company-admin/dashboard?range=${range}`),
  })

  const d = data?.data
  const kpis = d?.kpis
  const budget = d?.budget

  const projectTrend = useMemo(() => {
    if (kpis?.projectDelta == null) return null
    const up = kpis.projectDelta >= 0
    return {
      label: `${up ? '+' : ''}${kpis.projectDelta}`,
      up,
    }
  }, [kpis?.projectDelta])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-20" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load company dashboard"
        description={error?.message || 'Try again in a moment.'}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    )
  }

  const utilization =
    kpis?.budgetUtilization != null ? `${kpis.budgetUtilization}%` : '—'
  const statusSegments = d?.statusOverview?.length
    ? d.statusOverview
    : [{ key: 'empty', label: 'No projects', value: 1, color: 'var(--border-subtle)' }]
  const statusTotal =
    statusSegments.reduce((s, seg) => s + (seg.value || 0), 0) || 1
  const delayedSegment = statusSegments.find((seg) =>
    String(seg.key || seg.label)
      .toLowerCase()
      .includes('delay'),
  )

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1500px] space-y-4 pb-10 transition-opacity',
        isFetching && 'opacity-90',
      )}
    >
      <PageToolbar
        left={<ToolbarLink to="/projects">All projects</ToolbarLink>}
        right={
          <>
            <ToolbarPills items={RANGES} value={range} onChange={setRange} />
            {d?.rangeLabel ? (
              <span className="text-[12px] text-secondary">{d.rangeLabel}</span>
            ) : null}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          to="/projects"
          icon={FolderKanban}
          tone="emerald"
          label="Total projects"
          value={kpis?.totalProjects ?? 0}
          delta={projectTrend}
          foot={
            <span className="inline-flex items-center gap-1 font-medium text-accent">
              View projects <ArrowUpRight className="h-3 w-3" />
            </span>
          }
        />
        <StatCard
          to="/leads"
          icon={TrendingUp}
          tone="emerald"
          label="Active leads"
          value={kpis?.activeLeads ?? 0}
          foot={`Pipeline ${formatInrCompact(kpis?.pipelineValue || 0)}${
            range !== 'all' && kpis?.leadsInRange != null
              ? ` · ${kpis.leadsInRange} in period`
              : ''
          }`}
          footTitle={`Pipeline ${formatInr(kpis?.pipelineValue || 0)}`}
        />
        <StatCard
          to="/boq"
          icon={ClipboardList}
          tone="emerald"
          label="BOQs / quotes"
          value={kpis?.totalBoqs ?? 0}
          foot={`${kpis?.approvedBoqs ?? 0} approved${
            range !== 'all' && kpis?.boqsInRange != null
              ? ` · ${kpis.boqsInRange} in period`
              : ''
          }`}
        />
        <StatCard
          to="/finance"
          icon={Wallet}
          tone="emerald"
          label="Budget utilization"
          value={utilization}
          foot={`${formatInrCompact(kpis?.totalSpent || 0)} of ${formatInrCompact(
            kpis?.totalBudget || 0,
          )}`}
          footTitle={`${formatInr(kpis?.totalSpent || 0)} of ${formatInr(
            kpis?.totalBudget || 0,
          )}`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5 lg:items-stretch">
        <Panel
          className="h-full lg:col-span-2"
          icon={FolderKanban}
          title="Project status"
          subtitle="Distribution across all projects"
          action={
            <Link
              to="/portfolio"
              className="text-[12px] font-medium text-accent hover:underline"
            >
              Dashboard
            </Link>
          }
        >
          {(d?.projectCounts?.total || 0) === 0 ? (
            <EmptyState
              className="!border-0 !bg-transparent !py-8"
              icon={FolderKanban}
              title="No projects yet"
              description="Create a project to see status distribution."
              actionLabel="Open projects"
              onAction={() => {
                window.location.assign('/projects')
              }}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="flex shrink-0 justify-center pt-1">
                <Donut segments={statusSegments} size="lg" />
              </div>
              <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-3">
                {statusSegments.map((seg) => {
                  const pct = Math.round(
                    ((seg.value || 0) / statusTotal) * 100,
                  )
                  return (
                    <div
                      key={seg.key}
                      className="rounded-[8px] bg-canvas px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="inline-flex items-center gap-2 font-medium text-primary">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: seg.color }}
                          />
                          {seg.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-secondary">
                          <span className="font-semibold text-primary">
                            {seg.value}
                          </span>{' '}
                          · {pct}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: seg.color,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {delayedSegment?.value > 0 ? (
                <p className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  {delayedSegment.value}{' '}
                  {delayedSegment.value === 1 ? 'project' : 'projects'} delayed
                  — needs attention
                </p>
              ) : (
                <p className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--accent)]/12 px-3 py-1.5 text-[11px] font-medium text-[var(--accent-hover)]">
                  All projects on track
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel
          className="h-full lg:col-span-3"
          icon={Wallet}
          title="Budget tracking"
          subtitle="Approved budgets vs actual spend"
          action={
            <Link
              to="/finance"
              className="text-[12px] font-medium text-accent hover:underline"
            >
              Revenue
            </Link>
          }
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-4 grid min-w-0 shrink-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
              <BudgetTile
                label="Approved budget"
                value={formatInrCompact(budget?.totalBudget || 0)}
                title={formatInr(budget?.totalBudget || 0)}
              />
              <BudgetTile
                label="Actual spend"
                value={formatInrCompact(budget?.totalSpent || 0)}
                title={formatInr(budget?.totalSpent || 0)}
              />
              <BudgetTile
                label="Committed POs"
                value={formatInrCompact(budget?.committedAmount || 0)}
                title={formatInr(budget?.committedAmount || 0)}
                tone="blue"
              />
              <BudgetTile
                label="Pending expenses"
                value={formatInrCompact(budget?.pendingAmount || 0)}
                title={formatInr(budget?.pendingAmount || 0)}
                tone="amber"
              />
              <BudgetTile
                label="Variance"
                value={formatInrCompact(budget?.variance || 0)}
                title={formatInr(budget?.variance || 0)}
                tone={(budget?.variance || 0) < 0 ? 'red' : 'green'}
              />
            </div>

            <div className="mb-4 shrink-0">
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="text-secondary">Utilization</span>
                <span className="font-semibold tabular-nums text-primary">
                  {utilization}
                </span>
              </div>
              <ProgressBar
                value={Math.min(
                  100,
                  Math.max(0, Number(kpis?.budgetUtilization) || 0),
                )}
              />
              {budget?.periodSpend != null && (
                <p className="mt-2 text-[11px] text-secondary">
                  Approved expense spend in range:{' '}
                  <span title={formatInr(budget.periodSpend)}>
                    {formatInrCompact(budget.periodSpend)}
                  </span>
                  {budget.spendDelta != null && (
                    <span
                      className={cn(
                        'ml-1 font-semibold',
                        budget.spendDelta >= 0
                          ? 'text-red-600'
                          : 'text-[var(--accent-hover)]',
                      )}
                    >
                      ({budget.spendDelta >= 0 ? '+' : ''}
                      {budget.spendDelta}% vs prior)
                    </span>
                  )}
                </p>
              )}
            </div>

            <p className="mb-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">
              By project
            </p>
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {(budget?.projects || []).slice(0, 6).map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/projects/${row.id}/overview`}
                    className="flex items-center gap-3 rounded-[6px] px-1 py-2.5 transition hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[13px] font-medium text-primary">
                          {row.name}
                        </p>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-secondary">
                          {row.utilization != null
                            ? `${Math.round(row.utilization)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              (row.utilization || 0) > 100
                                ? 'bg-red-500'
                                : 'bg-accent',
                            )}
                            style={{
                              width: `${Math.min(100, Math.max(0, Math.round(row.utilization || 0)))}%`,
                            }}
                          />
                        </div>
                        <span
                          className="shrink-0 text-[10.5px] tabular-nums text-secondary"
                          title={`${formatInr(row.spent)} / ${formatInr(row.budget)}`}
                        >
                          {formatInrCompact(row.spent)} / {formatInrCompact(row.budget)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
              {!budget?.projects?.length && (
                <li className="py-6 text-center text-sm text-secondary">
                  No budget rows yet
                </li>
              )}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="flex h-[360px] flex-col"
          icon={Truck}
          title="Materials summary"
          subtitle="BOQ to purchase-order coverage"
          action={
            <Link
              to="/procurement"
              className="text-[12px] font-medium text-accent hover:underline"
            >
              Materials
            </Link>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {(d?.materials?.totalPos || 0) === 0 &&
            (d?.materials?.approvedBoqLines || 0) === 0 ? (
              <EmptyState
                className="!border-0 !bg-transparent !py-6"
                icon={Truck}
                title="No materials activity"
                description="Approve a BOQ and raise POs to track coverage."
              />
            ) : (
              <>
            <div className="grid shrink-0 grid-cols-2 gap-3">
              <div className="rounded-[8px] bg-canvas p-3">
                <p className="text-[11px] font-medium text-secondary">
                  Approved BOQ lines
                </p>
                <p className="mt-1 text-[20px] font-semibold tabular-nums tracking-tight text-primary">
                  {d?.materials?.approvedBoqLines ?? 0}
                </p>
              </div>
              <div className="rounded-[8px] bg-canvas p-3">
                <p className="text-[11px] font-medium text-secondary">PO lines</p>
                <p className="mt-1 text-[20px] font-semibold tabular-nums tracking-tight text-primary">
                  {d?.materials?.poLines ?? 0}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <div className="mb-1.5 flex justify-between text-[12px]">
                <span className="text-secondary">BOQ → PO coverage</span>
                <span className="font-semibold tabular-nums text-primary">
                  {d?.materials?.coveragePct != null
                    ? `${d.materials.coveragePct}%`
                    : '—'}
                </span>
              </div>
              <ProgressBar value={d?.materials?.coveragePct || 0} />
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {(d?.materials?.poStatus || []).map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between rounded-[6px] px-2 py-1.5 text-[12px] odd:bg-canvas"
                >
                  <span className="text-secondary">{row.label}</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            {d?.materials?.note && (
              <p className="shrink-0 text-[10px] leading-relaxed text-secondary">
                {d.materials.note}
              </p>
            )}
              </>
            )}
          </div>
        </Panel>

        <Panel
          className="flex h-[360px] flex-col"
          icon={Store}
          title="Top vendors"
          subtitle={
            range === 'all'
              ? 'Ranked by PO value (all time)'
              : 'Ranked by PO value in selected period'
          }
          action={
            <Link
              to="/procurement"
              className="text-[12px] font-medium text-accent hover:underline"
            >
              Vendors
            </Link>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {(d?.topVendors || []).map((vendor, idx) => {
                const maxValue = Math.max(
                  ...(d?.topVendors || []).map((v) => v.value || 0),
                  1,
                )
                const share = Math.round(((vendor.value || 0) / maxValue) * 100)
                return (
                  <li
                    key={vendor.id}
                    className="rounded-[8px] px-2 py-2.5 transition hover:bg-canvas"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[12px] font-bold text-[#171717]',
                          idx === 0
                            ? 'bg-accent'
                            : idx === 1
                              ? 'bg-canvas text-secondary ring-1 ring-border'
                              : 'bg-[var(--accent)]/20 text-[var(--accent-hover)]',
                        )}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-medium text-primary">
                            {vendor.name}
                          </p>
                          <span
                            className="shrink-0 text-[12px] font-semibold tabular-nums text-primary"
                            title={formatInr(vendor.value)}
                          >
                            {formatInrCompact(vendor.value)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10.5px] text-secondary">
                            {vendor.poCount} POs
                            {vendor.deliveryRate != null
                              ? ` · ${vendor.deliveryRate}% delivered`
                              : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
              {!d?.topVendors?.length && (
                <li className="py-8 text-center text-sm text-secondary">
                  No vendor spend yet
                </li>
              )}
            </ul>
            <div className="mt-2 shrink-0 rounded-[8px] border border-dashed border-border bg-canvas px-3 py-2 text-center text-[11px] text-secondary">
              {(d?.topVendors || []).length} vendors ·{' '}
              <span
                title={formatInr(
                  (d?.topVendors || []).reduce((s, v) => s + (v.value || 0), 0),
                )}
              >
                {formatInrCompact(
                  (d?.topVendors || []).reduce((s, v) => s + (v.value || 0), 0),
                )}
              </span>{' '}
              total PO value
            </div>
          </div>
        </Panel>

        <Panel
          className="flex h-[360px] flex-col"
          icon={Activity}
          title="Recent activities"
          subtitle="Latest changes across projects"
          noPadding
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <ul className="space-y-3">
              {(d?.activity || []).map((item) => (
                <li key={item.id} className="flex gap-2.5">
                  <Avatar
                    name={item.actor?.name || 'System'}
                    src={item.actor?.avatar}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-primary">
                      {item.message}
                    </p>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {item.project ? (
                        <Link
                          to={`/projects/${item.project.id}/overview`}
                          className="font-medium text-accent hover:underline"
                        >
                          {item.project.name}
                        </Link>
                      ) : (
                        'Company'
                      )}
                      {' · '}
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
              {!d?.activity?.length && (
                <li className="py-8 text-center text-sm text-secondary">
                  No activity in this range
                </li>
              )}
            </ul>
          </div>
        </Panel>
      </div>

      <Panel
        icon={ClipboardList}
        title="Project timeline"
        subtitle="Progress, dates, and spend for every project"
        action={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-secondary">
            <Percent className="h-3.5 w-3.5" />
            Live from project data
          </span>
        }
        noPadding
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-y border-border bg-canvas text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                <th className="px-5 py-2.5 font-semibold">Project</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Stage</th>
                <th className="px-3 py-2.5 font-semibold">Start</th>
                <th className="px-3 py-2.5 font-semibold">End</th>
                <th className="px-3 py-2.5 font-semibold">Progress</th>
                <th className="px-5 py-2.5 text-right font-semibold">
                  Spend / Budget
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(d?.timeline || []).map((row) => (
                <tr key={row.id} className="transition hover:bg-canvas">
                  <td className="px-5 py-3">
                    <Link
                      to={`/projects/${row.id}/overview`}
                      className="font-medium text-primary hover:text-accent"
                    >
                      {row.name}
                    </Link>
                    <p className="text-[11px] text-secondary">
                      {row.clientName}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip status={statusTone(row)} />
                  </td>
                  <td className="px-3 py-3 text-secondary">
                    {stageLabel(row.currentStage)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-secondary">
                    {formatShortDate(row.startDate)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-secondary">
                    {formatShortDate(row.endDate)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-[110px] items-center gap-2">
                      <ProgressBar
                        value={row.progress || 0}
                        className="flex-1"
                      />
                      <span className="w-8 text-right text-[11px] tabular-nums text-secondary">
                        {row.progress || 0}%
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-5 py-3 text-right tabular-nums"
                    title={`${formatInr(row.spent)} / ${formatInr(row.budget)}`}
                  >
                    <span className="font-semibold text-primary">
                      {formatInrCompact(row.spent)}
                    </span>
                    <span className="text-secondary">
                      {' '}
                      / {formatInrCompact(row.budget)}
                    </span>
                  </td>
                </tr>
              ))}
              {!d?.timeline?.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-secondary"
                  >
                    No projects to show on the timeline
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border md:hidden">
          {(d?.timeline || []).map((row) => (
            <Link
              key={row.id}
              to={`/projects/${row.id}/overview`}
              className="block px-4 py-3 hover:bg-canvas"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-primary">{row.name}</p>
                  <p className="text-[11px] text-secondary">{row.clientName}</p>
                </div>
                <StatusChip status={statusTone(row)} />
              </div>
              <p className="mt-2 text-[11px] text-secondary">
                {stageLabel(row.currentStage)} · {formatShortDate(row.startDate)}{' '}
                → {formatShortDate(row.endDate)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={row.progress || 0} className="flex-1" />
                <span className="text-[11px] tabular-nums text-secondary">
                  {row.progress || 0}%
                </span>
              </div>
              <p
                className="mt-2 text-[12px] tabular-nums text-secondary"
                title={`${formatInr(row.spent)} / ${formatInr(row.budget)}`}
              >
                {formatInrCompact(row.spent)} / {formatInrCompact(row.budget)}
              </p>
            </Link>
          ))}
          {!d?.timeline?.length && (
            <p className="px-4 py-10 text-center text-sm text-secondary">
              No projects to show
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}

function StatCard({ to, icon: Icon, tone, label, value, delta, foot, footTitle }) {
  const tones = {
    blue: 'bg-[var(--accent)]/12 text-[var(--accent-hover)]',
    violet: 'bg-[var(--accent)]/12 text-[var(--accent-hover)]',
    amber: 'bg-[var(--accent)]/12 text-[var(--accent-hover)]',
    emerald: 'bg-[var(--accent)]/12 text-[var(--accent-hover)]',
  }
  return (
    <Link
      to={to}
      className="group block min-w-0 overflow-hidden rounded-[12px] border border-border bg-surface p-4 transition hover:bg-canvas"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-secondary">
          {label}
        </p>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]',
            tones[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-2">
        <p className="truncate text-[26px] font-semibold tabular-nums tracking-tight text-primary">
          {value}
        </p>
        {delta && (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
              delta.up
                ? 'bg-[var(--accent)]/15 text-[var(--accent-hover)]'
                : 'bg-red-50 text-red-600',
            )}
          >
            {delta.label}
          </span>
        )}
      </div>
      <p
        className="mt-1.5 truncate text-[11px] leading-snug text-secondary"
        title={footTitle || (typeof foot === 'string' ? foot : undefined)}
      >
        {foot}
      </p>
    </Link>
  )
}

function BudgetTile({ label, value, title, tone }) {
  const tones = {
    blue: 'bg-[var(--accent)]/12 text-[var(--accent-hover)]',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    red: 'bg-red-50 text-red-600',
    green: 'bg-[var(--accent)]/12 text-[var(--accent-hover)]',
  }
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-[8px] p-3',
        tone ? tones[tone] : 'bg-canvas text-primary',
      )}
      title={title || value}
    >
      <p
        className={cn(
          'truncate text-[11px] font-medium',
          tone ? 'opacity-80' : 'text-secondary',
        )}
      >
        {label}
      </p>
      <p className="mt-1 truncate text-[16px] font-semibold tabular-nums leading-tight tracking-tight">
        {value}
      </p>
    </div>
  )
}

function Donut({ segments, size = 'md' }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  let offset = 0
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const sizeClass =
    size === 'lg' ? 'h-44 w-44 sm:h-48 sm:w-48' : 'h-36 w-36'

  return (
    <svg viewBox="0 0 100 100" className={cn('shrink-0', sizeClass)}>
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="var(--border-subtle)"
        strokeWidth="13"
      />
      {segments.map((seg) => {
        const length = (seg.value / total) * circumference
        const dasharray = `${length} ${circumference - length}`
        const el = (
          <circle
            key={seg.key}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="13"
            strokeDasharray={dasharray}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform="rotate(-90 50 50)"
          />
        )
        offset += length
        return el
      })}
      <text
        x="50"
        y="47"
        textAnchor="middle"
        fill="var(--text-primary)"
        style={{ fontSize: '20px', fontWeight: 700 }}
      >
        {total}
      </text>
      <text
        x="50"
        y="60"
        textAnchor="middle"
        fill="var(--text-secondary)"
        style={{ fontSize: '7px', fontWeight: 600, letterSpacing: '0.1em' }}
      >
        PROJECTS
      </text>
    </svg>
  )
}

function Panel({ icon: Icon, title, subtitle, action, children, className, noPadding }) {
  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-[12px] border border-border bg-surface',
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--accent)]/12 text-[var(--accent-hover)]">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div>
            <h2 className="text-[13.5px] font-medium text-primary">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[10.5px] text-secondary">{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          noPadding ? '' : 'px-5 pb-5 pt-4',
        )}
      >
        {children}
      </div>
    </section>
  )
}
