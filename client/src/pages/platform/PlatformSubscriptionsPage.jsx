import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Button, Card, StatusChip, toast } from '../../components/ui'
import { usePlatformTenants } from '../../lib/platformApi'
import { SUBSCRIPTION_PLANS } from '../../lib/tenantFeatures'

export function PlatformSubscriptionsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = usePlatformTenants()
  const tenants = data?.tenants || []

  const grouped = useMemo(() => {
    const map = { active: [], trial: [], suspended: [], cancelled: [] }
    for (const t of tenants) {
      const key = t.status in map ? t.status : 'active'
      map[key].push(t)
    }
    return map
  }, [tenants])

  const cancelSub = useMutation({
    mutationFn: (id) => api(`/platform/tenants/${id}/cancel-subscription`, { method: 'POST' }),
    onSuccess: () => {
      toast('Subscription cancelled', { type: 'success' })
      qc.invalidateQueries({ queryKey: ['platform-tenants'] })
      qc.invalidateQueries({ queryKey: ['platform-overview'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const reactivate = useMutation({
    mutationFn: (id) => api(`/platform/tenants/${id}/reactivate-subscription`, { method: 'POST' }),
    onSuccess: () => {
      toast('Subscription reactivated', { type: 'success' })
      qc.invalidateQueries({ queryKey: ['platform-tenants'] })
      qc.invalidateQueries({ queryKey: ['platform-overview'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {isLoading && <p className="text-sm text-secondary">Loading…</p>}

      {['active', 'trial', 'suspended', 'cancelled'].map((status) => (
        <Card key={status} variant="light" className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusChip status={status} />
            <span className="text-sm text-secondary">({grouped[status].length})</span>
          </div>
          {grouped[status].length === 0 ? (
            <p className="text-sm text-secondary">None</p>
          ) : (
            <ul className="divide-y divide-border">
              {grouped[status].map((t) => (
                <li key={t._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-primary">{t.name}</p>
                    <p className="text-xs text-secondary">
                      {t.subscriptionPlan || 'pro'} plan · {t.seatsUsed}/{t.seatLimit} seats
                      {t.cancelledAt && ` · cancelled ${new Date(t.cancelledAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/platform/companies" className="text-[12px] font-medium text-[var(--accent)] hover:underline">
                      Manage
                    </Link>
                    {status === 'cancelled' || t.cancelledAt ? (
                      <Button size="sm" variant="secondary" loading={reactivate.isPending}
                        onClick={() => reactivate.mutate(t._id)}>Reactivate</Button>
                    ) : (
                      <Button size="sm" variant="danger" loading={cancelSub.isPending}
                        onClick={() => {
                          if (window.confirm(`Cancel subscription for ${t.name}?`)) cancelSub.mutate(t._id)
                        }}>Cancel</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Card variant="light" className="space-y-2">
        <p className="font-semibold text-primary">Available plans</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((p) => (
            <div key={p.value} className="rounded-xl border border-border bg-surface-raised p-3">
              <p className="font-semibold capitalize text-primary">{p.label}</p>
              <p className="mt-1 text-xs text-secondary">
                {tenants.filter((t) => (t.subscriptionPlan || 'pro') === p.value).length} companies
              </p>
            </div>
          ))}
        </div>
        <Link to="/platform/features" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Configure feature bundles per plan →
        </Link>
      </Card>
    </div>
  )
}
