import express from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { tenantFilter } from '../middleware/tenant.js'
import {
  Lead,
  Quotation,
  Project,
  ActivityLog,
  Vendor,
  PurchaseOrder,
  Expense,
} from '../models/index.js'
import { budgetByProjectId } from '../lib/projectBudget.js'

const router = express.Router()

const RANGE_MS = {
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '12m': 365 * 24 * 60 * 60 * 1000,
}

function rangeStart(rangeKey) {
  if (!rangeKey || rangeKey === 'all') return null
  const ms = RANGE_MS[rangeKey] || RANGE_MS['30d']
  return new Date(Date.now() - ms)
}

function statusBucket(project) {
  if (project.status === 'completed') return 'completed'
  if (project.status === 'on_hold') return 'on_hold'
  if (project.status === 'delayed' || project.isDelayed) return 'delayed'
  if (project.status === 'in_progress') return 'in_progress'
  return project.status || 'planning'
}

router.get(
  '/dashboard',
  requireAuth,
  requireRole('admin', 'owner'),
  asyncHandler(async (req, res) => {
    const range = String(req.query.range || '30d')
    const since = rangeStart(range)
    const previousSince =
      since != null ? new Date(since.getTime() - (Date.now() - since.getTime())) : null

    const [
      projects,
      leads,
      quotations,
      approvedExpenses,
      pendingExpenses,
      purchaseOrders,
      vendors,
      activity,
      periodApprovedExpenses,
      previousPeriodApprovedExpenses,
      projectsCreatedInRange,
      projectsCreatedPrevious,
    ] = await Promise.all([
      Project.find(tenantFilter(req, {}))
        .select(
          'name clientName status isDelayed progress currentStage startDate endDate budget spent updatedAt createdAt',
        )
        .sort({ updatedAt: -1 })
        .lean(),
      Lead.find(tenantFilter(req, {})).select('stage estimatedValue createdAt').lean(),
      Quotation.find(tenantFilter(req, {}))
        .select(
          'status items grandTotal subtotal chargesPercent gstPercent discount projectId createdAt updatedAt approvedAt title versionLabel',
        )
        .lean(),
      Expense.find(tenantFilter(req, { status: 'approved' }))
        .select('projectId amount createdAt updatedAt')
        .lean(),
      Expense.find(tenantFilter(req, { status: 'pending' }))
        .select('projectId amount')
        .lean(),
      PurchaseOrder.find(tenantFilter(req, {}))
        .select('vendor value status items projectId createdAt')
        .populate('vendor', 'name categories rating')
        .lean(),
      Vendor.find(tenantFilter(req, {})).select('name categories rating').lean(),
      ActivityLog.find(tenantFilter(req, since ? { createdAt: { $gte: since } } : {}))
        .populate('actor', 'name avatar')
        .populate('projectId', 'name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      since
        ? Expense.find(
            tenantFilter(req, {
              status: 'approved',
              updatedAt: { $gte: since },
            }),
          )
            .select('amount')
            .lean()
        : Promise.resolve(null),
      previousSince && since
        ? Expense.find(
            tenantFilter(req, {
              status: 'approved',
              updatedAt: { $gte: previousSince, $lt: since },
            }),
          )
            .select('amount')
            .lean()
        : Promise.resolve([]),
      since
        ? Project.countDocuments(tenantFilter(req, { createdAt: { $gte: since } }))
        : Promise.resolve(null),
      previousSince && since
        ? Project.countDocuments(
            tenantFilter(req, {
              createdAt: { $gte: previousSince, $lt: since },
            }),
          )
        : Promise.resolve(0),
    ])

    const posInRange = since
      ? purchaseOrders.filter((po) => po.createdAt && new Date(po.createdAt) >= since)
      : purchaseOrders
    const quotesInRange = since
      ? quotations.filter((q) => q.createdAt && new Date(q.createdAt) >= since)
      : quotations
    const leadsInRange = since
      ? leads.filter((l) => l.createdAt && new Date(l.createdAt) >= since)
      : leads

    const activeLeads = leads.filter(
      (l) => !['hot', 'dead', 'won', 'lost'].includes(l.stage),
    )
    const activeLeadsInRange = leadsInRange.filter(
      (l) => !['hot', 'dead', 'won', 'lost'].includes(l.stage),
    )
    const projectCounts = {
      total: projects.length,
      active: projects.filter((p) =>
        ['in_progress', 'planning', 'not_started'].includes(p.status),
      ).length,
      ongoing: projects.filter((p) => p.status === 'in_progress').length,
      completed: projects.filter((p) => p.status === 'completed').length,
      delayed: projects.filter((p) => p.status === 'delayed' || p.isDelayed).length,
      onHold: projects.filter((p) => p.status === 'on_hold').length,
    }

    const statusOverview = [
      {
        key: 'in_progress',
        label: 'In progress',
        value: projects.filter((p) => statusBucket(p) === 'in_progress').length,
        color: 'var(--status-in-progress)',
      },
      {
        key: 'completed',
        label: 'Completed',
        value: projects.filter((p) => statusBucket(p) === 'completed').length,
        color: 'var(--status-completed)',
      },
      {
        key: 'delayed',
        label: 'Delayed',
        value: projects.filter((p) => statusBucket(p) === 'delayed').length,
        color: 'var(--status-delayed)',
      },
      {
        key: 'on_hold',
        label: 'On hold',
        value: projects.filter((p) => statusBucket(p) === 'on_hold').length,
        color: 'var(--status-on-hold)',
      },
      {
        key: 'planning',
        label: 'Planning',
        value: projects.filter((p) => {
          const bucket = statusBucket(p)
          return !['in_progress', 'completed', 'delayed', 'on_hold'].includes(bucket)
        }).length,
        color: 'var(--status-not-started)',
      },
    ].filter((row) => row.value > 0)

    const approvedByProject = new Map()
    for (const expense of approvedExpenses) {
      const key = String(expense.projectId || '')
      approvedByProject.set(
        key,
        (approvedByProject.get(key) || 0) + (Number(expense.amount) || 0),
      )
    }

    const committedOrders = purchaseOrders.filter((po) =>
      ['approved', 'ordered', 'in_transit', 'delivered'].includes(po.status),
    )
    const committedByProject = new Map()
    for (const po of committedOrders) {
      const key = String(po.projectId || '')
      committedByProject.set(
        key,
        (committedByProject.get(key) || 0) + (Number(po.value) || 0),
      )
    }

    const approvedQuotes = quotations.filter((q) => q.status === 'approved')
    const approvedQuotesScoped = (since ? quotesInRange : quotations).filter(
      (q) => q.status === 'approved',
    )
    const boqLineCount = approvedQuotesScoped.reduce(
      (sum, q) => sum + (q.items?.length || 0),
      0,
    )
    const orderedLineCount = posInRange.reduce(
      (sum, po) => sum + (po.items?.length || 0),
      0,
    )

    const materials = {
      approvedBoqLines: boqLineCount,
      poLines: orderedLineCount,
      coveragePct:
        boqLineCount > 0
          ? Math.min(100, Math.round((orderedLineCount / boqLineCount) * 100))
          : null,
      poStatus: [
        { key: 'draft', label: 'Draft', value: posInRange.filter((p) => p.status === 'draft').length },
        { key: 'approved', label: 'Approved', value: posInRange.filter((p) => p.status === 'approved').length },
        { key: 'ordered', label: 'Ordered', value: posInRange.filter((p) => p.status === 'ordered').length },
        { key: 'in_transit', label: 'In transit', value: posInRange.filter((p) => p.status === 'in_transit').length },
        { key: 'delivered', label: 'Delivered', value: posInRange.filter((p) => p.status === 'delivered').length },
      ],
      totalPos: posInRange.length,
      note: since
        ? `PO & BOQ lines created in the selected period. Coverage = approved BOQ lines vs PO lines.`
        : 'Coverage uses approved BOQ lines vs PO lines (all time).',
    }

    const vendorMap = new Map()
    for (const po of posInRange) {
      const vendorId =
        typeof po.vendor === 'object' && po.vendor?._id
          ? String(po.vendor._id)
          : String(po.vendor || '')
      if (!vendorId || vendorId === 'undefined' || vendorId === 'null') continue
      const existing = vendorMap.get(vendorId) || {
        id: vendorId,
        name: po.vendor?.name || 'Unknown vendor',
        rating: po.vendor?.rating || null,
        categories: po.vendor?.categories || [],
        poCount: 0,
        value: 0,
        delivered: 0,
      }
      existing.poCount += 1
      existing.value += Number(po.value) || 0
      if (po.status === 'delivered') existing.delivered += 1
      vendorMap.set(vendorId, existing)
    }

    const topVendors = [...vendorMap.values()]
      .filter((v) => v.poCount > 0)
      .sort((a, b) => b.value - a.value || b.poCount - a.poCount)
      .slice(0, 8)
      .map((v) => ({
        ...v,
        deliveryRate: v.poCount > 0 ? Math.round((v.delivered / v.poCount) * 100) : null,
      }))

    // Prefer the latest approved BOQ total. Stale project.budget values
    // (left after unlock/revision) were blowing the studio figure into crores.
    const budgets = budgetByProjectId(projects, quotations)

    // Spend = project.spent field when set; otherwise fall back to approved expenses
    // (avoids double-counting if spent was already rolled up from expenses).
    const budgetRows = projects.map((p) => {
      const id = String(p._id)
      const budget = budgets.get(id) || 0
      const recorded = Number(p.spent) || 0
      const approved = approvedByProject.get(id) || 0
      const spent = recorded > 0 ? recorded : approved
      const committed = committedByProject.get(id) || 0
      return {
        id: p._id,
        name: p.name,
        budget,
        spent,
        committed,
        remaining: budget - spent,
        utilization: budget > 0 ? (spent / budget) * 100 : null,
      }
    })

    const totalBudget = budgetRows.reduce((s, r) => s + r.budget, 0)
    const totalSpent = budgetRows.reduce((s, r) => s + r.spent, 0)
    const committedAmount = committedOrders.reduce(
      (s, po) => s + (Number(po.value) || 0),
      0,
    )
    const pendingAmount = pendingExpenses.reduce(
      (s, e) => s + (Number(e.amount) || 0),
      0,
    )
    const utilization =
      totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 1000) / 10 : null

    const periodSpend = (periodApprovedExpenses || []).reduce(
      (s, e) => s + (Number(e.amount) || 0),
      0,
    )
    const previousSpend = (previousPeriodApprovedExpenses || []).reduce(
      (s, e) => s + (Number(e.amount) || 0),
      0,
    )

    const timeline = projects.map((p) => {
      const id = String(p._id)
      const budget = budgets.get(id) || 0
      const recorded = Number(p.spent) || 0
      const approved = approvedByProject.get(id) || 0
      const spent = recorded > 0 ? recorded : approved
      return {
        id: p._id,
        name: p.name,
        clientName: p.clientName,
        status: p.status,
        isDelayed: !!p.isDelayed || p.status === 'delayed',
        progress: p.progress || 0,
        currentStage: p.currentStage,
        startDate: p.startDate || null,
        endDate: p.endDate || null,
        budget,
        spent,
      }
    })

    const projectDelta =
      projectsCreatedInRange == null
        ? null
        : projectsCreatedInRange - (projectsCreatedPrevious || 0)

    res.json({
      success: true,
      data: {
        range,
        rangeLabel:
          range === 'all'
            ? 'All time'
            : range === '12m'
              ? 'Last 12 months'
              : range === '90d'
                ? 'Last 90 days'
                : 'Last 30 days',
        kpis: {
          totalProjects: projectCounts.total,
          projectDelta,
          activeLeads: activeLeads.length,
          pipelineValue: activeLeads.reduce(
            (s, l) => s + (Number(l.estimatedValue) || 0),
            0,
          ),
          leadsInRange: activeLeadsInRange.length,
          totalBoqs: quotations.length,
          approvedBoqs: approvedQuotes.length,
          boqsInRange: quotesInRange.length,
          budgetUtilization: utilization,
          totalBudget,
          totalSpent,
        },
        projectCounts,
        statusOverview,
        budget: {
          totalBudget,
          totalSpent,
          variance: totalBudget - totalSpent,
          utilization,
          committedAmount,
          pendingAmount,
          periodSpend: since ? periodSpend : null,
          previousSpend: since ? previousSpend : null,
          spendDelta:
            since && previousSpend > 0
              ? Math.round(((periodSpend - previousSpend) / previousSpend) * 100)
              : null,
          projects: budgetRows
            .slice()
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 8),
        },
        materials,
        topVendors,
        activity: activity.map((a) => ({
          id: a._id,
          message: a.message,
          type: a.type,
          createdAt: a.createdAt,
          actor: a.actor
            ? { id: a.actor._id, name: a.actor.name, avatar: a.actor.avatar }
            : null,
          project: a.projectId
            ? { id: a.projectId._id, name: a.projectId.name }
            : null,
        })),
        timeline,
      },
    })
  }),
)

export default router
