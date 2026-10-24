import express from 'express'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { Quotation } from '../models/LeadQuotationFile.js'
import { Project } from '../models/Project.js'
import { Tenant } from '../models/Tenant.js'
import { applyQuotationApproved } from '../lib/boqClientApproval.js'

const router = express.Router()

async function loadByToken(token) {
  const clean = String(token || '').trim()
  if (!clean || clean.length < 16) {
    throw new AppError('Invalid approval link', 400)
  }

  const quotation = await Quotation.findOne({ clientApproveToken: clean })
  if (!quotation) throw new AppError('This approval link is invalid or has expired', 404)

  if (
    quotation.clientApproveTokenExpiresAt &&
    new Date(quotation.clientApproveTokenExpiresAt) < new Date()
  ) {
    throw new AppError('This approval link has expired. Ask your designer to resend it.', 410)
  }

  const project = quotation.projectId
    ? await Project.findById(quotation.projectId).select('name clientName location').lean()
    : null
  const tenant = quotation.tenantId
    ? await Tenant.findById(quotation.tenantId).select('name logoUrl').lean()
    : null

  return { quotation, project, tenant }
}

function lineQty(it) {
  const no = Number(it.measureNo) || 0
  const w = Number(it.width) || 0
  const h = Number(it.height) || 0
  if (no && w && h) return no * w * h
  return Number(it.qty) || no || 0
}

function lineAmount(it) {
  const stored = Number(it.amount)
  if (stored > 0) return stored
  return lineQty(it) * (Number(it.rate) || 0)
}

/** Client-safe line items — materials / works the client should review. */
function publicItems(items = []) {
  return (items || [])
    .filter((it) => {
      const desc =
        it.description || it.materialName || it.brand || it.category || ''
      return String(desc).trim().length > 0 || lineAmount(it) > 0
    })
    .map((it, index) => {
      const qty = lineQty(it)
      const rate = Number(it.rate) || 0
      const amount = lineAmount(it)
      const room = String(it.room || it.group || 'General').trim() || 'General'
      const section = String(it.section || it.category || '').trim()
      return {
        id: String(it._id || index),
        sl: it.slNo || String(index + 1),
        description:
          it.description ||
          [it.materialName, it.grade, it.thickness].filter(Boolean).join(' · ') ||
          'Item',
        room,
        section,
        category: it.category || '',
        unit: it.unitLabel || it.unit || '',
        qty,
        rate,
        amount,
        brand: it.brand || '',
        materialName: it.materialName || '',
        grade: it.grade || '',
        thickness: it.thickness || '',
        dimensions: it.dimensions || '',
        remarks: it.remarks || it.note || '',
        image: it.image || '',
        measureNo: Number(it.measureNo) || 0,
        width: Number(it.width) || 0,
        height: Number(it.height) || 0,
      }
    })
}

function publicSummary(quotation, project, tenant) {
  const items = publicItems(quotation.items)
  const chargesPercent = Number(quotation.chargesPercent) || 0
  const chargesLabel = quotation.chargesLabel || ''
  const subtotal = Number(quotation.subtotal) || 0
  const chargesAmount = (subtotal * chargesPercent) / 100
  return {
    title: quotation.title,
    versionLabel: quotation.versionLabel,
    status: quotation.status,
    grandTotal: quotation.grandTotal,
    subtotal,
    chargesPercent,
    chargesLabel,
    chargesAmount,
    gstPercent: quotation.gstPercent,
    discount: quotation.discount,
    itemCount: items.length,
    items,
    sentAt: quotation.sentAt,
    approvedAt: quotation.approvedAt,
    clientApprovedAt: quotation.clientApprovedAt,
    clientRejectedAt: quotation.clientRejectedAt,
    projectName: project?.name || '',
    clientName: project?.clientName || quotation.docMeta?.customerName || '',
    companyName: tenant?.name || 'Cubic',
    companyLogo: tenant?.logoUrl || '',
    canDecide: quotation.status === 'sent' || quotation.status === 'viewed',
  }
}

/** Client opens the email / WhatsApp approve link. */
router.get(
  '/boq/:token',
  asyncHandler(async (req, res) => {
    const { quotation, project, tenant } = await loadByToken(req.params.token)

    if (quotation.status === 'sent') {
      quotation.status = 'viewed'
      quotation.viewedAt = new Date()
      await quotation.save()
    }

    res.json({
      success: true,
      quotation: publicSummary(quotation, project, tenant),
    })
  }),
)

/** Client taps Approve — locks BOQ and sets project budget. */
router.post(
  '/boq/:token/approve',
  asyncHandler(async (req, res) => {
    const { quotation, project, tenant } = await loadByToken(req.params.token)

    if (quotation.status === 'approved') {
      return res.json({
        success: true,
        already: true,
        quotation: publicSummary(quotation, project, tenant),
        message: 'This quotation was already approved.',
      })
    }

    if (quotation.status === 'rejected') {
      throw new AppError('This quotation was rejected. Ask your designer for a revised copy.', 409)
    }

    if (quotation.status !== 'sent' && quotation.status !== 'viewed' && quotation.status !== 'draft') {
      throw new AppError('This quotation can no longer be approved from this link.', 409)
    }

    if (
      quotation.approvalStatus === 'pending' ||
      quotation.approvalStatus === 'rejected'
    ) {
      throw new AppError(
        'This quotation is still waiting on internal company approval.',
        409,
      )
    }

    quotation.clientApprovedAt = new Date()
    await applyQuotationApproved(quotation, {
      note: req.body?.note || 'Approved by client via share link',
    })
    // Keep the token so the client can refresh and see confirmation;
    // status === 'approved' blocks a second decision.
    await quotation.save()

    res.json({
      success: true,
      quotation: publicSummary(quotation, project, tenant),
      message: 'Quotation approved. Thank you!',
    })
  }),
)

/** Optional reject path from the same landing page. */
router.post(
  '/boq/:token/reject',
  asyncHandler(async (req, res) => {
    const { quotation, project, tenant } = await loadByToken(req.params.token)

    if (quotation.status === 'approved') {
      throw new AppError('This quotation is already approved and locked.', 409)
    }
    if (quotation.status === 'rejected') {
      return res.json({
        success: true,
        already: true,
        quotation: publicSummary(quotation, project, tenant),
      })
    }

    quotation.status = 'rejected'
    quotation.clientRejectedAt = new Date()
    quotation.clientDecisionNote = String(req.body?.note || 'Declined by client').slice(0, 500)
    await quotation.save()

    res.json({
      success: true,
      quotation: publicSummary(quotation, project, tenant),
      message: 'Thanks — we have recorded your decision.',
    })
  }),
)

export default router
