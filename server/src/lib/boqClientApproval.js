import crypto from 'crypto'
import { Project } from '../models/Project.js'
import { sendTenantMail } from './mailer.js'
import { applyStageForward } from './projectJourney.js'

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function mintClientApproveToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function clientApproveExpiresAt(from = new Date()) {
  return new Date(from.getTime() + TOKEN_TTL_MS)
}

export function appPublicOrigin() {
  const raw = String(process.env.CLIENT_URL || process.env.CLIENT_URLS || '')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '')
  return raw || 'http://localhost:5173'
}

export function clientApproveUrl(token) {
  return `${appPublicOrigin()}/approve/${encodeURIComponent(token)}`
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

/**
 * Apply client (or staff) approval side-effects: lock sheet + set project budget.
 * Does not enforce staff-approver rules — callers decide who may approve.
 */
export async function applyQuotationApproved(quotation, { note = '' } = {}) {
  quotation.status = 'approved'
  quotation.approvedAt = new Date()
  if (note) quotation.clientDecisionNote = String(note).slice(0, 500)

  if (quotation.projectId) {
    const project = await Project.findById(quotation.projectId)
    if (project && String(project.tenantId) === String(quotation.tenantId)) {
      project.budget = quotation.grandTotal
      // Journey bar: approved BOQ → Buying materials (automatic)
      applyStageForward(project, 'procurement')
      await project.save()
    }
  }

  return quotation
}

export function buildBoqClientEmail({
  clientName,
  projectName,
  quotationTitle,
  grandTotal,
  companyName,
  approveUrl,
  itemCount,
}) {
  const greeting = clientName ? `Hello ${clientName},` : 'Hello,'
  const total = formatInr(grandTotal)
  const subject = `Quotation for approval — ${projectName || quotationTitle || 'your project'}`

  const text = [
    greeting,
    '',
    `Please review the quotation "${quotationTitle || 'BOQ'}" for ${projectName || 'your project'}.`,
    itemCount ? `Line items: ${itemCount}` : '',
    `Grand total: ${total}`,
    '',
    'To approve this quotation and proceed, open this link:',
    approveUrl,
    '',
    `— ${companyName || 'Cubic'}`,
  ]
    .filter((l) => l !== '')
    .join('\n')

  const html = `
  <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f8;padding:32px 16px">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="padding:28px 28px 8px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9aa7ba">Quotation for approval</p>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0b1220">${escapeHtml(projectName || quotationTitle || 'Quotation')}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#5b6b80">
          ${escapeHtml(greeting)} Please review the quotation below. When you are ready, tap <strong>Approve quotation</strong> — we will lock the sheet and move the project forward.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:13px">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#9aa7ba">Quotation</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f7;text-align:right;font-weight:600;color:#0b1220">${escapeHtml(quotationTitle || 'BOQ')}</td>
          </tr>
          ${
            itemCount
              ? `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#9aa7ba">Items</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef2f7;text-align:right;color:#0b1220">${itemCount}</td>
          </tr>`
              : ''
          }
          <tr>
            <td style="padding:12px 0;color:#9aa7ba;font-weight:600">Grand total</td>
            <td style="padding:12px 0;text-align:right;font-size:18px;font-weight:700;color:#0b1220">${escapeHtml(total)}</td>
          </tr>
        </table>
        <a href="${escapeHtml(approveUrl)}"
           style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 22px;border-radius:12px">
          Approve quotation
        </a>
        <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#9aa7ba">
          Or open this link in your browser:<br/>
          <a href="${escapeHtml(approveUrl)}" style="color:#2563eb;word-break:break-all">${escapeHtml(approveUrl)}</a>
        </p>
      </div>
      <div style="padding:16px 28px 24px;border-top:1px solid #eef2f7">
        <p style="margin:0;font-size:11px;color:#9aa7ba">Sent by ${escapeHtml(companyName || 'Cubic')} · Link expires in 30 days</p>
      </div>
    </div>
  </div>`

  return { subject, text, html }
}

export function buildBoqWhatsappMessage({
  clientName,
  projectName,
  quotationTitle,
  grandTotal,
  companyName,
  approveUrl,
}) {
  const greeting = clientName ? `Hello ${clientName},` : 'Hello,'
  return [
    greeting,
    '',
    `Please review our quotation for ${projectName || 'your project'}:`,
    `"${quotationTitle || 'BOQ'}"`,
    `Grand total: ${formatInr(grandTotal)}`,
    '',
    'To approve, tap this link:',
    approveUrl,
    '',
    `Thank you,`,
    companyName || 'Cubic',
  ].join('\n')
}

export async function sendBoqApprovalEmail(tenantId, { to, ...payload }) {
  const built = buildBoqClientEmail(payload)
  const info = await sendTenantMail(tenantId, {
    to,
    subject: built.subject,
    text: built.text,
    html: built.html,
  })
  return { info, ...built }
}

export function whatsappWebUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  const params = new URLSearchParams()
  params.set('phone', digits)
  if (message) params.set('text', message)
  return `https://web.whatsapp.com/send?${params.toString()}`
}
