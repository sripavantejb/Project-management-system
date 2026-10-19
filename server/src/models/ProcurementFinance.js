import mongoose from 'mongoose'
import { approvalProgressFields } from './Approval.js'

const vendorSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    name: { type: String, required: true },
    contact: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    gst: { type: String, default: '', trim: true, uppercase: true },
    categories: [{ type: String }],
    rating: { type: Number, default: 4, min: 1, max: 5 },
    paymentTerms: { type: String, default: 'Net 30' },
  },
  { timestamps: true },
)

export const Vendor = mongoose.model('Vendor', vendorSchema)

const purchaseOrderSchema = new mongoose.Schema(
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
    poNumber: { type: String, required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    items: [
      {
        description: String,
        qty: Number,
        rate: Number,
        amount: Number,
        boqItemId: mongoose.Schema.Types.ObjectId,
      },
    ],
    value: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'approved', 'ordered', 'in_transit', 'delivered'],
      default: 'draft',
    },
    /** Set when the PO came from a won RFQ, so the trail back to the
     *  comparison that justified this vendor stays intact. */
    rfq: { type: mongoose.Schema.Types.ObjectId, ref: 'Rfq' },
    /** Charges carried over from the awarded quote */
    gstPercent: { type: Number, default: 18 },
    freight: { type: Number, default: 0 },
    loading: { type: Number, default: 0 },
    installation: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    deliveryDate: Date,
    deliveryLocation: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    /** Proforma the vendor raises against this PO, before the tax invoice */
    proforma: {
      number: { type: String, default: '' },
      date: Date,
      amount: { type: Number, default: 0 },
      fileUrl: { type: String, default: '' },
      receivedAt: Date,
    },
    sentAt: Date,
    sentVia: { type: String, enum: ['whatsapp', 'email', 'manual', ''], default: '' },
    deliveryPhotos: [{ url: String, name: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /* Approval routing — set from the workspace's rules when the PO is raised. */
    approvalStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalRule: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRule', default: null },
    approvedAt: { type: Date, default: null },
    ...approvalProgressFields,
  },
  { timestamps: true },
)

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema)

/* ── RFQ: ask several vendors to price the same list ──────────────────────
 * Sits between an approved BOQ and a purchase order. One RFQ carries the item
 * list once and a quote per vendor, so the rates can be compared side by side
 * before any one vendor is awarded the work.
 */
const rfqVendorSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    sentAt: Date,
    sentVia: { type: String, enum: ['whatsapp', 'email', 'manual', ''], default: '' },
    status: {
      type: String,
      enum: ['pending', 'sent', 'quoted', 'declined'],
      default: 'pending',
    },
    /** Vendor's price for each RFQ line, in the same order as items[] */
    rates: [{ type: Number }],
    /** Charges quoted on top of the line rates */
    gstPercent: { type: Number, default: 18 },
    freight: { type: Number, default: 0 },
    loading: { type: Number, default: 0 },
    installation: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    /** Final landed cost — what the comparison actually ranks on */
    landedCost: { type: Number, default: 0 },
    validUntil: Date,
    remarks: { type: String, default: '' },
    quotedAt: Date,
  },
  { _id: true },
)

const rfqSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    rfqNumber: { type: String, required: true },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
    items: [
      {
        description: String,
        unit: { type: String, default: 'nos' },
        qty: { type: Number, default: 0 },
        /** BOQ rate, kept as the benchmark to compare vendor rates against */
        boqRate: { type: Number, default: 0 },
        boqItemId: mongoose.Schema.Types.ObjectId,
      },
    ],
    vendors: [rfqVendorSchema],
    closingDate: Date,
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'sent', 'comparing', 'awarded', 'cancelled'],
      default: 'draft',
    },
    awardedVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    awardReason: { type: String, default: '' },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

export const Rfq = mongoose.model('Rfq', rfqSchema)


const expenseSchema = new mongoose.Schema(
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
    amount: { type: Number, required: true },
    category: { type: String, default: 'Materials' },
    note: { type: String, default: '' },
    receiptUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /* Who it was routed to; `approvedBy` records who actually actioned it. */
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalRule: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRule', default: null },
    approvalStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    ...approvalProgressFields,
  },
  { timestamps: true },
)

export const Expense = mongoose.model('Expense', expenseSchema)

const paymentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['due', 'paid', 'pending'],
      default: 'pending',
    },
    dueDate: Date,
    paidAt: Date,
    note: String,
  },
  { timestamps: true },
)

export const Payment = mongoose.model('Payment', paymentSchema)

const siteUpdateSchema = new mongoose.Schema(
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
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '' },
    photos: [{ url: String }],
    stage: String,
    progress: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export const SiteUpdate = mongoose.model('SiteUpdate', siteUpdateSchema)

const snagSchema = new mongoose.Schema(
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
    title: { type: String, required: true },
    photo: { type: String, default: '' },
    afterPhoto: { type: String, default: '' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['open', 'fixed', 'verified'],
      default: 'open',
    },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  },
  { timestamps: true },
)

export const Snag = mongoose.model('Snag', snagSchema)
