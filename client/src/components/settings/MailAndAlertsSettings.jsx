import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, BellRing, Send, ShieldCheck, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Input, toast } from '../ui'
import { cn } from '../../lib/utils'

const FALLBACK_EVENTS = [
  {
    key: 'task_assigned',
    label: 'Task assigned',
    description: 'When someone is given a task',
  },
  {
    key: 'task_moved',
    label: 'Task moved / status change',
    description: 'When a task changes status, stage, or due date',
  },
  {
    key: 'deadline',
    label: 'Task deadlines',
    description: 'Reminders before a task due date',
  },
  {
    key: 'approval_requested',
    label: 'Approval requested',
    description: 'Drawings and other items needing sign-off',
  },
  {
    key: 'approval_decided',
    label: 'Approval decided',
    description: 'When an approval is approved or rejected',
  },
  {
    key: 'lead_assigned',
    label: 'Enquiry assigned',
    description: 'New enquiry follow-ups',
  },
  {
    key: 'mention',
    label: 'Mentions & comments',
    description: 'When someone @mentions you',
  },
  {
    key: 'mail',
    label: 'Internal mail',
    description: 'In-app messages between teammates',
  },
]

const DEFAULT_EVENT_PREFS = Object.fromEntries(
  FALLBACK_EVENTS.map((e) => {
    const isTaskFlow =
      e.key === 'task_assigned' ||
      e.key === 'task_moved' ||
      e.key === 'deadline'
    return [
      e.key,
      {
        popup: true,
        email: true,
        notifyTarget: true,
        notifyActor: isTaskFlow,
        notifyAdmins: isTaskFlow || e.key === 'approval_requested',
        daysBefore: 1,
      },
    ]
  }),
)

const DEFAULT_SMTP = {
  enabled: false,
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  fromName: 'Cubic',
  fromEmail: '',
}

/**
 * Workspace SMTP + who gets popup/email for each event.
 * Only owners/admins can save; everyone can see whether mail is configured.
 */
export function MailAndAlertsSettings({ canEdit }) {
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['settings', 'mail'],
    queryFn: () => api('/settings/mail'),
    retry: 1,
  })

  const [smtp, setSmtp] = useState(DEFAULT_SMTP)
  const [events, setEvents] = useState(DEFAULT_EVENT_PREFS)
  const [dirty, setDirty] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  useEffect(() => {
    if (!data?.settings) return
    const s = data.settings
    setSmtp({
      enabled: !!s.enabled,
      host: s.host || 'smtp.gmail.com',
      port: s.port || 587,
      secure: !!s.secure,
      user: s.user || '',
      pass: '',
      fromName: s.fromName || 'Cubic',
      fromEmail: s.fromEmail || '',
    })
    setEvents({ ...DEFAULT_EVENT_PREFS, ...(s.events || {}) })
    setHasPassword(!!s.hasPassword)
    setDirty(false)
  }, [data])

  const save = useMutation({
    mutationFn: (body) =>
      api('/settings/mail', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['settings', 'mail'] })
      setSmtp((s) => ({ ...s, pass: '' }))
      setHasPassword(!!res?.settings?.hasPassword || hasPassword)
      setDirty(false)
      toast('Email & alert settings saved', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const test = useMutation({
    mutationFn: () =>
      api('/settings/mail/test', {
        method: 'POST',
        body: JSON.stringify({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          user: smtp.user,
          pass: smtp.pass || undefined,
          fromName: smtp.fromName,
          fromEmail: smtp.fromEmail,
        }),
      }),
    onSuccess: (res) =>
      toast(`Test email sent to ${res.sentTo}`, { type: 'success' }),
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const eventDefs = data?.events?.length ? data.events : FALLBACK_EVENTS
  const passwordHint = hasPassword
    ? 'App password is saved — leave blank to keep it'
    : 'Use a Gmail App Password (not your login password)'
  const edit = canEdit ?? data?.canEdit ?? false

  const updateSmtp = (patch) => {
    setSmtp((s) => ({ ...s, ...patch }))
    setDirty(true)
  }

  const updateEvent = (key, patch) => {
    setEvents((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || DEFAULT_EVENT_PREFS[key] || {}), ...patch },
    }))
    setDirty(true)
  }

  const saveAll = () =>
    save.mutate({
      ...smtp,
      pass: smtp.pass || undefined,
      events,
    })

  return (
    <div className="space-y-4">
      {isError && (
        <div className="flex items-start gap-3 rounded-[12px] border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-primary">
              Could not load email settings
            </p>
            <p className="mt-0.5 text-[12px] text-secondary">
              {error?.message || 'Check that the API is running, then retry.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <p className="text-[12px] text-secondary">Loading saved settings…</p>
      )}

      <section className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-raised text-secondary">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-primary">
              Email (SMTP)
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-secondary">
              Connect your company mailbox so Cubic can send task, approval,
              deadline, and enquiry alerts by email. For Gmail, create an{' '}
              <strong>App Password</strong> under Google Account → Security.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-primary">
            <input
              type="checkbox"
              checked={smtp.enabled}
              disabled={!edit}
              onChange={(e) => updateSmtp({ enabled: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Enabled
          </label>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="SMTP host"
              value={smtp.host}
              disabled={!edit}
              onChange={(e) => updateSmtp({ host: e.target.value })}
              placeholder="smtp.gmail.com"
            />
            <Input
              label="Port"
              type="number"
              value={String(smtp.port ?? 587)}
              disabled={!edit}
              onChange={(e) =>
                updateSmtp({ port: Number(e.target.value) || 587 })
              }
            />
            <Input
              label="Email / username"
              value={smtp.user}
              disabled={!edit}
              onChange={(e) => updateSmtp({ user: e.target.value })}
              placeholder="you@company.com"
            />
            <Input
              label="App password"
              type="password"
              value={smtp.pass}
              disabled={!edit}
              onChange={(e) => updateSmtp({ pass: e.target.value })}
              placeholder={passwordHint}
            />
            <Input
              label="From name"
              value={smtp.fromName}
              disabled={!edit}
              onChange={(e) => updateSmtp({ fromName: e.target.value })}
            />
            <Input
              label="From email"
              value={smtp.fromEmail}
              disabled={!edit}
              onChange={(e) => updateSmtp({ fromEmail: e.target.value })}
              placeholder="Same as username if blank"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-secondary">
            <input
              type="checkbox"
              checked={smtp.secure}
              disabled={!edit}
              onChange={(e) => updateSmtp({ secure: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Use SSL (port 465). Leave off for Gmail TLS on 587.
          </label>

          {edit ? (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                loading={test.isPending}
                disabled={
                  !smtp.user || (!smtp.pass && !hasPassword) || isFetching
                }
                onClick={() => test.mutate()}
              >
                <Send className="h-3.5 w-3.5" />
                Send test email
              </Button>
              <Button
                size="sm"
                loading={save.isPending}
                disabled={!dirty}
                onClick={saveAll}
              >
                Save email settings
              </Button>
            </div>
          ) : (
            <p className="text-[12px] text-secondary">
              Only owners and admins can change SMTP credentials.
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
        <div className="flex items-start gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-raised text-secondary">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-primary">
              Who gets what
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-secondary">
              For each event, choose popup and email, and whether the person
              involved, the person who triggered it, and admins are notified.
              Example: task assigned → assignee + assigner + admins.
            </p>
          </div>
        </div>

        <div className="divide-y divide-border">
          {eventDefs.map((ev) => {
            const pref = events[ev.key] || DEFAULT_EVENT_PREFS[ev.key] || {}
            return (
              <div key={ev.key} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-primary">
                      {ev.label}
                    </p>
                    <p className="text-[11px] text-secondary">{ev.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[12px]">
                    <Toggle
                      label="Popup"
                      checked={pref.popup !== false}
                      disabled={!edit}
                      onChange={(v) => updateEvent(ev.key, { popup: v })}
                    />
                    <Toggle
                      label="Email"
                      checked={pref.email !== false}
                      disabled={!edit}
                      onChange={(v) => updateEvent(ev.key, { email: v })}
                    />
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <ChipToggle
                    label="Target person"
                    hint="Assignee / approver"
                    checked={pref.notifyTarget !== false}
                    disabled={!edit}
                    onChange={(v) => updateEvent(ev.key, { notifyTarget: v })}
                  />
                  <ChipToggle
                    label="Who triggered it"
                    hint="Assigner / requester"
                    checked={!!pref.notifyActor}
                    disabled={!edit}
                    onChange={(v) => updateEvent(ev.key, { notifyActor: v })}
                  />
                  <ChipToggle
                    label="Admins"
                    hint="Owners & admins"
                    checked={!!pref.notifyAdmins}
                    disabled={!edit}
                    onChange={(v) => updateEvent(ev.key, { notifyAdmins: v })}
                  />
                  {ev.key === 'deadline' && (
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] text-secondary">
                      Days before
                      <input
                        type="number"
                        min={0}
                        max={30}
                        disabled={!edit}
                        value={pref.daysBefore ?? 1}
                        onChange={(e) =>
                          updateEvent(ev.key, {
                            daysBefore: Number(e.target.value) || 0,
                          })
                        }
                        className="h-7 w-14 rounded-md border border-border bg-surface px-1.5 text-[12px] font-semibold text-primary outline-none"
                      />
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {edit && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
            <p className="flex items-center gap-1.5 text-[11px] text-secondary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Emails only send when SMTP is enabled and verified
            </p>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!dirty}
              onClick={saveAll}
            >
              Save alert rules
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function Toggle({ label, checked, disabled, onChange }) {
  return (
    <label className="inline-flex items-center gap-1.5 font-semibold text-primary">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--accent)]"
      />
      {label}
    </label>
  )
}

function ChipToggle({ label, hint, checked, disabled, onChange }) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={hint}
      onClick={() => onChange(!checked)}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold transition disabled:opacity-50',
        checked
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-surface-raised text-secondary',
      )}
    >
      {label}
    </button>
  )
}
