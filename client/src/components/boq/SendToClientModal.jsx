import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Mail, MessageCircle, Send, X } from 'lucide-react'
import { api } from '../../lib/api'
import { formatInr } from '../../lib/format'
import { toast } from '../ui'
import { cn } from '../../lib/utils'

/**
 * Channel picker after "Mark sent to client":
 * Email → workspace SMTP with Approve CTA
 * WhatsApp → opens WhatsApp Web with prefilled approve link
 */
export function SendToClientModal({
  open,
  onClose,
  quotationId,
  project,
  docMeta,
  grandTotal,
  title,
  onSent,
}) {
  const [channel, setChannel] = useState('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (!open) return
    setChannel('email')
    setEmail(
      String(
        project?.clientEmail || docMeta?.emailId || '',
      )
        .trim()
        .toLowerCase(),
    )
    setPhone(String(project?.clientPhone || docMeta?.contactNo || '').trim())
  }, [open, project, docMeta])

  const send = useMutation({
    mutationFn: () =>
      api(`/quotations/${quotationId}/send-to-client`, {
        method: 'POST',
        body: JSON.stringify({
          channel,
          email: channel === 'email' ? email.trim() : undefined,
          phone: channel === 'whatsapp' ? phone.trim() : undefined,
        }),
      }),
    onSuccess: (res) => {
      if (res.channel === 'whatsapp' && res.whatsappUrl) {
        window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer')
        toast('WhatsApp opened — send the message to the client', {
          type: 'success',
        })
      } else {
        toast(res.message || `Sent to ${res.sentTo}`, { type: 'success' })
      }
      onSent?.(res)
      onClose?.()
    },
    onError: (e) => toast(e.message || 'Could not send to client', { type: 'error' }),
  })

  if (!open) return null

  const canSubmit =
    !send.isPending &&
    quotationId &&
    (channel === 'email'
      ? email.trim().includes('@')
      : phone.replace(/\D/g, '').length >= 8)

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#0b1220]/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send quotation to client"
        className="relative w-full max-w-[440px] overflow-hidden rounded-[20px] border border-[#e4eaf3] bg-surface shadow-[0_28px_80px_rgba(9,20,38,0.28)]"
      >
        <div className="flex items-start gap-3 border-b border-[#eef2f7] px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef4ff] text-[var(--accent-hover)]">
            <Send className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-primary">
              Send to client for approval
            </h2>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-secondary">
              They get a one-tap Approve link. When they approve, this sheet
              locks and the project budget is set to{' '}
              <span className="font-semibold tabular-nums text-primary">
                {formatInr(grandTotal)}
              </span>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-[#f4f7fb] hover:text-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="truncate text-[12px] text-[#9aa7ba]">
            {title || 'Quotation'}
            {project?.name ? ` · ${project.name}` : ''}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <ChannelCard
              active={channel === 'email'}
              onClick={() => setChannel('email')}
              icon={Mail}
              label="Email"
              hint="Send from workspace SMTP"
            />
            <ChannelCard
              active={channel === 'whatsapp'}
              onClick={() => setChannel('whatsapp')}
              icon={MessageCircle}
              label="WhatsApp"
              hint="Open chat with approve link"
            />
          </div>

          {channel === 'email' ? (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa7ba]">
                Client email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="mt-1.5 h-10 w-full rounded-xl border border-[#e4eaf3] bg-[#f7f9fc] px-3 text-[13px] text-primary outline-none transition focus:border-[#b6cef7] focus:bg-surface focus:ring-2 focus:ring-[var(--accent)]/10"
                autoFocus
              />
              <span className="mt-1.5 block text-[11px] leading-relaxed text-[#9aa7ba]">
                Email includes an Approve quotation button. Configure SMTP under
                Settings → Mail &amp; alerts if sending fails.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa7ba]">
                Client WhatsApp
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1.5 h-10 w-full rounded-xl border border-[#e4eaf3] bg-[#f7f9fc] px-3 text-[13px] text-primary outline-none transition focus:border-[#b6cef7] focus:bg-surface focus:ring-2 focus:ring-[var(--accent)]/10"
                autoFocus
              />
              <span className="mt-1.5 block text-[11px] leading-relaxed text-[#9aa7ba]">
                WhatsApp Web opens with the message ready — press Send there.
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[#eef2f7] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-[#e4eaf3] text-[13px] font-semibold text-secondary transition hover:bg-[#f4f7fb]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => send.mutate()}
            className="btn-create inline-flex h-10 flex-[1.35] items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition disabled:opacity-40"
          >
            {channel === 'email' ? (
              <Mail className="h-3.5 w-3.5" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" />
            )}
            {send.isPending
              ? 'Sending…'
              : channel === 'email'
                ? 'Send email'
                : 'Open WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChannelCard({ active, onClick, icon: Icon, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition',
        active
          ? 'border-[var(--create-bg)] bg-[#f4f7fb] ring-1 ring-[var(--create-bg)]'
          : 'border-[#e4eaf3] bg-surface hover:border-[#c7dbfb]',
      )}
    >
      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--create-bg)] text-white">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      <Icon
        className={cn(
          'h-4 w-4',
          active ? 'text-[var(--create-bg)]' : 'text-[#9aa7ba]',
        )}
      />
      <span className="text-[13px] font-semibold text-primary">{label}</span>
      <span className="text-[10.5px] leading-snug text-[#9aa7ba]">{hint}</span>
    </button>
  )
}
