import { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { api } from '../lib/api'
import { formatInr } from '../lib/format'
import {
  PageToolbar,
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

const TABS = [
  { key: 'stock', label: 'Stock' },
  { key: 'log', label: 'Activity' },
]

const STOCK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low stock' },
  { key: 'out', label: 'Out of stock' },
]

const LOG_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Received' },
  { key: 'out', label: 'Issued' },
  { key: 'adjust', label: 'Adjusted' },
]

const FIELD =
  'h-10 rounded-xl border-black/[0.08] bg-[#fbfbfd] focus:border-[var(--accent)]/55 focus:bg-white'

const emptyItemForm = {
  name: '',
  sku: '',
  category: 'General',
  unit: 'pcs',
  quantity: '0',
  reorderLevel: '5',
  location: '',
  unitCost: '0',
  notes: '',
}

const emptyMoveForm = {
  type: 'in',
  quantity: '1',
  note: '',
  projectId: '',
}

function stockTone(item) {
  if (item.quantity <= 0) return 'bg-red-50 text-red-700 ring-1 ring-red-200/70'
  if (item.quantity <= (item.reorderLevel || 0)) {
    return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/70'
  }
  return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70'
}

function stockLabel(item) {
  if (item.quantity <= 0) return 'Out'
  if (item.quantity <= (item.reorderLevel || 0)) return 'Low'
  return 'OK'
}

function formatWhen(value) {
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function invalidateInventory(qc) {
  qc.invalidateQueries({ queryKey: ['inventory-items'] })
  qc.invalidateQueries({ queryKey: ['inventory-summary'] })
  qc.invalidateQueries({ queryKey: ['inventory-movements'] })
}

export function InventoryStockPage() {
  return <InventoryHub />
}

/** Old route → same hub on Activity tab */
export function InventoryMovementsPage() {
  return <Navigate to="/inventory?tab=log" replace />
}

function InventoryHub() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'log' ? 'log' : 'stock'

  const [q, setQ] = useState('')
  const [stockFilter, setStockFilter] = useState('all')
  const [category, setCategory] = useState('all')
  const [logFilter, setLogFilter] = useState('all')
  const [logQ, setLogQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [moveItem, setMoveItem] = useState(null)
  const [form, setForm] = useState(emptyItemForm)
  const [moveForm, setMoveForm] = useState(emptyMoveForm)

  const setTab = (key) => {
    const next = new URLSearchParams(params)
    if (key === 'log') next.set('tab', 'log')
    else next.delete('tab')
    setParams(next, { replace: true })
  }

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => api('/inventory/summary'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => api('/inventory/items'),
  })

  const { data: moveData, isLoading: logLoading } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: () => api('/inventory/movements?limit=150'),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-lite'],
    queryFn: () => api('/projects'),
    staleTime: 60_000,
  })

  const items = data?.items || []
  const movements = moveData?.movements || []
  const projects = Array.isArray(projectsData?.projects)
    ? projectsData.projects
    : []

  const totals = summary?.totals || {
    items: 0,
    lowStock: 0,
    units: 0,
    value: 0,
  }
  const lowStockPreview = summary?.lowStock || []

  const categories = useMemo(() => {
    const set = new Set()
    for (const item of items) {
      if (item.category) set.add(item.category)
    }
    return ['all', ...[...set].sort()]
  }, [items])

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (stockFilter === 'low') {
        if (!(item.quantity > 0 && item.quantity <= (item.reorderLevel || 0))) {
          return false
        }
      }
      if (stockFilter === 'out' && item.quantity > 0) return false
      if (!needle) return true
      const hay = [item.name, item.sku, item.category, item.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q, category, stockFilter])

  const filteredMovements = useMemo(() => {
    const needle = logQ.trim().toLowerCase()
    return movements.filter((m) => {
      if (logFilter !== 'all' && m.type !== logFilter) return false
      if (!needle) return true
      const hay = [
        m.itemId?.name,
        m.itemId?.sku,
        m.note,
        m.createdBy?.name,
        m.projectId?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [movements, logFilter, logQ])

  const createMut = useMutation({
    mutationFn: (body) =>
      api('/inventory/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast('Item added to stock', { type: 'success' })
      setCreateOpen(false)
      setForm(emptyItemForm)
      invalidateInventory(qc)
    },
    onError: (e) => toast(e.message || 'Could not add item', { type: 'error' }),
  })

  const moveMut = useMutation({
    mutationFn: ({ id, body }) =>
      api(`/inventory/items/${id}/move`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_res, vars) => {
      const labels = { in: 'Stock received', out: 'Stock issued', adjust: 'Quantity set' }
      toast(labels[vars.body?.type] || 'Stock updated', { type: 'success' })
      setMoveItem(null)
      setMoveForm(emptyMoveForm)
      invalidateInventory(qc)
    },
    onError: (e) => toast(e.message || 'Could not update stock', { type: 'error' }),
  })

  function openMove(item, type = 'in') {
    setMoveItem(item)
    setMoveForm({ ...emptyMoveForm, type })
  }

  if (summaryLoading && isLoading) {
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
          <ToolbarPills items={TABS} value={tab} onChange={setTab} />
        }
        right={
          <>
            {tab === 'stock' && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868b]" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name, SKU…"
                    className="h-9 w-[200px] rounded-full border-0 bg-[#f5f5f7] pl-8 pr-3 text-[12px] outline-none ring-1 ring-black/[0.04] placeholder:text-[#86868b] focus:bg-white focus:ring-[var(--accent)]/40"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 max-w-[140px] rounded-full border-0 bg-[#f5f5f7] px-3 text-[12px] font-medium text-secondary outline-none ring-1 ring-black/[0.04]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === 'all' ? 'All categories' : c}
                    </option>
                  ))}
                </select>
              </>
            )}
            {tab === 'log' && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868b]" />
                <input
                  value={logQ}
                  onChange={(e) => setLogQ(e.target.value)}
                  placeholder="Search activity…"
                  className="h-9 w-[200px] rounded-full border-0 bg-[#f5f5f7] pl-8 pr-3 text-[12px] outline-none ring-1 ring-black/[0.04] placeholder:text-[#86868b] focus:bg-white focus:ring-[var(--accent)]/40"
                />
              </div>
            )}
            <Button
              onClick={() => {
                setForm(emptyItemForm)
                setCreateOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Package}
          label="Items"
          value={totals.items}
          hint="Active SKUs"
        />
        <Kpi
          icon={AlertTriangle}
          label="Low stock"
          value={totals.lowStock}
          hint="At or below reorder"
          tone="amber"
        />
        <Kpi
          icon={ArrowDownLeft}
          label="Units on hand"
          value={Math.round(totals.units || 0)}
          hint="Across locations"
        />
        <Kpi
          icon={SlidersHorizontal}
          label="Stock value"
          value={formatInr(totals.value || 0)}
          hint="Qty × unit cost"
          tone="emerald"
        />
      </section>

      {lowStockPreview.length > 0 && tab === 'stock' && (
        <section className="overflow-hidden rounded-2xl bg-[#fffbf5] ring-1 ring-amber-200/60">
          <div className="flex items-center justify-between border-b border-amber-200/50 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-800/80">
              Needs restock
            </p>
            <button
              type="button"
              onClick={() => setStockFilter('low')}
              className="text-[11px] font-semibold text-amber-800 hover:underline"
            >
              View all low
            </button>
          </div>
          <div className="divide-y divide-amber-100/80">
            {lowStockPreview.slice(0, 4).map((item) => (
              <div
                key={item._id}
                className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-[#1d1d1f]">
                  {item.name}
                  <span className="font-normal text-[#86868b]">
                    {' '}
                    · {item.quantity} {item.unit}
                    {item.reorderLevel != null
                      ? ` / reorder ${item.reorderLevel}`
                      : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openMove(item, 'in')}
                  className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0d7a4f] ring-1 ring-black/[0.06] transition hover:bg-emerald-50"
                >
                  Receive
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'stock' && (
        <section className="space-y-3">
          <ToolbarPills
            items={STOCK_FILTERS}
            value={stockFilter}
            onChange={setStockFilter}
          />

          {isLoading ? (
            <p className="py-16 text-center text-[13px] text-secondary">
              Loading stock…
            </p>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl bg-white py-4 ring-1 ring-black/[0.04]">
              <EmptyState
                icon={Package}
                title={items.length === 0 ? 'No inventory yet' : 'No matches'}
                description={
                  items.length === 0
                    ? 'Add materials and site supplies — then receive, issue, and track every move here.'
                    : 'Try another search or filter.'
                }
                actionLabel={items.length === 0 ? 'Add first item' : undefined}
                onAction={
                  items.length === 0
                    ? () => {
                        setForm(emptyItemForm)
                        setCreateOpen(true)
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] divide-y divide-black/[0.04]">
              {filteredItems.map((item) => (
                <li
                  key={item._id}
                  className="group flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#1d1d1f]">
                    <Package className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                        {item.name}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          stockTone(item),
                        )}
                      >
                        {stockLabel(item)} · {item.quantity} {item.unit}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-[#6e6e73]">
                      {[item.sku || 'No SKU', item.category, item.location || 'No location']
                        .filter(Boolean)
                        .join(' · ')}
                      {' · '}
                      {formatInr(item.unitCost)} / unit
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block sm:w-24">
                    <p className="text-[11px] text-[#86868b]">Value</p>
                    <p className="tabular-nums text-[13px] font-semibold text-[#1d1d1f]">
                      {formatInr((item.quantity || 0) * (item.unitCost || 0))}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openMove(item, 'in')}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--accent)]/12 px-3 text-[11px] font-semibold text-[#0d7a4f] transition hover:bg-[var(--accent)]/20"
                    >
                      <ArrowDownLeft className="h-3.5 w-3.5" />
                      In
                    </button>
                    <button
                      type="button"
                      onClick={() => openMove(item, 'out')}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-[#f5f5f7] px-3 text-[11px] font-semibold text-[#1d1d1f] transition hover:bg-[#ebebed]"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Out
                    </button>
                    <button
                      type="button"
                      onClick={() => openMove(item, 'adjust')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6e6e73] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                      title="Set exact qty"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'log' && (
        <section className="space-y-3">
          <ToolbarPills
            items={LOG_FILTERS}
            value={logFilter}
            onChange={setLogFilter}
          />

          {logLoading ? (
            <p className="py-16 text-center text-[13px] text-secondary">
              Loading activity…
            </p>
          ) : filteredMovements.length === 0 ? (
            <div className="rounded-2xl bg-white py-4 ring-1 ring-black/[0.04]">
              <EmptyState
                icon={History}
                title="No stock activity yet"
                description="Receive or issue from the Stock tab — every move lands here as a clear paper trail."
                actionLabel="Go to stock"
                onAction={() => setTab('stock')}
              />
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] divide-y divide-black/[0.04]">
              {filteredMovements.map((m) => {
                const meta = TYPE_META[m.type] || TYPE_META.adjust
                const Icon = meta.icon
                return (
                  <li
                    key={m._id}
                    className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
                  >
                    <span
                      className={cn(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        meta.chip,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                        {m.itemId?.name || 'Item'}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-[#6e6e73]">
                        {meta.label}
                        {m.note ? ` · ${m.note}` : ''}
                        {m.projectId?.name ? ` · ${m.projectId.name}` : ''}
                        {m.createdBy?.name ? ` · ${m.createdBy.name}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:w-36 sm:text-right">
                      <p
                        className={cn(
                          'tabular-nums text-[14px] font-semibold',
                          m.type === 'out'
                            ? 'text-red-700'
                            : m.type === 'in'
                              ? 'text-emerald-700'
                              : 'text-[#1d1d1f]',
                        )}
                      >
                        {m.type === 'out' ? '−' : m.type === 'in' ? '+' : '='}
                        {m.quantity}
                        {m.itemId?.unit ? ` ${m.itemId.unit}` : ''}
                      </p>
                      <p className="text-[11px] text-[#86868b]">
                        Bal {m.balanceAfter} · {formatWhen(m.createdAt)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add stock item"
        size="lg"
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.name.trim()) {
              toast('Name is required', { type: 'error' })
              return
            }
            createMut.mutate({
              ...form,
              quantity: Number(form.quantity) || 0,
              reorderLevel: Number(form.reorderLevel) || 0,
              unitCost: Number(form.unitCost) || 0,
            })
          }}
        >
          <Input
            label="Name"
            className={FIELD}
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            placeholder="Cement bags, LED strip…"
          />
          <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
            <Input
              label="SKU"
              className={FIELD}
              value={form.sku}
              onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))}
              placeholder="Optional"
            />
            <Input
              label="Category"
              className={FIELD}
              value={form.category}
              onChange={(e) =>
                setForm((s) => ({ ...s, category: e.target.value }))
              }
            />
            <Input
              label="Unit"
              className={FIELD}
              value={form.unit}
              onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
              placeholder="pcs, kg, m…"
            />
            <Input
              label="Location"
              className={FIELD}
              value={form.location}
              onChange={(e) =>
                setForm((s) => ({ ...s, location: e.target.value }))
              }
              placeholder="Godown A, Site store…"
            />
            <Input
              label="Opening qty"
              type="number"
              min="0"
              className={FIELD}
              value={form.quantity}
              onChange={(e) =>
                setForm((s) => ({ ...s, quantity: e.target.value }))
              }
            />
            <Input
              label="Reorder level"
              type="number"
              min="0"
              className={FIELD}
              value={form.reorderLevel}
              onChange={(e) =>
                setForm((s) => ({ ...s, reorderLevel: e.target.value }))
              }
            />
            <Input
              label="Unit cost (₹)"
              type="number"
              min="0"
              className={FIELD}
              value={form.unitCost}
              onChange={(e) =>
                setForm((s) => ({ ...s, unitCost: e.target.value }))
              }
            />
            <Input
              label="Notes"
              className={FIELD}
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-black/[0.04] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Saving…' : 'Save item'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!moveItem}
        onClose={() => setMoveItem(null)}
        title={moveItem ? moveItem.name : 'Adjust stock'}
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!moveItem) return
            const qty = Number(moveForm.quantity)
            if (!Number.isFinite(qty) || qty <= 0) {
              toast('Enter a positive quantity', { type: 'error' })
              return
            }
            moveMut.mutate({
              id: moveItem._id,
              body: {
                type: moveForm.type,
                quantity: qty,
                note: moveForm.note,
                projectId: moveForm.projectId || undefined,
              },
            })
          }}
        >
          {moveItem && (
            <p className="rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-[12px] text-[#6e6e73]">
              On hand{' '}
              <span className="font-semibold text-[#1d1d1f]">
                {moveItem.quantity} {moveItem.unit}
              </span>
              {moveItem.location ? ` · ${moveItem.location}` : ''}
            </p>
          )}

          <Select
            label="Action"
            className={FIELD}
            value={moveForm.type}
            onChange={(e) =>
              setMoveForm((s) => ({ ...s, type: e.target.value }))
            }
            options={[
              { value: 'in', label: 'Receive (stock in)' },
              { value: 'out', label: 'Issue (stock out)' },
              { value: 'adjust', label: 'Set exact quantity' },
            ]}
          />
          <Input
            label={moveForm.type === 'adjust' ? 'New quantity' : 'Quantity'}
            type="number"
            min="0.01"
            step="any"
            className={FIELD}
            value={moveForm.quantity}
            onChange={(e) =>
              setMoveForm((s) => ({ ...s, quantity: e.target.value }))
            }
          />
          {moveForm.type === 'out' && projects.length > 0 && (
            <Select
              label="Project (optional)"
              className={FIELD}
              value={moveForm.projectId}
              onChange={(e) =>
                setMoveForm((s) => ({ ...s, projectId: e.target.value }))
              }
              options={[
                { value: '', label: 'No project link' },
                ...projects.map((p) => ({
                  value: p._id,
                  label: p.name,
                })),
              ]}
            />
          )}
          <Input
            label="Note"
            className={FIELD}
            value={moveForm.note}
            onChange={(e) =>
              setMoveForm((s) => ({ ...s, note: e.target.value }))
            }
            placeholder="Vendor delivery, site issue…"
          />
          <div className="flex justify-end gap-2 border-t border-black/[0.04] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMoveItem(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={moveMut.isPending}>
              {moveMut.isPending ? 'Updating…' : 'Update stock'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const TYPE_META = {
  in: {
    label: 'Received',
    icon: ArrowDownLeft,
    chip: 'bg-emerald-50 text-emerald-700',
  },
  out: {
    label: 'Issued',
    icon: ArrowUpRight,
    chip: 'bg-red-50 text-red-700',
  },
  adjust: {
    label: 'Adjusted',
    icon: SlidersHorizontal,
    chip: 'bg-blue-50 text-blue-700',
  },
}

function Kpi({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-[#1d1d1f] bg-[#f5f5f7]',
    amber: 'text-amber-800 bg-amber-50',
    emerald: 'text-emerald-800 bg-emerald-50',
    red: 'text-red-700 bg-red-50',
  }
  return (
    <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/[0.04] transition duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
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
      {hint && <p className="mt-1 text-[11px] text-[#86868b]">{hint}</p>}
    </div>
  )
}
