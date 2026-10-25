import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useOutletContext, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckSquare,
  FileSpreadsheet,
  Package,
  Square,
  X,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../../lib/api'
import { formatInr } from '../../lib/format'
import { COUNTRY_CODES, buildPhone } from '../../lib/phone'
import { SendPoButton } from '../../components/VendorBits'
import { RfqPanel } from '../../components/procurement/RfqPanel'
import {
  Avatar,
  AvatarStack,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  Modal,
  ProgressBar,
  Select,
  StatusChip,
  toast,
} from '../../components/ui'
import { cn } from '../../lib/utils'

export function ProjectProcurement() {
  const { id } = useParams()
  const { project } = useOutletContext() || {}
  const { data, isLoading } = useQuery({
    queryKey: ['pos', id],
    queryFn: () => api(`/purchase-orders?projectId=${id}`),
  })
  const { data: quoteData } = useQuery({
    queryKey: ['quotations', id],
    queryFn: () => api(`/quotations?projectId=${id}`),
  })
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api('/vendors'),
  })
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [rfqOpen, setRfqOpen] = useState(false)
  const [showAllMaterials, setShowAllMaterials] = useState(false)
  const MATERIAL_PREVIEW = 8

  const create = useMutation({
    mutationFn: (body) =>
      api('/purchase-orders', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', id] })
      setOpen(false)
      setSelected(new Set())
      toast('Purchase order created', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const patch = useMutation({
    mutationFn: ({ poId, status }) =>
      api(`/purchase-orders/${poId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', id] }),
  })

  const pos = data?.purchaseOrders || []
  const vendors = vendorsData?.vendors || []
  const approvedQuote = (quoteData?.quotations || []).find(
    (q) => q.status === 'approved',
  )
  const quoteItems = useMemo(() => {
    if (!approvedQuote?.items?.length) return []
    return approvedQuote.items
      .map((it, i) => ({
        ...it,
        _key: String(it._id || `qi-${i}`),
        amount:
          Number(it.amount) ||
          (Number(it.qty) || 0) * (Number(it.rate) || 0),
      }))
      .filter((it) => it.description?.trim() || it.amount > 0)
  }, [approvedQuote])

  // Which quote lines are already covered by a PO (matched by boqItemId or description)
  const orderedKeys = useMemo(() => {
    const keys = new Set()
    for (const po of pos) {
      for (const it of po.items || []) {
        if (it.boqItemId) keys.add(String(it.boqItemId))
        if (it.description) keys.add(`desc:${it.description.trim().toLowerCase()}`)
      }
    }
    return keys
  }, [pos])

  const materialRows = quoteItems.map((it) => {
    const ordered =
      orderedKeys.has(String(it._id || it._key)) ||
      orderedKeys.has(`desc:${(it.description || '').trim().toLowerCase()}`)
    return { ...it, ordered }
  })

  const pendingRows = materialRows.filter((r) => !r.ordered)
  const selectedItems = materialRows.filter((r) => selected.has(r._key))
  const visibleMaterialRows = showAllMaterials
    ? materialRows
    : materialRows.slice(0, MATERIAL_PREVIEW)
  const hiddenMaterialCount = Math.max(
    0,
    materialRows.length - MATERIAL_PREVIEW,
  )

  const totalValue = pos.reduce((s, p) => s + (Number(p.value) || 0), 0)
  const delivered = pos.filter((p) => p.status === 'delivered').length

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllPending = () => {
    setSelected(new Set(pendingRows.map((r) => r._key)))
  }

  const openPoFromSelection = () => {
    if (!selectedItems.length) {
      toast('Select materials from the quote first', { type: 'info' })
      return
    }
    setOpen(true)
  }

  return (
    <div className="space-y-4 p-4 md:p-5 lg:p-6 bg-[var(--bg-canvas)] min-h-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-primary">
            Materials & orders
          </h2>
          <p className="text-[13px] text-secondary">
            Approved BOQ items → RFQ to vendors → compare → award → purchase order
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedItems.length > 0 && (
            <Button onClick={() => setRfqOpen(true)}>
              Raise RFQ · {selectedItems.length} item
              {selectedItems.length === 1 ? '' : 's'}
            </Button>
          )}
          <Button
            variant={selectedItems.length ? 'secondary' : 'primary'}
            onClick={() => {
              setSelected(new Set())
              setOpen(true)
            }}
          >
            Raise blank PO
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="!bg-surface p-4 shadow-sm">
          <p className="text-[12px] text-secondary">Quote items to buy</p>
          <p className="mt-1 text-[24px] font-semibold tabular-nums">
            {pendingRows.length}
            <span className="text-[14px] font-normal text-secondary">
              {' '}
              / {materialRows.length}
            </span>
          </p>
        </Card>
        <Card className="!bg-surface p-4 shadow-sm">
          <p className="text-[12px] text-secondary">Order value</p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums text-[var(--accent)]">
            {formatInr(totalValue)}
          </p>
        </Card>
        <Card className="!bg-surface p-4 shadow-sm">
          <p className="text-[12px] text-secondary">Delivered</p>
          <p className="mt-1 text-[24px] font-semibold tabular-nums text-emerald-600">
            {delivered}
            <span className="text-[14px] font-normal text-secondary">
              {' '}
              / {pos.length} POs
            </span>
          </p>
        </Card>
      </div>

      {/* From approved quote */}
      <Card padding={false} className="overflow-hidden !bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nav-active-bg)] text-[var(--accent)]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-primary">
                From approved quote
              </p>
              <p className="text-[11px] text-secondary">
                {approvedQuote
                  ? `${approvedQuote.title || 'Quote'} · ${formatInr(approvedQuote.grandTotal)}${
                      materialRows.length
                        ? ` · ${
                            showAllMaterials || hiddenMaterialCount === 0
                              ? `${materialRows.length} lines`
                              : `showing ${visibleMaterialRows.length} of ${materialRows.length}`
                          }`
                        : ''
                    }`
                  : 'Approve a quote first — items appear here to buy'}
              </p>
            </div>
          </div>
          {pendingRows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllPending}
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-surface-raised"
              >
                Select all pending
              </button>
              <button
                type="button"
                onClick={() => setRfqOpen(true)}
                disabled={!selectedItems.length}
                title={
                  selectedItems.length
                    ? `Raise RFQ for ${selectedItems.length} item(s)`
                    : 'Select materials below first'
                }
                className="btn-create rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
              >
                Raise RFQ from selected
                {selectedItems.length ? ` · ${selectedItems.length}` : ''}
              </button>
            </div>
          )}
        </div>

        {!approvedQuote && (
          <div className="px-4 py-10 text-center">
            <Package className="mx-auto h-8 w-8 text-[#c7c7c7]" />
            <p className="mt-2 text-[13px] font-medium text-secondary">
              No approved quote yet
            </p>
            <p className="mt-1 text-[12px] text-secondary">
              Open BOQ / Quotes in the sidebar, build the sheet, then click
              Approve — those lines show here for ordering.
            </p>
            <Link
              to={`/boq/${id}`}
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent)]"
            >
              Open BOQ <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {approvedQuote && materialRows.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-secondary">
            Approved quote has no line items.
          </p>
        )}

        {materialRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-raised text-left text-[10px] font-bold uppercase tracking-wide text-secondary">
                  <th className="w-10 px-3 py-2" />
                  <th className="w-[110px] px-3 py-2">Room</th>
                  <th className="min-w-[240px] px-3 py-2">Item</th>
                  <th className="w-16 px-3 py-2">Unit</th>
                  <th className="w-16 px-3 py-2 text-right">Qty</th>
                  <th className="w-24 px-3 py-2 text-right">Rate</th>
                  <th className="w-28 px-3 py-2 text-right">Amount</th>
                  <th className="w-[88px] px-3 py-2">Buy status</th>
                </tr>
              </thead>
              <tbody>
                {visibleMaterialRows.map((it) => {
                  const isSelected = selected.has(it._key)
                  return (
                    <tr
                      key={it._key}
                      className={cn(
                        'border-b border-border align-top',
                        it.ordered
                          ? 'bg-surface-raised text-secondary'
                          : isSelected
                            ? 'bg-[var(--nav-active-bg)]'
                            : 'hover:bg-surface-raised',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        {!it.ordered ? (
                          <button
                            type="button"
                            onClick={() => toggle(it._key)}
                            className="text-[var(--accent)]"
                            aria-label="Select"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4 text-secondary" />
                            )}
                          </button>
                        ) : (
                          <CheckSquare className="h-4 w-4 text-emerald-500" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-primary">
                        {it.room || 'General'}
                      </td>
                      <td
                        className={cn(
                          'max-w-[360px] px-3 py-2.5 text-primary',
                          it.ordered && 'line-through',
                        )}
                      >
                        <div
                          className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[12.5px] leading-snug [scrollbar-width:thin]"
                          title={it.description || undefined}
                        >
                          {it.description || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-secondary">{it.unit}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {it.qty}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatInr(it.rate)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
                        {formatInr(it.amount)}
                      </td>
                      <td className="px-3 py-2.5">
                        {it.ordered ? (
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            On a PO
                          </span>
                        ) : (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            To buy
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {hiddenMaterialCount > 0 && (
              <div className="border-t border-border px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllMaterials((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5dfd7] bg-[#faf9f7] px-4 py-2 text-[12.5px] font-semibold text-[#1e2022] transition hover:border-[#c4b8a8] hover:bg-white"
                >
                  {showAllMaterials
                    ? 'Show less'
                    : `Show more materials (${hiddenMaterialCount} more)`}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="!bg-surface shadow-sm">
        <RfqPanel
          createOpen={rfqOpen}
          onCreateOpenChange={setRfqOpen}
          projectId={id}
          quotationId={approvedQuote?._id}
          selectedItems={selectedItems}
          vendors={vendors}
          onCleared={() => setSelected(new Set())}
        />
      </Card>

      <Card padding={false} className="overflow-hidden !bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-primary">
            Purchase orders
          </p>
          <p className="text-[11px] text-secondary">
            Tap status to advance: Draft → Approved → Ordered → In transit →
            Delivered
          </p>
        </div>
        {isLoading ? (
          <div className="h-32 animate-pulse bg-surface-raised" />
        ) : (
          <DataTable
            columns={[
              { key: 'poNumber', label: 'PO #' },
              {
                key: 'vendor',
                label: 'Vendor',
                render: (_, row) => row.vendor?.name || '—',
              },
              {
                key: 'items',
                label: 'Items',
                render: (items) =>
                  items?.length
                    ? `${items.length} line${items.length === 1 ? '' : 's'}`
                    : '—',
              },
              {
                key: 'value',
                label: 'Value',
                numeric: true,
                align: 'right',
                render: (v) => formatInr(v),
              },
              {
                key: 'status',
                label: 'Status',
                render: (v, row) => (
                  <button
                    type="button"
                    onClick={() => {
                      const flow = [
                        'draft',
                        'approved',
                        'ordered',
                        'in_transit',
                        'delivered',
                      ]
                      const next =
                        flow[Math.min(flow.indexOf(v) + 1, flow.length - 1)]
                      patch.mutate({ poId: row._id, status: next })
                    }}
                  >
                    <StatusChip status={v} />
                  </button>
                ),
              },
              {
                key: 'send',
                label: '',
                render: (_, row) => <SendPoButton po={row} />,
              },
            ]}
            data={pos}
            emptyMessage="No purchase orders yet — award an RFQ above and the PO is raised for you."
          />
        )}
      </Card>

      {vendors.length > 0 && (
        <Card className="!bg-surface shadow-sm">
          <p className="mb-3 text-[13px] font-semibold text-primary">
            Vendors you can order from
          </p>
          <div className="flex flex-wrap gap-2">
            {vendors.slice(0, 8).map((v) => (
              <span
                key={v._id}
                className="rounded-full bg-surface-raised px-3 py-1 text-[12px] font-medium text-primary"
              >
                {v.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          selectedItems.length
            ? `Raise PO · ${selectedItems.length} quote item${selectedItems.length === 1 ? '' : 's'}`
            : 'Raise purchase order'
        }
      >
        <PoForm
          vendors={vendors}
          projectName={project?.name}
          presetItems={selectedItems}
          onSubmit={(values) =>
            create.mutate({
              ...values,
              projectId: id,
              value: Number(values.value) || 0,
            })
          }
          loading={create.isPending}
          onVendorAdded={(vendor) => {
            qc.setQueryData(['vendors'], (old) => ({
              ...(old || {}),
              vendors: [...(old?.vendors || []), vendor],
            }))
            qc.invalidateQueries({ queryKey: ['vendors'] })
          }}
        />
      </Modal>
    </div>
  )
}

function PoForm({
  vendors,
  onSubmit,
  loading,
  presetItems = [],
  projectName,
  onVendorAdded,
}) {
  const [form, setForm] = useState({
    vendor: vendors[0]?._id || '',
    value: '',
    itemsDesc: '',
  })
  const [newVendorOpen, setNewVendorOpen] = useState(!vendors.length)
  const emptyVendor = {
    name: '',
    contact: '',
    phoneCode: '+91',
    phone: '',
    email: '',
    gst: '',
    rating: '4',
  }
  const [newVendor, setNewVendor] = useState(emptyVendor)

  const addVendor = useMutation({
    mutationFn: (body) =>
      api('/vendors', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      const vendor = res?.vendor
      if (vendor?._id) {
        onVendorAdded?.(vendor)
        setForm((f) => ({ ...f, vendor: vendor._id }))
      }
      setNewVendor(emptyVendor)
      setNewVendorOpen(false)
      toast(`${vendor?.name || 'Vendor'} added`, { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not add vendor', { type: 'error' }),
  })

  const fromQuote = presetItems.length > 0
  const quoteValue = presetItems.reduce(
    (s, it) => s + (Number(it.amount) || 0),
    0,
  )

  useEffect(() => {
    if (fromQuote) {
      setForm((f) => ({
        ...f,
        value: String(quoteValue),
        itemsDesc: presetItems
          .map((it) => it.description || 'Item')
          .join(', '),
      }))
    }
  }, [fromQuote, quoteValue, presetItems])

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const items = fromQuote
          ? presetItems.map((it) => ({
              description: it.description || 'Materials',
              qty: Number(it.qty) || 1,
              rate: Number(it.rate) || 0,
              amount:
                Number(it.amount) ||
                (Number(it.qty) || 0) * (Number(it.rate) || 0),
              boqItemId: it._id || undefined,
            }))
          : [
              {
                description: form.itemsDesc || 'Materials',
                qty: 1,
                rate: Number(form.value) || 0,
                amount: Number(form.value) || 0,
              },
            ]
        onSubmit({
          vendor: form.vendor,
          value: fromQuote ? quoteValue : form.value,
          items,
          status: 'draft',
        })
      }}
    >
      {fromQuote && (
        <div className="rounded-xl border border-[#d1fae5] bg-[var(--nav-active-bg)] px-3 py-2.5 text-[12px] text-[var(--accent-hover)]">
          <p className="font-semibold">
            From {projectName || 'project'} approved quote
          </p>
          <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto">
            {presetItems.map((it) => (
              <li key={it._key} className="flex justify-between gap-2">
                <span className="truncate">
                  {it.room ? `${it.room} · ` : ''}
                  {it.description}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatInr(it.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Select
          label="Vendor"
          value={form.vendor}
          onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          options={
            vendors.length
              ? vendors.map((v) => ({ value: v._id, label: v.name }))
              : [{ value: '', label: 'No vendors yet — add one below' }]
          }
        />
        {!newVendorOpen && (
          <button
            type="button"
            onClick={() => setNewVendorOpen(true)}
            className="mt-1.5 text-[12px] font-semibold text-[var(--accent)] hover:underline"
          >
            + Add a new vendor
          </button>
        )}
      </div>

      {newVendorOpen && (
        <div className="space-y-2.5 rounded-xl border border-border bg-surface-raised p-3">
          <p className="text-[12px] font-semibold text-primary">
            New vendor
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Input
              label="Name"
              value={newVendor.name}
              onChange={(e) =>
                setNewVendor({ ...newVendor, name: e.target.value })
              }
              placeholder="e.g. Sharma Plywood"
            />
            <Input
              label="Contact person"
              value={newVendor.contact}
              onChange={(e) =>
                setNewVendor({ ...newVendor, contact: e.target.value })
              }
              placeholder="e.g. Ramesh"
            />
          </div>
          <div className="flex gap-2">
            <div className="w-[92px] shrink-0">
              <Select
                label="Code"
                value={newVendor.phoneCode}
                onChange={(e) =>
                  setNewVendor({ ...newVendor, phoneCode: e.target.value })
                }
                options={COUNTRY_CODES.map((c) => ({
                  value: c.code,
                  label: c.code,
                }))}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Phone (WhatsApp)"
                type="tel"
                inputMode="numeric"
                value={newVendor.phone}
                onChange={(e) =>
                  setNewVendor({
                    ...newVendor,
                    phone: e.target.value.replace(/[^\d\s-]/g, ''),
                  })
                }
                placeholder="98765 43210"
              />
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Input
              label="Email (optional)"
              type="email"
              value={newVendor.email}
              onChange={(e) =>
                setNewVendor({ ...newVendor, email: e.target.value })
              }
              placeholder="sales@vendor.com"
            />
            <Input
              label="GST no (optional)"
              value={newVendor.gst}
              onChange={(e) =>
                setNewVendor({ ...newVendor, gst: e.target.value.toUpperCase() })
              }
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
            />
          </div>
          <Select
            label="Rating (review)"
            value={newVendor.rating}
            onChange={(e) =>
              setNewVendor({ ...newVendor, rating: e.target.value })
            }
            options={[
              { value: '5', label: '★ 5 — excellent' },
              { value: '4', label: '★ 4 — good' },
              { value: '3', label: '★ 3 — average' },
              { value: '2', label: '★ 2 — poor' },
              { value: '1', label: '★ 1 — avoid' },
            ]}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={addVendor.isPending}
              disabled={!newVendor.name.trim()}
              onClick={() =>
                addVendor.mutate({
                  name: newVendor.name.trim(),
                  contact: newVendor.contact.trim(),
                  phone: buildPhone(newVendor.phoneCode, newVendor.phone),
                  email: newVendor.email.trim(),
                  gst: newVendor.gst.trim().toUpperCase(),
                  rating: Number(newVendor.rating) || 4,
                })
              }
            >
              Save vendor
            </Button>
            {vendors.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewVendorOpen(false)}
              >
                Cancel
              </Button>
            )}
          </div>
          <p className="text-[11px] text-secondary">
            Payment terms and supplies can be set on the Materials page in the
            sidebar.
          </p>
        </div>
      )}
      {!fromQuote && (
        <Input
          label="Description"
          value={form.itemsDesc}
          onChange={(e) => setForm({ ...form, itemsDesc: e.target.value })}
        />
      )}
      <Input
        label="Value"
        type="number"
        value={fromQuote ? quoteValue : form.value}
        disabled={fromQuote}
        onChange={(e) => setForm({ ...form, value: e.target.value })}
      />
      <Button
        type="submit"
        className="w-full"
        loading={loading}
        disabled={!form.vendor}
      >
        Create PO
      </Button>
    </form>
  )
}

/** open → fixed → verified, then back to open when something regresses. */
const SNAG_FLOW = {
  open: { next: 'fixed', action: 'Mark fixed' },
  fixed: { next: 'verified', action: 'Verify' },
  verified: { next: 'open', action: 'Reopen' },
}

function SiteStat({ icon: Icon, label, value, hint, tone = 'blue' }) {
  const tones = {
    blue: 'bg-[var(--nav-active-bg)] text-[var(--accent)]',
    red: 'bg-[#fef2f2] text-[#dc2626]',
    green: 'bg-[var(--nav-active-bg)] text-[#059669]',
  }
  return (
    <Card className="flex items-center gap-3 !bg-surface shadow-sm">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          tones[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-secondary">{label}</p>
        <p className="text-[20px] font-semibold leading-tight text-primary">
          {value}
        </p>
        {hint && (
          <p className="truncate text-[11px] text-secondary">{hint}</p>
        )}
      </div>
    </Card>
  )
}

export function ProjectSite() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const noteRef = useRef(null)
  const { data, isLoading } = useQuery({
    queryKey: ['site', id],
    queryFn: () => api(`/site-updates?projectId=${id}`),
  })
  const { data: snagsData } = useQuery({
    queryKey: ['snags', id],
    queryFn: () => api(`/snags?projectId=${id}`),
  })
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [progress, setProgress] = useState('')
  const [uploading, setUploading] = useState(false)
  const [snagTitle, setSnagTitle] = useState('')

  useEffect(() => {
    if (searchParams.get('compose') === '1') {
      window.setTimeout(() => noteRef.current?.focus(), 50)
      const next = new URLSearchParams(searchParams)
      next.delete('compose')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  /** Site photos ride on the shared /files upload, filed under the site folder. */
  const uploadPhotos = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (!files.length) return
    setUploading(true)
    let failed = 0
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('projectId', id)
        fd.append('folder', 'site')
        fd.append('name', file.name)
        const res = await api('/files', { method: 'POST', body: fd })
        const url = res?.file?.versions?.[0]?.url
        if (url) setPhotos((p) => [...p, { url }])
        else failed += 1
      } catch {
        failed += 1
      }
    }
    setUploading(false)
    if (failed) {
      toast(`${failed} photo${failed > 1 ? 's' : ''} failed to upload`, {
        type: 'error',
      })
    }
  }

  const post = useMutation({
    mutationFn: (body) =>
      api('/site-updates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['files', id] })
      setNote('')
      setPhotos([])
      setProgress('')
      toast('Update published — the office can see it now', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not post', { type: 'error' }),
  })

  const addSnag = useMutation({
    mutationFn: (body) =>
      api('/snags', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snags', id] })
      setSnagTitle('')
      toast('Snag added', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not add snag', { type: 'error' }),
  })

  const patchSnag = useMutation({
    mutationFn: ({ snagId, body }) =>
      api(`/snags/${snagId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['snags', id] })
      qc.invalidateQueries({ queryKey: ['tasks', id] })
      if (vars.body.convertToTask) {
        toast('Task created on the Tasks tab', { type: 'success' })
      } else {
        toast(`Snag marked ${res?.snag?.status || 'updated'}`, {
          type: 'success',
        })
      }
    },
    onError: (e) =>
      toast(e.message || 'Could not update snag', { type: 'error' }),
  })

  const updates = data?.updates || []
  const snags = snagsData?.snags || []
  const openSnags = snags.filter((s) => s.status === 'open').length
  const verifiedSnags = snags.filter((s) => s.status === 'verified').length
  const lastUpdate = updates[0]
  const canPost = !!note.trim() && !uploading

  const submit = () => {
    const pct = Number(progress)
    post.mutate({
      projectId: id,
      note: note.trim(),
      photos,
      progress: Number.isFinite(pct) && progress !== '' ? pct : 0,
    })
  }

  return (
    <div className="space-y-4 p-4 md:p-5 lg:p-6 bg-[var(--bg-canvas)] min-h-full">
      <div className="grid gap-3 sm:grid-cols-3">
        <SiteStat
          icon={Camera}
          label="Site updates"
          value={updates.length}
          hint={
            lastUpdate?.createdAt
              ? `Last ${formatDistanceToNow(new Date(lastUpdate.createdAt), {
                  addSuffix: true,
                })}`
              : 'Nothing posted yet'
          }
        />
        <SiteStat
          icon={AlertTriangle}
          label="Open snags"
          value={openSnags}
          hint={
            snags.length
              ? `${snags.length} logged in total`
              : 'Nothing logged yet'
          }
          tone={openSnags ? 'red' : 'green'}
        />
        <SiteStat
          icon={CheckSquare}
          label="Verified fixed"
          value={verifiedSnags}
          hint={
            openSnags ? `${openSnags} still to close` : 'Clear for handover'
          }
          tone="green"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="space-y-3 !bg-surface shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-primary">
                Today on site
              </h3>
              <p className="text-[12px] text-secondary">
                Write what was done — the office sees it right away
              </p>
            </div>
            <textarea
              ref={noteRef}
              rows={3}
              placeholder="e.g. Carpentry finished in master bedroom. Waiting on ply delivery."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-none rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-[13px] text-primary outline-none placeholder:text-secondary focus:border-[#4ade80] focus:bg-surface"
            />

            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div
                    key={p.url}
                    className="relative h-20 w-20 overflow-hidden rounded-xl border border-border"
                  >
                    <img
                      src={assetUrl(p.url)}
                      alt={`Site photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      title="Remove photo"
                      onClick={() =>
                        setPhotos((list) => list.filter((x) => x.url !== p.url))
                      }
                      className="on-dark absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white hover:bg-[#dc2626]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[11px] border border-border px-3 text-[12px] font-semibold text-primary hover:border-[#c7c7c7] hover:bg-surface-raised">
                <Camera className="h-4 w-4" />
                {uploading ? 'Uploading…' : 'Add photos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    uploadPhotos(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>

              <label className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-border px-3 text-[12px] text-secondary">
                Progress
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="—"
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  className="w-14 bg-transparent text-right text-[13px] font-semibold text-primary outline-none"
                />
                %
              </label>

              <Button
                className="ml-auto"
                disabled={!canPost}
                loading={post.isPending}
                onClick={submit}
              >
                Publish update
              </Button>
            </div>
          </Card>

          {isLoading && (
            <Card className="!bg-surface shadow-sm">
              <p className="text-sm text-secondary">Loading site updates…</p>
            </Card>
          )}

          {!isLoading && updates.length === 0 && (
            <EmptyState
              icon={Camera}
              title="No site updates yet"
              description="Post the first update so the office knows what happened today. Photos and a progress % help everyone see it without a call."
              actionLabel="Write the first update"
              onAction={() => noteRef.current?.focus()}
            />
          )}

          {updates.map((u) => {
            const pics = (u.photos || []).filter((p) => p?.url)
            return (
              <Card
                key={u._id}
                padding={false}
                className="overflow-hidden !bg-surface shadow-sm"
              >
                <div className="flex items-center gap-2 px-4 pt-4">
                  <Avatar
                    src={u.author?.avatar}
                    name={u.author?.name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">
                      {u.author?.name || 'Team'}
                    </p>
                    <p className="text-[11px] text-secondary">
                      {u.createdAt
                        ? formatDistanceToNow(new Date(u.createdAt), {
                            addSuffix: true,
                          })
                        : ''}
                    </p>
                  </div>
                  {u.progress > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-[var(--nav-active-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">
                      {u.progress}% done
                    </span>
                  )}
                </div>

                {u.note && (
                  <p className="whitespace-pre-line px-4 pt-3 text-sm text-primary">
                    {u.note}
                  </p>
                )}

                {pics.length > 0 && (
                  <div
                    className={cn(
                      'mt-3 grid gap-1',
                      pics.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                    )}
                  >
                    {pics.map((p, i) => (
                      <a
                        key={`${u._id}-${i}`}
                        href={assetUrl(p.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={assetUrl(p.url)}
                          alt={`Site photo ${i + 1}`}
                          className={cn(
                            'w-full object-cover transition-opacity hover:opacity-90',
                            pics.length === 1 ? 'h-56' : 'h-32',
                          )}
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div className="h-4" />
              </Card>
            )
          })}
        </div>

        <Card
          padding={false}
          className="!bg-surface shadow-sm lg:sticky lg:top-0 lg:col-span-2"
        >
          <div className="flex items-start gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-primary">
                Snag list
              </h3>
              <p className="text-[11px] text-secondary">
                Defects to fix before handover
              </p>
            </div>
            {openSnags > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-[#fef2f2] px-2.5 py-1 text-[11px] font-semibold text-[#dc2626]">
                {openSnags} open
              </span>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-b border-border p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!snagTitle.trim()) return
              addSnag.mutate({
                projectId: id,
                title: snagTitle.trim(),
                status: 'open',
              })
            }}
          >
            <input
              placeholder="e.g. Scratch on wardrobe shutter"
              value={snagTitle}
              onChange={(e) => setSnagTitle(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-[11px] border border-border bg-surface-raised px-3 text-[13px] text-primary outline-none placeholder:text-secondary focus:border-[#4ade80] focus:bg-surface"
            />
            <Button
              type="submit"
              size="sm"
              className="shrink-0"
              disabled={!snagTitle.trim()}
              loading={addSnag.isPending}
            >
              Add
            </Button>
          </form>

          <div className="divide-y divide-border">
            {snags.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-secondary">
                No snags logged — looking good.
              </p>
            )}
            {snags.map((s) => {
              const flow = SNAG_FLOW[s.status] || SNAG_FLOW.open
              return (
                <div key={s._id} className="space-y-2 px-4 py-3">
                  <p className="text-sm font-medium text-primary">
                    {s.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={s.status} />
                    <button
                      type="button"
                      disabled={patchSnag.isPending}
                      className="rounded-md border border-[#d1fae5] bg-[var(--nav-active-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[#d1fae5] disabled:opacity-60"
                      onClick={() =>
                        patchSnag.mutate({
                          snagId: s._id,
                          body: { status: flow.next },
                        })
                      }
                    >
                      {flow.action}
                    </button>
                    {s.taskId ? (
                      <Link
                        to={`/projects/${id}/tasks?task=${s.taskId}`}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-secondary underline hover:text-[var(--accent)]"
                      >
                        View task
                      </Link>
                    ) : (
                      s.status === 'open' && (
                        <button
                          type="button"
                          disabled={patchSnag.isPending}
                          className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-secondary hover:border-[#c7c7c7] hover:text-primary disabled:opacity-60"
                          onClick={() =>
                            patchSnag.mutate({
                              snagId: s._id,
                              body: { convertToTask: true },
                            })
                          }
                        >
                          Make task
                        </button>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

export function ProjectTeam() {
  const { id } = useParams()
  const { project } = useOutletContext()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const members = project?.members || []
  const [userId, setUserId] = useState('')

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api('/users'),
  })
  const users = usersData?.users || []
  const memberIds = new Set(
    members.map((m) => String(m.user?._id || m.user)).filter(Boolean),
  )
  const available = users.filter((u) => !memberIds.has(String(u._id || u.id)))
  const canManageTeam =
    user?.isPlatformAdmin ||
    ['admin', 'owner', 'project_manager'].includes(user?.role)

  const add = useMutation({
    mutationFn: (body) =>
      api(`/projects/${id}/members`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      setUserId('')
      toast('Member added', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const remove = useMutation({
    mutationFn: (uid) =>
      api(`/projects/${id}/members/${uid}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      toast('Member removed', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  return (
    <div className="space-y-4 p-4 md:p-5 lg:p-6 bg-[var(--bg-canvas)] min-h-full">
      <div>
        <h2 className="text-[18px] font-semibold text-primary">Team</h2>
        <p className="text-[13px] text-secondary">
          People on this project — assign them on tasks
        </p>
      </div>
      {canManageTeam && (
        <Card className="space-y-3 !bg-surface shadow-sm">
          <div>
            <h3 className="text-sm font-semibold">Add teammate</h3>
            <p className="text-[12px] text-secondary">
              They can then be assigned tasks here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[200px] flex-1">
              <Select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                options={[
                  { value: '', label: 'Choose person…' },
                  ...available.map((u) => ({
                    value: u._id || u.id,
                    label: `${u.name} (${(u.role || '').replace(/_/g, ' ')})`,
                  })),
                ]}
              />
            </div>
            <Button
              disabled={!userId}
              loading={add.isPending}
              onClick={() =>
                add.mutate({
                  userId,
                  role:
                    users.find((u) => String(u._id || u.id) === userId)?.role ||
                    'designer',
                })
              }
            >
              Add
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false} className="!bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold">Team on this project</h3>
          <AvatarStack
            users={members.map((m) => m.user).filter(Boolean)}
            max={6}
          />
        </div>
        <div className="divide-y divide-border">
          {members.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-secondary">
              No members yet — add someone above.
            </p>
          )}
          {members.map((m) => (
            <div
              key={m.user?._id || m._id}
              className="flex items-center gap-3 px-5 py-4"
            >
              <Avatar src={m.user?.avatar} name={m.user?.name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.user?.name}</p>
                <p className="text-xs text-secondary">{m.user?.email}</p>
              </div>
              <StatusChip
                status="in_progress"
                label={(m.role || m.user?.role || '').replace(/_/g, ' ')}
              />
              {canManageTeam && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-secondary hover:text-status-delayed"
                  onClick={() => remove.mutate(m.user?._id || m.user)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function ProjectActivity() {
  const { id } = useParams()
  const { data } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api(`/activity?projectId=${id}`),
  })

  return (
    <Card padding={false}>
      <div className="divide-y divide-border">
        {(data?.activity || []).map((a) => (
          <div key={a._id} className="flex gap-3 px-5 py-4">
            <Avatar src={a.actor?.avatar} name={a.actor?.name} size="sm" />
            <div>
              <p className="text-sm">{a.message}</p>
              <p className="text-[11px] text-secondary mt-0.5">
                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
        {(data?.activity || []).length === 0 && (
          <EmptyState title="Quiet so far" description="Project activity will stream here." />
        )}
      </div>
    </Card>
  )
}

export function ProjectClientPortal() {
  const { project, stats } = useOutletContext()
  const { id } = useParams()
  const { data: filesData } = useQuery({
    queryKey: ['client-files', id],
    queryFn: () => api(`/files?projectId=${id}&clientVisible=true`),
  })
  const { data: siteData } = useQuery({
    queryKey: ['site', id],
    queryFn: () => api(`/site-updates?projectId=${id}`),
  })

  return (
    <div className="space-y-4">
      <Card variant="light" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Client portal preview</p>
            <h2 className="text-2xl font-semibold text-on-light">{project.name}</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Progress for {project.clientName} — internal costs hidden.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums text-on-light">
              {project.progress}%
            </p>
            <p className="text-xs text-zinc-500">Complete</p>
          </div>
        </div>
        <ProgressBar value={project.progress} color="#16161A" trackClassName="bg-zinc-200" />
        <div className="flex flex-wrap gap-2">
          {(project.stages || []).map((s) => (
            <StatusChip key={s.key} status={s.status} label={s.label} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold mb-3">Shared documents</h3>
          <div className="space-y-2">
            {(filesData?.files || []).length === 0 && (
              <p className="text-sm text-secondary">No client-visible files yet.</p>
            )}
            {(filesData?.files || []).map((f) => (
              <div
                key={f._id}
                className="flex items-center justify-between rounded-[12px] border border-border px-3 py-2"
              >
                <span className="text-sm truncate">{f.name}</span>
                <StatusChip status={f.status} />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold mb-3">Latest site photos</h3>
          <div className="grid grid-cols-2 gap-2">
            {(siteData?.updates || [])
              .flatMap((u) => u.photos || [])
              .slice(0, 4)
              .map((p, i) => (
                <img
                  key={i}
                  src={p.url}
                  alt=""
                  className="h-24 w-full rounded-[12px] object-cover"
                />
              ))}
          </div>
          <p className="mt-3 text-xs text-secondary">
            Pending approvals: {stats?.pendingApprovals ?? 0}
          </p>
        </Card>
      </div>
    </div>
  )
}
