import { Link } from 'react-router-dom'
import { Building2, Users, FolderKanban, AlertTriangle } from 'lucide-react'
import { Card, StatusChip } from '../../components/ui'
import { usePlatformOverview, usePlatformTenants } from '../../lib/platformApi'

function StatCard({ label, value, hint }) {
  return (
    <Card variant="light" className="p-4!">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
      {hint && <p className="mt-1 text-xs text-secondary">{hint}</p>}
    </Card>
  )
}

export function PlatformOverviewPage() {
  const { data: overviewData, isLoading: overviewLoading } = usePlatformOverview()
  const { data: tenantsData } = usePlatformTenants()
  const overview = overviewData?.overview
  const tenants = tenantsData?.tenants || []

  const needsAttention = tenants.filter(
    (t) =>
      t.status === 'suspended' ||
      t.status === 'cancelled' ||
      (t.seatsUsed ?? 0) >= (t.seatLimit ?? 30) * 0.9,
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {overviewLoading ? (
        <p className="text-sm text-secondary">Loading overview…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Companies" value={overview?.companies ?? 0} />
          <StatCard label="Active users" value={overview?.activeUsers ?? 0} hint={`${overview?.totalUsers ?? 0} total`} />
          <StatCard label="Projects" value={overview?.totalProjects ?? 0} />
          <StatCard
            label="Active subscriptions"
            value={overview?.byStatus?.active ?? 0}
            hint={`${overview?.byStatus?.trial ?? 0} on trial`}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card variant="light" className="space-y-3">
          <p className="font-semibold text-primary">Subscription breakdown</p>
          <ul className="space-y-2 text-sm">
            {[
              ['Active', overview?.byStatus?.active],
              ['Trial', overview?.byStatus?.trial],
              ['Suspended', overview?.byStatus?.suspended],
              ['Cancelled', overview?.byStatus?.cancelled],
            ].map(([label, count]) => (
              <li key={label} className="flex justify-between text-secondary">
                <span>{label}</span>
                <span className="font-semibold text-primary">{count ?? 0}</span>
              </li>
            ))}
          </ul>
          <Link to="/platform/subscriptions" className="text-sm font-medium text-[var(--accent)] hover:underline">
            Manage subscriptions →
          </Link>
        </Card>

        <Card variant="light" className="space-y-3">
          <p className="font-semibold text-primary">Plans in use</p>
          <ul className="space-y-2 text-sm">
            {[
              ['Starter', overview?.byPlan?.starter],
              ['Pro', overview?.byPlan?.pro],
              ['Enterprise', overview?.byPlan?.enterprise],
            ].map(([label, count]) => (
              <li key={label} className="flex justify-between text-secondary">
                <span>{label}</span>
                <span className="font-semibold text-primary">{count ?? 0}</span>
              </li>
            ))}
          </ul>
          <Link to="/platform/features" className="text-sm font-medium text-[var(--accent)] hover:underline">
            Feature plans →
          </Link>
        </Card>
      </div>

      {needsAttention.length > 0 && (
        <Card variant="light" className="space-y-3 border-[#fecaca] bg-[#fef2f2]">
          <div className="flex items-center gap-2 font-semibold text-[#991b1b]">
            <AlertTriangle className="h-4 w-4" />
            Needs attention ({needsAttention.length})
          </div>
          <ul className="divide-y divide-[#fecaca]">
            {needsAttention.map((t) => (
              <li key={t._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-primary">{t.name}</span>
                <div className="flex items-center gap-2">
                  <StatusChip status={t.status} />
                  <Link
                    to="/platform/companies"
                    className="text-[var(--accent)] hover:underline"
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card variant="light" className="space-y-3">
        <p className="font-semibold text-primary">Quick actions</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to="/platform/companies"
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-4 hover:border-[var(--accent)]/30 hover:bg-[var(--nav-active-bg)]"
          >
            <Building2 className="h-5 w-5 text-[var(--accent)]" />
            <span className="text-sm font-medium text-primary">Manage companies</span>
          </Link>
          <Link
            to="/platform/users"
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-4 hover:border-[var(--accent)]/30 hover:bg-[var(--nav-active-bg)]"
          >
            <Users className="h-5 w-5 text-[var(--accent)]" />
            <span className="text-sm font-medium text-primary">Browse all users</span>
          </Link>
          <Link
            to="/platform/features"
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-4 hover:border-[var(--accent)]/30 hover:bg-[var(--nav-active-bg)]"
          >
            <FolderKanban className="h-5 w-5 text-[var(--accent)]" />
            <span className="text-sm font-medium text-primary">Configure feature plans</span>
          </Link>
        </div>
      </Card>
    </div>
  )
}
