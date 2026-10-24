/**
 * Auto time-tracking tied to task status:
 * - Entering `in_progress` starts the timer for the acting user
 * - Leaving `in_progress` (next step / done) stops and accumulates seconds
 *
 * Live focus bar (client WorkStatusBar) refreshes via `timer:updated`
 * pushed to that user's socket room — backend is source of truth.
 */

/** Push a quiet refresh so the global work strip updates on every screen. */
export function emitTimerUpdated(req, userId, payload = {}) {
  if (!userId) return
  const io = req?.app?.get?.('io')
  if (!io) return
  io.to(`user:${String(userId)}`).emit('timer:updated', {
    at: new Date().toISOString(),
    ...payload,
  })
}

export function accumulateRunningTimer(task, now = Date.now()) {
  if (!task?.timeTrackingStartedAt) return
  const started = new Date(task.timeTrackingStartedAt).getTime()
  if (!Number.isFinite(started)) return
  const base = Number(task.timeSpent) || 0
  task.timeSpent = base + Math.max(0, Math.floor((now - started) / 1000))
  task.timeTrackingStartedAt = null
  task.timeTrackingUserId = null
}

/** Stop every other running timer for this user (one active timer at a time). */
export async function stopOtherTimersForUser({
  Task,
  tenantFilter,
  userId,
  exceptTaskId,
  now = Date.now(),
}) {
  const others = await Task.find(
    tenantFilter({
      _id: { $ne: exceptTaskId },
      timeTrackingUserId: userId,
      timeTrackingStartedAt: { $ne: null },
    }),
  )
  for (const other of others) {
    accumulateRunningTimer(other, now)
    await other.save()
  }
}

/**
 * Apply start/stop based on status transition.
 * Returns { started, stopped } for activity logging if needed.
 */
export async function applyStatusAutoTimer(task, {
  previousStatus,
  nextStatus,
  userId,
  Task,
  tenantFilter,
  now = Date.now(),
}) {
  const prev = previousStatus || 'todo'
  const next = nextStatus || task.status
  let started = false
  let stopped = false

  if (prev === 'in_progress' && next !== 'in_progress') {
    if (task.timeTrackingStartedAt) {
      accumulateRunningTimer(task, now)
      stopped = true
    }
  }

  if (next === 'in_progress' && prev !== 'in_progress') {
    await stopOtherTimersForUser({
      Task,
      tenantFilter,
      userId,
      exceptTaskId: task._id,
      now,
    })
    if (!task.timeTrackingStartedAt) {
      task.timeTrackingStartedAt = new Date(now)
      task.timeTrackingUserId = userId
      started = true
    }
  }

  return { started, stopped }
}
