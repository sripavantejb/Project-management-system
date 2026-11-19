/**
 * Project budget should follow the latest approved BOQ — not a stale
 * project.budget left behind after an unlock / revision.
 */

const SUMMARY_ITEM_RE =
  /^(grand\s*total|sub\s*-?\s*total|total|design\s*(and|&)?\s*handling|design\s*\/?\s*handling|gst|cgst|sgst|igst|tax)\b/i

export function isBoqSummaryItem(item) {
  const label = String(item?.name || item?.description || item?.item || '').trim()
  if (!label) return false
  if (SUMMARY_ITEM_RE.test(label)) return true
  // Imported total rows often have a rate but no qty / amount.
  const qty = Number(item?.qty ?? item?.quantity) || 0
  const rate = Number(item?.rate ?? item?.unitRate) || 0
  const amount = Number(item?.amount ?? item?.total)
  if (!qty && rate > 0 && (!Number.isFinite(amount) || amount === 0)) {
    if (/total|charges|gst|tax/i.test(label)) return true
  }
  return false
}

export function lineAmount(item) {
  if (isBoqSummaryItem(item)) return 0
  const amount = Number(item?.amount ?? item?.total)
  if (Number.isFinite(amount) && amount !== 0) return amount
  const qty = Number(item?.qty ?? item?.quantity) || 0
  const rate = Number(item?.rate ?? item?.unitRate) || 0
  return qty * rate
}

export function quotationTotalsFromItems({
  items = [],
  chargesPercent = 0,
  gstPercent = 18,
  discount = 0,
} = {}) {
  const subtotal = (items || []).reduce((sum, item) => sum + lineAmount(item), 0)
  const charges = (subtotal * (Number(chargesPercent) || 0)) / 100
  const taxable = subtotal + charges
  const gst = (taxable * (Number(gstPercent) || 0)) / 100
  return {
    subtotal,
    grandTotal: Math.max(0, taxable + gst - (Number(discount) || 0)),
  }
}

export function isArchivedApprovedQuotation(quotation) {
  const title = String(quotation?.title || '')
  const version = String(quotation?.versionLabel || '')
  return /\(approved\)\s*$/i.test(title) || /·\s*approved\s+\d{4}-\d{2}-\d{2}/i.test(version)
}

/**
 * Prefer the latest live approved BOQ total for each project.
 * Falls back to project.budget when no approved sheet exists.
 */
export function budgetByProjectId(projects = [], quotations = []) {
  const latestApproved = new Map()

  for (const quote of quotations) {
    if (String(quote?.status || '').toLowerCase() !== 'approved') continue
    if (isArchivedApprovedQuotation(quote)) continue
    const projectId = String(quote.projectId?._id || quote.projectId || '')
    if (!projectId) continue

    const stamp = new Date(
      quote.approvedAt || quote.updatedAt || quote.createdAt || 0,
    ).getTime()
    const prev = latestApproved.get(projectId)
    if (!prev || stamp >= prev.stamp) {
      const stored = Number(quote.grandTotal)
      const recomputed = quotationTotalsFromItems({
        items: quote.items || [],
        chargesPercent: quote.chargesPercent,
        gstPercent: quote.gstPercent,
        discount: quote.discount,
      }).grandTotal
      // Trust a positive stored total when items were not loaded; otherwise
      // recompute so summary rows cannot inflate the studio figure.
      const total =
        Array.isArray(quote.items) && quote.items.length
          ? recomputed
          : Number.isFinite(stored)
            ? stored
            : recomputed
      latestApproved.set(projectId, { stamp, total })
    }
  }

  const map = new Map()
  for (const project of projects) {
    const id = String(project._id)
    const fromQuote = latestApproved.get(id)?.total
    const fallback = Number(project.budget) || 0
    map.set(id, Number.isFinite(fromQuote) ? fromQuote : fallback)
  }
  return map
}
