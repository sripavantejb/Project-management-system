import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { COUNTRY_CODES, buildPhone } from '../lib/phone'
import { toast } from './ui'

export function CreateSpaceModal({ open, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: (body) =>
      api('/spaces', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
      toast('Space created', { type: 'success' })
      setName('')
      onClose?.()
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  if (!open) return null
  return (
    <ModalShell title="New Space" onClose={onClose}>
      <p className="mb-3 text-[12px] text-[#8b8b90]">
        Spaces group related projects (like a folder for your studio work).
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Residential 2026"
        className="h-10 w-full rounded-lg border border-[#2e2e32] bg-[#121214] px-3 text-[13px] text-white outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) create.mutate({ name: name.trim() })
        }}
      />
      <button
        type="button"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate({ name: name.trim() })}
        className="mt-4 w-full rounded-lg bg-[#7B68EE] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create Space'}
      </button>
    </ModalShell>
  )
}

export function CreateProjectModal({ open, onClose, defaultSpaceId }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [phoneCode, setPhoneCode] = useState('+91')
  const [phone, setPhone] = useState('')
  const [spaceId, setSpaceId] = useState(defaultSpaceId || '')
  const [type, setType] = useState('residential')

  const { data: spacesData } = useQuery({
    queryKey: ['spaces'],
    queryFn: () => api('/spaces'),
    enabled: open,
  })
  const spaces = spacesData?.spaces || []

  const create = useMutation({
    mutationFn: (body) =>
      api('/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-nav'] })
      toast('Project created', { type: 'success' })
      setName('')
      setClientName('')
      setPhone('')
      onClose?.()
      if (res?.project?._id) navigate(`/projects/${res.project._id}/tasks`)
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  if (!open) return null
  return (
    <ModalShell title="New Project" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Project name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sharma Penthouse"
            className="h-10 w-full rounded-lg border border-[#2e2e32] bg-[#121214] px-3 text-[13px] text-white outline-none"
          />
        </Field>
        <Field label="Client name">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client / company"
            className="h-10 w-full rounded-lg border border-[#2e2e32] bg-[#121214] px-3 text-[13px] text-white outline-none"
          />
        </Field>
        <Field label="Client phone">
          <div className="flex gap-2">
            <select
              value={phoneCode}
              onChange={(e) => setPhoneCode(e.target.value)}
              className="h-10 w-[92px] shrink-0 rounded-lg border border-[#2e2e32] bg-[#121214] px-2 text-[13px] text-white outline-none"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ''))}
              placeholder="98765 43210"
              className="h-10 w-full rounded-lg border border-[#2e2e32] bg-[#121214] px-3 text-[13px] text-white outline-none"
            />
          </div>
        </Field>
        <Field label="Property type">
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'residential', label: 'Residential', hint: 'Home interiors' },
              { value: 'commercial', label: 'Commercial', hint: 'Offices & retail' },
              { value: 'renovation', label: 'Renovation', hint: 'Remodel & retrofit' },
              { value: 'custom', label: 'Custom', hint: 'Blank schedule — build your own' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={
                  type === opt.value
                    ? 'rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2.5 text-left'
                    : 'rounded-lg border border-[#2e2e32] bg-[#121214] px-3 py-2.5 text-left'
                }
              >
                <p className="text-[13px] font-semibold text-white">{opt.label}</p>
                <p className="mt-0.5 text-[11px] text-[#8b8b90]">{opt.hint}</p>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Space (optional)">
          <select
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            className="h-10 w-full rounded-lg border border-[#2e2e32] bg-[#121214] px-3 text-[13px] text-white outline-none"
          >
            <option value="">No space</option>
            {spaces.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button
        type="button"
        disabled={!name.trim() || !clientName.trim() || create.isPending}
        onClick={() =>
          create.mutate({
            name: name.trim(),
            clientName: clientName.trim(),
            clientPhone: buildPhone(phoneCode, phone),
            spaceId: spaceId || undefined,
            type,
          })
        }
        className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-[#0E0E10] disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create Project'}
      </button>
    </ModalShell>
  )
}

export function CreateChannelModal({ open, onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: (body) =>
      api('/channels', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      toast('Channel created', { type: 'success' })
      setName('')
      onClose?.()
      if (res?.channel?._id) navigate('/inbox?tab=mail')
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  if (!open) return null
  return (
    <ModalShell title="New Channel" onClose={onClose}>
      <p className="mb-3 text-[12px] text-[#8b8b90]">
        Everyone in the company can join public channels and chat in real time.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[#8b8b90]">#</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="design-reviews"
          className="h-10 w-full rounded-lg border border-[#2e2e32] bg-[#121214] px-3 text-[13px] text-white outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim())
              create.mutate({ name: name.trim() })
          }}
        />
      </div>
      <button
        type="button"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate({ name: name.trim() })}
        className="mt-4 w-full rounded-lg bg-[#7B68EE] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create Channel'}
      </button>
    </ModalShell>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[#8b8b90]">
        {label}
      </span>
      {children}
    </label>
  )
}

function ModalShell({ title, onClose, children }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0, y: 4 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.98, opacity: 0, y: 4 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-xl border border-[#2e2e32] bg-[#1c1c1e] p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-[#8b8b90] hover:bg-[#252528] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
