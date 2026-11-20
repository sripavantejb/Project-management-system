import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Building2,
  ChevronDown,
  FileImage,
  FileText,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../lib/api'
import { formatInr, stageLabel } from '../lib/format'
import { cn } from '../lib/utils'
import { PageToolbar, PILL_ACTIVE, PILL_IDLE, PILL_TRACK } from '../components/layout/PageToolbar'
import {
  Avatar,
  Button,
  Drawer,
  EmptyState,
  Input,
  Modal,
  SkeletonCard,
  StatusChip,
  toast,
} from '../components/ui'

const PIPELINE = [
  'new_enquiry',
  'site_visit',
  'mood_board',
  'quotation_sent',
  'negotiation',
  'hot',
  'dead',
]

const CLOSED_STAGES = ['hot', 'dead', 'won', 'lost']

function normalizeStage(stage) {
  if (stage === 'won') return 'hot'
  if (stage === 'lost') return 'dead'
  return stage
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'active', label: 'Open pipeline' },
]

const SOURCES = [
  'Website',
  'Referral',
  'Walk-in',
  'Instagram',
  'WhatsApp',
  'Partner',
  'Other',
]

function ownerIdOf(lead) {
  if (!lead?.owner) return ''
  return String(lead.owner._id || lead.owner)
}

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

export function LeadsPage() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api('/leads'),
  })
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api('/users'),
  })
  const user = useAuthStore((s) => s.user)

  const [selected, setSelected] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const users = usersData?.users || []
  const meId = String(user?.id || user?._id || '')

  const patch = useMutation({
    mutationFn: ({ id, body }) =>
      api(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      if (res?.converted && res?.project?._id) {
        qc.invalidateQueries({ queryKey: ['projects'] })
        toast('Marked Hot — added to Projects', { type: 'success' })
        navigate(`/projects/${res.project._id}`)
        return
      }
      if (res?.lead) {
        setSelected((prev) =>
          prev && String(prev._id) === String(res.lead._id) ? res.lead : prev,
        )
      }
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const create = useMutation({
    mutationFn: (body) =>
      api('/leads', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['home'] })
      setCreateOpen(false)
      toast('Enquiry added — follow-up task created', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const convert = useMutation({
    mutationFn: (id) => api(`/leads/${id}/convert`, { method: 'POST' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      if (res?.alreadyConverted && res?.project?._id) {
        toast('Already converted — opening project', { type: 'info' })
        navigate(`/projects/${res.project._id}`)
        return
      }
      toast('Marked Hot — added to Projects', { type: 'success' })
      navigate(`/projects/${res.project._id}`)
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const remove = useMutation({
    mutationFn: (id) => api(`/leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['home'] })
      setDeleteTarget(null)
      setSelected(null)
      toast('Enquiry deleted', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const leads = data?.leads || []

  const stats = useMemo(() => {
    const active = leads.filter((l) => !CLOSED_STAGES.includes(l.stage))
    const unassigned = leads.filter((l) => !ownerIdOf(l))
    const pipelineValue = active.reduce(
      (s, l) => s + (Number(l.estimatedValue) || 0),
      0,
    )
    const newCount = leads.filter((l) => l.stage === 'new_enquiry').length
    return {
      total: leads.length,
      unassigned: unassigned.length,
      newCount,
      pipelineValue,
      active: active.length,
    }
  }, [leads])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return leads.filter((lead) => {
      const oid = ownerIdOf(lead)
      if (filter === 'unassigned' && oid) return false
      if (filter === 'mine' && oid !== meId) return false
      if (filter === 'active' && CLOSED_STAGES.includes(lead.stage)) return false
      if (!needle) return true
      const hay = [
        lead.clientName,
        lead.contactName,
        lead.email,
        lead.phone,
        lead.source,
        lead.notes,
        lead.owner?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [leads, filter, search, meId])

  function assignLead(lead, owner) {
    const next = owner || null
    const prev = ownerIdOf(lead) || null
    if (String(next || '') === String(prev || '')) return
    patch.mutate(
      { id: lead._id, body: { owner: next } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['tasks'] })
          qc.invalidateQueries({ queryKey: ['home'] })
          toast(next ? 'Assigned — follow-up task created' : 'Assignee cleared', {
            type: 'success',
          })
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
        <SkeletonCard className="h-16" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <SkeletonCard className="h-80" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load enquiries"
        description={error?.message || 'Check your connection and try again.'}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    )
  }

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1600px] space-y-5 pb-10 transition-opacity',
        isFetching && 'opacity-90',
      )}
    >
      <PageToolbar
        left={
          <div className={PILL_TRACK}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
                  filter === f.key ? PILL_ACTIVE : PILL_IDLE,
                )}
              >
                {f.label}
                {f.key === 'unassigned' && stats.unassigned > 0 ? (
                  <span className="ml-1.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    {stats.unassigned}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        }
        right={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client, contact, phone…"
                className="h-9 w-64 rounded-[10px] border border-border bg-surface pl-8 pr-3 text-[12px] text-primary outline-none placeholder:text-secondary focus:border-accent/40"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New enquiry
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total enquiries" value={stats.total} />
        <Kpi
          label="Need assignment"
          value={stats.unassigned}
          danger={stats.unassigned > 0}
          foot={stats.unassigned > 0 ? 'Assign an owner' : 'All covered'}
        />
        <Kpi label="New enquiry stage" value={stats.newCount} />
        <Kpi
          label="Open pipeline value"
          value={formatInr(stats.pipelineValue)}
          accent
          foot={`${stats.active} active deals`}
        />
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={leads.length === 0 ? 'No enquiries yet' : 'Nothing matches'}
          description={
            leads.length === 0
              ? 'Add a new enquiry and assign someone to follow up.'
              : 'Try another filter or search.'
          }
          actionLabel={leads.length === 0 ? 'New enquiry' : undefined}
          onAction={leads.length === 0 ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {PIPELINE.map((stage) => {
            const column = filtered.filter(
              (l) => normalizeStage(l.stage) === stage,
            )
            return (
              <div
                key={stage}
                className="w-[280px] shrink-0 overflow-hidden rounded-[12px] border border-border bg-surface"
              >
                <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
                  <p className="text-[12px] font-semibold text-primary">
                    {stageLabel(stage)}
                  </p>
                  <span className="rounded-md bg-surface-raised px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-secondary">
                    {column.length}
                  </span>
                </div>
                <div className="min-h-[360px] space-y-2 p-2.5">
                  {column.length === 0 ? (
                    <p className="px-1 py-8 text-center text-[11px] text-secondary">
                      Empty
                    </p>
                  ) : (
                    column.map((lead) => (
                      <EnquiryCard
                        key={lead._id}
                        lead={lead}
                        users={users}
                        usersLoading={usersLoading}
                        assigning={patch.isPending}
                        onOpen={() => setSelected(lead)}
                        onAssign={(owner) => assignLead(lead, owner)}
                        onStage={(nextStage) =>
                          patch.mutate({
                            id: lead._id,
                            body: { stage: nextStage },
                          })
                        }
                        onHot={() => convert.mutate(lead._id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.clientName || 'Enquiry'}
      >
        {selected && (
          <EnquiryDetail
            lead={selected}
            users={users}
            usersLoading={usersLoading}
            patch={patch}
            convert={convert}
            onAssign={(owner) => assignLead(selected, owner)}
            onDelete={() => setDeleteTarget(selected)}
            onSaved={(lead) => setSelected(lead)}
          />
        )}
      </Drawer>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New enquiry"
      >
        <LeadForm
          users={users}
          usersLoading={usersLoading}
          defaultOwner={meId}
          onSubmit={(v) => create.mutate(v)}
          loading={create.isPending}
        />
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete enquiry?"
      >
        <p className="text-[13px] text-secondary">
          This permanently removes{' '}
          <span className="font-semibold text-primary">
            {deleteTarget?.clientName}
          </span>{' '}
          and any linked follow-up tasks. Converted projects are not deleted.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            loading={remove.isPending}
            onClick={() => remove.mutate(deleteTarget._id)}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function Kpi({ label, value, accent, danger, foot }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-secondary">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 text-[24px] font-semibold tracking-tight tabular-nums',
          danger
            ? 'text-amber-500'
            : accent
              ? 'text-accent'
              : 'text-primary',
        )}
      >
        {value}
      </p>
      {foot ? (
        <p className="mt-1 text-[11px] text-secondary">{foot}</p>
      ) : null}
    </div>
  )
}

function EnquiryDetail({
  lead,
  users,
  usersLoading,
  patch,
  convert,
  onAssign,
  onDelete,
  onSaved,
}) {
  const [draft, setDraft] = useState({
    contactName: lead.contactName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    source: lead.source || 'Website',
    estimatedValue: lead.estimatedValue ?? '',
    notes: lead.notes || '',
    nextFollowUp: lead.nextFollowUp
      ? new Date(lead.nextFollowUp).toISOString().slice(0, 10)
      : '',
  })
  const [uploadBusy, setUploadBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    setDraft({
      contactName: lead.contactName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source || 'Website',
      estimatedValue: lead.estimatedValue ?? '',
      notes: lead.notes || '',
      nextFollowUp: lead.nextFollowUp
        ? new Date(lead.nextFollowUp).toISOString().slice(0, 10)
        : '',
    })
  }, [lead])

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setUploadBusy(true)
    try {
      let lastLead = lead
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await api(`/leads/${lead._id}/attachments`, {
          method: 'POST',
          body: fd,
        })
        if (res?.lead) {
          lastLead = res.lead
          onSaved(res.lead)
        }
      }
      toast(
        files.length === 1 ? 'File attached' : `${files.length} files attached`,
        { type: 'success' },
      )
      return lastLead
    } catch (e) {
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      setUploadBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeAttachment = async (attachmentId) => {
    try {
      const res = await api(`/leads/${lead._id}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })
      if (res?.lead) onSaved(res.lead)
      toast('Attachment removed', { type: 'success' })
    } catch (e) {
      toast(e.message || 'Could not remove file', { type: 'error' })
    }
  }

  const saveDetails = () => {
    patch.mutate(
      {
        id: lead._id,
        body: {
          contactName: draft.contactName,
          email: draft.email,
          phone: draft.phone,
          source: draft.source,
          estimatedValue: Number(draft.estimatedValue) || 0,
          notes: draft.notes,
          nextFollowUp: draft.nextFollowUp || null,
        },
      },
      {
        onSuccess: (res) => {
          toast('Enquiry updated', { type: 'success' })
          if (res?.lead) onSaved(res.lead)
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      <AssignPanel
        lead={lead}
        users={users}
        usersLoading={usersLoading}
        onAssign={onAssign}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Contact"
          value={draft.contactName}
          onChange={(v) => setDraft({ ...draft, contactName: v })}
        />
        <Field
          label="Source"
          as="select"
          value={draft.source}
          onChange={(v) => setDraft({ ...draft, source: v })}
          options={SOURCES}
        />
        <Field
          label="Email"
          value={draft.email}
          onChange={(v) => setDraft({ ...draft, email: v })}
          icon={Mail}
        />
        <Field
          label="Phone"
          value={draft.phone}
          onChange={(v) => setDraft({ ...draft, phone: v })}
          icon={Phone}
        />
        <Field
          label="Est. value (₹)"
          type="number"
          value={draft.estimatedValue}
          onChange={(v) => setDraft({ ...draft, estimatedValue: v })}
        />
        <Field
          label="Next follow-up"
          type="date"
          value={draft.nextFollowUp}
          onChange={(v) => setDraft({ ...draft, nextFollowUp: v })}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Notes
        </p>
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="w-full resize-none rounded-[10px] border border-border bg-surface-raised px-3 py-2.5 text-[13px] text-primary outline-none focus:border-accent/40"
          placeholder="Context for the follow-up…"
        />
      </div>

      <EnquiryAttachments
        items={lead.attachments || []}
        busy={uploadBusy}
        fileRef={fileRef}
        onPick={(files) => addFiles(files)}
        onDeleteRemote={removeAttachment}
      />

      <Button
        className="w-full"
        variant="secondary"
        loading={patch.isPending}
        onClick={saveDetails}
      >
        Save details
      </Button>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Move to stage
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE.filter((s) => s !== normalizeStage(lead.stage)).map((s) => (
            <button
              key={s}
              type="button"
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition',
                s === 'hot'
                  ? 'bg-accent/15 text-accent hover:bg-accent/25'
                  : s === 'dead'
                    ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
                    : 'border border-border bg-surface-raised text-primary hover:border-accent/40',
              )}
              onClick={() => {
                if (s === 'hot') {
                  convert.mutate(lead._id)
                  return
                }
                patch.mutate(
                  { id: lead._id, body: { stage: s } },
                  {
                    onSuccess: (res) =>
                      onSaved(res?.lead || { ...lead, stage: s }),
                  },
                )
              }}
            >
              {stageLabel(s)}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <StatusChip
            status={normalizeStage(lead.stage)}
            label={stageLabel(lead.stage)}
          />
        </div>
      </div>

      {normalizeStage(lead.stage) !== 'dead' && (
        <Button
          className="w-full"
          loading={convert.isPending}
          onClick={() => convert.mutate(lead._id)}
        >
          {lead.convertedProjectId || normalizeStage(lead.stage) === 'hot'
            ? 'Open project'
            : 'Mark Hot → add to Projects'}
        </Button>
      )}

      {!lead.convertedProjectId && (
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-red-500/30 bg-red-500/10 py-2.5 text-[12px] font-semibold text-red-500 hover:bg-red-500/15"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete enquiry
        </button>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  as,
  options,
  icon: Icon,
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-secondary">
        {label}
      </p>
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
        ) : null}
        {as === 'select' ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              'h-9 w-full rounded-[10px] border border-border bg-surface text-[12px] text-primary outline-none focus:border-accent/40',
              Icon ? 'pl-8 pr-2' : 'px-2.5',
            )}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              'h-9 w-full rounded-[10px] border border-border bg-surface text-[12px] text-primary outline-none focus:border-accent/40',
              Icon ? 'pl-8 pr-2.5' : 'px-2.5',
            )}
          />
        )}
      </div>
    </div>
  )
}

function EnquiryCard({
  lead,
  users,
  usersLoading,
  assigning,
  onOpen,
  onAssign,
  onStage,
  onHot,
}) {
  const stage = normalizeStage(lead.stage)
  const idx = PIPELINE.indexOf(stage)
  const next =
    idx >= 0 && idx < PIPELINE.length - 2 ? PIPELINE[idx + 1] : null
  const needsOwner = !ownerIdOf(lead)
  const isClosed = CLOSED_STAGES.includes(lead.stage)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'w-full rounded-[10px] border bg-surface-raised p-3 text-left transition hover:border-accent/35',
        needsOwner
          ? 'border-amber-500/35 ring-1 ring-amber-500/20'
          : 'border-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-primary">
            {lead.clientName}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-secondary">
            {lead.contactName || lead.source || '—'}
            {lead.phone ? ` · ${lead.phone}` : ''}
          </p>
        </div>
        <p className="shrink-0 text-[12px] font-semibold tabular-nums text-accent">
          {formatInr(lead.estimatedValue)}
        </p>
      </div>

      {lead.nextFollowUp ? (
        <p className="mt-2 text-[10px] font-medium text-secondary">
          Follow-up {formatShortDate(lead.nextFollowUp)}
        </p>
      ) : null}

      <div
        className="mt-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <AssigneePicker
          value={ownerIdOf(lead)}
          users={users}
          loading={usersLoading || assigning}
          onChange={onAssign}
          compact
          highlightEmpty={needsOwner}
        />
      </div>

      <div
        className="mt-2.5 flex flex-wrap gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {next && next !== 'dead' && (
          <button
            type="button"
            className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/25"
            onClick={() => onStage(next)}
          >
            → {stageLabel(next).split(' ')[0]}
          </button>
        )}
        {!isClosed && (
          <>
            <button
              type="button"
              className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/25"
              onClick={() => onHot()}
            >
              Hot
            </button>
            <button
              type="button"
              className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-500/25"
              onClick={() => onStage('dead')}
            >
              Dead
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AssignPanel({ lead, users, usersLoading, onAssign }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-raised p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface shadow-sm ring-1 ring-border">
          <UserPlus className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary">
            Assign employee
          </p>
          <p className="text-[11px] text-secondary">
            They get a follow-up task and notification.
          </p>
        </div>
      </div>
      <AssigneePicker
        value={ownerIdOf(lead)}
        users={users}
        loading={usersLoading}
        onChange={onAssign}
      />
    </div>
  )
}

function AssigneePicker({
  value,
  users,
  loading,
  onChange,
  compact = false,
  highlightEmpty = false,
}) {
  const [open, setOpen] = useState(false)
  const selected = users.find(
    (u) => String(u._id || u.id) === String(value || ''),
  )

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-assignee-picker]')) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" data-assignee-picker>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 rounded-[10px] border px-2.5 text-left transition',
          compact ? 'h-9' : 'h-11',
          highlightEmpty && !selected
            ? 'border-amber-500/40 bg-amber-500/10 hover:border-amber-500/60'
            : 'border-border bg-surface hover:border-accent/40',
        )}
      >
        {selected ? (
          <>
            <Avatar src={selected.avatar} name={selected.name} size="xs" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary">
              {selected.name}
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full',
                highlightEmpty ? 'bg-amber-500/15' : 'bg-surface-raised',
              )}
            >
              <Users
                className={cn(
                  'h-3.5 w-3.5',
                  highlightEmpty ? 'text-amber-600 dark:text-amber-400' : 'text-secondary',
                )}
              />
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[12px] font-semibold',
                highlightEmpty ? 'text-amber-700 dark:text-amber-300' : 'text-secondary',
              )}
            >
              Assign employee…
            </span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-secondary" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-56 w-full min-w-[220px] overflow-y-auto rounded-[10px] border border-border bg-surface py-1 shadow-xl">
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-secondary hover:bg-surface-raised"
          >
            Unassigned
          </button>
          {loading && (
            <p className="px-3 py-2 text-[11px] text-secondary">Loading…</p>
          )}
          {!loading && users.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-secondary">
              No employees found
            </p>
          )}
          {users.map((u) => {
            const id = String(u._id || u.id)
            const active = id === String(value || '')
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onChange(id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-raised',
                  active && 'bg-accent/10',
                )}
              >
                <Avatar src={u.avatar} name={u.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary">
                  {u.name}
                </span>
                {u.role ? (
                  <span className="shrink-0 text-[10px] uppercase text-secondary">
                    {String(u.role).replace(/_/g, ' ')}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function isImageMime(mime = '') {
  return String(mime).startsWith('image/')
}

async function uploadEnquiryFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  const media = await api('/media', { method: 'POST', body: fd })
  return {
    name: media.name || file.name || 'Attachment',
    url: media.url || media.fileUrl,
    mime: media.mime || file.type || '',
    size: media.size || file.size || 0,
  }
}

function LeadForm({ users, usersLoading, defaultOwner, onSubmit, loading }) {
  const [form, setForm] = useState({
    clientName: '',
    contactName: '',
    email: '',
    phone: '',
    source: 'Website',
    estimatedValue: '',
    notes: '',
    nextFollowUp: '',
    owner: defaultOwner || '',
  })
  const [attachments, setAttachments] = useState([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (defaultOwner && !form.owner) {
      setForm((prev) => ({ ...prev, owner: defaultOwner }))
    }
  }, [defaultOwner, form.owner])

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (attachments.length + files.length > 25) {
      toast('Maximum 25 files per enquiry', { type: 'error' })
      return
    }
    setUploadBusy(true)
    try {
      const uploaded = []
      for (const file of files) {
        uploaded.push(await uploadEnquiryFile(file))
      }
      setAttachments((prev) => [...prev, ...uploaded])
      toast(
        uploaded.length === 1 ? 'File attached' : `${uploaded.length} files attached`,
        { type: 'success' },
      )
    } catch (e) {
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      setUploadBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          ...form,
          estimatedValue: Number(form.estimatedValue) || 0,
          stage: 'new_enquiry',
          owner: form.owner || undefined,
          nextFollowUp: form.nextFollowUp || undefined,
          attachments,
        })
      }}
    >
      <Input
        label="Client / company"
        value={form.clientName}
        onChange={(e) => setForm({ ...form, clientName: e.target.value })}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Contact"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-secondary">
            Source
          </p>
          <select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            className="h-10 w-full rounded-[10px] border border-border bg-surface px-2.5 text-[13px] text-primary outline-none focus:border-accent/40"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Est. value"
          type="number"
          value={form.estimatedValue}
          onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
        />
      </div>
      <Input
        label="Next follow-up"
        type="date"
        value={form.nextFollowUp}
        onChange={(e) => setForm({ ...form, nextFollowUp: e.target.value })}
      />
      <Input
        label="Notes"
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-secondary">
          Assign to employee
        </p>
        <AssigneePicker
          value={form.owner}
          users={users}
          loading={usersLoading}
          onChange={(owner) => setForm({ ...form, owner: owner || '' })}
        />
      </div>

      <EnquiryAttachments
        items={attachments}
        busy={uploadBusy}
        fileRef={fileRef}
        onPick={(files) => addFiles(files)}
        onRemove={(idx) =>
          setAttachments((prev) => prev.filter((_, i) => i !== idx))
        }
      />

      <Button type="submit" className="w-full" loading={loading || uploadBusy}>
        Create enquiry
      </Button>
    </form>
  )
}

function EnquiryAttachments({ items, busy, fileRef, onPick, onRemove, onDeleteRemote }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-secondary">
          Files (floor plan, docs, photos)
        </p>
        <span className="text-[11px] text-muted">{items.length}/25</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip"
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
      <button
        type="button"
        disabled={busy || items.length >= 25}
        onClick={() => fileRef.current?.click()}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-surface-raised text-[12px] font-semibold text-primary hover:border-accent/40 disabled:opacity-50"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {busy ? 'Uploading…' : 'Add floor plan or document'}
      </button>
      <p className="mt-1.5 text-[11px] text-secondary">
        Optional — attach drawings, PDFs, or site photos needed before converting this lead.
      </p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((file, idx) => {
            const key = file._id || `${file.url}-${idx}`
            const Icon = isImageMime(file.mime) ? FileImage : FileText
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-secondary" />
                <a
                  href={assetUrl(file.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary hover:underline"
                >
                  {file.name || 'Attachment'}
                </a>
                <button
                  type="button"
                  title="Remove"
                  onClick={() =>
                    file._id && onDeleteRemote
                      ? onDeleteRemote(file._id)
                      : onRemove?.(idx)
                  }
                  className="rounded-md p-1 text-secondary hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
