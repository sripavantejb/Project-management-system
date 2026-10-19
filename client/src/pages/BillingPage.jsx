import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  Search,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { formatInr } from '../lib/format'
import {
  PageToolbar,
  ToolbarLink,
  ToolbarPills,
} from '../components/layout/PageToolbar'
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  SkeletonCard,
  toast,
} from '../components/ui'
import { cn } from '../lib/utils'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
]

const INVOICE_FIELD =
  'h-10 rounded-xl border-border bg-surface-raised focus:border-accent/55 focus:bg-surface'

const STATUS_META = {
  unpaid: {
    label: 'Unpaid',
    className: 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400',
  },
  overdue: {
    label: 'Overdue',
    className: 'bg-red-500/15 text-red-600 ring-1 ring-red-500/25 dark:text-red-400',
  },
  paid: {
    label: 'Paid',
    className: 'bg-accent/15 text-accent ring-1 ring-accent/25',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-active text-secondary ring-1 ring-border',
  },
}

function formatDate(value) {
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

function daysUntil(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const ms = d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / 86400000)
}

function isPdf(mime, name) {
  return (
    String(mime || '').includes('pdf') ||
    String(name || '').toLowerCase().endsWith('.pdf')
  )
}

function projectKey(inv) {
  return inv.projectId?._id
    ? String(inv.projectId._id)
    : inv.projectId
      ? String(inv.projectId)
      : 'unassigned'
}

function emptyForm(projectId = '') {
  return {
    projectId,
    invoiceNumber: '',
    vendorId: '',
    purchaseOrderId: '',
    amount: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    status: 'unpaid',
  }
}

function invalidateFinance(qc) {
  qc.invalidateQueries({ queryKey: ['billing-invoices'] })
  qc.invalidateQueries({ queryKey: ['billing-summary'] })
  qc.invalidateQueries({ queryKey: ['billing-options'] })
  qc.invalidateQueries({ queryKey: ['finance'] })
  qc.invalidateQueries({ queryKey: ['expenses'] })
  qc.invalidateQueries({ queryKey: ['purchase-orders'] })
}

export function BillingPage() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [collapsed, setCollapsed] = useState({})

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: () => api('/billing/summary'),
  })

  const { data: invoiceData, isLoading: listLoading } = useQuery({
    queryKey: ['billing-invoices', status, search, projectFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (search.trim()) params.set('q', search.trim())
      if (projectFilter !== 'all') params.set('projectId', projectFilter)
      return api(`/billing/invoices?${params}`)
    },
  })

  const { data: optionsData } = useQuery({
    queryKey: ['billing-options'],
    queryFn: () => api('/billing/options'),
  })

  const summary = summaryData?.summary || {
    total: 0,
    unpaidAmount: 0,
    paidThisMonth: 0,
    overdueCount: 0,
    projectCount: 0,
  }
  const invoices = invoiceData?.invoices || []
  const vendors = optionsData?.vendors || []
  const purchaseOrders = optionsData?.purchaseOrders || []
  const projects = optionsData?.projects || []

  const projectGroups = useMemo(() => {
    const map = new Map()
    for (const inv of invoices) {
      const key = projectKey(inv)
      if (!map.has(key)) {
        map.set(key, {
          key,
          projectId: key === 'unassigned' ? null : key,
          name: inv.projectId?.name || 'Unassigned',
          clientName: inv.projectId?.clientName || '',
          code: inv.projectId?.code || '',
          invoices: [],
          unpaidAmount: 0,
          paidAmount: 0,
          overdueCount: 0,
        })
      }
      const g = map.get(key)
      g.invoices.push(inv)
      const st = inv.status
      if (st === 'paid') g.paidAmount += inv.amount || 0
      else if (st !== 'cancelled') {
        g.unpaidAmount += inv.amount || 0
        if (st === 'overdue') g.overdueCount += 1
      }
    }
    return [...map.values()].sort(
      (a, b) => b.unpaidAmount - a.unpaidAmount || b.invoices.length - a.invoices.length,
    )
  }, [invoices])

  const dueSoon = useMemo(() => {
    return invoices
      .filter((inv) => inv.status === 'unpaid' && inv.dueDate)
      .map((inv) => ({ inv, days: daysUntil(inv.dueDate) }))
      .filter((x) => x.days != null && x.days >= 0 && x.days <= 7)
      .sort((a, b) => a.days - b.days)
      .slice(0, 4)
  }, [invoices])

  const selectedProject = useMemo(
    () => projects.find((p) => String(p._id) === String(form.projectId)),
    [projects, form.projectId],
  )

  const vendorPos = useMemo(() => {
    let list = purchaseOrders
    if (form.projectId) {
      list = list.filter(
        (po) => String(po.projectId?._id || po.projectId) === String(form.projectId),
      )
    }
    if (form.vendorId) {
      list = list.filter(
        (po) => String(po.vendor?._id || po.vendor) === String(form.vendorId),
      )
    }
    return list
  }, [purchaseOrders, form.projectId, form.vendorId])

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData()
      body.append('projectId', form.projectId)
      body.append('invoiceNumber', form.invoiceNumber)
      body.append('vendorId', form.vendorId)
      if (form.purchaseOrderId) body.append('purchaseOrderId', form.purchaseOrderId)
      body.append('amount', String(form.amount))
      if (form.invoiceDate) body.append('invoiceDate', form.invoiceDate)
      if (form.dueDate) body.append('dueDate', form.dueDate)
      if (form.notes) body.append('notes', form.notes)
      body.append('status', form.status)
      if (file) body.append('file', file)
      return api('/billing/invoices', { method: 'POST', body })
    },
    onSuccess: () => {
      invalidateFinance(qc)
      setCreateOpen(false)
      setForm(emptyForm())
      setFile(null)
      toast('Invoice saved to project', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, ...body }) =>
      api(`/billing/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (_res, vars) => {
      invalidateFinance(qc)
      toast(
        vars.status === 'paid' ? 'Marked paid · synced to Revenue' : 'Invoice updated',
        { type: 'success' },
      )
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`/billing/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateFinance(qc)
      toast('Invoice removed', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  function openCreate(preProjectId = '') {
    setForm(emptyForm(preProjectId))
    setFile(null)
    setCreateOpen(true)
  }

  function applyPo(poId) {
    const po = purchaseOrders.find((p) => String(p._id) === String(poId))
    setForm((s) => ({
      ...s,
      purchaseOrderId: poId,
      vendorId: po?.vendor?._id
        ? String(po.vendor._id)
        : po?.vendor
          ? String(po.vendor)
          : s.vendorId,
      amount:
        po?.value != null && Number(po.value) > 0
          ? String(po.value)
          : s.amount,
    }))
  }

  if (summaryLoading && listLoading) {
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

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-12">
      <PageToolbar
        left={
          <>
            <ToolbarPills
              items={STATUS_FILTERS}
              value={status}
              onChange={setStatus}
            />
            <ToolbarLink to="/finance">
              <Wallet className="h-3.5 w-3.5" />
              Revenue
            </ToolbarLink>
            <ToolbarLink to="/billing/tax-invoices">
              <FileText className="h-3.5 w-3.5" />
              Tax invoices
            </ToolbarLink>
          </>
        }
        right={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868b]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice, vendor, PO…"
                className="h-9 w-[220px] rounded-full border-0 bg-[#f5f5f7] pl-8 pr-3 text-[12px] text-primary outline-none ring-1 ring-black/[0.04] placeholder:text-[#86868b] focus:bg-white focus:ring-[var(--accent)]/40"
              />
            </div>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 max-w-[180px] rounded-full border-0 bg-[#f5f5f7] px-3 text-[12px] font-medium text-secondary outline-none ring-1 ring-black/[0.04]"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Add invoice
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Receipt}
          label="Invoices"
          value={summary.total}
          hint={`${summary.projectCount || 0} projects`}
        />
        <Kpi
          icon={Clock3}
          label="Unpaid"
          value={formatInr(summary.unpaidAmount || 0)}
          hint="Open vendor bills"
          tone="amber"
        />
        <Kpi
          icon={Wallet}
          label="Paid this month"
          value={formatInr(summary.paidThisMonth || 0)}
          hint="Synced to Revenue"
          tone="emerald"
        />
        <Kpi
          icon={AlertTriangle}
          label="Overdue"
          value={summary.overdueCount || 0}
          hint="Need attention"
          tone="red"
        />
      </section>

      {dueSoon.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-[#fbfbfd] ring-1 ring-black/[0.04]">
          <div className="flex items-center justify-between border-b border-black/[0.04] px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Due in 7 days
            </p>
            <span className="text-[11px] text-[#86868b]">{dueSoon.length} bills</span>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {dueSoon.map(({ inv, days }) => (
              <div
                key={inv._id}
                className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
              >
                <span
                  className={cn(
                    'inline-flex min-w-[52px] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    days <= 2
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                  )}
                >
                  {days === 0 ? 'Today' : `${days}d`}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-primary">
                  {inv.invoiceNumber}
                  <span className="font-normal text-secondary">
                    {' '}
                    · {inv.vendor?.name || 'Vendor'}
                  </span>
                </span>
                <span className="hidden text-[12px] text-secondary sm:inline">
                  {inv.projectId?.name || '—'}
                </span>
                <span className="tabular-nums font-semibold text-primary">
                  {formatInr(inv.amount || 0)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {listLoading && (
          <p className="py-16 text-center text-[13px] text-secondary">
            Loading invoices…
          </p>
        )}

        {!listLoading && invoices.length === 0 && (
          <div className="rounded-2xl bg-white py-4 ring-1 ring-black/[0.04]">
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Add vendor bills per project so finance always has the paper trail — and Revenue stays in sync."
              actionLabel="Add first invoice"
              onAction={() => openCreate()}
            />
          </div>
        )}

        {projectGroups.map((group) => {
          const isCollapsed = collapsed[group.key] === true
          return (
            <article
              key={group.key}
              className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] transition-[box-shadow] duration-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
            >
              <button
                type="button"
                onClick={() =>
                  setCollapsed((s) => ({
                    ...s,
                    [group.key]: !isCollapsed,
                  }))
                }
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#1d1d1f]">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                      {group.name}
                    </h2>
                    {group.overdueCount > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        {group.overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-[#86868b]">
                    {[group.clientName, `${group.invoices.length} invoice${group.invoices.length === 1 ? '' : 's'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#86868b]">
                    Unpaid
                  </p>
                  <p className="tabular-nums text-[14px] font-semibold text-[#1d1d1f]">
                    {formatInr(group.unpaidAmount)}
                  </p>
                </div>
                <span className="text-[#86868b]">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>

              {!isCollapsed && (
                <div className="border-t border-black/[0.04]">
                  <div className="flex items-center justify-between gap-2 px-4 py-2 sm:px-5">
                    <p className="text-[11px] text-[#86868b]">
                      Paid {formatInr(group.paidAmount)}
                    </p>
                    {group.projectId && (
                      <button
                        type="button"
                        onClick={() => openCreate(group.projectId)}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] transition hover:bg-[#0071e3]/08"
                      >
                        <Plus className="h-3 w-3" />
                        Add to project
                      </button>
                    )}
                  </div>

                  <ul className="divide-y divide-black/[0.04]">
                    {group.invoices.map((inv) => {
                      const meta = STATUS_META[inv.status] || STATUS_META.unpaid
                      const fileHref = inv.fileUrl ? assetUrl(inv.fileUrl) : null
                      return (
                        <li
                          key={inv._id}
                          className="group flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
                        >
                          <button
                            type="button"
                            disabled={!fileHref}
                            onClick={() => fileHref && setPreview(inv)}
                            className={cn(
                              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition',
                              fileHref
                                ? 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#ebebed]'
                                : 'bg-[#f5f5f7]/60 text-[#c7c7cc]',
                            )}
                            title={fileHref ? 'Preview file' : 'No file'}
                          >
                            <FileText className="h-4 w-4" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                                {inv.invoiceNumber}
                              </p>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  meta.className,
                                )}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[12px] text-[#6e6e73]">
                              {inv.vendor?.name || 'Vendor'}
                              {inv.purchaseOrder?.poNumber
                                ? ` · PO ${inv.purchaseOrder.poNumber}`
                                : ''}
                              {' · '}
                              {formatDate(inv.invoiceDate)}
                              {inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ''}
                            </p>
                          </div>

                          <p className="shrink-0 tabular-nums text-[15px] font-semibold tracking-[-0.02em] text-[#1d1d1f] sm:w-28 sm:text-right">
                            {formatInr(inv.amount || 0)}
                          </p>

                          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <button
                                type="button"
                                disabled={patchMutation.isPending}
                                onClick={() =>
                                  patchMutation.mutate({
                                    id: inv._id,
                                    status: 'paid',
                                  })
                                }
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--accent)]/12 px-3 text-[11px] font-semibold text-[#0d7a4f] transition hover:bg-[var(--accent)]/20"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Mark paid
                              </button>
                            )}
                            {fileHref && (
                              <a
                                href={fileHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6e6e73] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                                title="Open file"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete invoice ${inv.invoiceNumber}?`,
                                  )
                                ) {
                                  deleteMutation.mutate(inv._id)
                                }
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6e6e73] opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                              title="Delete"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </article>
          )
        })}
      </section>

      {/* Create invoice — single aligned form */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New invoice"
        size="lg"
      >
        <form
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.projectId) {
              toast('Select a project', { type: 'error' })
              return
            }
            if (!form.invoiceNumber.trim()) {
              toast('Invoice number is required', { type: 'error' })
              return
            }
            if (!form.vendorId) {
              toast('Select a vendor', { type: 'error' })
              return
            }
            if (form.amount === '' || !Number.isFinite(Number(form.amount))) {
              toast('Amount is required', { type: 'error' })
              return
            }
            createMutation.mutate()
          }}
        >
          <ProjectPicker
            projects={projects}
            value={form.projectId}
            selected={selectedProject}
            onChange={(id) =>
              setForm((s) => ({
                ...s,
                projectId: id,
                purchaseOrderId: '',
              }))
            }
          />

          <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
            <Input
              label="Invoice number"
              className={INVOICE_FIELD}
              value={form.invoiceNumber}
              onChange={(e) =>
                setForm((s) => ({ ...s, invoiceNumber: e.target.value }))
              }
              placeholder="INV-1042"
            />
            <Input
              label="Amount (₹)"
              type="number"
              min="0"
              step="0.01"
              className={INVOICE_FIELD}
              value={form.amount}
              onChange={(e) =>
                setForm((s) => ({ ...s, amount: e.target.value }))
              }
              placeholder="0"
            />
            <Select
              label="Vendor"
              className={INVOICE_FIELD}
              value={form.vendorId}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  vendorId: e.target.value,
                  purchaseOrderId: '',
                }))
              }
              placeholder="Select vendor"
              options={vendors.map((v) => ({
                value: v._id,
                label: v.name,
              }))}
            />
            <Select
              label="Purchase order"
              className={INVOICE_FIELD}
              value={form.purchaseOrderId}
              onChange={(e) => applyPo(e.target.value)}
              disabled={!form.projectId}
              options={[
                {
                  value: '',
                  label: form.projectId
                    ? 'Optional · this project'
                    : 'Select project first',
                },
                ...vendorPos.map((po) => ({
                  value: po._id,
                  label: [
                    po.poNumber,
                    po.value != null ? formatInr(po.value) : null,
                    po.vendor?.name,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                })),
              ]}
            />
            <Input
              label="Invoice date"
              type="date"
              className={INVOICE_FIELD}
              value={form.invoiceDate}
              onChange={(e) =>
                setForm((s) => ({ ...s, invoiceDate: e.target.value }))
              }
            />
            <Input
              label="Due date"
              type="date"
              className={INVOICE_FIELD}
              value={form.dueDate}
              onChange={(e) =>
                setForm((s) => ({ ...s, dueDate: e.target.value }))
              }
            />
            <Input
              label="Notes"
              className={INVOICE_FIELD}
              value={form.notes}
              onChange={(e) =>
                setForm((s) => ({ ...s, notes: e.target.value }))
              }
              placeholder="Payment terms, GST…"
            />
            <Select
              label="Status"
              className={INVOICE_FIELD}
              value={form.status}
              onChange={(e) =>
                setForm((s) => ({ ...s, status: e.target.value }))
              }
              options={[
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'paid', label: 'Already paid' },
              ]}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-primary">
              Attachment
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-black/10 bg-[#fbfbfd] px-3.5 py-3 text-left transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/[0.04]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
                <Upload className="h-4 w-4 text-[#86868b]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[#1d1d1f]">
                  {file ? file.name : 'PDF or photo (optional)'}
                </span>
                <span className="block text-[11px] text-[#86868b]">
                  Keeps the paper trail with Revenue
                </span>
              </span>
              {file && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      setFile(null)
                    }
                  }}
                  className="rounded-full p-1 text-[#86868b] hover:bg-black/5 hover:text-[#1d1d1f]"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-black/[0.04] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save invoice'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* File preview */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.invoiceNumber || 'Invoice'}
        size="lg"
      >
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-secondary">
              <span>
                {preview.vendor?.name}
                {preview.projectId?.name
                  ? ` · ${preview.projectId.name}`
                  : ''}
              </span>
              <span className="font-semibold text-primary">
                {formatInr(preview.amount || 0)}
              </span>
            </div>
            {preview.fileUrl &&
              (isPdf(preview.mimeType, preview.fileName) ? (
                <iframe
                  title={preview.invoiceNumber}
                  src={assetUrl(preview.fileUrl)}
                  className="h-[60vh] w-full rounded-xl bg-[#f5f5f7]"
                />
              ) : (
                <img
                  src={assetUrl(preview.fileUrl)}
                  alt={preview.invoiceNumber}
                  className="max-h-[60vh] w-full rounded-xl object-contain"
                />
              ))}
            {!preview.fileUrl && (
              <p className="py-8 text-center text-[13px] text-secondary">
                No file attached.
              </p>
            )}
            <div className="flex justify-end gap-2">
              {preview.fileUrl && (
                <a
                  href={assetUrl(preview.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f5f5f7] px-4 text-[12px] font-semibold text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open original
                </a>
              )}
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const PROJECT_PICK_LIMIT = 8

function ProjectPicker({ projects, value, selected, onChange }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = query.trim().toLowerCase()
  const largeCatalog = projects.length > 12

  const matches = useMemo(() => {
    let list = projects
    if (q) {
      list = projects.filter((p) =>
        [p.name, p.clientName, p.code]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    } else if (largeCatalog) {
      list = projects.slice(0, PROJECT_PICK_LIMIT)
    }
    return list.slice(0, PROJECT_PICK_LIMIT)
  }, [projects, q, largeCatalog])

  const totalMatches = useMemo(() => {
    if (!q) return projects.length
    return projects.filter((p) =>
      [p.name, p.clientName, p.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    ).length
  }, [projects, q])

  function clearSelection() {
    onChange('')
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function pick(p) {
    onChange(String(p._id))
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">Project</span>
        <span className="text-[11px] text-[#86868b]">
          {projects.length} available
        </span>
      </div>

      {selected && value ? (
        <div className="flex items-center gap-3 rounded-xl bg-[#f5f5f7] px-3 py-2.5 ring-1 ring-black/[0.04]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
            <FolderKanban className="h-4 w-4 text-[#1d1d1f]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">
              {selected.name}
            </p>
            {selected.clientName && (
              <p className="truncate text-[11px] text-[#86868b]">
                {selected.clientName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] transition hover:bg-[#0071e3]/08"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder={
                largeCatalog
                  ? 'Type project name or client…'
                  : 'Search or pick a project…'
              }
              className="h-10 w-full rounded-xl border-0 bg-[#f5f5f7] pl-9 pr-9 text-[13px] text-primary outline-none ring-1 ring-black/[0.05] placeholder:text-[#86868b] focus:bg-white focus:ring-[var(--accent)]/45"
            />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c7c7cc]" />
          </div>

          {open && (
            <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]">
              {largeCatalog && !q && (
                <p className="border-b border-black/[0.04] px-3 py-2 text-[11px] text-[#86868b]">
                  Showing recent · type to find any of {projects.length}
                </p>
              )}
              {matches.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-secondary">
                  {q ? 'No projects match that search' : 'No projects yet'}
                </p>
              ) : (
                <ul className="max-h-[240px] overflow-y-auto py-1">
                  {matches.map((p) => (
                    <li key={p._id}>
                      <button
                        type="button"
                        onClick={() => pick(p)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-[#f5f5f7]"
                      >
                        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#86868b]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[#1d1d1f]">
                            {p.name}
                          </span>
                          {p.clientName && (
                            <span className="block truncate text-[11px] text-[#86868b]">
                              {p.clientName}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {totalMatches > PROJECT_PICK_LIMIT && (
                <p className="border-t border-black/[0.04] px-3 py-2 text-[11px] text-[#86868b]">
                  +{totalMatches - PROJECT_PICK_LIMIT} more · refine your search
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-primary bg-surface-raised',
    amber: 'text-amber-700 bg-amber-500/15 dark:text-amber-400',
    emerald: 'text-accent bg-accent/15',
    red: 'text-red-600 bg-red-500/15 dark:text-red-400',
  }
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-4 transition duration-200 hover:bg-surface-raised/60">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
          {label}
        </p>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            tones[tone] || tones.neutral,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f] tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-[#86868b]">{hint}</p>
      )}
    </div>
  )
}
