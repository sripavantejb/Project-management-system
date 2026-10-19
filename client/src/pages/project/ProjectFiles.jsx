import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  Eye,
  EyeOff,
  FolderOpen,
  Pencil,
  Send,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../../lib/api'
import { capabilitiesForUser } from '../../lib/roles'
import {
  Button,
  EmptyState,
  FileThumbnail,
  Modal,
  StatusChip,
  toast,
} from '../../components/ui'
import { cn } from '../../lib/utils'
import {
  PILL_ACTIVE,
  PILL_IDLE,
  PILL_TRACK,
} from '../../components/layout/PageToolbar'

const FOLDERS = [
  { value: 'concepts', label: 'Concepts' },
  { value: 'drawings', label: 'Drawings' },
  { value: 'renders', label: '3D Renders' },
  { value: 'approvals', label: 'Approvals' },
  { value: 'site_photos', label: 'Site photos' },
]

/**
 * Serverless functions cap the request body at 4.5 MB, so a larger file fails
 * at the platform before any of our code runs — the person just sees a generic
 * failure. Catch it here and say so plainly.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1)

function approvalChip(file) {
  if (file.approvalStatus === 'pending') return { status: 'sent', label: 'Awaiting approval' }
  if (file.approvalStatus === 'approved') return { status: 'approved', label: 'Approved' }
  if (file.approvalStatus === 'rejected') return { status: 'rejected', label: 'Rejected' }
  return null
}

function formatUploadWhen(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function uploaderLabel(version) {
  const by = version?.uploadedBy
  if (!by) return ''
  if (typeof by === 'object' && by.name) return by.name
  return ''
}

export function ProjectFiles() {
  const { id } = useParams()
  const [folder, setFolder] = useState('drawings')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [approvalTarget, setApprovalTarget] = useState(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [postUploadPrompt, setPostUploadPrompt] = useState(null)
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const canManage = capabilitiesForUser(user, tenant).manageFiles

  const { data, isLoading } = useQuery({
    queryKey: ['files', id, folder],
    queryFn: () => api(`/files?projectId=${id}&folder=${folder}`),
  })

  const { data: flowData } = useQuery({
    queryKey: ['approvals', 'flow'],
    queryFn: () => api('/approvals/flow'),
    enabled: canManage,
  })

  const drawingFlow = (flowData?.flow || []).find((t) => t.key === 'drawing')
  const hasDrawingRoute = (drawingFlow?.rules || []).length > 0
  const members = flowData?.members || []

  const upload = useMutation({
    mutationFn: async (fileList) => {
      const files = Array.from(fileList || [])
      if (!files.length) return { ok: 0, failures: [], uploaded: [] }
      let ok = 0
      const failures = []
      const uploaded = []
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          failures.push({
            name: file.name,
            reason: `${mb(file.size)} MB — too large. The hosting limit is ${mb(MAX_UPLOAD_BYTES)} MB per file.`,
          })
          continue
        }
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('projectId', id)
          fd.append('folder', folder)
          fd.append('name', file.name)
          const res = await api('/files', { method: 'POST', body: fd })
          ok += 1
          if (res?.file) uploaded.push(res.file)
        } catch (err) {
          failures.push({
            name: file.name,
            reason: err?.message || 'Upload failed',
          })
        }
      }
      return { ok, failures, uploaded }
    },
    onSuccess: ({ ok, failures, uploaded }) => {
      qc.invalidateQueries({ queryKey: ['files', id] })
      if (ok) toast(`${ok} file${ok > 1 ? 's' : ''} uploaded`, { type: 'success' })
      for (const f of failures) {
        toast(`${f.name} — ${f.reason}`, { type: 'error' })
      }
      if (uploaded?.length === 1) {
        setPostUploadPrompt(uploaded[0])
        setApprovalNote('')
      }
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const renameFile = useMutation({
    mutationFn: ({ fileId, ...body }) =>
      api(`/files/${fileId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', id] })
      setEditing(null)
      toast('File updated', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const removeFile = useMutation({
    mutationFn: (fileId) => api(`/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', id] })
      toast('File deleted', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const requestApproval = useMutation({
    mutationFn: ({ fileId, note, approverUser }) =>
      api(`/files/${fileId}/request-approval`, {
        method: 'POST',
        body: JSON.stringify({
          note: note || undefined,
          approverUser: approverUser || undefined,
          approvalType: 'drawing',
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', id] })
      qc.invalidateQueries({ queryKey: ['approvals'] })
      setApprovalTarget(null)
      setPostUploadPrompt(null)
      setApprovalNote('')
      toast('Sent for approval — the approver will get a popup', {
        type: 'success',
      })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const files = data?.files || []
  const openPicker = () => inputRef.current?.click()
  const onPick = (e) => {
    if (e.target.files?.length) upload.mutate(e.target.files)
    e.target.value = ''
  }
  const folderLabel = FOLDERS.find((f) => f.value === folder)?.label

  const openSendApproval = (file) => {
    setApprovalTarget(file)
    setApprovalNote('')
    setPostUploadPrompt(null)
  }

  return (
    <div className="space-y-4 min-h-full bg-[var(--bg-canvas)] p-4 md:p-5 lg:p-6">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onPick}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-primary">
            Drawings & files
          </h2>
          <p className="text-[13px] text-secondary">
            Upload plans, then optionally send them for admin approval. Routing
            is set on the Approvals page.
          </p>
        </div>
        {canManage && (
          <Button onClick={openPicker} loading={upload.isPending}>
            <UploadIcon className="h-3.5 w-3.5" />
            Upload
          </Button>
        )}
      </div>

      {!hasDrawingRoute && canManage && (
        <div className="flex items-start gap-3 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[13px] leading-relaxed text-secondary">
            No drawing approval route yet.             Open{' '}
            <Link to="/approvals" className="font-semibold text-accent hover:underline">
              Approvals
            </Link>
            , add a rule under <strong>Drawing / file</strong>, then you can
            send uploads for sign-off.
          </p>
        </div>
      )}

      <div className={PILL_TRACK}>
        {FOLDERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFolder(f.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition',
              folder === f.value ? PILL_ACTIVE : PILL_IDLE,
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (canManage && e.dataTransfer.files?.length) {
            upload.mutate(e.dataTransfer.files)
          }
        }}
        className={cn(
          'min-h-[280px] rounded-2xl border border-dashed bg-surface p-4 shadow-sm transition',
          dragging
            ? 'border-[var(--accent)] bg-[var(--nav-active-bg)]'
            : 'border-border',
        )}
      >
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface-raised" />
        ) : files.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={`No files in ${folderLabel}`}
            description={
              canManage
                ? 'Drag files here or click Upload — then send for approval when ready.'
                : 'No files have been shared in this folder.'
            }
            actionLabel={canManage ? 'Upload files' : undefined}
            onAction={canManage ? openPicker : undefined}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {files.map((f) => {
              const latest = f.versions?.[f.versions.length - 1]
              const chip = approvalChip(f)
              const uploadedBy = uploaderLabel(latest)
              const uploadedAt = formatUploadWhen(
                latest?.createdAt || f.createdAt,
              )
              const canSend =
                canManage &&
                f.approvalStatus !== 'pending' &&
                f.approvalStatus !== 'approved'
              return (
                <div
                  key={f._id}
                  className="overflow-hidden rounded-xl border border-border bg-surface-raised"
                >
                  <FileThumbnail
                    name={f.name}
                    mime={f.mime}
                    url={latest?.url}
                    version={`v${f.currentVersion || f.versions?.length || 1}`}
                    status={f.status}
                    onClick={() => {
                      if (latest?.url)
                        window.open(assetUrl(latest.url), '_blank')
                    }}
                  />
                  <div className="space-y-2 p-3">
                    {(uploadedBy || uploadedAt) && (
                      <p className="text-[11px] leading-relaxed text-secondary">
                        {uploadedBy ? (
                          <>
                            Uploaded by{' '}
                            <span className="font-semibold text-primary">
                              {uploadedBy}
                            </span>
                          </>
                        ) : (
                          'Uploaded'
                        )}
                        {uploadedAt ? (
                          <>
                            {' '}
                            · {uploadedAt}
                          </>
                        ) : null}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {chip ? (
                        <StatusChip status={chip.status} label={chip.label} />
                      ) : null}
                      {f.clientVisible && (
                        <StatusChip status="completed" label="Client visible" />
                      )}
                      {f.approver?.name && f.approvalStatus === 'pending' ? (
                        <span className="text-[11px] text-secondary">
                          → {f.approver.name}
                        </span>
                      ) : null}
                    </div>

                    {editing === f._id ? (
                      <form
                        className="flex w-full items-center gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const name = new FormData(e.currentTarget)
                            .get('name')
                            ?.toString()
                            .trim()
                          if (!name) return
                          renameFile.mutate({ fileId: f._id, name })
                        }}
                      >
                        <input
                          name="name"
                          defaultValue={f.name}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-[#c7dbfb] bg-surface px-2 py-1 text-[12px] text-primary outline-none"
                        />
                        <button
                          type="submit"
                          disabled={renameFile.isPending}
                          className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-secondary"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        {canSend && (
                          <button
                            type="button"
                            title="Send for approval"
                            onClick={() => openSendApproval(f)}
                            className="inline-flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/25"
                          >
                            <Send className="h-3 w-3" />
                            Send approval
                          </button>
                        )}
                        {canManage && (
                          <div className="ml-auto flex items-center gap-0.5">
                            <button
                              type="button"
                              title="Rename"
                              onClick={() => setEditing(f._id)}
                              className="rounded-md p-1.5 text-secondary transition hover:bg-surface hover:text-primary"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title={
                                f.clientVisible
                                  ? 'Hide from the client portal'
                                  : 'Show in the client portal'
                              }
                              onClick={() =>
                                renameFile.mutate({
                                  fileId: f._id,
                                  clientVisible: !f.clientVisible,
                                })
                              }
                              className="rounded-md p-1.5 text-secondary transition hover:bg-surface hover:text-primary"
                            >
                              {f.clientVisible ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              disabled={removeFile.isPending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Delete ${f.name}?\n\nAll ${f.versions?.length || 1} version(s) go with it. This cannot be undone.`,
                                  )
                                )
                                  return
                                removeFile.mutate(f._id)
                              }}
                              className="rounded-md p-1.5 text-secondary transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dragging && (
        <p className="text-center text-[12px] font-medium text-[var(--accent)]">
          Drop to upload into {folderLabel}
        </p>
      )}

      <SendApprovalModal
        open={!!(approvalTarget || postUploadPrompt)}
        file={approvalTarget || postUploadPrompt}
        note={approvalNote}
        setNote={setApprovalNote}
        members={members}
        hasRoute={hasDrawingRoute}
        loading={requestApproval.isPending}
        isPostUpload={!!postUploadPrompt && !approvalTarget}
        onClose={() => {
          setApprovalTarget(null)
          setPostUploadPrompt(null)
          setApprovalNote('')
        }}
        onSubmit={({ approverUser }) => {
          const file = approvalTarget || postUploadPrompt
          if (!file) return
          requestApproval.mutate({
            fileId: file._id,
            note: approvalNote,
            approverUser,
          })
        }}
        onSkip={() => {
          setPostUploadPrompt(null)
          setApprovalNote('')
        }}
      />
    </div>
  )
}

function SendApprovalModal({
  open,
  file,
  note,
  setNote,
  members,
  hasRoute,
  loading,
  isPostUpload,
  onClose,
  onSubmit,
  onSkip,
}) {
  const [approverUser, setApproverUser] = useState('')

  if (!open || !file) return null

  return (
    <Modal
      open={open}
      onClose={() => {
        setApproverUser('')
        onClose()
      }}
      title={isPostUpload ? 'Send for approval?' : 'Send for approval'}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-secondary">
          {isPostUpload
            ? `“${file.name}” is uploaded. Send it to the configured approver now, or skip and send later.`
            : `Route “${file.name}” to the Drawing / file approver. They get a live popup to approve or reject.`}
        </p>

        {!hasRoute && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-secondary">
            No default Drawing / file rule yet — pick a person below, or set
            routing on the Approvals page first.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-secondary">
            Note (optional)
          </span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Please check ceiling heights on level 2"
            className="w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-primary outline-none focus:border-accent/40"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-secondary">
            Approver {hasRoute ? '(optional override)' : '(required)'}
          </span>
          <select
            value={approverUser}
            onChange={(e) => setApproverUser(e.target.value)}
            className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-primary outline-none focus:border-accent/40"
          >
            <option value="">
              {hasRoute ? 'Use Approvals routing' : 'Select employee…'}
            </option>
            {members.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          {isPostUpload ? (
            <Button type="button" variant="secondary" onClick={onSkip}>
              Skip for now
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            loading={loading}
            disabled={!hasRoute && !approverUser}
            onClick={() => onSubmit({ approverUser: approverUser || undefined })}
          >
            <Send className="h-3.5 w-3.5" />
            Send for approval
          </Button>
        </div>
      </div>
    </Modal>
  )
}
