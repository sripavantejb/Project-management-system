import { useEffect } from 'react'
import { Lock, LogOut, Mail } from 'lucide-react'
import { api, useAuthStore } from '../lib/api'

/** How often to quietly check whether the block has been lifted. */
const RECHECK_INTERVAL_MS = 15_000

/**
 * The payment wall. Renders in place of the entire app — RequireAuth reaches
 * for this instead of <AppShell> the moment the workspace comes back
 * TENANT_BLOCKED (subscription suspended/cancelled by the platform admin).
 *
 * Deliberately gives the user nothing to do here but read why and sign out:
 * no dismiss, no nav, no way back into the app underneath. Access returns on
 * its own (api.js clears the block the moment any request succeeds again)
 * once the platform owner lifts it — no support ticket needed to "unstick" it.
 *
 * Styled to match PlatformLoginPage's brand mark rather than reading as a
 * generic error screen — this is an administrative state, not a fault.
 */
export function TenantLockScreen({ message }) {
  const logout = useAuthStore((s) => s.logout)

  // Nothing else on this screen makes a request, so nothing would otherwise
  // ever discover the block was lifted. api()'s success path already clears
  // tenantBlocked (see lib/api.js) — this just gives it something to
  // succeed against, so "returns automatically" is actually true rather than
  // silently requiring a manual reload.
  useEffect(() => {
    const id = setInterval(() => {
      api('/home').catch(() => {})
    }, RECHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[999] flex min-h-dvh items-center justify-center bg-surface-raised px-5 py-16 text-primary"
      style={{ fontFamily: 'var(--font-landing)' }}
    >
      <div className="w-full max-w-md rounded-[12px] border border-border bg-surface p-8 shadow-[0_8px_24px_rgba(0,0,0,0.08)] md:p-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[#3ecf8e] text-[14px] font-bold text-[#171717]">
            E
          </span>
          <div>
            <p className="text-[16px] font-semibold text-primary">Editco Platform</p>
            <p className="text-[12px] text-secondary">Workspace access</p>
          </div>
        </div>

        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-[#171717]/[0.06]">
          <Lock className="h-[18px] w-[18px] text-primary" strokeWidth={2} />
        </div>

        <h1 className="text-[22px] font-bold tracking-tight text-primary">
          This workspace is paused
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          {message ||
            'Access to this workspace has been paused by the platform owner.'}
        </p>

        <div className="mt-6 flex items-start gap-2.5 rounded-[8px] border border-border bg-surface-raised px-4 py-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-secondary" strokeWidth={2} />
          <p className="text-[13px] leading-relaxed text-secondary">
            To restore access, reach out to your platform owner. Everything
            picks back up automatically the moment they lift it — no need to
            sign back in.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="mt-6 flex items-center gap-1.5 text-[13px] font-medium text-secondary transition-colors hover:text-primary"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  )
}
