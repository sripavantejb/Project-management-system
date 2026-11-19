import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ImagePlus, LayoutGrid, List, Plus, Trash2 } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { formatInr, stageLabel } from '../lib/format'
import { COUNTRY_CODES, buildPhone } from '../lib/phone'
import { PageToolbar, PILL_ACTIVE, PILL_IDLE, PILL_TRACK } from '../components/layout/PageToolbar'
import { cn } from '../lib/utils'
import {
  Button,
  Card,
  Input,
  Modal,
  ProgressRing,
  Select,
  SkeletonCard,
  StatusChip,
  toast,
} from '../components/ui'

function coverStyle(url) {
  const src = assetUrl(url)
  if (!src) return undefined
  return {
    backgroundImage: `linear-gradient(to top, rgba(14,14,16,.9), transparent 55%), url(${src})`,
  }
}

export function ProjectsPage() {
  const [view, setView] = useState('grid')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [coverBusyId, setCoverBusyId] = useState(null)
  const coverInputRef = useRef(null)
  const coverProjectIdRef = useRef(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['projects', q, status],
    queryFn: () => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (status) params.set('status', status)
      return api(`/projects?${params}`)
    },
  })

  const create = useMutation({
    mutationFn: (body) =>
      api('/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast('Project created', { type: 'success' })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-nav'] })
      setOpen(false)
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const updateCover = useMutation({
    mutationFn: ({ projectId, coverImage }) =>
      api(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ coverImage }),
      }),
    onSuccess: (_res, vars) => {
      toast(vars.coverImage ? 'Cover photo updated' : 'Cover photo removed', {
        type: 'success',
      })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-nav'] })
      qc.invalidateQueries({ queryKey: ['project', vars.projectId] })
      qc.invalidateQueries({ queryKey: ['home'] })
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
    onSettled: () => setCoverBusyId(null),
  })

  const pickCover = (projectId) => {
    coverProjectIdRef.current = projectId
    coverInputRef.current?.click()
  }

  const onCoverFile = async (file) => {
    const projectId = coverProjectIdRef.current
    if (!file || !projectId) return
    if (!file.type?.startsWith('image/')) {
      toast('Choose an image file', { type: 'error' })
      return
    }
    setCoverBusyId(projectId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const media = await api('/media?imagesOnly=1', { method: 'POST', body: fd })
      await updateCover.mutateAsync({
        projectId,
        coverImage: media.url,
      })
    } catch (e) {
      setCoverBusyId(null)
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      if (coverInputRef.current) coverInputRef.current.value = ''
      coverProjectIdRef.current = null
    }
  }

  const remove = useMutation({
    mutationFn: (projectId) =>
      api(`/projects/${projectId}`, { method: 'DELETE' }),
    onMutate: async (projectId) => {
      await qc.cancelQueries({ queryKey: ['projects'] })
      await qc.cancelQueries({ queryKey: ['projects-nav'] })

      const snapLists = qc.getQueriesData({ queryKey: ['projects'] })
      const snapNav = qc.getQueryData(['projects-nav'])

      const filterOut = (old) => {
        if (!old?.projects) return old
        return {
          ...old,
          projects: old.projects.filter(
            (p) => String(p._id) !== String(projectId),
          ),
        }
      }

      qc.setQueriesData({ queryKey: ['projects'] }, filterOut)
      qc.setQueryData(['projects-nav'], filterOut)
      qc.removeQueries({ queryKey: ['project', projectId] })

      return { snapLists, snapNav }
    },
    onSuccess: () => {
      toast('Project deleted', { type: 'success' })
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-nav'] })
      qc.invalidateQueries({ queryKey: ['home'] })
    },
    onError: (e, projectId, ctx) => {
      if (ctx?.snapLists) {
        for (const [key, data] of ctx.snapLists) qc.setQueryData(key, data)
      }
      if (ctx?.snapNav !== undefined) {
        qc.setQueryData(['projects-nav'], ctx.snapNav)
      }
      if (e.status === 404) {
        toast('Project was already deleted', { type: 'success' })
        setDeleteTarget(null)
        qc.invalidateQueries({ queryKey: ['projects'] })
        qc.invalidateQueries({ queryKey: ['projects-nav'] })
        return
      }
      toast(e.message, { type: 'error' })
    },
  })

  const projects = data?.projects || []

  return (
    <div className="space-y-6">
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onCoverFile(e.target.files?.[0])}
      />
      <PageToolbar
        left={
          <>
            <div className="w-64">
              <Input
                placeholder="Search projects…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="w-44">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'delayed', label: 'Delayed' },
                  { value: 'on_hold', label: 'On hold' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
            </div>
          </>
        }
        right={
          <>
            <div className={PILL_TRACK}>
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'rounded-full p-2 transition',
                  view === 'grid' ? PILL_ACTIVE : PILL_IDLE,
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'rounded-full p-2 transition',
                  view === 'list' ? PILL_ACTIVE : PILL_IDLE,
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const busy = coverBusyId === p._id
            const hasCover = Boolean(p.coverImage)
            return (
              <Card
                key={p._id}
                padding={false}
                hover
                className="overflow-hidden h-full relative group"
              >
                <Link to={`/projects/${p._id}`} className="block">
                  <div
                    className={cn(
                      'h-40 bg-cover bg-center relative',
                      !hasCover &&
                        'bg-gradient-to-br from-[var(--accent)]/40 via-[#2a2a2e] to-[#121214]',
                    )}
                    style={coverStyle(p.coverImage)}
                  >
                    {!hasCover ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-[11px] font-medium text-white/70">
                          No cover photo
                        </p>
                      </div>
                    ) : null}
                    <div className="absolute top-3 left-3">
                      <StatusChip status={p.type} label={p.type} />
                    </div>
                    <div className="on-dark absolute bottom-3 right-3">
                      <ProgressRing
                        value={p.progress}
                        size={48}
                        trackColor="rgba(255,255,255,0.35)"
                        color="#ffffff"
                        valueClassName="text-white font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
                      />
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{p.name}</h3>
                        <p className="text-xs text-secondary">{p.clientName}</p>
                      </div>
                      <StatusChip status={p.status} />
                    </div>
                    <p className="text-xs text-secondary">
                      {p.location || '—'} · {stageLabel(p.currentStage)}
                    </p>
                    <p className="text-sm tabular-nums text-accent">
                      {formatInr(p.budget)}
                    </p>
                  </div>
                </Link>
                <div className="on-dark absolute top-3 right-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title={hasCover ? 'Change cover photo' : 'Add cover photo'}
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      pickCover(p._id)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70 disabled:opacity-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                  </button>
                  {hasCover ? (
                    <button
                      type="button"
                      title="Remove cover photo"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setCoverBusyId(p._id)
                        updateCover.mutate({
                          projectId: p._id,
                          coverImage: '',
                        })
                      }}
                      className="flex h-8 items-center justify-center rounded-md bg-black/50 px-2 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-black/70 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    title="Delete project"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDeleteTarget(p)
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-black/50 text-white hover:bg-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {busy ? (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex h-40 items-center justify-center bg-black/40">
                    <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white">
                      Updating…
                    </span>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      ) : (
        <Card padding={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-secondary">
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">Client</th>
                <th className="px-4 py-3 text-left font-medium">Stage</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Budget</th>
                <th className="px-4 py-3 text-right font-medium">Progress</th>
                <th className="px-4 py-3 text-right font-medium w-28" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p._id}
                  className="border-b border-border last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/projects/${p._id}`}
                      className="font-medium hover:text-accent"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-secondary">{p.clientName}</td>
                  <td className="px-4 py-3 text-secondary">
                    {stageLabel(p.currentStage)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatInr(p.budget)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.progress}%</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title="Change cover photo"
                        disabled={coverBusyId === p._id}
                        onClick={() => pickCover(p._id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-surface hover:text-primary disabled:opacity-50"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete project"
                        onClick={() => setDeleteTarget(p)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NewProjectModal
        open={open}
        onClose={() => setOpen(false)}
        loading={create.isPending}
        onSubmit={(values) => create.mutate(values)}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => !remove.isPending && setDeleteTarget(null)}
        title="Delete project?"
        size="sm"
      >
        <p className="text-sm text-secondary">
          Delete{' '}
          <span className="font-medium text-white">{deleteTarget?.name}</span>?
          This removes the project and its tasks. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => deleteTarget && remove.mutate(deleteTarget._id)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function NewProjectModal({ open, onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '',
    clientName: '',
    phoneCode: '+91',
    phone: '',
    type: 'residential',
    location: '',
    budget: '',
    coverImage: '',
  })
  const [coverBusy, setCoverBusy] = useState(false)
  const coverRef = useRef(null)

  const uploadCover = async (file) => {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      toast('Choose an image file', { type: 'error' })
      return
    }
    setCoverBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const media = await api('/media?imagesOnly=1', { method: 'POST', body: fd })
      setForm((prev) => ({ ...prev, coverImage: media.url }))
    } catch (e) {
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      setCoverBusy(false)
      if (coverRef.current) coverRef.current.value = ''
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New project" size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const { phoneCode, phone, ...rest } = form
          onSubmit({
            ...rest,
            clientPhone: buildPhone(phoneCode, phone),
            budget: Number(form.budget) || 0,
            coverImage: form.coverImage || '',
          })
        }}
      >
        <Input
          label="Project name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          label="Client"
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          required
        />
        <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-end gap-2">
          <Select
            label="Code"
            value={form.phoneCode}
            onChange={(e) => setForm({ ...form, phoneCode: e.target.value })}
            options={COUNTRY_CODES.map((c) => ({
              value: c.code,
              label: c.code,
            }))}
          />
          <Input
            label="Client phone"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            value={form.phone}
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value.replace(/[^\d\s-]/g, ''),
              })
            }
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-primary">Property type</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'residential', label: 'Residential', hint: 'Home interiors' },
              { value: 'commercial', label: 'Commercial', hint: 'Offices & retail' },
              { value: 'renovation', label: 'Renovation', hint: 'Remodel & retrofit' },
              { value: 'custom', label: 'Custom', hint: 'Build your own schedule' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, type: opt.value })}
                className={cn(
                  'rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                  form.type === opt.value
                    ? 'border-accent bg-accent/15'
                    : 'border-border bg-surface-raised hover:border-accent/40',
                )}
              >
                <p className="text-[13px] font-semibold text-primary">{opt.label}</p>
                <p className="mt-0.5 text-[11px] text-secondary">{opt.hint}</p>
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Location"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <Input
          label="Budget (INR)"
          type="number"
          value={form.budget}
          onChange={(e) => setForm({ ...form, budget: e.target.value })}
        />
        <div>
          <p className="mb-2 text-xs font-semibold text-primary">Cover photo</p>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => uploadCover(e.target.files?.[0])}
          />
          <div
            className={cn(
              'relative h-28 overflow-hidden rounded-[10px] border border-border bg-cover bg-center',
              !form.coverImage &&
                'bg-gradient-to-br from-accent/25 via-surface-raised to-surface',
            )}
            style={
              form.coverImage
                ? { backgroundImage: `url(${assetUrl(form.coverImage)})` }
                : undefined
            }
          >
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/35">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border-white/20 bg-white/95 text-[#171717] hover:bg-white"
                loading={coverBusy}
                onClick={() => coverRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {form.coverImage ? 'Change' : 'Upload'}
              </Button>
              {form.coverImage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setForm({ ...form, coverImage: '' })}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-secondary">
            Optional — you can change it anytime from the project card.
          </p>
        </div>
        <p className="text-xs text-secondary">
          Creates 5 stages (Design → Handover) and template tasks automatically.
        </p>
        <Button type="submit" className="w-full" loading={loading}>
          Create project
        </Button>
      </form>
    </Modal>
  )
}
