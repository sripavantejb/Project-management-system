import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { requirePermission } from '../lib/permissions.js'
import { tenantFilter, withTenant, assertTenantDoc } from '../middleware/tenant.js'
import {
  PurchaseOrder,
  Quotation,
  Rfq,
  InventoryItem,
  InventoryMovement,
  VendorInvoice,
} from '../models/index.js'
import {
  Grn,
  QcInspection,
  DebitNote,
  MaterialRequest,
  MaterialIssue,
  VendorPayment,
} from '../models/ProcurementFlow.js'
import { bumpProjectJourney } from '../lib/projectJourney.js'

const router = express.Router()

function seqNo(prefix, n) {
  return `${prefix}-${String(n).padStart(4, '0')}`
}

async function nextNumber(Model, req, field, prefix) {
  const count = await Model.countDocuments(tenantFilter(req, {}))
  return seqNo(prefix, count + 1)
}

function agingBucket(dueDate) {
  if (!dueDate) return 'not_due'
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diff = Math.round((due - today) / 86400000)
  if (diff > 5) return 'not_due'
  if (diff > 0) return 'near_due'
  if (diff === 0) return 'due_today'
  return 'overdue'
}

/* ── Dashboard ───────────────────────────────────────────────── */

router.get(
  '/procurement/dashboard',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const tf = (extra = {}) => tenantFilter(req, extra)

    const [
      rfqDraft,
      poDraft,
      poOrdered,
      grnPendingQc,
      debitOpen,
      mrOpen,
      payDue,
      payOverdue,
      invoicesUnpaid,
    ] = await Promise.all([
      Rfq.countDocuments(tf({ status: { $in: ['draft', 'sent', 'comparing'] } })),
      PurchaseOrder.countDocuments(tf({ status: 'draft' })),
      PurchaseOrder.countDocuments(tf({ status: { $in: ['ordered', 'in_transit'] } })),
      Grn.countDocuments(tf({ status: { $in: ['received', 'qc_pending'] } })),
      DebitNote.countDocuments(tf({ status: { $in: ['draft', 'sent', 'disputed'] } })),
      MaterialRequest.countDocuments(tf({ status: { $in: ['submitted', 'approved'] } })),
      VendorPayment.countDocuments(tf({ status: { $nin: ['paid', 'cancelled'] } })),
      VendorPayment.countDocuments(tf({ agingBucket: 'overdue', status: { $ne: 'paid' } })),
      VendorInvoice.countDocuments(tf({ status: { $in: ['unpaid', 'overdue'] } })),
    ])

    res.json({
      success: true,
      data: {
        pending: {
          rfqs: rfqDraft,
          draftPos: poDraft,
          inTransitPos: poOrdered,
          grnQc: grnPendingQc,
          debitNotes: debitOpen,
          materialRequests: mrOpen,
          payments: payDue,
          overduePayments: payOverdue,
          unpaidInvoices: invoicesUnpaid,
        },
      },
    })
  }),
)

/* ── BOQ Control: Available = BOQ − purchased − ordered ─────── */

router.get(
  '/procurement/boq-control',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId
    if (!projectId) throw new AppError('projectId is required', 400)

    const quotations = await Quotation.find(
      tenantFilter(req, {
        projectId,
        status: 'approved',
      }),
    )
      .select('title versionLabel items grandTotal status updatedAt')
      .sort({ updatedAt: -1 })
      .lean()

    const pos = await PurchaseOrder.find(
      tenantFilter(req, {
        projectId,
        status: { $ne: 'draft' },
      }),
    )
      .select('poNumber status items value')
      .lean()

    const orderedByBoq = new Map()
    const purchasedByBoq = new Map()
    for (const po of pos) {
      const delivered = po.status === 'delivered'
      for (const it of po.items || []) {
        const key = it.boqItemId
          ? String(it.boqItemId)
          : `desc:${String(it.description || '').toLowerCase()}`
        const qty = Number(it.qty) || 0
        if (delivered) {
          purchasedByBoq.set(key, (purchasedByBoq.get(key) || 0) + qty)
        } else {
          orderedByBoq.set(key, (orderedByBoq.get(key) || 0) + qty)
        }
      }
    }

    const lines = []
    for (const q of quotations) {
      for (const it of q.items || []) {
        const key = it._id
          ? String(it._id)
          : `desc:${String(it.description || '').toLowerCase()}`
        const boqQty = Number(it.qty) || 0
        const orderedQty = orderedByBoq.get(key) || 0
        const purchasedQty = purchasedByBoq.get(key) || 0
        const available = Math.max(0, boqQty - purchasedQty - orderedQty)
        lines.push({
          quotationId: q._id,
          quotationTitle: q.title,
          versionLabel: q.versionLabel,
          boqItemId: it._id,
          description: it.description,
          unit: it.unit,
          room: it.room,
          boqQty,
          orderedQty,
          purchasedQty,
          availableQty: available,
          rate: it.rate,
          amount: it.amount,
        })
      }
    }

    res.json({
      success: true,
      data: {
        quotations: quotations.map((q) => ({
          _id: q._id,
          title: q.title,
          versionLabel: q.versionLabel,
          grandTotal: q.grandTotal,
          updatedAt: q.updatedAt,
        })),
        lines,
        summary: {
          lineCount: lines.length,
          shortLines: lines.filter((l) => l.availableQty <= 0).length,
          openLines: lines.filter((l) => l.availableQty > 0).length,
        },
      },
    })
  }),
)

/* ── GRN ─────────────────────────────────────────────────────── */

router.get(
  '/procurement/grns',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    if (req.query.purchaseOrder) filter.purchaseOrder = req.query.purchaseOrder
    const grns = await Grn.find(filter)
      .populate('vendor', 'name phone')
      .populate('purchaseOrder', 'poNumber value status')
      .populate('projectId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(200)
    res.json({ success: true, grns })
  }),
)

router.post(
  '/procurement/grns',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findById(req.body.purchaseOrder)
    assertTenantDoc(po, req, 'Purchase order')

    const prior = await Grn.find(
      tenantFilter(req, { purchaseOrder: po._id }),
    ).lean()
    const receivedSoFar = new Map()
    for (const g of prior) {
      for (const it of g.items || []) {
        const k = String(it.poItemId || it.description)
        receivedSoFar.set(k, (receivedSoFar.get(k) || 0) + (Number(it.receivedQty) || 0))
      }
    }

    const items = (req.body.items || po.items || []).map((it, i) => {
      const poItem = po.items?.[i]
      const ordered = Number(it.orderedQty ?? poItem?.qty ?? it.qty) || 0
      const already = receivedSoFar.get(String(poItem?._id || it.description)) || 0
      const receivedQty = Number(it.receivedQty ?? it.qty) || 0
      return {
        description: it.description || poItem?.description || '',
        unit: it.unit || 'nos',
        orderedQty: ordered,
        receivedQty,
        acceptedQty: receivedQty,
        rejectedQty: 0,
        shortageQty: Math.max(0, ordered - already - receivedQty),
        damagedQty: 0,
        rate: Number(it.rate ?? poItem?.rate) || 0,
        amount: receivedQty * (Number(it.rate ?? poItem?.rate) || 0),
        batchNo: it.batchNo || '',
        remarks: it.remarks || '',
        poItemId: poItem?._id,
        boqItemId: poItem?.boqItemId || it.boqItemId,
      }
    })

    const grn = await Grn.create(
      withTenant(req, {
        projectId: po.projectId,
        purchaseOrder: po._id,
        vendor: po.vendor,
        grnNumber: req.body.grnNumber || (await nextNumber(Grn, req, 'grnNumber', 'GRN')),
        invoiceNo: req.body.invoiceNo || '',
        challanNo: req.body.challanNo || '',
        receivedAt: req.body.receivedAt || new Date(),
        warehouse: req.body.warehouse || '',
        items,
        photos: req.body.photos || [],
        notes: req.body.notes || '',
        status: 'qc_pending',
        createdBy: req.user._id,
      }),
    )

    if (['ordered', 'approved', 'draft'].includes(po.status)) {
      po.status = 'in_transit'
      await po.save()
    }

    // Journey bar: first GRN → Site work (materials arriving)
    if (po.projectId) {
      await bumpProjectJourney(po.projectId, 'buying_started')
    }

    await grn.populate([
      { path: 'vendor', select: 'name phone' },
      { path: 'purchaseOrder', select: 'poNumber value status' },
      { path: 'projectId', select: 'name' },
    ])
    res.status(201).json({ success: true, grn })
  }),
)

/* ── QC ──────────────────────────────────────────────────────── */

router.get(
  '/procurement/qc',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    const list = await QcInspection.find(filter)
      .populate('grn', 'grnNumber status')
      .populate('vendor', 'name')
      .populate('purchaseOrder', 'poNumber')
      .populate('projectId', 'name')
      .populate('checkedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(200)
    res.json({ success: true, inspections: list })
  }),
)

router.post(
  '/procurement/qc',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const grn = await Grn.findById(req.body.grn)
    assertTenantDoc(grn, req, 'GRN')

    const items = (req.body.items || grn.items || []).map((it, i) => {
      const src = grn.items[i] || {}
      const received = Number(it.receivedQty ?? src.receivedQty) || 0
      const accepted = Number(it.acceptedQty ?? received) || 0
      const damaged = Number(it.damagedQty) || 0
      const shortage = Number(it.shortageQty) || 0
      const rejected = Number(it.rejectedQty) || Math.max(0, received - accepted)
      return {
        description: it.description || src.description,
        receivedQty: received,
        acceptedQty: accepted,
        rejectedQty: rejected,
        shortageQty: shortage,
        damagedQty: damaged,
        brandOk: it.brandOk !== false,
        sizeOk: it.sizeOk !== false,
        damage: damaged > 0 || !!it.damage,
        remarks: it.remarks || '',
        photos: it.photos || [],
        grnItemId: src._id,
      }
    })

    const hasDamage = items.some((i) => i.damagedQty > 0 || i.damage)
    const hasShortage = items.some((i) => i.shortageQty > 0)
    const allAccepted = items.every((i) => i.acceptedQty >= i.receivedQty && !i.damage)
    let overallStatus = 'partial'
    if (allAccepted && !hasShortage) overallStatus = 'accepted'
    else if (hasDamage) overallStatus = 'damage'
    else if (hasShortage) overallStatus = 'shortage'
    else if (items.every((i) => i.rejectedQty >= i.receivedQty)) overallStatus = 'rejected'

    const qc = await QcInspection.create(
      withTenant(req, {
        projectId: grn.projectId,
        grn: grn._id,
        purchaseOrder: grn.purchaseOrder,
        vendor: grn.vendor,
        checkedAt: new Date(),
        checkedBy: req.user._id,
        items,
        overallStatus,
        siteRemarks: req.body.siteRemarks || '',
        photos: req.body.photos || [],
      }),
    )

    for (let i = 0; i < grn.items.length; i++) {
      const row = items[i]
      if (!row) continue
      grn.items[i].acceptedQty = row.acceptedQty
      grn.items[i].rejectedQty = row.rejectedQty
      grn.items[i].shortageQty = row.shortageQty
      grn.items[i].damagedQty = row.damagedQty
    }
    grn.status = 'qc_done'
    await grn.save()

    // Accepted qty → inventory (auto create/find by description)
    if (overallStatus === 'accepted' || overallStatus === 'partial') {
      for (const row of items) {
        if (!(row.acceptedQty > 0)) continue
        let item = await InventoryItem.findOne(
          tenantFilter(req, {
            name: row.description,
            isActive: { $ne: false },
          }),
        )
        if (!item) {
          item = await InventoryItem.create(
            withTenant(req, {
              name: row.description,
              sku: `AUTO-${Date.now().toString(36)}`,
              unit: 'nos',
              quantity: 0,
              location: grn.warehouse || 'Site store',
            }),
          )
        }
        const bal = (Number(item.quantity) || 0) + row.acceptedQty
        item.quantity = bal
        await item.save()
        await InventoryMovement.create(
          withTenant(req, {
            itemId: item._id,
            type: 'in',
            quantity: row.acceptedQty,
            balanceAfter: bal,
            note: `GRN ${grn.grnNumber} · QC accepted`,
            projectId: grn.projectId,
            createdBy: req.user._id,
          }),
        )
      }

      const po = await PurchaseOrder.findById(grn.purchaseOrder)
      if (po) {
        const allGrns = await Grn.find(tenantFilter(req, { purchaseOrder: po._id }))
        let fullyReceived = true
        for (let i = 0; i < (po.items || []).length; i++) {
          const ordered = Number(po.items[i].qty) || 0
          let got = 0
          for (const g of allGrns) {
            got += Number(g.items?.[i]?.acceptedQty ?? g.items?.[i]?.receivedQty) || 0
          }
          if (got + 0.0001 < ordered) fullyReceived = false
        }
        if (fullyReceived) {
          po.status = 'delivered'
          await po.save()
        }
      }
    }

    // Auto draft debit note when damage/shortage
    let debitNote = null
    if (hasDamage || hasShortage) {
      const debitItems = items
        .filter((i) => i.damagedQty > 0 || i.shortageQty > 0)
        .map((i) => {
          const shortQty = (Number(i.damagedQty) || 0) + (Number(i.shortageQty) || 0)
          const grnLine = grn.items.find((g) => String(g._id) === String(i.grnItemId))
          const rate = Number(grnLine?.rate) || 0
          return {
            description: i.description,
            shortQty,
            rate,
            amount: shortQty * rate,
            reason: i.damagedQty > 0 ? 'damage' : 'shortage',
          }
        })
      const debitAmount = debitItems.reduce((s, i) => s + i.amount, 0)
      debitNote = await DebitNote.create(
        withTenant(req, {
          projectId: grn.projectId,
          vendor: grn.vendor,
          purchaseOrder: grn.purchaseOrder,
          grn: grn._id,
          qc: qc._id,
          debitNumber: await nextNumber(DebitNote, req, 'debitNumber', 'DN'),
          items: debitItems,
          debitAmount,
          notes: req.body.siteRemarks || 'Auto-created from QC',
          status: 'draft',
          createdBy: req.user._id,
        }),
      )
    }

    await qc.populate([
      { path: 'grn', select: 'grnNumber' },
      { path: 'vendor', select: 'name' },
      { path: 'purchaseOrder', select: 'poNumber' },
    ])
    res.status(201).json({ success: true, inspection: qc, debitNote })
  }),
)

/* ── Debit notes ─────────────────────────────────────────────── */

router.get(
  '/procurement/debit-notes',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    const notes = await DebitNote.find(filter)
      .populate('vendor', 'name phone email')
      .populate('purchaseOrder', 'poNumber')
      .populate('grn', 'grnNumber')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
    res.json({ success: true, debitNotes: notes })
  }),
)

router.patch(
  '/procurement/debit-notes/:id',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const note = await DebitNote.findById(req.params.id)
    assertTenantDoc(note, req, 'Debit note')
    for (const key of ['status', 'notes', 'photos', 'items', 'debitAmount']) {
      if (req.body[key] !== undefined) note[key] = req.body[key]
    }
    if (req.body.status === 'sent') note.sentAt = new Date()
    if (['accepted', 'disputed'].includes(req.body.status)) {
      note.vendorAckAt = new Date()
    }
    if (req.body.items) {
      note.debitAmount = note.items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    }
    await note.save()
    res.json({ success: true, debitNote: note })
  }),
)

/* ── Material requests ───────────────────────────────────────── */

router.get(
  '/procurement/material-requests',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    const list = await MaterialRequest.find(filter)
      .populate('projectId', 'name')
      .populate('requestedBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
    res.json({ success: true, requests: list })
  }),
)

router.post(
  '/procurement/material-requests',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    if (!req.body.projectId) throw new AppError('projectId required', 400)
    const mr = await MaterialRequest.create(
      withTenant(req, {
        projectId: req.body.projectId,
        requestNumber:
          req.body.requestNumber ||
          (await nextNumber(MaterialRequest, req, 'requestNumber', 'MR')),
        requiredBy: req.body.requiredBy || null,
        items: req.body.items || [],
        status: req.body.status || 'submitted',
        requestedBy: req.user._id,
        notes: req.body.notes || '',
      }),
    )
    await mr.populate('projectId', 'name')
    res.status(201).json({ success: true, request: mr })
  }),
)

router.patch(
  '/procurement/material-requests/:id',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const mr = await MaterialRequest.findById(req.params.id)
    assertTenantDoc(mr, req, 'Material request')
    for (const key of ['status', 'items', 'notes', 'requiredBy']) {
      if (req.body[key] !== undefined) mr[key] = req.body[key]
    }
    if (req.body.status === 'approved') {
      mr.approvedBy = req.user._id
      mr.approvedAt = new Date()
    }
    await mr.save()
    res.json({ success: true, request: mr })
  }),
)

/* ── Material issues ─────────────────────────────────────────── */

router.get(
  '/procurement/material-issues',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    const list = await MaterialIssue.find(filter)
      .populate('projectId', 'name')
      .populate('materialRequest', 'requestNumber')
      .populate('issuedBy', 'name')
      .sort({ createdAt: -1 })
    res.json({ success: true, issues: list })
  }),
)

router.post(
  '/procurement/material-issues',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    if (!req.body.projectId) throw new AppError('projectId required', 400)
    const items = req.body.items || []
    for (const row of items) {
      if (!row.inventoryItemId || !(row.qty > 0)) continue
      const inv = await InventoryItem.findById(row.inventoryItemId)
      assertTenantDoc(inv, req, 'Inventory item')
      if ((Number(inv.quantity) || 0) < row.qty) {
        throw new AppError(`Insufficient stock for ${inv.name}`, 400)
      }
      inv.quantity = (Number(inv.quantity) || 0) - row.qty
      await inv.save()
      await InventoryMovement.create(
        withTenant(req, {
          itemId: inv._id,
          type: 'out',
          quantity: row.qty,
          balanceAfter: inv.quantity,
          note: `Issue to site · ${req.body.issueNumber || 'MI'}`,
          projectId: req.body.projectId,
          createdBy: req.user._id,
        }),
      )
    }

    const issue = await MaterialIssue.create(
      withTenant(req, {
        projectId: req.body.projectId,
        materialRequest: req.body.materialRequest || null,
        issueNumber:
          req.body.issueNumber ||
          (await nextNumber(MaterialIssue, req, 'issueNumber', 'MI')),
        issuedAt: new Date(),
        items,
        issuedBy: req.user._id,
        receivedByName: req.body.receivedByName || '',
        notes: req.body.notes || '',
        status: 'issued',
      }),
    )

    if (req.body.materialRequest) {
      await MaterialRequest.findByIdAndUpdate(req.body.materialRequest, {
        status: 'issued',
      })
    }

    res.status(201).json({ success: true, issue })
  }),
)

/* ── Vendor payments (3-way + gate) ──────────────────────────── */

router.get(
  '/procurement/payments',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    if (req.query.status) filter.status = req.query.status
    const payments = await VendorPayment.find(filter)
      .populate('vendor', 'name phone paymentTerms')
      .populate('purchaseOrder', 'poNumber value')
      .populate('vendorInvoice', 'invoiceNumber amount status dueDate')
      .populate('grn', 'grnNumber')
      .populate('projectId', 'name')
      .sort({ dueDate: 1, createdAt: -1 })

    for (const p of payments) {
      const bucket = agingBucket(p.dueDate)
      if (p.agingBucket !== bucket && p.status !== 'paid') {
        p.agingBucket = bucket
        await p.save()
      }
    }

    res.json({ success: true, payments })
  }),
)

router.post(
  '/procurement/payments',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const invoiceAmount = Number(req.body.invoiceAmount) || 0
    const debitAmount = Number(req.body.debitAmount) || 0
    const tdsAmount = Number(req.body.tdsAmount) || 0
    const otherDeductions = Number(req.body.otherDeductions) || 0
    const netPayable = Math.max(
      0,
      invoiceAmount - debitAmount - tdsAmount - otherDeductions,
    )

    // Simple 3-way: compare invoice to PO value and GRN accepted totals when provided
    let matchStatus = 'pending'
    let matchNotes = ''
    if (req.body.purchaseOrder && req.body.vendorInvoice) {
      const po = await PurchaseOrder.findById(req.body.purchaseOrder)
      const inv = await VendorInvoice.findById(req.body.vendorInvoice)
      if (po && inv) {
        const poVal = Number(po.value) || 0
        const invVal = Number(inv.amount) || invoiceAmount
        const delta = Math.abs(poVal - invVal)
        if (delta <= poVal * 0.02 + 1) {
          matchStatus = 'matched'
          matchNotes = 'PO and invoice amounts align (±2%)'
        } else {
          matchStatus = 'mismatch'
          matchNotes = `PO ${poVal} vs Invoice ${invVal}`
        }
      }
    }

    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null
    const payment = await VendorPayment.create(
      withTenant(req, {
        projectId: req.body.projectId || null,
        vendor: req.body.vendor,
        purchaseOrder: req.body.purchaseOrder || null,
        vendorInvoice: req.body.vendorInvoice || null,
        grn: req.body.grn || null,
        paymentNumber:
          req.body.paymentNumber ||
          (await nextNumber(VendorPayment, req, 'paymentNumber', 'PAY')),
        invoiceAmount,
        debitAmount,
        tdsAmount,
        otherDeductions,
        netPayable,
        matchStatus,
        matchNotes,
        dueDate,
        creditDays: Number(req.body.creditDays) || 30,
        agingBucket: agingBucket(dueDate),
        status: matchStatus === 'mismatch' ? 'match_hold' : 'pending_accounts',
        createdBy: req.user._id,
        notes: req.body.notes || '',
      }),
    )
    await payment.populate([
      { path: 'vendor', select: 'name' },
      { path: 'purchaseOrder', select: 'poNumber' },
    ])
    res.status(201).json({ success: true, payment })
  }),
)

router.patch(
  '/procurement/payments/:id',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const payment = await VendorPayment.findById(req.params.id)
    assertTenantDoc(payment, req, 'Payment')

    const allowed = [
      'status',
      'matchStatus',
      'matchNotes',
      'debitAmount',
      'tdsAmount',
      'otherDeductions',
      'netPayable',
      'dueDate',
      'mode',
      'bankAccount',
      'utr',
      'proofUrl',
      'proofName',
      'paidAmount',
      'notes',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) payment[key] = req.body[key]
    }

    if (req.body.followUp) {
      payment.followUps.push({
        ...req.body.followUp,
        at: new Date(),
        by: req.user._id,
      })
    }

    if (req.body.status === 'pending_management') {
      payment.approvedByAccounts = req.user._id
    }
    if (req.body.status === 'approved') {
      payment.approvedByManagement = req.user._id
    }
    if (req.body.status === 'paid') {
      payment.paidAt = new Date()
      payment.paidAmount = Number(req.body.paidAmount ?? payment.netPayable) || 0
    }

    payment.netPayable = Math.max(
      0,
      (Number(payment.invoiceAmount) || 0) -
        (Number(payment.debitAmount) || 0) -
        (Number(payment.tdsAmount) || 0) -
        (Number(payment.otherDeductions) || 0),
    )
    payment.agingBucket = agingBucket(payment.dueDate)
    await payment.save()
    res.json({ success: true, payment })
  }),
)

/* ── PO send / unsend ────────────────────────────────────────── */

router.post(
  '/purchase-orders/:id/send',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findById(req.params.id)
    assertTenantDoc(po, req, 'Purchase order')
    po.sentAt = new Date()
    po.sentVia = req.body.via || 'manual'
    if (po.status === 'draft' || po.status === 'approved') {
      po.status = 'ordered'
    }
    await po.save()
    res.json({ success: true, purchaseOrder: po })
  }),
)

router.post(
  '/purchase-orders/:id/unsend',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findById(req.params.id)
    assertTenantDoc(po, req, 'Purchase order')
    po.sentAt = undefined
    po.sentVia = ''
    if (po.status === 'ordered') po.status = 'approved'
    await po.save()
    res.json({ success: true, purchaseOrder: po })
  }),
)

export default router
