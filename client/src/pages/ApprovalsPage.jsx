import { useEffect, useMemo, useState } from 'react'
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
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../lib/api'
import { formatInr } from '../lib/format'
import { isCompanyAdmin } from '../lib/roles'
import { Avatar, Button, Input, Select, SkeletonCard, toast } from '../components/ui'
import { cn } from '../lib/utils'

const TYPE_ICONS = {
  purchase_order: Truck,
  boq: FileSpreadsheet,
  expense: Wallet,
  task: ListChecks,
  drawing: FolderOpen,
  file: FolderOpen,
}

const KIND = {
  file: { label: 'Drawing', tint: '#1e2022', soft: '#f3f1ee' },
  expense: { label: 'Expense', tint: '#7a573b', soft: '#f7f1eb' },
  purchase_order: { label: 'Order', tint: '#c4823f', soft: '#fbf4ec' },
  boq: { label: 'Quotation', tint: '#2d5a46', soft: '#eef4f1' },
  task: { label: 'Task', tint: '#68645e', soft: '#f4f3f1' },
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

const roleLabel = (role) => ROLE_LABELS[role] || role || 'Approver'

function bandLabel(band, hasAmount) {
  if (band.shadowed) return 'Never applies'
  if (!hasAmount) return 'Every one'
  if (band.max == null) {
    return band.min === 0 ? 'Any amount' : `${formatInr(band.min)} and above`
  }
  return `${formatInr(band.min)} – ${formatInr(band.max - 1)}`
}

function whenLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function kindOf(item) {
  return KIND[item?.kind] || { label: item?.kind || 'Item', tint: '#1e2022', soft: '#f4f3f1' }
}

function openHref(item) {
  if (item?.kind === 'boq' && item.projectId) return `/boq/${item.projectId}`
  return item?.link || ''
}

export function ApprovalsPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canRoute = !!user?.isPlatformAdmin || isCompanyAdmin(user)
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'routing' ? 'routing' : 'inbox'
  const [openType, setOpenType] = useState(null)
  const [newType, setNewType] = useState(null)
  const [inboxScope, setInboxScope] = useState('mine')
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', 'flow'],
    queryFn: () => api('/approvals/flow'),
  })

  const scope = canRoute && inboxScope === 'all' ? 'all' : 'mine'
  const { data: inboxData, isLoading: inboxLoading } = useQuery({
    queryKey: ['approvals', 'inbox', scope],
    queryFn: () => api(`/approvals/inbox?scope=${scope}`),
    refetchInterval: tab === 'inbox' ? 8000 : 20000,
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
    mutationFn: ({ kind: itemKind, id, decision, note }) =>
      api('/approvals/decide', {
        method: 'POST',
        body: JSON.stringify({ kind: itemKind, id, decision, note }),
      }),
    onSuccess: (_res, vars) => {
      invalidate()
      toast(vars.decision === 'approved' ? 'Approved' : 'Sent back', { type: 'success' })
    },
    onError,
  })

  const routedCount = useMemo(
    () => flow.reduce((n, t) => n + (t.rules?.length || 0), 0),
    [flow],
  )
  const customTypes = flow.filter((t) => !t.isBuiltin)
  const builtinTypes = flow.filter((t) => t.isBuiltin)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inboxItems.filter((item) => {
      if (kind === 'money' && !['expense', 'purchase_order', 'boq'].includes(item.kind)) return false
      if (kind !== 'all' && kind !== 'money' && item.kind !== kind) return false
      if (!q) return true
      return [item.title, item.subtitle, item.projectName, item.requestedBy?.name, item.kind]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(q))
    })
  }, [inboxItems, kind, query])

  useEffect(() => {
    if (!filtered.length) {
      setSelectedKey('')
      return
    }
    if (!filtered.some((item) => `${item.kind}-${item.id}` === selectedKey)) {
      setSelectedKey(`${filtered[0].kind}-${filtered[0].id}`)
    }
  }, [filtered, selectedKey])

  const selected = filtered.find((item) => `${item.kind}-${item.id}` === selectedKey) || null

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'routing') params.set('tab', 'routing')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const kindCounts = useMemo(() => {
    const counts = { all: inboxItems.length }
    for (const item of inboxItems) counts[item.kind] = (counts[item.kind] || 0) + 1
    return counts
  }, [inboxItems])

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a27b5c]">
            Studio sign-off
          </p>
          <h1 className="mt-1 text-[32px] font-medium tracking-[-0.03em] text-[#1e2022]">
            Approvals
          </h1>
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-[#68645e]">
            What is waiting for a signature, and who signs each kind of work.
            Custom types sit alongside drawings, quotes, orders, and expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ModeButton active={tab === 'inbox'} onClick={() => setTab('inbox')}>
            Inbox
            {inboxCounts.total > 0 ? (
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  background: tab === 'inbox' ? 'rgba(250,249,247,0.18)' : '#f7f1eb',
                  color: tab === 'inbox' ? '#faf9f7' : '#7a573b',
                }}
              >
                {inboxCounts.total}
              </span>
            ) : null}
          </ModeButton>
          <ModeButton active={tab === 'routing'} onClick={() => setTab('routing')}>
            Routing
          </ModeButton>
        </div>
      </header>

      {tab === 'inbox' ? (
        <InboxDesk
          items={filtered}
          total={inboxItems.length}
          loading={inboxLoading}
          kindCounts={kindCounts}
          kind={kind}
          setKind={setKind}
          query={query}
          setQuery={setQuery}
          scope={scope}
          canSeeAll={canRoute}
          setScope={setInboxScope}
          selected={selected}
          onSelect={(item) => setSelectedKey(`${item.kind}-${item.id}`)}
          onDecide={(item, decision, note) => {
            if (decision === 'rejected' && !note?.trim()) {
              toast('Add a reason before sending it back', { type: 'error' })
              return
            }
            decide.mutate({
              kind: item.kind,
              id: item.id,
              decision,
              note: note?.trim() || '',
            })
          }}
          deciding={decide.isPending}
        />
      ) : (
        <RoutingDesk
          loading={isLoading}
          routedCount={routedCount}
          customTypes={customTypes}
          builtinTypes={builtinTypes}
          roles={roles}
          members={members}
          canRoute={canRoute}
          openType={openType}
          setOpenType={setOpenType}
          newType={newType}
          setNewType={setNewType}
          onAddType={() => addType.mutate(newType)}
          addTypePending={addType.isPending}
          onAddRule={(body) => addRule.mutate(body)}
          addRulePending={addRule.isPending}
          onRemoveRule={(id) => removeRule.mutate(id)}
          onRemoveType={(type) => {
            if (
              window.confirm(
                `Remove “${type.label}” and any routing on it? Records already routed keep their approver.`,
              )
            ) {
              removeType.mutate(type._id)
            }
          }}
        />
      )}
    </div>
  )
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold transition"
      style={
        active
          ? { background: '#1e2022', color: '#faf9f7' }
          : { background: '#fff', color: '#68645e', boxShadow: 'inset 0 0 0 1px #e5dfd7' }
      }
    >
      {children}
    </button>
  )
}

function InboxDesk({
  items,
  total,
  loading,
  kindCounts,
  kind,
  setKind,
  query,
  setQuery,
  scope,
  canSeeAll,
  setScope,
  selected,
  onSelect,
  onDecide,
  deciding,
}) {
  return (
    <div className="grid h-[calc(100dvh-13.5rem)] min-h-[560px] items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <section className="flex min-h-0 min-w-0 flex-col rounded-[22px] bg-white p-3 shadow-[0_16px_40px_-28px_rgba(30,32,34,0.5)] sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9a948c]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the queue"
                className="h-9 w-full rounded-full border border-[#e7e1d8] bg-[#faf9f7] pl-8 pr-3 text-[12.5px] text-[#1e2022] outline-none focus:border-[#c8b8a6]"
              />
            </div>
            {canSeeAll ? (
              <div className="inline-flex rounded-full bg-[#f4f3f1] p-0.5">
                <ScopeChip active={scope === 'mine'} onClick={() => setScope('mine')}>
                  Mine
                </ScopeChip>
                <ScopeChip active={scope === 'all'} onClick={() => setScope('all')}>
                  Whole studio
                </ScopeChip>
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {[
              ['all', 'All'],
              ['file', 'Drawings'],
              ['boq', 'Quotes'],
              ['purchase_order', 'Orders'],
              ['expense', 'Expenses'],
              ['task', 'Tasks'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-full px-2 text-[11.5px] font-semibold"
                style={
                  kind === key
                    ? { background: '#1e2022', color: '#faf9f7' }
                    : { background: '#f4f3f1', color: '#68645e' }
                }
              >
                {label}
                <span className="tabular-nums opacity-70">{kindCounts[key] || 0}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="mt-3 min-h-0 flex-1">
              <SkeletonCard />
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 text-center">
              <BadgeCheck className="mx-auto h-7 w-7 text-[#2d5a46]" />
              <p className="mt-3 text-[15px] font-semibold text-[#1e2022]">
                {total ? 'Nothing in this filter' : 'The desk is clear'}
              </p>
              <p className="mt-1 text-[12.5px] text-[#68645e]">
                {total
                  ? 'Try another kind, or clear the search.'
                  : 'Drawings, quotes, orders, expenses, and tasks land here when they need a signature.'}
              </p>
            </div>
          ) : (
            <ul className="mt-2 min-h-0 flex-1 divide-y divide-[#f0ece6] overflow-y-auto">
              {items.map((item) => {
                const meta = kindOf(item)
                const active = selected && selected.id === item.id && selected.kind === item.kind
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition"
                      style={{ background: active ? '#faf9f7' : 'transparent' }}
                    >
                      <span
                        className="mt-1 h-8 w-1 shrink-0 rounded-full"
                        style={{ background: meta.tint }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                            style={{ background: meta.soft, color: meta.tint }}
                          >
                            {meta.label}
                          </span>
                          <span className="truncate text-[13.5px] font-semibold text-[#1e2022]">
                            {item.title}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#68645e]">
                          {item.projectName || item.subtitle}
                          {item.amount != null ? ` · ${formatInr(item.amount)}` : ''}
                          {item.requestedAt ? ` · ${whenLabel(item.requestedAt)}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <Dossier item={selected} onDecide={onDecide} deciding={deciding} />
    </div>
  )
}

function ScopeChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-full px-3 text-[12px] font-semibold"
      style={active ? { background: '#fff', color: '#1e2022' } : { color: '#68645e' }}
    >
      {children}
    </button>
  )
}

function Dossier({ item, onDecide, deciding }) {
  const [note, setNote] = useState('')
  useEffect(() => {
    setNote('')
  }, [item?.id, item?.kind])

  if (!item) {
    return (
      <aside className="flex h-full min-h-0 flex-col rounded-[22px] bg-[#1e2022] px-5 py-8 text-[#faf9f7]">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#c8b8a6]">
          Selected
        </p>
        <p className="mt-3 text-[20px] font-medium tracking-[-0.02em]">
          Pick something from the queue
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#d5cfc7]">
          The reason, the amount, and the signature chain open here.
        </p>
      </aside>
    )
  }

  const meta = kindOf(item)
  const href = openHref(item)

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-[22px] bg-white p-4 shadow-[0_16px_40px_-28px_rgba(30,32,34,0.5)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ background: meta.soft, color: meta.tint }}
        >
          {meta.label}
        </span>
        {item.requestedAt ? (
          <span className="text-[12px] text-[#8a847c]">{whenLabel(item.requestedAt)}</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <h2 className="mt-3 text-[20px] font-medium leading-tight tracking-[-0.02em] text-[#1e2022]">
        {item.title}
      </h2>
      <p className="mt-1 text-[13px] text-[#68645e]">{item.projectName || item.subtitle}</p>

      {item.amount != null ? (
        <p className="mt-4 text-[26px] font-medium tabular-nums leading-none tracking-[-0.03em] text-[#1e2022]">
          {formatInr(item.amount)}
        </p>
      ) : null}

      <dl className="mt-4 space-y-2 text-[12.5px]">
        {item.requestedBy?.name ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#8a847c]">Asked by</dt>
            <dd className="flex items-center gap-2 font-medium text-[#1e2022]">
              <Avatar name={item.requestedBy.name} src={item.requestedBy.avatar} size="xs" />
              {item.requestedBy.name}
            </dd>
          </div>
        ) : null}
        {item.approver?.name ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#8a847c]">With</dt>
            <dd className="font-medium text-[#1e2022]">{item.approver.name}</dd>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#8a847c]">With</dt>
            <dd className="font-medium text-[#9e3b3b]">No one assigned</dd>
          </div>
        )}
        {item.stepTotal > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#8a847c]">Chain</dt>
            <dd className="font-medium text-[#1e2022]">
              Step {item.step + 1} of {item.stepTotal}
              {item.stepRole ? ` · ${roleLabel(item.stepRole)}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      {item.stepTotal > 1 ? (
        <ol className="mt-3 flex items-center gap-1.5">
          {Array.from({ length: item.stepTotal }).map((_, i) => (
            <li
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i < item.step ? '#2d5a46' : i === item.step ? '#a27b5c' : '#e7e1d8',
              }}
            />
          ))}
        </ol>
      ) : null}

      {item.note ? (
        <p className="mt-4 rounded-2xl bg-[#faf9f7] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#4c4843]">
          “{item.note}”
        </p>
      ) : null}

      {item.history?.length ? (
        <ul className="mt-3 space-y-1.5">
          {item.history.map((h, i) => (
            <li key={i} className="text-[12px] text-[#68645e]">
              <span className="font-semibold text-[#1e2022]">{h.action}</span>
              {h.note ? ` — ${h.note}` : ''}
              {h.at ? ` · ${whenLabel(h.at)}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      </div>

      <label className="mt-4 block shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a847c]">
        Note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Required if you send this back"
          className="mt-1.5 w-full resize-none rounded-2xl border border-[#e7e1d8] bg-[#faf9f7] px-3 py-2 text-[13px] font-normal normal-case tracking-normal text-[#1e2022] outline-none focus:border-[#c8b8a6]"
        />
      </label>

      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
        {item.previewUrl ? (
          <button
            type="button"
            onClick={() => window.open(assetUrl(item.previewUrl), '_blank')}
            className="h-9 rounded-full border border-[#e5dfd7] px-3 text-[12.5px] font-semibold text-[#4c4843]"
          >
            Open file
          </button>
        ) : href ? (
          <Link
            to={href}
            className="inline-flex h-9 items-center rounded-full border border-[#e5dfd7] px-3 text-[12.5px] font-semibold text-[#4c4843]"
          >
            Open
          </Link>
        ) : null}
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(item, 'rejected', note)}
          className="h-9 rounded-full px-3 text-[12.5px] font-semibold text-[#9e3b3b] disabled:opacity-50"
        >
          Send back
        </button>
        <button
          type="button"
          disabled={deciding}
          onClick={() => onDecide(item, 'approved', note)}
          className="ml-auto h-9 rounded-full bg-[#1e2022] px-4 text-[12.5px] font-semibold disabled:opacity-50"
          style={{ color: '#faf9f7' }}
        >
          {deciding ? 'Saving…' : 'Approve'}
        </button>
      </div>
    </aside>
  )
}

function RoutingDesk({
  loading,
  routedCount,
  customTypes,
  builtinTypes,
  roles,
  members,
  canRoute,
  openType,
  setOpenType,
  newType,
  setNewType,
  onAddType,
  addTypePending,
  onAddRule,
  addRulePending,
  onRemoveRule,
  onRemoveType,
}) {
  return (
    <div className="space-y-5">
      {!loading && routedCount === 0 ? (
        <div className="flex items-start gap-3 rounded-[22px] bg-[#f7f1eb] px-4 py-3.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7a573b]" />
          <p className="text-[13px] leading-relaxed text-[#4c4843]">
            Nothing is routed yet. Add a person under Drawing / file so an upload can be sent for
            a signature, and that person gets it on this desk.
          </p>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1e2022]">
              Made for this studio
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#68645e]">
              A process the built-in types do not cover — a site indent, a leave, a change order.
            </p>
          </div>
          {canRoute && !newType ? (
            <button
              type="button"
              onClick={() => setNewType({ label: '', description: '' })}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1e2022] px-3.5 text-[12.5px] font-semibold"
              style={{ color: '#faf9f7' }}
            >
              <Plus className="h-3.5 w-3.5" />
              New type
            </button>
          ) : null}
        </div>
        {newType ? (
          <NewTypeForm
            draft={newType}
            setDraft={setNewType}
            onCancel={() => setNewType(null)}
            onSubmit={onAddType}
            pending={addTypePending}
          />
        ) : null}
        {customTypes.length === 0 && !newType ? (
          <div className="rounded-[22px] border border-dashed border-[#d9cfc3] bg-white px-5 py-8 text-center">
            <p className="text-[14px] font-semibold text-[#1e2022]">No custom types yet</p>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-[#68645e]">
              Built-in types cover drawings, quotes, orders, expenses, and tasks. Add your own when
              the studio signs something else.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {customTypes.map((type) => (
              <TypeCard
                key={type.key}
                type={type}
                roles={roles}
                members={members}
                canRoute={canRoute}
                isOpen={openType === type.key}
                onToggle={() => setOpenType(openType === type.key ? null : type.key)}
                onAddRule={(body) => onAddRule({ ...body, entityType: type.key })}
                addPending={addRulePending}
                onRemoveRule={onRemoveRule}
                onRemoveType={() => onRemoveType(type)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1e2022]">
          Studio defaults
        </h2>
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          builtinTypes.map((type) => (
            <TypeCard
              key={type.key}
              type={type}
              roles={roles}
              members={members}
              canRoute={canRoute}
              isOpen={openType === type.key}
              onToggle={() => setOpenType(openType === type.key ? null : type.key)}
              onAddRule={(body) => onAddRule({ ...body, entityType: type.key })}
              addPending={addRulePending}
              onRemoveRule={onRemoveRule}
              onRemoveType={() => onRemoveType(type)}
            />
          ))
        )}
      </section>
    </div>
  )
}

function NewTypeForm({ draft, setDraft, onCancel, onSubmit, pending }) {
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_16px_40px_-28px_rgba(30,32,34,0.45)] sm:p-5">
      <h2 className="text-[15px] font-semibold text-[#1e2022]">New approval type</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Input
          label="Name"
          value={draft.label}
          placeholder="e.g. Site material indent"
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <Input
          label="What it covers"
          value={draft.description}
          placeholder="When the studio should sign this"
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
  canRoute,
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
    <section className="rounded-[22px] bg-white shadow-[0_16px_40px_-28px_rgba(30,32,34,0.4)]">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f7f1eb] text-[#7a573b]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-[#1e2022]">{type.label}</h2>
              {!type.isBuiltin ? (
                <span className="rounded-full bg-[#f7f1eb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a573b]">
                  Yours
                </span>
              ) : null}
              <span className="text-[12px] text-[#8a847c]">
                {bands.length ? `${bands.length} band${bands.length === 1 ? '' : 's'}` : 'Open'}
              </span>
            </div>
            {type.description ? (
              <p className="mt-0.5 text-[12.5px] text-[#68645e]">{type.description}</p>
            ) : null}
          </div>
        </div>
        {canRoute ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-[#4c4843]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add routing
            </button>
            {!type.isBuiltin ? (
              <button
                type="button"
                onClick={onRemoveType}
                aria-label={`Remove ${type.label}`}
                className="grid h-8 w-8 place-items-center rounded-full text-[#8a847c] transition hover:bg-[#f8ecec] hover:text-[#9e3b3b]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="px-4 pb-4 sm:px-5">
        {bands.length === 0 ? (
          <p className="rounded-2xl bg-[#faf9f7] px-3 py-3 text-[13px] text-[#68645e]">
            No routing. These move ahead without a signature.
          </p>
        ) : (
          <ol className="relative space-y-2 border-l border-[#eadfce] pl-4">
            {bands.map((band, i) => (
              <RuleRow
                key={`${band.ruleId}-${i}`}
                band={band}
                hasAmount={hasAmount}
                canRoute={canRoute}
                onRemove={() => onRemoveRule(band.ruleId)}
              />
            ))}
          </ol>
        )}

        {hasAmount ? <TryAmount entityType={type.key} /> : null}

        {isOpen && canRoute ? (
          <RuleForm
            hasAmount={hasAmount}
            roles={roles}
            members={members}
            pending={addPending}
            onCancel={onToggle}
            onSubmit={onAddRule}
          />
        ) : null}
      </div>
    </section>
  )
}

function TryAmount({ entityType }) {
  const [amount, setAmount] = useState('')
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    try {
      const res = await api(
        `/approvals/preview?entityType=${encodeURIComponent(entityType)}&amount=${encodeURIComponent(amount || '0')}`,
      )
      setResult(res)
    } catch (e) {
      toast(e.message || 'Could not check that amount', { type: 'error' })
    } finally {
      setChecking(false)
    }
  }

  const name =
    result?.approver?.name ||
    (result && !result.approver && result.rule ? 'No one in that role' : '')

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[#faf9f7] px-3 py-2.5">
      <span className="text-[12px] font-semibold text-[#68645e]">Try an amount</span>
      <input
        type="number"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="₹"
        className="h-8 w-28 rounded-full border border-[#e7e1d8] bg-white px-3 text-[12.5px] outline-none"
      />
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="h-8 rounded-full px-3 text-[12px] font-semibold text-[#7a573b] disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Who signs'}
      </button>
      {result ? (
        <span className="text-[12.5px] font-medium text-[#1e2022]">
          {result.rule ? name || 'Routed' : 'No band covers this'}
        </span>
      ) : null}
    </div>
  )
}

function RuleRow({ band, hasAmount, canRoute, onRemove }) {
  const { rule, shadowed } = band
  const approver = rule?.resolvedApprover
  const pinned = !!rule?.approverUser
  const steps = rule?.steps?.length
    ? rule.steps
    : [{ resolvedApprover: approver, approverRole: rule?.approverRole }]

  return (
    <li className="relative">
      <span
        className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-white"
        style={{ background: shadowed ? '#9e3b3b' : '#a27b5c' }}
      />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2.5"
        style={{ background: shadowed ? '#f8ecec' : '#faf9f7' }}
      >
        <span
          className="min-w-[8.5rem] text-[12px] font-semibold tabular-nums"
          style={{ color: shadowed ? '#9e3b3b' : '#1e2022' }}
          title={
            shadowed
              ? 'A later band starts at or below this one, so nothing reaches it'
              : undefined
          }
        >
          {bandLabel(band, hasAmount)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#b7b1a8]" />
        {steps.map((step, index) => (
          <span key={index} className="flex min-w-0 items-center gap-2">
            {index > 0 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#b7b1a8]" /> : null}
            {step.resolvedApprover ? (
              <Avatar
                name={step.resolvedApprover.name}
                src={step.resolvedApprover.avatar}
                size="xs"
              />
            ) : (
              <UserRound className="h-3.5 w-3.5 text-[#9e3b3b]" />
            )}
            <span className="truncate text-[13px] font-medium text-[#1e2022]">
              {step.resolvedApprover?.name || roleLabel(step.approverRole)}
            </span>
          </span>
        ))}
        <span className="text-[11px] text-[#8a847c]">
          {pinned ? 'Pinned' : roleLabel(rule?.approverRole)}
        </span>
        {canRoute ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this routing"
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[#8a847c] transition hover:bg-[#f8ecec] hover:text-[#9e3b3b]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
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
    <div className="mt-3 rounded-2xl border border-[#eadfce] bg-white p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        {hasAmount ? (
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
        ) : null}
        {steps.map((step, index) => (
          <div key={index} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Select
              label={steps.length > 1 ? `Step ${index + 1} role` : 'Approver role'}
              value={step.approverRole}
              onChange={(e) =>
                setSteps((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, approverRole: e.target.value } : row)),
                )
              }
              options={roles.map((r) => ({ value: r, label: roleLabel(r) }))}
            />
            <Select
              label={steps.length > 1 ? `Step ${index + 1} person` : 'Pin to a person (optional)'}
              value={step.approverUser}
              onChange={(e) =>
                setSteps((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, approverUser: e.target.value } : row)),
                )
              }
              options={[
                { value: '', label: 'Anyone in that role' },
                ...members.map((m) => ({
                  value: m._id,
                  label: `${m.name} · ${roleLabel(m.role)}`,
                })),
              ]}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-[12px] font-semibold text-[#7a573b]"
        onClick={() => setSteps((prev) => [...prev, { approverRole: 'owner', approverUser: '' }])}
      >
        Add next approver
      </button>
      {steps.length > 1 ? (
        <button
          type="button"
          className="ml-3 mt-3 text-[12px] font-semibold text-[#68645e]"
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
