import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { tenantFilter, withTenant, assertTenantDoc } from '../middleware/tenant.js'
import { scopeProjects } from '../lib/projectScope.js'
import { requirePermission } from '../lib/permissions.js'
import { Project, Task, ActivityLog, User } from '../models/index.js'

const router = express.Router()

const STAGE_DEFS = [
  { key: 'design', label: 'Design' },
  { key: 'planning', label: 'Planning / BOQ' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'execution', label: 'Execution' },
  { key: 'handover', label: 'QC / Handover' },
]

const TEMPLATE_TASKS = {
  residential: [
    { title: 'Kickoff & brief capture', stage: 'design' },
    { title: 'Concept moodboards', stage: 'design' },
    { title: 'Client concept approval', stage: 'design', requiresApproval: true },
    { title: 'Draft BOQ — Standard', stage: 'planning' },
    { title: 'Vendor shortlist', stage: 'procurement' },
    { title: 'Raise primary POs', stage: 'procurement' },
    { title: 'Site mobilization', stage: 'execution' },
    { title: 'Snag walkthrough', stage: 'handover' },
  ],
  commercial: [
    { title: 'Brand & space brief', stage: 'design' },
    { title: 'Space planning drawings', stage: 'design' },
    { title: 'Commercial BOQ', stage: 'planning' },
    { title: 'MEP coordination', stage: 'planning' },
    { title: 'Bulk material POs', stage: 'procurement' },
    { title: 'Fit-out execution', stage: 'execution' },
    { title: 'Handover pack', stage: 'handover' },
  ],
  renovation: [
    { title: 'Site survey & as-built notes', stage: 'design' },
    { title: 'Renovation moodboards', stage: 'design' },
    { title: 'Scope & demolition plan', stage: 'planning' },
    { title: 'Renovation BOQ', stage: 'planning' },
    { title: 'Material & finish shortlist', stage: 'procurement' },
    { title: 'Demolition & site prep', stage: 'execution' },
    { title: 'Fit-out & finishing', stage: 'execution' },
    { title: 'Snag walkthrough', stage: 'handover' },
  ],
  custom: [
    { title: 'Define project milestones', stage: 'design' },
    { title: 'Confirm scope with client', stage: 'design', requiresApproval: true },
    { title: 'Build custom schedule', stage: 'planning' },
  ],
  blank: [
    { title: 'Define project milestones', stage: 'design' },
  ],
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, type, stage, q } = req.query
    const filter = tenantFilter(req, { ...scopeProjects(req.user) })
    if (status) filter.status = status
    if (type) filter.type = type
    if (stage) filter.currentStage = stage
    if (q) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { name: new RegExp(q, 'i') },
            { clientName: new RegExp(q, 'i') },
            { location: new RegExp(q, 'i') },
          ],
        },
      ]
    }

    const projects = await Project.find(filter)
      .populate('projectManager', 'name avatar')
      .populate('members.user', 'name avatar role')
      .sort({ updatedAt: -1 })

    res.json({ success: true, projects })
  }),
)

router.get(
  '/portfolio',
  requireAuth,
  requirePermission('portfolio'),
  asyncHandler(async (req, res) => {
    const scope = scopeProjects(req.user)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000)

    const [projects, upcomingDeadlines, openTaskAgg, createdRecent, createdPrior] =
      await Promise.all([
        Project.find(tenantFilter(req, scope))
          .select(
            'name clientName status isDelayed progress currentStage location coverImage endDate startDate budget spent members projectManager updatedAt createdAt',
          )
          .populate('projectManager', 'name avatar')
          .populate('members.user', 'name avatar')
          .sort({ updatedAt: -1 })
          .lean(),
        Task.find(
          tenantFilter(req, {
            status: { $ne: 'done' },
            dueDate: {
              $gte: new Date(),
              $lte: new Date(Date.now() + 14 * 86400000),
            },
          }),
        )
          .populate('projectId', 'name')
          .populate('assignee', 'name avatar')
          .sort({ dueDate: 1 })
          .limit(8)
          .lean(),
        Task.aggregate([
          {
            $match: {
              ...tenantFilter(req, {
                status: { $ne: 'done' },
                assignee: { $ne: null },
              }),
            },
          },
          { $group: { _id: '$assignee', openTasks: { $sum: 1 } } },
        ]),
        Project.countDocuments(
          tenantFilter(req, { ...scope, createdAt: { $gte: thirtyDaysAgo } }),
        ),
        Project.countDocuments(
          tenantFilter(req, {
            ...scope,
            createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
          }),
        ),
      ])

    const bucket = (p) => {
      if (p.status === 'completed') return 'completed'
      if (p.status === 'on_hold') return 'onHold'
      if (p.status === 'delayed' || p.isDelayed) return 'delayed'
      if (p.status === 'in_progress') return 'ongoing'
      return 'planning'
    }

    const counts = {
      total: projects.length,
      ongoing: projects.filter((p) => bucket(p) === 'ongoing').length,
      completed: projects.filter((p) => bucket(p) === 'completed').length,
      delayed: projects.filter((p) => bucket(p) === 'delayed').length,
      onHold: projects.filter((p) => bucket(p) === 'onHold').length,
      planning: projects.filter((p) => bucket(p) === 'planning').length,
    }

    const health = [
      {
        key: 'completed',
        label: 'Completed',
        value: counts.completed,
        color: 'var(--status-completed)',
      },
      {
        key: 'ongoing',
        label: 'Ongoing',
        value: counts.ongoing,
        color: 'var(--status-in-progress)',
      },
      {
        key: 'delayed',
        label: 'Delayed',
        value: counts.delayed,
        color: 'var(--status-delayed)',
      },
      {
        key: 'onHold',
        label: 'On hold',
        value: counts.onHold,
        color: 'var(--status-on-hold)',
      },
      {
        key: 'planning',
        label: 'Planning',
        value: counts.planning,
        color: 'var(--status-not-started)',
      },
    ].filter((row) => row.value > 0)

    const delayAlerts = projects
      .filter((p) => p.isDelayed || p.status === 'delayed')
      .map((p) => ({
        id: p._id,
        name: p.name,
        location: p.location,
        stage: p.currentStage,
        endDate: p.endDate,
      }))

    const openByUser = new Map(
      openTaskAgg.map((row) => [String(row._id), row.openTasks]),
    )
    const assigneeIds = [...openByUser.keys()]
    const users =
      assigneeIds.length > 0
        ? await User.find(
            tenantFilter(req, {
              _id: { $in: assigneeIds },
              isActive: { $ne: false },
              isPlatformAdmin: { $ne: true },
            }),
          )
            .select('name avatar role')
            .lean()
        : []

    const maxOpen = Math.max(8, ...[...openByUser.values()], 1)
    const workload = users
      .map((u) => {
        const openTasks = openByUser.get(String(u._id)) || 0
        return {
          user: u,
          openTasks,
          load: Math.min(100, Math.round((openTasks / maxOpen) * 100)),
        }
      })
      .filter((w) => w.openTasks > 0)
      .sort((a, b) => b.openTasks - a.openTasks)
      .slice(0, 10)

    const projectCards = projects.map((p) => ({
      _id: p._id,
      name: p.name,
      clientName: p.clientName,
      status: p.status,
      isDelayed: !!p.isDelayed || p.status === 'delayed',
      progress: p.progress || 0,
      currentStage: p.currentStage,
      location: p.location,
      coverImage: p.coverImage || '',
      endDate: p.endDate,
      startDate: p.startDate,
      budget: p.budget,
      spent: p.spent,
      projectManager: p.projectManager,
      members: (p.members || []).slice(0, 5),
    }))

    res.json({
      success: true,
      data: {
        counts,
        trends: {
          projectsCreated30d: createdRecent,
          projectsCreatedPrior30d: createdPrior,
          projectDelta: createdRecent - createdPrior,
        },
        health,
        projects: projectCards,
        delayAlerts,
        upcomingDeadlines,
        workload,
        activeCount: counts.ongoing + counts.delayed + counts.planning,
      },
    })
  }),
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await Project.findOne(
      tenantFilter(req, {
        _id: req.params.id,
        ...scopeProjects(req.user),
      }),
    )
      .populate('projectManager', 'name avatar email title')
      .populate('members.user', 'name avatar role email title')
      .populate('clientId', 'name avatar email')

    if (!project) throw new AppError('Project not found', 404)

    const [openTasks, pendingApprovals, latestSite] = await Promise.all([
      Task.countDocuments(
        tenantFilter(req, { projectId: project._id, status: { $ne: 'done' } }),
      ),
      Task.countDocuments(
        tenantFilter(req, {
          projectId: project._id,
          requiresApproval: true,
          approvalStatus: 'pending',
        }),
      ),
      ActivityLog.find(tenantFilter(req, { projectId: project._id }))
        .populate('actor', 'name avatar')
        .sort({ createdAt: -1 })
        .limit(1),
    ])

    res.json({
      success: true,
      project,
      stats: {
        openTasks,
        pendingApprovals,
        budgetVsSpent: {
          budget: project.budget,
          spent: project.spent,
          pct: project.budget ? Math.round((project.spent / project.budget) * 100) : 0,
        },
        latestActivity: latestSite[0] || null,
      },
    })
  }),
)

router.post(
  '/',
  requireAuth,
  requirePermission('projects.create'),
  asyncHandler(async (req, res) => {
    const {
      name,
      clientName,
      clientPhone,
      clientEmail,
      type = 'residential',
      location,
      startDate,
      endDate,
      budget,
      coverImage,
      description,
      spaceId,
    } = req.body

    if (!name || !clientName) throw new AppError('Name and client are required')

    const allowedTypes = ['residential', 'commercial', 'renovation', 'custom']
    const resolvedType =
      type === 'blank' ? 'custom' : type || 'residential'
    if (!allowedTypes.includes(resolvedType)) {
      throw new AppError(
        'Property type must be residential, commercial, renovation, or custom',
        400,
      )
    }

    const stages = STAGE_DEFS.map((s, i) => ({
      ...s,
      progress: 0,
      status: i === 0 ? 'in_progress' : 'not_started',
    }))

    const project = await Project.create(
      withTenant(req, {
        name,
        clientName,
        clientPhone: clientPhone || '',
        clientEmail: String(clientEmail || '').trim().toLowerCase(),
        type: resolvedType,
        location,
        startDate,
        endDate,
        budget: budget || 0,
        spaceId: spaceId || undefined,
        coverImage: coverImage || '',
        description,
        status: 'in_progress',
        currentStage: 'design',
        stages,
        projectManager: req.user._id,
        members: [{ user: req.user._id, role: req.user.role }],
        code: `CUB-${Math.floor(100 + Math.random() * 900)}`,
      }),
    )

    const template = TEMPLATE_TASKS[resolvedType] || TEMPLATE_TASKS.custom
    await Task.insertMany(
      template.map((t) =>
        withTenant(req, {
          ...t,
          projectId: project._id,
          createdBy: req.user._id,
          assignee: req.user._id,
          status: 'todo',
          priority: 'medium',
          approvalStatus: t.requiresApproval ? 'pending' : 'none',
        }),
      ),
    )

    await ActivityLog.create(
      withTenant(req, {
        projectId: project._id,
        actor: req.user._id,
        type: 'project_created',
        message: `${req.user.name} created project “${name}”`,
      }),
    )

    res.status(201).json({ success: true, project })
  }),
)

router.patch(
  '/:id',
  requireAuth,
  requirePermission('projects.manage'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')

    const allowed = [
      'name',
      'clientName',
      'clientPhone',
      'clientEmail',
      'status',
      'currentStage',
      'stages',
      'coverImage',
      'location',
      'description',
      'startDate',
      'endDate',
      'budget',
      'type',
      'spent',
      'progress',
      'isDelayed',
      'members',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) project[key] = req.body[key]
    }

    // Keep stage checklist in sync when currentStage moves forward
    if (req.body.currentStage && Array.isArray(project.stages)) {
      const order = [
        'design',
        'planning',
        'procurement',
        'execution',
        'handover',
      ]
      const idx = order.indexOf(req.body.currentStage)
      if (idx >= 0) {
        for (const s of project.stages) {
          const si = order.indexOf(s.key)
          if (si < idx) {
            s.status = 'completed'
            s.progress = 100
          } else if (si === idx) {
            s.status = 'in_progress'
            s.progress = Math.max(Number(s.progress) || 0, 10)
          } else if (s.status === 'completed') {
            s.status = 'not_started'
            s.progress = 0
          }
        }
        project.markModified('stages')
      }
    }

    await project.save()
    res.json({ success: true, project })
  }),
)

/* ── Meeting notes ── */

router.post(
  '/:id/notes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const text = String(req.body.text || '').trim()
    if (!text) throw new AppError('Note text is required')

    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')

    project.meetingNotes.push({
      text,
      createdBy: req.user._id,
      createdByName: req.user.name || '',
    })
    await project.save()
    res.status(201).json({ success: true, meetingNotes: project.meetingNotes })
  }),
)

router.patch(
  '/:id/notes/:noteId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const text = String(req.body.text || '').trim()
    if (!text) throw new AppError('Note text is required')

    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')

    const note = project.meetingNotes.id(req.params.noteId)
    if (!note) throw new AppError('Note not found', 404)
    if (String(note.createdBy) !== String(req.user._id)) {
      throw new AppError('Only the author can edit this note', 403)
    }

    note.text = text
    note.editedAt = new Date()
    await project.save()
    res.json({ success: true, meetingNotes: project.meetingNotes })
  }),
)

router.delete(
  '/:id/notes/:noteId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')

    const note = project.meetingNotes.id(req.params.noteId)
    if (!note) throw new AppError('Note not found', 404)

    const isAuthor = String(note.createdBy) === String(req.user._id)
    const canManage = ['owner', 'admin', 'project_manager'].includes(
      req.user.role,
    )
    if (!isAuthor && !canManage) {
      throw new AppError('Not allowed to delete this note', 403)
    }

    note.deleteOne()
    await project.save()
    res.json({ success: true, meetingNotes: project.meetingNotes })
  }),
)

router.post(
  '/:id/members',
  requireAuth,
  requirePermission('projects.manage'),
  asyncHandler(async (req, res) => {
    const { userId, role } = req.body
    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')
    const exists = project.members.some((m) => String(m.user) === String(userId))
    if (!exists) project.members.push({ user: userId, role })
    await project.save()
    await project.populate('members.user', 'name avatar role email title')
    res.json({ success: true, project })
  }),
)

router.delete(
  '/:id/members/:userId',
  requireAuth,
  requirePermission('projects.manage'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')
    project.members = project.members.filter(
      (m) => String(m.user) !== String(req.params.userId),
    )
    await project.save()
    res.json({ success: true, project })
  }),
)

router.delete(
  '/:id',
  requireAuth,
  requirePermission('projects.manage'),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id)
    assertTenantDoc(project, req, 'Project')

    const id = project._id
    await Task.deleteMany(tenantFilter(req, { projectId: id }))
    await ActivityLog.deleteMany(tenantFilter(req, { projectId: id }))
    await project.deleteOne()

    res.json({ success: true })
  }),
)

export default router
