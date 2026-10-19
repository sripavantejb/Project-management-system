import { useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { StickyNote, Pencil, Trash2 } from 'lucide-react'
import { api, useAuthStore } from '../../lib/api'
import { Avatar, toast } from '../../components/ui'

/** Running log of client meetings — add, edit (author only) and delete summaries. */
export function MeetingNotes({ projectId, project, user }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const uid = String(user?._id || user?.id || '')
  const canModerate =
    ['owner', 'admin', 'project_manager'].includes(user?.role) ||
    user?.isPlatformAdmin

  const notes = [...(project.meetingNotes || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )

  const refresh = () => qc.invalidateQueries({ queryKey: ['project', projectId] })

  const add = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      }),
    onSuccess: () => {
      setText('')
      refresh()
      toast('Note saved', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not save note', { type: 'error' }),
  })

  const update = useMutation({
    mutationFn: ({ noteId, value }) =>
      api(`/projects/${projectId}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: value.trim() }),
      }),
    onSuccess: () => {
      setEditingId(null)
      refresh()
      toast('Note updated', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not update note', { type: 'error' }),
  })

  const removeNote = useMutation({
    mutationFn: (noteId) =>
      api(`/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh()
      toast('Note deleted', { type: 'success' })
    },
    onError: (e) => toast(e.message || 'Could not delete note', { type: 'error' }),
  })

  const submit = () => {
    if (text.trim() && !add.isPending) add.mutate()
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fef3c7] text-[#b45309]">
            <StickyNote className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-primary">
              Meeting notes
            </p>
            <p className="truncate text-[11px] text-secondary">
              Client calls, site visits &amp; decisions — newest first
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-bold text-secondary">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      <div className="px-4 py-3.5">
        {/* Composer */}
        <div className="rounded-xl border border-border bg-surface-raised p-2.5 transition focus-within:border-[#4ade80] focus-within:bg-surface focus-within:shadow-sm">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit()
            }}
            placeholder={`Summarize the meeting with ${project.clientName || 'the client'} — decisions taken, pending items, next steps…`}
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-primary outline-none placeholder:text-[#9aa7ba]"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10.5px] font-medium text-secondary">
              Ctrl + Enter to save
            </span>
            <button
              type="button"
              disabled={!text.trim() || add.isPending}
              onClick={submit}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              <StickyNote className="h-3.5 w-3.5" />
              {add.isPending ? 'Saving…' : 'Add note'}
            </button>
          </div>
        </div>

        {/* Timeline */}
        {notes.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-secondary">
            No meeting notes yet. After every client meeting, drop a quick
            summary here so the whole team stays in the loop.
          </p>
        ) : (
          <ol className="mt-4">
            {notes.map((note, i) => {
              const isAuthor = String(note.createdBy) === uid
              const isEditing = editingId === note._id
              const when = note.createdAt ? new Date(note.createdAt) : null
              return (
                <li key={note._id} className="group relative flex gap-3 pb-4 last:pb-0">
                  {/* Timeline rail */}
                  <div className="flex shrink-0 flex-col items-center">
                    <Avatar name={note.createdByName || 'Team'} size="sm" />
                    {i < notes.length - 1 && (
                      <span className="mt-1.5 w-px flex-1 bg-[#dfdfdf]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[12px] font-semibold text-primary">
                        {note.createdByName || 'Team member'}
                      </span>
                      {when && (
                        <span
                          className="text-[11px] text-secondary"
                          title={format(when, 'd MMM yyyy, h:mm a')}
                        >
                          {format(when, 'd MMM yyyy')} ·{' '}
                          {formatDistanceToNow(when, { addSuffix: true })}
                        </span>
                      )}
                      {note.editedAt && (
                        <span className="text-[10.5px] italic text-[#b4c0d0]">
                          edited
                        </span>
                      )}
                      {(isAuthor || canModerate) && !isEditing && (
                        <span className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                          {isAuthor && (
                            <button
                              type="button"
                              title="Edit note"
                              onClick={() => {
                                setEditingId(note._id)
                                setEditText(note.text)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-[var(--nav-active-bg)] hover:text-[var(--accent)]"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Delete note"
                            onClick={() => removeNote.mutate(note._id)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-1.5 rounded-xl border border-[#4ade80] bg-surface p-2 shadow-sm">
                        <textarea
                          rows={3}
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-primary outline-none"
                        />
                        <div className="mt-1 flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="h-7 rounded-lg px-2.5 text-[11.5px] font-semibold text-secondary hover:bg-surface-raised"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!editText.trim() || update.isPending}
                            onClick={() =>
                              update.mutate({ noteId: note._id, value: editText })
                            }
                            className="h-7 rounded-lg bg-[var(--accent)] px-2.5 text-[11.5px] font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
                          >
                            {update.isPending ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface-raised px-3 py-2 text-[13px] leading-relaxed text-primary ring-1 ring-inset ring-[#eef2f7]">
                        {note.text}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

/** Full-page "Notes" tab inside a project. */
export function ProjectNotes() {
  const { id } = useParams()
  const { project } = useOutletContext()
  const user = useAuthStore((s) => s.user)

  return (
    <div className="mx-auto w-full max-w-3xl min-h-full bg-[var(--bg-canvas)] p-4 md:p-5 lg:p-6">
      <MeetingNotes projectId={id} project={project} user={user} />
    </div>
  )
}
