import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, endOfMonth } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Award,
  Check,
  Crown,
  Flame,
  Gift,
  Lock,
  Medal,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trophy,
  TrendingUp,
} from 'lucide-react'
import { api, useAuthStore } from '../lib/api'
import {
  PageToolbar,
  ToolbarPills,
} from '../components/layout/PageToolbar'
import { Avatar, Button, EmptyState, Input, Select, toast } from '../components/ui'
import { cn } from '../lib/utils'

const PERIODS = [
  { key: 'weekly', label: 'Week' },
  { key: 'monthly', label: 'Month' },
  { key: 'all', label: 'All time' },
]

const CATEGORY_LABELS = {
  productivity: 'Productivity',
  quality: 'Quality',
  collaboration: 'Collaboration',
  client: 'Client',
  attendance: 'Attendance',
  improvement: 'Improvement',
  manual: 'Manual',
  penalty: 'Penalty',
}

const BADGE_META = {
  rising_star: {
    icon: Sparkles,
    tone: 'from-sky-400 to-blue-600',
    label: 'Rising Star',
  },
  consistent: {
    icon: Shield,
    tone: 'from-emerald-400 to-teal-600',
    label: 'Consistent',
  },
  high_impact: {
    icon: Flame,
    tone: 'from-amber-400 to-orange-600',
    label: 'High Impact',
  },
  champion: {
    icon: Trophy,
    tone: 'from-violet-400 to-fuchsia-600',
    label: 'Champion',
  },
}

const FIELD =
  'h-10 rounded-xl border-black/[0.08] bg-[#fbfbfd] focus:border-[var(--accent)]/55 focus:bg-white'

const CHART_TOOLTIP = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  boxShadow: 'none',
  fontSize: 12,
}

function roleLabel(role) {
  return String(role || 'member')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatPoints(value) {
  const n = Number(value) || 0
  return `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN')}`
}

export function ImpactPointsPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [period, setPeriod] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [tab, setTab] = useState('overview')
  const [adjust, setAdjust] = useState({
    userId: '',
    ruleKey: '',
    points: '',
    note: '',
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['impact-overview'],
    queryFn: () => api('/impact/overview'),
  })

  const { data: meData } = useQuery({
    queryKey: ['impact-me'],
    queryFn: () => api('/impact/me'),
  })

  const { data: boardData, isLoading: boardLoading } = useQuery({
    queryKey: ['impact-leaderboard', period, roleFilter, search],
    queryFn: () => {
      const params = new URLSearchParams({ period })
      if (roleFilter !== 'all') params.set('role', roleFilter)
      if (search.trim()) params.set('q', search.trim())
      return api(`/impact/leaderboard?${params}`)
    },
  })

  const profileId = selectedUserId
  const { data: profileData } = useQuery({
    queryKey: ['impact-user', profileId],
    queryFn: () => api(`/impact/users/${profileId}`),
    enabled: !!profileId,
  })

  const { data: championData } = useQuery({
    queryKey: ['impact-leaderboard', 'monthly', 'all', ''],
    queryFn: () => api('/impact/leaderboard?period=monthly'),
  })
  const champion = championData?.leaderboard?.[0]

  const canManage = !!data?.canManage
  const me = meData?.score || data?.me || {
    totalPoints: 0,
    weeklyPoints: 0,
    monthlyPoints: 0,
  }
  const badges = meData?.badges || data?.badges || []
  const company = data?.company || {}
  const viewingPerson = !!selectedUserId
  const breakdown = viewingPerson
    ? profileData?.breakdown || []
    : company.breakdown || []
  const trend = viewingPerson ? profileData?.trend || [] : company.trend || []
  const timeline = viewingPerson
    ? profileData?.timeline || []
    : company.timeline || []
  const viewedName = viewingPerson ? profileData?.user?.name || '' : ''
  const companyScope = company.scope === 'company'
  const leaderboard = boardData?.leaderboard || []
  const people = data?.people || []
  const rules = data?.rules || []

  const roles = useMemo(
    () => [...new Set(people.map((p) => p.role))].sort(),
    [people],
  )

  const myRank =
    leaderboard.find(
      (row) => String(row.user._id) === String(user?.id || user?._id),
    )?.rank || '—'

  const adjustMutation = useMutation({
    mutationFn: (body) =>
      api('/impact/adjust', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast('Impact points updated', { type: 'success' })
      setAdjust({ userId: '', ruleKey: '', points: '', note: '' })
      qc.invalidateQueries({ queryKey: ['impact-overview'] })
      qc.invalidateQueries({ queryKey: ['impact-me'] })
      qc.invalidateQueries({ queryKey: ['impact-leaderboard'] })
      qc.invalidateQueries({ queryKey: ['impact-user'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const saveRule = useMutation({
    mutationFn: ({ id, ...body }) =>
      api(`/impact/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast('Rule saved', { type: 'success' })
      qc.invalidateQueries({ queryKey: ['impact-overview'] })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'board', label: 'Leaderboard' },
    ...(canManage ? [{ key: 'rules', label: 'Rules' }] : []),
  ]

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="h-12 animate-pulse rounded-2xl bg-white ring-1 ring-black/[0.04]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-black/[0.04]"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-12">
      <PageToolbar
        left={<ToolbarPills items={tabs} value={tab} onChange={setTab} />}
        right={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 text-[12px] font-semibold text-secondary transition hover:bg-[#ebebed] hover:text-primary disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
            />
            Refresh
          </button>
        }
      />

      {tab === 'rules' && canManage ? (
        <RulesPanel rules={rules} onSave={saveRule} />
      ) : tab === 'board' ? (
        <LeaderboardSection
          period={period}
          setPeriod={setPeriod}
          search={search}
          setSearch={setSearch}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          roles={roles}
          leaderboard={leaderboard}
          boardLoading={boardLoading}
          profileId={profileId}
          onSelect={(id) => {
            setSelectedUserId(id)
            setTab('overview')
          }}
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ScoreHero
              total={me.totalPoints || 0}
              weekly={me.weeklyPoints || 0}
              monthly={me.monthlyPoints || 0}
              rank={myRank}
            />
            <MiniMetric
              icon={TrendingUp}
              label="This week"
              value={formatPoints(me.weeklyPoints || 0)}
            />
            <MiniMetric
              icon={Flame}
              label="This month"
              value={formatPoints(me.monthlyPoints || 0)}
            />
            <MiniMetric
              icon={Medal}
              label="Badges"
              value={badges.filter((b) => b.earned).length}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <ChampionRewardCard
              champion={champion}
              isMe={
                champion &&
                String(champion.user?._id) === String(user?.id || user?._id)
              }
            />
            <Panel
              title="Achievement levels"
              subtitle="Unlock badges as your impact grows"
            >
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {badges.map((badge) => {
                  const meta = BADGE_META[badge.key] || BADGE_META.rising_star
                  const Icon = meta.icon
                  const total = Number(me.totalPoints) || 0
                  const pct = badge.minPoints
                    ? Math.min(100, Math.round((total / badge.minPoints) * 100))
                    : 100
                  const toGo = Math.max(0, (badge.minPoints || 0) - total)
                  return (
                    <div
                      key={badge.key}
                      className={cn(
                        'relative overflow-hidden rounded-2xl p-3 text-center ring-1 transition',
                        badge.earned
                          ? 'bg-amber-50/80 ring-amber-200/70'
                          : 'bg-[#fbfbfd] ring-black/[0.05]',
                      )}
                    >
                      <div className="relative mx-auto h-12 w-12">
                        <span
                          className={cn(
                            'flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-white',
                            meta.tone,
                            !badge.earned && 'opacity-40 grayscale',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white',
                            badge.earned
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-[#ebebed] text-[#86868b]',
                          )}
                        >
                          {badge.earned ? (
                            <Check className="h-3 w-3" strokeWidth={3} />
                          ) : (
                            <Lock className="h-2.5 w-2.5" />
                          )}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] font-semibold text-[#1d1d1f]">
                        {badge.label}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-[#86868b]">
                        {badge.description}
                      </p>
                      {badge.earned ? (
                        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                          <Award className="h-2.5 w-2.5" />
                          Unlocked
                        </p>
                      ) : (
                        <div className="mt-2">
                          <div className="h-1 overflow-hidden rounded-full bg-[#ebebed]">
                            <div
                              className={cn(
                                'h-full rounded-full bg-gradient-to-r',
                                meta.tone,
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] font-medium tabular-nums text-[#86868b]">
                            {toGo.toLocaleString('en-IN')} to go
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Panel>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-5">
                <Panel
                  className="lg:col-span-3"
                  title="30-day trend"
                  subtitle={
                    viewedName
                      ? `Daily points — ${viewedName}`
                      : companyScope
                        ? 'Company-wide daily points'
                        : 'Your daily points'
                  }
                  action={
                    viewingPerson ? (
                      <button
                        type="button"
                        onClick={() => setSelectedUserId('')}
                        className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[11px] font-semibold text-[#0071e3]"
                      >
                        Company view
                      </button>
                    ) : null
                  }
                >
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trend}
                        margin={{ top: 8, right: 8, left: -18 }}
                      >
                        <defs>
                          <linearGradient
                            id="impactFillLight"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="var(--accent)"
                              stopOpacity={0.28}
                            />
                            <stop
                              offset="100%"
                              stopColor="var(--accent)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="rgba(0,0,0,0.05)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          stroke="#86868b"
                          fontSize={10}
                          tickFormatter={(v) => String(v).slice(5)}
                        />
                        <YAxis stroke="#86868b" fontSize={10} />
                        <Tooltip contentStyle={CHART_TOOLTIP} />
                        <Area
                          type="monotone"
                          dataKey="points"
                          stroke="var(--accent)"
                          fill="url(#impactFillLight)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel
                  className="lg:col-span-2"
                  title="Point sources"
                  subtitle={
                    viewedName
                      ? `${viewedName}'s mix`
                      : companyScope
                        ? 'Company mix'
                        : 'Your mix'
                  }
                >
                  <div className="space-y-3">
                    {breakdown.length === 0 && (
                      <p className="py-8 text-center text-[12px] text-[#86868b]">
                        No scored activity yet.
                      </p>
                    )}
                    {breakdown.map((row) => {
                      const max = Math.max(
                        ...breakdown.map((b) => Math.abs(b.points)),
                        1,
                      )
                      const pct = Math.round(
                        (Math.abs(row.points) / max) * 100,
                      )
                      return (
                        <div key={row.category}>
                          <div className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="font-medium text-[#1d1d1f]">
                              {CATEGORY_LABELS[row.category] || row.category}
                            </span>
                            <span
                              className={cn(
                                'font-semibold tabular-nums',
                                row.points < 0
                                  ? 'text-red-600'
                                  : 'text-[#1d1d1f]',
                              )}
                            >
                              {formatPoints(row.points)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f5f5f7]">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                row.points < 0 ? 'bg-red-400' : 'bg-[var(--accent)]',
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Panel>
              </div>

              <Panel
                title="Top of the board"
                subtitle="Tap someone to inspect their score"
                action={
                  <button
                    type="button"
                    onClick={() => setTab('board')}
                    className="text-[12px] font-semibold text-[#0071e3] hover:underline"
                  >
                    Full leaderboard
                  </button>
                }
                noPadding
              >
                <ul className="divide-y divide-black/[0.04]">
                  {leaderboard.slice(0, 5).map((row) => (
                    <li key={row.user._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(String(row.user._id))}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#fbfbfd] sm:px-5"
                      >
                        <RankBadge rank={row.rank} />
                        <Avatar
                          src={row.user.avatar}
                          name={row.user.name}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">
                            {row.user.name}
                          </p>
                          <p className="truncate text-[11px] text-[#86868b]">
                            {row.user.title || roleLabel(row.user.role)}
                          </p>
                        </div>
                        <p className="tabular-nums text-[14px] font-semibold text-[#1d1d1f]">
                          {(row.totalPoints || 0).toLocaleString('en-IN')}
                        </p>
                      </button>
                    </li>
                  ))}
                  {!leaderboard.length && (
                    <p className="px-5 py-10 text-center text-[12px] text-[#86868b]">
                      No scores yet.
                    </p>
                  )}
                </ul>
              </Panel>
            </div>

            <div className="space-y-4">
              {canManage && (
                <Panel
                  title="Adjust points"
                  subtitle="Add or deduct for any teammate"
                >
                  <div className="space-y-3">
                    <Select
                      label="Employee"
                      className={FIELD}
                      value={adjust.userId}
                      onChange={(e) =>
                        setAdjust((s) => ({ ...s, userId: e.target.value }))
                      }
                      options={[
                        { value: '', label: 'Select employee…' },
                        ...people.map((p) => ({
                          value: p._id,
                          label: `${p.name} · ${roleLabel(p.role)}`,
                        })),
                      ]}
                    />
                    <Select
                      label="Preset rule"
                      className={FIELD}
                      value={adjust.ruleKey}
                      onChange={(e) =>
                        setAdjust((s) => ({ ...s, ruleKey: e.target.value }))
                      }
                      options={[
                        { value: '', label: 'Custom points…' },
                        ...rules.map((r) => ({
                          value: r.key,
                          label: `${r.label} (${formatPoints(r.points)})`,
                        })),
                      ]}
                    />
                    {!adjust.ruleKey && (
                      <Input
                        label="Custom points"
                        type="number"
                        className={FIELD}
                        placeholder="+20 or -15"
                        value={adjust.points}
                        onChange={(e) =>
                          setAdjust((s) => ({ ...s, points: e.target.value }))
                        }
                      />
                    )}
                    <Input
                      label="Note"
                      className={FIELD}
                      placeholder="Reason"
                      value={adjust.note}
                      onChange={(e) =>
                        setAdjust((s) => ({ ...s, note: e.target.value }))
                      }
                    />
                    <Button
                      className="w-full"
                      disabled={
                        adjustMutation.isPending ||
                        !adjust.userId ||
                        (!adjust.ruleKey && !Number(adjust.points))
                      }
                      onClick={() => {
                        const body = {
                          userId: adjust.userId,
                          note: adjust.note,
                        }
                        if (adjust.ruleKey) body.ruleKey = adjust.ruleKey
                        else body.points = Number(adjust.points)
                        adjustMutation.mutate(body)
                      }}
                    >
                      {Number(adjust.points) < 0 ||
                      rules.find((r) => r.key === adjust.ruleKey)?.points <
                        0 ? (
                        <Minus className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Apply
                    </Button>
                  </div>
                </Panel>
              )}

              <Panel
                title="Activity"
                subtitle={
                  viewingPerson && viewedName
                    ? `${viewedName}'s recent events`
                    : companyScope
                      ? 'Company feed'
                      : 'Your recent events'
                }
                action={
                  viewingPerson ? (
                    <button
                      type="button"
                      onClick={() => setSelectedUserId('')}
                      className="text-[11px] font-semibold text-[#0071e3]"
                    >
                      Company feed
                    </button>
                  ) : null
                }
                noPadding
              >
                <div className="max-h-[420px] overflow-y-auto">
                  {timeline.length === 0 && (
                    <p className="px-5 py-10 text-center text-[12px] text-[#86868b]">
                      No transactions yet.
                    </p>
                  )}
                  {timeline.map((entry) => {
                    const entryUser =
                      entry.userId && typeof entry.userId === 'object'
                        ? entry.userId
                        : null
                    return (
                      <div
                        key={entry._id}
                        className="flex gap-3 border-b border-black/[0.04] px-4 py-3 last:border-0 sm:px-5"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                            entry.weightedPoints < 0
                              ? 'bg-red-50 text-red-600'
                              : 'bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {entry.weightedPoints < 0 ? (
                            <Minus className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-[#1d1d1f]">
                                {entry.label}
                              </p>
                              {!viewingPerson && entryUser?.name && (
                                <p className="mt-0.5 text-[11px] text-[#86868b]">
                                  {entryUser.name}
                                </p>
                              )}
                            </div>
                            <span
                              className={cn(
                                'shrink-0 text-[13px] font-semibold tabular-nums',
                                entry.weightedPoints < 0
                                  ? 'text-red-600'
                                  : 'text-emerald-700',
                              )}
                            >
                              {formatPoints(entry.weightedPoints)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#86868b]">
                            {CATEGORY_LABELS[entry.category] || entry.category}
                            {entry.source === 'manual' ? ' · Manual' : ' · Auto'}
                            {entry.projectId?.name
                              ? ` · ${entry.projectId.name}`
                              : ''}
                            {' · '}
                            {new Date(entry.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {entry.note && (
                            <p className="mt-1 text-[11px] text-[#6e6e73]">
                              {entry.note}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function LeaderboardSection({
  period,
  setPeriod,
  search,
  setSearch,
  roleFilter,
  setRoleFilter,
  roles,
  leaderboard,
  boardLoading,
  profileId,
  onSelect,
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarPills items={PERIODS} value={period} onChange={setPeriod} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="h-9 w-[200px] rounded-full border-0 bg-[#f5f5f7] pl-8 pr-3 text-[12px] outline-none ring-1 ring-black/[0.04] focus:bg-white focus:ring-[var(--accent)]/40"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-full border-0 bg-[#f5f5f7] px-3 text-[12px] font-medium text-secondary outline-none ring-1 ring-black/[0.04]"
        >
          <option value="all">All roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
      </div>

      {boardLoading ? (
        <p className="py-16 text-center text-[13px] text-[#86868b]">
          Loading leaderboard…
        </p>
      ) : !leaderboard.length ? (
        <div className="rounded-2xl bg-white py-2 ring-1 ring-black/[0.04]">
          <EmptyState
            icon={Trophy}
            title="No people match"
            description="Try another period, role, or search."
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05] divide-y divide-black/[0.04]">
          {leaderboard.map((row) => {
            const active = String(row.user._id) === String(profileId)
            return (
              <li key={row.user._id}>
                <button
                  type="button"
                  onClick={() => onSelect(String(row.user._id))}
                  className={cn(
                    'flex w-full flex-col gap-3 px-4 py-3.5 text-left transition sm:flex-row sm:items-center sm:px-5',
                    active ? 'bg-[var(--accent)]/08' : 'hover:bg-[#fbfbfd]',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <RankBadge rank={row.rank} />
                    <Avatar
                      src={row.user.avatar}
                      name={row.user.name}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[#1d1d1f]">
                        {row.user.name}
                      </p>
                      <p className="truncate text-[12px] text-[#86868b]">
                        {row.user.title || roleLabel(row.user.role)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center sm:w-[220px]">
                    <div>
                      <p className="text-[10px] text-[#86868b]">Week</p>
                      <p className="text-[13px] font-semibold tabular-nums">
                        {row.weeklyPoints}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#86868b]">Month</p>
                      <p className="text-[13px] font-semibold tabular-nums">
                        {row.monthlyPoints}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#86868b]">All</p>
                      <p className="text-[14px] font-semibold tabular-nums text-[#1d1d1f]">
                        {row.totalPoints}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 sm:w-28 sm:justify-end">
                    {(row.badges || []).slice(0, 4).map((key) => {
                      const meta = BADGE_META[key] || BADGE_META.rising_star
                      const BadgeIcon = meta.icon
                      return (
                        <span
                          key={key}
                          title={meta.label}
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-white',
                            meta.tone,
                          )}
                        >
                          <BadgeIcon className="h-3 w-3" />
                        </span>
                      )
                    })}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ChampionRewardCard({ champion, isMe }) {
  const now = new Date()
  const daysLeft = Math.max(0, differenceInCalendarDays(endOfMonth(now), now))
  const monthLabel = now.toLocaleString('en-IN', { month: 'long' })

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.05]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-800">
          <Crown className="h-3 w-3" />
          Company Champion
        </span>
        <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[10px] font-medium text-[#86868b]">
          {daysLeft}d left in {monthLabel}
        </span>
      </div>
      <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
        Finish #1 this month & win the reward
      </h3>
      <p className="mt-1 text-[12px] leading-relaxed text-[#86868b]">
        Top of the monthly impact board gets the company gift.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber-50/80 px-3.5 py-3 ring-1 ring-amber-200/60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <Gift className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-amber-900">
            Amazon Gift Voucher
          </p>
          <p className="text-[11px] text-amber-800/70">Awarded at month end</p>
        </div>
        <Trophy className="h-4 w-4 shrink-0 text-amber-600" />
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#f5f5f7] p-3">
        {champion ? (
          <>
            <div className="relative shrink-0">
              <Avatar
                src={champion.user?.avatar}
                name={champion.user?.name}
                size="sm"
              />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-2 ring-white">
                <Crown className="h-2.5 w-2.5" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
                Leading now
              </p>
              <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">
                {champion.user?.name}
              </p>
            </div>
            {isMe && (
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[#0d7a4f]">
                You
              </span>
            )}
            <div className="shrink-0 text-right">
              <p className="text-[15px] font-semibold tabular-nums text-amber-800">
                {(champion.monthlyPoints || 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-[#86868b]">pts this month</p>
            </div>
          </>
        ) : (
          <p className="w-full py-1 text-center text-[12px] text-[#86868b]">
            Crown is up for grabs — no points this month yet.
          </p>
        )}
      </div>
    </section>
  )
}

function ScoreHero({ total, weekly, monthly, rank }) {
  return (
    <section className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/[0.04] md:col-span-2 xl:col-span-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
        Your impact
      </p>
      <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.04em] text-[#1d1d1f] tabular-nums">
        {(total || 0).toLocaleString('en-IN')}
      </p>
      <p className="mt-2 text-[12px] text-[#86868b]">
        Rank #{rank} · Week {formatPoints(weekly)} · Month{' '}
        {formatPoints(monthly)}
      </p>
    </section>
  )
}

function MiniMetric({ icon: Icon, label, value }) {
  return (
    <section className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/[0.04]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            {label}
          </p>
          <p className="mt-2 text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-[#1d1d1f]">
            {value}
          </p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-[#1d1d1f]">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  )
}

function Panel({ title, subtitle, action, children, className, noPadding }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.04] px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-[#86868b]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={noPadding ? '' : 'px-4 pb-4 pt-3 sm:px-5'}>
        {children}
      </div>
    </section>
  )
}

function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-sm">
        <Crown className="h-3.5 w-3.5" />
      </span>
    )
  }
  if (rank === 2 || rank === 3) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f5f7] text-[12px] font-bold text-[#1d1d1f]">
        {rank}
      </span>
    )
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f5f7] text-[11px] font-semibold text-[#86868b]">
      {rank}
    </span>
  )
}

function RulesPanel({ rules, onSave }) {
  const [drafts, setDrafts] = useState({})

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (rules || []).map((r) => [
          r._id,
          {
            points: r.points,
            weight: r.weight,
            enabled: r.enabled,
            label: r.label,
          },
        ]),
      ),
    )
  }, [rules])

  return (
    <Panel
      title="Company point rules"
      subtitle="Tune weights and values for your studio"
      action={
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#86868b]">
          <Settings2 className="h-3.5 w-3.5" />
          Admin only
        </span>
      }
      noPadding
    >
      <div className="divide-y divide-black/[0.04]">
        {(rules || []).map((rule) => {
          const draft = drafts[rule._id] || {
            points: rule.points,
            weight: rule.weight,
            enabled: rule.enabled,
            label: rule.label,
          }
          return (
            <div
              key={rule._id}
              className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_100px_90px_90px_110px]"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#1d1d1f]">
                  {rule.label}
                </p>
                <p className="mt-0.5 text-[11px] text-[#86868b]">
                  {rule.description || CATEGORY_LABELS[rule.category]}
                  {rule.auto ? ' · Auto' : ' · Manual'}
                </p>
              </div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">
                Points
                <input
                  type="number"
                  value={draft.points}
                  onChange={(e) =>
                    setDrafts((s) => ({
                      ...s,
                      [rule._id]: { ...draft, points: Number(e.target.value) },
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-xl border border-black/[0.08] bg-[#fbfbfd] px-2 text-[12px] font-semibold tabular-nums outline-none focus:border-[var(--accent)]/45"
                />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">
                Weight
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.weight}
                  onChange={(e) =>
                    setDrafts((s) => ({
                      ...s,
                      [rule._id]: { ...draft, weight: Number(e.target.value) },
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-xl border border-black/[0.08] bg-[#fbfbfd] px-2 text-[12px] font-semibold tabular-nums outline-none focus:border-[var(--accent)]/45"
                />
              </label>
              <label className="flex items-end gap-2 pb-1 text-[11px] font-semibold text-[#6e6e73]">
                <input
                  type="checkbox"
                  checked={!!draft.enabled}
                  onChange={(e) =>
                    setDrafts((s) => ({
                      ...s,
                      [rule._id]: { ...draft, enabled: e.target.checked },
                    }))
                  }
                />
                Enabled
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={onSave.isPending}
                onClick={() =>
                  onSave.mutate({
                    id: rule._id,
                    points: draft.points,
                    weight: draft.weight,
                    enabled: draft.enabled,
                  })
                }
              >
                Save
              </Button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
