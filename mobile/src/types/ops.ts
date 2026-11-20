/** Types for the ops/company modules: leads, BOQ, procurement, finance, site feed, inventory. */

export type LeadStage =
  | 'new_enquiry'
  | 'site_visit'
  | 'quotation_sent'
  | 'negotiation'
  | 'mood_board'
  | 'hot'
  | 'dead'
  | 'won'
  | 'lost'

export interface LeadAttachment {
  _id?: string
  name: string
  url: string
  mime?: string
  size?: number
  createdAt?: string
}

export interface Lead {
  _id: string
  clientName: string
  contactName?: string
  email?: string
  phone?: string
  source?: string
  estimatedValue?: number
  stage: LeadStage
  nextFollowUp?: string | null
  notes?: string
  owner?: { _id: string; name: string; avatar?: string }
  convertedProjectId?: string
  attachments?: LeadAttachment[]
  createdAt: string
  updatedAt: string
}

export interface BoqItem {
  _id?: string
  description: string
  unit: string
  qty: number
  rate: number
  amount: number
  room?: string
  image?: string
  category?: string
  measureNo?: number
  width?: number
  height?: number
  /** Source hierarchy from the Cubic quotation template (group › section › item) */
  slNo?: string
  group?: string
  section?: string
  sectionNo?: string
  unitLabel?: string
  note?: string
  sortIndex?: number
}

export type BoqType = 'residential' | 'commercial' | 'general'

export type QuotationStatus = 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected'

export interface Quotation {
  _id: string
  projectId?:
    | { _id: string; name: string; clientName?: string; location?: string; type?: string }
    | string
  leadId?: { _id: string; clientName: string } | string
  title: string
  versionLabel?: string
  boqType?: BoqType
  status: QuotationStatus
  items: BoqItem[]
  subtotal: number
  chargesPercent?: number
  chargesLabel?: string
  gstPercent: number
  discount: number
  grandTotal: number
  /** Commercial take-off rows that feed BOQ quantities */
  measurements?: MeasurementQuotationItem[]
  spaces?: string[]
  createdBy?: { _id: string; name: string }
  createdAt: string
  updatedAt: string
}

export interface Vendor {
  _id: string
  name: string
  contact?: string
  email?: string
  phone?: string
  gst?: string
  categories?: string[]
  rating?: number
  paymentTerms?: string
  createdAt: string
}

export type POStatus = 'draft' | 'approved' | 'ordered' | 'in_transit' | 'delivered'

export interface PurchaseOrder {
  _id: string
  projectId?: { _id: string; name: string } | string
  poNumber: string
  vendor?: Vendor | string
  items: { description: string; qty: number; rate: number; amount: number }[]
  value: number
  status: POStatus
  createdBy?: { _id: string; name: string }
  createdAt: string
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'

export interface Expense {
  _id: string
  projectId?: { _id: string; name: string } | string
  amount: number
  category?: string
  note?: string
  receiptUrl?: string
  status: ExpenseStatus
  submittedBy?: { _id: string; name: string; avatar?: string }
  approvedBy?: { _id: string; name: string }
  createdAt: string
}

export interface Payment {
  _id: string
  projectId?: { _id: string; name: string } | string
  vendorId?: { _id: string; name: string } | string
  amount: number
  status: 'due' | 'paid' | 'pending'
  dueDate?: string
  paidAt?: string
  note?: string
}

export interface FinanceSummary {
  totalBudget: number
  totalSpent: number
  variance: number
  approvedExpenseCount: number
  pendingExpenseCount: number
  pendingAmount: number
  committedAmount: number
  pnl: {
    id: string
    name: string
    quoted: number
    recordedCosts: number
    approvedExpenses: number
    pendingExpenses: number
    committed: number
    costs: number
    profit: number
    margin: number | null
    health: 'no_budget' | 'over_budget' | 'on_track'
  }[]
}

export interface SiteUpdate {
  _id: string
  projectId?: { _id: string; name: string } | string
  author: { _id: string; name: string; avatar?: string }
  note: string
  photos: { url: string }[]
  stage?: string
  progress?: number
  createdAt: string
}

export type SnagStatus = 'open' | 'fixed' | 'verified'

export interface Snag {
  _id: string
  projectId: string
  title: string
  photo?: string
  afterPhoto?: string
  assignee?: { _id: string; name: string; avatar?: string }
  status: SnagStatus
  taskId?: string
  createdAt: string
}

export interface MeetingNote {
  _id: string
  text: string
  createdBy: string
  createdByName: string
  createdAt: string
  editedAt?: string
}

export interface InventoryItem {
  _id: string
  sku?: string
  name: string
  category: string
  unit: string
  quantity: number
  reorderLevel: number
  location?: string
  unitCost: number
  notes?: string
  isActive: boolean
}

export interface InventoryMovement {
  _id: string
  itemId: { _id: string; name: string; sku?: string; unit?: string } | string
  type: 'in' | 'out' | 'adjust'
  quantity: number
  balanceAfter: number
  note?: string
  projectId?: { _id: string; name: string }
  createdBy?: { _id: string; name: string }
  createdAt: string
}

export interface ReportsOverview {
  health: { total: number; delayed: number; onTimePct: number }
  budgetVariance: number
  crmPipelineValue: number
  leadStages: { stage: string; count: number }[]
  vendorPerformance: { totalPOs: number; delivered: number; inTransit: number }
  teamPerf: {
    user: { _id: string; name: string; avatar?: string; role: string }
    total: number
    done: number
    open: number
    overdue: number
    completionRate: number
    trackedHours: number
  }[]
  taskStatus: { status: string; count: number }[]
  projectHealth: {
    _id: string
    name: string
    status: string
    isDelayed: boolean
    budget: number
    spent: number
    totalTasks: number
    done: number
    overdue: number
    progress: number
  }[]
  taskCompletion: { done: number; total: number; overdue: number; unassigned: number }
}

export interface CompanyAdminDashboard {
  range: string
  kpis: {
    totalProjects: number
    projectDelta: number | null
    activeLeads: number
    pipelineValue: number
    totalBoqs: number
    approvedBoqs: number
    budgetUtilization: number | null
    totalBudget: number
    totalSpent: number
  }
  projectCounts: {
    total: number
    active: number
    ongoing: number
    completed: number
    delayed: number
    onHold: number
  }
  statusOverview: { key: string; label: string; value: number; color: string }[]
  budget: {
    totalBudget: number
    totalSpent: number
    variance: number
    utilization: number | null
    committedAmount: number
    pendingAmount: number
    projects: { id: string; name: string; budget: number; spent: number; utilization: number | null }[]
  }
  materials: {
    approvedBoqLines: number
    poLines: number
    coveragePct: number | null
    poStatus: { key: string; label: string; value: number }[]
    totalPos: number
  }
  topVendors: { id: string; name: string; poCount: number; value: number; deliveryRate: number | null }[]
  activity: { id: string; message: string; type: string; createdAt: string; actor: { id: string; name: string } | null }[]
}

export interface Tenant {
  _id: string
  name: string
  slug: string
  status: 'trial' | 'active' | 'suspended' | 'cancelled'
  seatLimit: number
  seatsUsed: number
  userCount?: number
  projectCount?: number
  adminsUsed?: number
  adminLimit?: number
  subscriptionPlan?: 'starter' | 'pro' | 'enterprise'
  features?: Record<string, boolean>
  logoUrl?: string
  brandColor?: string
  notice?: {
    active?: boolean
    title?: string
    message?: string
    variant?: 'info' | 'warning' | 'urgent'
    dismissible?: boolean
    blocking?: boolean
    updatedAt?: string
  }
  cancelledAt?: string | null
  notes?: string
  createdAt: string
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue' | 'cancelled'

export interface VendorInvoice {
  _id: string
  invoiceNumber: string
  vendor?: { _id: string; name: string } | string
  purchaseOrder?: { _id: string; poNumber: string; value?: number } | string
  projectId?: { _id: string; name: string } | string
  amount: number
  invoiceDate?: string
  dueDate?: string
  status: InvoiceStatus
  fileUrl?: string
  fileName?: string
  mimeType?: string
  notes?: string
  paidAt?: string
  createdAt: string
}

export interface BillingSummary {
  total: number
  unpaidAmount: number
  paidAmount?: number
  paidThisMonth: number
  overdueCount: number
}

export interface AppNotification {
  _id: string
  type: string
  title: string
  body?: string
  link?: string
  read?: boolean
  later?: boolean
  cleared?: boolean
  createdAt: string
  meta?: Record<string, unknown>
}

export type RfqStatus = 'draft' | 'sent' | 'comparing' | 'awarded' | 'cancelled'

export interface RfqItem {
  description: string
  unit: string
  qty: number
  boqRate?: number
  rate?: number
  boqItemId?: string
  _id?: string
}

export interface RfqVendorEntry {
  vendor: import('../types/ops').Vendor | string
  status: 'pending' | 'sent' | 'quoted' | 'declined'
  rates?: number[]
  gstPercent?: number
  freight?: number
  loading?: number
  installation?: number
  otherCharges?: number
  validUntil?: string
  remarks?: string
  landedCost?: number
  sentAt?: string
  sentVia?: string
  quotedAt?: string
}

export interface Rfq {
  _id: string
  rfqNumber: string
  projectId?: { _id: string; name: string; clientName?: string; location?: string } | string
  quotationId?: string
  items: RfqItem[]
  vendors: RfqVendorEntry[]
  status: RfqStatus
  closingDate?: string
  notes?: string
  awardedVendor?: import('../types/ops').Vendor | string
  awardReason?: string
  purchaseOrder?: string
  createdBy?: { _id: string; name: string }
  createdAt: string
  updatedAt?: string
}

export interface MaterialCatalogItem {
  _id?: string
  materialFamily?: string
  grade?: string
  brand?: string
  thickness?: string
  finish?: string
  description: string
  unit: string
  rate?: number
  category?: string
  room?: string
  [key: string]: unknown
}

export interface MeasurementRow {
  space?: string
  unit?: string
  nos?: number
  length?: number
  width?: number
  qty?: number
}

export interface MeasurementQuotationItem {
  group?: string
  sectionNo?: string
  sectionName?: string
  no?: string
  name?: string
  unit?: string
  rows?: MeasurementRow[]
  overrideTotal?: number | null
  boqTotal?: number | null
  boqTotalLabel?: string
  boqRef?: { index: number; slNo?: string; section?: string; label?: string }
}

export interface MeasurementSpaceOption {
  name: string
  uses?: number
}

export interface MeasurementCatalog {
  meta?: Record<string, unknown>
  boqType?: string
  spaces?: MeasurementSpaceOption[]
  items?: MeasurementQuotationItem[]
}

export interface GoogleCalendarStatus {
  configured: boolean
  clientId?: string
  connected: boolean
  email?: string
  connectedAt?: string | null
}

export interface GoogleCalendarEvent {
  id: string
  summary?: string
  start?: string
  end?: string
  htmlLink?: string
  location?: string
}
