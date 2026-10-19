import mongoose from 'mongoose'
import { approvalProgressFields } from './Approval.js'

const leadSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    clientName: { type: String, required: true },
    contactName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    source: { type: String, default: 'Website' },
    estimatedValue: { type: Number, default: 0 },
    stage: {
      type: String,
      enum: [
        'new_enquiry',
        'site_visit',
        'mood_board',
        'quotation_sent',
        'negotiation',
        'hot',
        'dead',
        // legacy aliases (normalized on write)
        'won',
        'lost',
      ],
      default: 'new_enquiry',
    },
    nextFollowUp: Date,
    notes: { type: String, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    convertedProjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  },
  { timestamps: true },
)

export const Lead = mongoose.model('Lead', leadSchema)

const boqItemSchema = new mongoose.Schema(
  {
    description: String,
    unit: { type: String, default: 'nos' },
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    room: { type: String, default: 'General' },
    image: { type: String, default: '' },
    /** Free-text line remarks (site note / alternate / client comment) */
    remarks: { type: String, default: '' },
    category: { type: String, default: '' },
    measureNo: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    /** Source hierarchy from the Cubic quotation template (group › section › item) */
    slNo: { type: String, default: '' },
    group: { type: String, default: '' },
    section: { type: String, default: '' },
    sectionNo: { type: String, default: '' },
    unitLabel: { type: String, default: '' },
    note: { type: String, default: '' },
    sortIndex: { type: Number, default: 0 },
    /** Material specification (plywood master template) */
    materialFamily: { type: String, default: '' },
    materialName: { type: String, default: '' },
    grade: { type: String, default: '' },
    thickness: { type: String, default: '' },
    brand: { type: String, default: '' },
    dimensions: { type: String, default: '' },
  },
  { _id: true },
)

const quotationAttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    url: { type: String, required: true },
    mime: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

/**
 * Letterhead fields printed on the quotation. They default from the tenant and
 * the project but stay editable per quote — the client logo and address on a
 * commercial estimate rarely match what is stored on the project record.
 */
const quotationDocMetaSchema = new mongoose.Schema(
  {
    customerName: { type: String, default: '' },
    clientAddress: { type: String, default: '' },
    clientLogo: { type: String, default: '' },
    companyLogo: { type: String, default: '' },
    companyAddress: { type: String, default: '' },
    companyPhone: { type: String, default: '' },
    quoteNo: { type: String, default: '' },
    quoteDate: { type: String, default: '' },
    architect: { type: String, default: '' },
    emailId: { type: String, default: '' },
    contactNo: { type: String, default: '' },
    buyerGstin: { type: String, default: '' },
    buyerStateName: { type: String, default: '' },
    buyerStateCode: { type: String, default: '' },
  },
  { _id: false },
)

/**
 * Commercial take-off: one row per space measured, grouped under the work item
 * whose total feeds a BOQ line.
 */
const measurementRowSchema = new mongoose.Schema(
  {
    space: { type: String, default: '' },
    unit: { type: String, default: 'sft' },
    nos: { type: Number, default: 0 },
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },
  },
  { _id: false },
)

const measurementItemSchema = new mongoose.Schema(
  {
    group: { type: String, default: '' },
    sectionNo: { type: String, default: '' },
    sectionName: { type: String, default: '' },
    no: { type: String, default: '' },
    name: { type: String, default: '' },
    unit: { type: String, default: 'sft' },
    rows: [measurementRowSchema],
    /** Set when the sheet carries a figure its own rows do not add up to */
    overrideTotal: { type: Number, default: null },
    boqTotal: { type: Number, default: null },
    boqTotalLabel: { type: String, default: '' },
    boqRef: {
      index: { type: Number, default: -1 },
      slNo: { type: String, default: '' },
      section: { type: String, default: '' },
      label: { type: String, default: '' },
    },
  },
  { _id: false },
)

const quotationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    title: { type: String, required: true },
    versionLabel: { type: String, default: 'Standard' },
    /** residential = BWR IS 303 · commercial = BWP 710 */
    boqType: {
      type: String,
      enum: ['residential', 'commercial', 'general'],
      default: 'general',
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'viewed', 'approved', 'rejected'],
      default: 'draft',
    },
    items: [boqItemSchema],
    /** Spaces this office has — drives which measurement rows are seeded */
    spaces: [{ type: String }],
    measurements: [measurementItemSchema],
    docMeta: { type: quotationDocMetaSchema, default: () => ({}) },
    attachments: [quotationAttachmentSchema],
    subtotal: { type: Number, default: 0 },
    /** Design & handling charges levied on the subtotal before GST (Cubic templates use 8%) */
    chargesPercent: { type: Number, default: 0 },
    chargesLabel: { type: String, default: '' },
    gstPercent: { type: Number, default: 18 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: Date,
    viewedAt: Date,
    approvedAt: Date,
    /* Internal sign-off routing, distinct from the client-facing `status`. */
    approvalStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalRule: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRule', default: null },
    ...approvalProgressFields,
  },
  { timestamps: true },
)

export const Quotation = mongoose.model('Quotation', quotationSchema)

const fileVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    url: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const fileSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    folder: {
      type: String,
      enum: ['concepts', 'drawings', 'renders', 'approvals', 'site_photos'],
      default: 'concepts',
    },
    name: { type: String, required: true },
    mime: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'sent', 'approved', 'rejected'],
      default: 'draft',
    },
    /** pending | approved | rejected | none — sign-off lifecycle separate from folder status */
    approvalStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    approvalType: { type: String, default: 'drawing' },
    approvalRule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApprovalRule',
      default: null,
    },
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    requestedAt: Date,
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decidedAt: Date,
    approvalNote: { type: String, default: '' },
    decisionNote: { type: String, default: '' },
    ...approvalProgressFields,
    clientVisible: { type: Boolean, default: false },
    versions: [fileVersionSchema],
    currentVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
)

export const ProjectFile = mongoose.model('ProjectFile', fileSchema)
