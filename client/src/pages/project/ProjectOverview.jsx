import { useOutletContext, Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  FileSpreadsheet,
  CheckSquare,
  Camera,
  ArrowRight,
  AlertTriangle,
  Check,
  Flag,
  Package,
  ChevronRight,
} from 'lucide-react'
import { api, useAuthStore } from '../../lib/api'
import { formatInr } from '../../lib/format'
import { toast } from '../../components/ui'
import { cn } from '../../lib/utils'
import { MeetingNotes } from './MeetingNotes'
import { ProjectPageShell } from './ProjectPageShell'

const STAGE_ORDER = ['design', 'planning', 'procurement', 'execution', 'handover']

const STAGE_HELP = {
  design: {
    title: 'Design',
    plain: 'Concepts, drawings, client approval',
    next: 'Finish drawings and design tasks. When the client approves, move to Quote & planning.',
    focus: ['Complete concepts', 'Get drawings approved', 'Prepare for quotation'],
    cta: { to: 'tasks', label: 'Open tasks' },
    secondary: { to: 'files', label: 'Open drawings' },
  },
  planning: {
    title: 'Quote & planning',
    plain: 'BOQ, quotation, client sign-off',
    next: 'Build the BOQ, send it to the client, and get approval. Then buying can start.',
    focus: ['Complete BOQ lines', 'Send quotation to client', 'Get client approval'],
    cta: { to: 'boq', label: 'Open BOQ / quote' },
    secondary: { to: 'tasks', label: 'Open tasks' },
  },
  procurement: {
    title: 'Buying materials',
    plain: 'Vendors, POs, deliveries',
    next: 'Raise purchase orders from the approved quote, then track GRN and transit.',
    focus: ['Pick quote items to buy', 'Raise purchase orders', 'Track deliveries'],
    cta: { to: 'procurement', label: 'Open materials' },
    secondary: { to: 'boq', label: 'View quote' },
  },
  execution: {
    title: 'Site work',
    plain: 'Daily progress, quality, snags',
    next: 'Post today’s site update and clear open site tasks.',
    focus: ['Post daily updates', 'Track site progress', 'Resolve snags'],
    cta: { to: 'site?compose=1', label: 'Post site update' },
    secondary: { to: 'tasks', label: 'Site tasks' },
  },
  handover: {
    title: 'Handover',
    plain: 'Snags, final check, warranty',
    next: 'Close remaining snags and hand over to the client.',
    focus: ['Close all snags', 'Final inspection', 'Hand over documents'],
    cta: { to: 'site', label: 'Open snag list' },
    secondary: { to: 'tasks', label: 'Open tasks' },
  },
}

function stageState(key, current, stages) {
  const currentIdx = STAGE_ORDER.indexOf(current)
  const stageIdx = STAGE_ORDER.indexOf(key)
  const row = (stages || []).find((s) => s.key === key)
  if (row?.status === 'completed' || (row?.progress ?? 0) >= 100) return 'done'
  if (currentIdx >= 0 && stageIdx >= 0 && stageIdx < currentIdx) return 'done'
  if (key === current) return 'now'
  return 'todo'
}

export function ProjectOverview() {
  const { id } = useParams()
  const { project, stats } = useOutletContext()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const current = project.currentStage || 'design'
  const help = STAGE_HELP[current] || STAGE_HELP.design
  const budget = Number(stats?.budgetVsSpent?.budget ?? project.budget ?? 0)
  const spent = Number(stats?.budgetVsSpent?.spent ?? project.spent ?? 0)
  const utilizationPct = budget > 0 ? (spent / budget) * 100 : null
  const spendBarPct =
    utilizationPct == null ? 0 : Math.min(100, Math.max(0, utilizationPct))
  const variance = budget - spent
  const isOverBudget = budget > 0 && variance < 0
  const exactPct =
    utilizationPct == null
      ? null
      : new Intl.NumberFormat('en-IN', {
          maximumFractionDigits: 1,
        }).format(utilizationPct)
  const delayed = project.isDelayed || project.status === 'delayed'
  const stages = project.stages || []
  const canManage =
    ['admin', 'owner', 'project_manager', 'hr'].includes(user?.role) ||
    user?.isPlatformAdmin

  const tab = (path) =>
    path === 'boq' || path.startsWith('boq')
      ? `/boq/${id}`
      : `/projects/${id}/${path}`

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api(`/tasks?projectId=${id}`),
  })
  const { data: siteData } = useQuery({
    queryKey: ['site', id],
    queryFn: () => api(`/site-updates?projectId=${id}`),
  })
  const { data: poData } = useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () => api(`/purchase-orders?projectId=${id}`),
  })
  const { data: snagData } = useQuery({
    queryKey: ['snags', id],
    queryFn: () => api(`/snags?projectId=${id}`),
  })

  const tasks = tasksData?.tasks || []
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const doneTasks = tasks.filter((t) => t.status === 'done')
  const overdue = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date(),
  )
  const updates = siteData?.updates || []
  const orders = (poData?.purchaseOrders || poData?.orders || []).slice(0, 3)
  const snags = (snagData?.snags || []).filter((s) => s.status !== 'verified')
  const urgent = [...openTasks].sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    return ad - bd
  })[0]

  const setStage = useMutation({
    mutationFn: (stage) =>
      api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentStage: stage }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      toast('Moved to next stage', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not update stage', { type: 'error' }),
  })

  const nextStageKey = (() => {
    const i = STAGE_ORDER.indexOf(current)
    return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
  })()
  const currentIdx = Math.max(0, STAGE_ORDER.indexOf(current))

  return (
    <ProjectPageShell className="space-y-4 bg-[#faf9f7]">
      {delayed && (
        <div className="flex items-center gap-3 rounded-xl bg-[#ffdad6] px-4 py-2.5 text-sm text-[#93000a]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This project is behind schedule
          <Link to={tab('tasks')} className="ml-auto font-semibold underline">
            Review tasks
          </Link>
        </div>
      )}

      {/* 1 — Journey: where am I? */}
      <section className="rounded-[16px] border border-[#e5dfd7] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a847c]">
              Project journey · auto
            </p>
            <p className="mt-0.5 text-[13px] text-[#68645e]">
              Step {currentIdx + 1} of {STAGE_ORDER.length} ·{' '}
              <span className="font-semibold text-[#1e2022]">{help.title}</span>
              {' '}— moves when you do real work (BOQ, buying, site)
            </p>
          </div>
        </div>

        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {STAGE_ORDER.map((key, i) => {
            const state = stageState(key, current, stages)
            const meta = STAGE_HELP[key]
            return (
              <li key={key} className="min-w-0">
                <div
                  className={cn(
                    'flex flex-col items-center rounded-xl border px-1 py-2.5 text-center sm:px-2',
                    state === 'now' &&
                      'border-[#1e2022] bg-[#1e2022] text-[#faf9f7]',
                    state === 'done' &&
                      'border-emerald-200 bg-emerald-50 text-emerald-900',
                    state === 'todo' &&
                      'border-[#e5dfd7] bg-[#faf9f7] text-[#8a847c]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
                      state === 'now' && 'bg-white/15 text-white',
                      state === 'done' && 'bg-emerald-500 text-white',
                      state === 'todo' && 'bg-[#e5dfd7] text-[#68645e]',
                    )}
                  >
                    {state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="mt-1.5 truncate text-[10px] font-semibold sm:text-[11px]">
                    {meta.title.split(' ')[0]}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* 2 — What to do now */}
      <section className="rounded-[16px] border border-[#e5dfd7] bg-gradient-to-br from-[#faf9f7] to-white p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#a27b5c]">
          You are here · {help.title}
        </p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-[#1e2022]">
          {help.plain}
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#68645e]">
          {help.next}
        </p>

        <ul className="mt-4 space-y-2">
          {help.focus.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-[13px] text-[#1e2022]"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f3efea] text-[#a27b5c]">
                <Check className="h-3 w-3" />
              </span>
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={tab(help.cta.to)}
            className="btn-create inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold"
          >
            {help.cta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {help.secondary && (
            <Link
              to={tab(help.secondary.to)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#e5dfd7] bg-white px-4 text-[13px] font-semibold text-[#1e2022] hover:bg-[#faf9f7]"
            >
              {help.secondary.label}
            </Link>
          )}
          {canManage && nextStageKey && (
            <button
              type="button"
              disabled={setStage.isPending}
              title="Optional override — stage also advances automatically from BOQ / GRN / site work"
              onClick={() => {
                if (
                  !window.confirm(
                    `Manually move to “${STAGE_HELP[nextStageKey].title}”?\n\nNormally this happens automatically when the work is done.`,
                  )
                )
                  return
                setStage.mutate(nextStageKey)
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-[#d6cebe] bg-transparent px-4 text-[13px] font-semibold text-[#8a847c] hover:border-[#a27b5c] hover:text-[#7a573b] disabled:opacity-50"
            >
              {setStage.isPending
                ? 'Updating…'
                : `Skip ahead to ${STAGE_HELP[nextStageKey].title}`}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* 3 — Health strip */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e5dfd7] bg-white p-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a847c]">
            Budget used
          </span>
          <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#1e2022]">
            {exactPct == null ? '—' : `${exactPct}%`}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ebe6df]">
            <div
              className={cn(
                'h-full rounded-full',
                isOverBudget ? 'bg-[#ba1a1a]' : 'bg-[#a27b5c]',
              )}
              style={{ width: `${spendBarPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[#68645e]">
            {formatInr(spent)} / {formatInr(budget)}
          </p>
        </div>
        <Link
          to={tab('tasks')}
          className="rounded-xl border border-[#e5dfd7] bg-white p-4 transition hover:border-[#c4b8a8]"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a847c]">
            Open tasks
          </span>
          <p className="mt-1 text-[20px] font-semibold text-[#1e2022]">
            {openTasks.length}
          </p>
          <p className="mt-1 text-[11px] text-[#68645e]">
            {doneTasks.length} done
            {overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}
          </p>
        </Link>
        <Link
          to="/approvals"
          className="rounded-xl border border-[#e5dfd7] bg-white p-4 transition hover:border-[#c4b8a8]"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a847c]">
            Sign-offs
          </span>
          <p className="mt-1 text-[20px] font-semibold text-[#1e2022]">
            {stats?.pendingApprovals ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#68645e]">Waiting review</p>
        </Link>
      </div>

      {/* 4 — Urgent only if needed */}
      {urgent && (
        <Link
          to={tab('tasks')}
          className="flex items-start gap-3 rounded-xl border border-[#eadfce] bg-[#faf6f1] p-4 transition hover:border-[#c4a484]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fdceaa] text-[#79563a]">
            <Flag className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7a573b]">
                Next due task
              </span>
              {urgent.dueDate && (
                <span className="rounded-full bg-[#ffdad6] px-2 py-0.5 text-[11px] font-semibold text-[#93000a]">
                  {format(new Date(urgent.dueDate), 'd MMM')}
                </span>
              )}
            </div>
            <h3 className="truncate text-[15px] font-semibold text-[#1a1c1b]">
              {urgent.title}
            </h3>
            <p className="text-[12.5px] text-[#68645e]">
              {urgent.assignee?.name || 'Unassigned'}
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#8a847c]" />
        </Link>
      )}

      {/* 5 — Stage-relevant snapshot only */}
      {current === 'procurement' && (
        <StagePanel
          icon={Package}
          title="Purchase orders"
          link={tab('procurement')}
          linkLabel="Materials"
        >
          {orders.length === 0 ? (
            <p className="text-[13px] text-[#68645e]">
              No POs yet — open Materials to raise the first order.
            </p>
          ) : (
            <ul className="space-y-2">
              {orders.map((po) => (
                <li
                  key={po._id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[#faf9f7] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#1e2022]">
                      {po.poNumber || 'PO'}
                    </p>
                    <p className="truncate text-[12px] text-[#68645e]">
                      {po.vendor?.name || 'Vendor'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#e8f1ff] px-2 py-0.5 text-[10px] font-bold uppercase text-[#1d4ed8]">
                    {String(po.status || 'open').replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </StagePanel>
      )}

      {(current === 'execution' || current === 'handover') && (
        <StagePanel
          icon={Camera}
          title={current === 'handover' ? 'Open snags' : 'Recent site'}
          link={tab('site')}
          linkLabel="Site"
        >
          {current === 'handover' ? (
            snags.length === 0 ? (
              <p className="text-[13px] text-[#68645e]">No open snags.</p>
            ) : (
              <ul className="space-y-2">
                {snags.slice(0, 3).map((s) => (
                  <li
                    key={s._id}
                    className="flex items-center gap-2 rounded-lg bg-[#faf9f7] px-3 py-2.5"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#ba1a1a]" />
                    <span className="truncate text-[13px] font-semibold text-[#1e2022]">
                      {s.title}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : updates[0] ? (
            <p className="text-[13px] text-[#68645e]">
              Last update:{' '}
              <span className="font-semibold text-[#1e2022]">
                {updates[0].note || 'Site log'}
              </span>
              {updates[0].createdAt
                ? ` · ${format(new Date(updates[0].createdAt), 'd MMM')}`
                : ''}
            </p>
          ) : (
            <p className="text-[13px] text-[#68645e]">
              No site updates yet — post today’s log.
            </p>
          )}
        </StagePanel>
      )}

      {(current === 'design' || current === 'planning') && (
        <StagePanel
          icon={current === 'planning' ? FileSpreadsheet : CheckSquare}
          title={current === 'planning' ? 'Quotation' : 'Tasks'}
          link={tab(current === 'planning' ? 'boq' : 'tasks')}
          linkLabel={current === 'planning' ? 'BOQ' : 'Tasks'}
        >
          <p className="text-[13px] text-[#68645e]">
            {openTasks.length} open · {doneTasks.length} done
            {overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}
          </p>
        </StagePanel>
      )}

      <MeetingNotes projectId={id} project={project} user={user} />
    </ProjectPageShell>
  )
}

function StagePanel({ icon: Icon, title, link, linkLabel, children }) {
  return (
    <section className="rounded-[16px] border border-[#e5dfd7] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-[#1e2022]">
          <Icon className="h-4 w-4 text-[#a27b5c]" />
          {title}
        </div>
        <Link
          to={link}
          className="text-[12px] font-semibold text-[#7a573b] hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  )
}
