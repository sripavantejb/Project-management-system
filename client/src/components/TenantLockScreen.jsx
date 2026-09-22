import { useEffect } from 'react'
import { Lock, LogOut } from 'lucide-react'
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-status-delayed/15">
          <Lock className="h-6 w-6 text-status-delayed" strokeWidth={2} />
        </div>

        <h1 className="text-[17px] font-semibold text-primary">
          Your trial has ended
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          {message ||
            'This workspace is currently unavailable. To keep using it, please contact your platform owner.'}
        </p>

        <div className="mt-6 rounded-xl border border-border bg-canvas px-4 py-3 text-[13px] text-secondary">
          Access returns automatically as soon as this is lifted — no action
          needed once it's sorted.
        </div>

        <button
          type="button"
          onClick={logout}
          className="mx-auto mt-6 flex items-center gap-1.5 text-[13px] font-medium text-secondary transition-colors hover:text-primary"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  )
}
