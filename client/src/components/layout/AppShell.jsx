import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  CheckSquare,
  Camera,
  BarChart3,
  Users,
  Plus,
  Search,
  Bell,
  Settings,
  LogOut,
  Truck,
  Wallet,
  UserPlus,
  Square,
  Clock,
  Menu,
  X,
  Building2,
  Gauge,
  FileSpreadsheet,
  Trophy,
  Package,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../../lib/api'
import { useUiStore } from '../../store/uiStore'
import { toast } from '../ui'
import { cn } from '../../lib/utils'
import { capabilitiesForUser, canInviteUsers } from '../../lib/roles'
import {
  formatTrackedSeconds,
  liveTrackedSeconds,
} from '../../lib/taskStatus'
import {
  GlobalSearchModal,
  InviteModal,
} from './GlobalChrome'
import {
  CollapsedFlyoutCard,
  FlyoutAnchor,
  useCollapsedFlyout,
} from './CollapsedFlyout'
import {
  CreateSpaceModal,
  CreateProjectModal,
} from '../CreateModals'
import { LiveNotificationCenter } from '../notifications/LiveNotificationCenter'
import { ComposeEmailModal } from '../ComposeEmailModal'
import { syncSocketAuth, disconnectSocket } from '../../lib/socket'
import { AnimatePresence, motion } from 'framer-motion'

const ALL_PRIMARY_NAV = [
  {
    to: '/company-admin',
    label: 'Company',
    icon: Gauge,
    capability: 'companyAdmin',
  },
  {
    to: '/approvals',
    label: 'Approvals',
    icon: ShieldCheck,
    capability: 'companyAdmin',
  },
  {
    to: '/portfolio',
    label: 'Dashboard',
    icon: LayoutDashboard,
    capability: 'portfolio',
  },
  {
    to: '/live-board',
    label: 'Live board',
    icon: Activity,
    capability: 'myWork',
  },
  {
    to: '/projects',
    label: 'Projects',
    icon: FolderKanban,
    capability: 'projects',
  },
  {
    to: '/leads',
    label: 'New enquiries',
    icon: Building2,
    capability: 'leads',
  },
  {
    to: '/?view=assigned',
    label: 'My work',
    icon: CheckSquare,
    capability: 'myWork',
  },
  {
    to: '/boq',
    label: 'BOQ / Quotes',
    icon: FileSpreadsheet,
    capability: 'boq',
  },
  {
    to: '/procurement',
    label: 'Materials',
    icon: Truck,
    capability: 'procurement',
  },
  {
    to: '/finance',
    label: 'Revenue',
    icon: Wallet,
    capability: 'finance',
  },
  {
    to: '/billing',
    label: 'Billing',
    icon: Receipt,
    capability: 'finance',
  },
  {
    to: '/inventory',
    label: 'Inventory',
    icon: Package,
    capability: 'inventory',
  },
  {
    to: '/site-feed',
    label: 'Site updates',
    icon: Camera,
    capability: 'siteFeed',
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: BarChart3,
    capability: 'reports',
  },
  {
    to: '/impact',
    label: 'Impact Points',
    icon: Trophy,
    capability: 'impact',
  },
]

function navActive(pathname, search, to) {
  if (to.startsWith('/?')) return pathname === '/'
  if (to === '/projects') {
    return pathname === '/projects' || pathname.startsWith('/projects/')
  }
  if (to === '/portfolio') return pathname.startsWith('/portfolio')
  if (to === '/live-board') return pathname.startsWith('/live-board')
  if (to === '/company-admin') return pathname.startsWith('/company-admin')
  if (to === '/inventory') {
    return (
      pathname === '/inventory' || pathname.startsWith('/inventory/')
    )
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, tenant, logout, setUser, setTenant } = useAuthStore()
  const {
    searchOpen,
    setSearchOpen,
    openSearch,
    inviteOpen,
    setInviteOpen,
    sidebarCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
  } = useUiStore()

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [spaceModalOpen, setSpaceModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const [timerTick, setTimerTick] = useState(() => Date.now())
  const qc = useQueryClient()
  const caps = capabilitiesForUser(user, tenant)
  const primaryNav = ALL_PRIMARY_NAV.filter((item) => caps[item.capability])
  const showPeople = caps.people
  const canCreate = caps.createProject

  const { data: activeTimerData } = useQuery({
    queryKey: ['active-timer'],
    queryFn: () => api('/tasks/active-timer'),
    refetchInterval: 15_000,
  })
  const activeTimer = activeTimerData?.task || null

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications'),
    refetchInterval: 10_000,
  })
  const unreadCount = (notifData?.notifications || []).filter((n) => !n.read)
    .length

  useEffect(() => {
    if (!activeTimer?.timeTrackingStartedAt) return undefined
    const id = window.setInterval(() => setTimerTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimer?.timeTrackingStartedAt])

  useEffect(() => {
    setMobileNavOpen(false)
    setProfileMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!profileMenuOpen) return undefined
    const onPointerDown = (e) => {
      if (!profileMenuRef.current?.contains(e.target)) {
        setProfileMenuOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileMenuOpen])

  useEffect(() => {
    const refreshAccess = () => {
      api('/auth/me')
        .then((result) => {
          if (result?.user) setUser(result.user)
          if (result?.tenant) setTenant(result.tenant)
        })
        .catch(() => {})
    }

    refreshAccess()
    const id = window.setInterval(refreshAccess, 8_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAccess()
    }
    window.addEventListener('focus', refreshAccess)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refreshAccess)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [setUser, setTenant])

  useEffect(() => {
    const userId = user?.id || user?._id
    if (!userId) {
      disconnectSocket()
      return undefined
    }

    const socket = syncSocketAuth()
    if (!socket) return undefined

    const onPermissions = (payload) => {
      const current = useAuthStore.getState().user
      if (current) {
        setUser({
          ...current,
          permissions: payload?.permissions || {},
        })
      }
      api('/auth/me')
        .then((result) => {
          if (result?.user) setUser(result.user)
          if (result?.tenant) setTenant(result.tenant)
        })
        .catch(() => {})
    }

    if (!socket.connected) socket.connect()
    socket.on('permissions:updated', onPermissions)

    return () => {
      socket.off('permissions:updated', onPermissions)
    }
  }, [user?.id, user?._id, setUser, setTenant])

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openSearch])

  useEffect(() => {
    const onSpace = () => setSpaceModalOpen(true)
    const onProject = () => setProjectModalOpen(true)
    window.addEventListener('cubic:new-space', onSpace)
    window.addEventListener('cubic:new-project', onProject)
    return () => {
      window.removeEventListener('cubic:new-space', onSpace)
      window.removeEventListener('cubic:new-project', onProject)
    }
  }, [])

  const stopActiveTimer = async () => {
    if (!activeTimer?._id) return
    try {
      const spent = liveTrackedSeconds(
        activeTimer.timeSpent,
        activeTimer.timeTrackingStartedAt,
      )
      await api(`/tasks/${activeTimer._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          timeSpent: spent,
          timeTrackingStartedAt: null,
          timeTrackingUserId: null,
        }),
      })
      qc.invalidateQueries({ queryKey: ['active-timer'] })
      toast('Timer stopped', { type: 'success' })
    } catch (e) {
      toast(e.message || 'Could not stop timer', { type: 'error' })
    }
  }

  const openActiveTimerTask = () => {
    if (!activeTimer) return
    const projectId =
      typeof activeTimer.projectId === 'object'
        ? activeTimer.projectId?._id
        : activeTimer.projectId
    if (activeTimer.isPersonal || !projectId) {
      navigate('/?view=assigned')
      return
    }
    navigate(`/projects/${projectId}/tasks?task=${activeTimer._id}`)
  }

  const initials = (user?.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const navItemClass = (active, collapsed) =>
    cn(
        'relative flex items-center rounded-[8px] py-1.5 text-[13px] font-medium transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.97]',
      collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
      active
        ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
        : 'text-[var(--shell-text)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text-strong)]',
      active &&
        !collapsed &&
        'before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-accent',
    )

  const SidebarNav = ({ onNavigate, collapsed = false }) => {
    const flyout = useCollapsedFlyout(collapsed)
    const brandLabel = tenant?.name || 'EPM'

    return (
      <>
        <div
          className={cn(
            'mb-3 shrink-0 border-b border-[var(--shell-border)] pb-3 pt-4',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          <FlyoutAnchor
            collapsed={collapsed}
            flyout={flyout}
            id="brand"
            label={brandLabel}
          >
            <div
              className={cn(
                'flex items-center',
                collapsed ? 'justify-center' : 'justify-start',
              )}
              title={brandLabel}
            >
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-transparent',
                  collapsed ? 'h-9 w-9' : 'h-11 w-auto max-w-[160px]',
                )}
              >
                {tenant?.logoUrl ? (
                  <img
                    src={assetUrl(tenant.logoUrl)}
                    alt={brandLabel}
                    className={cn(
                      'object-contain',
                      collapsed ? 'h-full w-full p-0.5' : 'h-11 w-auto max-w-[160px]',
                    )}
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#1e2022] text-[13px] font-medium text-white">
                    {brandLabel.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </FlyoutAnchor>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setProjectModalOpen(true)
                onNavigate?.()
              }}
              title="New project"
              className={cn(
                'mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-[4px] bg-[#1e2022] text-[13px] font-semibold text-white hover:bg-[#33373b]',
                collapsed && 'px-0',
              )}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <span className={cn(collapsed && 'sr-only')}>New project</span>
            </button>
          )}
        </div>

        <nav
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-0 overflow-hidden pb-3',
            collapsed ? 'px-1.5' : 'px-2',
          )}
        >
          {primaryNav.map((item) => {
            const active = navActive(
              location.pathname,
              location.search,
              item.to,
            )
            return (
              <FlyoutAnchor
                key={item.to}
                collapsed={collapsed}
                flyout={flyout}
                id={item.to}
                label={item.label}
                to={item.to}
                icon={item.icon}
                onNavigate={onNavigate}
              >
                <NavLink
                  to={item.to}
                  aria-label={item.label}
                  onClick={onNavigate}
                  className={navItemClass(active, collapsed)}
                >
                  <item.icon
                    className="h-[17px] w-[17px] shrink-0"
                    strokeWidth={1.75}
                  />
                  <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                </NavLink>
              </FlyoutAnchor>
            )
          })}

          {showPeople && (
            <FlyoutAnchor
              collapsed={collapsed}
              flyout={flyout}
              id="/admin"
              label="People"
              to="/admin"
              icon={Users}
              onNavigate={onNavigate}
            >
              <NavLink
                to="/admin"
                aria-label="People"
                onClick={onNavigate}
                className={({ isActive }) => navItemClass(isActive, collapsed)}
              >
                <Users className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
                <span className={cn(collapsed && 'sr-only')}>People</span>
              </NavLink>
            </FlyoutAnchor>
          )}
        </nav>
        <CollapsedFlyoutCard tip={flyout.tip} flyout={flyout} />
      </>
    )
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas text-primary print:h-auto print:overflow-visible">
      {/* Desktop sidebar */}
      <div
        className={cn(
          'relative z-40 hidden h-full shrink-0 print:hidden lg:block',
          'transition-[width] duration-200 ease-out',
          sidebarCollapsed ? 'w-[68px]' : 'w-[240px]',
        )}
      >
        <aside className="flex h-full w-full flex-col overflow-hidden border-r border-[var(--shell-border)] bg-[var(--shell-bg)]">
          <SidebarNav collapsed={sidebarCollapsed} />
        </aside>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-[26px] z-50 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--shell-border)] bg-[var(--shell-bg)] text-[var(--shell-text)] shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text-strong)]"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,280px)] flex-col border-r border-[var(--shell-border)] bg-[var(--shell-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
            <button
              type="button"
              className="absolute right-3 top-4 rounded-[6px] p-1.5 text-[var(--shell-text)] hover:bg-[var(--shell-hover)]"
              onClick={() => setMobileNavOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--shell-border)] bg-[var(--shell-bg)] px-3 print:hidden sm:px-5">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--shell-text)] hover:bg-[var(--shell-hover)] lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="relative mx-auto min-w-0 flex-1 max-w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--shell-text)]" />
            <input
              readOnly
              onFocus={openSearch}
              onClick={openSearch}
              placeholder="Search projects, tasks…"
              className="h-9 w-full cursor-pointer rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-input)] pl-9 pr-3 text-[13px] text-[var(--shell-text-strong)] outline-none placeholder:text-[var(--shell-text)] focus:border-accent/40 focus:bg-[var(--shell-bg)]"
            />
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {activeTimer?.timeTrackingStartedAt ? (
              <div className="mr-1 flex items-center gap-1 rounded-full border border-red-200 bg-red-50 py-0.5 pl-2 pr-1">
                <button
                  type="button"
                  onClick={openActiveTimerTask}
                  className="flex max-w-[140px] items-center gap-1.5"
                >
                  <Clock className="h-3 w-3 text-red-500" />
                  <span className="truncate text-[11px] font-medium text-red-700">
                    {formatTrackedSeconds(
                      liveTrackedSeconds(
                        activeTimer.timeSpent,
                        activeTimer.timeTrackingStartedAt,
                        timerTick,
                      ),
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={stopActiveTimer}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-red-500 hover:bg-red-100"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                </button>
              </div>
            ) : null}

            {canInviteUsers(user) && (
              <IconBtn title="Invite" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4" />
              </IconBtn>
            )}
            <IconBtn
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </IconBtn>
            <IconBtn title="Notifications" onClick={() => navigate('/inbox?tab=primary')}>
              <span className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#dc2626] px-1 text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
            </IconBtn>
            <div className="relative ml-1" ref={profileMenuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-accent text-[11px] font-bold text-[#171717] transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {user?.avatar ? (
                  <img
                    src={assetUrl(user.avatar)}
                    alt={user?.name || 'Profile'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </button>

              <AnimatePresence>
                {profileMenuOpen ? (
                  <motion.div
                    key="profile-menu"
                    role="menu"
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute right-0 top-full z-50 mt-1.5 w-52 origin-top-right overflow-hidden rounded-[8px] border border-border bg-surface py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                  >
                    <div className="border-b border-border px-3 py-2.5">
                      <p className="truncate text-[13px] font-medium text-primary">
                        {user?.name || 'Account'}
                      </p>
                      <p className="truncate text-[11px] text-secondary">
                        {user?.email || ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-secondary transition-colors duration-150 hover:bg-surface-raised hover:text-primary"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        navigate('/settings')
                      }}
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </button>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-secondary transition-colors duration-150 hover:bg-surface-raised hover:text-primary"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        logout()
                        navigate('/login')
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] print:overflow-visible print:pb-0 lg:pb-0">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur print:hidden lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 px-1 py-1">
            <BottomTab
              label="Home"
              active={
                caps.portfolio
                  ? location.pathname.startsWith('/portfolio')
                  : location.pathname === '/'
              }
              onClick={() => navigate(caps.portfolio ? '/portfolio' : '/')}
              icon={LayoutDashboard}
            />
            <BottomTab
              label="Projects"
              active={location.pathname.startsWith('/projects')}
              onClick={() => navigate('/projects')}
              icon={FolderKanban}
            />
            {canCreate ? (
              <button
                type="button"
                onClick={() => setProjectModalOpen(true)}
                className="-mt-3 flex flex-col items-center transition-transform duration-150 ease-out active:scale-[0.97]"
                aria-label="Create"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent text-[#171717] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </span>
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <BottomTab
              label="My work"
              active={location.pathname === '/'}
              onClick={() => navigate('/?view=assigned')}
              icon={CheckSquare}
            />
            <BottomTab
              label="Menu"
              active={false}
              onClick={() => setMobileNavOpen(true)}
              icon={Menu}
            />
          </div>
        </nav>
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <CreateSpaceModal
        open={spaceModalOpen}
        onClose={() => setSpaceModalOpen(false)}
      />
      <CreateProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />
      <LiveNotificationCenter />
      <ComposeEmailModal />
    </div>
  )
}

function IconBtn({ children, title, onClick, className }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-[8px] text-[var(--shell-text)] transition-[background-color,color,transform,opacity] duration-150 ease-out hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text-strong)] active:scale-[0.97] active:opacity-80',
        className,
      )}
    >
      {children}
    </button>
  )
}

function BottomTab({ label, active, onClick, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-[color,transform] duration-200 ease-out active:scale-[0.97]',
        active ? 'text-accent' : 'text-secondary',
      )}
    >
      <Icon className="h-5 w-5 transition-[stroke-width] duration-200" strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </button>
  )
}
