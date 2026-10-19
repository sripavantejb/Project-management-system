import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Users,
} from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { stageLabel } from '../lib/format'
import { PageToolbar, ToolbarLink } from '../components/layout/PageToolbar'
import {
  Avatar,
  EmptyState,
  ProgressBar,
  ProgressRing,
  SkeletonCard,
  StatusChip,
} from '../components/ui'
import { cn } from '../lib/utils'

function formatDue(value) {
  if (!value) return ''
  try {
    return format(new Date(value), 'd MMM')
  } catch {
    return ''
  }
}

function trendLabel(delta) {
  if (delta == null) return null
  const up = delta >= 0
  return {
    text: `${up ? '+' : ''}${delta} vs prior 30d`,
    up,
  }
}

export function PortfolioPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api('/projects/portfolio'),
  })

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-4 pb-10">
        <SkeletonCard className="h-16" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard className="h-72 lg:col-span-2" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load dashboard"
        description={error?.message || 'Check your connection and try again.'}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    )
  }

  const d = data?.data
  const counts = d?.counts || {}
  const health = d?.health || []
  const healthTotal = health.reduce((s, h) => s + (h.value || 0), 0) || 1
  const projects = d?.projects || []
  const projectTrend = trendLabel(d?.trends?.projectDelta)
  const activeLabel = d?.activeCount ?? counts.ongoing ?? 0

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1500px] space-y-4 pb-10 transition-opacity',
        isFetching && 'opacity-90',
      )}
    >
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary">
          Operations control
        </p>
        <h1 className="mt-1 text-[28px] font-medium tracking-[-0.02em] text-primary">
          Studio dashboard
        </h1>
      </header>
      <PageToolbar
        left={<ToolbarLink to="/projects">All projects</ToolbarLink>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <DashKpi
          label="Total projects"
          value={counts.total ?? 0}
          foot={projectTrend?.text}
          footUp={projectTrend?.up}
        />
        <DashKpi
          label="Ongoing"
          value={counts.ongoing ?? 0}
          accent
          foot={`${activeLabel} in active delivery`}
        />
        <DashKpi label="Completed" value={counts.completed ?? 0} />
        <DashKpi
          label="Delayed"
          value={counts.delayed ?? 0}
          danger={(counts.delayed ?? 0) > 0}
          foot={
            (counts.delayed ?? 0) > 0 ? 'Needs attention' : 'None delayed'
          }
        />
        <DashKpi label="On hold" value={counts.onHold ?? 0} />
      </section>

      <section className="rounded-[12px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-medium text-primary">
              Project health
            </h2>
            <p className="mt-0.5 text-[11px] text-secondary">
              Status mix across the full portfolio
            </p>
          </div>
          <span className="text-[12px] tabular-nums text-secondary">
            {counts.total ?? 0} projects
          </span>
        </div>
        {health.length === 0 ? (
          <p className="py-6 text-center text-sm text-secondary">
            No projects yet — create one to see health.
          </p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-border">
              {health.map((h) => (
                <div
                  key={h.key}
                  title={`${h.label}: ${h.value}`}
                  style={{
                    width: `${(h.value / healthTotal) * 100}%`,
                    backgroundColor: h.color,
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-secondary">
              {health.map((h) => (
                <span key={h.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: h.color }}
                  />
                  {h.label}{' '}
                  <span className="font-semibold tabular-nums text-primary">
                    {h.value}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[13.5px] font-medium text-primary">Projects</h2>
            <Link
              to="/projects"
              className="text-[12px] font-medium text-accent hover:underline"
            >
              View all
            </Link>
          </div>
          {projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create a project to start tracking delivery."
              actionLabel="Go to projects"
              onAction={() => navigate('/projects')}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 8).map((p) => (
                <ProjectCard key={p._id} project={p} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <SidePanel
            icon={AlertTriangle}
            title="Alerts & risks"
            iconClass="text-status-delayed"
          >
            {(d?.delayAlerts || []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-secondary">
                No delays — portfolio looks healthy.
              </p>
            ) : (
              (d?.delayAlerts || []).map((a) => (
                <Link
                  key={a.id}
                  to={`/projects/${a.id}/overview`}
                  className="block px-4 py-3 transition hover:bg-canvas"
                >
                  <p className="text-[13px] font-medium text-primary">{a.name}</p>
                  <p className="mt-0.5 text-[11px] text-secondary">
                    {[a.location, stageLabel(a.stage)].filter(Boolean).join(' · ')}
                    {a.endDate ? ` · due ${formatDue(a.endDate)}` : ''}
                  </p>
                </Link>
              ))
            )}
          </SidePanel>

          <SidePanel icon={CalendarClock} title="Upcoming deadlines">
            {(d?.upcomingDeadlines || []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-secondary">
                No deadlines in the next 14 days.
              </p>
            ) : (
              (d?.upcomingDeadlines || []).map((t) => (
                <div key={t._id} className="flex items-start gap-2.5 px-4 py-3">
                  <Avatar
                    name={t.assignee?.name || '?'}
                    src={t.assignee?.avatar}
                    size="xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-primary">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-secondary">
                      {t.projectId?.name || 'Project'}
                      {t.dueDate ? ` · ${formatDue(t.dueDate)}` : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </SidePanel>

          <SidePanel icon={Users} title="Team workload" padded>
            {(d?.workload || []).length === 0 ? (
              <p className="py-4 text-center text-sm text-secondary">
                No open assigned tasks.
              </p>
            ) : (
              <div className="space-y-3">
                {(d?.workload || []).map((w) => (
                  <div key={w.user._id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar
                          src={w.user.avatar}
                          name={w.user.name}
                          size="xs"
                        />
                        <span className="truncate text-[12px] font-medium text-primary">
                          {w.user.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-secondary">
                        {w.openTasks} open
                      </span>
                    </div>
                    <ProgressBar value={w.load} />
                  </div>
                ))}
              </div>
            )}
          </SidePanel>
        </div>
      </div>
    </div>
  )
}

function DashKpi({ label, value, foot, footUp, accent, danger }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-secondary">
        {label}
      </p>
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
      {foot ? (
        <p
          className={cn(
            'mt-1.5 text-[11px]',
            footUp === true
              ? 'text-[var(--accent-hover)]'
              : footUp === false
                ? 'text-status-delayed'
                : 'text-secondary',
          )}
        >
          {foot}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-transparent">—</p>
      )}
    </div>
  )
}

function ProjectCard({ project: p }) {
  const cover = p.coverImage ? assetUrl(p.coverImage) : null
  return (
    <Link to={`/projects/${p._id}/overview`} className="group block">
      <article className="overflow-hidden rounded-[12px] border border-border bg-surface transition hover:bg-canvas">
        <div
          className="relative h-36 overflow-hidden bg-cover bg-center"
          style={
            cover
              ? { backgroundImage: `url(${cover})` }
              : undefined
          }
        >
          {!cover && (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/35 via-[#1a1a1a] to-[#0f0f0f]" />
          )}
          {/* Scrim so white type stays readable on any photo */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                {p.name}
              </p>
              <p className="truncate text-[11px] font-medium text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
                {p.clientName || '—'}
              </p>
            </div>
            <ProgressRing
              value={p.progress}
              size={42}
              stroke={3}
              trackColor="rgba(255,255,255,0.35)"
              color="#ffffff"
              valueClassName="text-white text-[10px] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <StatusChip status={p.isDelayed ? 'delayed' : p.status} />
          <span className="truncate text-[11px] capitalize text-secondary">
            {stageLabel(p.currentStage)}
          </span>
        </div>
      </article>
    </Link>
  )
}

function SidePanel({ icon: Icon, title, children, padded, iconClass }) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className={cn('h-4 w-4 text-accent', iconClass)} />
        <h3 className="text-[13px] font-medium text-primary">{title}</h3>
      </div>
      <div className={cn(padded ? 'p-4' : 'divide-y divide-border')}>
        {children}
      </div>
    </section>
  )
}
