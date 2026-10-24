import mongoose from 'mongoose'

export const PROJECT_STAGES = [
  'design',
  'planning',
  'procurement',
  'execution',
  'handover',
]

export const PROJECT_STATUSES = [
  'not_started',
  'in_progress',
  'on_hold',
  'completed',
  'delayed',
]

export const PROJECT_TYPES = [
  'residential',
  'commercial',
  'renovation',
  'custom',
  'blank', // legacy alias of custom
]

const stageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PROJECT_STAGES, required: true },
    label: { type: String, required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: 'not_started',
    },
  },
  { _id: false },
)

const meetingNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
    editedAt: Date,
  },
  { timestamps: true },
)

const projectSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    spaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Space',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    clientName: { type: String, required: true },
    clientPhone: { type: String, default: '', trim: true },
    clientEmail: { type: String, default: '', trim: true, lowercase: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: PROJECT_TYPES, default: 'residential' },
    status: { type: String, enum: PROJECT_STATUSES, default: 'not_started' },
    currentStage: { type: String, enum: PROJECT_STAGES, default: 'design' },
    stages: { type: [stageSchema], default: [] },
    coverImage: { type: String, default: '' },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    startDate: Date,
    endDate: Date,
    budget: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: String,
      },
    ],
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    isDelayed: { type: Boolean, default: false },
    meetingNotes: { type: [meetingNoteSchema], default: [] },
  },
  { timestamps: true },
)

export const Project = mongoose.model('Project', projectSchema)
