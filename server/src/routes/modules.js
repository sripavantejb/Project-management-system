import crypto from 'crypto'
import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { tenantFilter, withTenant, assertTenantDoc, isCompanyAdminRole } from '../middleware/tenant.js'
import { upload } from '../middleware/upload.js'
import { withChunkedUpload } from '../middleware/chunkedUpload.js'
import { storeFileBuffer } from '../lib/mediaStore.js'
import {
  assertProjectAccess,
  isOpsUser,
  scopeProjects,
} from '../lib/projectScope.js'
import { notifyUser, actorSummary } from '../lib/notify.js'
import {
  canManageEmployeeAccess,
  requirePermission,
  resolvePermissions,
  sanitizePermissionOverrides,
  normalizePermissionMap,
} from '../lib/permissions.js'
import {
  listMaterialCatalog,
  templateItemsForType,
  BOQ_TYPE_META,
} from '../data/plywoodMaterialCatalog.js'
import {
  interiorCatalogItems,
  interiorCatalogTemplate,
  isInteriorBoqType,
  INTERIOR_BOQ_META,
} from '../data/quotationCatalog.js'
import {
  hasMeasurementSheet,
  measurementTemplate,
  measurementTotals,
} from '../data/measurementCatalog.js'
import {
  Lead,
  Quotation,
  Project,
  Task,
  ActivityLog,
  Comment,
  ProjectFile,
  Vendor,
  PurchaseOrder,
  Expense,
  Payment,
  SiteUpdate,
  Snag,
  Notification,
  User,
} from '../models/index.js'
import { Tenant } from '../models/Tenant.js'
import { ROLES } from '../models/User.js'
import { resolveApproval } from '../lib/approvals.js'

const router = express.Router()

const STAGE_DEFS = [
  { key: 'design', label: 'Design' },
  { key: 'planning', label: 'Planning / BOQ' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'execution', label: 'Execution' },
  { key: 'handover', label: 'QC / Handover' },
]

const LEAD_PROJECT_TEMPLATE_TASKS = {
  residential: [
    { title: 'Kickoff & brief capture', stage: 'design' },
    { title: 'Concept moodboards', stage: 'design' },
    { title: 'Client concept approval', stage: 'design', requiresApproval: true },
    { title: 'Draft BOQ — Standard', stage: 'planning' },
    { title: 'Vendor shortlist', stage: 'procurement' },
    { title: 'Site mobilization', stage: 'execution' },
    { title: 'Snag walkthrough', stage: 'handover' },
  ],
  commercial: [
    { title: 'Brand & space brief', stage: 'design' },
    { title: 'Space planning drawings', stage: 'design' },
    { title: 'Commercial BOQ', stage: 'planning' },
    { title: 'MEP coordination', stage: 'planning' },
    { title: 'Fit-out execution', stage: 'execution' },
    { title: 'Handover pack', stage: 'handover' },
  ],
  renovation: [
    { title: 'Site survey & as-built notes', stage: 'design' },
    { title: 'Renovation moodboards', stage: 'design' },
    { title: 'Renovation BOQ', stage: 'planning' },
    { title: 'Demolition & site prep', stage: 'execution' },
    { title: 'Fit-out & finishing', stage: 'execution' },
    { title: 'Snag walkthrough', stage: 'handover' },
  ],
  custom: [
    { title: 'Define project milestones', stage: 'design' },
    { title: 'Confirm scope with client', stage: 'design', requiresApproval: true },
    { title: 'Build custom schedule', stage: 'planning' },
  ],
}

/** Create a personal follow-up task + task_assigned popup when an enquiry is owned. */
async function createEnquiryFollowUpTask(req, lead, assigneeId) {
  if (!assigneeId) return null

  const title = `Enquiry follow-up · ${lead.clientName}`
  const details = [
    lead.contactName ? `Contact: ${lead.contactName}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    lead.estimatedValue
      ? `Est. value: ₹${Number(lead.estimatedValue).toLocaleString('en-IN')}`
      : null,
    lead.notes ? `\n${lead.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const task = await Task.create(
    withTenant(req, {
      isPersonal: true,
      title,
      description: details || 'Follow up on this new enquiry.',
      status: 'todo',
      priority: 'high',
      assignee: assigneeId,
      createdBy: req.user._id,
      dueDate: lead.nextFollowUp || undefined,
      tags: ['enquiry'],
      customFields: {
        leadId: String(lead._id),
        source: 'enquiry_assignment',
      },
    }),
  )

  await ActivityLog.create(
    withTenant(req, {
      actor: req.user._id,
      type: 'task_created',
      message: `${req.user.name} created this task: ${task.title}`,
      meta: {
        taskId: task._id,
        isPersonal: true,
        title: task.title,
        field: 'created',
        leadId: String(lead._id),
      },
    }),
  )

  await notifyUser(req, {
    userId: assigneeId,
    type: 'task_assigned',
    title: `${req.user.name} assigned you a task`,
    body: title,
    link: '/?view=assigned',
    meta: {
      taskId: String(task._id),
      taskTitle: title,
      projectId: null,
      projectName: 'New enquiry',
      priority: 'high',
      status: 'todo',
      dueDate: task.dueDate || null,
      actor: actorSummary(req.user),
      leadId: String(lead._id),
    },
  })

  return task
}

const LEAD_STAGES = [
  'new_enquiry',
  'site_visit',
  'mood_board',
  'quotation_sent',
  'negotiation',
  'hot',
  'dead',
  'won', // legacy → hot
  'lost', // legacy → dead
]

const CLOSED_LEAD_STAGES = ['hot', 'dead', 'won', 'lost']
const DEAD_LEAD_STAGES = ['dead', 'lost']
const HOT_LEAD_STAGES = ['hot', 'won']

function normalizeLeadStage(stage) {
  if (stage === 'won') return 'hot'
  if (stage === 'lost') return 'dead'
  return stage
}

function sanitizeLeadPayload(body, { partial = false } = {}) {
  const out = {}
  if (!partial || body.clientName !== undefined) {
    const name = String(body.clientName || '').trim()
    if (!name) throw new AppError('Client / company name is required', 400)
    out.clientName = name
  }
  if (body.contactName !== undefined) out.contactName = String(body.contactName || '').trim()
  if (body.email !== undefined) out.email = String(body.email || '').trim()
  if (body.phone !== undefined) out.phone = String(body.phone || '').trim()
  if (body.source !== undefined) out.source = String(body.source || 'Website').trim() || 'Website'
  if (body.notes !== undefined) out.notes = String(body.notes || '').trim()
  if (body.estimatedValue !== undefined) {
    const n = Number(body.estimatedValue)
    if (Number.isNaN(n) || n < 0) throw new AppError('Estimated value must be a positive number', 400)
    out.estimatedValue = n
  }
  if (body.stage !== undefined) {
    if (!LEAD_STAGES.includes(body.stage)) {
      throw new AppError('Invalid enquiry stage', 400)
    }
    out.stage = normalizeLeadStage(body.stage)
  }
  if (body.nextFollowUp !== undefined) {
    out.nextFollowUp = body.nextFollowUp ? new Date(body.nextFollowUp) : null
    if (body.nextFollowUp && Number.isNaN(out.nextFollowUp?.getTime())) {
      throw new AppError('Invalid follow-up date', 400)
    }
  }
  if (body.owner !== undefined) {
    out.owner = body.owner === '' || body.owner == null ? null : body.owner
  }
  return out
}

async function convertLeadToProject(req, lead, { projectType } = {}) {
  if (lead.convertedProjectId) {
    return {
      alreadyConverted: true,
      project: { _id: lead.convertedProjectId },
      lead,
    }
  }
  if (DEAD_LEAD_STAGES.includes(lead.stage)) {
    throw new AppError('Dead enquiries cannot be converted to a project', 400)
  }

  const allowedTypes = ['residential', 'commercial', 'renovation', 'custom']
  let type = projectType === 'blank' ? 'custom' : projectType || 'residential'
  if (!allowedTypes.includes(type)) type = 'residential'

  const ownerId = lead.owner || req.user._id
  const members = [{ user: req.user._id, role: req.user.role }]
  if (String(ownerId) !== String(req.user._id)) {
    members.push({ user: ownerId, role: 'project_manager' })
  }

  const project = await Project.create(
    withTenant(req, {
      name: `${lead.clientName} Project`,
      clientName: lead.clientName,
      clientPhone: lead.phone || '',
      type,
      status: 'in_progress',
      currentStage: 'design',
      stages: STAGE_DEFS.map((s, i) => ({
        ...s,
        progress: 0,
        status: i === 0 ? 'in_progress' : 'not_started',
      })),
      coverImage: '',
      budget: lead.estimatedValue || 0,
      projectManager: ownerId,
      members,
      leadId: lead._id,
      code: `EPM-${Math.floor(100 + Math.random() * 900)}`,
    }),
  )

  const quotation = await Quotation.create(
    withTenant(req, {
      projectId: project._id,
      leadId: lead._id,
      title: `${lead.clientName} — Quotation`,
      versionLabel: 'Standard',
      status: 'draft',
      items: [],
      createdBy: req.user._id,
    }),
  )

  const template =
    LEAD_PROJECT_TEMPLATE_TASKS[type] || LEAD_PROJECT_TEMPLATE_TASKS.residential
  await Task.insertMany(
    template.map((t) =>
      withTenant(req, {
        ...t,
        projectId: project._id,
        createdBy: req.user._id,
        assignee: ownerId,
        status: 'todo',
        priority: 'medium',
        approvalStatus: t.requiresApproval ? 'pending' : 'none',
      }),
    ),
  )

  lead.stage = 'hot'
  lead.convertedProjectId = project._id
  await lead.save()
  await lead.populate('owner', 'name avatar role title')

  await ActivityLog.create(
    withTenant(req, {
      projectId: project._id,
      actor: req.user._id,
      type: 'lead_converted',
      message: `${req.user.name} marked lead “${lead.clientName}” Hot — added to Projects`,
    }),
  )

  return { alreadyConverted: false, project, quotation, lead }
}

/* ─── Leads ─── */
router.get(
  '/leads',
  requireAuth,
  requirePermission('leads'),
  asyncHandler(async (req, res) => {
    const leads = await Lead.find(tenantFilter(req, {}))
      .populate('owner', 'name avatar role title')
      .sort({ updatedAt: -1 })
    res.json({ success: true, leads })
  }),
)

router.post(
  '/leads',
  requireAuth,
  requirePermission('leads'),
  asyncHandler(async (req, res) => {
    const payload = sanitizeLeadPayload(
      {
        ...req.body,
        stage: req.body.stage || 'new_enquiry',
        estimatedValue: req.body.estimatedValue ?? 0,
        contactName: req.body.contactName ?? '',
        email: req.body.email ?? '',
        phone: req.body.phone ?? '',
        source: req.body.source ?? 'Website',
        notes: req.body.notes ?? '',
      },
      { partial: false },
    )
    const ownerId = payload.owner || req.user._id
    const lead = await Lead.create(
      withTenant(req, {
        ...payload,
        owner: ownerId,
      }),
    )
    await lead.populate('owner', 'name avatar role title')

    await createEnquiryFollowUpTask(req, lead, ownerId)

    res.status(201).json({ success: true, lead })
  }),
)

router.patch(
  '/leads/:id',
  requireAuth,
  requirePermission('leads'),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id)
    assertTenantDoc(lead, req, 'Lead')

    const prevOwner = lead.owner ? String(lead.owner) : ''
    const updates = sanitizeLeadPayload(req.body, { partial: true })
    Object.assign(lead, updates)
    await lead.save()
    await lead.populate('owner', 'name avatar role title')

    const nextOwner = lead.owner?._id
      ? String(lead.owner._id)
      : lead.owner
        ? String(lead.owner)
        : ''
    if (nextOwner && nextOwner !== prevOwner) {
      await createEnquiryFollowUpTask(req, lead, nextOwner)
    }

    // Marking Hot automatically creates a Project in the PMS
    if (
      HOT_LEAD_STAGES.includes(lead.stage) &&
      !lead.convertedProjectId
    ) {
      const result = await convertLeadToProject(req, lead, {
        projectType: req.body.projectType || req.body.type,
      })
      return res.json({
        success: true,
        lead: result.lead,
        project: result.project,
        converted: !result.alreadyConverted,
      })
    }

    res.json({ success: true, lead })
  }),
)

router.delete(
  '/leads/:id',
  requireAuth,
  requirePermission('leads'),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id)
    assertTenantDoc(lead, req, 'Lead')

    if (lead.convertedProjectId) {
      throw new AppError(
        'This enquiry was converted to a project — archive the project instead of deleting the enquiry.',
        400,
      )
    }

    const leadId = String(lead._id)
    await Task.deleteMany(
      tenantFilter(req, {
        isPersonal: true,
        'customFields.leadId': leadId,
      }),
    )
    await lead.deleteOne()

    res.json({ success: true, deleted: true })
  }),
)

router.post(
  '/leads/:id/convert',
  requireAuth,
  requirePermission('leads'),
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id)
    assertTenantDoc(lead, req, 'Lead')

    const result = await convertLeadToProject(req, lead, {
      projectType: req.body?.projectType || req.body?.type,
    })

    if (result.alreadyConverted) {
      return res.json({
        success: true,
        project: result.project,
        alreadyConverted: true,
      })
    }

    res.status(201).json({
      success: true,
      project: result.project,
      quotation: result.quotation,
      lead: result.lead,
    })
  }),
)

/* ─── Material catalog (plywood master) ─── */
router.get(
  '/material-catalog',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const data = listMaterialCatalog({
      boqType: req.query.boqType,
      q: req.query.q,
      brand: req.query.brand,
      thickness: req.query.thickness,
      page: Number(req.query.page) || 1,
      limit: Math.min(Number(req.query.limit) || 50, 500),
    })
    res.json({ success: true, ...data, types: BOQ_TYPE_META })
  }),
)

router.get(
  '/material-catalog/template/:boqType',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const boqType = req.params.boqType
    if (!['residential', 'commercial'].includes(boqType)) {
      throw new AppError('boqType must be residential or commercial', 400)
    }
    const items = templateItemsForType(boqType)
    res.json({
      success: true,
      boqType,
      count: items.length,
      section: BOQ_TYPE_META[boqType]?.section,
      items,
    })
  }),
)

router.get(
  '/boq-catalog/:boqType',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const boqType = req.params.boqType
    if (!['residential', 'commercial'].includes(boqType)) {
      throw new AppError('boqType must be residential or commercial', 400)
    }
    const items = interiorCatalogItems(boqType)
    res.json({
      success: true,
      boqType,
      count: items.length,
      meta: INTERIOR_BOQ_META[boqType],
      template: interiorCatalogTemplate(boqType),
      items,
    })
  }),
)

/**
 * Commercial measurement take-off. `spaces` (comma separated) narrows the
 * seeded rows to the rooms this office actually has.
 */
router.get(
  '/measurement-catalog/:boqType',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const { boqType } = req.params
    if (!hasMeasurementSheet(boqType)) {
      throw new AppError('No measurement sheet for this property type', 400)
    }
    const spaces = String(req.query.spaces || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    res.json({
      success: true,
      boqType,
      ...measurementTemplate(boqType, { spaces }),
    })
  }),
)

/* ─── Quotations / BOQ ─── */
router.get(
  '/quotations',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) {
      await assertProjectAccess(req, req.query.projectId)
      filter.projectId = req.query.projectId
    } else if (req.query.leadId) {
      filter.leadId = req.query.leadId
    } else if (!isOpsUser(req.user)) {
      const allowed = await Project.find(
        tenantFilter(req, scopeProjects(req.user)),
      ).select('_id')
      filter.projectId = { $in: allowed.map((p) => p._id) }
    }
    const quotations = await Quotation.find(filter)
      .populate('createdBy', 'name avatar')
      .populate('projectId', 'name clientName location type')
      .populate('leadId', 'clientName')
      .sort({ updatedAt: -1 })
    res.json({ success: true, quotations })
  }),
)

router.get(
  '/quotations/:id',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const quotation = await Quotation.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('projectId', 'name clientName location type')
    assertTenantDoc(quotation, req, 'Quotation')
    res.json({ success: true, quotation })
  }),
)

/**
 * Subtotal → design/handling charges → GST → discount, matching the order the
 * Cubic quotation sheets total in.
 */
function quotationTotals({ items = [], chargesPercent = 0, gstPercent = 18, discount = 0 }) {
  const subtotal = items.reduce(
    (s, i) =>
      s + (Number(i.amount) || (Number(i.qty) || 0) * (Number(i.rate) || 0) || 0),
    0,
  )
  const charges = (subtotal * (Number(chargesPercent) || 0)) / 100
  const taxable = subtotal + charges
  const gst = (taxable * (Number(gstPercent) || 0)) / 100
  return {
    subtotal,
    grandTotal: taxable + gst - (Number(discount) || 0),
  }
}

router.post(
  '/quotations',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    let items = req.body.items || []
    const boqType = req.body.boqType || 'general'
    const interior = isInteriorBoqType(boqType)
    if ((!items.length || req.body.seedCatalog) && interior) {
      items = interiorCatalogItems(boqType)
    }
    if (req.body.projectId) await assertProjectAccess(req, req.body.projectId)

    const templateCharge = interior ? interiorCatalogTemplate(boqType).charges[0] : null
    const chargesPercent = req.body.chargesPercent ?? templateCharge?.percent ?? 0
    const chargesLabel = req.body.chargesLabel ?? templateCharge?.label ?? ''
    const gstPercent = req.body.gstPercent ?? 18
    const discount = req.body.discount || 0
    const { subtotal, grandTotal } = quotationTotals({
      items,
      chargesPercent,
      gstPercent,
      discount,
    })

    // The lead-conversion path above creates an empty placeholder quotation;
    // only a real BOQ with a value is worth routing for sign-off.
    const boqApproval = await resolveApproval(req.tenantId, 'boq', grandTotal)

    const quotation = await Quotation.create(
      withTenant(req, {
        ...req.body,
        items,
        subtotal,
        chargesPercent,
        chargesLabel,
        gstPercent,
        discount,
        grandTotal,
        createdBy: req.user._id,
        approvalStatus: boqApproval.rule ? 'pending' : 'none',
        approver: boqApproval.approver,
        approvalRule: boqApproval.rule?._id || null,
      }),
    )
    await quotation.populate('approver', 'name email avatar role')
    res.status(201).json({ success: true, quotation })
  }),
)

router.patch(
  '/quotations/:id',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const quotation = await Quotation.findById(req.params.id)
    assertTenantDoc(quotation, req, 'Quotation')

    if (
      quotation.status === 'approved' &&
      req.body.status !== 'draft' &&
      Object.keys(req.body || {}).some((k) => k !== 'status')
    ) {
      throw new AppError(
        'This BOQ is approved and locked. Unlock it first to make changes.',
        400,
      )
    }

    const allowed = [
      'title',
      'versionLabel',
      'boqType',
      'status',
      'items',
      'attachments',
      'docMeta',
      'spaces',
      'measurements',
      'chargesPercent',
      'chargesLabel',
      'gstPercent',
      'discount',
      'subtotal',
      'grandTotal',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) quotation[key] = req.body[key]
    }

    /**
     * The take-off is upstream of the BOQ: an item's measured total becomes the
     * quantity of the line it feeds. Applied here so the web and mobile clients
     * cannot drift apart on the arithmetic.
     */
    if (req.body.measurements !== undefined) {
      const totals = measurementTotals(quotation.measurements || [])
      for (const item of quotation.items || []) {
        const hit = totals.get(item.sortIndex)
        if (!hit) continue
        // Lump-sum lines are measured for reference but priced as one unit —
        // 18,500 sft of floor protection is still a single LS charge.
        if (item.unit === 'ls') continue
        item.qty = hit.total
        item.amount = hit.total * (Number(item.rate) || 0)
      }
    }

    const shouldRecalc =
      req.body.items !== undefined ||
      req.body.measurements !== undefined ||
      req.body.chargesPercent !== undefined ||
      req.body.gstPercent !== undefined ||
      req.body.discount !== undefined

    if (shouldRecalc) {
      const totals = quotationTotals({
        items: quotation.items || [],
        chargesPercent: quotation.chargesPercent,
        gstPercent: quotation.gstPercent,
        discount: quotation.discount,
      })
      quotation.subtotal = totals.subtotal
      quotation.grandTotal = totals.grandTotal
    }

    if (req.body.status === 'sent') quotation.sentAt = new Date()
    if (req.body.status === 'viewed') quotation.viewedAt = new Date()
    if (req.body.status === 'approved') {
      // Same rule as file/drawing approvals: if a routing rule pinned an
      // approver, only that person (or a company admin) may actually
      // approve — the boq permission alone isn't enough once someone is
      // specifically assigned.
      if (quotation.approver) {
        const isApprover = String(quotation.approver) === String(req.user._id)
        const isAdmin =
          req.user?.isPlatformAdmin || isCompanyAdminRole(req.user?.role)
        if (!isApprover && !isAdmin) {
          throw new AppError('Only the assigned approver can approve this BOQ', 403)
        }
      }
      quotation.approvedAt = new Date()
      if (quotation.projectId) {
        const project = await Project.findById(quotation.projectId)
        assertTenantDoc(project, req, 'Project')
        const updates = { budget: quotation.grandTotal }
        // Move journey forward into buying materials when still in early stages
        if (
          !project.currentStage ||
          project.currentStage === 'design' ||
          project.currentStage === 'planning'
        ) {
          updates.currentStage = 'procurement'
        }
        await Project.findByIdAndUpdate(quotation.projectId, updates)
      }
    }
    if (req.body.status === 'draft') {
      quotation.sentAt = undefined
      quotation.approvedAt = undefined
    }

    await quotation.save()
    res.json({ success: true, quotation })
  }),
)

/**
 * Unlock an approved BOQ so it can be edited again.
 * Keeps a frozen archive copy on the same project so History still shows the
 * approved version that was locked.
 */
router.post(
  '/quotations/:id/unlock',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const quotation = await Quotation.findById(req.params.id)
    assertTenantDoc(quotation, req, 'Quotation')

    if (quotation.status !== 'approved') {
      throw new AppError('Only an approved BOQ needs unlocking', 400)
    }

    const stamp = new Date()
    const archiveLabel =
      `${quotation.versionLabel || 'Standard'} · approved ` +
      stamp.toISOString().slice(0, 10)

    const archive = await Quotation.create(
      withTenant(req, {
        projectId: quotation.projectId,
        leadId: quotation.leadId,
        title: `${quotation.title} (locked)`,
        versionLabel: archiveLabel,
        boqType: quotation.boqType,
        status: 'approved',
        items: quotation.items,
        spaces: quotation.spaces,
        measurements: quotation.measurements,
        docMeta: quotation.docMeta,
        attachments: quotation.attachments,
        subtotal: quotation.subtotal,
        chargesPercent: quotation.chargesPercent,
        chargesLabel: quotation.chargesLabel,
        gstPercent: quotation.gstPercent,
        discount: quotation.discount,
        grandTotal: quotation.grandTotal,
        createdBy: req.user._id,
        approvedAt: quotation.approvedAt || stamp,
        approvalStatus: quotation.approvalStatus || 'approved',
        approver: quotation.approver,
        approvalRule: quotation.approvalRule,
      }),
    )

    quotation.status = 'draft'
    quotation.approvedAt = undefined
    quotation.sentAt = undefined
    quotation.versionLabel =
      req.body.versionLabel ||
      `${quotation.versionLabel || 'Standard'} · revision`
    await quotation.save()

    res.json({
      success: true,
      quotation,
      archive,
      message: 'BOQ unlocked. Approved copy kept in history.',
    })
  }),
)

router.delete(
  '/quotations/:id',
  requireAuth,
  requirePermission('boq'),
  asyncHandler(async (req, res) => {
    const quotation = await Quotation.findById(req.params.id)
    assertTenantDoc(quotation, req, 'Quotation')
    await quotation.deleteOne()
    res.json({ success: true })
  }),
)

/**
 * Store a reference image for a BOQ and hand the URL back.
 * Stateless so unsaved (draft) sheets can attach images before their first save.
 */
router.post(
  '/quotations/upload-image',
  requireAuth,
  requirePermission('boq'),
  ...withChunkedUpload('file', upload.single('file')),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('Image file is required', 400)
    if (!String(req.file.mimetype || '').startsWith('image/')) {
      throw new AppError('Only image files are allowed here', 400)
    }
    const saved = await storeFileBuffer(req.file, {
      tenantId: req.tenantId || req.user.tenantId,
      uploadedBy: req.user._id,
      kind: 'boq-image',
    })
    res.status(201).json({
      success: true,
      url: saved.url,
      name: saved.name,
      mime: saved.mime,
    })
  }),
)

/* ─── Files ─── */
router.get(
  '/files',
  requireAuth,
  requirePermission('files.manage'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    if (req.query.folder) filter.folder = req.query.folder
    if (req.query.clientVisible === 'true') filter.clientVisible = true
    if (req.query.approvalStatus) filter.approvalStatus = req.query.approvalStatus

    const files = await ProjectFile.find(filter)
      .populate('approver', 'name avatar role')
      .populate('requestedBy', 'name avatar role')
      .populate('decidedBy', 'name avatar role')
      .populate('versions.uploadedBy', 'name avatar')
      .sort({ updatedAt: -1 })
    res.json({ success: true, files })
  }),
)

router.post(
  '/files',
  requireAuth,
  requirePermission('files.manage'),
  ...withChunkedUpload('file', upload.single('file')),
  asyncHandler(async (req, res) => {
    const projectId = req.body.projectId
    const folder = req.body.folder || 'concepts'
    const clientVisible =
      req.body.clientVisible === true || req.body.clientVisible === 'true'

    let name = req.body.name
    let mime = req.body.mime || ''
    let url = req.body.url

    if (req.file) {
      name = name || req.file.originalname
      mime = req.file.mimetype || mime
      const saved = await storeFileBuffer(req.file, {
        tenantId: req.tenantId || req.user.tenantId,
        uploadedBy: req.user._id,
        kind: 'project-file',
      })
      url = saved.url
    }

    if (!projectId || !name || !url) {
      throw new AppError('projectId, name, and file (or url) required', 400)
    }

    const file = await ProjectFile.create(
      withTenant(req, {
        projectId,
        folder,
        name,
        mime,
        clientVisible,
        currentVersion: 1,
        versions: [
          {
            version: 1,
            url,
            uploadedBy: req.user._id,
            note: 'Initial upload',
          },
        ],
        status: 'draft',
        approvalStatus: 'none',
      }),
    )

    await ActivityLog.create(
      withTenant(req, {
        projectId,
        actor: req.user._id,
        type: 'file_uploaded',
        message: `${req.user.name} uploaded ${name}`,
      }),
    )

    res.status(201).json({ success: true, file })
  }),
)

router.post(
  '/files/:id/version',
  requireAuth,
  requirePermission('files.manage'),
  asyncHandler(async (req, res) => {
    const file = await ProjectFile.findById(req.params.id)
    assertTenantDoc(file, req, 'File')
    const next = (file.currentVersion || file.versions.length) + 1
    file.versions.push({
      version: next,
      url: req.body.url,
      uploadedBy: req.user._id,
      note: req.body.note || `Version ${next}`,
    })
    file.currentVersion = next
    file.status = 'draft'
    file.approvalStatus = 'none'
    file.approver = null
    file.approvalRule = null
    file.requestedBy = null
    file.requestedAt = undefined
    file.decidedBy = null
    file.decidedAt = undefined
    file.decisionNote = ''
    await file.save()
    res.json({ success: true, file })
  }),
)

/**
 * Send a drawing/file for sign-off. Routes via Approvals → Drawing / file
 * rules (or an optional pinned approver). The assigned person gets a live popup.
 */
router.post(
  '/files/:id/request-approval',
  requireAuth,
  requirePermission('files.manage'),
  asyncHandler(async (req, res) => {
    const file = await ProjectFile.findById(req.params.id)
    assertTenantDoc(file, req, 'File')

    if (file.approvalStatus === 'pending') {
      throw new AppError('This file is already waiting for approval', 400)
    }

    const approvalType = String(req.body.approvalType || 'drawing').trim() || 'drawing'
    const note = String(req.body.note || '').trim()

    let approverId = null
    let ruleId = null

    if (req.body.approverUser) {
      const pinned = await User.findOne(
        tenantFilter(req, { _id: req.body.approverUser, isActive: { $ne: false } }),
      ).select('_id name')
      if (!pinned) throw new AppError('That approver is not in this workspace', 400)
      approverId = pinned._id
    } else {
      const resolved = await resolveApproval(req.tenantId, approvalType, 0)
      if (!resolved.rule || !resolved.approver) {
        throw new AppError(
          'No approval routing for drawings yet. Open Approvals, add a rule under “Drawing / file”, then try again.',
          400,
        )
      }
      approverId = resolved.approver
      ruleId = resolved.rule._id
    }

    const project = await Project.findById(file.projectId).select('name').lean()

    file.status = 'sent'
    file.approvalStatus = 'pending'
    file.approvalType = approvalType
    file.approvalRule = ruleId
    file.approver = approverId
    file.requestedBy = req.user._id
    file.requestedAt = new Date()
    file.approvalNote = note
    file.decidedBy = null
    file.decidedAt = undefined
    file.decisionNote = ''
    await file.save()
    await file.populate([
      { path: 'approver', select: 'name avatar role' },
      { path: 'requestedBy', select: 'name avatar role' },
    ])

    await ActivityLog.create(
      withTenant(req, {
        projectId: file.projectId,
        actor: req.user._id,
        type: 'approval_requested',
        message: `${req.user.name} sent “${file.name}” for approval`,
        meta: { fileId: file._id, approvalType },
      }),
    )

    await notifyUser(req, {
      userId: approverId,
      type: 'approval_requested',
      title: 'Approval needed',
      body: `${req.user.name} sent “${file.name}” for your approval`,
      link: `/approvals?tab=inbox`,
      projectId: file.projectId,
      meta: {
        actor: actorSummary(req.user),
        entityKind: 'file',
        fileId: String(file._id),
        fileName: file.name,
        folder: file.folder,
        projectId: String(file.projectId),
        projectName: project?.name || '',
        approvalType,
        note,
        previewUrl: file.versions?.[file.versions.length - 1]?.url || '',
      },
    })

    res.json({ success: true, file })
  }),
)

/**
 * Approve or reject a file. Only the assigned approver (or company admin) may decide.
 */
router.post(
  '/files/:id/decide',
  requireAuth,
  asyncHandler(async (req, res) => {
    const file = await ProjectFile.findById(req.params.id)
    assertTenantDoc(file, req, 'File')

    if (file.approvalStatus !== 'pending') {
      throw new AppError('This file is not waiting for approval', 400)
    }

    const isApprover =
      file.approver && String(file.approver) === String(req.user._id)
    const isAdmin =
      req.user?.isPlatformAdmin || isCompanyAdminRole(req.user?.role)
    if (!isApprover && !isAdmin) {
      throw new AppError('Only the assigned approver can decide this', 403)
    }

    const decision = String(req.body.decision || '').trim()
    if (!['approved', 'rejected'].includes(decision)) {
      throw new AppError('decision must be approved or rejected', 400)
    }
    const decisionNote = String(req.body.note || '').trim()

    file.approvalStatus = decision
    file.status = decision
    file.decidedBy = req.user._id
    file.decidedAt = new Date()
    file.decisionNote = decisionNote
    await file.save()
    await file.populate([
      { path: 'approver', select: 'name avatar role' },
      { path: 'requestedBy', select: 'name avatar role' },
      { path: 'decidedBy', select: 'name avatar role' },
    ])

    await ActivityLog.create(
      withTenant(req, {
        projectId: file.projectId,
        actor: req.user._id,
        type: 'file_status',
        message: `${req.user.name} ${decision} “${file.name}”`,
        meta: { fileId: file._id, decision },
      }),
    )

    if (file.requestedBy) {
      await notifyUser(req, {
        userId: file.requestedBy._id || file.requestedBy,
        type: 'approval_decided',
        title: decision === 'approved' ? 'Drawing approved' : 'Drawing rejected',
        body: `${req.user.name} ${decision} “${file.name}”`,
        link: `/projects/${file.projectId}/files`,
        projectId: file.projectId,
        meta: {
          actor: actorSummary(req.user),
          entityKind: 'file',
          fileId: String(file._id),
          fileName: file.name,
          decision,
          note: decisionNote,
        },
      })
    }

    res.json({ success: true, file })
  }),
)

router.patch(
  '/files/:id',
  requireAuth,
  requirePermission('files.manage'),
  asyncHandler(async (req, res) => {
    const file = await ProjectFile.findById(req.params.id)
    assertTenantDoc(file, req, 'File')
    const allowed = ['name', 'folder', 'status', 'clientVisible', 'mime']
    for (const key of allowed) {
      if (req.body[key] !== undefined) file[key] = req.body[key]
    }
    await file.save()

    if (req.body.status === 'sent' || req.body.status === 'approved') {
      await ActivityLog.create(
        withTenant(req, {
          projectId: file.projectId,
          actor: req.user._id,
          type: 'file_status',
          message: `${req.user.name} marked ${file.name} as ${req.body.status}`,
        }),
      )
    }
    res.json({ success: true, file })
  }),
)

/**
 * Removes the record and every version of it. The stored blobs are left in
 * place deliberately — a version URL may already be referenced from an
 * activity entry or a shared link, and a dangling file is a smaller problem
 * than a broken one.
 */
router.delete(
  '/files/:id',
  requireAuth,
  requirePermission('files.manage'),
  asyncHandler(async (req, res) => {
    const file = await ProjectFile.findById(req.params.id)
    assertTenantDoc(file, req, 'File')

    const { name, projectId } = file
    await file.deleteOne()

    await ActivityLog.create(
      withTenant(req, {
        projectId,
        actor: req.user._id,
        type: 'file_deleted',
        message: `${req.user.name} deleted ${name}`,
      }),
    )
    res.json({ success: true })
  }),
)

/* ─── Procurement ─── */
router.get(
  '/vendors',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const vendors = await Vendor.find(tenantFilter(req, {})).sort({ name: 1 })
    res.json({ success: true, vendors })
  }),
)

router.post(
  '/vendors',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim()
    if (!name) throw new AppError('Vendor name is required', 400)
    const vendor = await Vendor.create(
      withTenant(req, {
        name,
        contact: String(req.body.contact || '').trim(),
        email: String(req.body.email || '').trim(),
        phone: String(req.body.phone || '').trim(),
        gst: String(req.body.gst || '').trim(),
        categories: Array.isArray(req.body.categories)
          ? req.body.categories
          : [],
        rating:
          req.body.rating != null ? Number(req.body.rating) : undefined,
        paymentTerms: String(req.body.paymentTerms || 'Net 30').trim(),
      }),
    )
    res.status(201).json({ success: true, vendor })
  }),
)

router.patch(
  '/vendors/:id',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.params.id)
    assertTenantDoc(vendor, req, 'Vendor')
    const allowed = [
      'name',
      'contact',
      'email',
      'phone',
      'gst',
      'categories',
      'rating',
      'paymentTerms',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) vendor[key] = req.body[key]
    }
    await vendor.save()
    res.json({ success: true, vendor })
  }),
)

router.delete(
  '/vendors/:id',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.params.id)
    assertTenantDoc(vendor, req, 'Vendor')
    await vendor.deleteOne()
    res.json({ success: true })
  }),
)

router.get(
  '/purchase-orders',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) {
      await assertProjectAccess(req, req.query.projectId)
      filter.projectId = req.query.projectId
    }
    const pos = await PurchaseOrder.find(filter)
      .populate('vendor', 'name contact phone email gst categories rating paymentTerms')
      .populate('projectId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
    res.json({ success: true, purchaseOrders: pos })
  }),
)

router.post(
  '/purchase-orders',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    if (!req.body.projectId) {
      throw new AppError('projectId is required', 400)
    }
    await assertProjectAccess(req, req.body.projectId)
    const items = Array.isArray(req.body.items) ? req.body.items : []
    const value =
      req.body.value != null
        ? Number(req.body.value)
        : items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    // Route it through the workspace's approval rules. No rule for POs means
    // approvals aren't switched on, and the PO carries on as before.
    const poApproval = await resolveApproval(
      req.tenantId,
      'purchase_order',
      Number.isFinite(value) ? value : 0,
    )

    const po = await PurchaseOrder.create(
      withTenant(req, {
        approvalStatus: poApproval.rule ? 'pending' : 'none',
        approver: poApproval.approver,
        approvalRule: poApproval.rule?._id || null,
        projectId: req.body.projectId,
        vendor: req.body.vendor || undefined,
        items,
        value: Number.isFinite(value) ? value : 0,
        status: req.body.status || 'draft',
        deliveryPhotos: Array.isArray(req.body.deliveryPhotos)
          ? req.body.deliveryPhotos
          : [],
        createdBy: req.user._id,
        poNumber:
          req.body.poNumber || `PO-${Math.floor(1000 + Math.random() * 9000)}`,
      }),
    )
    await po.populate('vendor', 'name contact phone gst')
    await po.populate('approver', 'name email avatar role')
    res.status(201).json({ success: true, purchaseOrder: po })
  }),
)

router.patch(
  '/purchase-orders/:id',
  requireAuth,
  requirePermission('procurement'),
  asyncHandler(async (req, res) => {
    const po = await PurchaseOrder.findById(req.params.id)
    assertTenantDoc(po, req, 'PO')
    const allowed = [
      'vendor',
      'items',
      'value',
      'status',
      'deliveryPhotos',
      'poNumber',
      'projectId',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) po[key] = req.body[key]
    }
    if (req.body.projectId) {
      await assertProjectAccess(req, req.body.projectId)
    }
    await po.save()
    await po.populate('vendor', 'name contact phone gst')
    res.json({ success: true, purchaseOrder: po })
  }),
)

/* ─── Finance ─── */
router.get(
  '/expenses',
  requireAuth,
  requirePermission('finance'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) {
      await assertProjectAccess(req, req.query.projectId)
      filter.projectId = req.query.projectId
    }
    const expenses = await Expense.find(filter)
      .populate('submittedBy', 'name avatar')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
    res.json({ success: true, expenses })
  }),
)

router.post(
  '/expenses',
  requireAuth,
  requirePermission('finance'),
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amount)
    if (!req.body.projectId) throw new AppError('Project is required', 400)
    await assertProjectAccess(req, req.body.projectId)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError('Expense amount must be greater than zero', 400)
    }
    const expenseApproval = await resolveApproval(req.tenantId, 'expense', amount)

    const expense = await Expense.create(
      withTenant(req, {
        ...req.body,
        amount,
        status: 'pending',
        submittedBy: req.user._id,
        approver: expenseApproval.approver,
        approvalRule: expenseApproval.rule?._id || null,
      }),
    )
    await expense.populate('approver', 'name email avatar role')
    res.status(201).json({ success: true, expense })
  }),
)

router.patch(
  '/expenses/:id',
  requireAuth,
  requirePermission('finance'),
  asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id)
    assertTenantDoc(expense, req, 'Expense')
    const status = req.body.status
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Status must be approved or rejected', 400)
    }
    if (expense.status !== 'pending') {
      throw new AppError('Only pending expenses can be reviewed', 409)
    }
    expense.status = status
    if (status === 'approved') expense.approvedBy = req.user._id
    await expense.save()
    await expense.populate('submittedBy', 'name avatar')
    await expense.populate('approvedBy', 'name avatar')
    await expense.populate('projectId', 'name')
    res.json({ success: true, expense })
  }),
)

router.get(
  '/payments',
  requireAuth,
  requirePermission('finance'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) {
      await assertProjectAccess(req, req.query.projectId)
      filter.projectId = req.query.projectId
    }
    const payments = await Payment.find(filter)
      .populate('vendorId', 'name')
      .populate('projectId', 'name')
      .sort({ dueDate: 1 })
    res.json({ success: true, payments })
  }),
)

router.get(
  '/finance/summary',
  requireAuth,
  requirePermission('finance'),
  asyncHandler(async (req, res) => {
    const [projects, approvedExpenses, pendingExpenses, committedOrders] =
      await Promise.all([
        Project.find(tenantFilter(req, {}))
          .select('name budget spent status clientName progress')
          .lean(),
        Expense.find(tenantFilter(req, { status: 'approved' }))
          .select('projectId amount')
          .lean(),
        Expense.find(tenantFilter(req, { status: 'pending' }))
          .select('projectId amount')
          .lean(),
        PurchaseOrder.find(
          tenantFilter(req, {
            status: { $in: ['approved', 'ordered', 'in_transit', 'delivered'] },
          }),
        )
          .select('projectId value status poNumber vendor updatedAt createdAt')
          .populate('projectId', 'name')
          .populate('vendor', 'name')
          .sort({ updatedAt: -1 })
          .lean(),
      ])

    const sumByProject = (rows, amountKey) => {
      const totals = new Map()
      for (const row of rows) {
        const key = String(row.projectId?._id || row.projectId || '')
        totals.set(key, (totals.get(key) || 0) + (Number(row[amountKey]) || 0))
      }
      return totals
    }

    const approvedByProject = sumByProject(approvedExpenses, 'amount')
    const pendingByProject = sumByProject(pendingExpenses, 'amount')
    const committedByProject = sumByProject(committedOrders, 'value')

    const totalBudget = projects.reduce((s, p) => s + (p.budget || 0), 0)
    const pnl = projects.map((p) => {
      const id = String(p._id)
      const quoted = Number(p.budget) || 0
      const recordedCosts = Number(p.spent) || 0
      const approvedExpensesTotal = approvedByProject.get(id) || 0
      const costs = recordedCosts + approvedExpensesTotal
      const profit = quoted - costs
      return {
        id: p._id,
        name: p.name,
        quoted,
        recordedCosts,
        approvedExpenses: approvedExpensesTotal,
        pendingExpenses: pendingByProject.get(id) || 0,
        committed: committedByProject.get(id) || 0,
        costs,
        profit,
        margin: quoted > 0 ? (profit / quoted) * 100 : null,
        health:
          quoted <= 0 ? 'no_budget' : profit < 0 ? 'over_budget' : 'on_track',
      }
    })
    const totalSpent = pnl.reduce((sum, row) => sum + row.costs, 0)
    const pendingAmount = pendingExpenses.reduce(
      (sum, expense) => sum + (Number(expense.amount) || 0),
      0,
    )
    const committedAmount = committedOrders.reduce(
      (sum, po) => sum + (Number(po.value) || 0),
      0,
    )

    res.json({
      success: true,
      data: {
        totalBudget,
        totalSpent,
        variance: totalBudget - totalSpent,
        approvedExpenseCount: approvedExpenses.length,
        pendingExpenseCount: pendingExpenses.length,
        pendingAmount,
        committedAmount,
        committedOrders,
        pnl,
      },
    })
  }),
)

/* ─── Site updates & snags ─── */
router.get(
  '/site-updates',
  requireAuth,
  requirePermission('site'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) {
      await assertProjectAccess(req, req.query.projectId)
      filter.projectId = req.query.projectId
    } else if (!isOpsUser(req.user)) {
      const projects = await Project.find(
        tenantFilter(req, scopeProjects(req.user)),
      ).select('_id')
      filter.projectId = { $in: projects.map((project) => project._id) }
    }
    const updates = await SiteUpdate.find(filter)
      .populate('author', 'name avatar')
      .populate('projectId', 'name location coverImage clientName status')
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, Number(req.query.limit) || 100)))
    res.json({ success: true, updates })
  }),
)

router.post(
  '/site-updates',
  requireAuth,
  requirePermission('site'),
  asyncHandler(async (req, res) => {
    if (!req.body.projectId) throw new AppError('Project is required', 400)
    await assertProjectAccess(req, req.body.projectId)
    const update = await SiteUpdate.create(
      withTenant(req, {
        ...req.body,
        author: req.user._id,
      }),
    )
    await update.populate('author', 'name avatar')

    await ActivityLog.create(
      withTenant(req, {
        projectId: update.projectId,
        actor: req.user._id,
        type: 'site_update',
        message: `${req.user.name} posted a site update`,
      }),
    )

    res.status(201).json({ success: true, update })
  }),
)

router.get(
  '/snags',
  requireAuth,
  requirePermission('site'),
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) filter.projectId = req.query.projectId
    const snags = await Snag.find(filter)
      .populate('assignee', 'name avatar')
      .sort({ createdAt: -1 })
    res.json({ success: true, snags })
  }),
)

router.post(
  '/snags',
  requireAuth,
  requirePermission('site'),
  asyncHandler(async (req, res) => {
    const snag = await Snag.create(withTenant(req, req.body))
    res.status(201).json({ success: true, snag })
  }),
)

router.patch(
  '/snags/:id',
  requireAuth,
  requirePermission('site'),
  asyncHandler(async (req, res) => {
    const snag = await Snag.findById(req.params.id)
    assertTenantDoc(snag, req, 'Snag')
    Object.assign(snag, req.body)
    await snag.save()
    await snag.populate('assignee', 'name avatar')

    if (req.body.convertToTask && snag.status === 'open') {
      const task = await Task.create(
        withTenant(req, {
          projectId: snag.projectId,
          title: `Snag: ${snag.title}`,
          stage: 'execution',
          status: 'todo',
          priority: 'high',
          assignee: snag.assignee,
          createdBy: req.user._id,
        }),
      )
      snag.taskId = task._id
      await snag.save()

      if (task.assignee) {
        const project = await Project.findById(snag.projectId).select('name').lean()
        await notifyUser(req, {
          userId: task.assignee._id || task.assignee,
          type: 'task_assigned',
          title: `${req.user.name} assigned you a snag fix`,
          body: task.title,
          projectId: snag.projectId,
          link: `/projects/${snag.projectId}/tasks?task=${task._id}`,
          meta: {
            taskId: String(task._id),
            taskTitle: task.title,
            projectId: String(snag.projectId),
            projectName: project?.name || '',
            priority: 'high',
            status: 'todo',
            dueDate: null,
            actor: actorSummary(req.user),
          },
        })
      }

      return res.json({ success: true, snag, task })
    }

    res.json({ success: true, snag })
  }),
)

/* ─── Notifications & activity ─── */
router.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find(
      tenantFilter(req, { userId: req.user._id }),
    )
      .sort({ createdAt: -1 })
      .limit(50)
    res.json({ success: true, notifications })
  }),
)

router.patch(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate(
      tenantFilter(req, { _id: req.params.id, userId: req.user._id }),
      { read: true },
      { new: true },
    )
    res.json({ success: true, notification: n })
  }),
)

router.patch(
  '/notifications/:id/later',
  requireAuth,
  asyncHandler(async (req, res) => {
    const later = req.body?.later !== false
    const n = await Notification.findOneAndUpdate(
      tenantFilter(req, { _id: req.params.id, userId: req.user._id }),
      { $set: { later: !!later, ...(later ? { cleared: false } : {}) } },
      { new: true },
    )
    if (!n) throw new AppError('Notification not found', 404)
    res.json({ success: true, notification: n })
  }),
)

router.patch(
  '/notifications/:id/clear',
  requireAuth,
  asyncHandler(async (req, res) => {
    const cleared = req.body?.cleared !== false
    const n = await Notification.findOneAndUpdate(
      tenantFilter(req, { _id: req.params.id, userId: req.user._id }),
      {
        $set: {
          cleared: !!cleared,
          ...(cleared ? { later: false, read: true } : {}),
        },
      },
      { new: true },
    )
    if (!n) throw new AppError('Notification not found', 404)
    res.json({ success: true, notification: n })
  }),
)

router.post(
  '/notifications/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateMany(
      tenantFilter(req, { userId: req.user._id, read: false }),
      { read: true },
    )
    res.json({ success: true })
  }),
)

router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {})
    if (req.query.projectId) {
      await assertProjectAccess(req, req.query.projectId)
      filter.projectId = req.query.projectId
    } else if (!isOpsUser(req.user)) {
      // Employees only see activity from projects they can access
      const projects = await Project.find(
        tenantFilter(req, scopeProjects(req.user)),
      ).select('_id')
      filter.projectId = { $in: projects.map((p) => p._id) }
    }
    const activity = await ActivityLog.find(filter)
      .populate('actor', 'name avatar')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
      .limit(50)
    res.json({ success: true, activity })
  }),
)

/* ─── Reports ─── */
router.get(
  '/reports/overview',
  requireAuth,
  requirePermission('portfolio'),
  asyncHandler(async (req, res) => {
    const projects = await Project.find(tenantFilter(req, {}))
    const tasks = await Task.find(tenantFilter(req, {}))
    const leads = await Lead.find(tenantFilter(req, {}))
    const pos = await PurchaseOrder.find(tenantFilter(req, {}))

    const onTime = projects.filter(
      (p) => !p.isDelayed && p.status !== 'delayed',
    ).length
    const onTimePct = projects.length
      ? Math.round((onTime / projects.length) * 100)
      : 0

    const pipelineValue = leads
      .filter((l) => !CLOSED_LEAD_STAGES.includes(l.stage))
      .reduce((s, l) => s + (l.estimatedValue || 0), 0)

    const team = await User.find(
      tenantFilter(req, { isPlatformAdmin: { $ne: true } }),
    )
      .select('name avatar role title isActive createdAt')
      .sort({ name: 1 })

    const now = new Date()
    const taskBuckets = new Map()
    for (const task of tasks) {
      if (!task.assignee) continue
      const key = String(task.assignee)
      const bucket = taskBuckets.get(key) || {
        total: 0,
        done: 0,
        open: 0,
        overdue: 0,
        review: 0,
        inProgress: 0,
        trackedSeconds: 0,
      }
      bucket.total += 1
      bucket.trackedSeconds += Number(task.timeSpent) || 0
      if (task.status === 'done') bucket.done += 1
      else bucket.open += 1
      if (task.status === 'review') bucket.review += 1
      if (task.status === 'in_progress') bucket.inProgress += 1
      if (task.status !== 'done' && task.dueDate && new Date(task.dueDate) < now) {
        bucket.overdue += 1
      }
      taskBuckets.set(key, bucket)
    }

    const teamPerf = team.map((user) => {
      const metrics = taskBuckets.get(String(user._id)) || {
        total: 0,
        done: 0,
        open: 0,
        overdue: 0,
        review: 0,
        inProgress: 0,
        trackedSeconds: 0,
      }
      return {
        user,
        ...metrics,
        completionRate: metrics.total
          ? Math.round((metrics.done / metrics.total) * 100)
          : 0,
        trackedHours: Math.round((metrics.trackedSeconds / 3600) * 10) / 10,
      }
    })

    const taskStatus = ['todo', 'in_progress', 'review', 'done'].map((status) => ({
      status,
      count: tasks.filter((task) => task.status === status).length,
    }))

    const projectHealth = projects
      .map((project) => {
        const projectTasks = tasks.filter(
          (task) => String(task.projectId || '') === String(project._id),
        )
        const done = projectTasks.filter((task) => task.status === 'done').length
        const overdue = projectTasks.filter(
          (task) =>
            task.status !== 'done' &&
            task.dueDate &&
            new Date(task.dueDate) < now,
        ).length
        return {
          _id: project._id,
          name: project.name,
          status: project.status,
          isDelayed: !!project.isDelayed || project.status === 'delayed',
          budget: Number(project.budget) || 0,
          spent: Number(project.spent) || 0,
          totalTasks: projectTasks.length,
          done,
          overdue,
          progress: projectTasks.length
            ? Math.round((done / projectTasks.length) * 100)
            : Number(project.progress) || 0,
        }
      })
      .sort((a, b) => b.overdue - a.overdue || a.progress - b.progress)

    res.json({
      success: true,
      data: {
        health: {
          total: projects.length,
          delayed: projects.filter((p) => p.isDelayed || p.status === 'delayed')
            .length,
          onTimePct,
        },
        budgetVariance: projects.reduce(
          (s, p) => s + ((p.budget || 0) - (p.spent || 0)),
          0,
        ),
        crmPipelineValue: pipelineValue,
        leadStages: [
          'new_enquiry',
          'site_visit',
          'mood_board',
          'quotation_sent',
          'negotiation',
          'hot',
          'dead',
        ].map((stage) => ({
          stage,
          count: leads.filter((l) => normalizeLeadStage(l.stage) === stage)
            .length,
        })),
        vendorPerformance: {
          totalPOs: pos.length,
          delivered: pos.filter((p) => p.status === 'delivered').length,
          inTransit: pos.filter((p) => p.status === 'in_transit').length,
        },
        teamPerf,
        taskStatus,
        projectHealth,
        taskCompletion: {
          done: tasks.filter((t) => t.status === 'done').length,
          total: tasks.length,
          overdue: tasks.filter(
            (t) =>
              t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now,
          ).length,
          unassigned: tasks.filter((t) => !t.assignee).length,
        },
      },
    })
  }),
)

/* ─── Assigned Comments (ClickUp-style) ─── */
router.get(
  '/comments/assigned',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user._id
    const { scope = 'to_me', resolved, q, days } = req.query
    const since = new Date()
    since.setDate(since.getDate() - (Number(days) || 90))

    const filter = tenantFilter(req, {
      createdAt: { $gte: since },
      taskId: { $ne: null },
    })

    if (resolved === 'true') filter.resolved = true
    else if (resolved !== 'all') filter.resolved = { $ne: true }

    if (scope === 'by_me') {
      // Delegated by me — I authored & tagged/assigned someone else
      filter.author = me
      filter.$or = [
        { assignedTo: { $exists: true, $ne: null, $nin: [me] } },
        { 'mentions.0': { $exists: true } },
      ]
    } else {
      // Assigned to me — tagged, assigned, or comments on my tasks
      const myTasks = await Task.find(tenantFilter(req, { assignee: me })).select('_id')
      const myTaskIds = myTasks.map((t) => t._id)
      filter.$or = [
        { assignedTo: me },
        { mentions: me },
        { taskId: { $in: myTaskIds }, author: { $ne: me } },
      ]
    }

    if (q) {
      filter.body = new RegExp(q, 'i')
    }

    const comments = await Comment.find(filter)
      .populate('author', 'name avatar email')
      .populate('assignedTo', 'name avatar')
      .populate('mentions', 'name avatar')
      .populate({
        path: 'taskId',
        select: 'title status projectId assignee',
        populate: { path: 'projectId', select: 'name' },
      })
      .sort({ createdAt: -1 })
      .limit(100)

    res.json({ success: true, comments })
  }),
)

router.patch(
  '/comments/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const comment = await Comment.findById(req.params.id)
    assertTenantDoc(comment, req, 'Comment')

    if (req.body.resolved === true) {
      comment.resolved = true
      comment.resolvedAt = new Date()
      comment.resolvedBy = req.user._id
    }
    if (req.body.resolved === false) {
      comment.resolved = false
      comment.resolvedAt = null
      comment.resolvedBy = undefined
    }
    if (req.body.assignedTo !== undefined) {
      comment.assignedTo = req.body.assignedTo || undefined
    }
    await comment.save()
    await comment.populate('author', 'name avatar')
    await comment.populate('assignedTo', 'name avatar')
    res.json({ success: true, comment })
  }),
)

/* ─── Users (for assignees) ─── */
router.get(
  '/users',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter = tenantFilter(req, {
      isPlatformAdmin: { $ne: true },
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    })
    let users = await User.find(filter)
      .select('name email avatar role title isActive')
      .sort({ name: 1 })
      .lean()

    // Fallback: tenant members without active filter (legacy rows)
    if (!users.length) {
      users = await User.find(tenantFilter(req, { isPlatformAdmin: { $ne: true } }))
        .select('name email avatar role title isActive')
        .sort({ name: 1 })
        .lean()
    }

    res.json({ success: true, users })
  }),
)

/* ─── Admin team summary (People hub) ─── */

function slugifyRoleKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

const CUSTOM_ROLE_BASES = [
  'hr',
  'project_manager',
  'designer',
  'site_supervisor',
  'vendor',
  'client',
  'dept_design',
  'dept_site',
  'dept_procurement',
  'dept_accounts',
  'dept_sales',
  'dept_admin',
]

router.get(
  '/admin/custom-roles',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (
      !['admin', 'owner', 'hr'].includes(req.user.role) &&
      !req.user.isPlatformAdmin
    ) {
      throw new AppError('Admin / HR only', 403)
    }
    const tenantId = req.user.tenantId || req.tenantId
    const tenant = await Tenant.findById(tenantId).select('customRoles')
    res.json({
      success: true,
      customRoles: tenant?.customRoles || [],
    })
  }),
)

router.post(
  '/admin/custom-roles',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canManageEmployeeAccess(req.user)) {
      throw new AppError('Only an Admin or Owner can create custom roles', 403)
    }

    const label = String(req.body.label || '').trim()
    if (label.length < 2) throw new AppError('Role name is required', 400)

    const tenantId = req.user.tenantId || req.tenantId
    const tenant = await Tenant.findById(tenantId)
    if (!tenant) throw new AppError('Workspace not found', 404)

    const basedOn = String(req.body.basedOn || 'designer').trim()
    const knownCustom = (tenant.customRoles || []).map((r) => r.key)
    // Allow basing on a built-in template or an existing custom role.
    if (
      !CUSTOM_ROLE_BASES.includes(basedOn) &&
      !knownCustom.includes(basedOn)
    ) {
      throw new AppError(
        'Pick a valid base role template or an existing custom role',
        400,
      )
    }

    let key = slugifyRoleKey(req.body.key || label)
    if (!key) throw new AppError('Invalid role name', 400)
    if (ROLES.includes(key) || key === 'custom') {
      key = `custom_${key}`
    }

    if ((tenant.customRoles || []).some((r) => r.key === key)) {
      throw new AppError('A role with this name already exists', 409)
    }
    if (basedOn === key) {
      throw new AppError('A role cannot be based on itself', 400)
    }

    const permissions = sanitizePermissionOverrides(req.body.permissions)
    tenant.customRoles = tenant.customRoles || []
    tenant.customRoles.push({
      key,
      label,
      basedOn,
      permissions,
      createdAt: new Date(),
    })
    await tenant.save()

    const created = tenant.customRoles[tenant.customRoles.length - 1]
    res.status(201).json({
      success: true,
      role: {
        key: created.key,
        label: created.label,
        basedOn: created.basedOn,
        permissions: created.permissions || {},
        createdAt: created.createdAt,
      },
      customRoles: tenant.customRoles,
    })
  }),
)

router.get(
  '/admin/team-summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (
      !['admin', 'owner', 'hr'].includes(req.user.role) &&
      !req.user.isPlatformAdmin
    ) {
      throw new AppError('Admin / HR only', 403)
    }

    const tenantId = req.user.tenantId || req.tenantId
    const tenant =
      req.tenant ||
      (tenantId ? await Tenant.findById(tenantId) : null)

    const users = await User.find(
      tenantFilter(req, { isPlatformAdmin: { $ne: true } }),
    )
      .select('name email avatar role title isActive permissions createdAt')
      .sort({ name: 1 })
      .lean()

    const now = new Date()
    const members = await Promise.all(
      users.map(async (u) => {
        const base = tenantFilter(req, { assignee: u._id })
        const [open, overdue, done, timeAgg] = await Promise.all([
          Task.countDocuments({
            ...base,
            status: { $ne: 'done' },
          }),
          Task.countDocuments({
            ...base,
            status: { $ne: 'done' },
            dueDate: { $lt: now },
          }),
          Task.countDocuments({
            ...base,
            status: 'done',
          }),
          Task.aggregate([
            { $match: { ...base } },
            {
              $group: {
                _id: null,
                timeSpent: { $sum: { $ifNull: ['$timeSpent', 0] } },
              },
            },
          ]),
        ])
        const effectivePermissions = resolvePermissions(u, tenant)
        return {
          user: {
            ...u,
            permissions:
              u.permissions && typeof u.permissions === 'object'
                ? { ...u.permissions }
                : {},
            effectivePermissions,
          },
          open,
          overdue,
          done,
          timeSpent: timeAgg[0]?.timeSpent || 0,
        }
      }),
    )

    res.json({
      success: true,
      data: {
        totalMembers: users.length,
        activeMembers: users.filter((u) => u.isActive !== false).length,
        members,
      },
    })
  }),
)

router.patch(
  '/admin/users/:id/permissions',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canManageEmployeeAccess(req.user)) {
      throw new AppError('Only an Admin or Owner can manage employee access', 403)
    }

    const target = await User.findOne(
      tenantFilter(req, {
        _id: req.params.id,
        isPlatformAdmin: { $ne: true },
      }),
    )
    if (!target) throw new AppError('Employee not found', 404)

    if (req.body.permissions !== undefined) {
      // Full ACL from People page — every key true/false so toggles stick.
      target.permissions = normalizePermissionMap(req.body.permissions)
      target.markModified('permissions')
    }
    if (typeof req.body.isActive === 'boolean') {
      if (String(target._id) === String(req.user._id) && !req.body.isActive) {
        throw new AppError('You cannot deactivate your own account', 400)
      }
      target.isActive = req.body.isActive
    }
    await target.save()

    const tenant =
      req.tenant ||
      (target.tenantId ? await Tenant.findById(target.tenantId) : null)
    const safeUser = target.toSafeJSON()
    const effectivePermissions = resolvePermissions(target, tenant)
    const io = req.app.get('io')
    if (io) {
      io.to(`user:${String(target._id)}`).emit('permissions:updated', {
        permissions: safeUser.permissions,
        effectivePermissions,
      })
    }

    res.json({
      success: true,
      user: {
        ...safeUser,
        effectivePermissions,
      },
    })
  }),
)

router.post(
  '/admin/users/:id/reset-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!['admin', 'owner'].includes(req.user.role)) {
      throw new AppError('Only a company Admin or Owner can reset passwords', 403)
    }

    if (String(req.user._id) === String(req.params.id)) {
      throw new AppError('Use Settings to change your own password', 400)
    }

    const target = await User.findOne(
      tenantFilter(req, {
        _id: req.params.id,
        isPlatformAdmin: { $ne: true },
      }),
    ).select('+refreshTokens +password')
    if (!target) throw new AppError('Company user not found', 404)

    if (req.user.role === 'admin' && target.role === 'owner') {
      throw new AppError('Only an Owner can reset another Owner password', 403)
    }

    const tempPassword = crypto.randomBytes(8).toString('hex')
    target.password = tempPassword
    target.mustChangePassword = true
    target.refreshTokens = []
    await target.save()

    res.json({
      success: true,
      user: target.toSafeJSON(),
      tempPassword,
      message: 'Password reset. Share the temporary password securely.',
    })
  }),
)

router.delete(
  '/admin/users/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canManageEmployeeAccess(req.user)) {
      throw new AppError('Only an Admin or Owner can delete people', 403)
    }

    if (String(req.user._id) === String(req.params.id)) {
      throw new AppError('You cannot delete your own account', 400)
    }

    const target = await User.findOne(
      tenantFilter(req, {
        _id: req.params.id,
        isPlatformAdmin: { $ne: true },
      }),
    )
    if (!target) throw new AppError('Employee not found', 404)

    if (req.user.role === 'admin' && target.role === 'owner') {
      throw new AppError('Only an Owner can delete another Owner', 403)
    }

    const removed = {
      id: String(target._id),
      name: target.name,
      email: target.email,
    }
    await User.deleteOne({ _id: target._id })

    res.json({
      success: true,
      message: `${removed.name} removed from this company`,
      removed,
    })
  }),
)

export default router
