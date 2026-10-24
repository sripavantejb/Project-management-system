import express from 'express'
import mongoose from 'mongoose'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { tenantFilter, withTenant, assertTenantDoc } from '../middleware/tenant.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { notifyUser, actorSummary } from '../lib/notify.js'

const router = express.Router()

const CONVERSATION_LIMIT = 200
const THREAD_LIMIT = 60

/** Company directory — everyone you can mail */
router.get(
  '/mail/directory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const users = await User.find(
      tenantFilter(req, {
        isActive: true,
        isPlatformAdmin: { $ne: true },
        _id: { $ne: req.user._id },
      }),
    )
      .select('name email avatar role title company')
      .sort({ name: 1 })
      .lean()

    res.json({ success: true, users })
  }),
)

/** Inbox threads — last message per person, unread counts, no full history scan */
router.get(
  '/mail/threads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user._id
    const tenantId = req.tenantId

    const rows = await Message.aggregate([
      {
        $match: {
          tenantId,
          clearedBy: { $ne: me },
          $or: [{ from: me }, { to: me }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$from', me] }, '$to', '$from'],
          },
          lastMessage: { $first: '$$ROOT' },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$to', me] },
                    { $eq: [{ $ifNull: ['$readAt', null] }, null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: THREAD_LIMIT },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDocs',
        },
      },
      { $unwind: '$userDocs' },
      {
        $project: {
          unread: 1,
          lastMessage: 1,
          user: {
            _id: '$userDocs._id',
            name: '$userDocs.name',
            avatar: '$userDocs.avatar',
            email: '$userDocs.email',
            role: '$userDocs.role',
            title: '$userDocs.title',
          },
        },
      },
    ])

    const threads = rows.map((row) => {
      const m = row.lastMessage
      const fromMe = String(m.from) === String(me)
      return {
        user: row.user,
        unread: row.unread,
        lastMessage: {
          _id: m._id,
          body: m.body,
          subject: m.subject || '',
          createdAt: m.createdAt,
          readAt: m.readAt,
          from: fromMe
            ? { _id: me, name: req.user.name, avatar: req.user.avatar }
            : row.user,
          to: fromMe
            ? row.user
            : { _id: me, name: req.user.name, avatar: req.user.avatar },
        },
      }
    })

    res.json({ success: true, threads })
  }),
)

/** Conversation with one person — newest window only */
router.get(
  '/mail/with/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user._id
    const otherId = req.params.userId
    if (!mongoose.isValidObjectId(otherId)) throw new AppError('User not found', 404)

    const [other, messages] = await Promise.all([
      User.findById(otherId).select('name email avatar role title company tenantId').lean(),
      Message.find(
        tenantFilter(req, {
          $or: [
            { from: me, to: otherId },
            { from: otherId, to: me },
          ],
          clearedBy: { $ne: me },
        }),
      )
        .populate('from', 'name avatar')
        .populate('to', 'name avatar')
        .sort({ createdAt: -1 })
        .limit(CONVERSATION_LIMIT)
        .lean(),
    ])
    assertTenantDoc(other, req, 'User')

    // Chronological for the client; mark read without blocking the response.
    messages.reverse()
    void Message.updateMany(
      tenantFilter(req, { from: otherId, to: me, readAt: null }),
      { readAt: new Date() },
    ).catch(() => {})

    res.json({ success: true, other, messages })
  }),
)

/** Send company mail — reply first, notify in the background */
router.post(
  '/mail',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { to, body, subject } = req.body
    if (!to || !body?.trim()) throw new AppError('Recipient and message required')

    const recipient = await User.findById(to).select('name email avatar role title tenantId').lean()
    assertTenantDoc(recipient, req, 'Recipient')

    const message = await Message.create(
      withTenant(req, {
        from: req.user._id,
        to,
        subject: subject || '',
        body: body.trim(),
      }),
    )

    await message.populate('from', 'name avatar email')
    await message.populate('to', 'name avatar email')

    const io = req.app.get('io')
    if (io) {
      io.to(`user:${to}`).emit('mail:new', {
        message,
        from: req.user.toSafeJSON?.() || { name: req.user.name },
      })
    }

    res.status(201).json({ success: true, message })

    void notifyUser(req, {
      userId: to,
      type: 'mail',
      title: `${req.user.name} sent you a message`,
      body: body.trim().slice(0, 200),
      link: `/inbox?tab=mail&with=${req.user._id}`,
      meta: {
        subject: subject || '',
        actor: actorSummary(req.user),
      },
    }).catch((err) => console.error('[mail] notify failed', err?.message || err))
  }),
)

/** Mark later / clear */
router.patch(
  '/mail/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.id)
    assertTenantDoc(message, req, 'Message')

    const me = req.user._id
    if (
      String(message.from) !== String(me) &&
      String(message.to) !== String(me)
    ) {
      throw new AppError('Forbidden', 403)
    }

    if (req.body.later) {
      if (!message.laterBy.some((id) => String(id) === String(me))) {
        message.laterBy.push(me)
      }
    }
    if (req.body.clear) {
      if (!message.clearedBy.some((id) => String(id) === String(me))) {
        message.clearedBy.push(me)
      }
    }
    if (req.body.read) {
      if (String(message.to) === String(me)) message.readAt = new Date()
    }

    await message.save()
    res.json({ success: true, message })
  }),
)

export default router
