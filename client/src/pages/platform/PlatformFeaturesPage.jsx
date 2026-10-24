import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Save } from 'lucide-react'
import { api } from '../../lib/api'
import { Button, Card, Select, toast } from '../../components/ui'
import { usePlatformTenants } from '../../lib/platformApi'
import {
  TENANT_FEATURE_KEYS,
  featureKeysByGroup,
  normalizeTenantFeatures,
} from '../../lib/tenantFeatures'
import { PLAN_FEATURE_PRESETS, PLAN_SEAT_DEFAULTS } from '../../lib/planPresets'
import { cn } from '../../lib/utils'

function PageToggle({ item, checked, onChange }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition',
        checked
          ? 'border-[var(--accent)]/35 bg-[var(--nav-active-bg)]'
          : 'border-border bg-surface-raised opacity-80',
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-primary">{item.label}</p>
        <p className="truncate text-[11px] text-secondary">{item.page}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-[var(--accent)]' : 'bg-[#c7c7c7]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  )
}

export function PlatformFeaturesPage() {
  const qc = useQueryClient()
  const { data } = usePlatformTenants()
  const tenants = data?.tenants || []
  const [selectedTenant, setSelectedTenant] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('pro')
  const [pageDraft, setPageDraft] = useState(null)

  const tenant = useMemo(
    () => tenants.find((t) => String(t._id) === String(selectedTenant)),
    [tenants, selectedTenant],
  )

  useEffect(() => {
    if (!tenant) {
      setPageDraft(null)
      return
    }
    setPageDraft(normalizeTenantFeatures(tenant.features))
  }, [tenant])

  const applyPlan = useMutation({
    mutationFn: ({ tenantId, plan }) =>
      api(`/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          subscriptionPlan: plan,
          seatLimit: PLAN_SEAT_DEFAULTS[plan],
          features: PLAN_FEATURE_PRESETS[plan],
        }),
      }),
    onSuccess: () => {
      toast('Plan applied to company', { type: 'success' })
      qc.invalidateQueries({ queryKey: ['platform-tenants'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const savePages = useMutation({
    mutationFn: () =>
      api(`/platform/tenants/${selectedTenant}`, {
        method: 'PATCH',
        body: JSON.stringify({ features: pageDraft }),
      }),
    onSuccess: () => {
      toast('Page visibility saved for this company', { type: 'success' })
      qc.invalidateQueries({ queryKey: ['platform-tenants'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card variant="light" className="space-y-4">
        <div>
          <p className="font-semibold text-primary">Pages visible per company</p>
          <p className="text-xs text-secondary">
            Pick a company, then toggle which sidebar pages their team can open.
          </p>
        </div>
        <Select
          label="Company"
          light
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          options={[
            { value: '', label: 'Select company…' },
            ...tenants.map((t) => ({
              value: t._id,
              label: `${t.name} (${t.slug})`,
            })),
          ]}
        />

        {!selectedTenant ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-secondary">
            Select a company to edit page visibility
          </p>
        ) : !pageDraft ? (
          <p className="text-sm text-secondary">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPageDraft(
                    Object.fromEntries(
                      TENANT_FEATURE_KEYS.map(({ key }) => [key, true]),
                    ),
                  )
                }
              >
                All on
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPageDraft(
                    Object.fromEntries(
                      TENANT_FEATURE_KEYS.map(({ key }) => [key, false]),
                    ),
                  )
                }
              >
                All off
              </Button>
              <Button
                size="sm"
                loading={savePages.isPending}
                onClick={() => savePages.mutate()}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                Save page visibility
              </Button>
            </div>
            {featureKeysByGroup().map(({ group, items }) => (
              <div key={group}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
                  {group}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <PageToggle
                      key={item.key}
                      item={item}
                      checked={pageDraft[item.key] !== false}
                      onChange={(on) =>
                        setPageDraft((s) => ({ ...s, [item.key]: on }))
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {['starter', 'pro', 'enterprise'].map((plan) => (
          <Card key={plan} variant="light" className="space-y-3">
            <p className="text-lg font-semibold capitalize text-primary">{plan}</p>
            <p className="text-xs text-secondary">
              {PLAN_SEAT_DEFAULTS[plan]} seats default
            </p>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
              {TENANT_FEATURE_KEYS.map(({ key, label }) => {
                const on = PLAN_FEATURE_PRESETS[plan][key]
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-2 ${on ? 'text-primary' : 'text-secondary'}`}
                  >
                    <Check
                      className={`h-3.5 w-3.5 ${on ? 'text-[#10b981]' : 'opacity-30'}`}
                    />
                    {label}
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
      </div>

      <Card variant="light" className="space-y-4">
        <p className="font-semibold text-primary">Apply plan bundle to a company</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Company"
            light
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            options={[
              { value: '', label: 'Select company…' },
              ...tenants.map((t) => ({
                value: t._id,
                label: `${t.name} (${t.slug})`,
              })),
            ]}
          />
          <Select
            label="Plan to apply"
            light
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value)}
            options={[
              { value: 'starter', label: 'Starter' },
              { value: 'pro', label: 'Pro' },
              { value: 'enterprise', label: 'Enterprise' },
            ]}
          />
        </div>
        <Button
          disabled={!selectedTenant}
          loading={applyPlan.isPending}
          onClick={() =>
            applyPlan.mutate({ tenantId: selectedTenant, plan: selectedPlan })
          }
        >
          Apply plan & pages
        </Button>
        <p className="text-xs text-secondary">
          Applies the plan&apos;s default page set and seat limit. You can still
          fine-tune individual pages above or under Companies.
        </p>
      </Card>
    </div>
  )
}
