import { asyncHandler, AppError } from './errorHandler.js'
import { findMediaFile, openMediaDownload, deleteMediaFile } from '../lib/mediaStore.js'

/**
 * Drop-in companion for `upload.single(fieldName)`: runs multer as usual,
 * then — only when the client sent `<fieldName>PendingId` instead of the raw
 * file — resolves that id (stashed in GridFS by POST /media/chunk/finish)
 * into a `req.file` multer would have produced itself, so the route's own
 * business logic never has to know the file arrived in chunks.
 *
 * Existing small-file uploads are completely unaffected: no pending id means
 * this just calls next() once multer has done its normal parsing.
 */
export function withChunkedUpload(fieldName, multerSingle) {
  return [
    multerSingle,
    asyncHandler(async (req, res, next) => {
      const pendingId = req.body?.[`${fieldName}PendingId`]
      if (!pendingId || req.file) return next()

      const tenantId = req.tenantId || req.user?.tenantId
      const file = await findMediaFile(pendingId)
      if (
        !file ||
        file.metadata?.kind !== 'pending' ||
        String(file.metadata?.tenantId) !== String(tenantId)
      ) {
        throw new AppError('Upload session not found or expired — please retry the upload', 400)
      }

      const chunks = []
      await new Promise((resolve, reject) => {
        const stream = openMediaDownload(pendingId)
        stream.on('data', (c) => chunks.push(c))
        stream.on('end', resolve)
        stream.on('error', reject)
      })

      req.file = {
        buffer: Buffer.concat(chunks),
        originalname: file.metadata?.originalName || file.filename,
        mimetype: file.metadata?.mimeType || 'application/octet-stream',
        size: file.length,
      }

      await deleteMediaFile(pendingId)
      next()
    }),
  ]
}
