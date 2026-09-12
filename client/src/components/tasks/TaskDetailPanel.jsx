import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  X,
  Check,
  Calendar,
  Clock,
  Tag,
  Plus,
  CheckSquare,
  AtSign,
  Send,
  ChevronDown,
  CircleDot,
  Flag,
  Hourglass,
  Users,
  Play,
  Square,
  UserCheck,
} from 'lucide-react'
import { api, useAuthStore } from '../../lib/api'
import { Avatar, toast } from '../ui'
import { cn } from '../../lib/utils'
import {
  formatTimeEstimate,
  parseTimeEstimate,
  formatTrackedSeconds,
  liveTrackedSeconds,
} from '../../lib/taskStatus'
import { AttrRow } from './AttrRow'
import { StatusSelect } from './StatusBadge'
import { PrioritySelect } from './PriorityBadge'
import { ActivityItem, mapActivityToFeed } from './ActivityFeed'
import { capabilitiesForUser } from '../../lib/roles'

/** Slide-over task panel — create + edit. */
export function TaskDetailPanel({
  open,
  taskId,
  projectId,
  projectName,
  isPersonal = false,
  onClose,
  onCreated,
  initialStatus = 'todo',
  initialStartDate = '',
  initialDueDate = '',
}) {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const caps = capabilitiesForUser(user, tenant)
  const qc = useQueryClient()
  const [createdId, setCreatedId] = useState(null)

  useEffect(() => {
    if (!open) setCreatedId(null)
  }, [open])

  const activeTaskId = taskId || createdId || null
  const isCreate = !activeTaskId
  const canManageTask = isCreate || caps.manageTasks

  const { data } = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => api(`/tasks/${activeTaskId}`),
    enabled: open && !!activeTaskId && !isCreate,
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api('/users'),
    enabled: open,
    staleTime: 60_000,
  })

  const { data: fieldsData } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api('/custom-fields'),
    enabled: open,
    staleTime: 30_000,
  })

  const task = data?.task
  const comments = data?.comments || []
  const activity = data?.activity || []
  const users = usersData?.users || usersData?.data || []
  const customFieldDefs = (fieldsData?.fields || []).filter(
    (f) => f.isActive !== false,
  )

  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    assignee: '',
    startDate: '',
    dueDate: '',
    tags: '',
    timeEstimate: '',
    checklist: [],
    customFields: {},
  })
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(null)
  const [mentionIds, setMentionIds] = useState([])
  const startDateRef = useRef(null)
  const dueDateRef = useRef(null)
  const commentRef = useRef(null)

  const openDatePicker = (ref) => (e) => {
    e.preventDefault()
    try {
      ref.current?.showPicker?.()
    } catch {
      ref.current?.focus()
    }
  }
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [newField, setNewField] = useState({
    name: '',
    type: 'user',
    options: '',
  })
  const [timerTick, setTimerTick] = useState(() => Date.now())
  const [timeSpent, setTimeSpent] = useState(0)
  const [timeTrackingStartedAt, setTimeTrackingStartedAt] = useState(null)
  const [timerBusy, setTimerBusy] = useState(false)

  const emptyForm = () => ({
    title: '',
    description: '',
    status: initialStatus || 'todo',
    priority: 'medium',
    assignee: user?.id || '',
    startDate: initialStartDate
      ? formatDateInput(initialStartDate)
      : '',
    dueDate: initialDueDate ? formatDateInput(initialDueDate) : '',
    tags: '',
    timeEstimate: '',
    checklist: [],
    customFields: {},
  })

  useEffect(() => {
    if (!open) return
    if (isCreate) {
      setForm(emptyForm())
      setComment('')
      return
    }
    if (task) {
      const cf =
        task.customFields && typeof task.customFields === 'object'
          ? { ...task.customFields }
          : {}
      setForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        assignee: task.assignee?._id || task.assignee || '',
        startDate: task.startDate
          ? format(new Date(task.startDate), 'yyyy-MM-dd')
          : '',
        dueDate: task.dueDate
          ? format(new Date(task.dueDate), 'yyyy-MM-dd')
          : '',
        tags: Array.isArray(task.tags) ? task.tags.join(', ') : '',
        timeEstimate: formatTimeEstimate(task.timeEstimate) || '',
        checklist: task.checklist || [],
        customFields: cf,
      })
      setTimeSpent(Number(task.timeSpent) || 0)
      setTimeTrackingStartedAt(task.timeTrackingStartedAt || null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCreate, task, user?.id, initialStatus, initialStartDate, initialDueDate])

  useEffect(() => {
    if (!open || isCreate) {
      setTimeSpent(0)
      setTimeTrackingStartedAt(null)
    }
  }, [open, isCreate])

  useEffect(() => {
    if (!timeTrackingStartedAt) return undefined
    const id = window.setInterval(() => setTimerTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [timeTrackingStartedAt])

  /** Ensure person-style fields (e.g. Developer created as Text) use the people dropdown */
  useEffect(() => {
    if (!open || !canManageTask || !fieldsData?.fields?.length) return
    const personNames = /^(developer|person|owner|lead|member|assignee)$/i
    const toFix = fieldsData.fields.filter(
      (f) =>
        f.isActive !== false &&
        f.type === 'text' &&
        personNames.test(String(f.name || '').trim()),
    )
    if (!toFix.length) return
    let cancelled = false
    ;(async () => {
      try {
        await Promise.all(
          toFix.map((f) =>
            api(`/custom-fields/${f._id}`, {
              method: 'PATCH',
              body: JSON.stringify({ type: 'user' }),
            }),
          ),
        )
        if (!cancelled) {
          qc.invalidateQueries({ queryKey: ['custom-fields'] })
        }
      } catch {
        /* ignore — user can still change type manually */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, canManageTask, fieldsData, qc])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const parseTags = (raw) =>
    String(raw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

  const buildPayload = (partial = {}) => {
    const estimate =
      partial.timeEstimate !== undefined
        ? partial.timeEstimate
        : parseTimeEstimate(form.timeEstimate)

    return {
      title: form.title.trim() || 'Untitled Task',
      description: form.description,
      status: form.status,
      priority: form.priority,
      assignee: form.assignee || null,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      tags: parseTags(form.tags),
      timeEstimate: estimate,
      checklist: form.checklist,
      customFields: form.customFields || {},
      ...(isPersonal || !projectId
        ? { isPersonal: true }
        : { projectId }),
      ...partial,
    }
  }

  const save = async (partial = {}) => {
    const hasPartial = Object.keys(partial).length > 0
    const payload = isCreate
      ? buildPayload(partial)
      : hasPartial
        ? { ...partial }
        : buildPayload()

    setSaving(true)
    try {
      if (isCreate) {
        const res = await api('/tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        const newId = res.task?._id || res.task?.id
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['home'] })
        toast('Task created', { type: 'success' })
        onCreated?.(res.task)
        if (newId) {
          setCreatedId(newId)
          await qc.invalidateQueries({ queryKey: ['task', newId] })
        } else {
          onClose?.()
        }
      } else {
        await api(`/tasks/${activeTaskId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['home'] })
        await qc.invalidateQueries({ queryKey: ['task', activeTaskId] })
      }
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const setCustomValue = (slug, value) => {
    setForm((f) => ({
      ...f,
      customFields: { ...f.customFields, [slug]: value },
    }))
    if (!isCreate) {
      save({
        customFields: { ...(form.customFields || {}), [slug]: value },
      })
    }
  }

  const createField = async () => {
    if (!newField.name.trim()) {
      toast('Field name required', { type: 'error' })
      return
    }
    try {
      const options =
        newField.type === 'select'
          ? newField.options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : []
      await api('/custom-fields', {
        method: 'POST',
        body: JSON.stringify({
          name: newField.name.trim(),
          type: newField.type,
          options,
        }),
      })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      setNewField({ name: '', type: 'user', options: '' })
      setAddFieldOpen(false)
      toast('Field added to workspace', { type: 'success' })
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const updateFieldType = async (field, type) => {
    if (!field?._id || field.type === type) return
    try {
      await api(`/custom-fields/${field._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ type }),
      })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      toast(
        type === 'user'
          ? `${field.name} is now a people field`
          : `Updated ${field.name} type`,
        { type: 'success' },
      )
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const toggleTrackTime = async () => {
    if (isCreate || !activeTaskId || timerBusy) {
      if (isCreate) toast('Save the task first to track time', { type: 'info' })
      return
    }
    setTimerBusy(true)
    try {
      if (timeTrackingStartedAt) {
        const spent = liveTrackedSeconds(timeSpent, timeTrackingStartedAt)
        await api(`/tasks/${activeTaskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            timeSpent: spent,
            timeTrackingStartedAt: null,
            timeTrackingUserId: null,
          }),
        })
        setTimeSpent(spent)
        setTimeTrackingStartedAt(null)
      } else {
        const startedAt = new Date().toISOString()
        await api(`/tasks/${activeTaskId}`, {
          method: 'PATCH',
          body: JSON.stringify({ timeTrackingStartedAt: startedAt }),
        })
        setTimeTrackingStartedAt(startedAt)
      }
      qc.invalidateQueries({ queryKey: ['task', activeTaskId] })
      qc.invalidateQueries({ queryKey: ['active-timer'] })
      qc.invalidateQueries({ queryKey: ['home'] })
    } catch (e) {
      toast(e.message || 'Could not update timer', { type: 'error' })
    } finally {
      setTimerBusy(false)
    }
  }

  const postComment = useMutation({
    mutationFn: (body) =>
      api(`/tasks/${activeTaskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body, mentions: mentionIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', activeTaskId] })
      setComment('')
      setMentionIds([])
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const closeMention = () => {
    setMentionOpen(false)
    setMentionTriggerIndex(null)
    setMentionQuery('')
  }

  const handleCommentChange = (value, cursor) => {
    setComment(value)
    const pos = cursor ?? value.length
    const uptoCursor = value.slice(0, pos)
    const match = uptoCursor.match(/(?:^|\s)@([^\s@]*)$/)
    if (match) {
      setMentionTriggerIndex(uptoCursor.lastIndexOf('@'))
      setMentionQuery(match[1])
      setMentionOpen(true)
    } else {
      closeMention()
    }
  }

  const insertMention = (u) => {
    const id = String(u._id || u.id)
    const tag = `@${u.name} `
    if (mentionTriggerIndex != null) {
      const before = comment.slice(0, mentionTriggerIndex)
      const after = comment.slice(mentionTriggerIndex + 1 + mentionQuery.length)
      const next = `${before}${tag}${after}`
      setComment(next)
      const caret = before.length + tag.length
      requestAnimationFrame(() => {
        const el = commentRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(caret, caret)
        }
      })
    } else {
      setComment((prev) =>
        prev.includes(`@${u.name}`)
          ? prev
          : `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${tag}`,
      )
    }
    setMentionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    closeMention()
  }

  const triggerMentionFromButton = () => {
    if (isCreate) return
    if (mentionOpen) {
      closeMention()
      return
    }
    const el = commentRef.current
    const pos = el?.selectionStart ?? comment.length
    const before = comment.slice(0, pos)
    const after = comment.slice(pos)
    const needsSpace = before.length > 0 && !/\s$/.test(before)
    const insertAt = before.length + (needsSpace ? 1 : 0)
    const next = `${before}${needsSpace ? ' ' : ''}@${after}`
    setComment(next)
    setMentionTriggerIndex(insertAt)
    setMentionQuery('')
    setMentionOpen(true)
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(insertAt + 1, insertAt + 1)
      }
    })
  }

  const mentionMatches = mentionOpen
    ? users
        .filter((u) =>
          mentionQuery
            ? u.name?.toLowerCase().includes(mentionQuery.toLowerCase())
            : true,
        )
        .slice(0, 8)
    : []

  if (!open) return null

  const crumb = isPersonal || !projectId ? 'Personal' : projectName || 'Project'
  const feed = mapActivityToFeed(activity, comments, task)

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-[#1c1c1c]/45 backdrop-blur-[2px]">
      <div className="relative m-0 flex h-full w-full max-w-[1180px] flex-col overflow-hidden border border-[#d6e4f5] bg-surface shadow-2xl sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-2xl">
        {/* Breadcrumb */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-4 text-[12px] text-secondary">
          <span className="truncate font-semibold text-primary">{crumb}</span>
          <span className="text-[#c7c7c7]">/</span>
          <span>Task</span>
          {saving && (
            <span className="text-[11px] text-secondary">Saving…</span>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-secondary hover:bg-[#e8eef4] hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Narrow screens scroll as one column; md+ splits into two panes. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* ─── Main ─── */}
          <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:overflow-y-auto lg:px-8">
            <input
              autoFocus={isCreate}
              value={form.title}
              readOnly={!canManageTask}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onBlur={() =>
                canManageTask && !isCreate && form.title.trim() && save()
              }
              placeholder="Task name"
              className="mb-5 w-full bg-transparent text-[24px] font-semibold tracking-tight text-primary outline-none placeholder:text-[#c7c7c7]"
            />

            {/* Property grid */}
            <div className="mb-2 grid gap-x-12 gap-y-1 sm:grid-cols-2">
              <AttrRow label="Status" icon={CircleDot}>
                <div className="flex items-center gap-2">
                  <StatusSelect
                    value={form.status}
                    onChange={(status) => {
                      setForm({ ...form, status })
                      if (!isCreate) save({ status })
                    }}
                  />
                  {form.status !== 'done' && (
                    <button
                      type="button"
                      title="Mark finished"
                      onClick={() => {
                        setForm({ ...form, status: 'done' })
                        if (!isCreate) save({ status: 'done' })
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded text-secondary hover:bg-[#ecfdf5] hover:text-[#3ecf8e]"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </AttrRow>

              <AttrRow label="Assignees" icon={Users}>
                {canManageTask ? (
                  <PersonPicker
                    value={form.assignee}
                    users={users}
                    loading={usersLoading}
                    onChange={(assignee) => {
                      setForm({ ...form, assignee: assignee || '' })
                      if (!isCreate) save({ assignee: assignee || null })
                    }}
                  />
                ) : (
                  <span className="text-[13px] text-primary">
                    {task?.assignee?.name || 'Assigned to you'}
                  </span>
                )}
              </AttrRow>

              {!isCreate && task?.createdBy && (
                <AttrRow label="Assigned by" icon={UserCheck}>
                  <div className="flex items-center gap-1.5 text-[13px] text-primary">
                    <Avatar name={task.createdBy?.name} size="xs" />
                    <span>
                      {task.createdBy?.name || 'Unknown'}
                      {task.createdBy?._id === task.assignee?._id ? ' (self-assigned)' : ''}
                    </span>
                  </div>
                </AttrRow>
              )}

              <AttrRow label="Dates" icon={Calendar}>
                <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  <DateChip
                    inputRef={startDateRef}
                    value={form.startDate}
                    placeholder="Start"
                    disabled={!canManageTask}
                    onClick={canManageTask ? openDatePicker(startDateRef) : undefined}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                    onBlur={() => !isCreate && save()}
                  />
                  <span className="text-secondary">→</span>
                  <DateChip
                    inputRef={dueDateRef}
                    value={form.dueDate}
                    placeholder="Due"
                    disabled={!canManageTask}
                    onClick={canManageTask ? openDatePicker(dueDateRef) : undefined}
                    onChange={(e) =>
                      setForm({ ...form, dueDate: e.target.value })
                    }
                    onBlur={() => !isCreate && save()}
                  />
                </div>
              </AttrRow>

              <AttrRow label="Priority" icon={Flag}>
                {canManageTask ? (
                  <PrioritySelect
                    value={form.priority}
                    onChange={(priority) => {
                      setForm({ ...form, priority })
                      if (!isCreate) save({ priority })
                    }}
                    hideIcon
                  />
                ) : (
                  <span className="text-[13px] capitalize text-primary">
                    {form.priority}
                  </span>
                )}
              </AttrRow>

              <AttrRow label="Time estimate" icon={Hourglass}>
                <input
                  type="text"
                  disabled={!canManageTask}
                  value={form.timeEstimate}
                  placeholder="Empty"
                  onChange={(e) =>
                    setForm({ ...form, timeEstimate: e.target.value })
                  }
                  onBlur={() => {
                    const mins = parseTimeEstimate(form.timeEstimate)
                    setForm((f) => ({
                      ...f,
                      timeEstimate: formatTimeEstimate(mins) || '',
                    }))
                    if (!isCreate) save({ timeEstimate: mins })
                  }}
                  className="w-full max-w-[140px] rounded px-1 py-1 text-[13px] text-primary outline-none transition-colors hover:bg-surface-raised placeholder:text-secondary"
                />
              </AttrRow>

              <AttrRow label="Track time" icon={Clock}>
                <button
                  type="button"
                  disabled={timerBusy || isCreate}
                  onClick={toggleTrackTime}
                  className="flex items-center gap-2 text-[13px] text-primary disabled:opacity-50"
                  title={
                    timeTrackingStartedAt ? 'Stop timer' : 'Start timer'
                  }
                >
                  {timeTrackingStartedAt ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                      <Square className="h-2.5 w-2.5 fill-current" />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d1fae5] text-[#3ecf8e]">
                      <Play className="h-2.5 w-2.5 fill-current" />
                    </span>
                  )}
                  <span
                    className={cn(
                      'tabular-nums',
                      timeTrackingStartedAt && 'font-semibold text-primary',
                    )}
                  >
                    {formatTrackedSeconds(
                      liveTrackedSeconds(
                        timeSpent,
                        timeTrackingStartedAt,
                        timerTick,
                      ),
                    )}
                  </span>
                </button>
              </AttrRow>

              <AttrRow label="Tags" icon={Tag}>
                <input
                  type="text"
                  disabled={!canManageTask}
                  value={form.tags}
                  placeholder="Empty"
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  onBlur={() => !isCreate && save()}
                  className="min-w-0 flex-1 rounded px-1 py-1 text-[13px] text-primary outline-none transition-colors hover:bg-surface-raised placeholder:text-secondary"
                />
              </AttrRow>

              {canManageTask && customFieldDefs.map((field) => (
                <AttrRow key={field._id || field.slug} label={field.name}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <CustomFieldInput
                      field={field}
                      value={form.customFields?.[field.slug]}
                      users={users}
                      usersLoading={usersLoading}
                      onChange={(v) => setCustomValue(field.slug, v)}
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateFieldType(field, e.target.value)}
                      title="Field data type"
                      className="h-7 shrink-0 rounded-md border border-border bg-surface-raised px-1.5 text-[10px] font-medium uppercase tracking-wide text-secondary outline-none hover:border-[#c7c7c7] hover:text-primary"
                    >
                      <option value="text">Text</option>
                      <option value="user">Person</option>
                      <option value="select">Select</option>
                      <option value="number">Number</option>
                    </select>
                  </div>
                </AttrRow>
              ))}
            </div>

            {/* Description */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-1.5 text-[12px] font-semibold text-secondary">
                Description
              </p>
              <textarea
                value={form.description}
                readOnly={!canManageTask}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                onBlur={() => canManageTask && !isCreate && save()}
                rows={4}
                placeholder="Add more detail so anyone can pick this up…"
                className="w-full resize-none rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-[14px] leading-relaxed text-primary outline-none placeholder:text-secondary focus:border-[#3ecf8e] focus:bg-surface"
              />
            </div>

            {form.checklist?.length > 0 && (
              <div className="mb-3 mt-4 space-y-1">
                <p className="mb-1 text-[12px] font-semibold text-secondary">
                  Checklist
                </p>
                {form.checklist.map((item, idx) => (
                  <label
                    key={item._id || idx}
                    className="flex items-center gap-2 rounded-md px-1 py-1 text-[13px] text-primary hover:bg-surface-raised"
                  >
                    <input
                      type="checkbox"
                      checked={!!item.done}
                      onChange={() => {
                        const checklist = form.checklist.map((c, i) =>
                          i === idx ? { ...c, done: !c.done } : c,
                        )
                        setForm({ ...form, checklist })
                        if (!isCreate) save({ checklist })
                      }}
                      className="accent-[#3ecf8e]"
                    />
                    <span
                      className={cn(item.done && 'line-through text-secondary')}
                    >
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionLink
                icon={CheckSquare}
                label="Add checklist item"
                onClick={() => {
                  const text = window.prompt('Checklist item')
                  if (!text) return
                  const checklist = [
                    ...(form.checklist || []),
                    { text, done: false },
                  ]
                  setForm({ ...form, checklist })
                  if (!isCreate) save({ checklist })
                }}
              />
              {canManageTask && (
                <ActionLink
                  icon={Plus}
                  label="Add a field"
                  onClick={() => setAddFieldOpen((v) => !v)}
                />
              )}
            </div>

            {addFieldOpen && (
              <div className="mt-2 space-y-2 rounded-xl border border-border bg-surface-raised p-3">
                <p className="text-[12px] text-secondary">
                  Adds this field to every task in the workspace.
                </p>
                <input
                  value={newField.name}
                  onChange={(e) =>
                    setNewField({ ...newField, name: e.target.value })
                  }
                  placeholder="Field name (e.g. Site engineer)"
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-primary outline-none focus:border-[#3ecf8e]"
                />
                <select
                  value={newField.type}
                  onChange={(e) =>
                    setNewField({ ...newField, type: e.target.value })
                  }
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-primary outline-none focus:border-[#3ecf8e]"
                >
                  <option value="user">Person (company members)</option>
                  <option value="text">Text</option>
                  <option value="select">Select</option>
                  <option value="number">Number</option>
                </select>
                {newField.type === 'select' && (
                  <input
                    value={newField.options}
                    onChange={(e) =>
                      setNewField({ ...newField, options: e.target.value })
                    }
                    placeholder="Options, comma separated"
                    className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-primary outline-none focus:border-[#3ecf8e]"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={createField}
                    className="rounded-lg bg-[#3ecf8e] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#24b47e]"
                  >
                    Create field
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddFieldOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-secondary hover:bg-[#e8eef4]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isCreate && (
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  disabled={saving || !form.title.trim()}
                  onClick={() => save()}
                  className="rounded-lg bg-[#3ecf8e] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#24b47e] disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create task'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-[13px] font-medium text-secondary hover:bg-surface-raised hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* ─── Activity ─── */}
          <aside className="mt-4 flex w-full flex-col border-t border-border bg-surface-raised md:mt-0 md:min-h-0 md:w-[360px] md:shrink-0 md:border-l md:border-t-0">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
              <span className="text-[13px] font-semibold text-primary">
                Activity & comments
              </span>
            </div>

            <div className="min-h-[120px] flex-1 px-3 py-2 md:overflow-y-auto">
              {isCreate && (
                <p className="px-2 py-6 text-center text-[12px] text-secondary">
                  Activity appears after the task is created.
                </p>
              )}
              {!isCreate && feed.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] text-secondary">
                  No activity yet.
                </p>
              )}
              {feed.map((item) => (
                <ActivityItem
                  key={item.id}
                  item={item}
                  currentUser={user}
                />
              ))}
            </div>

            <div className="border-t border-border p-3">
              <div className="relative rounded-xl border border-border bg-surface focus-within:border-[#3ecf8e] focus-within:ring-2 focus-within:ring-[#3ecf8e]/15">
                {mentionOpen && mentionMatches.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
                    {mentionMatches.map((u) => (
                      <button
                        key={u._id || u.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertMention(u)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-primary hover:bg-surface-raised"
                      >
                        <Avatar src={u.avatar} name={u.name} size="xs" />
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
                {mentionOpen && mentionMatches.length === 0 && (
                  <div className="absolute bottom-full left-0 right-0 z-20 mb-1 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-secondary shadow-xl">
                    No matching teammates
                  </div>
                )}
                <textarea
                  ref={commentRef}
                  value={comment}
                  onChange={(e) => handleCommentChange(e.target.value, e.target.selectionStart)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && mentionOpen) {
                      e.stopPropagation()
                      closeMention()
                    }
                  }}
                  onBlur={() => window.setTimeout(closeMention, 150)}
                  disabled={isCreate}
                  rows={2}
                  placeholder={
                    isCreate
                      ? 'Save the task to comment…'
                      : 'Write a comment… (@ to mention)'
                  }
                  className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-primary outline-none placeholder:text-secondary disabled:opacity-50"
                />
                <div className="flex items-center gap-1 px-2 pb-2">
                  <button
                    type="button"
                    disabled={isCreate}
                    title="Mention a teammate"
                    onClick={triggerMentionFromButton}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-surface-raised hover:text-primary disabled:opacity-40',
                      mentionOpen && 'bg-[#ecfdf5] text-[#3ecf8e]',
                    )}
                  >
                    <AtSign className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isCreate || !comment.trim()}
                    onClick={() => postComment.mutate(comment.trim())}
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-md bg-[#3ecf8e] text-white hover:bg-[#24b47e] disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function formatDateInput(value) {
  if (!value) return ''
  try {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value
    }
    return format(new Date(value), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

function DateChip({
  inputRef,
  value,
  placeholder,
  disabled,
  onClick,
  onChange,
  onBlur,
}) {
  return (
    <div
      className={cn(
        'relative flex h-8 w-[108px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 transition-colors',
        !disabled && 'hover:border-[#3ecf8e]/60 hover:bg-surface',
      )}
    >
      <Calendar className="h-3.5 w-3.5 shrink-0 text-secondary" />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[13px]',
          value ? 'text-primary' : 'text-secondary',
        )}
      >
        {value ? format(new Date(value), 'dd MMM yyyy') : placeholder}
      </span>
      <input
        ref={inputRef}
        type="date"
        disabled={disabled}
        value={value}
        onClick={onClick}
        onChange={onChange}
        onBlur={onBlur}
        className={cn(
          'absolute inset-0 h-full w-full cursor-pointer opacity-0',
          disabled && 'cursor-default',
        )}
      />
    </div>
  )
}

function PersonPicker({ value, users, loading, onChange, label = 'Person' }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const buttonRef = useRef(null)
  const selected = users.find(
    (u) => String(u._id || u.id) === String(value || ''),
  )

  const place = () => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth * 0.7)
    const left = Math.min(r.left, window.innerWidth - width - 8)
    const maxHeight = 224 // max-h-56
    const openUpward =
      window.innerHeight - r.bottom < maxHeight + 8 && r.top > maxHeight + 8
    setRect({
      left: Math.max(8, left),
      width,
      top: openUpward ? undefined : r.bottom + 4,
      bottom: openUpward ? window.innerHeight - r.top + 4 : undefined,
    })
  }

  useEffect(() => {
    if (!open) return undefined
    place()
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-person-picker]')) setOpen(false)
    }
    const onReflow = () => place()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div className="relative min-w-0 flex-1" data-person-picker>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-0.5 text-left hover:bg-surface-raised"
        aria-label={label}
      >
        {selected ? (
          <>
            <Avatar src={selected.avatar} name={selected.name} size="xs" />
            <span className="truncate text-[13px] text-primary">
              {selected.name}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-secondary">Empty</span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-secondary" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            data-person-picker
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
            }}
            className="z-[200] max-h-56 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-secondary hover:bg-surface-raised"
            >
              Empty
            </button>
            {loading && (
              <p className="px-3 py-2 text-[12px] text-secondary">Loading…</p>
            )}
            {!loading && users.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-secondary">
                No company members found
              </p>
            )}
            {users.map((u) => {
              const id = String(u._id || u.id)
              const active = id === String(value || '')
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-raised',
                    active && 'bg-[#ecfdf5]',
                  )}
                >
                  <Avatar src={u.avatar} name={u.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-primary">
                    {u.name}
                  </span>
                  {u.role ? (
                    <span className="shrink-0 text-[10px] uppercase text-secondary">
                      {String(u.role).replace(/_/g, ' ')}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

function CustomFieldInput({ field, value, users, usersLoading, onChange }) {
  if (field.type === 'user') {
    return (
      <PersonPicker
        value={value}
        users={users}
        loading={usersLoading}
        onChange={onChange}
        label={field.name}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full max-w-[180px] rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-primary outline-none focus:border-[#3ecf8e]"
      >
        <option value="">Empty</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        placeholder="Empty"
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
        className="w-full max-w-[120px] bg-transparent py-1 text-[13px] text-primary outline-none placeholder:text-secondary"
      />
    )
  }

  return (
    <input
      type="text"
      defaultValue={value ?? ''}
      key={`${field.slug}-${value ?? ''}`}
      placeholder="Empty"
      onBlur={(e) => onChange(e.target.value || null)}
      className="w-full max-w-[200px] bg-transparent py-1 text-[13px] text-primary outline-none placeholder:text-secondary"
    />
  )
}

function ActionLink({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-secondary hover:border-[#bfdbfe] hover:bg-[#ecfdf5] hover:text-[#24b47e]"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  )
}
