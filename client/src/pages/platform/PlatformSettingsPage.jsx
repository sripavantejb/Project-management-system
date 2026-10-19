import { useAuthStore } from '../../lib/api'
import { Card } from '../../components/ui'

export function PlatformSettingsPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card variant="light" className="space-y-3">
        <p className="font-semibold text-primary">Your platform account</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-secondary">Name</dt>
            <dd className="font-medium text-primary">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-secondary">Email</dt>
            <dd className="font-medium text-primary">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-secondary">Role</dt>
            <dd className="font-medium text-primary">Platform administrator</dd>
          </div>
          <div>
            <dt className="text-secondary">Access</dt>
            <dd className="font-medium text-primary">All companies on EPM</dd>
          </div>
        </dl>
      </Card>

      <Card variant="light" className="space-y-3">
        <p className="font-semibold text-primary">Login URLs</p>
        <ul className="space-y-2 text-sm text-secondary">
          <li>
            <span className="font-medium text-primary">Platform admin: </span>
            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-[var(--accent)]">/platform/login</code>
          </li>
          <li>
            <span className="font-medium text-primary">Company workspaces: </span>
            <code className="rounded bg-surface-raised px-1.5 py-0.5 text-[var(--accent)]">/login</code>
          </li>
        </ul>
      </Card>

      <Card variant="light" className="space-y-2">
        <p className="font-semibold text-primary">How it works</p>
        <p className="text-sm leading-relaxed text-secondary">
          You are the single Editco platform admin. Each company (e.g. Cubic) is an isolated workspace.
          You create credentials for their admins — they never get platform access. Use Companies to
          manage users and features, Subscriptions to cancel or reactivate billing, and Feature plans
          to apply Starter / Pro / Enterprise bundles.
        </p>
      </Card>
    </div>
  )
}
