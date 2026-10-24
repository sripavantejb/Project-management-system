import express from 'express'
import { Attendance } from '../models/Attendance.js'
import { User } from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { tenantFilter } from '../middleware/tenant.js'

const router = express.Router()

const NON_STAFF = new Set(['client', 'vendor'])

function isStaff(user) {
  return !!user && !NON_STAFF.has(user.role)
}

function canReviewTeam(user) {
  return !!(user?.isPlatformAdmin || ['admin', 'owner', 'hr'].includes(user?.role))
}

/** Studio days are counted in India, not the server's UTC clock. */
export function workDateInIndia(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function assertStaff(user) {
  if (!isStaff(user)) throw new AppError('Attendance is for studio staff', 403)
}

function readPin(body) {
  const latitude = Number(body?.latitude)
  const longitude = Number(body?.longitude)
  const accuracy = body?.accuracy == null || body?.accuracy === '' ? null : Number(body.accuracy)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new AppError('Turn on location, then punch again', 400)
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new AppError('Turn on location, then punch again', 400)
  }
  if (accuracy != null && !Number.isFinite(accuracy)) {
    throw new AppError('Turn on location, then punch again', 400)
  }
  return {
    at: new Date(),
    latitude,
    longitude,
    accuracy: accuracy == null ? null : Math.round(accuracy),
  }
}

function presentUser(user) {
  if (!user || typeof user !== 'object' || !user._id) return null
  return {
    id: String(user._id),
    name: user.name || '',
    email: user.email || '',
    role: user.role || '',
    avatar: user.avatar || '',
    title: user.title || '',
  }
}

function presentRecord(doc) {
  if (!doc) return null
  return {
    id: String(doc._id),
    workDate: doc.workDate,
    punchIn: doc.punchIn || null,
    punchOut: doc.punchOut || null,
    user: presentUser(doc.userId),
  }
}

router.get(
  '/attendance/today',
  requireAuth,
  asyncHandler(async (req, res) => {
    const eligible = isStaff(req.user)
    const workDate = workDateInIndia()
    const record = eligible
      ? await Attendance.findOne(tenantFilter(req, { userId: req.user._id, workDate })).lean()
      : null
    res.json({
      success: true,
      eligible,
      canReview: canReviewTeam(req.user),
      workDate,
      record: presentRecord(record),
    })
  }),
)

router.post(
  '/attendance/punch-in',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertStaff(req.user)
    const workDate = workDateInIndia()
    const existing = await Attendance.findOne(
      tenantFilter(req, { userId: req.user._id, workDate }),
    )
    if (existing?.punchIn) throw new AppError('You have already punched in today', 409)

    const punchIn = readPin(req.body)
    let record = existing
    if (record) {
      record.punchIn = punchIn
      await record.save()
    } else {
      try {
        record = await Attendance.create({
          tenantId: req.tenantId,
          userId: req.user._id,
          workDate,
          punchIn,
        })
      } catch (err) {
        if (err?.code === 11000) throw new AppError('You have already punched in today', 409)
        throw err
      }
    }

    res.status(201).json({ success: true, record: presentRecord(record.toObject()) })
  }),
)

router.post(
  '/attendance/punch-out',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertStaff(req.user)
    const workDate = workDateInIndia()
    const record = await Attendance.findOne(
      tenantFilter(req, { userId: req.user._id, workDate }),
    )
    if (!record?.punchIn) throw new AppError('Punch in before you punch out', 400)
    if (record.punchOut) throw new AppError('You have already punched out today', 409)

    record.punchOut = readPin(req.body)
    await record.save()
    res.json({ success: true, record: presentRecord(record.toObject()) })
  }),
)

router.get(
  '/attendance/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertStaff(req.user)
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 14))
    const records = await Attendance.find(tenantFilter(req, { userId: req.user._id }))
      .sort({ workDate: -1 })
      .limit(limit)
      .lean()
    res.json({ success: true, records: records.map(presentRecord) })
  }),
)

router.get(
  '/attendance/team',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!canReviewTeam(req.user)) throw new AppError('Insufficient permissions', 403)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ''))
      ? String(req.query.date)
      : workDateInIndia()

    const [records, staff] = await Promise.all([
      Attendance.find(tenantFilter(req, { workDate: date })).lean(),
      User.find({
        tenantId: req.tenantId,
        isActive: true,
        role: { $nin: ['client', 'vendor'] },
      })
        .select('name email role avatar title')
        .lean(),
    ])

    const byUser = new Map(records.map((row) => [String(row.userId), row]))
    const people = staff
      .map((user) => {
        const row = byUser.get(String(user._id))
        return {
          user: presentUser(user),
          record: row
            ? { id: String(row._id), workDate: row.workDate, punchIn: row.punchIn || null, punchOut: row.punchOut || null }
            : null,
        }
      })
      .sort((a, b) => {
        const rank = (person) => {
          if (person.record?.punchIn && !person.record?.punchOut) return 0
          if (person.record?.punchOut) return 1
          return 2
        }
        const diff = rank(a) - rank(b)
        if (diff) return diff
        return (a.user?.name || '').localeCompare(b.user?.name || '')
      })

    res.json({ success: true, date, people })
  }),
)

export default router
