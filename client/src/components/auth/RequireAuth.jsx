import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../lib/api'
import { capabilitiesForUser, homePathForUser } from '../../lib/roles'
import { AppShell } from '../layout/AppShell'
import { PlatformShell } from '../layout/PlatformShell'
import { AnimatedPage } from '../motion/AnimatedPage'
import { TenantLockScreen } from '../TenantLockScreen'

/**
 * True if the last tenant we know about (persisted from login/refresh) was
 * itself already blocked. Mirrors the server's tenantIsAccessible check.
 *
 * tenantBlocked (the other half of this gate) only exists after some gated
 * request has actually failed — which takes a request. On a hard reload
 * that hasn't happened yet, so without this a cancelled workspace would
 * flash the real app (AppShell, real data) for the split second before the
 * first request comes back 403. Checking the cached tenant synchronously
 * closes that: the lock screen is the very first paint, never a fallback.
 */
export function tenantLooksBlocked(tenant) {
  if (!tenant) return false
  return tenant.status === 'suspended' || tenant.status === 'cancelled' || !!tenant.cancelledAt
}

export function RequireAuth({ roles }) {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const tenant = useAuthStore((s) => s.tenant)
  const tenantBlocked = useAuthStore((s) => s.tenantBlocked)
  const location = useLocation()

  if (!user || !accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Platform admins manage every company's subscription from here, so their
  // own session must never get walled off by one company's block.
  if (!user.isPlatformAdmin && (tenantBlocked || tenantLooksBlocked(tenant))) {
    return <TenantLockScreen message={tenantBlocked?.message} />
  }

  if (roles && !roles.includes(user.role) && !user.isPlatformAdmin) {
    return <Navigate to={homePathForUser(user) || '/projects'} replace />
  }

  if (
    !user.onboardingCompleted &&
    !location.pathname.startsWith('/onboarding')
  ) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <AppShell>
      <AnimatedPage>
        <Outlet />
      </AnimatedPage>
    </AppShell>
  )
}

/** Inline gate for a single page (does not wrap AppShell). */
export function RoleGate({ roles, children }) {
  const user = useAuthStore((s) => s.user)
  if (!roles.includes(user?.role) && !user?.isPlatformAdmin) {
    return <Navigate to={homePathForUser(user) || '/projects'} replace />
  }
  return children
}

export function CapabilityGate({ capability, children }) {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const caps = capabilitiesForUser(user, tenant)
  if (!caps[capability]) {
    return <Navigate to={homePathForUser(user) || '/projects'} replace />
  }
  return children
}

export function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)

  if (user && accessToken) {
    return <Navigate to={homePathForUser(user) || '/projects'} replace />
  }

  return <Outlet />
}

export function PlatformGuestOnly() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)

  if (user && accessToken && user.isPlatformAdmin) {
    return <Navigate to="/platform" replace />
  }

  return <Outlet />
}

export function RequirePlatformAuth() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const location = useLocation()

  if (!user || !accessToken) {
    return <Navigate to="/platform/login" replace state={{ from: location }} />
  }

  if (!user.isPlatformAdmin) {
    return <Navigate to={homePathForUser(user) || '/projects'} replace />
  }

  return (
    <PlatformShell>
      <AnimatedPage>
        <Outlet />
      </AnimatedPage>
    </PlatformShell>
  )
}
