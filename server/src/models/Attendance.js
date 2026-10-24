import mongoose from 'mongoose'

const pinSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number, default: null },
  },
  { _id: false },
)

const attendanceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Calendar day in Asia/Kolkata, YYYY-MM-DD. One row per person per day. */
    workDate: { type: String, required: true },
    punchIn: { type: pinSchema, default: null },
    punchOut: { type: pinSchema, default: null },
  },
  { timestamps: true },
)

attendanceSchema.index({ tenantId: 1, userId: 1, workDate: 1 }, { unique: true })
attendanceSchema.index({ tenantId: 1, workDate: 1 })

export const Attendance = mongoose.model('Attendance', attendanceSchema)
