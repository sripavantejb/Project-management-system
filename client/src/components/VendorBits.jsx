import { Mail, Send, Star } from 'lucide-react'
import { api } from '../lib/api'
import { poWhatsappLink } from '../lib/phone'
import { poEmailDraft } from '../lib/composeEmail'
import { openComposeEmail } from '../store/composeEmailStore'
import { toast } from './ui'
import { cn } from '../lib/utils'

async function markPoSent(po, via) {
  if (!po?._id) return
  try {
    await api(`/purchase-orders/${po._id}/send`, {
      method: 'POST',
      body: JSON.stringify({ via }),
    })
  } catch {
    /* send UI still works even if tracking fails */
  }
}

/** 1–5 star strip, e.g. for vendor ratings. */
export function Stars({ value = 0, className }) {
  return (
    <span className={cn('inline-flex items-center gap-px', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'h-3.5 w-3.5',
            n <= Math.round(Number(value) || 0)
              ? 'fill-amber-400 text-amber-400'
              : 'text-[#dbe3ec]',
          )}
        />
      ))}
    </span>
  )
}

/** Send PO via WhatsApp Web and/or email compose popup. */
export function SendPoButton({ po, className }) {
  const hasPhone = !!po?.vendor?.phone
  const hasEmail = !!po?.vendor?.email

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        title={
          hasPhone
            ? `WhatsApp Web — send to ${po.vendor?.name}`
            : 'Add a phone number to this vendor'
        }
        onClick={(e) => {
          e.stopPropagation()
          const url = poWhatsappLink(po)
          if (!url) {
            toast(
              'This vendor has no phone number — add it in the vendor directory',
              { type: 'error' },
            )
            return
          }
          window.open(url, '_blank', 'noopener')
          void markPoSent(po, 'whatsapp')
        }}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-white shadow-sm transition',
          hasPhone
            ? 'bg-[#25D366] hover:bg-[#1fb958]'
            : 'bg-[#a7dcbb] hover:bg-[#98d2ad]',
        )}
      >
        <Send className="h-3 w-3" />
        WA
      </button>
      <button
        type="button"
        title={
          hasEmail
            ? `Email this order to ${po.vendor?.name}`
            : 'Opens compose — add vendor email if needed'
        }
        onClick={(e) => {
          e.stopPropagation()
          openComposeEmail(poEmailDraft(po))
          void markPoSent(po, 'email')
        }}
        className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2 text-[11.5px] font-semibold text-[#171717] shadow-sm transition hover:bg-[var(--accent-hover)]"
      >
        <Mail className="h-3 w-3" />
        Mail
      </button>
    </span>
  )
}
