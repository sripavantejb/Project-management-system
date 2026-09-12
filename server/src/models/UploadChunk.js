import mongoose from 'mongoose'

/**
 * Temporary holding pen for one piece of a large file while the client sends
 * it across several requests (each kept under Vercel's ~4.5MB serverless
 * body limit). `chunk/finish` reassembles these in order and deletes them.
 * The TTL index cleans up anything an abandoned upload leaves behind.
 */
const uploadChunkSchema = new mongoose.Schema({
  uploadId: { type: String, required: true, index: true },
  index: { type: Number, required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now, expires: 7200 }, // 2h
})

uploadChunkSchema.index({ uploadId: 1, index: 1 }, { unique: true })

export const UploadChunk = mongoose.model('UploadChunk', uploadChunkSchema)
