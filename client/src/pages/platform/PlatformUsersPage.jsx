import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api, useAuthStore } from '../../lib/api'
import { Card, StatusChip } from '../../components/ui'
import { ROLE_LABELS } from '../../lib/roles'

export function PlatformUsersPage() {
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['platform-all-users'],
    queryFn: () => api('/platform/users'),
    enabled: !!user?.isPlatformAdmin,
  })

  const users = useMemo(() => {
    const rows = data?.users || []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.workspace?.toLowerCase().includes(q) ||
        u.companyName?.toLowerCase().includes(q),
    )
  }, [data?.users, search])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          className="h-10 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
        />
      </div>

      <Card variant="light" className="overflow-hidden p-0!">
        {isLoading ? (
          <p className="p-4 text-sm text-secondary">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-secondary">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-surface-raised text-[11px] font-semibold uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-primary">{u.name}</td>
                    <td className="px-4 py-3 text-secondary">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary">{u.companyName}</span>
                      <span className="ml-1 font-mono text-xs text-[var(--accent)]">{u.workspace}</span>
                    </td>
                    <td className="px-4 py-3 text-secondary">{ROLE_LABELS[u.role] || u.role}</td>
                    <td className="px-4 py-3">
                      <StatusChip
                        status={u.isActive !== false ? 'active' : 'suspended'}
                        label={u.isActive !== false ? 'Active' : 'Inactive'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
