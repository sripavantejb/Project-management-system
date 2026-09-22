import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RequireAuth,
  GuestOnly,
  PlatformGuestOnly,
  RequirePlatformAuth,
  RoleGate,
  CapabilityGate,
  tenantLooksBlocked,
} from './components/auth/RequireAuth'
import { TenantLockScreen } from './components/TenantLockScreen'
import {
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
} from './pages/auth/AuthPages'
import { PlatformLoginPage } from './pages/auth/PlatformLoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HomePage } from './pages/HomePage'
import { PortfolioPage } from './pages/PortfolioPage'
import { LiveDashboardPage } from './pages/LiveDashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectWorkspace } from './pages/project/ProjectWorkspace'
import { ProjectOverview } from './pages/project/ProjectOverview'
import { ProjectNotes } from './pages/project/MeetingNotes'
import { ProjectTasks } from './pages/project/ProjectTasks'
import { ProjectFiles } from './pages/project/ProjectFiles'
import { BoqPage } from './pages/BoqPage'
import {
  ProjectProcurement,
  ProjectSite,
  ProjectTeam,
} from './pages/project/ProjectModules'
import { LeadsPage } from './pages/LeadsPage'
import { FinancePage } from './pages/MoneyPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { BillingPage } from './pages/BillingPage'
import { TaxInvoicesPage } from './pages/TaxInvoicesPage'
import { ReportsPage } from './pages/ReportsPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import {
  SettingsPage,
  MobileSupervisorPage,
} from './pages/MorePages'
import { PlatformOverviewPage } from './pages/platform/PlatformOverviewPage'
import { PlatformCompaniesPage } from './pages/platform/PlatformCompaniesPage'
import { PlatformSubscriptionsPage } from './pages/platform/PlatformSubscriptionsPage'
import { PlatformUsersPage } from './pages/platform/PlatformUsersPage'
import { PlatformFeaturesPage } from './pages/platform/PlatformFeaturesPage'
import { PlatformSettingsPage } from './pages/platform/PlatformSettingsPage'
import { InboxPage } from './pages/InboxPage'
import { AssignedCommentsPage } from './pages/AssignedCommentsPage'
import { AdminPeoplePage } from './pages/AdminPeoplePage'
import { SiteFeedPage } from './pages/SiteFeedPage'
import { ImpactPointsPage } from './pages/ImpactPointsPage'
import { CompanyAdminDashboard } from './pages/CompanyAdminDashboard'
import {
  InventoryStockPage,
  InventoryMovementsPage,
} from './pages/InventoryPages'
import { PagePad } from './components/layout/PagePad'
import { ToastViewport } from './components/ui'
import { useAuthStore } from './lib/api'
import {
  homePathForUser,
  COMPANY_ADMIN_ROLES,
} from './lib/roles'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function OnboardingRoute() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const tenant = useAuthStore((s) => s.tenant)
  const tenantBlocked = useAuthStore((s) => s.tenantBlocked)
  if (!user || !accessToken) return <Navigate to="/login" replace />
  // This route sits outside RequireAuth (a brand-new user has nowhere else
  // to go until onboarding is done), so it needs its own copy of the same
  // check — otherwise a workspace cancelled mid-onboarding just... doesn't
  // lock, since nothing here was ever asking.
  if (!user.isPlatformAdmin && (tenantBlocked || tenantLooksBlocked(tenant))) {
    return <TenantLockScreen message={tenantBlocked?.message} />
  }
  return <OnboardingPage />
}

function HomeRedirect() {
  const user = useAuthStore((s) => s.user)
  return <Navigate to={homePathForUser(user) || '/projects'} replace />
}

function ProjectTabRedirect() {
  const { id } = useParams()
  return <Navigate to={`/projects/${id}/overview`} replace />
}

/** BOQ moved out of the project workspace into its own top-level module. */
function ProjectBoqRedirect() {
  const { id } = useParams()
  return <Navigate to={`/boq/${id}`} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<PlatformGuestOnly />}>
            <Route path="/platform/login" element={<PlatformLoginPage />} />
          </Route>

          <Route element={<RequirePlatformAuth />}>
            <Route path="/platform" element={<PlatformOverviewPage />} />
            <Route path="/platform/companies" element={<PlatformCompaniesPage />} />
            <Route path="/platform/subscriptions" element={<PlatformSubscriptionsPage />} />
            <Route path="/platform/users" element={<PlatformUsersPage />} />
            <Route path="/platform/features" element={<PlatformFeaturesPage />} />
            <Route path="/platform/settings" element={<PlatformSettingsPage />} />
          </Route>

          <Route path="/onboarding" element={<OnboardingRoute />} />

          <Route element={<RequireAuth />}>
            <Route
              path="/"
              element={
                <PagePad>
                  <HomePage />
                </PagePad>
              }
            />
            <Route path="/home" element={<Navigate to="/portfolio" replace />} />
            <Route
              path="/my-tasks"
              element={<Navigate to="/?view=assigned" replace />}
            />
            <Route path="/inbox" element={<InboxPage />} />
            <Route
              path="/notifications"
              element={<Navigate to="/inbox" replace />}
            />
            <Route
              path="/site-feed"
              element={
                <CapabilityGate capability="siteFeed">
                  <PagePad>
                    <SiteFeedPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/approvals"
              element={
                <RoleGate roles={COMPANY_ADMIN_ROLES}>
                  <PagePad>
                    <ApprovalsPage />
                  </PagePad>
                </RoleGate>
              }
            />
            <Route
              path="/company-admin"
              element={
                <RoleGate roles={COMPANY_ADMIN_ROLES}>
                  <PagePad>
                    <CompanyAdminDashboard />
                  </PagePad>
                </RoleGate>
              }
            />
            <Route
              path="/inventory"
              element={
                <RoleGate roles={COMPANY_ADMIN_ROLES}>
                  <PagePad>
                    <InventoryStockPage />
                  </PagePad>
                </RoleGate>
              }
            />
            <Route
              path="/inventory/movements"
              element={
                <RoleGate roles={COMPANY_ADMIN_ROLES}>
                  <PagePad>
                    <InventoryMovementsPage />
                  </PagePad>
                </RoleGate>
              }
            />
            <Route
              path="/admin"
              element={
                <CapabilityGate capability="people">
                  <AdminPeoplePage />
                </CapabilityGate>
              }
            />
            <Route
              path="/portfolio"
              element={
                <CapabilityGate capability="portfolio">
                  <PagePad>
                    <PortfolioPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/live-board"
              element={
                <CapabilityGate capability="myWork">
                  <PagePad>
                    <LiveDashboardPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/leads"
              element={
                <CapabilityGate capability="leads">
                  <PagePad>
                    <LeadsPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/projects"
              element={
                <PagePad>
                  <ProjectsPage />
                </PagePad>
              }
            />
            <Route path="/projects/:id" element={<ProjectWorkspace />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<ProjectOverview />} />
              <Route path="notes" element={<ProjectNotes />} />
              <Route path="tasks" element={<ProjectTasks />} />
              <Route path="board" element={<Navigate to="../tasks" replace />} />
              <Route path="gantt" element={<Navigate to="../tasks" replace />} />
              <Route
                path="calendar"
                element={<Navigate to="../tasks" replace />}
              />
              <Route
                path="activity"
                element={<Navigate to="../overview" replace />}
              />
              <Route
                path="portal"
                element={<Navigate to="../team" replace />}
              />
              <Route
                path="site"
                element={
                  <CapabilityGate capability="siteFeed">
                    <ProjectSite />
                  </CapabilityGate>
                }
              />
              <Route
                path="team"
                element={
                  <CapabilityGate capability="manageProjects">
                    <ProjectTeam />
                  </CapabilityGate>
                }
              />
              <Route
                path="files"
                element={<ProjectFiles />}
              />
              <Route path="boq" element={<ProjectBoqRedirect />} />
              <Route
                path="procurement"
                element={
                  <CapabilityGate capability="procurement">
                    <ProjectProcurement />
                  </CapabilityGate>
                }
              />
              <Route path="*" element={<ProjectTabRedirect />} />
            </Route>
            <Route
              path="/boq"
              element={
                <CapabilityGate capability="boq">
                  <BoqPage />
                </CapabilityGate>
              }
            />
            <Route
              path="/boq/:projectId"
              element={
                <CapabilityGate capability="boq">
                  <BoqPage />
                </CapabilityGate>
              }
            />
            <Route
              path="/procurement"
              element={
                <CapabilityGate capability="procurement">
                  <PagePad>
                    <MaterialsPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/finance"
              element={
                <CapabilityGate capability="finance">
                  <PagePad>
                    <FinancePage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/billing"
              element={
                <CapabilityGate capability="finance">
                  <PagePad>
                    <BillingPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/billing/tax-invoices"
              element={
                <CapabilityGate capability="finance">
                  <TaxInvoicesPage />
                </CapabilityGate>
              }
            />
            <Route
              path="/reports"
              element={
                <CapabilityGate capability="reports">
                  <PagePad>
                    <ReportsPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/impact"
              element={
                <CapabilityGate capability="impact">
                  <PagePad>
                    <ImpactPointsPage />
                  </PagePad>
                </CapabilityGate>
              }
            />
            <Route
              path="/settings"
              element={
                <PagePad>
                  <SettingsPage />
                </PagePad>
              }
            />
            <Route
              path="/mobile"
              element={
                <CapabilityGate capability="mobile">
                  <PagePad>
                    <MobileSupervisorPage />
                  </PagePad>
                </CapabilityGate>
              }
            />

            {/* Old ClickUp-style routes → simple redirects */}
            <Route path="/planner" element={<Navigate to="/projects" replace />} />
            <Route path="/channels" element={<Navigate to="/inbox" replace />} />
            <Route
              path="/channels/:channelId"
              element={<Navigate to="/inbox" replace />}
            />
            <Route
              path="/assigned-comments"
              element={
                <PagePad>
                  <AssignedCommentsPage />
                </PagePad>
              }
            />
            <Route path="/quotations" element={<Navigate to="/boq" replace />} />
            <Route path="/ui-kit" element={<Navigate to="/projects" replace />} />
            <Route
              path="/platform/*"
              element={<Navigate to="/platform" replace />}
            />
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        <ToastViewport />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
