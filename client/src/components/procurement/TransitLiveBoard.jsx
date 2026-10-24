import { useMemo } from 'react'
import { differenceInCalendarDays, format, formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  Radio,
  Truck,
  Warehouse,
} from 'lucide-react'
import { formatInr } from '../../lib/format'
import { cn } from '../../lib/utils'
import { EmptyState } from '../ui'

/**
 * Live transit board — not a PO status filter.
 * Auto-reads ordered / in-transit / recently delivered POs and shows
 * journey progress, ETA, days on road, and overdue alerts.
 */
export function TransitLiveBoard({
  purchaseOrders = [],
  search = '',
  onOpen,
  onMarkDelivered,
  advancingId,
}) {
  const now = Date.now()

  const board = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = (po) => {
      if (!q) return true
      const hay = [po.poNumber, po.projectId?.name, po.vendor?.name, po.deliveryLocation]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }

    const enrich = (po) => {
      const shippedAt = po.sentAt || po.updatedAt || po.createdAt
      const eta = po.deliveryDate ? new Date(po.deliveryDate) : null
      const daysOnRoad =
        shippedAt && po.status === 'in_transit'
          ? Math.max(0, differenceInCalendarDays(now, new Date(shippedAt)))
          : 0
      const daysToEta = eta
        ? differenceInCalendarDays(eta, now)
        : null
      const overdue =
        po.status === 'in_transit' && eta && daysToEta != null && daysToEta < 0
      const dueSoon =
        po.status === 'in_transit' &&
        eta &&
        daysToEta != null &&
        daysToEta >= 0 &&
        daysToEta <= 2

      let lane = 'moving'
      if (po.status === 'ordered') lane = 'dispatch'
      if (po.status === 'delivered') lane = 'arrived'
      if (overdue) lane = 'overdue'

      // Progress along Ordered → Transit → Site (0–100)
      let progress = 35
      if (po.status === 'ordered') progress = 20
      if (po.status === 'in_transit') {
        if (eta && shippedAt) {
          const total = Math.max(
            1,
            differenceInCalendarDays(eta, new Date(shippedAt)),
          )
          const done = Math.max(
            0,
            differenceInCalendarDays(now, new Date(shippedAt)),
          )
          progress = Math.min(92, 35 + Math.round((done / total) * 55))
        } else {
          progress = 55 + Math.min(30, daysOnRoad * 5)
        }
      }
      if (po.status === 'delivered') progress = 100
      if (overdue) progress = Math.min(88, progress)

      return {
        po,
        lane,
        shippedAt,
        eta,
        daysOnRoad,
        daysToEta,
        overdue,
        dueSoon,
        progress,
      }
    }

    const all = purchaseOrders.filter(match).map(enrich)

    const moving = all
      .filter((x) => x.po.status === 'in_transit')
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
        return (a.daysToEta ?? 99) - (b.daysToEta ?? 99)
      })

    const dispatch = all
      .filter((x) => x.po.status === 'ordered')
      .sort(
        (a, b) =>
          new Date(b.po.updatedAt || 0) - new Date(a.po.updatedAt || 0),
      )

    const arrived = all
      .filter((x) => {
        if (x.po.status !== 'delivered') return false
        const t = new Date(x.po.updatedAt || x.po.createdAt || 0).getTime()
        return now - t < 14 * 24 * 60 * 60 * 1000
      })
      .sort(
        (a, b) =>
          new Date(b.po.updatedAt || 0) - new Date(a.po.updatedAt || 0),
      )
      .slice(0, 8)

    const valueMoving = moving.reduce(
      (s, x) => s + (Number(x.po.value) || 0),
      0,
    )
    const overdueCount = moving.filter((x) => x.overdue).length
    const dueSoonCount = moving.filter((x) => x.dueSoon).length

    return {
      moving,
      dispatch,
      arrived,
      valueMoving,
      overdueCount,
      dueSoonCount,
      empty: moving.length === 0 && dispatch.length === 0 && arrived.length === 0,
    }
  }, [purchaseOrders, search, now])

  if (board.empty) {
    return (
      <div className="rounded-[16px] border border-dashed border-[#e5dfd7] bg-white px-4 py-14">
        <EmptyState
          icon={Truck}
          title="No shipments on the road"
          description="When a purchase order moves to Ordered or In transit, it appears here automatically — with ETA and days on road."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Live strip — light atelier palette (matches Materials chrome) */}
      <div className="relative overflow-hidden rounded-[16px] border border-[#e5dfd7] bg-gradient-to-br from-[#faf9f7] via-white to-[#f3efea] p-5 shadow-[0_8px_24px_-18px_rgba(30,32,34,0.18)]">
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-36 w-36 rounded-full bg-[#a27b5c]/15 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d6cebe] bg-white px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#2d5a46]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              LIVE · auto from purchase orders
            </div>
            <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-[#1e2022]">
              Shipments in motion
            </h2>
            <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-[#68645e]">
              Tracked from PO status — no separate transit log. ETA and days on
              road update from delivery date and last status change.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat
              label="On road"
              value={board.moving.length}
              icon={Truck}
            />
            <Stat
              label="Value moving"
              value={formatInr(board.valueMoving)}
              compact
            />
            <Stat
              label="Needs attention"
              value={board.overdueCount + board.dueSoonCount}
              warn={board.overdueCount + board.dueSoonCount > 0}
            />
          </div>
        </div>
      </div>

      {/* On road */}
      {board.moving.length > 0 && (
        <Lane
          title="On the road"
          subtitle={`${board.moving.length} shipment${board.moving.length === 1 ? '' : 's'} · auto-listed from In transit`}
          icon={Radio}
          tone="live"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {board.moving.map((row) => (
              <ShipmentCard
                key={row.po._id}
                row={row}
                onOpen={onOpen}
                onMarkDelivered={onMarkDelivered}
                advancing={advancingId === row.po._id}
              />
            ))}
          </div>
        </Lane>
      )}

      {/* Awaiting dispatch */}
      {board.dispatch.length > 0 && (
        <Lane
          title="Ready to move"
          subtitle="Ordered — waiting for vendor dispatch (becomes On the road when marked In transit)"
          icon={Package}
          tone="idle"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {board.dispatch.map((row) => (
              <ShipmentCard
                key={row.po._id}
                row={row}
                compact
                onOpen={onOpen}
                onMarkDelivered={onMarkDelivered}
                advancing={advancingId === row.po._id}
              />
            ))}
          </div>
        </Lane>
      )}

      {/* Just arrived */}
      {board.arrived.length > 0 && (
        <Lane
          title="Just arrived"
          subtitle="Delivered in the last 14 days — next step is GRN"
          icon={Warehouse}
          tone="done"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {board.arrived.map((row) => (
              <ShipmentCard
                key={row.po._id}
                row={row}
                compact
                onOpen={onOpen}
              />
            ))}
          </div>
        </Lane>
      )}
    </div>
  )
}

function Stat({ label, value, icon: Icon, compact, warn }) {
  return (
    <div
      className={cn(
        'min-w-[88px] rounded-xl border px-3 py-2.5',
        warn
          ? 'border-amber-200 bg-amber-50'
          : 'border-[#e5dfd7] bg-white',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em]',
          warn ? 'text-amber-800' : 'text-[#8a847c]',
        )}
      >
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-semibold tabular-nums tracking-tight text-[#1e2022]',
          compact ? 'text-[13px]' : 'text-[20px]',
          warn && 'text-amber-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Lane({ title, subtitle, icon: Icon, tone, children }) {
  const tones = {
    live: 'border-[#d6cebe] bg-[#faf9f7]',
    idle: 'border-[#e5dfd7] bg-white',
    done: 'border-[#e5dfd7] bg-[#f3efea]/50',
  }
  const iconTone = {
    live: 'bg-[#ecfdf5] text-[#2d5a46] ring-emerald-200/80',
    idle: 'bg-[#f3efea] text-[#a27b5c] ring-[#e5dfd7]',
    done: 'bg-white text-[#1e2022] ring-[#e5dfd7]',
  }
  return (
    <section className={cn('rounded-[16px] border p-4 sm:p-5', tones[tone])}>
      <div className="mb-3 flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ring-1',
            iconTone[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[14px] font-semibold text-[#1e2022]">{title}</h3>
          <p className="text-[11.5px] text-[#68645e]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function ShipmentCard({
  row,
  compact,
  onOpen,
  onMarkDelivered,
  advancing,
}) {
  const { po, progress, eta, daysOnRoad, daysToEta, overdue, dueSoon, shippedAt } =
    row

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[14px] border bg-white transition hover:border-[#c4b8a8] hover:shadow-[0_10px_28px_-18px_rgba(30,32,34,0.35)]',
        overdue
          ? 'border-amber-300 ring-1 ring-amber-200'
          : 'border-[#e5dfd7]',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen?.(po)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[14px] font-semibold text-[#1e2022]">
                {po.poNumber}
              </p>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  po.status === 'in_transit'
                    ? 'bg-[#e8f1ff] text-[#1d4ed8]'
                    : po.status === 'ordered'
                      ? 'bg-[#f3efea] text-[#7a573b]'
                      : po.status === 'delivered'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-[#f3efea] text-[#68645e]',
                )}
              >
                {po.status === 'in_transit'
                  ? 'In transit'
                  : po.status === 'ordered'
                    ? 'Ordered'
                    : po.status === 'delivered'
                      ? 'Delivered'
                      : po.status}
              </span>
              {overdue && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  ETA passed
                </span>
              )}
              {dueSoon && !overdue && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900">
                  Due soon
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-[#68645e]">
              {po.vendor?.name || 'Vendor'} · {po.projectId?.name || 'Project'}
            </p>
          </div>
          <p className="shrink-0 text-[14px] font-semibold tabular-nums text-[#1e2022]">
            {formatInr(po.value)}
          </p>
        </div>

        {/* Journey track */}
        <div className="mt-4">
          <JourneyBar progress={progress} status={po.status} overdue={overdue} />
          <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a847c]">
            <span>Ordered</span>
            <span>In transit</span>
            <span>At site</span>
          </div>
        </div>

        {!compact && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Meta
              icon={Clock3}
              label="On road"
              value={
                daysOnRoad === 0
                  ? 'Just left'
                  : `${daysOnRoad} day${daysOnRoad === 1 ? '' : 's'}`
              }
            />
            <Meta
              icon={MapPin}
              label="ETA"
              value={
                eta
                  ? overdue
                    ? `${Math.abs(daysToEta)}d late`
                    : daysToEta === 0
                      ? 'Today'
                      : daysToEta === 1
                        ? 'Tomorrow'
                        : format(eta, 'd MMM')
                  : 'Not set'
              }
              warn={overdue}
            />
            <Meta
              icon={Truck}
              label="Updated"
              value={
                shippedAt
                  ? formatDistanceToNow(new Date(shippedAt), { addSuffix: true })
                  : '—'
              }
            />
          </div>
        )}

        {po.deliveryLocation ? (
          <p className="mt-3 flex items-center gap-1.5 truncate text-[11.5px] text-[#8a847c]">
            <MapPin className="h-3 w-3 shrink-0" />
            {po.deliveryLocation}
          </p>
        ) : null}
      </button>

      {po.status === 'in_transit' && onMarkDelivered ? (
        <div className="flex border-t border-[#f0ebe4] bg-[#faf9f7] px-3 py-2">
          <button
            type="button"
            disabled={advancing}
            onClick={(e) => {
              e.stopPropagation()
              onMarkDelivered(po)
            }}
            className="btn-create inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {advancing ? 'Updating…' : 'Mark arrived at site'}
          </button>
        </div>
      ) : null}
    </article>
  )
}

function JourneyBar({ progress, status, overdue }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-[#ebe6df]">
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-all duration-700',
          status === 'delivered'
            ? 'bg-emerald-500'
            : overdue
              ? 'bg-gradient-to-r from-amber-400 to-amber-600'
              : status === 'in_transit'
                ? 'bg-gradient-to-r from-[#c4a484] to-[#a27b5c]'
                : 'bg-[#d6cebe]',
        )}
        style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
      />
      {status === 'in_transit' && (
        <span
          className={cn(
            'absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition-all duration-700',
            overdue ? 'bg-amber-600' : 'bg-[#a27b5c]',
          )}
          style={{ left: `calc(${Math.max(8, Math.min(96, progress))}% - 6px)` }}
        />
      )}
    </div>
  )
}

function Meta({ icon: Icon, label, value, warn }) {
  return (
    <div className="rounded-lg bg-[#faf9f7] px-2.5 py-2">
      <p className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#8a847c]">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-[12px] font-semibold',
          warn ? 'text-amber-800' : 'text-[#1e2022]',
        )}
      >
        {value}
      </p>
    </div>
  )
}
