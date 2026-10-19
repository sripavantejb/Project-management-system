import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  ToggleLeft,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
} from 'lucide-react'
import { useAuthStore } from '../../lib/api'
import { useUiStore } from '../../store/uiStore'
import { cn } from '../../lib/utils'
import {
  CollapsedFlyoutCard,
  FlyoutAnchor,
  useCollapsedFlyout,
} from './CollapsedFlyout'

const NAV = [
  { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/platform/companies', label: 'Companies', icon: Building2 },
  { to: '/platform/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/platform/users', label: 'All users', icon: Users },
  { to: '/platform/features', label: 'Feature plans', icon: ToggleLeft },
  { to: '/platform/settings', label: 'Settings', icon: Settings },
]

export function PlatformShell({ children }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'EP'

  const navItemClass = (isActive, collapsed) =>
    cn(
      'flex items-center rounded-xl py-2.5 text-[13px] font-medium transition-colors',
      collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
      isActive
        ? 'bg-[#202020] text-white'
        : 'text-secondary hover:bg-white/5 hover:text-white',
    )

  const Sidebar = ({ onNavigate, collapsed = false }) => {
    const flyout = useCollapsedFlyout(collapsed)

    return (
      <>
        <div className={cn('mb-6 pt-1', collapsed ? 'px-2' : 'px-3')}>
          <FlyoutAnchor
            collapsed={collapsed}
            flyout={flyout}
            id="brand"
            label="Editco Platform"
          >
            <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[var(--accent)] text-[13px] font-bold text-[#171717]">
                E
              </span>
              <div className={cn(collapsed && 'sr-only')}>
                <p className="text-[14px] font-semibold leading-tight text-white">Editco Platform</p>
                <p className="text-[11px] text-secondary">EPM administration</p>
              </div>
            </div>
          </FlyoutAnchor>
        </div>

        <nav className={cn('flex flex-1 flex-col gap-0.5', collapsed ? 'px-1.5' : 'px-2')}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <FlyoutAnchor
              key={to}
              collapsed={collapsed}
              flyout={flyout}
              id={to}
              label={label}
              to={to}
              icon={Icon}
              onNavigate={onNavigate}
            >
              <NavLink
                to={to}
                end={end}
                aria-label={label}
                onClick={onNavigate}
                className={({ isActive }) => navItemClass(isActive, collapsed)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn(collapsed && 'sr-only')}>{label}</span>
              </NavLink>
            </FlyoutAnchor>
          ))}
        </nav>

        <div
          className={cn(
            'mt-auto space-y-1 border-t border-white/10 pt-4',
            collapsed ? 'px-1.5' : 'px-2',
          )}
        >
          <FlyoutAnchor
            collapsed={collapsed}
            flyout={flyout}
            id="company-login"
            label="Company login"
            href="/login"
            icon={ExternalLink}
          >
            <a
              href="/login"
              target="_blank"
              rel="noreferrer"
              aria-label="Company login"
              className={cn(
                'flex items-center rounded-xl py-2 text-[13px] font-medium text-secondary hover:bg-white/5 hover:text-white',
                collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
              )}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && 'sr-only')}>Company login</span>
            </a>
          </FlyoutAnchor>
          <FlyoutAnchor
            collapsed={collapsed}
            flyout={flyout}
            id="logout"
            label="Log out"
            icon={LogOut}
            onSelect={() => {
              logout()
              navigate('/platform/login')
            }}
          >
            <button
              type="button"
              aria-label="Log out"
              onClick={() => {
                logout()
                navigate('/platform/login')
              }}
              className={cn(
                'flex w-full items-center rounded-xl py-2 text-[13px] font-medium text-secondary hover:bg-white/5 hover:text-white',
                collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && 'sr-only')}>Log out</span>
            </button>
          </FlyoutAnchor>
          {user?.name && (
            <FlyoutAnchor
              collapsed={collapsed}
              flyout={flyout}
              id="user"
              label={user.name}
            >
              <div
                className={cn(
                  'flex items-center gap-2 py-2',
                  collapsed ? 'justify-center px-0' : 'px-3',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-[#171717]">
                  {initials}
                </span>
                <div className={cn('min-w-0', collapsed && 'sr-only')}>
                  <p className="truncate text-[12px] font-medium text-white">{user.name}</p>
                  <p className="truncate text-[10px] text-secondary">Platform admin</p>
                </div>
              </div>
            </FlyoutAnchor>
          )}
        </div>
        <CollapsedFlyoutCard tip={flyout.tip} flyout={flyout} />
      </>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-primary">
      <div
        className={cn(
          'relative hidden h-full shrink-0 lg:block',
          'transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[68px]' : 'w-[240px]',
        )}
      >
        <aside className="flex h-full w-full flex-col overflow-hidden bg-[#1c1c1c]">
          <div className="flex h-full flex-col py-4">
            <Sidebar collapsed={sidebarCollapsed} />
          </div>
        </aside>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-[26px] z-50 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-[#1c1c1c] text-[#9a9a9a] shadow-[0_2px_8px_rgba(0,0,0,0.25)] hover:bg-[#202020] hover:text-white"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,280px)] flex-col bg-[#1c1c1c] py-4 shadow-2xl">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-secondary hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[6px] text-secondary hover:bg-surface-raised lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-[13px] font-medium text-secondary lg:hidden">Editco Platform</p>
          <div className="ml-auto">
            <button
              type="button"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-[6px] text-secondary transition-colors hover:bg-surface-raised hover:text-primary"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
