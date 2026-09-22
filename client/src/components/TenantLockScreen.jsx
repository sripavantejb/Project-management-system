import { useEffect } from 'react'
import { Lock, LogOut, Mail } from 'lucide-react'
import { api, useAuthStore } from '../lib/api'

/**
 * How often to quietly check whether the block has been lifted.
 *
 * Short on purpose: this is the entire "no action needed" promise made on
 * screen, and a 15s gap between checks (the original value) read as broken
 * — reactivating felt like it "wasn't starting" because nothing changed for
 * up to 15 real seconds. A few seconds of polling one lightweight endpoint
 * is a trivial cost next to that.
 */
const RECHECK_INTERVAL_MS = 4_000

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

  // The only thing allowed to clear the block — a deliberate call to a
  // gated route, so a coincidental success elsewhere (media/GridFS, anything
  // mounted ahead of the tenant gate) can never flip the lock screen off
  // while still genuinely blocked. That used to cause exactly that: the
  // screen flashing back to the app and immediately re-locking.
  const setTenantBlocked = useAuthStore((s) => s.setTenantBlocked)
  const setTenant = useAuthStore((s) => s.setTenant)
  useEffect(() => {
    let cancelled = false
    const recheck = () => {
      api('/home')
        .then(() => {
          if (cancelled) return
          setTenantBlocked(null)
          // A gated call just succeeded, which is only possible if the
          // tenant is accessible again — but RequireAuth's synchronous
          // check (tenantLooksBlocked) reads the *persisted* tenant, not
          // this runtime flag. Without updating it too, a later hard
          // reload would read the stale cancelled/suspended status back
          // out of storage and lock a workspace that's actually fine.
          const t = useAuthStore.getState().tenant
          if (t && (t.status === 'cancelled' || t.status === 'suspended' || t.cancelledAt)) {
            setTenant({ ...t, status: 'active', cancelledAt: null })
          }
        })
        .catch(() => {})
    }
    // Check the instant this screen mounts too, not just on the next tick —
    // if the block was already lifted before the user even landed here
    // (e.g. they reloaded after reactivation), there's no reason to make
    // them wait out a full interval to find that out.
    recheck()
    const id = setInterval(recheck, RECHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // Deliberately empty deps: recheck() always reads the current tenant via
    // useAuthStore.getState() rather than a closed-over value, so this timer
    // never needs to be torn down and rebuilt just because tenant changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-[999] flex min-h-dvh items-center justify-center bg-surface-raised px-5 py-16 text-primary"
      style={{ fontFamily: 'var(--font-landing)' }}
    >
      <div className="w-full max-w-md rounded-[12px] border border-border bg-surface p-8 shadow-[0_8px_24px_rgba(0,0,0,0.08)] md:p-10">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#171717]/[0.06]">
            <Lock className="h-[16px] w-[16px] text-primary" strokeWidth={2} />
          </span>
          <p className="text-[15px] font-semibold text-primary">Editco Platform</p>
        </div>

        <h1 className="text-[22px] font-bold tracking-tight text-primary">
          This workspace is paused
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          {message ||
            'Your trial version has been completed, so workspace access has been stopped. Contact Editco to reactivate.'}
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
