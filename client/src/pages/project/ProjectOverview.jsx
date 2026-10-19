import { useOutletContext, Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import {
  FileSpreadsheet,
  Truck,
  CheckSquare,
  Wallet,
  Camera,
  ArrowRight,
  AlertTriangle,
  Check,
  FileImage,
  Users,
  CalendarDays,
  Flag,
  Package,
  PenLine,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../../lib/api'
import { formatInr, stageLabel } from '../../lib/format'
import { Avatar, toast } from '../../components/ui'
import { cn } from '../../lib/utils'
import { MeetingNotes } from './MeetingNotes'
import { ProjectPageShell, ProjectPanel } from './ProjectPageShell'

const STAGE_HELP = {
  design: {
    title: 'Design',
    plain: 'Concepts, drawings, client approval',
    next: 'Assign design tasks, then move to the quote when the client approves.',
    focus: ['Complete concepts', 'Approve drawings', 'Prepare quote'],
    cta: { to: 'tasks', label: 'Open tasks' },
    secondary: { to: 'files', label: 'Drawings' },
  },
  planning: {
    title: 'Quote & planning',
    plain: 'BOQ, quotation, work order',
    next: 'Finish the quote lines and send to the client.',
    focus: ['Complete BOQ', 'Send quotation', 'Record approval'],
    cta: { to: 'boq', label: 'Open quote' },
    secondary: { to: 'tasks', label: 'Tasks' },
  },
  procurement: {
    title: 'Buying materials',
    plain: 'POs, vendors, deliveries',
    next: 'Raise purchase orders and track vendor supply.',
    focus: ['Select quote items', 'Raise purchase orders', 'Track deliveries'],
    cta: { to: 'procurement', label: 'Open materials' },
    secondary: { to: 'tasks', label: 'Tasks' },
  },
  execution: {
    title: 'Site work',
    plain: 'Daily progress, quality, snags',
    next: 'Post todayâ€™s site update and clear open site tasks.',
    focus: ['Post daily updates', 'Track site progress', 'Resolve snags'],
    cta: { to: 'site?compose=1', label: 'Post site update' },
    secondary: { to: 'tasks', label: 'Site tasks' },
  },
  handover: {
    title: 'Handover',
    plain: 'Snags, final check, warranty',
    next: 'Close remaining snags and hand over to the client.',
    focus: ['Close all snags', 'Complete final inspection', 'Hand over documents'],
    cta: { to: 'site', label: 'Snag list' },
    secondary: { to: 'tasks', label: 'Tasks' },
  },
}

const QUICK = [
  {
    to: 'tasks',
    title: 'Tasks',
    desc: 'Assign work',
    icon: CheckSquare,
  },
  {
    to: 'boq',
    title: 'BOQ',
    desc: 'Quote & rates',
    icon: FileSpreadsheet,
  },
  {
    to: 'procurement',
    title: 'Materials',
    desc: 'POs & vendors',
    icon: Truck,
  },
  {
    to: 'site?compose=1',
    title: 'Site',
    desc: 'Daily update',
    icon: Camera,
  },
  {
    to: 'files',
    title: 'Drawings',
    desc: 'Plans & PDFs',
    icon: FileImage,
  },
  {
    to: 'team',
    title: 'Team',
    desc: 'Who is on this',
    icon: Users,
  },
]

const STAGE_ORDER = ['design', 'planning', 'procurement', 'execution', 'handover']

function stageState(s, current) {
  const currentIdx = STAGE_ORDER.indexOf(current)
  const stageIdx = STAGE_ORDER.indexOf(s.key)
  if (s.status === 'completed' || s.progress >= 100) return 'done'
  // Stages before the active one are complete in the journey
  if (currentIdx >= 0 && stageIdx >= 0 && stageIdx < currentIdx) return 'done'
  if (s.key === current) return 'now'
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
  const canManage = ['admin', 'owner', 'project_manager', 'hr'].includes(
    user?.role,
  ) || user?.isPlatformAdmin

  /** Tabs are siblings of this route, so links must be absolute. */
  const tab = (path) =>
    path === 'boq' ? `/boq/${id}` : `/projects/${id}/${path}`

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
  const { data: fileData } = useQuery({
    queryKey: ['files', id, 'drawings'],
    queryFn: () => api(`/files?projectId=${id}&folder=drawings`),
  })

  const tasks = tasksData?.tasks || []
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const doneTasks = tasks.filter((t) => t.status === 'done')
  const inProgress = tasks.filter((t) => t.status === 'in_progress')
  const overdue = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date(),
  )
  const updates = siteData?.updates || []
  const photos = updates.flatMap((u) => u.photos || []).filter((p) => p?.url)
  const orders = (poData?.purchaseOrders || poData?.orders || []).slice(0, 2)
  const snags = (snagData?.snags || []).filter((s) => s.status !== 'verified')
  const drawings = fileData?.files || []
  const members = project.members || []
  const urgent = [...openTasks].sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    return ad - bd
  })[0]
  const recentUpdates = updates.slice(0, 3)

  const setStage = useMutation({
    mutationFn: (stage) =>
      api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentStage: stage }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      toast('Stage updated', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not update stage', { type: 'error' }),
  })

  const nextStageKey = (() => {
    const i = STAGE_ORDER.indexOf(current)
    return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
  })()
  const currentStageIndex = Math.max(0, STAGE_ORDER.indexOf(current))
  const stageProgress = ((currentStageIndex + 1) / STAGE_ORDER.length) * 100

  return (
    <ProjectPageShell className="space-y-3 bg-[#faf9f7]">
      <div className="flex gap-2 overflow-x-auto">
        <Link
          to={tab('site?compose=1')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7a573b] px-3 py-2 text-[12px] font-semibold text-white"
        >
          <Camera className="h-4 w-4" />
          Log site update
        </Link>
        <Link
          to={tab('procurement')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#efeeec] px-3 py-2 text-[12px] font-semibold text-[#1a1c1b]"
        >
          <Package className="h-4 w-4" />
          Request material
        </Link>
        <Link
          to={tab('tasks')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#efeeec] px-3 py-2 text-[12px] font-semibold text-[#1a1c1b]"
        >
          <PenLine className="h-4 w-4" />
          New task
        </Link>
        {canManage && nextStageKey && (
          <button
            type="button"
            onClick={() => setStage.mutate(nextStageKey)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#efeeec] px-3 py-2 text-[12px] font-semibold text-[#1a1c1b]"
          >
            Advance to {stageLabel(nextStageKey)}
          </button>
        )}
      </div>

      {urgent && (
        <div className="rounded-xl bg-[#e3e2e0] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fdceaa] text-[#79563a]">
              <Flag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7a573b]">
                  Urgent milestone
                </span>
                {urgent.dueDate && (
                  <span className="rounded-full bg-[#ffdad6] px-2 py-0.5 text-[11px] font-semibold text-[#93000a]">
                    {format(new Date(urgent.dueDate), 'd MMM')}
                  </span>
                )}
              </div>
              <h3 className="truncate text-[16px] font-semibold text-[#1a1c1b]">
                {urgent.title}
              </h3>
              <p className="text-[13px] text-[#44474a]">
                {urgent.assignee?.name || 'Unassigned'}
                {help?.plain ? ` · ${help.plain}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-xl bg-[#f4f3f1] p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#44474a]">
              Disbursement
            </span>
            <span className="text-[11px] font-semibold text-[#7a573b]">
              {exactPct == null ? 'No budget' : `${exactPct}% utilized`}
            </span>
          </div>
          <p className="text-[22px] font-medium tabular-nums text-[#1a1c1b]">
            {formatInr(spent)}{' '}
            <span className="text-[13px] font-normal text-[#44474a]">
              / {formatInr(budget)}
            </span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9e8e6]">
            <div
              className={cn('h-full rounded-full', isOverBudget ? 'bg-[#ba1a1a]' : 'bg-[#7a573b]')}
              style={{ width: `${spendBarPct}%` }}
            />
          </div>
        </div>
        <Link to="/approvals" className="flex items-center justify-between rounded-xl bg-[#f4f3f1] p-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#44474a]">
              Sign-offs
            </span>
            <p className="text-[22px] font-medium text-[#1a1c1b]">
              {stats?.pendingApprovals ?? 0} pending
            </p>
            <p className="text-[13px] text-[#44474a]">Waiting review</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffdcc2] text-[#2d1602]">
            <PenLine className="h-4 w-4" />
          </div>
        </Link>
        <Link to={tab('tasks')} className="flex items-center justify-between rounded-xl bg-[#f4f3f1] p-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#44474a]">
              Progression
            </span>
            <p className="text-[22px] font-medium text-[#1a1c1b]">
              {doneTasks.length} tasks
            </p>
            <p className="text-[13px] text-[#224f3c]">Completed</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#bceed3] text-[#002114]">
            <Check className="h-4 w-4" />
          </div>
        </Link>
      </div>

      <div className="flex items-center justify-between pt-1">
        <h3 className="text-[20px] font-medium text-[#1a1c1b]">Workspace pulse</h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#44474a]">
          Live
        </span>
      </div>

      <div className="rounded-xl bg-[#f4f3f1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1a1c1b]">
            <CheckSquare className="h-4 w-4 text-[#7a573b]" />
            Tasks ledger
          </div>
          <span className="text-[11px] text-[#44474a]">{tasks.length} total</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[#efeeec] p-2.5">
            <span className="block text-[22px] font-medium">{Math.max(0, openTasks.length - inProgress.length - overdue.length)}</span>
            <span className="text-[11px] text-[#44474a]">On schedule</span>
          </div>
          <div className="rounded-lg bg-[#efeeec] p-2.5">
            <span className="block text-[22px] font-medium text-[#7a573b]">{inProgress.length}</span>
            <span className="text-[11px] text-[#7a573b]">In progress</span>
          </div>
          <div className="rounded-lg bg-[#ffdad6] p-2.5">
            <span className="block text-[22px] font-medium text-[#93000a]">{overdue.length}</span>
            <span className="text-[11px] text-[#93000a]">Overdue</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-[#f4f3f1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1a1c1b]">
            <Package className="h-4 w-4 text-[#7a573b]" />
            Procurement and orders
          </div>
          <Link to={tab('procurement')} className="text-[11px] font-semibold text-[#7a573b]">
            {orders.length} shown
          </Link>
        </div>
        <div className="space-y-2">
          {orders.length === 0 && (
            <p className="rounded-lg bg-white px-3 py-4 text-[13px] text-[#44474a]">
              No purchase orders yet.
            </p>
          )}
          {orders.map((po) => (
            <div key={po._id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#1a1c1b]">
                  {po.items?.[0]?.name || po.title || 'Purchase order'}
                </p>
                <p className="text-[13px] text-[#44474a]">
                  {po.poNumber || 'PO'} · {po.vendor?.name || 'Vendor'}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#bceed3] px-2.5 py-1 text-[11px] font-semibold uppercase text-[#002114]">
                {String(po.status || 'open').replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#f4f3f1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1a1c1b]">
            <Camera className="h-4 w-4 text-[#7a573b]" />
            Site logs and snags
          </div>
          <Link to={tab('site')} className="text-[11px] text-[#44474a]">
            {photos.length} photos
          </Link>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {photos.slice(0, 3).map((p, i) => (
            <img
              key={p.url || i}
              src={assetUrl(p.url)}
              alt=""
              className="h-20 w-full rounded-lg object-cover"
            />
          ))}
          {photos.length === 0 && (
            <p className="col-span-3 rounded-lg bg-white px-3 py-4 text-[13px] text-[#44474a]">
              No site photos yet.
            </p>
          )}
        </div>
        {snags[0] && (
          <Link to={tab('site')} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ba1a1a]" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#1a1c1b]">{snags[0].title}</p>
                <p className="text-[13px] text-[#44474a]">
                  {snags[0].status || 'Open'}
                  {snags[0].location ? ` · ${snags[0].location}` : ''}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded bg-[#e9e8e6] px-2.5 py-1 text-[11px] font-semibold uppercase">
              Quick review
            </span>
          </Link>
        )}
      </div>

      <div className="rounded-xl bg-[#f4f3f1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1a1c1b]">
            <FileImage className="h-4 w-4 text-[#7a573b]" />
            Architectural drawings
          </div>
          <Link to={tab('files')} className="text-[11px] text-[#44474a]">
            {drawings.length} files
          </Link>
        </div>
        {(drawings[0] && (
          <Link to={tab('files')} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-[#1a1c1b]">{drawings[0].name}</p>
              <p className="text-[13px] text-[#44474a]">
                {drawings[0].approvalStatus || 'Drawing'}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#bceed3] px-2.5 py-1 text-[11px] font-semibold uppercase text-[#002114]">
              {drawings[0].approvalStatus || 'File'}
            </span>
          </Link>
        )) || (
          <p className="rounded-lg bg-white px-3 py-4 text-[13px] text-[#44474a]">No drawings uploaded.</p>
        )}
      </div>

      <div className="rounded-xl bg-[#f4f3f1] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1a1c1b]">
            <Users className="h-4 w-4 text-[#7a573b]" />
            Site roster
          </div>
          <Link to={tab('team')} className="text-[11px] text-[#44474a]">
            {members.length} on the job
          </Link>
        </div>
        {members[0] ? (
          <div className="flex items-center justify-between rounded-lg bg-white p-3">
            <div className="flex items-center gap-3">
              <Avatar name={members[0].user?.name} src={members[0].user?.avatar} size="sm" />
              <div>
                <p className="text-[15px] font-semibold text-[#1a1c1b]">{members[0].user?.name}</p>
                <p className="text-[13px] font-medium text-[#7a573b]">
                  {members[0].role || members[0].user?.title || 'Team'}
                </p>
              </div>
            </div>
            <div className="flex -space-x-2">
              {members.slice(1, 4).map((m) => (
                <span
                  key={m.user?._id || m.user?.name}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9e8e6] text-[10px] font-semibold"
                >
                  {String(m.user?.name || '?').slice(0, 2).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-white px-3 py-4 text-[13px] text-[#44474a]">No team assigned yet.</p>
        )}
      </div>

      {delayed && (
        <div className="flex items-center gap-3 rounded-xl bg-[#ffdad6] px-4 py-2.5 text-sm text-[#93000a]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This project is behind schedule
          <Link to={tab('tasks')} className="ml-auto font-semibold underline">
            Review tasks
          </Link>
        </div>
      )}

      <MeetingNotes projectId={id} project={project} user={user} />
    </ProjectPageShell>
  )
}
