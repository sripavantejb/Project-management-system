import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Hash, Plus, Send, Users } from 'lucide-react'
import { api, useAuthStore } from '../lib/api'
import { syncSocketAuth } from '../lib/socket'
import { Avatar, toast } from '../components/ui'
import { CreateChannelModal } from '../components/CreateModals'
import { cn } from '../lib/utils'

export function ChannelsPage() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  const { data } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api('/channels'),
  })
  const channels = data?.channels || []

  useEffect(() => {
    if (!channelId && channels[0]?._id) {
      navigate(`/channels/${channels[0]._id}`, { replace: true })
    }
  }, [channelId, channels, navigate])

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-b border-border bg-surface md:max-h-none md:w-[240px] md:border-b-0 md:border-r">
        <div className="flex h-11 items-center justify-between border-b border-border px-3">
          <p className="text-[13px] font-semibold text-primary">Channels</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-md p-1 text-secondary hover:bg-surface-raised hover:text-primary"
            title="New channel"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
            {channels.map((c) => (
              <Link
                key={c._id}
                to={`/channels/${c._id}`}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] md:w-full',
                  channelId === c._id
                    ? 'bg-active text-primary'
                    : 'text-secondary hover:bg-surface-raised hover:text-primary',
                )}
              >
                <Hash className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
        <Link
          to="/inbox?tab=mail"
          className="hidden items-center gap-2 border-t border-border px-3 py-2.5 text-[12px] text-secondary hover:text-primary md:flex"
        >
          <Users className="h-3.5 w-3.5" />
          Direct messages
        </Link>
      </aside>

      <div className="min-h-0 min-w-0 flex-1">
        {channelId ? (
          <ChannelChat channelId={channelId} me={user} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-secondary">
            Select or create a channel
          </div>
        )}
      </div>

      <CreateChannelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}

function ChannelChat({ channelId, me }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['channel-messages', channelId],
    queryFn: () => api(`/channels/${channelId}/messages`),
    refetchInterval: 20_000,
  })

  const messages = data?.messages || []
  const channel = data?.channel

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Live channel messages via authenticated socket
  useEffect(() => {
    if (!channelId) return undefined
    const socket = syncSocketAuth()
    if (!socket) return undefined

    const join = () => socket.emit('join:channel', channelId)
    const onMessage = (payload) => {
      if (String(payload?.channelId) !== String(channelId)) return
      qc.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    }

    if (socket.connected) join()
    else socket.connect()
    socket.on('connect', join)
    socket.on('channel:message', onMessage)

    return () => {
      socket.emit('leave:channel', channelId)
      socket.off('connect', join)
      socket.off('channel:message', onMessage)
    }
  }, [channelId, qc])

  const send = useMutation({
    mutationFn: () =>
      api(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: text.trim() }),
      }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['channel-messages', channelId] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
        <Hash className="h-4 w-4 text-secondary" />
        <div>
          <p className="text-[14px] font-semibold text-primary">
            {channel?.name || '…'}
          </p>
          {channel?.description && (
            <p className="text-[11px] text-secondary">{channel.description}</p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading && (
          <p className="text-center text-[12px] text-secondary">Loading…</p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-[13px] text-secondary">
            No messages yet — say hello and @mention teammates.
          </p>
        )}
        {messages.map((m) => {
          const mine =
            String(m.author?._id || m.author) === String(me?.id || me?._id)
          return (
            <div
              key={m._id}
              className={cn('flex gap-2', mine && 'flex-row-reverse')}
            >
              <Avatar
                src={m.author?.avatar}
                name={m.author?.name}
                size="sm"
              />
              <div
                className={cn(
                  'max-w-[70%] rounded-lg px-3 py-2',
                  mine
                    ? 'bg-accent text-[#171717]'
                    : 'bg-surface text-primary ring-1 ring-black/[0.04]',
                )}
              >
                {!mine && (
                  <p className="mb-0.5 text-[11px] font-medium text-accent">
                    {m.author?.name}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-[13px]">{m.body}</p>
                <p
                  className={cn(
                    'mt-1 text-[10px]',
                    mine ? 'text-[#171717]/60' : 'text-secondary',
                  )}
                >
                  {m.createdAt && format(new Date(m.createdAt), 'h:mm a')}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-surface p-3">
        <div className="flex items-end gap-2 rounded-lg bg-surface-raised p-2 ring-1 ring-black/[0.04]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={`Message #${channel?.name || 'channel'}…  Use @Name to mention`}
            className="min-h-[44px] w-full resize-none bg-transparent px-1 text-[13px] text-primary outline-none placeholder:text-secondary"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                e.preventDefault()
                send.mutate()
              }
            }}
          />
          <button
            type="button"
            disabled={!text.trim() || send.isPending}
            onClick={() => send.mutate()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[#171717] disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-secondary">
          @mentions notify teammates instantly in Inbox.
        </p>
      </div>
    </div>
  )
}
