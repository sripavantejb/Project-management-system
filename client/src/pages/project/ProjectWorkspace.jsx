import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  LayoutList,
  Share2,
  FileImage,
  Camera,
  Send,
  StickyNote,
  Users,
  Trash2,
  Truck,
  Mail,
  MessageCircle,
} from 'lucide-react'
import { api, useAuthStore } from '../../lib/api'
import { Button, Modal, Skeleton, toast } from '../../components/ui'
import { cn } from '../../lib/utils'
import { formatInr, stageLabel } from '../../lib/format'
import { whatsappLink } from '../../lib/phone'
import { clientProjectEmailDraft } from '../../lib/composeEmail'
import { openComposeEmail } from '../../store/composeEmailStore'
import { capabilitiesForUser } from '../../lib/roles'

/** Only what an interior studio needs inside a project */
const MAIN_TABS = [
  { to: 'overview', label: 'Home', icon: LayoutDashboard, capability: 'overview' },
  { to: 'tasks', label: 'Tasks', icon: LayoutList, capability: 'tasks' },
  { to: 'procurement', label: 'Materials', icon: Truck, capability: 'procurement' },
  { to: 'site', label: 'Site', icon: Camera, capability: 'site' },
  { to: 'notes', label: 'Notes', icon: StickyNote, capability: 'overview' },
  { to: 'files', label: 'Drawings', icon: FileImage, capability: 'files' },
  { to: 'team', label: 'Team', icon: Users, capability: 'team' },
]

export function ProjectWorkspace() {
  const { id } = useParams()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api(`/projects/${id}`),
    retry: (count, err) => (err?.status === 404 ? false : count < 1),
  })

  const bustProjectCaches = (projectId) => {
    qc.setQueryData(['projects-nav'], (old) => {
      if (!old?.projects) return old
      return {
        ...old,
        projects: old.projects.filter((p) => String(p._id) !== String(projectId)),
      }
    })
    qc.setQueriesData({ queryKey: ['projects'] }, (old) => {
      if (!old?.projects) return old
      return {
        ...old,
        projects: old.projects.filter((p) => String(p._id) !== String(projectId)),
      }
    })
    qc.removeQueries({ queryKey: ['project', projectId] })
    qc.invalidateQueries({ queryKey: ['projects-nav'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['home'] })
    qc.invalidateQueries({ queryKey: ['portfolio'] })
  }

  const remove = useMutation({
    mutationFn: () => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Project deleted', { type: 'success' })
      bustProjectCaches(id)
      setConfirmDelete(false)
      navigate('/projects', { replace: true })
    },
    onError: (e) => {
      if (e.status === 404) {
        bustProjectCaches(id)
        toast('Project was already deleted', { type: 'success' })
        navigate('/projects', { replace: true })
        return
      }
      toast(e.message, { type: 'error' })
    },
  })

  useEffect(() => {
    if (isError && error?.status === 404) {
      bustProjectCaches(id)
      navigate('/projects', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error?.status, id])

  const project = data?.project
  const caps = capabilitiesForUser(user, tenant)
  const visibleTabs = useMemo(
    () => MAIN_TABS.filter((tab) => caps.projectTabs[tab.capability]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role, user?.isPlatformAdmin, user?.permissions, tenant?.customRoles],
  )
  const canManageProject = caps.manageProjects

  useEffect(() => {
    if (!project || !visibleTabs.length) return
    const segment = location.pathname.split('/').pop()
    const allowed = visibleTabs.some((t) => t.to === segment)
    if (!allowed) {
      navigate(`/projects/${id}/${visibleTabs[0].to}`, { replace: true })
    }
  }, [project, visibleTabs, location.pathname, id, navigate])

  if (isLoading || !project) {
    return (
      <div className="p-4">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#faf9f7] print:overflow-visible">
      {/* Header scrolls with the page (not pinned) */}
      <header className="bg-[#faf9f7] print:hidden">
        <div className="px-4 pt-4 sm:px-6">
          <div className="rounded-xl bg-[#f4f3f1] p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7a573b]">
                {project.code || 'Project'}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase',
                  project.isDelayed || project.status === 'delayed'
                    ? 'bg-[#ffdad6] text-[#93000a]'
                    : 'bg-[#bceed3] text-[#002114]',
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {project.isDelayed || project.status === 'delayed'
                  ? 'Delayed'
                  : project.status === 'on_hold'
                    ? 'On hold'
                    : 'On track'}
              </span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-[28px] font-medium leading-tight tracking-[-0.02em] text-[#1a1c1b]">
                  {project.name}
                </h1>
                <p className="mt-1 text-[13px] text-[#44474a]">
                  Client: {project.clientName}
                  {project.location ? ` · ${project.location}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
            {canManageProject && (
              <button
                type="button"
                title="Delete project"
                onClick={() => setConfirmDelete(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-secondary hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  toast('Link copied', { type: 'success' })
                } catch {
                  toast('Could not copy link', { type: 'error' })
                }
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] font-semibold text-secondary hover:bg-black/[0.03] hover:text-primary"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button
              type="button"
              title={
                project.clientPhone
                  ? `WhatsApp Web · ${project.clientPhone}`
                  : 'Add the client phone number for WhatsApp Web'
              }
              onClick={() => {
                const url = whatsappLink(
                  project.clientPhone,
                  `Hi ${project.clientName}, regarding your project "${project.name}" —`,
                )
                if (!url) {
                  toast('No client phone number saved for this project', {
                    type: 'error',
                  })
                  return
                }
                window.open(url, '_blank', 'noopener')
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white shadow-sm transition',
                project.clientPhone
                  ? 'bg-[#25D366] hover:bg-[#1fb958]'
                  : 'bg-[#a7dcbb] hover:bg-[#98d2ad]',
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
            <button
              type="button"
              title="Compose and send email to the client"
              onClick={() => openComposeEmail(clientProjectEmailDraft(project))}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 text-[12px] font-semibold text-[#171717] shadow-sm transition hover:bg-[var(--accent-hover)]"
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#efeeec] p-3">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#44474a]">
                  Allocated budget
                </span>
                <span className="mt-1 block text-[20px] font-medium tabular-nums text-[#1a1c1b]">
                  {formatInr(project.budget || 0)}
                </span>
              </div>
              <div className="rounded-lg bg-[#efeeec] p-3">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#44474a]">
                  Project stage
                </span>
                <span className="mt-1 block text-[16px] font-semibold text-[#7a573b]">
                  {stageLabel(project.currentStage)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <nav className="mt-3 flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition',
                  isActive
                    ? 'bg-[#1e2022] text-white'
                    : 'bg-[#efeeec] text-[#44474a] hover:bg-[#e3e2e0]',
                )
              }
            >
              <tab.icon className="h-3.5 w-3.5" strokeWidth={2} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet context={{ project, stats: data?.stats }} />

      <Modal
        open={confirmDelete}
        onClose={() => !remove.isPending && setConfirmDelete(false)}
        title="Delete this project?"
        size="sm"
      >
        <p className="text-sm text-secondary">
          Delete <span className="font-medium">{project.name}</span>? This cannot
          be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
