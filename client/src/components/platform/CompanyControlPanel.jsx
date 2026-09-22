import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Copy,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Save,
  ShieldOff,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import { api, assetUrl, companyLoginUrl } from '../../lib/api'
import { InviteDetailsModal } from '../layout/GlobalChrome'
import { Button, Input, Select, StatusChip, toast } from '../ui'
import { INVITE_ROLE_OPTIONS, ROLE_LABELS } from '../../lib/roles'
import {
  TENANT_FEATURE_KEYS,
  SUBSCRIPTION_PLANS,
  normalizeTenantFeatures,
} from '../../lib/tenantFeatures'
import { cn } from '../../lib/utils'

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  let out = ''
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function CompanyControlPanel({ tenant, expanded, onToggle }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState({
    name: tenant.name,
    status: tenant.status,
    seatLimit: tenant.seatLimit,
    adminLimit: tenant.adminLimit ?? 3,
    subscriptionPlan: tenant.subscriptionPlan || 'pro',
    notes: tenant.notes || '',
    features: normalizeTenantFeatures(tenant.features),
  })
  const [invite, setInvite] = useState({
    name: '',
    email: '',
    role: 'admin',
    password: '',
  })
  const [details, setDetails] = useState(null)
  const [logoDragging, setLogoDragging] = useState(false)
  const logoInputRef = useRef(null)

  useEffect(() => {
    setDraft({
      name: tenant.name,
      status: tenant.status,
      seatLimit: tenant.seatLimit,
      adminLimit: tenant.adminLimit ?? 3,
      subscriptionPlan: tenant.subscriptionPlan || 'pro',
      notes: tenant.notes || '',
      features: normalizeTenantFeatures(tenant.features),
    })
  }, [tenant])

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['platform-tenant-users', tenant._id],
    queryFn: () => api(`/platform/tenants/${tenant._id}/users`),
    enabled: expanded,
  })

  const users = usersData?.users || []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['platform-tenants'] })
    qc.invalidateQueries({ queryKey: ['platform-tenant-users', tenant._id] })
  }

  const saveTenant = useMutation({
    mutationFn: () =>
      api(`/platform/tenants/${tenant._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name.trim(),
          status: draft.status,
          seatLimit: Number(draft.seatLimit) || 30,
          adminLimit: Number(draft.adminLimit) || 3,
          subscriptionPlan: draft.subscriptionPlan,
          notes: draft.notes.trim(),
          features: draft.features,
        }),
      }),
    onSuccess: () => {
      toast('Company settings saved', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const cancelSubscription = useMutation({
    mutationFn: () =>
      api(`/platform/tenants/${tenant._id}/cancel-subscription`, { method: 'POST' }),
    onSuccess: () => {
      toast('Subscription cancelled — the whole workspace is now locked', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const reactivateSubscription = useMutation({
    mutationFn: () =>
      api(`/platform/tenants/${tenant._id}/reactivate-subscription`, { method: 'POST' }),
    onSuccess: () => {
      toast('Subscription reactivated', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const uploadLogo = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return api(`/platform/tenants/${tenant._id}/logo`, {
        method: 'POST',
        body: fd,
      })
    },
    onSuccess: () => {
      toast('Company logo updated', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const removeLogo = useMutation({
    mutationFn: () =>
      api(`/platform/tenants/${tenant._id}/logo`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Company logo removed', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const handleLogoFile = (file) => {
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      toast('Please drop an image file (PNG, JPG, SVG, WebP)', { type: 'error' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Logo must be under 5MB', { type: 'error' })
      return
    }
    uploadLogo.mutate(file)
  }

  const createUser = useMutation({
    mutationFn: () =>
      api(`/platform/tenants/${tenant._id}/users`, {
        method: 'POST',
        body: JSON.stringify({
          name: invite.name,
          email: invite.email,
          role: invite.role,
          ...(invite.password.trim() ? { password: invite.password.trim() } : {}),
        }),
      }),
    onSuccess: (res) => {
      toast('User credentials created', { type: 'success' })
      setDetails({
        companyName: tenant.name,
        workspace: tenant.slug,
        email: res.user.email,
        tempPassword: res.tempPassword,
        role: ROLE_LABELS[invite.role] || invite.role,
        loginUrl: companyLoginUrl(
          tenant.slug,
          ['admin', 'owner', 'hr'].includes(invite.role) ? 'admin' : 'staff',
        ),
        portal: ['admin', 'owner', 'hr'].includes(invite.role) ? 'admin' : 'staff',
      })
      setInvite({ name: '', email: '', role: 'admin', password: '' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const patchUser = useMutation({
    mutationFn: ({ userId, body }) =>
      api(`/platform/tenants/${tenant._id}/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast('User updated', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const resetPassword = useMutation({
    mutationFn: (userId) =>
      api(`/platform/tenants/${tenant._id}/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (res) => {
      setDetails({
        companyName: tenant.name,
        workspace: tenant.slug,
        email: res.user.email,
        tempPassword: res.tempPassword,
        role: ROLE_LABELS[res.user.role] || res.user.role,
        loginUrl: companyLoginUrl(
          tenant.slug,
          ['admin', 'owner', 'hr'].includes(res.user.role) ? 'admin' : 'staff',
        ),
        portal: ['admin', 'owner', 'hr'].includes(res.user.role) ? 'admin' : 'staff',
      })
      toast('New password generated', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const deleteUser = useMutation({
    mutationFn: (userId) =>
      api(`/platform/tenants/${tenant._id}/users/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: (res) => {
      toast(res.message || 'Person deleted', { type: 'success' })
      invalidate()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const copyLogin = async () => {
    const url = companyLoginUrl(tenant.slug)
    try {
      await navigator.clipboard.writeText(`Workspace: ${tenant.slug}\nLogin: ${url}`)
      toast('Login link copied', { type: 'success' })
    } catch {
      toast('Could not copy', { type: 'error' })
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-surface-raised sm:px-5"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-secondary transition-transform',
            expanded && 'rotate-180',
          )}
        />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-surface-raised">
          {tenant.logoUrl ? (
            <img
              src={assetUrl(tenant.logoUrl)}
              alt=""
              className="h-full w-full object-contain p-0.5"
            />
          ) : (
            <span className="text-[13px] font-bold text-primary">
              {(tenant.name || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-primary">{tenant.name}</p>
            <StatusChip status={tenant.status} />
            {tenant.status === 'suspended' && (
              <span className="text-[11px] font-medium text-[#ef4444]">Access blocked</span>
            )}
            {tenant.status === 'cancelled' && (
              <span className="text-[11px] font-medium text-[#ef4444]">Subscription cancelled</span>
            )}
            {tenant.subscriptionPlan && (
              <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3ecf8e]">
                {tenant.subscriptionPlan}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-secondary">
            <span className="font-mono font-medium text-[#3ecf8e]">{tenant.slug}</span>
            {' · '}
            {tenant.seatsUsed ?? 0}/{tenant.seatLimit} active seats
            {' · '}
            {tenant.adminsUsed ?? 0}/{tenant.adminLimit ?? 3} admins
            {' · '}
            {tenant.userCount ?? users.length} users
            {' · '}
            {tenant.projectCount ?? 0} projects
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              copyLogin()
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-secondary hover:border-[#3ecf8e]/30 hover:bg-[#ecfdf5] hover:text-[#3ecf8e]"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy login
          </button>
          <a
            href={companyLoginUrl(tenant.slug)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-secondary hover:border-[#3ecf8e]/30 hover:bg-[#ecfdf5] hover:text-[#3ecf8e]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open login
          </a>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-surface-raised px-4 py-5 sm:px-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-primary">Company settings</p>

              <div>
                <p className="mb-1.5 text-xs font-medium text-secondary">Company logo</p>
                <p className="mb-2 text-[11px] leading-relaxed text-secondary">
                  Shown in the company workspace sidebar. Drag and drop an image, or click to browse.
                </p>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => logoInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      logoInputRef.current?.click()
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setLogoDragging(true)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setLogoDragging(true)
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    setLogoDragging(false)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setLogoDragging(false)
                    const file = e.dataTransfer.files?.[0]
                    handleLogoFile(file)
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-[8px] border border-dashed px-3 py-3 transition',
                    logoDragging
                      ? 'border-[#3ecf8e] bg-[#ecfdf5]'
                      : 'border-border bg-surface-raised hover:border-[#c7c7c7]',
                    (uploadLogo.isPending || removeLogo.isPending) && 'pointer-events-none opacity-60',
                  )}
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-surface">
                    {tenant.logoUrl ? (
                      <img
                        src={assetUrl(tenant.logoUrl)}
                        alt={`${tenant.name} logo`}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-secondary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-primary">
                      {uploadLogo.isPending
                        ? 'Uploading…'
                        : tenant.logoUrl
                          ? 'Replace logo'
                          : 'Drop logo here'}
                    </p>
                    <p className="text-[11px] text-secondary">PNG, JPG, SVG, or WebP · max 5MB</p>
                  </div>
                  {tenant.logoUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLogo.mutate()
                      }}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-border px-2 py-1.5 text-[11px] font-medium text-secondary hover:border-[#ff2201]/30 hover:bg-red-50 hover:text-[#ff2201]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      handleLogoFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>

              <Input
                label="Company name"
                light
                value={draft.name}
                onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Status"
                  light
                  value={draft.status}
                  onChange={(e) => setDraft((s) => ({ ...s, status: e.target.value }))}
                  options={STATUS_OPTIONS}
                />
                <Select
                  label="Subscription plan"
                  light
                  value={draft.subscriptionPlan}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, subscriptionPlan: e.target.value }))
                  }
                  options={SUBSCRIPTION_PLANS}
                />
                <Input
                  label="Seat limit"
                  type="number"
                  light
                  value={draft.seatLimit}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, seatLimit: e.target.value }))
                  }
                />
                <Input
                  label="Max company admins"
                  type="number"
                  light
                  min={1}
                  max={50}
                  value={draft.adminLimit}
                  onChange={(e) =>
                    setDraft((s) => ({ ...s, adminLimit: e.target.value }))
                  }
                />
              </div>
              <p className="text-[11px] leading-relaxed text-secondary">
                Admins used:{' '}
                <span className="font-semibold text-primary">
                  {tenant.adminsUsed ?? '—'}
                </span>
                {' / '}
                {draft.adminLimit || tenant.adminLimit || 3}
                . Counts Owner + Admin roles. Company invites cannot exceed this
                cap.
              </p>
              <Input
                label="Internal notes"
                light
                placeholder="Billing contact, plan, etc."
                value={draft.notes}
                onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => saveTenant.mutate()}
                  loading={saveTenant.isPending}
                  disabled={!draft.name.trim()}
                >
                  <Save className="mr-1 h-4 w-4" />
                  Save settings
                </Button>
                {tenant.status === 'cancelled' || tenant.cancelledAt ? (
                  <Button
                    variant="secondary"
                    loading={reactivateSubscription.isPending}
                    onClick={() => reactivateSubscription.mutate()}
                  >
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    Reactivate subscription
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    loading={cancelSubscription.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Cancel subscription for ${tenant.name}? Their whole workspace locks immediately — including anyone currently signed in — behind a screen telling them to contact you.`,
                        )
                      ) {
                        cancelSubscription.mutate()
                      }
                    }}
                  >
                    <ShieldOff className="mr-1 h-4 w-4" />
                    Cancel subscription
                  </Button>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-primary">Add user</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Name"
                  light
                  value={invite.name}
                  onChange={(e) => setInvite((s) => ({ ...s, name: e.target.value }))}
                />
                <Input
                  label="Email"
                  type="email"
                  light
                  value={invite.email}
                  onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                />
                <Select
                  label="Role"
                  light
                  value={invite.role}
                  onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}
                  options={INVITE_ROLE_OPTIONS}
                />
                <Input
                  label="Password"
                  light
                  placeholder="Auto-generate if blank"
                  value={invite.password}
                  onChange={(e) =>
                    setInvite((s) => ({ ...s, password: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setInvite((s) => ({ ...s, password: generatePassword() }))
                  }
                >
                  <KeyRound className="mr-1 h-4 w-4" />
                  Generate password
                </Button>
                <Button
                  onClick={() => createUser.mutate()}
                  loading={createUser.isPending}
                  disabled={!invite.name || !invite.email}
                >
                  <UserPlus className="mr-1 h-4 w-4" />
                  Create credentials
                </Button>
              </div>
            </section>
          </div>

          <section className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-semibold text-primary">Feature access</p>
              <p className="text-xs text-secondary">
                Turn modules on or off for this company. Disabled features disappear from
                their sidebar after save.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TENANT_FEATURE_KEYS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.features[key] !== false}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        features: { ...s.features, [key]: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-[#c7c7c7] text-[#3ecf8e]"
                  />
                  <span className="text-primary">{label}</span>
                </label>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => saveTenant.mutate()}
              loading={saveTenant.isPending}
            >
              Save feature limits
            </Button>
          </section>

          <section className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-primary">
                Users ({users.length})
              </p>
            </div>
            {usersLoading ? (
              <p className="px-4 py-6 text-sm text-secondary">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="px-4 py-6 text-sm text-secondary">No users in this workspace.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-surface-raised text-[11px] font-semibold uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((u) => (
                      <tr key={u.id} className="text-primary">
                        <td className="px-4 py-3 font-medium">{u.name}</td>
                        <td className="px-4 py-3 text-secondary">{u.email}</td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            onChange={(e) =>
                              patchUser.mutate({
                                userId: u.id,
                                body: { role: e.target.value },
                              })
                            }
                            className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
                          >
                            {INVITE_ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip
                            status={u.isActive !== false ? 'active' : 'suspended'}
                            label={u.isActive !== false ? 'Active' : 'Deactivated'}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={resetPassword.isPending}
                              onClick={() => resetPassword.mutate(u.id)}
                            >
                              Reset password
                            </Button>
                            <Button
                              size="sm"
                              variant={u.isActive !== false ? 'danger' : 'secondary'}
                              onClick={() =>
                                patchUser.mutate({
                                  userId: u.id,
                                  body: { isActive: u.isActive === false },
                                })
                              }
                            >
                              <UserMinus className="mr-1 h-3.5 w-3.5" />
                              {u.isActive !== false ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              loading={deleteUser.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Permanently delete ${u.name} from ${tenant.name}?\n\nThey will lose login access immediately.`,
                                  )
                                ) {
                                  deleteUser.mutate(u.id)
                                }
                              }}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <InviteDetailsModal
        open={!!details}
        details={details}
        onClose={() => setDetails(null)}
      />
    </div>
  )
}
