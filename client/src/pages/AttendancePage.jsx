import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, MapPin } from 'lucide-react'
import { api, useAuthStore } from '../lib/api'
import { ADMIN_PORTAL_ROLES } from '../lib/roles'
import { Button, Card, EmptyState, toast } from '../components/ui'

function indiaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function formatDay(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function shiftDay(value, days) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function mapsHref(pin) {
  if (!pin) return null
  return `https://www.google.com/maps?q=${pin.latitude},${pin.longitude}`
}

async function captureBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => reject(new Error('Allow location so this punch can be saved.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 20000 },
    )
  })
}

export function AttendancePage() {
  const user = useAuthStore((s) => s.user)
  const canReview = !!user?.isPlatformAdmin || ADMIN_PORTAL_ROLES.includes(user?.role)
  const [tab, setTab] = useState('me')
  const [busy, setBusy] = useState(null)
  const qc = useQueryClient()

  const today = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api('/attendance/today'),
  })
  const history = useQuery({
    queryKey: ['attendance', 'mine'],
    queryFn: () => api('/attendance/mine?limit=14'),
    enabled: today.data?.eligible !== false && tab === 'me',
  })
  const todayDate = today.data?.workDate || indiaToday()
  const [date, setDate] = useState(null)
  const activeDate = date || todayDate
  const team = useQuery({
    queryKey: ['attendance', 'team', activeDate],
    queryFn: () => api(`/attendance/team?date=${activeDate}`),
    enabled: canReview && tab === 'team' && !!activeDate,
  })

  const record = today.data?.record
  const punchedIn = !!record?.punchIn
  const punchedOut = !!record?.punchOut

  const punch = async (kind) => {
    setBusy(kind)
    try {
      const pin = await captureBrowserLocation()
      await api(kind === 'in' ? '/attendance/punch-in' : '/attendance/punch-out', {
        method: 'POST',
        body: JSON.stringify(pin),
      })
      await qc.invalidateQueries({ queryKey: ['attendance'] })
    } catch (err) {
      toast(err?.message || 'Could not save this punch')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">Studio day</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-primary">Attendance</h1>
          <p className="mt-1 max-w-xl text-sm text-secondary">
            Location is saved only at punch in and punch out. Nothing is tracked in the background.
          </p>
        </div>
        {canReview ? (
          <div className="flex rounded-[10px] border border-border bg-surface p-1">
            {[
              ['me', 'My day'],
              ['team', 'Team'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-[8px] px-3 py-1.5 text-sm ${tab === key ? 'bg-surface-raised text-primary' : 'text-secondary'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'team' && canReview ? (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button type="button" className="text-sm text-secondary" onClick={() => setDate(shiftDay(activeDate, -1))}>
              Previous
            </button>
            <p className="text-sm font-medium text-primary">{formatDay(activeDate)}</p>
            <button
              type="button"
              className="text-sm text-secondary disabled:opacity-40"
              disabled={activeDate >= todayDate}
              onClick={() => setDate(shiftDay(activeDate, 1))}
            >
              Next
            </button>
          </div>
          {team.isLoading ? (
            <p className="text-sm text-secondary">Loading the team…</p>
          ) : team.isError ? (
            <EmptyState title="Couldn’t load attendance" description={team.error?.message} />
          ) : (
            <div className="divide-y divide-border">
              {(team.data?.people || []).map((person) => {
                const inPin = person.record?.punchIn
                const outPin = person.record?.punchOut
                const status = outPin ? 'Out' : inPin ? 'In' : 'Not in'
                return (
                  <div key={person.user.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-primary">{person.user.name}</p>
                      <p className="text-xs text-secondary">
                        In {formatTime(inPin?.at)} · Out {formatTime(outPin?.at)}
                      </p>
                      <div className="mt-1 flex gap-3 text-xs">
                        {mapsHref(inPin) ? (
                          <a className="inline-flex items-center gap-1 text-secondary underline" href={mapsHref(inPin)} target="_blank" rel="noreferrer">
                            <MapPin className="h-3 w-3" /> In location
                          </a>
                        ) : null}
                        {mapsHref(outPin) ? (
                          <a className="inline-flex items-center gap-1 text-secondary underline" href={mapsHref(outPin)} target="_blank" rel="noreferrer">
                            <MapPin className="h-3 w-3" /> Out location
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-secondary">{status}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-1 h-5 w-5 text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.12em] text-secondary">{formatDay(todayDate)}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-primary">
                  {punchedOut ? 'Day closed' : punchedIn ? 'You’re in' : 'Not punched in'}
                </h2>
                <p className="mt-1 text-sm text-secondary">
                  {punchedOut
                    ? `In ${formatTime(record?.punchIn?.at)} · Out ${formatTime(record?.punchOut?.at)}`
                    : punchedIn
                      ? `Started at ${formatTime(record?.punchIn?.at)}`
                      : 'Punch in when the day starts.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!punchedIn ? (
                    <Button loading={busy === 'in'} disabled={!!busy} onClick={() => punch('in')}>
                      Punch in
                    </Button>
                  ) : null}
                  {punchedIn && !punchedOut ? (
                    <Button loading={busy === 'out'} disabled={!!busy} onClick={() => punch('out')}>
                      Punch out
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-primary">Recent days</h3>
            {(history.data?.records || []).length === 0 ? (
              <p className="text-sm text-secondary">No punches yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {(history.data?.records || []).map((row) => (
                  <div key={row.id} className="flex justify-between py-2 text-sm">
                    <span className="text-primary">{formatDay(row.workDate)}</span>
                    <span className="text-secondary">
                      {formatTime(row.punchIn?.at)} – {row.punchOut ? formatTime(row.punchOut.at) : 'open'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
