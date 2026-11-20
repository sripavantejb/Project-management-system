import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

export const ROLES = [
  'admin',
  'owner',
  'hr',
  'project_manager',
  'designer',
  'site_supervisor',
  'vendor',
  'client',
]

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, default: 'project_manager', trim: true, index: true },
    /** Platform owner (Editco) — can manage all tenants */
    isPlatformAdmin: { type: Boolean, default: false, index: true },
    /** Per-user overrides layered over role defaults (plain object; keys may contain dots). */
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    mustChangePassword: { type: Boolean, default: false },
    avatar: { type: String, default: '' },
    phone: { type: String, default: '' },
    title: { type: String, default: '' },
    company: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    onboardingCompleted: { type: Boolean, default: false },
    inviteToken: { type: String, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    refreshTokens: [{ type: String, select: false }],
    /** Bumped on each login so older devices lose access immediately. */
    sessionVersion: { type: Number, default: 0 },
    googleCalendar: {
      connected: { type: Boolean, default: false },
      email: { type: String, default: '' },
      accessToken: { type: String, default: '' },
      refreshToken: { type: String, default: '' },
      expiryDate: { type: Number, default: null },
      connectedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
)

userSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true })
userSchema.index({ email: 1 })

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    phone: this.phone,
    title: this.title,
    company: this.company,
    tenantId: this.tenantId,
    isPlatformAdmin: !!this.isPlatformAdmin,
    permissions:
      this.permissions && typeof this.permissions === 'object'
        ? { ...this.permissions }
        : {},
    mustChangePassword: !!this.mustChangePassword,
    isActive: this.isActive !== false,
    onboardingCompleted: this.onboardingCompleted,
    googleCalendarConnected: !!this.googleCalendar?.connected,
    googleCalendarEmail: this.googleCalendar?.email || '',
    createdAt: this.createdAt,
  }
}

export const User = mongoose.model('User', userSchema)
