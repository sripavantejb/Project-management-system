import mongoose from 'mongoose'
import { approvalProgressFields } from './Approval.js'

const checklistSchema = new mongoose.Schema(
  {
    text: String,
    done: { type: Boolean, default: false },
  },
  { _id: true },
)

const taskSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: function requiredProject() {
        return !this.isPersonal
      },
      index: true,
    },
    isPersonal: { type: Boolean, default: false, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    stage: {
      type: String,
      enum: ['design', 'planning', 'procurement', 'execution', 'handover'],
      default: 'design',
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'review', 'done'],
      default: 'todo',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date,
    startDate: Date,
    location: { type: String, default: '' },
    videoLink: { type: String, default: '' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    checklist: [checklistSchema],
    attachments: [{ url: String, name: String, mime: String }],
    requiresApproval: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalRule: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRule', default: null },
    ...approvalProgressFields,
    dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    isMilestone: { type: Boolean, default: false },
    tags: [{ type: String }],
    timeEstimate: { type: Number, default: null }, // minutes
    /** Accumulated tracked seconds (stopped segments). */
    timeSpent: { type: Number, default: 0 },
    /** When set, timer is running from this timestamp. */
    timeTrackingStartedAt: { type: Date, default: null },
    /** Who started the running timer (for top-bar indicator). */
    timeTrackingUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
)

export const Task = mongoose.model('Task', taskSchema)
