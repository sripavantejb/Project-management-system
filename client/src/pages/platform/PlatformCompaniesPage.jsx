import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, KeyRound, Plus, Search } from 'lucide-react'
import { api, companyLoginUrl } from '../../lib/api'
import { CompanyControlPanel } from '../../components/platform/CompanyControlPanel'
import { InviteDetailsModal } from '../../components/layout/GlobalChrome'
import { Button, Card, Input, toast } from '../../components/ui'
import { usePlatformTenants, computeTenantStats } from '../../lib/platformApi'

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  let out = ''
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function PlatformCompaniesPage() {
  const qc = useQueryClient()
  const { data, isLoading } = usePlatformTenants()
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    seatLimit: 30,
    adminLimit: 3,
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  })
  const [details, setDetails] = useState(null)

  const createTenant = useMutation({
    mutationFn: () =>
      api('/platform/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          slug: form.slug.trim().toLowerCase(),
          seatLimit: Number(form.seatLimit) || 30,
          adminLimit: Number(form.adminLimit) || 3,
          adminName: form.adminName,
          adminEmail: form.adminEmail,
          ...(form.adminPassword.trim() ? { adminPassword: form.adminPassword.trim() } : {}),
        }),
      }),
    onSuccess: (res) => {
      toast('Workspace created — copy credentials below', { type: 'success' })
      setDetails({
        companyName: res.tenant.name,
        workspace: res.tenant.slug,
        email: res.admin.email,
        tempPassword: res.tempPassword,
        role: 'Admin',
        loginUrl: companyLoginUrl(res.tenant.slug, 'admin'),
        portal: 'admin',
      })
      setForm({
        name: '',
        slug: '',
        seatLimit: 30,
        adminLimit: 3,
        adminName: '',
        adminEmail: '',
        adminPassword: '',
      })
      setShowCreate(false)
      setExpandedId(res.tenant._id)
      qc.invalidateQueries({ queryKey: ['platform-tenants'] })
      qc.invalidateQueries({ queryKey: ['platform-overview'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const tenants = data?.tenants || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tenants
    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q),
    )
  }, [tenants, search])

  const stats = computeTenantStats(tenants)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          {showCreate ? 'Hide form' : 'New company'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total', value: tenants.length },
          { label: 'Active', value: stats.active },
          { label: 'Trial', value: stats.trial },
          { label: 'Suspended', value: stats.suspended + stats.cancelled },
          { label: 'Users', value: stats.seats },
        ].map((item) => (
          <Card key={item.label} variant="light" className="p-4!">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-primary">{item.value}</p>
          </Card>
        ))}
      </div>

      {showCreate && (
        <Card variant="light" className="space-y-4">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Building2 className="h-4 w-4 text-[var(--accent)]" />
            New company workspace
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Company name" placeholder="Cubic Studio" light value={form.name}
              onChange={(e) => {
                const name = e.target.value
                setForm((s) => ({
                  ...s, name,
                  slug: s.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40),
                }))
              }} />
            <Input label="Workspace slug" placeholder="cubic" light value={form.slug}
              onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
            <Input label="Seat limit" type="number" light value={form.seatLimit}
              onChange={(e) => setForm((s) => ({ ...s, seatLimit: e.target.value }))} />
            <Input label="Max company admins" type="number" light min={1} max={50} value={form.adminLimit}
              onChange={(e) => setForm((s) => ({ ...s, adminLimit: e.target.value }))} />
            <Input label="First admin name" light value={form.adminName}
              onChange={(e) => setForm((s) => ({ ...s, adminName: e.target.value }))} />
            <Input label="First admin email" type="email" className="sm:col-span-2" light value={form.adminEmail}
              onChange={(e) => setForm((s) => ({ ...s, adminEmail: e.target.value }))} />
            <div className="sm:col-span-2">
              <Input label="Admin password" type="text" placeholder="Auto-generate if blank" light value={form.adminPassword}
                onChange={(e) => setForm((s) => ({ ...s, adminPassword: e.target.value }))} />
              <button type="button" onClick={() => setForm((s) => ({ ...s, adminPassword: generatePassword() }))}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">
                <KeyRound className="h-3.5 w-3.5" /> Generate password
              </button>
            </div>
          </div>
          <Button onClick={() => createTenant.mutate()} loading={createTenant.isPending}
            disabled={!form.name || !form.slug || !form.adminName || !form.adminEmail}>
            <Plus className="mr-1 h-4 w-4" /> Create workspace & credentials
          </Button>
        </Card>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="h-10 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15" />
      </div>

      {isLoading && <p className="text-sm text-secondary">Loading…</p>}
      <div className="space-y-3">
        {filtered.map((tenant) => (
          <CompanyControlPanel key={tenant._id} tenant={tenant}
            expanded={expandedId === tenant._id}
            onToggle={() => setExpandedId((id) => (id === tenant._id ? null : tenant._id))} />
        ))}
        {!isLoading && filtered.length === 0 && (
          <Card variant="light" className="text-center text-sm text-secondary">No companies found.</Card>
        )}
      </div>

      <InviteDetailsModal open={!!details} details={details} onClose={() => setDetails(null)} />
    </div>
  )
}
