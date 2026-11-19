import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { COUNTRY_CODES, buildPhone } from '../lib/phone'
import { toast } from './ui'

const fieldClass =
  'form-field h-10 w-full rounded-[8px] border border-border bg-surface-raised px-3 text-[13px] text-primary outline-none placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/15'

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
      <p className="mb-3 text-[12px] text-secondary">
        Spaces group related projects (like a folder for your studio work).
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Residential 2026"
        className={fieldClass}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) create.mutate({ name: name.trim() })
        }}
      />
      <button
        type="button"
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate({ name: name.trim() })}
        className="btn-create mt-4 w-full rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50"
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
            className={fieldClass}
          />
        </Field>
        <Field label="Client name">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client / company"
            className={fieldClass}
          />
        </Field>
        <Field label="Client phone">
          <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-stretch gap-2">
            <select
              value={phoneCode}
              onChange={(e) => setPhoneCode(e.target.value)}
              className={fieldClass}
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
              className={fieldClass}
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
                    ? 'rounded-lg border border-accent bg-accent/15 px-3 py-2.5 text-left'
                    : 'rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-left'
                }
              >
                <p className="text-[13px] font-semibold text-primary">{opt.label}</p>
                <p className="mt-0.5 text-[11px] text-secondary">{opt.hint}</p>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Space (optional)">
          <select
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            className={fieldClass}
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
        className="btn-create mt-4 w-full rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50"
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
      <p className="mb-3 text-[12px] text-secondary">
        Everyone in the company can join public channels and chat in real time.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-secondary">#</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="design-reviews"
          className={fieldClass}
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
        className="btn-create mt-4 w-full rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create Channel'}
      </button>
    </ModalShell>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-primary">
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
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0, y: 4 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.98, opacity: 0, y: 4 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="dark-modal w-full max-w-md rounded-xl border border-border bg-surface p-5 text-primary shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-secondary hover:bg-surface-raised hover:text-primary"
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
