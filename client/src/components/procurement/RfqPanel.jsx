import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  Check,
  ChevronRight,
  Mail,
  MessageCircle,
  Plus,
  Send,
  Trophy,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { formatInr } from '../../lib/format'
import { rfqWhatsappLink } from '../../lib/phone'
import { rfqEmailDraft } from '../../lib/composeEmail'
import { openComposeEmail } from '../../store/composeEmailStore'
import { toast } from '../ui'

const cn = (...c) => c.filter(Boolean).join(' ')

const STATUS = {
  draft: { label: 'Draft', pill: 'bg-[#f4f7fb] text-[#5b6b80] ring-[#e4eaf3]' },
  sent: { label: 'Awaiting quotes', pill: 'bg-[#fff8ed] text-[#a2620f] ring-[#f0dcc0]' },
  comparing: { label: 'Comparing', pill: 'bg-[#eef4ff] text-[var(--accent-hover)] ring-[#c7dbfb]' },
  awarded: { label: 'Awarded', pill: 'bg-[var(--nav-active-bg)] text-[#0b7a52] ring-[#b6e9d2]' },
  cancelled: { label: 'Cancelled', pill: 'bg-[#fdf2f2] text-[#b42318] ring-[#f5c9c4]' },
}

const VENDOR_STATE = {
  pending: { label: 'Not sent', dot: 'bg-[#c3cbd6]' },
  sent: { label: 'Awaiting', dot: 'bg-[#eab308]' },
  quoted: { label: 'Quoted', dot: 'bg-[var(--accent)]' },
  declined: { label: 'Declined', dot: 'bg-[#ef4444]' },
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Mirrors the server: line rates × qty, plus charges, plus GST on the lot. */
export function landedCost(rfq, entry) {
  const lines = (rfq.items || []).reduce(
    (s, it, i) => s + num(entry.rates?.[i]) * num(it.qty),
    0,
  )
  const extras =
    num(entry.freight) + num(entry.loading) + num(entry.installation) + num(entry.otherCharges)
  const taxable = lines + extras
  return taxable + (taxable * num(entry.gstPercent)) / 100
}

const boqValue = (rfq) =>
  (rfq.items || []).reduce((s, it) => s + num(it.boqRate) * num(it.qty), 0)

/* ─────────────────────────── create ─────────────────────────── */

function CreateRfqModal({ open, onClose, items, vendors, onCreate, saving }) {
  const [picked, setPicked] = useState(() => new Set())
  const [closing, setClosing] = useState('')
  const [notes, setNotes] = useState('')
  const [extraRows, setExtraRows] = useState([])
  /** Editable vendor-rate cells for BOQ lines (kept internal — not sent to vendors). */
  const [boqVendorRates, setBoqVendorRates] = useState(() => ({}))
  if (!open) return null

  const materialLines = [
    ...items.map((it) => {
      const key = it._key || it._id
      return {
        key,
        description: it.description || 'Item',
        qty: num(it.qty),
        unit: it.unit || 'nos',
        vendorRate: boqVendorRates[key] ?? '',
        fromBoq: true,
      }
    }),
    ...extraRows,
  ]

  const addMaterialRow = () => {
    setExtraRows((rows) => [
      ...rows,
      {
        key: `extra-${Date.now()}-${rows.length}`,
        description: '',
        qty: 1,
        unit: 'nos',
        vendorRate: '',
        fromBoq: false,
      },
    ])
  }

  const updateExtra = (key, patch) => {
    setExtraRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    )
  }

  const updateVendorRate = (line, value) => {
    if (line.fromBoq) {
      setBoqVendorRates((prev) => ({ ...prev, [line.key]: value }))
    } else {
      updateExtra(line.key, { vendorRate: value })
    }
  }

  const removeExtra = (key) => {
    setExtraRows((rows) => rows.filter((r) => r.key !== key))
  }

  const submitItems = materialLines
    .filter((l) => String(l.description || '').trim())
    .map((l) => {
      if (l.fromBoq) {
        const src = items.find((i) => (i._key || i._id) === l.key)
        return src
      }
      return {
        _key: l.key,
        description: l.description.trim(),
        qty: num(l.qty) || 1,
        unit: l.unit || 'nos',
        rate: 0,
        amount: 0,
      }
    })
    .filter(Boolean)

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-[#0b1220]/50 p-4 backdrop-blur-sm sm:p-8"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="my-auto w-full max-w-[640px] rounded-2xl border border-[#e1e8f1] bg-surface p-5 shadow-[0_30px_70px_-25px_rgba(11,18,32,0.6)]"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#0b1220]">
              Request for quotation
            </h3>
            <p className="mt-0.5 text-[12px] text-[#8a98ac]">
              {materialLines.length} material line
              {materialLines.length === 1 ? '' : 's'} · BOQ amounts are not
              shared with vendors
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa7ba] transition hover:bg-[#f4f7fb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#e9eef6]">
          <div className="flex items-center justify-between gap-2 border-b border-[#e9eef6] bg-[#f4f7fb] px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
              Materials to send
            </p>
            <button
              type="button"
              onClick={addMaterialRow}
              className="inline-flex items-center gap-1 rounded-lg border border-[#e4eaf3] bg-surface px-2 py-1 text-[11px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb]"
            >
              <Plus className="h-3 w-3" />
              Add row
            </button>
          </div>
          <div className="max-h-[32vh] overflow-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#fbfcfe] text-[10px] font-bold uppercase tracking-[0.06em] text-[#7c8ba0] [&>th]:px-2.5 [&>th]:py-1.5 [&>th]:text-left">
                  <th>Item</th>
                  <th className="w-20 text-right">Qty</th>
                  <th className="w-16">Unit</th>
                  <th className="w-24 text-right">Vendor rate</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {materialLines.map((line) => (
                  <tr
                    key={line.key}
                    className="[&>td]:border-t [&>td]:border-[#eef2f7] [&>td]:px-2.5 [&>td]:py-1.5"
                  >
                    <td>
                      {line.fromBoq ? (
                        <span className="text-[#0b1220]">{line.description}</span>
                      ) : (
                        <input
                          value={line.description}
                          onChange={(e) =>
                            updateExtra(line.key, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Material / work description"
                          className="h-8 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-[12px] outline-none focus:border-[#b6cef7] focus:bg-surface"
                        />
                      )}
                    </td>
                    <td className="text-right">
                      {line.fromBoq ? (
                        <span className="tabular-nums text-[#5b6b80]">
                          {line.qty}
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="any"
                          value={line.qty}
                          onChange={(e) =>
                            updateExtra(line.key, { qty: e.target.value })
                          }
                          className="h-8 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-right text-[12px] tabular-nums outline-none focus:border-[#b6cef7] focus:bg-surface"
                        />
                      )}
                    </td>
                    <td>
                      {line.fromBoq ? (
                        <span className="text-[#5b6b80]">{line.unit}</span>
                      ) : (
                        <input
                          value={line.unit}
                          onChange={(e) =>
                            updateExtra(line.key, { unit: e.target.value })
                          }
                          className="h-8 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-[12px] outline-none focus:border-[#b6cef7] focus:bg-surface"
                        />
                      )}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.vendorRate ?? ''}
                        onChange={(e) =>
                          updateVendorRate(line, e.target.value)
                        }
                        placeholder="Enter rate"
                        className="h-8 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-right text-[12px] tabular-nums outline-none placeholder:text-[#9aa7ba] focus:border-[#b6cef7] focus:bg-surface"
                      />
                    </td>
                    <td>
                      {!line.fromBoq ? (
                        <button
                          type="button"
                          onClick={() => removeExtra(line.key)}
                          aria-label="Remove row"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[#9aa7ba] hover:bg-[#fdf2f2] hover:text-[#b42318]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#e9eef6] bg-[var(--nav-active-bg)] px-3 py-2 text-[11px] text-[#0b7a52]">
            Vendor rate is editable here for your notes — vendors still only get
            Item, Qty and Unit. BOQ amounts stay internal.
          </p>
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
          Send to vendors
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#8a98ac]">
          Pick at least three so the rates can be compared properly.
        </p>
        <div className="mt-2 max-h-[30vh] space-y-1 overflow-y-auto">
          {vendors.length === 0 ? (
            <p className="rounded-lg bg-[#fff8ed] px-3 py-2 text-[12px] text-[#a2620f]">
              No vendors yet — add one in Materials → Vendors first.
            </p>
          ) : (
            vendors.map((v) => {
              const on = picked.has(v._id)
              return (
                <button
                  key={v._id}
                  type="button"
                  onClick={() =>
                    setPicked((prev) => {
                      const next = new Set(prev)
                      if (next.has(v._id)) next.delete(v._id)
                      else next.add(v._id)
                      return next
                    })
                  }
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition',
                    on
                      ? 'border-[var(--accent)] bg-[var(--nav-active-bg)]'
                      : 'border-[#e9eef6] bg-surface hover:border-[#c7dbfb]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[#d7e0ec]',
                    )}
                  >
                    {on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[#0b1220]">
                      {v.name}
                    </span>
                    <span className="block truncate text-[11px] text-[#8a98ac]">
                      {v.phone || 'no phone'}
                      {v.categories?.length ? ` · ${v.categories.join(', ')}` : ''}
                    </span>
                  </span>
                  {!v.phone && (
                    <span
                      title="No phone — you won't be able to send on WhatsApp"
                      className="shrink-0 rounded-md bg-[#fff8ed] px-1.5 py-0.5 text-[10px] font-semibold text-[#a2620f]"
                    >
                      no WhatsApp
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
              Quotes close
            </span>
            <input
              type="date"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              className="mt-1 h-9 w-full rounded-xl border border-[#e4eaf3] bg-[#f7f9fc] px-3 text-[12.5px] outline-none focus:border-[#b6cef7] focus:bg-surface"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
              Notes to vendor
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note (no pricing)"
              className="mt-1 h-9 w-full rounded-xl border border-[#e4eaf3] bg-[#f7f9fc] px-3 text-[12.5px] outline-none focus:border-[#b6cef7] focus:bg-surface"
            />
          </label>
        </div>

        {picked.size > 0 && picked.size < 3 ? (
          <p className="mt-3 text-[11.5px] text-[#a2620f]">
            Only {picked.size} vendor{picked.size === 1 ? '' : 's'} selected — three
            or more gives a fairer L1 comparison.
          </p>
        ) : null}

        <button
          type="button"
          disabled={saving || picked.size === 0 || submitItems.length === 0}
          onClick={() =>
            onCreate({
              vendorIds: [...picked],
              closingDate: closing || undefined,
              notes: notes.trim() || undefined,
              items: submitItems,
            })
          }
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-[13px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
        >
          {saving
            ? 'Creating…'
            : `Create RFQ for ${picked.size || 'no'} vendor${picked.size === 1 ? '' : 's'}`}
        </button>
      </section>
    </div>
  )
}

/* ─────────────────────────── quote entry ─────────────────────────── */

function QuoteModal({ rfq, entry, onClose, onSave, saving }) {
  const [rates, setRates] = useState(() =>
    (rfq.items || []).map((_, i) => entry.rates?.[i] ?? ''),
  )
  const [charges, setCharges] = useState(() => ({
    gstPercent: entry.gstPercent ?? 18,
    freight: entry.freight || 0,
    loading: entry.loading || 0,
    installation: entry.installation || 0,
    otherCharges: entry.otherCharges || 0,
  }))
  const [remarks, setRemarks] = useState(entry.remarks || '')

  const preview = landedCost(rfq, { ...charges, rates: rates.map(num) })
  const vendor = entry.vendor || {}

  const Charge = ({ label, k, suffix }) => (
    <label className="block">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9aa7ba]">
        {label}
      </span>
      <div className="relative mt-1">
        <input
          type="number"
          step="any"
          value={charges[k]}
          onChange={(e) => setCharges((c) => ({ ...c, [k]: e.target.value }))}
          className="h-8 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-right text-[12.5px] tabular-nums outline-none focus:border-[#b6cef7] focus:bg-surface"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-[#9aa7ba]">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  )

  return (
    <div
      className="fixed inset-0 z-[92] flex items-start justify-center overflow-y-auto bg-[#0b1220]/50 p-4 backdrop-blur-sm sm:p-8"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="my-auto w-full max-w-[620px] rounded-2xl border border-[#e1e8f1] bg-surface p-5 shadow-[0_30px_70px_-25px_rgba(11,18,32,0.6)]"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#0b1220]">
              {vendor.name}&apos;s quote
            </h3>
            <p className="mt-0.5 text-[12px] text-[#8a98ac]">
              {rfq.rfqNumber} · enter the rate the vendor gave you per unit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa7ba] transition hover:bg-[#f4f7fb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#e9eef6]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#f4f7fb] text-[10px] font-bold uppercase tracking-[0.06em] text-[#7c8ba0] [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                <th>Item</th>
                <th className="w-16 text-right">Qty</th>
                <th className="w-24 text-right" title="Internal only — not sent to vendors">
                  Internal BOQ
                </th>
                <th className="w-24 text-right">Their rate</th>
              </tr>
            </thead>
            <tbody>
              {(rfq.items || []).map((it, i) => (
                <tr key={i} className="[&>td]:border-t [&>td]:border-[#eef2f7] [&>td]:px-2 [&>td]:py-1">
                  <td className="text-[#0b1220]">{it.description}</td>
                  <td className="text-right tabular-nums text-[#5b6b80]">
                    {num(it.qty)} {it.unit}
                  </td>
                  <td className="text-right tabular-nums text-[#9aa7ba]">
                    {formatInr(it.boqRate)}
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={rates[i]}
                      placeholder="0"
                      onChange={(e) =>
                        setRates((r) => r.map((v, k) => (k === i ? e.target.value : v)))
                      }
                      className="h-7 w-full rounded-md border border-[#e4eaf3] bg-[#f7f9fc] px-1.5 text-right text-[12px] tabular-nums outline-none focus:border-[#b6cef7] focus:bg-surface"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Charge label="GST" k="gstPercent" suffix="%" />
          <Charge label="Freight" k="freight" />
          <Charge label="Loading" k="loading" />
          <Charge label="Install" k="installation" />
          <Charge label="Other" k="otherCharges" />
        </div>

        <label className="mt-3 block">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#9aa7ba]">
            Remarks
          </span>
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Lead time, warranty, conditions…"
            className="mt-1 h-9 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-[12.5px] outline-none focus:border-[#b6cef7] focus:bg-surface"
          />
        </label>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f4f7fb] px-3 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7c8ba0]">
            Final landed cost
          </span>
          <span className="ml-auto text-[17px] font-semibold tabular-nums text-[#0b1220]">
            {formatInr(preview)}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ declined: true })}
            className="h-10 rounded-xl border border-[#e4eaf3] px-4 text-[12.5px] font-semibold text-[#8a98ac] transition hover:border-[#f5c9c4] hover:text-[#b42318] disabled:opacity-50"
          >
            Declined to quote
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ ...charges, rates: rates.map(num), remarks })}
            className="h-10 flex-1 rounded-xl bg-[var(--accent)] text-[13px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save quote'}
          </button>
        </div>
      </section>
    </div>
  )
}

/* ─────────────────────────── one RFQ ─────────────────────────── */

function RfqCard({ rfq, onSend, onQuote, onAward, busy }) {
  const quoted = rfq.vendors.filter((v) => v.status === 'quoted')
  // Comparing is the whole point of an RFQ, so an RFQ that has quotes or is
  // still waiting on them opens itself. Only settled ones stay collapsed.
  const [open, setOpen] = useState(
    () => rfq.status === 'sent' || rfq.status === 'comparing' || rfq.status === 'draft',
  )
  const meta = STATUS[rfq.status] || STATUS.draft
  const ranked = useMemo(
    () =>
      [...quoted]
        .map((v) => ({ ...v, cost: v.landedCost || landedCost(rfq, v) }))
        .sort((a, b) => a.cost - b.cost),
    [quoted, rfq],
  )
  const l1 = ranked[0]
  const benchmark = boqValue(rfq)

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e2eaf5] bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-[#fbfcfe]"
      >
        <ChevronRight
          className={cn('h-4 w-4 shrink-0 text-[#9aa7ba] transition-transform', open && 'rotate-90')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-[#0b1220]">
              {rfq.rfqNumber}
            </span>
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ring-1 ring-inset',
                meta.pill,
              )}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-[#8a98ac]">
            {rfq.items.length} item{rfq.items.length === 1 ? '' : 's'} ·{' '}
            {rfq.vendors.length} vendor{rfq.vendors.length === 1 ? '' : 's'} ·{' '}
            {quoted.length} quoted
            {rfq.awardedVendor ? ` · awarded to ${rfq.awardedVendor.name}` : ''}
          </p>
        </div>
        {l1 ? (
          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
              Lowest
            </p>
            <p className="text-[13px] font-semibold tabular-nums text-[#0b1220]">
              {formatInr(l1.cost)}
            </p>
          </div>
        ) : null}
      </button>

      {open && (
        <div className="border-t border-[#eef2f7] bg-[#fbfcfe] px-4 py-3">
          {/* vendors */}
          <div className="space-y-1.5">
            {rfq.vendors.map((entry) => {
              const v = entry.vendor || {}
              const state = VENDOR_STATE[entry.status] || VENDOR_STATE.pending
              const cost = entry.status === 'quoted' ? entry.landedCost || landedCost(rfq, entry) : 0
              const isL1 = l1 && String(l1.vendor?._id) === String(v._id)
              const wa = rfqWhatsappLink(rfq, v)
              const awarded = String(rfq.awardedVendor?._id) === String(v._id)

              return (
                <div
                  key={entry._id || v._id}
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2',
                    awarded
                      ? 'border-[#b6e9d2] bg-[var(--nav-active-bg)]'
                      : isL1
                        ? 'border-[#c7dbfb] bg-[#f7faff]'
                        : 'border-[#e9eef6] bg-surface',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state.dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold text-[#0b1220]">
                        {v.name || 'Vendor'}
                      </span>
                      {isL1 && !awarded && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-[#eef4ff] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hover)]">
                          <Trophy className="h-2.5 w-2.5" /> L1
                        </span>
                      )}
                      {awarded && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-white">
                          <Award className="h-2.5 w-2.5" /> Awarded
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-[#8a98ac]">
                      {state.label}
                      {entry.remarks ? ` · ${entry.remarks}` : ''}
                    </span>
                  </span>

                  {cost > 0 && (
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-semibold tabular-nums text-[#0b1220]">
                        {formatInr(cost)}
                      </span>
                      {benchmark > 0 && (
                        <span
                          className={cn(
                            'block text-[10.5px] tabular-nums',
                            cost <= benchmark ? 'text-[#0b7a52]' : 'text-[#b42318]',
                          )}
                        >
                          {cost <= benchmark ? '−' : '+'}
                          {formatInr(Math.abs(cost - benchmark))} vs BOQ
                        </span>
                      )}
                    </span>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => onSend(rfq, v._id)}
                        title={`Send ${rfq.rfqNumber} to ${v.name} on WhatsApp Web`}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#b6e9d2] bg-[var(--nav-active-bg)] px-2 text-[11px] font-semibold text-[#0b7a52] transition hover:bg-[#d7f7e9]"
                      >
                        <MessageCircle className="h-3 w-3" />
                        {entry.status === 'pending' ? 'WA' : 'WA again'}
                      </a>
                    ) : (
                      <span
                        title="Add a phone number to this vendor to send on WhatsApp"
                        className="inline-flex h-7 items-center rounded-lg bg-[#f4f7fb] px-2 text-[11px] text-[#b4c0d0]"
                      >
                        no phone
                      </span>
                    )}
                    <button
                      type="button"
                      title={
                        v.email
                          ? `Email RFQ to ${v.name}`
                          : 'Compose email — add vendor email if needed'
                      }
                      onClick={() => {
                        openComposeEmail(rfqEmailDraft(rfq, v))
                        onSend(rfq, v._id)
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
                    >
                      <Mail className="h-3 w-3" />
                      Mail
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuote(rfq, entry)}
                      className="inline-flex h-7 items-center rounded-lg border border-[#e4eaf3] bg-surface px-2 text-[11px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb]"
                    >
                      {entry.status === 'quoted' ? 'Edit quote' : 'Enter quote'}
                    </button>
                    {rfq.status !== 'awarded' && entry.status === 'quoted' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAward(rfq, entry)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#0b1220] px-2 text-[11px] font-semibold text-[#f8fafc] transition hover:bg-[#1f2937] disabled:opacity-50"
                      >
                        <Award className="h-3 w-3" />
                        Award
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* item list */}
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa7ba]">
              {ranked.length > 1 ? 'Rate comparison' : 'Items'}
              {benchmark > 0 ? (
                <span className="ml-2 font-normal normal-case tracking-normal text-[#8a98ac]">
                  {formatInr(benchmark)} at BOQ rates
                </span>
              ) : null}
            </p>
            <div className="overflow-x-auto rounded-xl border border-[#e9eef6] bg-surface">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#f4f7fb] text-[10px] font-bold uppercase tracking-[0.06em] text-[#7c8ba0] [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                    <th>Item</th>
                    <th className="w-20 text-right">Qty</th>
                    {ranked.map((v) => (
                      <th key={v._id} className="w-24 text-right">
                        {v.vendor?.name?.split(' ')[0] || 'Vendor'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rfq.items.map((it, i) => {
                    const best = Math.min(
                      ...ranked.map((v) => num(v.rates?.[i]) || Infinity),
                    )
                    return (
                      <tr key={i} className="[&>td]:border-t [&>td]:border-[#eef2f7] [&>td]:px-2 [&>td]:py-1">
                        <td className="text-[#0b1220]">{it.description}</td>
                        <td className="text-right tabular-nums text-[#5b6b80]">
                          {num(it.qty)} {it.unit}
                        </td>
                        {ranked.map((v) => {
                          const r = num(v.rates?.[i])
                          return (
                            <td
                              key={v._id}
                              className={cn(
                                'text-right tabular-nums',
                                r && r === best
                                  ? 'font-semibold text-[#0b7a52]'
                                  : 'text-[#5b6b80]',
                              )}
                            >
                              {r ? formatInr(r) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── panel ─────────────────────────── */

export function RfqPanel({
  projectId,
  selectedItems,
  vendors,
  quotationId,
  onCleared,
  /** Lifted so the page header's "Raise RFQ" button opens the same modal */
  createOpen: createOpenProp,
  onCreateOpenChange,
}) {
  const qc = useQueryClient()
  const [ownOpen, setOwnOpen] = useState(false)
  const createOpen = createOpenProp ?? ownOpen
  const setCreateOpen = onCreateOpenChange ?? setOwnOpen
  const [quoting, setQuoting] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['rfqs', projectId],
    queryFn: () => api(`/rfqs?projectId=${projectId}`),
    enabled: !!projectId,
  })
  const rfqs = data?.rfqs || []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['rfqs', projectId] })
    qc.invalidateQueries({ queryKey: ['pos', projectId] })
  }

  const create = useMutation({
    mutationFn: (body) => {
      const sourceItems = Array.isArray(body.items) && body.items.length
        ? body.items
        : selectedItems
      const { items: _ignored, ...rest } = body
      return api('/rfqs', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          quotationId,
          items: sourceItems.map((i) => ({
            description: i.description,
            unit: i.unit,
            qty: i.qty,
            // Kept server-side for internal L1 vs BOQ — never sent to vendors
            boqRate: Number(i.boqRate ?? i.rate) || 0,
            boqItemId: i._id || i.boqItemId || undefined,
          })),
          ...rest,
        }),
      })
    },
    onSuccess: () => {
      refresh()
      setCreateOpen(false)
      onCleared?.()
      toast('RFQ created — send it to the vendors (no BOQ amounts)', {
        type: 'success',
      })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const send = useMutation({
    mutationFn: ({ id, vendorId }) =>
      api(`/rfqs/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ vendorId, via: 'whatsapp' }),
      }),
    onSuccess: refresh,
  })

  const quote = useMutation({
    mutationFn: ({ id, vendorId, body }) =>
      api(`/rfqs/${id}/quote`, {
        method: 'POST',
        body: JSON.stringify({ vendorId, ...body }),
      }),
    onSuccess: () => {
      refresh()
      setQuoting(null)
      toast('Quote recorded', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const award = useMutation({
    mutationFn: ({ id, vendorId, reason }) =>
      api(`/rfqs/${id}/award`, {
        method: 'POST',
        body: JSON.stringify({ vendorId, reason }),
      }),
    onSuccess: (res) => {
      refresh()
      toast(`Awarded — ${res?.purchaseOrder?.poNumber || 'PO'} raised`, {
        type: 'success',
      })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[#0b1220]">
            Requests for quotation
          </h3>
          <p className="text-[11.5px] text-[#8a98ac]">
            Ask several vendors to price the same list, compare the landed cost,
            then award one.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedItems.length}
          onClick={() => setCreateOpen(true)}
          title={
            selectedItems.length
              ? `Raise an RFQ for ${selectedItems.length} selected item(s)`
              : 'Select approved BOQ items above first'
          }
          className="btn-create ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
        >
          <Plus className="h-4 w-4" />
          Raise RFQ
          {selectedItems.length ? ` · ${selectedItems.length}` : ''}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-[#f4f7fb]" />
        ) : rfqs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dbe3ee] bg-[#fbfcfe] px-4 py-6 text-center">
            <Send className="mx-auto h-5 w-5 text-[#c3cbd6]" />
            <p className="mt-2 text-[13px] font-semibold text-[#0b1220]">
              No RFQs yet
            </p>
            <p className="mt-0.5 text-[12px] text-[#8a98ac]">
              Tick items from the approved BOQ above, then raise an RFQ to get
              vendor rates.
            </p>
          </div>
        ) : (
          rfqs.map((r) => (
            <RfqCard
              key={r._id}
              rfq={r}
              busy={award.isPending}
              onSend={(rfq, vendorId) => send.mutate({ id: rfq._id, vendorId })}
              onQuote={(rfq, entry) => setQuoting({ rfq, entry })}
              onAward={(rfq, entry) => {
                const cost = entry.landedCost || landedCost(rfq, entry)
                if (
                  !window.confirm(
                    `Award ${rfq.rfqNumber} to ${entry.vendor?.name}?\n\nA purchase order for ${formatInr(cost)} will be raised at their quoted rates.`,
                  )
                )
                  return
                award.mutate({ id: rfq._id, vendorId: entry.vendor._id })
              }}
            />
          ))
        )}
      </div>

      <CreateRfqModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        items={selectedItems}
        vendors={vendors}
        saving={create.isPending}
        onCreate={(body) => create.mutate(body)}
      />

      {quoting && (
        <QuoteModal
          rfq={quoting.rfq}
          entry={quoting.entry}
          saving={quote.isPending}
          onClose={() => setQuoting(null)}
          onSave={(body) =>
            quote.mutate({
              id: quoting.rfq._id,
              vendorId: quoting.entry.vendor._id,
              body,
            })
          }
        />
      )}
    </>
  )
}
