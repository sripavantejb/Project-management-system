import { formatCurrency as fmt } from '../lib/utils'

export { fmt as formatCurrency }

export function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

/**
 * Compact INR for dashboards and dense tiles.
 * Uses Indian units (L / Cr) so large figures stay on one line.
 */
export function formatInrCompact(value) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return formatInr(0)
  const sign = raw < 0 ? '-' : ''
  const n = Math.abs(raw)

  const compact = (amount, suffix) => {
    const decimals = amount >= 100 ? 0 : amount >= 10 ? 1 : 2
    const text = amount
      .toFixed(decimals)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*[1-9])0+$/, '$1')
    return `${sign}₹${text} ${suffix}`
  }

  if (n >= 1_00_00_000) return compact(n / 1_00_00_000, 'Cr')
  if (n >= 1_00_000) return compact(n / 1_00_000, 'L')
  return formatInr(raw)
}

export function stageLabel(key) {
  const map = {
    design: 'Design',
    planning: 'Planning / BOQ',
    procurement: 'Procurement',
    execution: 'Execution',
    handover: 'QC / Handover',
    new_enquiry: 'New Enquiry',
    site_visit: 'Site Visit',
    quotation_sent: 'Quotation Sent',
    negotiation: 'Negotiation',
    mood_board: 'Mood Board',
    hot: 'Hot',
    dead: 'Dead',
    won: 'Hot',
    lost: 'Dead',
  }
  return map[key] || String(key || '').replace(/_/g, ' ')
}

export const COVER_FALLBACK =
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80'
