import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  FileText,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { api, useAuthStore } from '../lib/api'
import { formatInr } from '../lib/format'
import { TaxInvoiceDocument } from '../components/billing/TaxInvoiceDocument'
import { Button, Select, toast } from '../components/ui'
import { cn } from '../lib/utils'

const EMPTY_LINE = {
  description: '',
  hsnSac: '998391',
  gstRate: 18,
  qty: 1,
  unit: 'LS',
  rate: 0,
  amount: 0,
}

function fmtDateInput(d) {
  if (!d) return ''
  try {
    return new Date(d).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function recalcItems(items) {
  return (items || []).map((it) => {
    const qty = Number(it.qty) || 0
    const rate = Number(it.rate) || 0
    return { ...it, amount: Number(it.amount) || qty * rate }
  })
}

function computePreviewTotals(inv) {
  const items = recalcItems(inv.items)
  const taxable = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0
  if (inv.gstMode === 'igst') {
    igstAmount = (taxable * (Number(inv.igstPercent) || 18)) / 100
  } else {
    cgstAmount = (taxable * (Number(inv.cgstPercent) || 9)) / 100
    sgstAmount = (taxable * (Number(inv.sgstPercent) || 9)) / 100
  }
  return {
    ...inv,
    items,
    taxableAmount: taxable,
    cgstAmount,
    sgstAmount,
    igstAmount,
    grandTotal: taxable + cgstAmount + sgstAmount + igstAmount,
  }
}

function Field({ label, value, onChange, className, type = 'text', placeholder }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
        {label}
      </span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
      />
    </label>
  )
}

function TextArea({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
        {label}
      </span>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent"
      />
    </label>
  )
}

function SectionTitle({ children }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-secondary">
      {children}
    </p>
  )
}

export function TaxInvoicesPage() {
  const tenant = useAuthStore((s) => s.tenant)
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    if (open) setSelectedId(open)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['tax-invoices'],
    queryFn: () => api('/tax-invoices'),
  })
  const invoices = data?.invoices || []

  const { data: detail } = useQuery({
    queryKey: ['tax-invoice', selectedId],
    queryFn: () => api(`/tax-invoices/${selectedId}`),
    enabled: !!selectedId,
  })

  useEffect(() => {
    if (detail?.invoice) {
      setDraft({
        ...detail.invoice,
        invoiceDate: fmtDateInput(detail.invoice.invoiceDate),
        consignee: detail.invoice.consignee || {},
        buyer: detail.invoice.buyer || {},
        bank: detail.invoice.bank || {},
        items: detail.invoice.items?.length
          ? detail.invoice.items
          : [{ ...EMPTY_LINE }],
      })
    }
  }, [detail])

  const preview = useMemo(
    () => (draft ? computePreviewTotals(draft) : null),
    [draft],
  )

  const createBlank = useMutation({
    mutationFn: () => {
      const n = invoices.length + 1
      return api('/tax-invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceNumber: `CAPL-${n}`,
          items: [{ ...EMPTY_LINE }],
        }),
      })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tax-invoices'] })
      setSelectedId(res.invoice._id)
      toast('Tax invoice created', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const save = useMutation({
    mutationFn: () =>
      api(`/tax-invoices/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...draft,
          items: recalcItems(draft.items),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-invoices'] })
      qc.invalidateQueries({ queryKey: ['tax-invoice', selectedId] })
      toast('Invoice saved', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () =>
      api(`/tax-invoices/${selectedId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-invoices'] })
      setSelectedId('')
      setDraft(null)
      toast('Invoice deleted', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const setParty = (key, field, value) => {
    setDraft((d) => ({
      ...d,
      [key]: { ...(d[key] || {}), [field]: value },
    }))
  }

  const setBank = (field, value) => {
    setDraft((d) => ({
      ...d,
      bank: { ...(d.bank || {}), [field]: value },
    }))
  }

  const setLine = (i, patch) => {
    setDraft((d) => {
      const items = [...(d.items || [])]
      items[i] = { ...items[i], ...patch }
      const qty = Number(items[i].qty) || 0
      const rate = Number(items[i].rate) || 0
      if ('qty' in patch || 'rate' in patch) {
        items[i].amount = qty * rate
      }
      return { ...d, items }
    })
  }

  const printInvoice = () => {
    window.print()
  }

  return (
    <div className="min-h-full bg-[var(--bg-canvas)] print:bg-white">
      <div className="mx-auto max-w-[1800px] p-4 md:p-6 lg:p-8 print:p-0">
        <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
          <Link
            to="/billing"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-secondary hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Billing
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-semibold text-primary">
              Tax invoices
            </h1>
            <p className="text-[13px] text-secondary">
              Customize on the left — invoice generates live on the right
            </p>
          </div>
          <Button
            loading={createBlank.isPending}
            onClick={() => createBlank.mutate()}
          >
            <Plus className="h-4 w-4" />
            New tax invoice
          </Button>
        </div>

        <div className="grid gap-4 print:block xl:grid-cols-[220px_minmax(0,1fr)_minmax(420px,1.05fr)]">
          {/* Invoice list */}
          <aside className="rounded-xl border border-border bg-surface p-3 print:hidden xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">
              Invoices
            </p>
            {isLoading ? (
              <p className="text-[13px] text-secondary">Loading…</p>
            ) : !invoices.length ? (
              <p className="text-[13px] text-secondary">No tax invoices yet.</p>
            ) : (
              <ul className="space-y-1">
                {invoices.map((inv) => (
                  <button
                    key={inv._id}
                    type="button"
                    onClick={() => setSelectedId(String(inv._id))}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left transition',
                      String(inv._id) === selectedId
                        ? 'border-accent bg-accent/10'
                        : 'border-transparent hover:bg-surface-raised',
                    )}
                  >
                    <p className="text-[13px] font-semibold text-primary">
                      {inv.invoiceNumber}
                    </p>
                    <p className="truncate text-[11px] text-secondary">
                      {inv.buyer?.name || inv.consignee?.name || '—'} ·{' '}
                      {formatInr(inv.grandTotal)}
                    </p>
                  </button>
                ))}
              </ul>
            )}
          </aside>

          {!draft ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-8 text-center print:hidden xl:col-span-2">
              <FileText className="h-10 w-10 text-secondary" />
              <p className="mt-3 text-[14px] font-medium text-primary">
                Select or create a tax invoice
              </p>
              <p className="mt-1 max-w-sm text-[13px] text-secondary">
                Edit fields on one side and see the formal GST invoice generate
                instantly on the other. You can also create one from an approved
                BOQ.
              </p>
            </div>
          ) : (
            <>
              {/* Customize panel */}
              <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface print:hidden xl:max-h-[calc(100vh-8rem)]">
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3">
                  <p className="mr-auto text-[13px] font-semibold text-primary">
                    Customize
                  </p>
                  <Button
                    size="sm"
                    loading={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={printInvoice}>
                    <Printer className="h-3.5 w-3.5" />
                    Print / PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm('Delete this tax invoice?')) {
                        remove.mutate()
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-5 overflow-y-auto p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Invoice number"
                      value={draft.invoiceNumber}
                      onChange={(v) => setDraft({ ...draft, invoiceNumber: v })}
                    />
                    <Field
                      label="Invoice date"
                      type="date"
                      value={draft.invoiceDate}
                      onChange={(v) => setDraft({ ...draft, invoiceDate: v })}
                    />
                  </div>

                  <div>
                    <SectionTitle>Seller (your company)</SectionTitle>
                    <div className="space-y-2">
                      <TextArea
                        label="Company name & address"
                        value={`${draft.companyName || ''}\n${draft.companyAddress || ''}`}
                        onChange={(v) => {
                          const [name, ...rest] = v.split('\n')
                          setDraft({
                            ...draft,
                            companyName: name,
                            companyAddress: rest.join('\n'),
                          })
                        }}
                        rows={4}
                      />
                      <Field
                        label="Company GSTIN"
                        value={draft.companyGstin}
                        onChange={(v) =>
                          setDraft({ ...draft, companyGstin: v })
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          label="State"
                          value={draft.companyStateName}
                          onChange={(v) =>
                            setDraft({ ...draft, companyStateName: v })
                          }
                        />
                        <Field
                          label="State code"
                          value={draft.companyStateCode}
                          onChange={(v) =>
                            setDraft({ ...draft, companyStateCode: v })
                          }
                        />
                      </div>
                      <Field
                        label="Phone / email / website"
                        value={[
                          draft.companyPhone,
                          draft.companyEmail,
                          draft.companyWebsite,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        onChange={(v) => {
                          const [phone, email, website] = v.split(' · ')
                          setDraft({
                            ...draft,
                            companyPhone: phone || '',
                            companyEmail: email || '',
                            companyWebsite: website || '',
                          })
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <SectionTitle>Buyer (bill to)</SectionTitle>
                      <div className="space-y-2">
                        <Field
                          label="Name"
                          value={draft.buyer?.name}
                          onChange={(v) => setParty('buyer', 'name', v)}
                        />
                        <TextArea
                          label="Address"
                          value={draft.buyer?.address}
                          onChange={(v) => setParty('buyer', 'address', v)}
                        />
                        <Field
                          label="GSTIN"
                          value={draft.buyer?.gstin}
                          onChange={(v) => setParty('buyer', 'gstin', v)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Field
                            label="State"
                            value={draft.buyer?.stateName}
                            onChange={(v) =>
                              setParty('buyer', 'stateName', v)
                            }
                          />
                          <Field
                            label="Code"
                            value={draft.buyer?.stateCode}
                            onChange={(v) =>
                              setParty('buyer', 'stateCode', v)
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <SectionTitle>Consignee (ship to)</SectionTitle>
                      <div className="space-y-2">
                        <Field
                          label="Name"
                          value={draft.consignee?.name}
                          onChange={(v) => setParty('consignee', 'name', v)}
                        />
                        <TextArea
                          label="Address"
                          value={draft.consignee?.address}
                          onChange={(v) => setParty('consignee', 'address', v)}
                        />
                        <Field
                          label="GSTIN"
                          value={draft.consignee?.gstin}
                          onChange={(v) => setParty('consignee', 'gstin', v)}
                        />
                      </div>
                      <button
                        type="button"
                        className="mt-2 text-[12px] font-semibold text-accent"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            consignee: { ...(d.buyer || {}) },
                          }))
                        }
                      >
                        Copy from buyer
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <SectionTitle>Line items</SectionTitle>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            items: [...(d.items || []), { ...EMPTY_LINE }],
                          }))
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add row
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {(draft.items || []).map((it, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-[var(--bg-canvas)] p-3"
                        >
                          <div className="mb-2 flex items-start gap-2">
                            <input
                              value={it.description || ''}
                              onChange={(e) =>
                                setLine(i, { description: e.target.value })
                              }
                              placeholder="Description"
                              className="h-8 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-[12px]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  items: d.items.filter((_, j) => j !== i),
                                }))
                              }
                              className="shrink-0 text-secondary hover:text-red-600"
                              aria-label="Remove line"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            <Field
                              label="HSN"
                              value={it.hsnSac}
                              onChange={(v) => setLine(i, { hsnSac: v })}
                            />
                            <Field
                              label="GST%"
                              type="number"
                              value={it.gstRate ?? 18}
                              onChange={(v) =>
                                setLine(i, { gstRate: Number(v) })
                              }
                            />
                            <Field
                              label="Qty"
                              type="number"
                              value={it.qty ?? 1}
                              onChange={(v) => setLine(i, { qty: Number(v) })}
                            />
                            <Field
                              label="Unit"
                              value={it.unit || 'LS'}
                              onChange={(v) => setLine(i, { unit: v })}
                            />
                            <Field
                              label="Rate"
                              type="number"
                              value={it.rate ?? 0}
                              onChange={(v) => setLine(i, { rate: Number(v) })}
                            />
                            <div className="flex flex-col justify-end">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">
                                Amount
                              </span>
                              <p className="flex h-9 items-center text-[13px] font-semibold tabular-nums text-primary">
                                {formatInr(it.amount || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-right text-[14px] font-semibold tabular-nums text-accent">
                      Grand total: {formatInr(preview?.grandTotal || 0)}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <SectionTitle>Bank details</SectionTitle>
                      <Field
                        label="Account name"
                        value={draft.bank?.accountName}
                        onChange={(v) => setBank('accountName', v)}
                      />
                      <Field
                        label="Bank"
                        value={draft.bank?.bankName}
                        onChange={(v) => setBank('bankName', v)}
                      />
                      <Field
                        label="Account no."
                        value={draft.bank?.accountNo}
                        onChange={(v) => setBank('accountNo', v)}
                      />
                      <Field
                        label="Branch & IFSC"
                        value={[draft.bank?.branch, draft.bank?.ifsc]
                          .filter(Boolean)
                          .join(' · ')}
                        onChange={(v) => {
                          const [branch, ifsc] = v.split(' · ')
                          setBank('branch', branch || '')
                          setBank('ifsc', ifsc || '')
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <SectionTitle>Tax & signatory</SectionTitle>
                      <Field
                        label="Signatory name"
                        value={draft.signatoryName}
                        onChange={(v) =>
                          setDraft({ ...draft, signatoryName: v })
                        }
                      />
                      <Field
                        label="Buyer's order no."
                        value={draft.buyersOrderNo}
                        onChange={(v) =>
                          setDraft({ ...draft, buyersOrderNo: v })
                        }
                      />
                      <Select
                        label="GST mode"
                        value={draft.gstMode || 'cgst_sgst'}
                        onChange={(e) =>
                          setDraft({ ...draft, gstMode: e.target.value })
                        }
                        options={[
                          {
                            value: 'cgst_sgst',
                            label: 'CGST + SGST (intra-state)',
                          },
                          { value: 'igst', label: 'IGST (inter-state)' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live generated invoice */}
              <div className="flex min-h-0 flex-col rounded-xl border border-border bg-neutral-200/80 print:border-0 print:bg-white xl:max-h-[calc(100vh-8rem)]">
                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3 print:hidden">
                  <p className="mr-auto text-[13px] font-semibold text-primary">
                    Generated invoice
                  </p>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    Live
                  </span>
                  <Button size="sm" variant="secondary" onClick={printInvoice}>
                    <Printer className="h-3.5 w-3.5" />
                    Print / PDF
                  </Button>
                </div>
                <div className="overflow-y-auto p-3 print:overflow-visible print:p-0 sm:p-4">
                  {preview ? (
                    <div className="mx-auto origin-top shadow-lg print:shadow-none">
                      <TaxInvoiceDocument
                        invoice={preview}
                        tenant={tenant}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
