import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Mail,
  Package,
  Send,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import { formatInr } from '../lib/format'
import {
  COUNTRY_CODES,
  buildPhone,
  splitPhone,
  whatsappLink,
} from '../lib/phone'
import { vendorHelloEmailDraft } from '../lib/composeEmail'
import { openComposeEmail } from '../store/composeEmailStore'
import { Stars, SendPoButton } from '../components/VendorBits'
import {
  BoqControlTab,
  DebitNotesTab,
  GrnTab,
  InventoryEmbedTab,
  InvoicesEmbedTab,
  MaterialIssuesTab,
  MaterialRequestsTab,
  PaymentsTab,
  ProcurementDashboard,
  ProcurementTabBar,
  QcTab,
  useProcurementTab,
} from '../components/procurement/ProcurementTabs'
import { PILL_ACTIVE, PILL_IDLE, PILL_TRACK } from '../components/layout/PageToolbar'
import { cn } from '../lib/utils'
import {
  Button,
  Drawer,
  EmptyState,
  Input,
  Modal,
  Select,
  SkeletonCard,
  StatusChip,
  toast,
} from '../components/ui'

const PO_STATUSES = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'approved', label: 'Approved' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
]

const PO_FLOW = ['draft', 'approved', 'ordered', 'in_transit', 'delivered']

function nextPoStatus(status) {
  const i = PO_FLOW.indexOf(status)
  if (i < 0 || i >= PO_FLOW.length - 1) return null
  return PO_FLOW[i + 1]
}

function statusLabel(status) {
  return (
    PO_STATUSES.find((s) => s.key === status)?.label ||
    String(status || '').replace(/_/g, ' ')
  )
}

export function MaterialsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useProcurementTab()
  const [poSearch, setPoSearch] = useState('')
  const [poStatus, setPoStatus] = useState('all')
  const [vendorSearch, setVendorSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedPo, setSelectedPo] = useState(null)
  const [addVendorOpen, setAddVendorOpen] = useState(false)
  const [editVendor, setEditVendor] = useState(null)
  const [deleteVendor, setDeleteVendor] = useState(null)
  const [compareOpen, setCompareOpen] = useState(false)

  const {
    data: posData,
    isLoading: posLoading,
    isError: posError,
    error: posErr,
    refetch: refetchPos,
    isFetching: posFetching,
  } = useQuery({
    queryKey: ['all-pos'],
    queryFn: () => api('/purchase-orders'),
  })

  // Every project's RFQs, so the sidebar Materials page shows the stage before
  // a PO exists rather than only finished orders.
  const { data: rfqData, isLoading: rfqsLoading } = useQuery({
    queryKey: ['all-rfqs'],
    queryFn: () => api('/rfqs'),
  })
  const rfqs = rfqData?.rfqs || []

  const {
    data: vendorsData,
    isLoading: vendorsLoading,
    isError: vendorsError,
    error: vendorsErr,
    refetch: refetchVendors,
    isFetching: vendorsFetching,
  } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api('/vendors'),
  })

  const purchaseOrders = posData?.purchaseOrders || []
  const vendorList = vendorsData?.vendors || []
  const isLoading = posLoading || vendorsLoading
  const isError = posError || vendorsError
  const isFetching = posFetching || vendorsFetching

  const createVendor = useMutation({
    mutationFn: (body) =>
      api('/vendors', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setAddVendorOpen(false)
      toast(`${res?.vendor?.name || 'Vendor'} added`, { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not add vendor', { type: 'error' }),
  })

  const updateVendor = useMutation({
    mutationFn: ({ id, body }) =>
      api(`/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      qc.invalidateQueries({ queryKey: ['all-pos'] })
      setEditVendor(null)
      toast('Vendor updated', { type: 'success' })
    },
    onError: (e) =>
      toast(e.message || 'Could not update vendor', { type: 'error' }),
  })

  const removeVendor = useMutation({
    mutationFn: (id) => api(`/vendors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setDeleteVendor(null)
      toast('Vendor removed', { type: 'success' })
    },
    onError: (e) =>
      toast(e.message || 'Could not delete vendor', { type: 'error' }),
  })

  const patchPo = useMutation({
    mutationFn: ({ id, body }) =>
      api(`/purchase-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['all-pos'] })
      if (res?.purchaseOrder) {
        setSelectedPo((prev) =>
          prev && String(prev._id) === String(res.purchaseOrder._id)
            ? { ...prev, ...res.purchaseOrder }
            : prev,
        )
      }
      toast('Order updated', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not update order', { type: 'error' }),
  })

  const categories = useMemo(() => {
    const set = new Set()
    for (const v of vendorList) {
      for (const c of v.categories || []) {
        if (c?.trim()) set.add(c.trim())
      }
    }
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [vendorList])

  const stats = useMemo(() => {
    const totalPoValue = purchaseOrders.reduce(
      (s, po) => s + (Number(po.value) || 0),
      0,
    )
    const delivered = purchaseOrders.filter((po) => po.status === 'delivered')
      .length
    const open = purchaseOrders.length - delivered
    const inTransit = purchaseOrders.filter((po) => po.status === 'in_transit')
      .length
    return {
      totalPoValue,
      open,
      delivered,
      inTransit,
      vendors: vendorList.length,
    }
  }, [purchaseOrders, vendorList])

  const filteredPos = useMemo(() => {
    const q = poSearch.trim().toLowerCase()
    return purchaseOrders.filter((po) => {
      if (poStatus !== 'all' && po.status !== poStatus) return false
      if (!q) return true
      const hay = [
        po.poNumber,
        po.projectId?.name,
        po.vendor?.name,
        po.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [purchaseOrders, poSearch, poStatus])

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase()
    return vendorList.filter((v) => {
      if (category !== 'all') {
        const cats = (v.categories || []).map((c) => c.toLowerCase())
        if (!cats.includes(category.toLowerCase())) return false
      }
      if (!q) return true
      const hay = [
        v.name,
        v.contact,
        v.phone,
        v.email,
        v.gst,
        ...(v.categories || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [vendorList, vendorSearch, category])

  if (isLoading && ['rfqs', 'orders', 'vendors'].includes(tab)) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-4 pb-10">
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

  if (isError && ['rfqs', 'orders', 'vendors'].includes(tab)) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load materials"
        description={
          posErr?.message ||
          vendorsErr?.message ||
          'Check your connection and try again.'
        }
        actionLabel="Retry"
        onAction={() => {
          refetchPos()
          refetchVendors()
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1500px] space-y-5 pb-10 transition-opacity',
        isFetching && 'opacity-90',
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-medium tracking-[-0.02em] text-primary">
              Materials pipeline
            </h1>
            <p className="mt-0.5 text-[13px] text-secondary">
              Requests, vendor quotes, purchase orders, goods received, and bills.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {vendorList.length >= 2 ? (
              <Button variant="secondary" onClick={() => setCompareOpen(true)}>
                <ArrowLeftRight className="h-4 w-4" />
                Compare
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setTab('vendors')
                setAddVendorOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Add vendor
            </Button>
          </div>
        </div>
        <ProcurementTabBar tab={tab} setTab={setTab} />
      </div>

      {tab === 'dashboard' ||
      tab === 'boq' ||
      tab === 'grn' ||
      tab === 'qc' ||
      tab === 'debit' ||
      tab === 'inventory' ||
      tab === 'requests' ||
      tab === 'issues' ||
      tab === 'invoices' ||
      tab === 'payments' ? null : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="PO value"
            value={formatInr(stats.totalPoValue)}
            foot={`${purchaseOrders.length} orders`}
          />
          <Kpi
            label="In pipeline"
            value={stats.open}
            accent
            foot={
              stats.inTransit
                ? `${stats.inTransit} in transit`
                : 'Draft → delivery'
            }
          />
          <Kpi label="Delivered" value={stats.delivered} />
          <Kpi
            label="Vendors"
            value={stats.vendors}
            foot="Active directory"
            onClick={() => setTab('vendors')}
          />
        </section>
      )}

      {tab === 'dashboard' ? (
        <ProcurementDashboard onGo={setTab} />
      ) : tab === 'boq' ? (
        <BoqControlTab />
      ) : tab === 'rfqs' ? (
        <AllRfqsPanel rfqs={rfqs} loading={rfqsLoading} />
      ) : tab === 'orders' ? (
        <OrdersPanel
          orders={filteredPos}
          total={purchaseOrders.length}
          search={poSearch}
          setSearch={setPoSearch}
          status={poStatus}
          setStatus={setPoStatus}
          onOpen={setSelectedPo}
        />
      ) : tab === 'grn' ? (
        <GrnTab />
      ) : tab === 'qc' ? (
        <QcTab />
      ) : tab === 'debit' ? (
        <DebitNotesTab />
      ) : tab === 'inventory' ? (
        <InventoryEmbedTab />
      ) : tab === 'requests' ? (
        <MaterialRequestsTab />
      ) : tab === 'issues' ? (
        <MaterialIssuesTab />
      ) : tab === 'invoices' ? (
        <InvoicesEmbedTab />
      ) : tab === 'payments' ? (
        <PaymentsTab />
      ) : (
        <VendorsPanel
          vendors={filteredVendors}
          total={vendorList.length}
          search={vendorSearch}
          setSearch={setVendorSearch}
          category={category}
          setCategory={setCategory}
          categories={categories}
          onAdd={() => setAddVendorOpen(true)}
          onEdit={setEditVendor}
          onDelete={setDeleteVendor}
          onCompare={() => setCompareOpen(true)}
        />
      )}

      <Drawer
        open={!!selectedPo}
        onClose={() => setSelectedPo(null)}
        title={selectedPo?.poNumber || 'Purchase order'}
      >
        {selectedPo && (
          <PoDetail
            po={selectedPo}
            advancing={patchPo.isPending}
            onAdvance={() => {
              const next = nextPoStatus(selectedPo.status)
              if (!next) return
              patchPo.mutate({
                id: selectedPo._id,
                body: { status: next },
              })
            }}
          />
        )}
      </Drawer>

      <Modal
        open={addVendorOpen}
        onClose={() => !createVendor.isPending && setAddVendorOpen(false)}
        title="Add vendor"
      >
        <VendorForm
          loading={createVendor.isPending}
          onSubmit={(body) => createVendor.mutate(body)}
        />
      </Modal>

      <Modal
        open={!!editVendor}
        onClose={() => !updateVendor.isPending && setEditVendor(null)}
        title={`Edit ${editVendor?.name || 'vendor'}`}
      >
        {editVendor && (
          <VendorForm
            initial={editVendor}
            submitLabel="Save changes"
            loading={updateVendor.isPending}
            onSubmit={(body) =>
              updateVendor.mutate({ id: editVendor._id, body })
            }
          />
        )}
      </Modal>

      <Modal
        open={!!deleteVendor}
        onClose={() => setDeleteVendor(null)}
        title="Remove vendor?"
      >
        <p className="text-[13px] text-secondary">
          Remove{' '}
          <span className="font-semibold text-primary">
            {deleteVendor?.name}
          </span>{' '}
          from your directory. Existing purchase orders keep their history.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteVendor(null)}>
            Cancel
          </Button>
          <Button
            loading={removeVendor.isPending}
            onClick={() => removeVendor.mutate(deleteVendor._id)}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </div>
      </Modal>

      <VendorCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        vendors={vendorList}
        purchaseOrders={purchaseOrders}
      />
    </div>
  )
}

function Kpi({ label, value, foot, accent, onClick }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-[12px] border border-border bg-surface px-4 py-3.5 text-left',
        onClick && 'transition hover:border-accent/35',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-secondary">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 text-[22px] font-semibold tracking-tight tabular-nums',
          accent ? 'text-accent' : 'text-primary',
        )}
      >
        {value}
      </p>
      {foot ? (
        <p className="mt-1 text-[11px] text-secondary">{foot}</p>
      ) : null}
    </Comp>
  )
}

function OrdersPanel({
  orders,
  total,
  search,
  setSearch,
  status,
  setStatus,
  onOpen,
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-medium text-primary">
              Purchase orders
            </h2>
            <p className="mt-0.5 text-[11px] text-secondary">
              Open a row for line items, status, and WhatsApp send
            </p>
          </div>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO, project, vendor…"
              className="h-9 w-full min-w-[200px] rounded-full border border-border bg-surface-raised pl-8 pr-3 text-[12px] text-primary outline-none placeholder:text-secondary focus:border-accent/40 sm:w-56"
            />
          </div>
        </div>

        <div className={cn(PILL_TRACK, 'w-fit max-w-full flex-wrap')}>
          {PO_STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                status === s.key ? PILL_ACTIVE : PILL_IDLE,
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <EmptyState
            icon={Package}
            title={total === 0 ? 'No purchase orders yet' : 'Nothing matches'}
            description={
              total === 0
                ? 'Create orders from a project Materials tab when you buy from BOQ.'
                : 'Try another status or search.'
            }
          />
        </div>
      ) : (
        <>
          <div className="divide-y divide-border md:hidden">
            {orders.map((po) => (
              <button
                key={po._id}
                type="button"
                onClick={() => onOpen(po)}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-surface-raised"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-primary">
                      {po.poNumber}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-secondary">
                      {po.projectId?.name || '—'} · {po.vendor?.name || '—'}
                    </p>
                  </div>
                  <StatusChip status={po.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <SendPoButton po={po} />
                  </span>
                  <p className="text-[13px] font-semibold tabular-nums text-accent">
                    {formatInr(po.value)}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                  <th className="px-5 py-2.5 font-semibold">PO</th>
                  <th className="px-3 py-2.5 font-semibold">Project</th>
                  <th className="px-3 py-2.5 font-semibold">Vendor</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <tr
                    key={po._id}
                    onClick={() => onOpen(po)}
                    className="cursor-pointer border-b border-border last:border-0 transition hover:bg-surface-raised"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-[13px] font-semibold text-primary">
                        {po.poNumber}
                      </p>
                      <p className="mt-0.5 text-[11px] text-secondary">
                        {po.items?.length
                          ? `${po.items.length} line${po.items.length === 1 ? '' : 's'}`
                          : 'No lines'}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-[12.5px] text-secondary">
                      {po.projectId?.name || '—'}
                    </td>
                    <td className="px-3 py-3.5">
                      {po.vendor?.name ? (
                        <span className="inline-flex items-center gap-2">
                          <VendorAvatar name={po.vendor.name} size="sm" />
                          <span className="text-[12.5px] font-medium text-primary">
                            {po.vendor.name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right text-[13px] font-semibold tabular-nums text-accent">
                      {formatInr(po.value)}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusChip status={po.status} />
                    </td>
                    <td
                      className="px-5 py-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SendPoButton po={po} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function VendorsPanel({
  vendors,
  total,
  search,
  setSearch,
  category,
  setCategory,
  categories,
  onAdd,
  onEdit,
  onDelete,
  onCompare,
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[13.5px] font-medium text-primary">
            Vendor directory
          </h2>
          <p className="mt-0.5 text-[11px] text-secondary">
            Ratings, terms, and WhatsApp — filter by supply category
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {total >= 2 && (
            <button
              type="button"
              onClick={onCompare}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[12px] font-semibold text-secondary transition hover:border-accent/40 hover:text-primary"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Compare
            </button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors…"
              className="h-9 w-48 rounded-[10px] border border-border bg-surface-raised pl-8 pr-3 text-[12px] text-primary outline-none placeholder:text-secondary focus:border-accent/40"
            />
          </div>
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5 sm:px-5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                category === c
                  ? 'bg-surface-raised text-primary ring-1 ring-border'
                  : 'text-secondary hover:text-primary',
              )}
            >
              {c === 'all' ? 'All supplies' : c}
            </button>
          ))}
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
          <EmptyState
            icon={Store}
            title={total === 0 ? 'No vendors yet' : 'Nothing matches'}
            description={
              total === 0
                ? 'Add suppliers you buy from — plywood, hardware, finishes, and more.'
                : 'Try another category or search.'
            }
            actionLabel={total === 0 ? 'Add vendor' : undefined}
            onAction={total === 0 ? onAdd : undefined}
          />
        </div>
      ) : (
        <ul className="min-h-[420px] divide-y divide-border">
          {vendors.map((v) => {
            const tags =
              (v.categories || []).length > 0 ? v.categories : ['General']
            return (
              <li
                key={v._id}
                className="grid min-h-[88px] grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <VendorAvatar name={v.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[14px] font-semibold text-primary">
                        {v.name}
                      </p>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-secondary">
                        <Stars value={v.rating} />
                        <span className="font-semibold tabular-nums">
                          {v.rating}
                        </span>
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] leading-5 text-secondary">
                      {[v.contact, v.phone, v.paymentTerms]
                        .filter(Boolean)
                        .join(' · ') || 'No contact yet'}
                    </p>
                    <div className="mt-1.5 flex h-5 items-center gap-1 overflow-hidden">
                      {tags.slice(0, 4).map((c) => (
                        <span
                          key={c}
                          className="shrink-0 rounded-md bg-surface-raised px-2 py-0.5 text-[10.5px] font-medium leading-4 text-secondary"
                        >
                          {c}
                        </span>
                      ))}
                      {tags.length > 4 ? (
                        <span className="shrink-0 text-[10.5px] font-medium text-secondary">
                          +{tags.length - 4}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    title={
                      v.phone
                        ? `WhatsApp Web · ${v.contact || v.name}`
                        : 'Add a phone number first'
                    }
                    onClick={() => {
                      const url = whatsappLink(
                        v.phone,
                        `Hello ${v.contact || v.name},`,
                      )
                      if (!url) {
                        toast('No phone number saved for this vendor', {
                          type: 'error',
                        })
                        return
                      }
                      window.open(url, '_blank', 'noopener')
                    }}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[11.5px] font-semibold text-white transition',
                      v.phone
                        ? 'bg-[#25D366] hover:bg-[#1fb958]'
                        : 'bg-[#a7dcbb] hover:bg-[#98d2ad]',
                    )}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    title={
                      v.email
                        ? `Email ${v.contact || v.name}`
                        : 'Compose email — add vendor email if needed'
                    }
                    onClick={() => openComposeEmail(vendorHelloEmailDraft(v))}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-2.5 text-[11.5px] font-semibold text-[#171717] transition hover:bg-[var(--accent-hover)]"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(v)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-2.5 text-[11.5px] font-semibold text-secondary transition hover:border-accent/40 hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(v)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border text-secondary transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    title="Remove vendor"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PoDetail({ po, onAdvance, advancing }) {
  const next = nextPoStatus(po.status)
  const stepIndex = Math.max(0, PO_FLOW.indexOf(po.status))

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-border bg-surface-raised p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-secondary">
              Project
            </p>
            {po.projectId?._id || po.projectId ? (
              <Link
                to={`/projects/${po.projectId._id || po.projectId}/procurement`}
                className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:text-accent"
              >
                {po.projectId?.name || 'Open project'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="mt-1 text-[14px] font-semibold text-primary">—</p>
            )}
          </div>
          <p className="text-[18px] font-semibold tabular-nums text-accent">
            {formatInr(po.value)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-secondary">
          {po.vendor?.name ? (
            <span className="inline-flex items-center gap-1.5">
              <VendorAvatar name={po.vendor.name} size="sm" />
              {po.vendor.name}
            </span>
          ) : (
            'No vendor'
          )}
          {po.createdAt ? (
            <span>· {format(new Date(po.createdAt), 'd MMM yyyy')}</span>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Status
        </p>
        <div className="flex items-center gap-1">
          {PO_FLOW.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  'h-1.5 w-full rounded-full',
                  i <= stepIndex ? 'bg-accent' : 'bg-border',
                )}
              />
              <span
                className={cn(
                  'text-[9px] font-semibold uppercase tracking-wide',
                  i <= stepIndex ? 'text-primary' : 'text-secondary',
                )}
              >
                {statusLabel(s).split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip status={po.status} />
          {next && (
            <Button
              size="sm"
              loading={advancing}
              onClick={onAdvance}
              variant="secondary"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark {statusLabel(next).toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          Line items
        </p>
        {(po.items || []).length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-[12px] text-secondary">
            No line items on this order.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-border">
            {(po.items || []).map((it, i) => (
              <li
                key={it._id || i}
                className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-primary">
                    {it.description || 'Item'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-secondary">
                    Qty {it.qty ?? '—'} · Rate {formatInr(it.rate || 0)}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] font-semibold tabular-nums text-primary">
                  {formatInr(it.amount || (it.qty || 0) * (it.rate || 0))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SendPoButton po={po} className="h-10 w-full justify-center rounded-[10px] text-[13px]" />
    </div>
  )
}

const AVATAR_TINTS = [
  'from-[var(--accent)] to-[var(--accent-hover)]',
  'from-[#64748b] to-[#475569]',
  'from-[#0ea5e9] to-[#0284c7]',
  'from-[#f59e0b] to-[#d97706]',
  'from-[#8b5cf6] to-[#7c3aed]',
]

function VendorAvatar({ name = '', size = 'md', className }) {
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  const tint = AVATAR_TINTS[(name.charCodeAt(0) || 0) % AVATAR_TINTS.length]
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br font-semibold text-white',
        size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-10 w-10 text-[12px]',
        tint,
        className,
      )}
    >
      {initials}
    </span>
  )
}

function VendorForm({
  onSubmit,
  loading,
  initial = null,
  submitLabel = 'Add vendor',
}) {
  const [form, setForm] = useState(() => {
    const { code, number } = splitPhone(initial?.phone)
    return {
      name: initial?.name || '',
      contact: initial?.contact || '',
      phoneCode: code,
      phone: number,
      email: initial?.email || '',
      gst: initial?.gst || '',
      categories: (initial?.categories || []).join(', '),
      paymentTerms: initial?.paymentTerms || 'Net 30',
      rating: String(initial?.rating || 4),
    }
  })

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!form.name.trim()) {
          toast('Vendor name is required', { type: 'error' })
          return
        }
        onSubmit({
          name: form.name.trim(),
          contact: form.contact.trim(),
          phone: buildPhone(form.phoneCode, form.phone),
          email: form.email.trim(),
          gst: form.gst.trim().toUpperCase(),
          categories: form.categories
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
          paymentTerms: form.paymentTerms,
          rating: Number(form.rating) || 4,
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Vendor name"
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. BlueRock Materials"
        />
        <Input
          label="Contact person"
          value={form.contact}
          onChange={set('contact')}
          placeholder="e.g. Ramesh"
        />
      </div>
      <div className="flex gap-2">
        <div className="w-[104px] shrink-0">
          <Select
            label="Code"
            value={form.phoneCode}
            onChange={set('phoneCode')}
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
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value.replace(/[^\d\s-]/g, ''),
              })
            }
            placeholder="98765 43210"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="sales@vendor.com"
        />
        <Input
          label="GST number"
          value={form.gst}
          onChange={(e) =>
            setForm({ ...form, gst: e.target.value.toUpperCase() })
          }
          placeholder="22AAAAA0000A1Z5"
          maxLength={15}
        />
      </div>
      <Input
        label="Supplies (comma separated)"
        value={form.categories}
        onChange={set('categories')}
        placeholder="Plywood, Laminate, Hardware"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Payment terms"
          value={form.paymentTerms}
          onChange={set('paymentTerms')}
          options={[
            { value: 'Advance', label: 'Advance' },
            { value: 'Net 15', label: 'Net 15' },
            { value: 'Net 30', label: 'Net 30' },
            { value: 'Net 45', label: 'Net 45' },
            { value: 'On delivery', label: 'On delivery' },
          ]}
        />
        <Select
          label="Rating"
          value={form.rating}
          onChange={set('rating')}
          options={[
            { value: '5', label: '★ 5 — excellent' },
            { value: '4', label: '★ 4 — good' },
            { value: '3', label: '★ 3 — average' },
            { value: '2', label: '★ 2 — poor' },
            { value: '1', label: '★ 1 — avoid' },
          ]}
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        loading={loading}
        disabled={!form.name.trim()}
      >
        {submitLabel}
      </Button>
    </form>
  )
}

function VendorCompareModal({ open, onClose, vendors, purchaseOrders }) {
  const [selected, setSelected] = useState([])

  useEffect(() => {
    if (open) setSelected(vendors.slice(0, 3).map((v) => v._id))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const map = {}
    for (const po of purchaseOrders) {
      const vid = po.vendor?._id || po.vendor
      if (!vid) continue
      const s = (map[vid] ||= { orders: 0, total: 0, delivered: 0, last: null })
      s.orders += 1
      s.total += Number(po.value) || 0
      if (po.status === 'delivered') s.delivered += 1
      const d = po.createdAt ? new Date(po.createdAt) : null
      if (d && (!s.last || d > s.last)) s.last = d
    }
    return map
  }, [purchaseOrders])

  const chosen = vendors.filter((v) => selected.includes(v._id))
  const bestRating = Math.max(0, ...chosen.map((v) => Number(v.rating) || 0))
  const bestTotal = Math.max(0, ...chosen.map((v) => stats[v._id]?.total || 0))

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 4) {
        toast('Compare up to 4 vendors at a time', { type: 'info' })
        return prev
      }
      return [...prev, id]
    })
  }

  const rowLabel =
    'sticky left-0 z-[1] bg-surface py-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary'
  const cell = 'min-w-[160px] py-2.5 pr-4 align-top text-[13px] text-primary'

  return (
    <Modal open={open} onClose={onClose} title="Compare vendors" size="xl">
      <p className="text-[12px] text-secondary">
        Pick up to 4 vendors. Order history is calculated from your purchase
        orders.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {vendors.map((v) => {
          const on = selected.includes(v._id)
          return (
            <button
              key={v._id}
              type="button"
              onClick={() => toggle(v._id)}
              className={cn(
                'rounded-lg px-3 py-1 text-[12px] font-semibold transition',
                on
                  ? 'bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]'
                  : 'bg-active text-secondary hover:text-primary',
              )}
            >
              {v.name}
            </button>
          )
        })}
      </div>

      {chosen.length < 2 ? (
        <p className="py-10 text-center text-sm text-secondary">
          Select at least two vendors to compare.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[12px] border border-border">
          <table className="w-full border-separate border-spacing-0 px-1 text-left">
            <thead>
              <tr>
                <th className={cn(rowLabel, 'pl-3')} />
                {chosen.map((v) => {
                  const topRated =
                    Number(v.rating) === bestRating && chosen.length > 1
                  const mostBusiness =
                    bestTotal > 0 && (stats[v._id]?.total || 0) === bestTotal
                  return (
                    <th
                      key={v._id}
                      className="min-w-[160px] border-b border-border py-3 pr-4 align-top"
                    >
                      <p className="text-[14px] font-semibold text-primary">
                        {v.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {topRated && (
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            Top rated
                          </span>
                        )}
                        {mostBusiness && (
                          <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                            Most business
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border [&>tr:last-child>td]:border-0">
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Rating</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cell}>
                    <span className="flex items-center gap-1.5">
                      <Stars value={v.rating} />
                      <span className="text-[12px] font-semibold text-secondary">
                        {v.rating}/5
                      </span>
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Contact</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cell}>
                    {v.contact || '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Phone</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cn(cell, 'tabular-nums')}>
                    {v.phone || '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Email</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cn(cell, 'break-all')}>
                    {v.email || '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>GST</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cn(cell, 'tabular-nums')}>
                    {v.gst || '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Supplies</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cell}>
                    {(v.categories || []).length ? (
                      <span className="flex flex-wrap gap-1">
                        {v.categories.map((c) => (
                          <span
                            key={c}
                            className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-secondary"
                          >
                            {c}
                          </span>
                        ))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Payment terms</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cell}>
                    {v.paymentTerms || '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Orders</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cn(cell, 'tabular-nums')}>
                    {stats[v._id]?.orders || 0}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Total business</td>
                {chosen.map((v) => {
                  const total = stats[v._id]?.total || 0
                  return (
                    <td
                      key={v._id}
                      className={cn(
                        cell,
                        'font-semibold tabular-nums',
                        bestTotal > 0 && total === bestTotal
                          ? 'text-accent'
                          : 'text-primary',
                      )}
                    >
                      {formatInr(total)}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Delivered</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cn(cell, 'tabular-nums')}>
                    {stats[v._id]?.delivered || 0}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')}>Last order</td>
                {chosen.map((v) => (
                  <td key={v._id} className={cell}>
                    {stats[v._id]?.last
                      ? format(stats[v._id].last, 'd MMM yyyy')
                      : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(rowLabel, 'pl-3')} />
                {chosen.map((v) => (
                  <td key={v._id} className={cell}>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const url = whatsappLink(
                            v.phone,
                            `Hello ${v.contact || v.name},`,
                          )
                          if (!url) {
                            toast('No phone number saved for this vendor', {
                              type: 'error',
                            })
                            return
                          }
                          window.open(url, '_blank', 'noopener')
                        }}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[11.5px] font-semibold text-white transition',
                          v.phone
                            ? 'bg-[#25D366] hover:bg-[#1fb958]'
                            : 'bg-[#a7dcbb] hover:bg-[#98d2ad]',
                        )}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openComposeEmail(vendorHelloEmailDraft(v))
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-accent px-2.5 text-[11.5px] font-semibold text-[#171717] transition hover:bg-[var(--accent-hover)]"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

/** @deprecated Prefer MaterialsPage — kept for older imports */
export function ProcurementPage() {
  return <MaterialsPage />
}

/**
 * RFQs across every project. Read-only on purpose — sending, quoting and
 * awarding all need the project's BOQ context, so each row links through to
 * the project's Materials tab rather than duplicating that flow here.
 */
function AllRfqsPanel({ rfqs, loading }) {
  const RFQ_STATUS = {
    draft: { label: 'Draft', cls: 'bg-[#f4f7fb] text-[#5b6b80]' },
    sent: { label: 'Awaiting quotes', cls: 'bg-[#fff8ed] text-[#a2620f]' },
    comparing: { label: 'Comparing', cls: 'bg-[#eef4ff] text-[var(--accent-hover)]' },
    awarded: { label: 'Awarded', cls: 'bg-[var(--nav-active-bg)] text-[#0b7a52]' },
    cancelled: { label: 'Cancelled', cls: 'bg-[#fdf2f2] text-[#b42318]' },
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface" />
  }

  if (!rfqs.length) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <Send className="mx-auto h-7 w-7 text-[#c3cbd6]" />
        <p className="mt-3 text-[15px] font-semibold text-primary">No RFQs yet</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-secondary">
          RFQs start from an approved BOQ. Open a project, go to its Materials
          tab, tick the items you need priced, then hit Raise RFQ.
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[13px] font-semibold text-primary">
          Requests for quotation
        </p>
        <p className="text-[11px] text-secondary">
          Open one in its project to send, record quotes and award
        </p>
      </div>
      <div className="divide-y divide-border">
        {rfqs.map((r) => {
          const meta = RFQ_STATUS[r.status] || RFQ_STATUS.draft
          const quoted = (r.vendors || []).filter((v) => v.status === 'quoted')
          const best = quoted.reduce(
            (lo, v) => (lo == null || v.landedCost < lo ? v.landedCost : lo),
            null,
          )
          return (
            <Link
              key={r._id}
              to={`/projects/${r.projectId?._id || r.projectId}/procurement`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-surface-raised"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-primary">
                    {r.rfqNumber}
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]',
                      meta.cls,
                    )}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-secondary">
                  {r.projectId?.name || 'Project'} · {r.items?.length || 0} item
                  {r.items?.length === 1 ? '' : 's'} · {quoted.length}/
                  {r.vendors?.length || 0} quoted
                  {r.awardedVendor ? ` · ${r.awardedVendor.name}` : ''}
                </p>
              </div>
              {best != null && (
                <div className="shrink-0 text-right">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
                    Lowest
                  </p>
                  <p className="text-[13px] font-semibold tabular-nums text-primary">
                    {formatInr(best)}
                  </p>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
