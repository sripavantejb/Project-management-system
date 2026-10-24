import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subject: { type: String, default: '' },
    body: { type: String, required: true },
    readAt: { type: Date, default: null },
    clearedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    laterBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
)

messageSchema.index({ from: 1, to: 1, createdAt: -1 })
messageSchema.index({ tenantId: 1, from: 1, createdAt: -1 })
messageSchema.index({ tenantId: 1, to: 1, createdAt: -1 })
messageSchema.index({ tenantId: 1, to: 1, readAt: 1 })

export const Message = mongoose.model('Message', messageSchema)
