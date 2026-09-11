import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Camera,
  CheckSquare,
  Receipt,
  Search,
  Moon,
  Sun,
  User,
  Lock,
  UserPlus,
  Palette,
  SlidersHorizontal,
  Mail,
  BookOpen,
} from 'lucide-react'
import { api, getTenantSlug, useAuthStore, companyLoginUrl } from '../lib/api'
import { InviteDetailsModal } from '../components/layout/GlobalChrome'
import { PageToolbar } from '../components/layout/PageToolbar'
import { MailAndAlertsSettings } from '../components/settings/MailAndAlertsSettings'
import { UserGuide } from '../components/settings/UserGuide'
import { FadeIn } from '../components/motion/FadeIn'
import { cn } from '../lib/utils'
import {
  Avatar,
  Button,
  Card,
  Input,
  Select,
  StatusChip,
  toast,
} from '../components/ui'
import { useUiStore } from '../store/uiStore'
import {
  PILL_ACTIVE,
  PILL_IDLE,
  PILL_TRACK,
} from '../components/layout/PageToolbar'

export { ReportsPage } from './ReportsPage'

export function NotificationsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications'),
  })

  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markRead = useMutation({
    mutationFn: (id) =>
      api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div className="space-y-6">
      <PageToolbar
        right={
          <Button variant="secondary" size="sm" onClick={() => readAll.mutate()}>
            Mark all read
          </Button>
        }
      />

      <Card padding={false}>
        <div className="divide-y divide-border">
          {(data?.notifications || []).map((n) => (
            <button
              key={n._id}
              type="button"
              onClick={() => !n.read && markRead.mutate(n._id)}
              className="flex w-full gap-3 px-5 py-4 text-left hover:bg-surface-raised transition-colors"
            >
              <span
                className={`mt-1.5 h-2 w-2 rounded-full ${n.read ? 'bg-border' : 'bg-accent'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-secondary mt-0.5">{n.body}</p>
                <p className="text-[11px] text-secondary mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              {n.link && (
                <Link
                  to={n.link}
                  className="text-xs text-accent self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                </Link>
              )}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const setUser = useAuthStore((s) => s.setUser)
  const avatarInputRef = useRef(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [tab, setTab] = useState('account')
  const [name, setName] = useStateSafe(user?.name || '')
  const [title, setTitle] = useStateSafe(user?.title || '')
  const [invite, setInvite] = useState({
    name: '',
    email: '',
    role: 'project_manager',
  })
  const [inviteResult, setInviteResult] = useState(null)
  const [pwd, setPwd] = useState({ current: '', next: '' })
  const canInvite =
    user?.isPlatformAdmin ||
    ['admin', 'owner', 'hr', 'project_manager'].includes(user?.role)
  const canEditMail =
    user?.isPlatformAdmin || ['admin', 'owner'].includes(user?.role)

  /**
   * The photo saves as soon as it's chosen rather than waiting for "Save
   * changes": the upload has to complete before there's a URL to store, and
   * deferring it would only create a way to lose the picture.
   *
   * The file goes through api(), so it's compressed on the way out like every
   * other upload — a 6MB selfie lands as a few hundred KB.
   */
  const uploadAvatar = async (file) => {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      toast('Choose an image file', { type: 'error' })
      return
    }
    setAvatarBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const media = await api('/media?imagesOnly=1', { method: 'POST', body: fd })
      const data = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar: media.url }),
      })
      setUser(data.user)
      toast('Profile photo updated', { type: 'success' })
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally {
      setAvatarBusy(false)
      // Let the same file be picked again after a failure.
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const removeAvatar = async () => {
    setAvatarBusy(true)
    try {
      const data = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar: '' }),
      })
      setUser(data.user)
      toast('Profile photo removed', { type: 'success' })
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally {
      setAvatarBusy(false)
    }
  }

  const save = async () => {
    try {
      const data = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, title }),
      })
      setUser(data.user)
      toast('Profile saved', { type: 'success' })
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const sendInvite = async () => {
    try {
      const data = await api('/auth/invite', {
        method: 'POST',
        body: JSON.stringify(invite),
      })
      setInviteResult({
        workspace: tenant?.slug || getTenantSlug(),
        email: data.user.email,
        tempPassword: data.tempPassword,
        loginUrl: companyLoginUrl(
          tenant?.slug || getTenantSlug(),
          ['admin', 'owner', 'hr'].includes(invite.role) ? 'admin' : 'staff',
        ),
      })
      setInvite({ name: '', email: '', role: 'project_manager' })
      toast('Invite created', { type: 'success' })
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const changePassword = async () => {
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwd.current || undefined,
          password: pwd.next,
        }),
      })
      setUser({ ...user, mustChangePassword: false })
      setPwd({ current: '', next: '' })
      toast('Password updated', { type: 'success' })
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  return (
    <div
      className={cn(
        'mx-auto w-full space-y-4 pb-10',
        tab === 'guide' ? 'max-w-5xl' : 'max-w-3xl',
      )}
    >
      <FadeIn>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-primary">
            Settings
          </h1>
          <p className="mt-0.5 text-[13px] text-secondary">
            Profile, email SMTP, and who gets popups & mail for every event
          </p>
        </div>
        {(tenant?.slug || user?.tenantId) && (
          <div className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-secondary">
            <span className="text-primary">{tenant?.slug || '—'}</span>
            {tenant?.seatLimit != null ? ` · ${tenant.seatLimit} seats` : ''}
          </div>
        )}
      </header>
      </FadeIn>

      <FadeIn delay={30}>
      <div className={PILL_TRACK}>
        <button
          type="button"
          onClick={() => setTab('account')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
            tab === 'account' ? PILL_ACTIVE : PILL_IDLE,
          )}
        >
          Account
        </button>
        <button
          type="button"
          onClick={() => setTab('email')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
            tab === 'email' ? PILL_ACTIVE : PILL_IDLE,
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Email & alerts
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('guide')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
            tab === 'guide' ? PILL_ACTIVE : PILL_IDLE,
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Guide
          </span>
        </button>
      </div>
      </FadeIn>

      <FadeIn delay={50}>
      {tab === 'email' ? (
        <MailAndAlertsSettings canEdit={canEditMail} />
      ) : tab === 'guide' ? (
        <UserGuide />
      ) : (
        <>
      <AppearanceSettings />

      {user?.mustChangePassword && (
        <SettingsSection
          icon={Lock}
          title="Set a new password"
          description="You’re using a temporary password. Choose a new one to continue."
          tone="warn"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Current / temp password"
              type="password"
              value={pwd.current}
              onChange={(e) =>
                setPwd((s) => ({ ...s, current: e.target.value }))
              }
            />
            <Input
              label="New password"
              type="password"
              value={pwd.next}
              onChange={(e) => setPwd((s) => ({ ...s, next: e.target.value }))}
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button onClick={changePassword} disabled={pwd.next.length < 6}>
              Update password
            </Button>
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        icon={User}
        title="Profile"
        description="How you appear across projects and comments"
      >
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-surface-raised px-3.5 py-3">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
            aria-label="Change profile photo"
            className={cn(
              'group relative shrink-0 rounded-full outline-none',
              'focus-visible:ring-2 focus-visible:ring-accent/40',
              avatarBusy ? 'cursor-wait opacity-70' : 'cursor-pointer',
            )}
          >
            <Avatar src={user?.avatar} name={user?.name} size="lg" />
            <span
              className={cn(
                'absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white transition-opacity',
                avatarBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              <Camera className="h-4 w-4" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-primary">
              {user?.email}
            </p>
            <p className="mt-0.5 text-[12px] capitalize text-secondary">
              {(user?.role || '').replace(/_/g, ' ')}
              {user?.isPlatformAdmin ? ' · platform admin' : ''}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[12px]">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
                className="font-semibold text-accent hover:underline disabled:opacity-50"
              >
                {avatarBusy
                  ? 'Uploading…'
                  : user?.avatar
                    ? 'Change photo'
                    : 'Add a photo'}
              </button>
              {user?.avatar && !avatarBusy && (
                <>
                  <span className="text-muted">·</span>
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="font-semibold text-status-delayed hover:underline"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => uploadAvatar(e.target.files?.[0])}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button onClick={save}>Save changes</Button>
        </div>
      </SettingsSection>

      {!user?.mustChangePassword && (
        <SettingsSection
          icon={Lock}
          title="Password"
          description="Update your sign-in password"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Current password"
              type="password"
              value={pwd.current}
              onChange={(e) =>
                setPwd((s) => ({ ...s, current: e.target.value }))
              }
            />
            <Input
              label="New password"
              type="password"
              value={pwd.next}
              onChange={(e) => setPwd((s) => ({ ...s, next: e.target.value }))}
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              variant="secondary"
              onClick={changePassword}
              disabled={pwd.next.length < 6}
            >
              Update password
            </Button>
          </div>
        </SettingsSection>
      )}

      {canInvite && (
        <SettingsSection
          icon={UserPlus}
          title="Invite teammate"
          description="Creates a user in this workspace (counts toward seat limit)"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={invite.name}
              onChange={(e) =>
                setInvite((s) => ({ ...s, name: e.target.value }))
              }
            />
            <Input
              label="Email"
              type="email"
              value={invite.email}
              onChange={(e) =>
                setInvite((s) => ({ ...s, email: e.target.value }))
              }
            />
          </div>
          <Select
            label="Role"
            value={invite.role}
            onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'owner', label: 'Owner' },
              { value: 'hr', label: 'HR' },
              { value: 'project_manager', label: 'Project manager' },
              { value: 'designer', label: 'Designer' },
              { value: 'site_supervisor', label: 'Site supervisor' },
              { value: 'client', label: 'Client' },
              { value: 'vendor', label: 'Vendor' },
            ]}
          />
          <div className="flex justify-end pt-1">
            <Button
              onClick={sendInvite}
              disabled={!invite.name || !invite.email}
            >
              Create invite
            </Button>
          </div>
        </SettingsSection>
      )}

      <InviteDetailsModal
        open={!!inviteResult}
        details={inviteResult}
        onClose={() => setInviteResult(null)}
      />

      <CustomFieldsSettings />
        </>
      )}
      </FadeIn>
    </div>
  )
}

function SettingsSection({ icon: Icon, title, description, children, tone }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[12px] border bg-surface',
        tone === 'warn'
          ? 'border-amber-500/35'
          : 'border-border',
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]',
            tone === 'warn'
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'bg-surface-raised text-secondary',
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-primary">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[12px] leading-snug text-secondary">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-3.5 px-4 py-4 sm:px-5">{children}</div>
    </section>
  )
}

function AppearanceSettings() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  return (
    <SettingsSection
      icon={Palette}
      title="Appearance"
      description="Light or dark — saved on this device"
    >
      <div className="inline-flex rounded-full bg-active p-[3px]">
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition',
            theme === 'light'
              ? 'bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-secondary hover:text-primary',
          )}
        >
          <Sun className="h-3.5 w-3.5" />
          Light
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition',
            theme === 'dark'
              ? 'bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-secondary hover:text-primary',
          )}
        >
          <Moon className="h-3.5 w-3.5" />
          Dark
        </button>
      </div>
    </SettingsSection>
  )
}

function CustomFieldsSettings() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState({
    name: '',
    type: 'text',
    options: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['custom-fields', 'all'],
    queryFn: () => api('/custom-fields/all'),
  })
  const fields = data?.fields || []

  const createField = useMutation({
    mutationFn: (body) =>
      api('/custom-fields', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      setDraft({ name: '', type: 'text', options: '' })
      toast('Field created', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const patchField = useMutation({
    mutationFn: ({ id, ...body }) =>
      api(`/custom-fields/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast('Field updated', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const removeField = useMutation({
    mutationFn: (id) => api(`/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast('Field deactivated', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  return (
    <SettingsSection
      icon={SlidersHorizontal}
      title="Task custom fields"
      description="Workspace fields (e.g. Developer) appear on every task sheet"
    >
      {isLoading ? (
        <p className="text-[12px] text-secondary">Loading…</p>
      ) : fields.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border bg-surface-raised px-3 py-6 text-center text-[12px] text-secondary">
          No custom fields yet
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[10px] border border-border">
          {fields.map((f) => (
            <li
              key={f._id}
              className="flex items-center gap-2 bg-surface px-3.5 py-2.5 text-[13px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-primary">{f.name}</p>
                <p className="text-[11px] text-secondary">
                  {f.slug} · {f.type}
                  {!f.isActive ? ' · inactive' : ''}
                </p>
              </div>
              {f.isActive ? (
                <button
                  type="button"
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-secondary hover:bg-surface-raised hover:text-primary"
                  onClick={() => removeField.mutate(f._id)}
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
                  onClick={() =>
                    patchField.mutate({ id: f._id, isActive: true })
                  }
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-[10px] border border-border bg-surface-raised p-3.5">
        <p className="text-[12px] font-semibold text-primary">Add field</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
            placeholder="Developer"
          />
          <Select
            label="Type"
            value={draft.type}
            onChange={(e) => setDraft((s) => ({ ...s, type: e.target.value }))}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'user', label: 'Person' },
              { value: 'select', label: 'Select' },
              { value: 'number', label: 'Number' },
            ]}
          />
        </div>
        {draft.type === 'select' && (
          <Input
            label="Options"
            value={draft.options}
            onChange={(e) =>
              setDraft((s) => ({ ...s, options: e.target.value }))
            }
            placeholder="Option A, Option B"
          />
        )}
        <div className="flex justify-end">
          <Button
            disabled={!draft.name.trim() || createField.isPending}
            onClick={() =>
              createField.mutate({
                name: draft.name.trim(),
                type: draft.type,
                options:
                  draft.type === 'select'
                    ? draft.options
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean)
                    : [],
              })
            }
          >
            Add field
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

function useStateSafe(initial) {
  return useState(initial)
}

export function MobileSupervisorPage() {
  const user = useAuthStore((s) => s.user)
  const { data: home } = useQuery({
    queryKey: ['home'],
    queryFn: () => api('/home'),
  })
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api('/projects'),
  })
  const [screen, setScreen] = useState('home')
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [snagTitle, setSnagTitle] = useState('')
  const qc = useQueryClient()

  const firstProject = projects?.projects?.[0]?._id

  const postUpdate = async () => {
    try {
      await api('/site-updates', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId || firstProject,
          note,
          photos: [
            {
              url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
            },
          ],
        }),
      })
      toast('Site update posted', { type: 'success' })
      setNote('')
      setScreen('home')
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const logExpense = async () => {
    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId || firstProject,
          amount: Number(amount),
          category: 'Materials',
          note: 'Logged from mobile',
          receiptUrl:
            'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=80',
        }),
      })
      toast('Expense sent for approval on Revenue', { type: 'success' })
      setAmount('')
      setScreen('home')
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const addSnag = async () => {
    try {
      await api('/snags', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId || firstProject,
          title: snagTitle,
          status: 'open',
          assignee: user?.id,
        }),
      })
      toast('Snag logged', { type: 'success' })
      setSnagTitle('')
      setScreen('home')
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const toggleTask = async (id) => {
    await api(`/tasks/${id}/toggle`, { method: 'PATCH' })
    qc.invalidateQueries({ queryKey: ['home'] })
  }

  if (screen === 'home') {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <p className="text-sm text-secondary">Site mode</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hey {user?.name?.split(' ')[0]}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'update', label: 'Post site update', icon: Camera },
            { key: 'tasks', label: 'My tasks', icon: CheckSquare },
            { key: 'expense', label: 'Log expense', icon: Receipt },
            { key: 'snags', label: 'Snags', icon: AlertTriangle },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setScreen(t.key)}
              className="flex min-h-[120px] flex-col items-start justify-between rounded-[18px] border border-border bg-surface p-4 text-left hover:border-accent/40 transition-colors"
            >
              <t.icon className="h-6 w-6 text-accent" />
              <span className="text-sm font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Button variant="ghost" onClick={() => setScreen('home')}>
        ← Back
      </Button>

      {screen === 'update' && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Post site update</h2>
          <Select
            label="Project"
            value={projectId || firstProject || ''}
            onChange={(e) => setProjectId(e.target.value)}
            options={(projects?.projects || []).map((p) => ({
              value: p._id,
              label: p.name,
            }))}
          />
          <div className="flex h-40 items-center justify-center rounded-[16px] border border-dashed border-border bg-surface-raised text-secondary text-sm">
            Camera capture (URL stub for web)
          </div>
          <Input
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button className="w-full" onClick={postUpdate}>
            Publish
          </Button>
        </Card>
      )}

      {screen === 'tasks' && (
        <Card padding={false}>
          {(home?.data?.tasks?.today || [])
            .concat(home?.data?.tasks?.overdue || [])
            .map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => toggleTask(t._id)}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left last:border-0"
              >
                <StatusChip status={t.status} />
                <span className="text-sm flex-1">{t.title}</span>
              </button>
            ))}
        </Card>
      )}

      {screen === 'expense' && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Log expense</h2>
          <Select
            label="Project"
            value={projectId || firstProject || ''}
            onChange={(e) => setProjectId(e.target.value)}
            options={(projects?.projects || []).map((p) => ({
              value: p._id,
              label: p.name,
            }))}
          />
          <Input
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button className="w-full" onClick={logExpense}>
            Submit for approval
          </Button>
        </Card>
      )}

      {screen === 'snags' && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Log snag</h2>
          <Select
            label="Project"
            value={projectId || firstProject || ''}
            onChange={(e) => setProjectId(e.target.value)}
            options={(projects?.projects || []).map((p) => ({
              value: p._id,
              label: p.name,
            }))}
          />
          <Input
            label="Issue"
            value={snagTitle}
            onChange={(e) => setSnagTitle(e.target.value)}
          />
          <Button className="w-full" onClick={addSnag}>
            Save snag
          </Button>
        </Card>
      )}
    </div>
  )
}
