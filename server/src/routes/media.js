import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import {
  storeFileBuffer,
  findMediaFile,
  openMediaDownload,
} from '../lib/mediaStore.js'
import { upload } from '../middleware/upload.js'
import { withChunkedUpload } from '../middleware/chunkedUpload.js'
import { UploadChunk } from '../models/UploadChunk.js'

const router = express.Router()

/**
 * Large-file support, MongoDB-only: the client slices anything over a few MB
 * (see client/src/lib/api.js) and sends each slice here — well under
 * Vercel's ~4.5MB serverless request-body limit, which no server-side config
 * can raise. `chunk/finish` reassembles them and hands back a `pendingId`
 * that any upload route can redeem via middleware/chunkedUpload.js.
 */
router.post(
  '/chunk',
  requireAuth,
  upload.single('chunk'),
  asyncHandler(async (req, res) => {
    const { uploadId, index } = req.body
    if (!uploadId || index == null) throw new AppError('uploadId and index are required', 400)
    if (!req.file) throw new AppError('chunk is required', 400)

    const tenantId = req.tenantId || req.user.tenantId
    // Opportunistic sweep of whatever an earlier abandoned upload left behind.
    await UploadChunk.deleteMany({
      tenantId,
      createdAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    })

    await UploadChunk.findOneAndUpdate(
      { uploadId: String(uploadId), index: Number(index) },
      { uploadId: String(uploadId), index: Number(index), tenantId, data: req.file.buffer, createdAt: new Date() },
      { upsert: true },
    )

    res.status(201).json({ success: true })
  }),
)

router.post(
  '/chunk/finish',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { uploadId, filename, mimeType, total } = req.body
    if (!uploadId || !total) throw new AppError('uploadId and total are required', 400)

    const tenantId = req.tenantId || req.user.tenantId
    const chunks = await UploadChunk.find({ uploadId: String(uploadId), tenantId })
      .sort({ index: 1 })
      .lean()
    if (chunks.length !== Number(total)) {
      throw new AppError(
        `Upload incomplete: expected ${total} chunks, received ${chunks.length}`,
        400,
      )
    }

    // NOT `c.data.buffer` — that's the raw underlying ArrayBuffer, which for a
    // BSON-deserialized view can be a much larger shared buffer with a
    // nonzero byteOffset. Buffer.from(view) correctly copies just this
    // chunk's own bytes.
    const buffer = Buffer.concat(
      chunks.map((c) => (Buffer.isBuffer(c.data) ? c.data : Buffer.from(c.data))),
    )
    const saved = await storeFileBuffer(
      {
        buffer,
        originalname: filename || 'file',
        mimetype: mimeType || 'application/octet-stream',
        size: buffer.length,
      },
      { tenantId, uploadedBy: req.user._id, kind: 'pending' },
    )

    await UploadChunk.deleteMany({ uploadId: String(uploadId), tenantId })
    res.status(201).json({ success: true, pendingId: saved.id })
  }),
)

/**
 * Authenticated upload → MongoDB GridFS → instant /api/media/:id link.
 * Field name: `file`
 */
router.post(
  '/',
  requireAuth,
  ...withChunkedUpload('file', upload.single('file')),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('File is required', 400)

    const imagesOnly = req.query.imagesOnly === '1' || req.query.images === '1'
    if (imagesOnly && !String(req.file.mimetype || '').startsWith('image/')) {
      throw new AppError('Only image files are allowed', 400)
    }

    const saved = await storeFileBuffer(req.file, {
      tenantId: req.tenantId || req.user.tenantId,
      uploadedBy: req.user._id,
      kind: imagesOnly ? 'image' : 'file',
    })

    res.status(201).json({
      success: true,
      ...saved,
      // Alias used by many UI call sites
      fileUrl: saved.url,
      logoUrl: saved.url,
    })
  }),
)

/**
 * Public (obscure ObjectId) — so <img src> / PDF viewers work without Bearer tokens.
 * Cache aggressively; files are immutable once stored.
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await findMediaFile(req.params.id)
    if (!file) throw new AppError('File not found', 404)

    const mime =
      file.contentType ||
      file.metadata?.mimeType ||
      'application/octet-stream'
    const name = file.filename || file.metadata?.originalName || 'file'

    res.setHeader('Content-Type', mime)
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(name)}"`,
    )
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (file.length != null) res.setHeader('Content-Length', String(file.length))

    const stream = openMediaDownload(req.params.id)
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end()
      else res.end()
    })
    stream.pipe(res)
  }),
)

export default router
