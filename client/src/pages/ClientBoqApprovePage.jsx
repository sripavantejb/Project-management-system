import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Check, FileSpreadsheet, Loader2, XCircle } from 'lucide-react'
import { apiOrigin, assetUrl, getTenantSlug } from '../lib/api'
import { formatInr } from '../lib/format'
import { cn } from '../lib/utils'

async function publicBoqFetch(path, { method = 'GET', body } = {}) {
  const base = apiOrigin()
  const url = `${base}/api/public${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': getTenantSlug(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Request failed')
    err.status = res.status
    throw err
  }
  return data
}

function fmtQty(n) {
  const v = Number(n) || 0
  if (!v) return '—'
  return Number.isInteger(v)
    ? String(v)
    : v.toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

/**
 * Public landing for email / WhatsApp approve links.
 * Shows materials / line items so the client can review before approving.
 */
export function ClientBoqApprovePage() {
  const { token } = useParams()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['public-boq', token],
    queryFn: () => publicBoqFetch(`/boq/${token}`),
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
  })

  const approve = useMutation({
    mutationFn: () => publicBoqFetch(`/boq/${token}/approve`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['public-boq', token], data)
    },
  })

  const reject = useMutation({
    mutationFn: () =>
      publicBoqFetch(`/boq/${token}/reject`, {
        method: 'POST',
        body: { note: 'Declined by client' },
      }),
    onSuccess: (data) => {
      qc.setQueryData(['public-boq', token], data)
    },
  })

  const quotation = q.data?.quotation
  const busy = approve.isPending || reject.isPending
  const decided =
    quotation?.status === 'approved' || quotation?.status === 'rejected'
  const canDecide = quotation?.canDecide && !decided

  const rooms = useMemo(() => {
    const items = quotation?.items || []
    const map = new Map()
    for (const it of items) {
      const key = it.room || 'General'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    }
    return [...map.entries()]
  }, [quotation?.items])

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#0b1220]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:py-14">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9aa7ba]">
            {quotation?.companyName || 'Quotation'}
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
            Review materials &amp; approve
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-[#5b6b80]">
            Check every line below. When you approve, this quotation locks and
            the project budget is set.
          </p>
        </div>

        <div className="rounded-[20px] border border-[#e4eaf3] bg-white p-5 shadow-[0_16px_40px_-24px_rgba(9,20,38,0.35)] sm:p-7">
          {q.isLoading && (
            <div className="flex flex-col items-center gap-3 py-10 text-[#9aa7ba]">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-[13px]">Loading quotation…</p>
            </div>
          )}

          {q.isError && (
            <div className="py-6 text-center">
              <XCircle className="mx-auto h-10 w-10 text-red-500" />
              <p className="mt-3 text-[15px] font-semibold">Link unavailable</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#5b6b80]">
                {q.error?.message ||
                  'This approval link is invalid or has expired. Ask your designer to resend it.'}
              </p>
            </div>
          )}

          {quotation && (
            <>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef4ff] text-[var(--accent-hover,#2563eb)]">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-[-0.01em]">
                    {quotation.projectName || quotation.title}
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] text-[#5b6b80]">
                    {quotation.title}
                    {quotation.clientName ? ` · ${quotation.clientName}` : ''}
                  </p>
                </div>
              </div>

              {/* Materials / line items */}
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9aa7ba]">
                    Materials &amp; works
                  </h2>
                  <span className="text-[11px] tabular-nums text-[#9aa7ba]">
                    {quotation.itemCount || 0} lines
                  </span>
                </div>

                {rooms.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#e4eaf3] px-4 py-8 text-center text-[13px] text-[#9aa7ba]">
                    No line items on this quotation yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {rooms.map(([room, items]) => (
                      <section
                        key={room}
                        className="overflow-hidden rounded-xl border border-[#eef2f7]"
                      >
                        <div className="border-b border-[#eef2f7] bg-[#f8fafc] px-3.5 py-2">
                          <p className="text-[12px] font-semibold text-[#0b1220]">
                            {room}
                          </p>
                        </div>
                        <ul className="divide-y divide-[#eef2f7]">
                          {items.map((it) => (
                            <li
                              key={it.id}
                              className="flex gap-3 px-3.5 py-3 sm:items-start"
                            >
                              {it.image ? (
                                <img
                                  src={assetUrl(it.image)}
                                  alt=""
                                  className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-[#e4eaf3]"
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-semibold leading-snug text-[#0b1220]">
                                      {it.sl ? (
                                        <span className="mr-1.5 text-[#9aa7ba]">
                                          {it.sl}.
                                        </span>
                                      ) : null}
                                      {it.description}
                                    </p>
                                    <p className="mt-0.5 text-[11.5px] text-[#5b6b80]">
                                      {[
                                        it.section,
                                        it.brand,
                                        it.materialName,
                                        it.grade,
                                        it.thickness,
                                        it.dimensions,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                    {it.remarks ? (
                                      <p className="mt-1 text-[11px] italic text-[#9aa7ba]">
                                        {it.remarks}
                                      </p>
                                    ) : null}
                                  </div>
                                  <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#0b1220]">
                                    {formatInr(it.amount)}
                                  </p>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#9aa7ba]">
                                  <span>
                                    Qty {fmtQty(it.qty)}
                                    {it.unit ? ` ${it.unit}` : ''}
                                  </span>
                                  <span>× {formatInr(it.rate)}</span>
                                  {it.measureNo && it.width && it.height ? (
                                    <span>
                                      {it.measureNo} × {it.width} × {it.height}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>

              <dl className="mt-6 space-y-0 border-t border-[#eef2f7] pt-2">
                <Row label="Subtotal" value={formatInr(quotation.subtotal)} />
                {quotation.chargesPercent > 0 && (
                  <Row
                    label={
                      quotation.chargesLabel ||
                      `Charges (${quotation.chargesPercent}%)`
                    }
                    value={formatInr(quotation.chargesAmount)}
                  />
                )}
                {quotation.gstPercent != null && (
                  <Row label={`GST (${quotation.gstPercent}%)`} value="" muted />
                )}
                {Number(quotation.discount) > 0 && (
                  <Row
                    label="Discount"
                    value={`− ${formatInr(quotation.discount)}`}
                  />
                )}
                <Row
                  label="Grand total"
                  value={formatInr(quotation.grandTotal)}
                  strong
                />
              </dl>

              {quotation.status === 'approved' && (
                <StatusBanner
                  tone="success"
                  title="Approved"
                  body="Thank you — this quotation is locked and the project can move to the next step."
                />
              )}
              {quotation.status === 'rejected' && (
                <StatusBanner
                  tone="danger"
                  title="Declined"
                  body="Your decision has been recorded. The team may send a revised quotation."
                />
              )}

              {(approve.isError || reject.isError) && (
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {approve.error?.message || reject.error?.message}
                </p>
              )}

              {canDecide && (
                <div className="sticky bottom-3 mt-6 space-y-2 rounded-2xl border border-[#e4eaf3] bg-white/95 p-3 shadow-[0_8px_24px_-12px_rgba(9,20,38,0.35)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => approve.mutate()}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[14px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(5,150,105,0.7)] transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {approve.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {approve.isPending ? 'Approving…' : 'Approve quotation'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Decline this quotation? Your designer will be notified.',
                        )
                      )
                        reject.mutate()
                    }}
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#e4eaf3] text-[13px] font-semibold text-[#5b6b80] transition hover:bg-[#f7f9fc] disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-8 text-center text-[11px] text-[#9aa7ba]">
          Powered by Cubic · Secure one-time approval link
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, strong, muted }) {
  if (muted && !value) {
    return (
      <div className="flex items-baseline justify-between gap-4 border-b border-[#eef2f7] py-2.5 last:border-0">
        <dt className="text-[12.5px] text-[#9aa7ba]">{label}</dt>
        <dd className="text-[12.5px] text-[#9aa7ba]">Included</dd>
      </div>
    )
  }
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#eef2f7] py-2.5 last:border-0">
      <dt className="text-[12.5px] text-[#9aa7ba]">{label}</dt>
      <dd
        className={cn(
          'text-right tabular-nums',
          strong
            ? 'text-[18px] font-bold tracking-[-0.02em]'
            : 'text-[13px] font-medium',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function StatusBanner({ tone, title, body }) {
  const styles =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-900'
      : 'bg-red-50 text-red-900'
  return (
    <div className={cn('mt-6 rounded-xl px-4 py-3', styles)}>
      <p className="text-[13.5px] font-semibold">{title}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-80">{body}</p>
    </div>
  )
}
