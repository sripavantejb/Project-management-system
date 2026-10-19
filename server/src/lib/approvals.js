import { ApprovalRule, ApprovalType, BUILTIN_APPROVAL_TYPES } from '../models/Approval.js'
import { User } from '../models/User.js'
import { AppError } from '../middleware/errorHandler.js'

/** Steps on a rule, falling back to the original single approver. */
export function stepsOf(rule) {
  if (Array.isArray(rule?.steps) && rule.steps.length) return rule.steps
  if (!rule?.approverRole && !rule?.approverUser) return []
  return [{ approverRole: rule.approverRole, approverUser: rule.approverUser || null }]
}

/** Does this rule's band contain `value`? Upper bound is exclusive. */
export function ruleMatches(rule, value) {
  if (rule.isActive === false) return false
  const min = Number(rule.minAmount) || 0
  if (value < min) return false
  if (rule.maxAmount != null && value >= Number(rule.maxAmount)) return false
  return true
}

/**
 * Resolving an approver is "most specific wins": of every active rule whose
 * band contains the amount, the one with the highest `minAmount` takes it.
 * That lets a workspace layer "…and anything from ₹50,000 goes to the owner"
 * on top of a catch-all without having to reorder anything.
 *
 * Two rules can start at the same figure — "₹2L and up → owner" alongside
 * "₹2L–₹5L → admin". The narrower band is the more specific instruction, so it
 * wins the overlap and the open-ended rule keeps everything above it. Without
 * an explicit tie-break here the winner would fall out of document order,
 * which is invisible to whoever wrote the policy.
 */
export function pickRule(rules, amount) {
  const value = Number(amount) || 0
  const matches = rules.filter((r) => ruleMatches(r, value))
  if (!matches.length) return null

  return matches.reduce((best, r) => {
    const min = Number(r.minAmount) || 0
    const bestMin = Number(best.minAmount) || 0
    if (min !== bestMin) return min > bestMin ? r : best

    const max = r.maxAmount == null ? Infinity : Number(r.maxAmount)
    const bestMax = best.maxAmount == null ? Infinity : Number(best.maxAmount)
    return max < bestMax ? r : best
  })
}

/**
 * Collapse overlapping rules into the bands that will actually be used.
 *
 * Rules are stored as overlapping "from X upwards" spans, which is easy to
 * write but hard to read: a catch-all sitting under a ₹50,000 escalation only
 * really covers ₹0–₹49,999, and two rules starting at the same figure means
 * one of them may never fire.
 *
 * So rather than hand clients the raw rules and have each reimplement this,
 * walk every amount at which the answer could change, ask `pickRule` who wins
 * in each stretch, and merge neighbours that agree. Clients just render the
 * result, which means the panel can never disagree with the engine.
 *
 * Rules that never win anywhere come back with `shadowed: true` so a dead
 * policy is visible rather than silently doing nothing.
 */
export function computeBands(rules, hasAmount) {
  if (!rules.length) return []

  if (!hasAmount) {
    // No amount to compare, so exactly one rule can ever win.
    const winner = pickRule(rules, 0)
    return rules.map((rule) => ({
      ruleId: String(rule._id),
      min: 0,
      max: null,
      shadowed: !winner || String(rule._id) !== String(winner._id),
    }))
  }

  const edges = new Set([0])
  for (const r of rules) {
    edges.add(Number(r.minAmount) || 0)
    if (r.maxAmount != null) edges.add(Number(r.maxAmount))
  }
  const points = [...edges].sort((a, b) => a - b)

  const spans = []
  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = i + 1 < points.length ? points[i + 1] : null
    const winner = pickRule(rules, from)
    if (!winner) continue

    const prev = spans[spans.length - 1]
    if (prev && prev.ruleId === String(winner._id) && prev.max === from) {
      prev.max = to
    } else {
      spans.push({ ruleId: String(winner._id), min: from, max: to, shadowed: false })
    }
  }

  const covering = new Set(spans.map((b) => b.ruleId))
  const dead = rules
    .filter((r) => !covering.has(String(r._id)))
    .map((rule) => ({ ruleId: String(rule._id), min: 0, max: 0, shadowed: true }))

  return [...spans, ...dead]
}

/**
 * Turn a rule into an actual person.
 *
 * A pinned user wins. Otherwise the role is resolved against the workspace —
 * oldest active member of that role, so the answer is stable rather than
 * changing with document order.
 */
export async function resolveApproverUser(tenantId, rule) {
  if (!rule) return null
  if (rule.approverUser) return rule.approverUser._id || rule.approverUser

  const user = await User.findOne({
    tenantId,
    role: rule.approverRole,
    isActive: { $ne: false },
  })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean()

  return user?._id || null
}

/**
 * Full resolution for one record: which rule applies, and who it lands on.
 *
 * Returns `{ rule: null, approver: null }` when the workspace has no rule for
 * this type — callers treat that as "no approval needed" rather than an error,
 * so adding rules is what switches routing on.
 */
export async function resolveApproval(tenantId, entityType, amount) {
  const rules = await ApprovalRule.find({
    tenantId,
    entityType,
    isActive: { $ne: false },
  }).lean()

  const rule = pickRule(rules, amount)
  if (!rule) return { rule: null, approver: null, chain: [] }

  const chain = []
  for (const step of stepsOf(rule)) {
    const approver = await resolveApproverUser(tenantId, step)
    chain.push({
      approverRole: step.approverRole || '',
      approver,
      status: 'waiting',
      note: '',
    })
  }
  if (chain[0]) chain[0].status = 'pending'
  return { rule, approver: chain[0]?.approver || null, chain }
}

/** Fields to copy onto a new record when a rule matches. */
export function approvalStamp(resolved, actorId) {
  if (!resolved?.rule) {
    return { approvalStatus: 'none', approver: null, approvalRule: null, approvalStep: 0, approvalChain: [], approvalHistory: [] }
  }
  return {
    approvalStatus: 'pending',
    approver: resolved.approver,
    approvalRule: resolved.rule._id,
    approvalStep: 0,
    approvalChain: resolved.chain,
    approvalHistory: [
      { action: 'requested', actor: actorId, at: new Date(), note: '', step: 0 },
    ],
  }
}

/**
 * Approve or reject the current step on a record.
 * Mutates the document. Caller saves it.
 */
export function decideApproval(doc, { user, isAdmin, decision, note }) {
  if (!doc || doc.approvalStatus !== 'pending') {
    throw new AppError('This is not waiting for approval', 400)
  }
  const chain = Array.isArray(doc.approvalChain) ? doc.approvalChain : []
  const stepIndex = Number(doc.approvalStep) || 0
  const current = chain[stepIndex]
  const currentId = current?.approver || doc.approver
  const allowed = isAdmin || (currentId && String(currentId) === String(user._id))
  if (!allowed) throw new AppError('Only the assigned approver can decide this', 403)

  const cleanNote = String(note || '').trim()
  if (decision === 'rejected' && !cleanNote) {
    throw new AppError('A reason is required to reject', 400)
  }
  if (!['approved', 'rejected'].includes(decision)) {
    throw new AppError('decision must be approved or rejected', 400)
  }

  if (!Array.isArray(doc.approvalHistory)) doc.approvalHistory = []

  if (decision === 'rejected') {
    if (current) {
      current.status = 'rejected'
      current.decidedBy = user._id
      current.decidedAt = new Date()
      current.note = cleanNote
    }
    doc.approvalStatus = 'rejected'
    doc.approvalHistory.push({
      action: 'rejected',
      actor: user._id,
      at: new Date(),
      note: cleanNote,
      step: stepIndex,
    })
    return { finished: true, nextApprover: null, stepIndex }
  }

  if (current) {
    current.status = 'approved'
    current.decidedBy = user._id
    current.decidedAt = new Date()
    current.note = cleanNote
  }
  doc.approvalHistory.push({
    action: 'approved',
    actor: user._id,
    at: new Date(),
    note: cleanNote,
    step: stepIndex,
  })

  const next = chain[stepIndex + 1]
  if (next) {
    next.status = 'pending'
    doc.approvalStep = stepIndex + 1
    doc.approver = next.approver
    doc.markModified?.('approvalChain')
    return { finished: false, nextApprover: next.approver, stepIndex: stepIndex + 1 }
  }

  doc.approvalStatus = 'approved'
  return { finished: true, nextApprover: null, stepIndex }
}

export function stepSummary(doc) {
  const chain = Array.isArray(doc?.approvalChain) ? doc.approvalChain : []
  const step = Number(doc?.approvalStep) || 0
  if (!chain.length) return { step: 0, total: doc?.approver ? 1 : 0, role: '' }
  return { step, total: chain.length, role: chain[step]?.approverRole || '' }
}

/**
 * Built-in types plus this workspace's custom ones, in one list.
 * Built-ins are synthesised rather than seeded so every workspace picks up
 * changes to the built-in set without a migration.
 */
export async function listApprovalTypes(tenantId) {
  const custom = await ApprovalType.find({ tenantId }).sort({ createdAt: 1 }).lean()

  const builtin = BUILTIN_APPROVAL_TYPES.map((t) => ({
    ...t,
    _id: null,
    isBuiltin: true,
    isActive: true,
  }))

  return [
    ...builtin,
    ...custom.map((t) => ({ ...t, isBuiltin: false })),
  ]
}
