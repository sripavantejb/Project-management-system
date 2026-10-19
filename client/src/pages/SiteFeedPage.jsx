import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isYesterday, startOfDay } from 'date-fns'
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderKanban,
  Image as ImageIcon,
  MapPin,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import {
  PageToolbar,
  ToolbarPills,
} from '../components/layout/PageToolbar'
import {
  Avatar,
  Button,
  EmptyState,
  Input,
  Modal,
  SkeletonCard,
  toast,
} from '../components/ui'
import { cn } from '../lib/utils'

const VIEW_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'photos', label: 'With photos' },
]

const FIELD =
  'h-10 rounded-xl border-black/[0.08] bg-[#fbfbfd] focus:border-[var(--accent)]/55 focus:bg-white'

const PROJECT_PICK_LIMIT = 8

function projectIdOf(update) {
  const p = update.projectId
  if (p && typeof p === 'object') return String(p._id)
  return p ? String(p) : 'unassigned'
}

function projectMeta(update) {
  const p = typeof update.projectId === 'object' ? update.projectId : null
  return {
    id: projectIdOf(update),
    name: p?.name || update.projectName || 'Project',
    location: p?.location || '',
    clientName: p?.clientName || '',
    coverImage: p?.coverImage || '',
  }
}

function dayLabel(date) {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, d MMM')
}

export function SiteFeedPage() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [view, setView] = useState('all')
  const [projectId, setProjectId] = useState('all')
  const [composeOpen, setComposeOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const [compose, setCompose] = useState({
    projectId: '',
    note: '',
    progress: '',
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['site-updates-feed'],
    queryFn: () => api('/site-updates?limit=120'),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-site-feed'],
    queryFn: () => api('/projects'),
    staleTime: 60_000,
  })

  const updates = data?.updates || []
  const projects = projectsData?.projects || []

  const selectedProject = useMemo(
    () => projects.find((p) => String(p._id) === String(projectId)),
    [projects, projectId],
  )

  const composeProject = useMemo(
    () => projects.find((p) => String(p._id) === String(compose.projectId)),
    [projects, compose.projectId],
  )

  /** Sites that actually have updates — for quick chips (never dump 100 projects) */
  const activeSites = useMemo(() => {
    const map = new Map()
    for (const u of updates) {
      const meta = projectMeta(u)
      if (meta.id === 'unassigned') continue
      if (!map.has(meta.id)) {
        map.set(meta.id, {
          id: meta.id,
          name: meta.name,
          count: 0,
          latest: u.createdAt,
        })
      }
      const g = map.get(meta.id)
      g.count += 1
      if (new Date(u.createdAt) > new Date(g.latest || 0)) {
        g.latest = u.createdAt
        g.name = meta.name
      }
    }
    return [...map.values()]
      .sort((a, b) => new Date(b.latest) - new Date(a.latest))
      .slice(0, 6)
  }, [updates])

  const filtered = useMemo(() => {
    return updates.filter((u) => {
      if (projectId !== 'all' && projectIdOf(u) !== projectId) return false
      if (view === 'today') {
        if (!u.createdAt || !isToday(new Date(u.createdAt))) return false
      }
      if (view === 'photos') {
        if (!u.photos?.length) return false
      }
      return true
    })
  }, [updates, projectId, view])

  const daySections = useMemo(() => {
    const sections = []
    const byDay = new Map()
    for (const u of filtered) {
      const d = u.createdAt ? startOfDay(new Date(u.createdAt)) : startOfDay(new Date())
      const key = d.toISOString()
      if (!byDay.has(key)) {
        byDay.set(key, { key, date: d, items: [] })
        sections.push(byDay.get(key))
      }
      byDay.get(key).items.push(u)
    }
    return sections
  }, [filtered])

  const stats = useMemo(() => {
    const today = updates.filter(
      (u) => u.createdAt && isToday(new Date(u.createdAt)),
    ).length
    const withPhotos = updates.filter((u) => u.photos?.length > 0).length
    return {
      total: updates.length,
      today,
      sites: activeSites.length,
      withPhotos,
    }
  }, [updates, activeSites])

  const postMut = useMutation({
    mutationFn: (body) =>
      api('/site-updates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-updates-feed'] })
      if (compose.projectId) {
        qc.invalidateQueries({ queryKey: ['site', compose.projectId] })
        qc.invalidateQueries({ queryKey: ['project', compose.projectId] })
      }
      setComposeOpen(false)
      setCompose({ projectId: '', note: '', progress: '' })
      setPhotos([])
      toast('Site update posted', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not post', { type: 'error' }),
  })

  async function uploadPhotos(fileList) {
    if (!compose.projectId) {
      toast('Pick a project first', { type: 'error' })
      return
    }
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (!files.length) return
    setUploading(true)
    let failed = 0
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('projectId', compose.projectId)
        fd.append('folder', 'site')
        fd.append('name', file.name)
        const res = await api('/files', { method: 'POST', body: fd })
        const url = res?.file?.versions?.[0]?.url
        if (url) setPhotos((p) => [...p, { url }])
        else failed += 1
      } catch {
        failed += 1
      }
    }
    setUploading(false)
    if (failed) {
      toast(`${failed} photo${failed > 1 ? 's' : ''} failed`, { type: 'error' })
    }
  }

  function openCompose(preProjectId = '') {
    setCompose({
      projectId: preProjectId || (projectId !== 'all' ? projectId : ''),
      note: '',
      progress: '',
    })
    setPhotos([])
    setComposeOpen(true)
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1100px] space-y-4">
        <SkeletonCard className="h-12" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-48" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-5 pb-12">
      <PageToolbar
        left={
          <ToolbarPills items={VIEW_FILTERS} value={view} onChange={setView} />
        }
        right={
          <Button onClick={() => openCompose()}>
            <Plus className="h-4 w-4" />
            Post update
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Updates" value={stats.total} hint="Across your sites" />
        <Kpi label="Today" value={stats.today} hint="Posted since midnight" />
        <Kpi
          label="Active sites"
          value={stats.sites}
          hint={`${stats.withPhotos} with photos`}
        />
      </section>

      {/* Project filter — search, never a wall of 100 pills */}
      <section className="rounded-2xl bg-white p-3 ring-1 ring-black/[0.04] sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <ProjectFilter
              projects={projects}
              value={projectId}
              selected={selectedProject}
              onChange={setProjectId}
            />
          </div>
        </div>

        {activeSites.length > 0 && projectId === 'all' && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-black/[0.04] pt-3">
            <span className="mr-1 self-center text-[11px] font-medium text-[#86868b]">
              Recent
            </span>
            {activeSites.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => setProjectId(site.id)}
                className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[11px] font-medium text-[#1d1d1f] transition hover:bg-[#ebebed]"
              >
                <span className="truncate">{site.name}</span>
                <span className="shrink-0 tabular-nums text-[#86868b]">
                  {site.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {projectId !== 'all' && selectedProject && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.04] pt-3">
            <p className="text-[12px] text-[#6e6e73]">
              Viewing{' '}
              <span className="font-semibold text-[#1d1d1f]">
                {selectedProject.name}
              </span>
              {selectedProject.location
                ? ` · ${selectedProject.location}`
                : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openCompose(projectId)}
                className="text-[12px] font-semibold text-[#0071e3] hover:underline"
              >
                Post here
              </button>
              <Link
                to={`/projects/${projectId}/site`}
                className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#6e6e73] hover:text-[#1d1d1f]"
              >
                Open site
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white py-2 ring-1 ring-black/[0.04]">
          <EmptyState
            icon={Camera}
            title={
              updates.length === 0
                ? 'No site updates yet'
                : 'Nothing matches this view'
            }
            description={
              updates.length === 0
                ? 'Post a photo note from here — pick a project first. With 100 sites, search finds the right one in a second.'
                : 'Try All, clear the project filter, or post a new update.'
            }
            actionLabel="Post update"
            onAction={() => openCompose()}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {daySections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="sticky top-0 z-10 -mx-1 flex items-center gap-3 bg-[var(--bg-canvas)]/90 px-1 py-1 backdrop-blur-md">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                  {dayLabel(section.date)}
                </h2>
                <span className="h-px flex-1 bg-black/[0.06]" />
                <span className="text-[11px] tabular-nums text-[#86868b]">
                  {section.items.length}
                </span>
              </div>

              <ul className="space-y-3">
                {section.items.map((update) => {
                  const meta = projectMeta(update)
                  const author =
                    typeof update.author === 'object' ? update.author : null
                  const shot = update.photos || []
                  return (
                    <li
                      key={update._id}
                      className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] transition duration-200 hover:shadow-[0_10px_30px_rgba(0,0,0,0.05)]"
                    >
                      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                        <Avatar
                          src={author?.avatar}
                          name={author?.name || 'Site'}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-[#1d1d1f]">
                                {author?.name || 'Site team'}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#86868b]">
                                {meta.id !== 'unassigned' ? (
                                  <Link
                                    to={`/projects/${meta.id}/site`}
                                    className="inline-flex max-w-[220px] items-center gap-1 truncate font-medium text-[#0071e3] hover:underline"
                                  >
                                    <FolderKanban className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{meta.name}</span>
                                  </Link>
                                ) : (
                                  <span>{meta.name}</span>
                                )}
                                {meta.location && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <MapPin className="h-3 w-3" />
                                    {meta.location}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#86868b]">
                              <Clock3 className="h-3 w-3" />
                              {update.createdAt
                                ? format(new Date(update.createdAt), 'h:mm a')
                                : ''}
                            </span>
                          </div>

                          {(update.note || update.message) && (
                            <p className="mt-2 text-[14px] leading-relaxed tracking-[-0.01em] text-[#1d1d1f]/90">
                              {update.note || update.message}
                            </p>
                          )}

                          {typeof update.progress === 'number' &&
                            update.progress > 0 && (
                              <p className="mt-2 text-[11px] font-medium text-[#86868b]">
                                Progress noted · {update.progress}%
                              </p>
                            )}

                          {shot.length > 0 && (
                            <div
                              className={cn(
                                'mt-3 grid gap-1.5',
                                shot.length === 1
                                  ? 'grid-cols-1'
                                  : shot.length === 2
                                    ? 'grid-cols-2'
                                    : 'grid-cols-3',
                              )}
                            >
                              {shot.slice(0, 6).map((ph, i) => {
                                const src = assetUrl(ph.url || ph)
                                return (
                                  <button
                                    key={`${update._id}-${i}`}
                                    type="button"
                                    onClick={() =>
                                      setLightbox({
                                        urls: shot.map((p) =>
                                          assetUrl(p.url || p),
                                        ),
                                        index: i,
                                        title: meta.name,
                                      })
                                    }
                                    className={cn(
                                      'relative overflow-hidden rounded-xl bg-[#f5f5f7]',
                                      shot.length === 1
                                        ? 'aspect-[16/10] max-h-72'
                                        : 'aspect-square',
                                    )}
                                  >
                                    <img
                                      src={src}
                                      alt=""
                                      className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
                                    />
                                    {i === 5 && shot.length > 6 && (
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[14px] font-semibold text-white">
                                        +{shot.length - 6}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Compose */}
      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Post site update"
        size="lg"
      >
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!compose.projectId) {
              toast('Select a project', { type: 'error' })
              return
            }
            if (!compose.note.trim() && photos.length === 0) {
              toast('Add a note or at least one photo', { type: 'error' })
              return
            }
            postMut.mutate({
              projectId: compose.projectId,
              note: compose.note.trim(),
              photos,
              progress: compose.progress
                ? Number(compose.progress)
                : undefined,
            })
          }}
        >
          <ComposeProjectPicker
            projects={projects}
            value={compose.projectId}
            selected={composeProject}
            onChange={(id) => {
              setCompose((s) => ({ ...s, projectId: id }))
              setPhotos([])
            }}
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-primary">Note</span>
            <textarea
              value={compose.note}
              onChange={(e) =>
                setCompose((s) => ({ ...s, note: e.target.value }))
              }
              rows={4}
              placeholder="What’s happening on site today…"
              className={cn(
                FIELD,
                'min-h-[96px] resize-none py-2.5 leading-relaxed',
              )}
            />
          </label>

          <Input
            label="Progress % (optional)"
            type="number"
            min="0"
            max="100"
            className={FIELD}
            value={compose.progress}
            onChange={(e) =>
              setCompose((s) => ({ ...s, progress: e.target.value }))
            }
            placeholder="e.g. 62"
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold text-primary">Photos</p>
            <button
              type="button"
              disabled={!compose.projectId || uploading}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-black/10 bg-[#fbfbfd] px-3.5 py-3 text-left transition hover:border-[var(--accent)]/45 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
                <ImageIcon className="h-4 w-4 text-[#86868b]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[#1d1d1f]">
                  {uploading
                    ? 'Uploading…'
                    : compose.projectId
                      ? 'Add site photos'
                      : 'Select a project to attach photos'}
                </span>
                <span className="block text-[11px] text-[#86868b]">
                  JPG, PNG · filed under the project
                </span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  uploadPhotos(e.target.files)
                  e.target.value = ''
                }}
              />
            </button>
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((ph, i) => (
                  <div
                    key={ph.url + i}
                    className="relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-black/[0.06]"
                  >
                    <img
                      src={assetUrl(ph.url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPhotos((list) => list.filter((_, j) => j !== i))
                      }
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-black/[0.04] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setComposeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={postMut.isPending || uploading}>
              {postMut.isPending ? 'Posting…' : 'Publish'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Lightbox */}
      <Modal
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        title={lightbox?.title || 'Photo'}
        size="lg"
      >
        {lightbox && (
          <div className="space-y-3">
            <img
              src={lightbox.urls[lightbox.index]}
              alt=""
              className="max-h-[65vh] w-full rounded-xl object-contain bg-[#f5f5f7]"
            />
            {lightbox.urls.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={lightbox.index <= 0}
                  onClick={() =>
                    setLightbox((s) => ({ ...s, index: s.index - 1 }))
                  }
                >
                  Previous
                </Button>
                <span className="text-[12px] text-secondary">
                  {lightbox.index + 1} / {lightbox.urls.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={lightbox.index >= lightbox.urls.length - 1}
                  onClick={() =>
                    setLightbox((s) => ({ ...s, index: s.index + 1 }))
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function ProjectFilter({ projects, value, selected, onChange }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = query.trim().toLowerCase()
  const large = projects.length > 12

  const matches = useMemo(() => {
    let list = projects
    if (q) {
      list = projects.filter((p) =>
        [p.name, p.clientName, p.location, p.code]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    } else if (large) {
      list = projects.slice(0, PROJECT_PICK_LIMIT)
    }
    return list.slice(0, PROJECT_PICK_LIMIT)
  }, [projects, q, large])

  const totalMatches = useMemo(() => {
    if (!q) return projects.length
    return projects.filter((p) =>
      [p.name, p.clientName, p.location, p.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    ).length
  }, [projects, q])

  if (value !== 'all' && selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-[#f5f5f7] px-3 py-2.5 ring-1 ring-black/[0.04]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
          <FolderKanban className="h-4 w-4 text-[#1d1d1f]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">
            {selected.name}
          </p>
          <p className="truncate text-[11px] text-[#86868b]">
            {[selected.clientName, selected.location].filter(Boolean).join(' · ') ||
              'Filtered feed'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange('all')
            setQuery('')
          }}
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] hover:bg-[#0071e3]/08"
        >
          Clear
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#86868b]">
          Filter by project
        </span>
        <span className="text-[11px] text-[#86868b]">
          {projects.length} projects
        </span>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            large
              ? 'Type a project name or client…'
              : 'Search projects or keep All'
          }
          className="h-10 w-full rounded-xl border-0 bg-[#f5f5f7] pl-9 pr-9 text-[13px] outline-none ring-1 ring-black/[0.05] placeholder:text-[#86868b] focus:bg-white focus:ring-[var(--accent)]/45"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c7c7cc]" />
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]">
          <button
            type="button"
            onClick={() => {
              onChange('all')
              setQuery('')
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 border-b border-black/[0.04] px-3 py-2.5 text-left text-[13px] font-medium text-[#1d1d1f] hover:bg-[#f5f5f7]"
          >
            All projects
          </button>
          {large && !q && (
            <p className="border-b border-black/[0.04] px-3 py-2 text-[11px] text-[#86868b]">
              Showing recent · type to find any of {projects.length}
            </p>
          )}
          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-secondary">
              No projects match
            </p>
          ) : (
            <ul className="max-h-[240px] overflow-y-auto py-1">
              {matches.map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(String(p._id))
                      setQuery('')
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[#f5f5f7]"
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#86868b]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#1d1d1f]">
                        {p.name}
                      </span>
                      {(p.clientName || p.location) && (
                        <span className="block truncate text-[11px] text-[#86868b]">
                          {[p.clientName, p.location].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {totalMatches > PROJECT_PICK_LIMIT && (
            <p className="border-t border-black/[0.04] px-3 py-2 text-[11px] text-[#86868b]">
              +{totalMatches - PROJECT_PICK_LIMIT} more · keep typing
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ComposeProjectPicker({ projects, value, selected, onChange }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = query.trim().toLowerCase()
  const large = projects.length > 12
  const matches = useMemo(() => {
    let list = projects
    if (q) {
      list = projects.filter((p) =>
        [p.name, p.clientName, p.location]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    } else if (large) {
      list = projects.slice(0, PROJECT_PICK_LIMIT)
    }
    return list.slice(0, PROJECT_PICK_LIMIT)
  }, [projects, q, large])

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-primary">Project</span>
        <span className="text-[11px] text-[#86868b]">
          {projects.length} available
        </span>
      </div>

      {selected && value ? (
        <div className="flex items-center gap-3 rounded-xl bg-[#f5f5f7] px-3 py-2.5 ring-1 ring-black/[0.04]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/[0.06]">
            <FolderKanban className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">
              {selected.name}
            </p>
            {selected.clientName && (
              <p className="truncate text-[11px] text-[#86868b]">
                {selected.clientName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('')
              setQuery('')
              setOpen(true)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
            className="text-[11px] font-semibold text-[#0071e3]"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder={
                large
                  ? 'Type project name or client…'
                  : 'Search or pick a project…'
              }
              className="h-10 w-full rounded-xl border-0 bg-[#f5f5f7] pl-9 pr-9 text-[13px] outline-none ring-1 ring-black/[0.05] focus:bg-white focus:ring-[var(--accent)]/45"
            />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c7c7cc]" />
          </div>
          {open && (
            <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]">
              {large && !q && (
                <p className="border-b border-black/[0.04] px-3 py-2 text-[11px] text-[#86868b]">
                  Type to find any of {projects.length} projects
                </p>
              )}
              <ul className="max-h-[240px] overflow-y-auto py-1">
                {matches.map((p) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(String(p._id))
                        setQuery('')
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[#f5f5f7]"
                    >
                      <FolderKanban className="h-3.5 w-3.5 text-[#86868b]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {p.name}
                        </span>
                        {p.clientName && (
                          <span className="block truncate text-[11px] text-[#86868b]">
                            {p.clientName}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/[0.04] transition duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
        {label}
      </p>
      <p className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-[#86868b]">{hint}</p>}
    </div>
  )
}
