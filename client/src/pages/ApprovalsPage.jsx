import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  FileSpreadsheet,
  FolderOpen,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { formatInr } from '../lib/format'
import { Avatar, Button, Input, Select, SkeletonCard, toast } from '../components/ui'
import { cn } from '../lib/utils'
import {
  PILL_ACTIVE,
  PILL_IDLE,
  PILL_TRACK,
} from '../components/layout/PageToolbar'

const TYPE_ICONS = {
  purchase_order: Truck,
  boq: FileSpreadsheet,
  expense: Wallet,
  task: ListChecks,
  drawing: FolderOpen,
}

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  hr: 'HR',
  project_manager: 'Project manager',
  designer: 'Designer',
  site_supervisor: 'Site supervisor',
  vendor: 'Vendor',
  client: 'Client',
}

const roleLabel = (role) => ROLE_LABELS[role] || role

/**
 * The server hands back the effective bands (see lib/approvals.js
 * `computeBands`) rather than the raw overlapping rules, so there is no
 * routing logic to duplicate here — only how to word a band.
 */
function bandLabel(band, hasAmount) {
  if (band.shadowed) return 'Never applies'
  if (!hasAmount) return 'Every one'
  if (band.max == null) {
    return band.min === 0 ? 'Any amount' : `${formatInr(band.min)} and above`
  }
  return `${formatInr(band.min)} – ${formatInr(band.max - 1)}`
}

export function ApprovalsPage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'inbox' ? 'inbox' : 'routing'
  const [openType, setOpenType] = useState(null)
  const [newType, setNewType] = useState(null)
  const [inboxScope, setInboxScope] = useState('mine')

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', 'flow'],
    queryFn: () => api('/approvals/flow'),
  })

  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ['approvals', 'inbox', inboxScope],
    queryFn: () =>
      api(`/approvals/inbox?scope=${inboxScope === 'all' ? 'all' : 'mine'}`),
    enabled: tab === 'inbox',
    refetchInterval: tab === 'inbox' ? 8000 : false,
  })

  const flow = data?.flow || []
  const members = data?.members || []
  const roles = data?.roles || []
  const inboxItems = inboxData?.items || []
  const inboxCounts = inboxData?.counts || { total: 0 }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['approvals'] })
  const onError = (e) => toast(e.message, { type: 'error' })

  const addRule = useMutation({
    mutationFn: (body) =>
      api('/approvals/rules', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate()
      setOpenType(null)
      toast('Routing added', { type: 'success' })
    },
    onError,
  })

  const removeRule = useMutation({
    mutationFn: (id) => api(`/approvals/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      toast('Routing removed', { type: 'success' })
    },
    onError,
  })

  const addType = useMutation({
    mutationFn: (body) =>
      api('/approvals/types', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate()
      setNewType(null)
      toast('Approval type added', { type: 'success' })
    },
    onError,
  })

  const removeType = useMutation({
    mutationFn: (id) => api(`/approvals/types/${id}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      invalidate()
      toast(
        res?.removedRules
          ? `Type removed with ${res.removedRules} routing rule${res.removedRules === 1 ? '' : 's'}`
          : 'Type removed',
        { type: 'success' },
      )
    },
    onError,
  })

  const decide = useMutation({
    mutationFn: ({ kind, id, decision, note }) =>
      api('/approvals/decide', {
        method: 'POST',
        body: JSON.stringify({ kind, id, decision, note }),
      }),
    onSuccess: (_res, vars) => {
      invalidate()
      toast(vars.decision === 'approved' ? 'Approved' : 'Rejected', { type: 'success' })
    },
    onError,
  })

  const routedCount = useMemo(
    () => (data?.flow || []).reduce((n, t) => n + (t.rules?.length || 0), 0),
    [data],
  )

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'inbox') params.set('tab', 'inbox')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-primary">
            Central approvals
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-secondary">
            Build any approval type, decide who signs off, and act on what is
            waiting for you. Drawing uploads route through “Drawing / file” and
            pop up for the assigned employee.
          </p>
        </div>
        {tab === 'routing' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNewType({ label: '', description: '' })}
          >
            <Plus className="h-3.5 w-3.5" />
            New type
          </Button>
        )}
      </header>

      <div className={PILL_TRACK}>
        <button
          type="button"
          onClick={() => setTab('routing')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
            tab === 'routing' ? PILL_ACTIVE : PILL_IDLE,
          )}
        >
          Routing
        </button>
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
            tab === 'inbox' ? PILL_ACTIVE : PILL_IDLE,
          )}
        >
          Inbox
          {tab === 'inbox' && inboxCounts.total > 0 ? (
            <span className="ml-1.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              {inboxCounts.total}
            </span>
          ) : null}
        </button>
      </div>

      {tab === 'inbox' ? (
        <InboxPanel
          items={inboxItems}
          loading={inboxLoading}
          scope={inboxScope}
          setScope={setInboxScope}
          onDecide={(item, decision) => {
            const note = decision === 'rejected' ? window.prompt('Reason for rejection') : ''
            if (decision === 'rejected' && !note?.trim()) return
            decide.mutate({ kind: item.kind, id: item.id, decision, note })
          }}
          deciding={decide.isPending}
        />
      ) : (
        <>
          {!isLoading && routedCount === 0 && (
            <div className="flex items-start gap-3 rounded-[10px] border border-border bg-surface-raised px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
              <p className="text-[13px] leading-relaxed text-secondary">
                No routing set up yet. Add a rule under{' '}
                <strong>Drawing / file</strong> so uploads can be sent for
                approval — the assigned person gets a live popup.
              </p>
            </div>
          )}

          {newType && (
            <NewTypeForm
              draft={newType}
              setDraft={setNewType}
              onCancel={() => setNewType(null)}
              onSubmit={() => addType.mutate(newType)}
              pending={addType.isPending}
            />
          )}

          {isLoading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            flow.map((type) => (
              <TypeCard
                key={type.key}
                type={type}
                roles={roles}
                members={members}
                isOpen={openType === type.key}
                onToggle={() =>
                  setOpenType(openType === type.key ? null : type.key)
                }
                onAddRule={(body) =>
                  addRule.mutate({ ...body, entityType: type.key })
                }
                addPending={addRule.isPending}
                onRemoveRule={(id) => removeRule.mutate(id)}
                onRemoveType={() => {
                  if (
                    window.confirm(
                      `Remove “${type.label}” and any routing on it? Records already routed keep their approver.`,
                    )
                  ) {
                    removeType.mutate(type._id)
                  }
                }}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function InboxPanel({ items, loading, scope, setScope, onDecide, deciding }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-secondary">
          Items waiting for sign-off. Drawing approvals also appear as a popup
          for the assigned employee.
        </p>
        <div className={PILL_TRACK}>
          <button
            type="button"
            onClick={() => setScope('mine')}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] font-semibold transition',
              scope === 'mine' ? PILL_ACTIVE : PILL_IDLE,
            )}
          >
            Assigned to me
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] font-semibold transition',
              scope === 'all' ? PILL_ACTIVE : PILL_IDLE,
            )}
          >
            All pending
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonCard />
      ) : items.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-surface px-5 py-10 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-secondary" />
          <p className="mt-3 text-[14px] font-semibold text-primary">
            Nothing waiting
          </p>
          <p className="mt-1 text-[13px] text-secondary">
            When someone sends a drawing for approval, it shows up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-surface-raised px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
                    {item.kind}
                  </span>
                  <p className="truncate text-[14px] font-semibold text-primary">
                    {item.title}
                  </p>
                </div>
                <p className="mt-0.5 text-[12px] text-secondary">
                  {item.subtitle}
                  {item.requestedBy?.name
                    ? ` · from ${item.requestedBy.name}`
                    : ''}
                  {item.amount != null ? ` · ${formatInr(item.amount)}` : ''}
                </p>
                {item.stepTotal > 1 ? (
                  <p className="mt-1 text-[12px] text-secondary">
                    Step {item.step + 1} of {item.stepTotal}
                    {item.stepRole ? ` · ${roleLabel(item.stepRole)}` : ''}
                  </p>
                ) : null}
                {item.note ? (
                  <p className="mt-1 text-[12px] italic text-secondary">
                    “{item.note}”
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                {item.previewUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(assetUrl(item.previewUrl), '_blank')
                    }
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-secondary hover:border-accent/40"
                  >
                    Open
                  </button>
                ) : item.link ? (
                  <Link
                    to={item.link}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-secondary hover:border-accent/40"
                  >
                    Open
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={deciding}
                  onClick={() => onDecide(item, 'rejected')}
                >
                  Reject
                </Button>
                <Button size="sm" disabled={deciding} onClick={() => onDecide(item, 'approved')}>
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewTypeForm({ draft, setDraft, onCancel, onSubmit, pending }) {
  return (
    <div className="rounded-[12px] border border-accent/30 bg-surface p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-primary">New approval type</h2>
      <p className="mt-0.5 text-[12px] text-secondary">
        For a process the app doesn&rsquo;t model yet — a site indent, a leave
        request, a change order.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Input
          label="Name"
          value={draft.label}
          placeholder="e.g. Site material indent"
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <Input
          label="Description"
          value={draft.description}
          placeholder="What it covers"
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={onSubmit} loading={pending} disabled={!draft.label.trim()}>
          Add type
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function TypeCard({
  type,
  roles,
  members,
  isOpen,
  onToggle,
  onAddRule,
  addPending,
  onRemoveRule,
  onRemoveType,
}) {
  const Icon = TYPE_ICONS[type.key] || Building2
  const hasAmount = !!type.amountPath
  const bands = type.bands || []

  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-surface-raised">
            <Icon className="h-4 w-4 text-secondary" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-primary">{type.label}</h2>
              {!type.isBuiltin && (
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                  Custom
                </span>
              )}
            </div>
            {type.description && (
              <p className="mt-0.5 text-[12px] text-secondary">{type.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onToggle}>
            <Plus className="h-3.5 w-3.5" />
            Add routing
          </Button>
          {!type.isBuiltin && (
            <button
              type="button"
              onClick={onRemoveType}
              aria-label={`Remove ${type.label}`}
              className="grid h-8 w-8 place-items-center rounded-[6px] text-muted transition hover:bg-status-delayed/10 hover:text-status-delayed"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-3.5 sm:px-5">
        {bands.length === 0 ? (
          <p className="py-2 text-[13px] text-secondary">
            No routing — these don&rsquo;t need approval.
          </p>
        ) : (
          <ol className="space-y-2">
            {bands.map((band, i) => (
              <RuleRow
                key={`${band.ruleId}-${i}`}
                band={band}
                hasAmount={hasAmount}
                onRemove={() => onRemoveRule(band.ruleId)}
              />
            ))}
          </ol>
        )}

        {isOpen && (
          <RuleForm
            hasAmount={hasAmount}
            roles={roles}
            members={members}
            pending={addPending}
            onCancel={onToggle}
            onSubmit={onAddRule}
          />
        )}
      </div>
    </section>
  )
}

function RuleRow({ band, hasAmount, onRemove }) {
  const { rule, shadowed } = band
  const approver = rule?.resolvedApprover
  const pinned = !!rule?.approverUser

  return (
    <li
      className={cn(
        'group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[8px] px-3 py-2.5',
        shadowed ? 'bg-status-delayed/5 ring-1 ring-inset ring-status-delayed/20' : 'bg-surface-raised',
      )}
    >
      <span
        className={cn(
          'min-w-[9rem] text-[12px] font-semibold tabular-nums',
          shadowed ? 'text-status-delayed' : 'text-primary',
        )}
        title={shadowed ? 'A later band starts at or below this one, so nothing reaches it' : undefined}
      >
        {bandLabel(band, hasAmount)}
      </span>

      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />

      {(rule?.steps?.length ? rule.steps : [{ resolvedApprover: approver, approverRole: rule?.approverRole }]).map((step, index, list) => (
        <span key={index} className="flex min-w-0 items-center gap-2">
          {index > 0 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" /> : null}
          <span className="truncate text-[13px] font-medium text-primary">
            {step.resolvedApprover?.name || roleLabel(step.approverRole) || 'Approver'}
            {list.length > 1 ? ` (${index + 1})` : ''}
          </span>
        </span>
      ))}
      {!approver && !(rule?.steps?.length) ? (
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-status-delayed">
          <UserRound className="h-3.5 w-3.5" />
          Nobody in this role
        </span>
      ) : null}

      <span className="flex items-center gap-1.5 text-[11px] text-secondary">
        {pinned ? (
          <>
            <BadgeCheck className="h-3 w-3" />
            Pinned
          </>
        ) : (
          roleLabel(rule?.approverRole)
        )}
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this routing"
        className={cn(
          'ml-auto grid h-7 w-7 place-items-center rounded-[6px] text-muted transition',
          'hover:bg-status-delayed/10 hover:text-status-delayed',
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

function RuleForm({ hasAmount, roles, members, pending, onCancel, onSubmit }) {
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [steps, setSteps] = useState([{ approverRole: 'project_manager', approverUser: '' }])

  const submit = () => {
    const clean = steps.map((step) => {
      const pinned = members.find((m) => m._id === step.approverUser)
      return {
        approverRole: pinned?.role || step.approverRole,
        approverUser: step.approverUser || null,
      }
    })
    onSubmit({
      minAmount: hasAmount && minAmount !== '' ? Number(minAmount) : 0,
      maxAmount: hasAmount && maxAmount !== '' ? Number(maxAmount) : null,
      approverRole: clean[0].approverRole,
      approverUser: clean[0].approverUser,
      steps: clean,
    })
  }

  return (
    <div className="mt-3 rounded-[10px] border border-border bg-surface p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        {hasAmount && (
          <>
            <Input
              label="From amount"
              type="number"
              min="0"
              placeholder="0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              hint="Leave blank to start at zero"
            />
            <Input
              label="Up to (optional)"
              type="number"
              min="0"
              placeholder="No upper limit"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              hint="Blank means this band has no ceiling"
            />
          </>
        )}
        {steps.map((step, index) => (
          <div key={index} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Select
              label={steps.length > 1 ? `Step ${index + 1} role` : 'Approver role'}
              value={step.approverRole}
              onChange={(e) =>
                setSteps((prev) => prev.map((row, i) => (i === index ? { ...row, approverRole: e.target.value } : row)))
              }
              options={roles.map((r) => ({ value: r, label: roleLabel(r) }))}
            />
            <Select
              label={steps.length > 1 ? `Step ${index + 1} person` : 'Pin to a person (optional)'}
              value={step.approverUser}
              onChange={(e) =>
                setSteps((prev) => prev.map((row, i) => (i === index ? { ...row, approverUser: e.target.value } : row)))
              }
              options={[
                { value: '', label: 'Anyone in that role' },
                ...members.map((m) => ({ value: m._id, label: `${m.name} · ${roleLabel(m.role)}` })),
              ]}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-[12px] font-semibold text-secondary"
        onClick={() => setSteps((prev) => [...prev, { approverRole: 'owner', approverUser: '' }])}
      >
        Add next approver
      </button>
      {steps.length > 1 ? (
        <button
          type="button"
          className="ml-3 mt-3 text-[12px] font-semibold text-secondary"
          onClick={() => setSteps((prev) => prev.slice(0, -1))}
        >
          Remove last step
        </button>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={submit} loading={pending}>
          Add routing
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
