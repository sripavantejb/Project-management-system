import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { tenantFilter, withTenant, assertTenantDoc } from '../middleware/tenant.js'
import '../models/index.js'
import { Task } from '../models/Task.js'
import { ActivityLog, Notification, Comment } from '../models/Activity.js'
import { startOfDay, endOfDay } from './dateHelpers.js'
import { applyStatusAutoTimer, emitTimerUpdated } from '../lib/taskTimer.js'

const router = express.Router()

router.get(
  '/home',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user._id
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)

    const populateTask = [
      { path: 'projectId', select: 'name coverImage' },
      { path: 'assignee', select: 'name avatar' },
    ]

    const tf = (extra) => tenantFilter(req, extra)

    /** One open-task query replaces 7 overlapping Task.find calls. */
    const mineOpen = {
      status: { $ne: 'done' },
      $or: [
        { assignee: userId, isPersonal: { $ne: true } },
        {
          isPersonal: true,
          $or: [{ assignee: userId }, { createdBy: userId }],
        },
      ],
    }

    const [
      openTasks,
      done,
      delegated,
      assignedComments,
      approvals,
      activity,
      notifications,
    ] = await Promise.all([
      Task.find(tf(mineOpen))
        .populate(populateTask)
        .sort({ status: 1, dueDate: 1, updatedAt: -1 })
        .limit(120)
        .lean(),
      Task.find(
        tf({
          status: 'done',
          $or: [
            { assignee: userId },
            { isPersonal: true, createdBy: userId },
          ],
        }),
      )
        .populate(populateTask)
        .sort({ updatedAt: -1 })
        .limit(40)
        .lean(),
      Task.find(
        tf({
          createdBy: userId,
          isPersonal: { $ne: true },
          assignee: { $exists: true, $nin: [null, userId] },
          status: { $ne: 'done' },
        }),
      )
        .populate(populateTask)
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean(),
      Comment.find(
        tf({
          resolved: { $ne: true },
          $or: [{ assignedTo: userId }, { mentions: userId }],
        }),
      )
        .populate('author', 'name avatar')
        .populate('assignedTo', 'name avatar')
        .populate({
          path: 'taskId',
          select: 'title projectId',
          populate: { path: 'projectId', select: 'name' },
        })
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
      Task.find(
        tf({
          requiresApproval: true,
          approvalStatus: 'pending',
          $or: [{ assignee: userId }, { createdBy: userId }],
        }),
      )
        .populate('projectId', 'name')
        .populate('assignee', 'name avatar')
        .limit(12)
        .lean(),
      ActivityLog.find(
        tf({
          $or: [{ actor: userId }, { mentions: userId }],
        }),
      )
        .populate('actor', 'name avatar')
        .populate('projectId', 'name')
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
      Notification.find(tf({ userId })).sort({ createdAt: -1 }).limit(10).lean(),
    ])

    const today = []
    const overdue = []
    const next = []
    const unscheduled = []
    const personal = []
    const priorities = []

    for (const t of openTasks) {
      if (t.isPersonal) personal.push(t)
      if (t.priority === 'urgent' || t.priority === 'high') priorities.push(t)

      if (!t.dueDate) {
        unscheduled.push(t)
        continue
      }
      const due = new Date(t.dueDate)
      if (due >= todayStart && due <= todayEnd) today.push(t)
      else if (due < todayStart) overdue.push(t)
      else next.push(t)
    }

    const agenda = [...today, ...overdue, ...next]
      .filter((t) => t.dueDate)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))

    res.json({
      success: true,
      data: {
        greeting: getGreeting(req.user.name),
        tasks: {
          today,
          upcoming: next,
          overdue,
          next,
          unscheduled,
          assigned: openTasks.filter((t) => !t.isPersonal),
          done,
          delegated,
          personal,
          priorities: priorities.slice(0, 30),
        },
        agenda,
        assignedComments,
        recents: openTasks.slice(0, 8),
        approvals,
        activity,
        mentions: activity.filter((a) =>
          (a.mentions || []).some(
            (m) => String(m) === String(userId) || String(m?._id) === String(userId),
          ),
        ),
        notifications,
      },
    })
  }),
)

router.patch(
  '/tasks/:id/toggle',
  requireAuth,
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id)
    assertTenantDoc(task, req, 'Task')

    const uid = String(req.user._id)
    const assigneeId = task.assignee ? String(task.assignee) : ''
    const creatorId = task.createdBy ? String(task.createdBy) : ''
    const isMine =
      assigneeId === uid ||
      creatorId === uid ||
      (task.isPersonal && (assigneeId === uid || creatorId === uid))
    const isElevated = ['admin', 'owner', 'project_manager'].includes(req.user.role)
    if (!isMine && !isElevated && !req.user.isPlatformAdmin) {
      throw new AppError('You can only update tasks assigned to you', 403)
    }

    const order = ['todo', 'in_progress', 'review', 'done']
    const progressMap = { todo: 0, in_progress: 40, review: 80, done: 100 }
    const labels = {
      todo: 'Not started',
      in_progress: 'Working on it',
      review: 'Needs check',
      done: 'Finished',
    }
    const current = order.includes(task.status) ? task.status : 'todo'
    const next = order[(order.indexOf(current) + 1) % order.length]
    const prev = current

    const hadTimerRunning = !!task.timeTrackingStartedAt
    task.status = next
    task.progress = progressMap[next] ?? 0
    await applyStatusAutoTimer(task, {
      previousStatus: prev,
      nextStatus: next,
      userId: req.user._id,
      Task,
      tenantFilter: (extra) => tenantFilter(req, extra),
    })
    await task.save()

    const timerRunning = !!task.timeTrackingStartedAt
    if (hadTimerRunning !== timerRunning || timerRunning) {
      emitTimerUpdated(req, req.user._id, {
        taskId: String(task._id),
        running: timerRunning,
        status: task.status,
      })
    }

    await ActivityLog.create(
      withTenant(req, {
        projectId: task.projectId,
        actor: req.user._id,
        type: 'task_toggled',
        message: `Moved “${task.title}” from ${labels[prev]} to ${labels[next]}`,
        meta: {
          field: 'status',
          from: labels[prev],
          to: labels[next],
          fromValue: prev,
          toValue: next,
        },
      }),
    )

    res.json({ success: true, task, from: prev, to: next })
  }),
)

function getGreeting(name) {
  const hour = new Date().getHours()
  const first = (name || '').split(' ')[0] || 'there'
  if (hour < 12) return `Good morning, ${first}`
  if (hour < 17) return `Good afternoon, ${first}`
  return `Good evening, ${first}`
}

export default router
