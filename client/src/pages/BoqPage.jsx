import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  History,
  Image as ImageIcon,
  Layers,
  FileText,
  Maximize2,
  MoreHorizontal,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../lib/api'
import { formatInr } from '../lib/format'
import {
  BOQ_UNITS as UNITS,
  materialMasterAoa,
  normalizeForDedupe,
  rowsToBoqLines,
  unitLabel,
} from '../lib/boqImport'
import { CubicQuoteDocument, lineQty } from '../components/boq/CubicQuoteDocument'
import {
  MeasurementSheet,
  itemTotal as measureItemTotal,
} from '../components/boq/MeasurementSheet'
import { toast } from '../components/ui'
import { PageToolbar, PILL_ACTIVE, PILL_IDLE, PILL_TRACK } from '../components/layout/PageToolbar'
import {
  BOQ_TYPE_META,
  MaterialCatalogPicker,
  NewBoqTypeModal,
  catalogRowToBoqLine,
  isMaterialSpecSheet,
  normalizeMaterialFields,
  roomSuggestionsForType,
} from '../components/boq/MaterialCatalogPicker'
import { cn } from '../lib/utils'

const UNIT_VALUES = UNITS.map((u) => u.value)

const STATUS_META = {
  draft: {
    label: 'Draft',
    dot: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
  sent: {
    label: 'Sent',
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 ring-blue-200',
  },
  viewed: {
    label: 'Viewed',
    dot: 'bg-indigo-500',
    pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  approved: {
    label: 'Approved',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    dot: 'bg-red-500',
    pill: 'bg-red-50 text-red-700 ring-red-200',
  },
}

const CARD =
  'on-dark rounded-[20px] border border-[var(--panel-dark-border)] bg-[var(--panel-dark)] shadow-[0_8px_24px_-14px_rgba(0,0,0,0.35)]'

/** Only the commercial template derives its quantities from a take-off sheet. */
function boqTypeLeadsWithMeasurements(boqType) {
  return boqType === 'commercial'
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function blankLine(room = 'General', { material = false } = {}) {
  return {
    _key: uid(),
    description: '',
    unit: material ? 'sheet' : 'sft',
    qty: 0,
    rate: 0,
    amount: 0,
    room,
    image: '',
    remarks: '',
    category: '',
    measureNo: 0,
    width: 1,
    height: 1,
    materialFamily: '',
    materialName: '',
    grade: '',
    thickness: '',
    brand: '',
    dimensions: '',
  }
}

function normalizeItems(items = []) {
  return items.map((it, i) => {
    const row = {
      _key: it._id || it._key || `row-${i}`,
      description: it.description || '',
      unit: it.unit || 'sft',
      qty: Number(it.qty) || 0,
      rate: Number(it.rate) || 0,
      amount: Number(it.amount) || 0,
      room: it.room || 'General',
      image: it.image || '',
      remarks: it.remarks || it.note || '',
      category: it.category || '',
      measureNo: Number(it.measureNo) || 0,
      width: Number(it.width) || 0,
      height: Number(it.height) || 0,
      /**
       * Source hierarchy from the Cubic template. This rebuilds each row from a
       * whitelist, so anything missing here is silently dropped when a saved
       * sheet is reopened — that blanked the Sl. column and, worse, lost the
       * sortIndex that links a BOQ line to its measurement total.
       */
      slNo: it.slNo || '',
      group: it.group || '',
      section: it.section || '',
      sectionNo: it.sectionNo || '',
      unitLabel: it.unitLabel || '',
      note: it.note || '',
      sortIndex: Number.isFinite(Number(it.sortIndex)) ? Number(it.sortIndex) : i,
      ...normalizeMaterialFields(it),
    }
    if (!row.qty) row.qty = lineQty(row)
    row.amount = (Number(row.qty) || 0) * (Number(row.rate) || 0)
    return row
  })
}

function lineAmount(it) {
  return lineQty(it) * (Number(it.rate) || 0)
}

function projectIdOf(quote) {
  const p = quote?.projectId
  if (!p) return ''
  return String(p._id || p)
}

function initialsOf(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '—'
  )
}

/* ─────────────── Page shell ─────────────── */

export function BoqPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects-boq'],
    queryFn: () => api('/projects'),
  })
  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotations', 'all'],
    queryFn: () => api('/quotations'),
  })

  const projects = projectsData?.projects || []
  const quotations = quotesData?.quotations || []

  const statsByProject = useMemo(() => {
    const map = {}
    for (const q of quotations) {
      const pid = projectIdOf(q)
      if (!pid) continue
      if (!map[pid]) map[pid] = { count: 0, total: 0, approved: 0, drafts: 0 }
      map[pid].count += 1
      map[pid].total += Number(q.grandTotal) || 0
      if (q.status === 'approved') map[pid].approved += 1
      if (q.status === 'draft') map[pid].drafts += 1
    }
    return map
  }, [quotations])

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return projects
    return projects.filter((p) =>
      [p.name, p.clientName, p.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    )
  }, [projects, search])

  const activeProject = projects.find((p) => String(p._id) === String(projectId))
  const projectQuotes = useMemo(
    () => quotations.filter((q) => projectIdOf(q) === String(projectId || '')),
    [quotations, projectId],
  )

  const portfolioTotal = quotations.reduce(
    (s, q) => s + (Number(q.grandTotal) || 0),
    0,
  )
  const approvedTotal = quotations
    .filter((q) => q.status === 'approved')
    .reduce((s, q) => s + (Number(q.grandTotal) || 0), 0)

  return (
    <div className="h-full min-h-0 bg-[#f4f7fb] print:block print:h-auto print:bg-surface">
      <div className="h-full min-h-0 print:h-auto print:overflow-visible">
        {!projectId ? (
          <PortfolioView
            projects={filteredProjects}
            stats={statsByProject}
            loading={projectsLoading || quotesLoading}
            search={search}
            onSearch={setSearch}
            onPick={(id) => navigate(`/boq/${id}`)}
            sheetCount={quotations.length}
            portfolioTotal={portfolioTotal}
            approvedTotal={approvedTotal}
          />
        ) : (
          <ProjectBoqBoard
            key={projectId}
            project={activeProject}
            projectId={projectId}
            quotes={projectQuotes}
            loading={quotesLoading}
            onBack={() => navigate('/boq')}
          />
        )}
      </div>
    </div>
  )
}

/* ─────────────── All-projects overview ─────────────── */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'with', label: 'With sheets' },
  { key: 'approved', label: 'Approved' },
  { key: 'empty', label: 'Not started' },
]

function PortfolioView({
  projects,
  stats,
  loading,
  search,
  onSearch,
  onPick,
  sheetCount,
  portfolioTotal,
  approvedTotal,
}) {
  const [filter, setFilter] = useState('all')

  const visible = projects.filter((p) => {
    const s = stats[String(p._id)] || { count: 0, approved: 0 }
    if (filter === 'with') return s.count > 0
    if (filter === 'approved') return s.approved > 0
    if (filter === 'empty') return s.count === 0
    return true
  })

  const maxTotal = Math.max(
    1,
    ...projects.map((p) => stats[String(p._id)]?.total || 0),
  )
  const approvedShare = portfolioTotal
    ? Math.round((approvedTotal / portfolioTotal) * 100)
    : 0

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-canvas)]">
      <div className="mx-auto w-full max-w-[1220px] px-5 py-6 sm:px-8 sm:py-8">
        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            <HeroStat label="Projects" value={projects.length} />
            <HeroStat label="Sheets" value={sheetCount} />
            <HeroStat label="Quoted" value={formatInr(portfolioTotal)} accent />
          </div>

          {portfolioTotal > 0 && (
            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex items-center justify-between text-[11.5px] font-medium text-secondary">
                <span>
                  Approved value{' '}
                  <span className="font-semibold tabular-nums text-primary">
                    {formatInr(approvedTotal)}
                  </span>
                </span>
                <span className="tabular-nums">{approvedShare}% of quoted</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
                  style={{ width: `${approvedShare}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <PageToolbar
          className="mt-6"
          left={
            <div className={cn(PILL_TRACK, 'on-dark')}>
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition',
                    filter === f.key ? PILL_ACTIVE : PILL_IDLE,
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
          right={
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-secondary" />
              <input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search projects or clients"
                className="h-[40px] w-full rounded-full border border-border bg-surface pl-10 pr-9 text-[12.5px] text-primary outline-none transition placeholder:text-secondary focus:border-accent/40 focus:ring-4 focus:ring-accent/10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearch('')}
                  title="Clear search"
                  className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          }
        />

        {/* Cards */}
        <div className="mt-4 pb-10">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-[168px] animate-pulse rounded-[20px] bg-[var(--panel-dark)]"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className={cn(CARD, 'px-8 py-16 text-center')}>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-white/35">
                <Layers className="h-5 w-5" />
              </div>
              <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em] text-white">
                Nothing here yet
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-white/45">
                No projects match this filter. Try “All”, or create a project
                first — its BOQ sheets will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p) => (
                <ProjectCard
                  key={p._id}
                  project={p}
                  stats={stats[String(p._id)]}
                  maxTotal={maxTotal}
                  onOpen={() => onPick(p._id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HeroStat({ label, value, accent }) {
  return (
    <div className="rounded-2xl bg-white px-3.5 py-3 shadow-sm">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 whitespace-nowrap text-[17px] font-semibold tabular-nums tracking-[-0.02em]',
          accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function ProjectCard({ project, stats, maxTotal, onOpen }) {
  const s = stats || { count: 0, total: 0, approved: 0, drafts: 0 }
  const share = Math.round((s.total / maxTotal) * 100)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        CARD,
        'group relative overflow-hidden p-5 text-left transition-all duration-200',
        'hover:-translate-y-[2px] hover:bg-[var(--panel-dark-raised)] hover:shadow-[0_16px_36px_-16px_rgba(0,0,0,0.45)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold tracking-tight text-white/80 ring-1 ring-inset ring-white/[0.08] transition group-hover:bg-[var(--accent)]/15 group-hover:text-[var(--accent)]">
          {initialsOf(project.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.012em] text-white">
            {project.name}
          </h3>
          <p className="mt-0.5 truncate text-[12px] text-white/45">
            {project.clientName || 'No client'}
            {project.location ? ` · ${project.location}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Quoted value
        </p>
        <p className="mt-0.5 text-[22px] font-semibold tabular-nums leading-none tracking-[-0.03em] text-[var(--accent)]">
          {formatInr(s.total)}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-[var(--accent)]/70 transition-all duration-500"
            style={{ width: `${s.total ? Math.max(share, 4) : 0}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={s.count ? 'neutral' : 'muted'}>
            {s.count} {s.count === 1 ? 'sheet' : 'sheets'}
          </Chip>
          {s.approved > 0 && <Chip tone="success">{s.approved} approved</Chip>}
          {s.drafts > 0 && <Chip tone="muted">{s.drafts} draft</Chip>}
        </div>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--accent)] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 -translate-x-1">
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}

function Chip({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-white/[0.08] text-white/70 ring-white/[0.06]',
    success: 'bg-[var(--accent)]/15 text-[var(--accent)] ring-[var(--accent)]/20',
    muted: 'bg-white/[0.04] text-white/40 ring-white/[0.04]',
  }
  return (
    <span
      className={cn(
        'rounded-lg px-2 py-[3px] text-[11px] font-semibold ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

/* ─────────────── One project: sheet tabs + editor ─────────────── */

function ProjectBoqBoard({ project, projectId, quotes, loading, onBack }) {
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState(false)
  const [draftType, setDraftType] = useState(null)
  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (draft) return
    if (!quotes.length) {
      setActiveId(null)
      return
    }
    if (!activeId || !quotes.some((q) => String(q._id) === String(activeId))) {
      setActiveId(String(quotes[0]._id))
    }
  }, [quotes, activeId, draft])

  const activeQuote = draft
    ? null
    : quotes.find((q) => String(q._id) === String(activeId))

  const projectTotal = quotes.reduce(
    (s, q) => s + (Number(q.grandTotal) || 0),
    0,
  )

  const startDraft = (boqType) => {
    const type =
      boqType === 'commercial' || boqType === 'residential'
        ? boqType
        : project?.type === 'commercial'
          ? 'commercial'
          : 'residential'
    setDraftType(type)
    setDraft(true)
    setActiveId(null)
    setTypeModalOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col print:block print:h-auto">
      <NewBoqTypeModal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        onPick={startDraft}
        projectType={project?.type}
      />
      {/* One row: back · sheet switcher · new. The project name and total live
          in the sheet's own command bar, so nothing is repeated here. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-[#e1e8f1] bg-surface px-3 py-2 print:hidden sm:px-5">
        <button
          type="button"
          onClick={onBack}
          title="Back to all projects"
          aria-label="Back to all projects"
          className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9aa7ba] transition hover:bg-[#f2f6fb] hover:text-[#24b47e]"
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        </button>

        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {quotes.map((q) => {
            const meta = STATUS_META[q.status] || STATUS_META.draft
            const active = !draft && String(q._id) === String(activeId)
            return (
              <button
                key={q._id}
                type="button"
                onClick={() => {
                  setDraft(false)
                  setActiveId(String(q._id))
                }}
                title={`${q.title} · ${BOQ_TYPE_META[q.boqType]?.label || 'Standard'} · ${formatInr(q.grandTotal || 0)}`}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-left transition-all duration-150',
                  active
                    ? 'border-[#c7dbfb] bg-[#eef4ff] shadow-[0_1px_2px_rgba(37,99,235,0.10)]'
                    : 'border-[#e9eef6] bg-surface hover:border-[#d7e0ec] hover:bg-[#f9fbfd]',
                )}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
                <span
                  className={cn(
                    'max-w-[170px] truncate text-[12px] font-semibold leading-none tracking-[-0.005em]',
                    active ? 'text-[#24b47e]' : 'text-[#0b1220]',
                  )}
                >
                  {q.title}
                </span>
                <span className="shrink-0 text-[11px] leading-none tabular-nums text-[#9aa7ba]">
                  {formatInr(q.grandTotal || 0)}
                </span>
              </button>
            )
          })}
          {draft && draftType && (
            <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-[#b6cef7] bg-[#f5f9ff] px-2.5 text-[12px] font-semibold leading-none text-[#24b47e]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ecf8e]" />
              New {BOQ_TYPE_META[draftType]?.label} · unsaved
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          title="All BOQ versions for this project"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-2.5 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb] hover:text-[#0b1220]"
        >
          <History className="h-3.5 w-3.5" />
          History
          <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-[#64748b]">
            {quotes.length || 0}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            project?.type === 'blank' ? setTypeModalOpen(true) : startDraft()
          }
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#3ecf8e] px-3 text-[12px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(37,99,235,0.75)] transition hover:bg-[#24b47e]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New sheet</span>
        </button>
      </header>

      {historyOpen ? (
        <BoqHistoryPanel
          quotes={quotes}
          activeId={activeId}
          onClose={() => setHistoryOpen(false)}
          onSelect={(id) => {
            setHistoryOpen(false)
            setDraft(false)
            setDraftType(null)
            setActiveId(String(id))
            const picked = quotes.find((q) => String(q._id) === String(id))
            toast(
              picked
                ? `Opened · ${picked.title || 'BOQ version'}`
                : 'Opened version',
              { type: 'success' },
            )
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 print:h-auto print:overflow-visible">
        {loading ? (
          <div className="m-5 h-64 animate-pulse rounded-2xl bg-surface" />
        ) : !activeQuote && !draft ? (
          <EmptyProject onCreate={() => startDraft()} projectType={project?.type} />
        ) : (
          <BoqSheet
            key={activeQuote?._id || `draft-${draftType}`}
            quotation={activeQuote}
            project={project}
            projectId={projectId}
            projectQuotes={quotes}
            draftBoqType={draft ? draftType : null}
            onOpenHistory={() => setHistoryOpen(true)}
            onSelectQuote={(id) => {
              setDraft(false)
              setDraftType(null)
              setActiveId(String(id))
            }}
            onCreated={(id) => {
              setDraft(false)
              setDraftType(null)
              setActiveId(String(id))
            }}
            onDeleted={() => {
              setDraft(false)
              setDraftType(null)
              setActiveId(null)
            }}
            onCancelDraft={draft ? () => { setDraft(false); setDraftType(null) } : null}
          />
        )}
      </div>
    </div>
  )
}

function EmptyProject({ onCreate, projectType }) {
  const label = projectType === 'commercial' ? 'commercial' : 'residential'
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className={cn(CARD, 'max-w-lg px-10 py-12 text-center')}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef4ff] to-[#f7faff] text-[#3ecf8e] ring-1 ring-inset ring-[#dbe7fb]">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <p className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-[#0b1220]">
          No quotation for this project yet
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#8a98ac]">
          We&apos;ll load the full {label} interior schedule — every row from the
          Cubic quotation template — so you can take off quantities and approve
          the budget.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#3ecf8e] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.6)] transition hover:bg-[#24b47e]"
        >
          <Plus className="h-4 w-4" />
          Open quotation BOQ
        </button>
      </div>
    </div>
  )
}

/* ─────────────── The editable sheet ─────────────── */

function BoqSheet({
  quotation,
  project,
  projectId,
  projectQuotes = [],
  draftBoqType,
  onOpenHistory,
  onSelectQuote,
  onCreated,
  onDeleted,
  onCancelDraft,
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const tableRef = useRef(null)
  const excelInputRef = useRef(null)
  /**
   * True while `items` is nothing but the auto-loaded starter template that
   * silently fills a brand-new sheet (see the boqType effect below) — the
   * user hasn't chosen or entered any of it. The first Excel import on such
   * a sheet should replace that scaffold outright, not merge with it.
   */
  const autoSeededRef = useRef(false)
  const galleryInputRef = useRef(null)
  const rowImageInputRef = useRef(null)
  const rowImageTarget = useRef(null)

  const tenant = useAuthStore((s) => s.tenant)
  const initialBoqType =
    quotation?.boqType && quotation.boqType !== 'general'
      ? quotation.boqType
      : draftBoqType || (project?.type === 'commercial' ? 'commercial' : 'residential')

  const [boqType, setBoqType] = useState(initialBoqType)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [fullQuote, setFullQuote] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [title, setTitle] = useState(
    quotation?.title || 'QUOTATION FOR INTERIOR & EXECUTION',
  )
  const [versionLabel, setVersionLabel] = useState(
    quotation?.versionLabel || BOQ_TYPE_META[initialBoqType]?.label || 'Standard',
  )
  const [items, setItems] = useState(() =>
    quotation?.items?.length ? normalizeItems(quotation.items) : [],
  )
  const [attachments, setAttachments] = useState(
    () => quotation?.attachments?.map((a) => ({ ...a })) || [],
  )
  const [discount, setDiscount] = useState(quotation?.discount || 0)
  const [gst, setGst] = useState(quotation?.gstPercent ?? 18)
  const [chargesPercent, setChargesPercent] = useState(
    quotation?.chargesPercent ?? 0,
  )
  const [dirty, setDirty] = useState(false)
  const [focusIdx, setFocusIdx] = useState(null)
  const [focusRoomIdx, setFocusRoomIdx] = useState(null)
  const [docMeta, setDocMeta] = useState(() => ({ ...(quotation?.docMeta || {}) }))
  const [headerOpen, setHeaderOpen] = useState(false)
  const [measurements, setMeasurements] = useState(
    () => quotation?.measurements?.map((m) => ({ ...m })) || [],
  )
  const [spaces, setSpaces] = useState(() => quotation?.spaces || [])
  /**
   * One navigation model for the sheet: quantities → pricing → the document.
   * Commercial starts on the take-off since that is where its numbers come
   * from; an approved sheet opens on the finished quotation.
   */
  const [tab, setTab] = useState(() => {
    if (quotation?.status === 'approved') return 'quote'
    if (boqTypeLeadsWithMeasurements(initialBoqType) && !quotation?.items?.length)
      return 'measure'
    return 'boq'
  })
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState(null)

  const locked = (quotation?.status || 'draft') === 'approved'
  const status = quotation?.status || 'draft'
  const statusMeta = STATUS_META[status] || STATUS_META.draft
  const interiorMode = boqType === 'residential' || boqType === 'commercial'
  const materialMode = !interiorMode && isMaterialSpecSheet(boqType, items)
  const roomSuggestions = roomSuggestionsForType(boqType)

  /** Template chrome for this property type: columns, charges, terms, annexures. */
  const { data: catalogData } = useQuery({
    queryKey: ['boq-catalog', boqType],
    queryFn: () => api(`/boq-catalog/${boqType}`),
    enabled: interiorMode,
    staleTime: 60 * 60 * 1000,
  })
  const template = catalogData?.template || null
  const chargesLabel =
    quotation?.chargesLabel || template?.charges?.[0]?.label || ''

  // A sheet created before charges existed still has to pick up the template rate
  useEffect(() => {
    if (!interiorMode || !template) return
    if (quotation?.chargesPercent !== undefined && quotation?.chargesPercent !== null)
      return
    setChargesPercent(template.charges?.[0]?.percent ?? 0)
  }, [interiorMode, template, quotation?.chargesPercent])

  const measureMode = boqTypeLeadsWithMeasurements(boqType)
  const quoteView = interiorMode && tab === 'quote'

  /** The steps this sheet actually has, in the order the work happens. */
  const steps = useMemo(
    () =>
      [
        measureMode && {
          key: 'measure',
          label: 'Measurements',
          hint: 'Derive quantities',
        },
        { key: 'boq', label: 'BOQ', hint: 'Rates & amounts' },
        interiorMode && { key: 'quote', label: 'Quotation', hint: 'The document' },
      ].filter(Boolean),
    [measureMode, interiorMode],
  )

  /** Full take-off template — the sheet shows every row from the off. */
  const { data: measureCatalog } = useQuery({
    queryKey: ['measurement-catalog', boqType],
    queryFn: () => api(`/measurement-catalog/${boqType}`),
    enabled: measureMode,
    staleTime: 60 * 60 * 1000,
  })

  // Seed a brand new commercial sheet with the whole take-off. Narrowing to a
  // subset of rooms is a filter on top of it, not a gate in front of it.
  useEffect(() => {
    if (!measureMode || !measureCatalog?.items?.length) return
    if (quotation?.measurements?.length || measurements.length) return
    setMeasurements(measureCatalog.items.map((m) => ({ ...m })))
    setSpaces((measureCatalog.spaces || []).map((s) => s.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureMode, measureCatalog])

  /** Seed the sheet for the chosen rooms, keeping edits to rows we already had. */
  const pickSpaces = async (picked) => {
    try {
      const res = await api(
        `/measurement-catalog/${boqType}?spaces=${encodeURIComponent(picked.join(','))}`,
      )
      const seeded = res.items || []
      setMeasurements((prev) => {
        if (!prev.length) return seeded
        // preserve any row the user has already touched for a kept space
        const byName = new Map(prev.map((p) => [`${p.group}|${p.name}`, p]))
        return seeded.map((s) => {
          const old = byName.get(`${s.group}|${s.name}`)
          if (!old) return s
          const keep = new Set(picked)
          const edited = old.rows.filter((r) => keep.has(r.space))
          return { ...s, rows: edited.length ? edited : s.rows, overrideTotal: old.overrideTotal }
        })
      })
      setSpaces(picked)
      markDirty()
      toast(`Take-off seeded for ${picked.length} spaces`, { type: 'success' })
    } catch (e) {
      toast(e.message || 'Could not load the measurement sheet', { type: 'error' })
    }
  }

  const updateMeasurement = (index, next) => {
    if (locked) return
    markDirty()
    setMeasurements((prev) => prev.map((m, i) => (i === index ? next : m)))
  }

  /**
   * Copies every measured total onto the BOQ line it feeds. Lump-sum lines keep
   * their quantity of 1 — the measurement is context for the rate, not a count.
   */
  const applyMeasurementsToBoq = () => {
    if (locked) return
    const bySortIndex = new Map()
    const sectionSums = new Map()
    for (const m of measurements) {
      const key = `${m.group}|${m.sectionName}`
      sectionSums.set(key, (sectionSums.get(key) || 0) + measureItemTotal(m))
      if (m.boqRef?.index >= 0) bySortIndex.set(m.boqRef.index, measureItemTotal(m))
    }
    for (const m of measurements) {
      if (!m.boqTotalLabel || !(m.boqRef?.index >= 0)) continue
      const key = `${m.group}|${m.sectionName}`
      bySortIndex.set(
        m.boqRef.index,
        m.boqTotal == null || m.boqTotal === ''
          ? sectionSums.get(key) || 0
          : Number(m.boqTotal) || 0,
      )
    }

    let touched = 0
    setItems((prev) =>
      prev.map((it) => {
        const total = bySortIndex.get(it.sortIndex)
        if (total == null || it.unit === 'ls') return it
        touched += 1
        return { ...it, qty: total, measureNo: 0, width: 0, height: 0 }
      }),
    )
    markDirty()
    setTab('boq')
    toast(`Updated ${touched} BOQ quantities from the take-off`, { type: 'success' })
  }

  /** Logos are stored as upload paths — the document needs servable URLs. */
  const docMetaResolved = useMemo(
    () => ({
      ...docMeta,
      clientLogo: docMeta.clientLogo ? assetUrl(docMeta.clientLogo) : '',
      // Platform-admin company logo wins for the quotation letterhead mark.
      companyLogo: assetUrl(tenant?.logoUrl || docMeta.companyLogo || '') || '',
    }),
    [docMeta, tenant?.logoUrl],
  )

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + lineAmount(i), 0),
    [items],
  )
  const chargesAmount = (subtotal * (Number(chargesPercent) || 0)) / 100
  const taxable = subtotal + chargesAmount
  const gstAmount = (taxable * (Number(gst) || 0)) / 100
  const grand = Math.max(0, taxable + gstAmount - (Number(discount) || 0))

  /** Contiguous runs of the same room, so the sheet reads like a real BOQ. */
  const groups = useMemo(() => {
    const out = []
    items.forEach((it, idx) => {
      const room = it.room?.trim() || 'INTERIOR / JOINERY'
      const last = out[out.length - 1]
      if (last && last.room === room) {
        last.endIdx = idx
        last.total += lineAmount(it)
      } else {
        out.push({ room, startIdx: idx, endIdx: idx, total: lineAmount(it) })
      }
    })
    return out
  }, [items])

  const byRoom = useMemo(() => {
    const map = {}
    for (const it of items) {
      const room = it.room?.trim() || 'INTERIOR / JOINERY'
      map[room] = (map[room] || 0) + lineAmount(it)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [items])

  const markDirty = () => {
    if (!locked) setDirty(true)
    // Any real edit means the sheet is no longer "just the auto-seeded
    // template" — loadInteriorCatalog's silent path re-asserts this flag
    // itself right after calling markDirty, so that path is unaffected.
    autoSeededRef.current = false
  }

  const updateItem = (idx, key, value) => {
    if (locked) return
    markDirty()
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        const next = { ...it, [key]: value }
        if (['measureNo', 'width', 'height', 'qty', 'rate'].includes(key)) {
          if (key !== 'qty') next.qty = lineQty(next)
          next.amount = lineAmount(next)
        }
        return next
      }),
    )
  }

  const addLine = (afterIdx, room) => {
    if (locked) return
    markDirty()
    setItems((prev) => {
      const next = [...prev]
      const insertAt = afterIdx == null ? next.length : afterIdx + 1
      const r = room || next[afterIdx]?.room || 'INTERIOR / JOINERY'
      next.splice(insertAt, 0, blankLine(r, { material: materialMode }))
      return next
    })
    setFocusIdx(afterIdx == null ? items.length : afterIdx + 1)
  }

  /**
   * Adds a whole new category (the bold section band), not just a row inside an
   * existing one. Names are kept unique so two fresh categories don't merge into
   * a single band before they've been renamed.
   */
  const addCategory = (afterIdx) => {
    if (locked) return
    const taken = new Set(items.map((it) => (it.room || '').trim().toUpperCase()))
    let name = 'NEW CATEGORY'
    for (let n = 2; taken.has(name.toUpperCase()); n += 1) name = `NEW CATEGORY ${n}`
    const insertAt = afterIdx == null ? items.length : afterIdx + 1
    markDirty()
    setItems((prev) => {
      const next = [...prev]
      next.splice(insertAt, 0, blankLine(name, { material: materialMode }))
      return next
    })
    setFocusRoomIdx(insertAt)
  }

  const removeLine = (idx) => {
    if (locked) return
    markDirty()
    setItems((prev) =>
      prev.length <= 1 ? [blankLine('INTERIOR / JOINERY', { material: materialMode })] : prev.filter((_, i) => i !== idx),
    )
  }

  const duplicateLine = (idx) => {
    if (locked) return
    markDirty()
    setItems((prev) => {
      const next = [...prev]
      next.splice(idx + 1, 0, { ...prev[idx], _key: uid() })
      return next
    })
  }

  const payload = (extra = {}) => ({
    title: title.trim() || 'Project BOQ',
    versionLabel: versionLabel.trim() || BOQ_TYPE_META[boqType]?.label || 'Standard',
    boqType: boqType || 'general',
    items: items.map(({ _key, ...i }) => ({
      ...i,
      ...normalizeMaterialFields(i),
      qty: lineQty(i),
      rate: Number(i.rate) || 0,
      amount: lineAmount(i),
      room: i.room?.trim() || 'General',
      category: i.category || '',
      measureNo: Number(i.measureNo) || 0,
      width: Number(i.width) || 0,
      height: Number(i.height) || 0,
      description:
        i.description?.trim() ||
        [i.materialName, i.grade, i.thickness, i.brand, i.dimensions]
          .filter(Boolean)
          .join(' · ') ||
        '',
      unit: i.unit || 'nos',
      image: i.image || '',
      remarks: i.remarks || '',
      note: i.remarks || i.note || '',
      // source hierarchy, so the quotation can redraw the template headings
      slNo: i.slNo || '',
      group: i.group || '',
      section: i.section || '',
      sectionNo: i.sectionNo || '',
      unitLabel: i.unitLabel || '',
      note: i.note || '',
      // stated explicitly: this is what ties a line to its measurement total
      sortIndex: Number.isFinite(Number(i.sortIndex)) ? Number(i.sortIndex) : 0,
    })),
    attachments: attachments.map(({ _id, ...a }) => a),
    docMeta,
    spaces,
    measurements: measurements.map((m) => ({
      ...m,
      overrideTotal:
        m.overrideTotal === '' || m.overrideTotal == null
          ? null
          : Number(m.overrideTotal),
      rows: (m.rows || []).map((r) => ({
        space: r.space || '',
        unit: r.unit || m.unit || 'sft',
        nos: Number(r.nos) || 0,
        length: Number(r.length) || 0,
        width: Number(r.width) || 0,
        qty: Number(r.qty) || 0,
      })),
    })),
    chargesPercent: Number(chargesPercent) || 0,
    chargesLabel,
    gstPercent: Number(gst) || 0,
    discount: Number(discount) || 0,
    subtotal,
    grandTotal: grand,
    ...extra,
  })

  const loadInteriorCatalog = async ({ silent, boqType: override } = {}) => {
    const type = override || boqType
    try {
      const res = await api(`/boq-catalog/${type}`)
      const lines = (res.items || []).map((row, i) => ({
        _key: uid(),
        ...row,
        qty: lineQty(row),
        amount: lineAmount(row),
        _id: undefined,
      }))
      if (!lines.length) return
      setItems(lines)
      if (!quotation?._id) markDirty()
      autoSeededRef.current = Boolean(silent)
      if (!silent) {
        toast(`Loaded ${lines.length} ${BOQ_TYPE_META[type]?.label} quotation lines`, {
          type: 'success',
        })
      }
    } catch (e) {
      if (!silent) toast(e.message || 'Could not load quotation template', { type: 'error' })
    }
  }

  useEffect(() => {
    if (quotation?.items?.length) return
    if (!interiorMode) return
    loadInteriorCatalog({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boqType])

  /**
   * Switching a sheet between residential and commercial swaps the whole
   * schedule, so confirm before discarding lines the user has already worked on.
   */
  const changeBoqType = async (next) => {
    if (locked || next === boqType) return
    const label = BOQ_TYPE_META[next]?.label || next
    if (
      items.length &&
      !window.confirm(
        `Switch this sheet to ${label}?\n\nThe ${items.length} current lines will be replaced with the ${label} quotation template.`,
      )
    )
      return
    setBoqType(next)
    setVersionLabel(label)
    markDirty()
    await loadInteriorCatalog({ boqType: next })
  }

  const loadMaterialTemplate = async () => {
    if (locked) return
    try {
      const res = await api(`/material-catalog/template/${boqType}`)
      const lines = (res.items || []).map((row) => ({
        _key: uid(),
        ...catalogRowToBoqLine(row, 'Materials'),
      }))
      markDirty()
      setItems(lines)
      toast(`Loaded ${lines.length} ${BOQ_TYPE_META[boqType]?.label} materials`, {
        type: 'success',
      })
      setCatalogOpen(false)
    } catch (e) {
      toast(e.message || 'Could not load template', { type: 'error' })
    }
  }

  const addCatalogRow = (row) => {
    if (locked) return
    markDirty()
    setItems((prev) => [...prev, { _key: uid(), ...catalogRowToBoqLine(row, 'Materials') }])
    toast('Material added to sheet', { type: 'success' })
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects-boq'] })
    qc.invalidateQueries({ queryKey: ['project', projectId] })
    qc.invalidateQueries({ queryKey: ['portfolio'] })
    return qc.invalidateQueries({ queryKey: ['quotations'] })
  }

  const save = useMutation({
    mutationFn: (body) => {
      if (quotation?._id) {
        return api(`/quotations/${quotation._id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      }
      return api('/quotations', {
        method: 'POST',
        body: JSON.stringify({ ...body, projectId }),
      })
    },
    onSuccess: async (res, vars) => {
      // Wait for the list to refetch so a brand new sheet exists before selecting it
      await invalidate()
      setDirty(false)
      if (!quotation?._id && res?.quotation?._id) onCreated?.(res.quotation._id)
      const next = vars?.status
      if (next === 'sent')
        toast('Marked as sent to the client', { type: 'success' })
      else if (next === 'approved') {
        setTab('quote')
        toast('Approved — budget set. Opening quotation.', { type: 'success' })
      }
      else if (next === 'draft')
        toast('Sheet reopened as draft', { type: 'success' })
      else toast('BOQ saved', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () => api(`/quotations/${quotation._id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      onDeleted?.()
      await invalidate()
      toast('BOQ deleted', { type: 'success' })
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const unlock = useMutation({
    mutationFn: () =>
      api(`/quotations/${quotation._id}/unlock`, { method: 'POST', body: {} }),
    onSuccess: async (res) => {
      await invalidate()
      toast(
        res?.message ||
          'Unlocked for edits. Approved copy kept in History.',
        { type: 'success' },
      )
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!locked && !save.isPending) save.mutate(payload())
      }
      if (e.key === 'Escape') setFullQuote(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hotkey saves the latest snapshot
  }, [locked, save.isPending, title, versionLabel, items, attachments, gst, discount])

  useEffect(() => {
    if (focusIdx == null) return
    const row = tableRef.current?.querySelector(`[data-row="${focusIdx}"]`)
    row?.querySelector('[data-field="materialName"], input[data-field="description"]')?.focus()
    setFocusIdx(null)
  }, [focusIdx, items.length])

  // A freshly added category opens with its name selected, ready to be typed over
  useEffect(() => {
    if (focusRoomIdx == null) return
    const input = tableRef.current?.querySelector(`[data-room="${focusRoomIdx}"]`)
    input?.focus()
    input?.select()
    setFocusRoomIdx(null)
  }, [focusRoomIdx, items.length])

  /* ── Excel import / export ── */
  const lineHasContent = (it) =>
    Boolean(
      it.description?.trim() ||
        it.materialFamily ||
        it.materialName ||
        it.grade ||
        it.brand ||
        lineAmount(it) > 0,
    )

  const importExcel = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('That file has no readable sheet')
      const grid = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
        raw: false,
      })
      const lines = rowsToBoqLines(grid, {
        uid,
        defaultRoom: BOQ_TYPE_META[boqType]?.section || 'INTERIOR / JOINERY',
      }).map((line) => ({ ...line, ...normalizeMaterialFields(line) }))
      if (!lines.length) {
        toast('No material rows found in that sheet', { type: 'error' })
        return
      }
      // Capture this before markDirty() runs — markDirty() itself clears
      // autoSeededRef.current (any real edit means the sheet is no longer
      // "just the seed"), so reading it after would always see false.
      const replacingSeed = autoSeededRef.current
      markDirty()
      autoSeededRef.current = false
      let skipped = 0
      setItems((prev) => {
        // A sheet that still holds nothing but its silently auto-loaded
        // starter template hasn't really been "started" yet — the user's
        // file is the real content, so it replaces the scaffold outright
        // instead of sitting alongside it.
        const keep = replacingSeed ? [] : prev.filter(lineHasContent)
        // Re-importing the same (or an overlapping) sheet used to just pile
        // the new rows on top of whatever was already there, silently
        // doubling the BOQ. Skip any row whose description already exists
        // in this sheet — only genuinely new rows get added.
        const existingKeys = new Set(
          keep.map((l) => normalizeForDedupe(l.description)),
        )
        const toAdd = []
        for (const line of lines) {
          const key = normalizeForDedupe(line.description)
          if (key && existingKeys.has(key)) {
            skipped += 1
            continue
          }
          if (key) existingKeys.add(key)
          toAdd.push(line)
        }
        return keep.length ? [...keep, ...toAdd] : toAdd
      })
      toast(
        replacingSeed
          ? `Replaced the starter template with ${lines.length} rows from your file`
          : skipped
            ? `Imported ${lines.length - skipped} new rows · skipped ${skipped} already in this sheet`
            : `Imported ${lines.length} rows into the material master`,
        { type: 'success' },
      )
    } catch (e) {
      toast(e.message || 'Could not read that Excel file', { type: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const exportTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const aoa = materialMasterAoa(
        items.filter(lineHasContent).length
          ? items
          : [
              {
                materialFamily: 'Plywood',
                materialName: 'Plywood',
                grade:
                  BOQ_TYPE_META[boqType]?.label === 'Commercial'
                    ? 'BWP / Boiling Waterproof – 710 Grade'
                    : 'BWR / Boiling Water Resistant – IS 303',
                thickness: '18 mm',
                brand: 'Approved make / equivalent',
                dimensions: "8' × 4'",
                unit: 'sheet',
                qty: 0,
                room: 'INTERIOR / JOINERY',
              },
            ],
      )
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [
        { wch: 8 },
        { wch: 16 },
        { wch: 16 },
        { wch: 52 },
        { wch: 12 },
        { wch: 22 },
        { wch: 14 },
        { wch: 10 },
        { wch: 8 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Material Master')
      XLSX.writeFile(
        wb,
        `${(title || 'material-master').replace(/[^\w\- ]+/g, '')}.xlsx`,
      )
    } catch (e) {
      toast(e.message || 'Could not export Excel', { type: 'error' })
    }
  }

  /* ── Image upload ── */
  const uploadImage = (file) => {
    const form = new FormData()
    form.append('file', file)
    return api('/quotations/upload-image', { method: 'POST', body: form })
  }

  /**
   * Chrome stamps the document title into its own print header. Left alone it
   * prints "EPM — Editco Project Management" across a client-facing quotation,
   * so borrow the title for the duration of the print and put it back after.
   */
  const printSheet = () => {
    const previous = document.title
    const name =
      [title?.trim(), project?.clientName?.trim()].filter(Boolean).join(' — ') ||
      'Quotation'
    document.title = name
    const restore = () => {
      document.title = previous
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    // Safari fires afterprint unreliably; make sure the title comes back
    setTimeout(restore, 1000)
  }

  const generateTaxInvoice = useMutation({
    mutationFn: () =>
      api(`/tax-invoices/from-quotation/${quotation._id}`, { method: 'POST' }),
    onSuccess: (res) => {
      toast('Tax invoice created from this BOQ', { type: 'success' })
      navigate(`/billing/tax-invoices?open=${res.invoice._id}`)
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const setDoc = (key, value) => {
    markDirty()
    setDocMeta((prev) => ({ ...prev, [key]: value }))
  }

  /** Client / company logo for the quotation letterhead. */
  const uploadLogo = async (key, file) => {
    if (!file || !file.type?.startsWith('image/')) {
      toast('Pick an image file', { type: 'error' })
      return
    }
    setUploading(true)
    try {
      const res = await uploadImage(file)
      setDoc(key, res.url)
      toast('Logo updated', { type: 'success' })
    } catch (e) {
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const addGalleryImages = async (files) => {
    const images = Array.from(files || []).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (!images.length) {
      toast('Only image files can be attached here', { type: 'error' })
      return
    }
    setUploading(true)
    try {
      const uploaded = []
      for (const file of images) {
        // eslint-disable-next-line no-await-in-loop -- keep upload order stable
        const res = await uploadImage(file)
        uploaded.push({ name: res.name, url: res.url, mime: res.mime })
      }
      markDirty()
      setAttachments((prev) => [...prev, ...uploaded])
      toast(`${uploaded.length} image(s) attached — save to keep them`, {
        type: 'success',
      })
    } catch (e) {
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const setRowImage = async (idx, file) => {
    if (!file?.type?.startsWith('image/')) {
      toast('Pick an image file', { type: 'error' })
      return
    }
    setUploading(true)
    try {
      const res = await uploadImage(file)
      updateItem(idx, 'image', res.url)
    } catch (e) {
      toast(e.message || 'Upload failed', { type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const onDropFiles = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (locked) return
    const files = Array.from(e.dataTransfer?.files || [])
    if (!files.length) return
    const excel = files.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name))
    if (excel) {
      importExcel(excel)
      return
    }
    addGalleryImages(files)
  }

  const cell =
    'w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[12.5px] outline-none transition hover:bg-[#f4f7fb] focus:border-[#b6cef7] focus:bg-surface focus:ring-2 focus:ring-[#3ecf8e]/10 disabled:cursor-not-allowed disabled:opacity-60'

  const filledLines = items.filter(lineHasContent).length

  return (
    <>
      <MaterialCatalogPicker
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        boqType={boqType}
        onAdd={addCatalogRow}
        onLoadTemplate={loadMaterialTemplate}
      />
      <div
        className="relative flex h-full min-h-0 flex-col gap-3.5 overflow-y-auto bg-[#f4f7fb] p-3.5 print:hidden lg:flex-row lg:overflow-visible"
        onDragOver={(e) => {
          e.preventDefault()
          if (!locked) setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return
          setDragOver(false)
        }}
        onDrop={onDropFiles}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#3ecf8e] bg-[#eef4ff]/85 backdrop-blur-[2px]">
            <div className="text-center">
              <Upload className="mx-auto h-7 w-7 text-[#3ecf8e]" />
              <p className="mt-2 text-[14px] font-semibold text-[#24b47e]">
                Drop to add
              </p>
              <p className="text-[12px] text-[#3b6fd4]">
                .xlsx / .csv imports rows · images attach as references
              </p>
            </div>
          </div>
        )}

        {/* Sheet */}
        <div className="flex min-h-[480px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e2eaf5] bg-surface shadow-[0_2px_4px_rgba(16,24,40,0.03),0_16px_40px_-24px_rgba(16,24,40,0.25)] lg:min-h-0">
          {/* ── Command bar: what this is, what it's worth, how to save it ── */}
          <header className="flex shrink-0 items-center gap-3 border-b border-[#edf1f7] px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={title}
                  disabled={locked}
                  onChange={(e) => {
                    markDirty()
                    setTitle(e.target.value)
                  }}
                  className="h-7 min-w-[120px] max-w-full flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-[16px] font-semibold leading-tight tracking-[-0.022em] text-[#0b1220] outline-none transition hover:bg-[#f4f7fb] focus:border-[#b6cef7] focus:bg-surface placeholder:text-[#b4c0d0] disabled:opacity-70"
                  placeholder="Sheet title"
                />
                <span
                  className={cn(
                    'inline-flex h-[19px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] ring-1 ring-inset',
                    statusMeta.pill,
                  )}
                >
                  <span className={cn('h-1 w-1 rounded-full', statusMeta.dot)} />
                  {statusMeta.label}
                </span>
                {dirty && !locked && (
                  <span
                    title="Unsaved changes"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                )}
              </div>
              <p className="truncate px-1.5 text-[11px] leading-tight text-[#9aa7ba]">
                {BOQ_TYPE_META[boqType]?.label || 'Standard'}
                {project?.name ? ` · ${project.name}` : ''}
                {project?.clientName ? ` · ${project.clientName}` : ''}
              </p>
            </div>

            {/* Actions stay on one horizontal row so History never stacks under ··· */}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenHistory?.()}
                title="All BOQ versions for this project"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-2.5 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb] hover:text-[#0b1220]"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">History</span>
                <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-[#64748b]">
                  {projectQuotes.length || 0}
                </span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More actions"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e4eaf3] bg-surface text-[#5b6b80] transition hover:border-[#c7dbfb] hover:text-[#0b1220]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setMenuOpen(false)}
                      role="presentation"
                    />
                    <div className="absolute right-0 top-9 z-30 w-60 overflow-hidden rounded-xl border border-[#e1e8f1] bg-surface py-1 shadow-[0_20px_50px_-20px_rgba(11,18,32,0.35)]">
                      {[
                        {
                          label: importing ? 'Reading…' : 'Import Excel / CSV',
                          icon: Upload,
                          disabled: locked || importing,
                          run: () => excelInputRef.current?.click(),
                        },
                        {
                          label: 'Download Excel template',
                          icon: FileSpreadsheet,
                          run: exportTemplate,
                        },
                        interiorMode && {
                          label: 'Reload Cubic template',
                          icon: Layers,
                          disabled: locked,
                          run: () => loadInteriorCatalog(),
                        },
                        materialMode && {
                          label: 'Material catalog',
                          icon: Layers,
                          disabled: locked,
                          run: () => setCatalogOpen(true),
                        },
                        { label: 'Print / PDF', icon: Printer, run: printSheet },
                        status === 'approved' &&
                          quotation?._id && {
                            label: 'Generate tax invoice',
                            icon: FileText,
                            run: () => generateTaxInvoice.mutate(),
                          },
                        {
                          label: 'Version history',
                          icon: History,
                          run: () => onOpenHistory?.(),
                        },
                        onCancelDraft && {
                          label: 'Discard draft',
                          icon: X,
                          danger: true,
                          run: onCancelDraft,
                        },
                      ]
                        .filter(Boolean)
                        .map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            disabled={a.disabled}
                            onClick={() => {
                              setMenuOpen(false)
                              a.run()
                            }}
                            className={cn(
                              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium transition disabled:opacity-40',
                              a.danger
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-[#0b1220] hover:bg-[#f4f7fb]',
                            )}
                          >
                            <a.icon className="h-3.5 w-3.5 shrink-0 text-[#9aa7ba]" />
                            {a.label}
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                importExcel(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </header>

          {locked ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 sm:px-4">
              <span className="font-semibold">Viewing locked version</span>
              <span className="text-amber-800/80">
                Approved sheets stay read-only. Open History to switch, or Unlock
                to revise.
              </span>
              <button
                type="button"
                onClick={() => onOpenHistory?.()}
                className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                <History className="h-3 w-3" />
                Switch version
              </button>
            </div>
          ) : null}

          {/* ── Steps: quantities → pricing → document, plus this step's tools ── */}
          <nav className="flex shrink-0 items-center gap-2 border-b border-[#edf1f7] bg-[#fafcfe] px-3 py-1.5 print:hidden sm:px-4">
            <div className="flex items-center gap-0.5 rounded-xl bg-[#eef2f7] p-0.5">
              {steps.map((s, i) => {
                const active = tab === s.key
                return (
                  <Fragment key={s.key}>
                    {i ? (
                      <ChevronRight className="h-3 w-3 shrink-0 text-[#c3cbd6]" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setTab(s.key)}
                      title={s.hint}
                      className={cn(
                        'rounded-[9px] px-2.5 py-1 text-[12.5px] font-semibold transition',
                        active
                          ? 'bg-surface text-[#0b1220] shadow-[0_1px_2px_rgba(16,24,40,0.12)]'
                          : 'text-[#7c8ba0] hover:text-[#0b1220]',
                      )}
                    >
                      {s.label}
                    </button>
                  </Fragment>
                )
              })}
            </div>

            {/* only the tools this step needs */}
            <div className="ml-auto flex items-center gap-1.5">
              {tab === 'boq' && (
                <>
                  {interiorMode && (
                    <select
                      value={boqType}
                      disabled={locked}
                      onChange={(e) => changeBoqType(e.target.value)}
                      title="Property type — switching reloads the template"
                      className="h-8 cursor-pointer rounded-lg border border-[#e4eaf3] bg-surface px-2 text-[12px] font-semibold text-[#5b6b80] outline-none transition hover:border-[#c7dbfb] disabled:opacity-60"
                    >
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                    </select>
                  )}
                  {!locked && (
                    <>
                      <button
                        type="button"
                        onClick={() => addLine()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-2.5 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb] hover:text-[#0b1220]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Row
                      </button>
                      <button
                        type="button"
                        onClick={() => addCategory()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-2.5 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb] hover:text-[#0b1220]"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Category
                      </button>
                    </>
                  )}
                </>
              )}

              {tab === 'quote' && (
                <>
                  <button
                    type="button"
                    onClick={() => setHeaderOpen((v) => !v)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition',
                      headerOpen
                        ? 'border-[#0b1220] bg-[#0b1220] text-[#f8fafc]'
                        : 'border-[#e4eaf3] bg-surface text-[#5b6b80] hover:border-[#c7dbfb]',
                    )}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Letterhead
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullQuote(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-2.5 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb]"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Full view
                  </button>
                  {/* the right rail is hidden on this step, so saving and
                      approving belong here */}
                  {!locked && (
                    <button
                      type="button"
                      disabled={save.isPending}
                      onClick={() => save.mutate(payload())}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition disabled:opacity-50',
                        dirty
                          ? 'bg-[#0b1220] text-[#f8fafc] hover:bg-[#1f2937]'
                          : 'border border-[#e4eaf3] bg-surface text-[#5b6b80] hover:border-[#c7dbfb]',
                      )}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                    </button>
                  )}
                  {status !== 'approved' && (
                    <button
                      type="button"
                      disabled={save.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Approve this BOQ?\n\nProject budget will be set to ${formatInr(grand)}.`,
                          )
                        )
                          return
                        save.mutate(payload({ status: 'approved' }))
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#3ecf8e] px-3 text-[12px] font-semibold text-white transition hover:bg-[#24b47e] disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                  {status === 'approved' && (
                    <button
                      type="button"
                      disabled={unlock.isPending || !quotation?._id}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Unlock this approved BOQ?\n\nA locked copy stays in History. This sheet reopens as a draft you can edit.',
                          )
                        )
                          return
                        unlock.mutate()
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-3 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb] hover:text-[#0b1220] disabled:opacity-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      {unlock.isPending ? 'Unlocking…' : 'Unlock'}
                    </button>
                  )}
                </>
              )}
            </div>
          </nav>
          {measureMode && tab === 'measure' ? (
            <div className="min-h-0 flex-1 overflow-hidden print:hidden">
              <MeasurementSheet
                measurements={measurements}
                spaces={measureCatalog?.spaces || []}
                selectedSpaces={spaces}
                locked={locked}
                onChange={updateMeasurement}
                onPickSpaces={pickSpaces}
                onPushToBoq={applyMeasurementsToBoq}
              />
            </div>
          ) : null}

          {/* Table */}
          <div
            className={cn(
              'min-h-0 flex-1 overflow-auto',
              tab !== 'boq' && 'hidden',
            )}
            ref={tableRef}
          >
            <input
              ref={rowImageInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file && rowImageTarget.current != null) {
                  setRowImage(rowImageTarget.current, file)
                }
                rowImageTarget.current = null
                e.target.value = ''
              }}
            />
            {materialMode ? (
              <div className="border-b border-[#e4eaf3] bg-white px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#64748b]">
                  {BOQ_TYPE_META[boqType]?.label} &amp;{' '}
                  {boqType === 'residential' ? 'commercial' : 'residential'} material master
                </p>
                <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#0b1220]">
                  Clarity edition — complete interior hardware included
                </h3>
                <p className="mt-1.5 max-w-3xl text-[11.5px] leading-relaxed text-[#8a98ac]">
                  Qty = 0 intentionally: enter project-specific quantity after
                  BOQ / drawing take-off. Brands are reference makes and must be
                  checked against the project&apos;s approved make list. Import
                  the same 9 columns (or data rows only) — Family, Name, Grade,
                  Thickness, Brand, Size, Unit, Qty.
                </p>
              </div>
            ) : null}
            <table
              className={cn(
                'w-full border-separate border-spacing-0 text-[13px]',
                interiorMode
                  ? 'min-w-[1280px]'
                  : materialMode
                    ? 'min-w-[1360px] table-fixed'
                    : 'min-w-[1040px]',
              )}
            >
              <thead className="sticky top-0 z-10">
                <tr
                  className={cn(
                    '[&>th]:border-b [&>th]:px-2 [&>th]:text-left [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.06em]',
                    interiorMode
                      ? '[&>th]:h-10 [&>th]:border-[#eadfce] [&>th]:bg-[#c47a62] [&>th]:text-white'
                      : materialMode
                        ? '[&>th]:h-10 [&>th]:border-[var(--border-subtle)] [&>th]:bg-[var(--bg-surface-raised)] [&>th]:text-[var(--text-secondary)]'
                        : '[&>th]:h-9 [&>th]:border-[var(--border-subtle)] [&>th]:bg-[var(--bg-surface)]/85 [&>th]:backdrop-blur-md [&>th]:text-[var(--text-secondary)]',
                  )}
                >
                  <th className="w-10">Sl.</th>
                  {interiorMode ? (
                    <>
                      <th>Description of item</th>
                      <th className="w-[90px]">Category</th>
                      <th className="w-[64px] text-right">No</th>
                      <th className="w-[64px] text-right">Width</th>
                      <th className="w-[64px] text-right">Height</th>
                    </>
                  ) : (
                    <>
                      {!materialMode ? (
                        <th className="w-[76px]">Location</th>
                      ) : null}
                      {materialMode ? (
                        <>
                          <th className="w-[108px]">Material Family</th>
                          <th className="w-[108px]">Material Name</th>
                          <th className="w-[280px]">Grade / Specification</th>
                          <th className="w-[84px]">Thickness</th>
                          <th className="w-[140px]">Brand / Make</th>
                          <th className="w-[100px]">Size / Dimensions</th>
                        </>
                      ) : (
                        <th>Description</th>
                      )}
                    </>
                  )}
                  <th className="w-[56px]">Image</th>
                  <th className="w-[140px]">Remarks</th>
                  <th className="w-[84px]">Unit</th>
                  <th className="w-[72px] text-right">Qty</th>
                  <th className="w-[100px] text-right">Rate</th>
                  <th className="w-[112px] text-right">Amount</th>
                  <th className="w-[56px]" />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={`${g.room}-${g.startIdx}`}>
                    <tr>
                      <td
                        colSpan={interiorMode ? 13 : materialMode ? 14 : 10}
                        className={cn(
                          'sticky top-[40px] z-[5] border-b px-3 py-2',
                          interiorMode
                            ? 'border-[#eadfce] bg-[#efe6d8]'
                            : 'border-[#d7dee8] bg-[#f3f5f8]',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-3.5 w-[3px] rounded-full bg-[#3ecf8e]" />
                          <input
                            list="boq-rooms"
                            data-room={g.startIdx}
                            disabled={locked}
                            title={items[g.startIdx]?.room || ''}
                            value={items[g.startIdx]?.room || ''}
                            onChange={(e) => {
                              const value = e.target.value
                              if (locked) return
                              markDirty()
                              setItems((prev) =>
                                prev.map((it, i) =>
                                  i >= g.startIdx && i <= g.endIdx
                                    ? { ...it, room: value }
                                    : it,
                                ),
                              )
                            }}
                            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#1e3a8a] outline-none transition hover:bg-surface focus:border-[#b6cef7] focus:bg-surface disabled:opacity-70"
                          />
                          <span className="shrink-0 rounded-full bg-surface px-2 py-[2px] text-[10px] font-semibold tabular-nums text-[#8a98ac] ring-1 ring-inset ring-[#e4eaf3]">
                            {g.endIdx - g.startIdx + 1}{' '}
                            {g.endIdx - g.startIdx === 0 ? 'row' : 'rows'}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold tabular-nums text-primary">
                            {formatInr(g.total)}
                          </span>
                          {!locked && (
                            <span className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                title={`Add a line to ${g.room}`}
                                onClick={() => addLine(g.endIdx, g.room)}
                                className="rounded-md p-1 text-[#9aa7ba] transition hover:bg-surface hover:text-[#3ecf8e]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Add a new category below"
                                onClick={() => addCategory(g.endIdx)}
                                className="rounded-md p-1 text-[#9aa7ba] transition hover:bg-surface hover:text-[#3ecf8e]"
                              >
                                <Layers className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {items.slice(g.startIdx, g.endIdx + 1).map((it, i) => {
                      const idx = g.startIdx + i
                      return (
                        <tr
                          key={it._key}
                          data-row={idx}
                          className="group/row align-top transition-colors [&>td]:border-b [&>td]:border-[var(--border-subtle)] [&>td]:align-top hover:[&>td]:bg-[var(--bg-surface-raised)]"
                        >
                          <td className="px-2 py-2 text-[11px] tabular-nums text-[#94a3b8]">
                            {idx + 1}
                          </td>
                          {interiorMode ? (
                            <>
                              <td className="px-1 py-1.5">
                                <textarea
                                  data-field="description"
                                  disabled={locked}
                                  rows={3}
                                  value={it.description || ''}
                                  placeholder="Description of item"
                                  onChange={(e) =>
                                    updateItem(idx, 'description', e.target.value)
                                  }
                                  className={cn(
                                    cell,
                                    'min-h-[64px] resize-none whitespace-pre-wrap leading-snug font-medium text-[#0b1220]',
                                  )}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  disabled={locked}
                                  value={it.category || ''}
                                  placeholder="Category"
                                  onChange={(e) =>
                                    updateItem(idx, 'category', e.target.value)
                                  }
                                  className={cn(cell, 'text-[#334155]')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  disabled={locked}
                                  value={it.measureNo}
                                  onChange={(e) =>
                                    updateItem(idx, 'measureNo', e.target.value)
                                  }
                                  className={cn(cell, 'text-right tabular-nums')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  disabled={locked}
                                  value={it.width}
                                  onChange={(e) =>
                                    updateItem(idx, 'width', e.target.value)
                                  }
                                  className={cn(cell, 'text-right tabular-nums')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  disabled={locked}
                                  value={it.height}
                                  onChange={(e) =>
                                    updateItem(idx, 'height', e.target.value)
                                  }
                                  className={cn(cell, 'text-right tabular-nums')}
                                />
                              </td>
                            </>
                          ) : materialMode ? (
                            <>
                              <td className="px-1 py-1.5">
                                <input
                                  disabled={locked}
                                  value={it.materialFamily || ''}
                                  placeholder="Plywood"
                                  onChange={(e) =>
                                    updateItem(idx, 'materialFamily', e.target.value)
                                  }
                                  className={cn(cell, 'text-[#334155]')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  data-field="materialName"
                                  disabled={locked}
                                  value={it.materialName || ''}
                                  placeholder="Plywood"
                                  onChange={(e) =>
                                    updateItem(idx, 'materialName', e.target.value)
                                  }
                                  className={cn(cell, 'font-medium text-[#0b1220]')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <textarea
                                  disabled={locked}
                                  rows={3}
                                  value={it.grade || ''}
                                  placeholder="Grade / specification"
                                  onChange={(e) =>
                                    updateItem(idx, 'grade', e.target.value)
                                  }
                                  className={cn(
                                    cell,
                                    'min-h-[72px] resize-none whitespace-pre-wrap leading-snug text-[#334155]',
                                  )}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  disabled={locked}
                                  value={it.thickness || ''}
                                  placeholder="18 mm"
                                  onChange={(e) =>
                                    updateItem(idx, 'thickness', e.target.value)
                                  }
                                  className={cn(cell, 'text-[#334155]')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  disabled={locked}
                                  value={it.brand || ''}
                                  placeholder="Approved make / equivalent"
                                  onChange={(e) =>
                                    updateItem(idx, 'brand', e.target.value)
                                  }
                                  className={cn(cell, 'font-medium text-[#0b1220]')}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  disabled={locked}
                                  value={it.dimensions || ''}
                                  placeholder={"8' × 4'"}
                                  onChange={(e) =>
                                    updateItem(idx, 'dimensions', e.target.value)
                                  }
                                  className={cn(cell, 'text-[#334155]')}
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-1.5 py-1.5">
                                <input
                                  disabled={locked}
                                  value={it.room || ''}
                                  placeholder="Room"
                                  onChange={(e) =>
                                    updateItem(idx, 'room', e.target.value)
                                  }
                                  className={cn(cell, 'text-[#334155]')}
                                />
                              </td>
                              <td className="px-1.5 py-1.5">
                                <input
                                  data-field="description"
                                  disabled={locked}
                                  value={it.description || ''}
                                  placeholder="Work / item description"
                                  onChange={(e) =>
                                    updateItem(idx, 'description', e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      addLine(idx)
                                    }
                                  }}
                                  className={cn(
                                    cell,
                                    'font-medium text-[#0b1220] placeholder:font-normal placeholder:text-[#c3ccd9]',
                                  )}
                                />
                              </td>
                            </>
                          )}
                          <td className="px-1.5 py-2">
                            {it.image ? (
                              <div className="relative h-9 w-9">
                                <img
                                  src={assetUrl(it.image)}
                                  alt=""
                                  onClick={() => setPreview(assetUrl(it.image))}
                                  className="h-9 w-9 cursor-zoom-in rounded-lg object-cover ring-1 ring-[#e4eaf3] transition hover:ring-[#b6cef7]"
                                />
                                {!locked && (
                                  <button
                                    type="button"
                                    title="Remove image"
                                    onClick={() => updateItem(idx, 'image', '')}
                                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-[#171717] text-white shadow-sm group-hover/row:flex"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                title="Attach a reference image to this line"
                                disabled={locked || uploading}
                                onClick={() => {
                                  rowImageTarget.current = idx
                                  rowImageInputRef.current?.click()
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-[#dde5ef] text-[#c3ccd9] transition hover:border-[#b6cef7] hover:bg-[#f5f9ff] hover:text-[#3ecf8e] disabled:opacity-40"
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                          <td className="px-1 py-1.5">
                            <textarea
                              disabled={locked}
                              rows={2}
                              value={it.remarks || ''}
                              placeholder="Remarks"
                              onChange={(e) =>
                                updateItem(idx, 'remarks', e.target.value)
                              }
                              className={cn(
                                cell,
                                'min-h-[44px] resize-none whitespace-pre-wrap leading-snug text-[#475569]',
                              )}
                            />
                          </td>
                          <td className="px-1 py-1.5">
                            <select
                              disabled={locked}
                              value={
                                UNIT_VALUES.includes(it.unit)
                                  ? it.unit
                                  : interiorMode
                                    ? 'sft'
                                    : materialMode
                                      ? 'sheet'
                                      : 'nos'
                              }
                              onChange={(e) =>
                                updateItem(idx, 'unit', e.target.value)
                              }
                              className={cn(cell, 'text-secondary')}
                            >
                              {UNITS.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1 py-1.5">
                            {interiorMode ? (
                              <div className={cn(cell, 'text-right tabular-nums text-primary')}>
                                {lineQty(it)}
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={locked}
                                value={it.qty}
                                onChange={(e) =>
                                  updateItem(idx, 'qty', e.target.value)
                                }
                                className={cn(cell, 'text-right tabular-nums text-primary')}
                              />
                            )}
                          </td>
                          <td className="px-1 py-1.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled={locked}
                              value={it.rate}
                              onChange={(e) =>
                                updateItem(idx, 'rate', e.target.value)
                              }
                              className={cn(cell, 'text-right tabular-nums text-primary')}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-[12.5px] font-semibold tabular-nums text-[#0b1220]">
                            {formatInr(lineAmount(it))}
                          </td>
                          <td className="px-1 py-1.5">
                            <div className="flex justify-end gap-0.5 opacity-0 transition group-hover/row:opacity-100">
                              <button
                                type="button"
                                title="Duplicate line"
                                disabled={locked}
                                onClick={() => duplicateLine(idx)}
                                className="rounded-md p-1.5 text-[#9aa7ba] transition hover:bg-surface-raised hover:text-primary disabled:opacity-30"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Delete line"
                                disabled={locked}
                                onClick={() => removeLine(idx)}
                                className="rounded-md p-1.5 text-[#9aa7ba] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <datalist id="boq-rooms">
              {roomSuggestions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>

            {!locked && (
              <div className="flex flex-wrap items-center gap-1 px-4 py-3">
                <button
                  type="button"
                  onClick={() => addLine()}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px] font-semibold text-[#3ecf8e] transition hover:bg-[#f7faff]"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#eef4ff]">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  Add row
                </button>
                <button
                  type="button"
                  onClick={() => addCategory()}
                  title="Start a new category band at the end of the sheet"
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px] font-semibold text-[#3ecf8e] transition hover:bg-[#f7faff]"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#eef4ff]">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  Add category
                </button>
                <span className="text-[12.5px] font-normal text-[#b4c0d0]">
                  · import Excel/CSV with the same columns (headers optional)
                </span>
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="flex shrink-0 items-center gap-4 border-t border-[#edf1f7] bg-[#fafcfe] px-4 py-2 text-[11px] text-[#8a98ac] sm:px-5">
            <span>
              <span className="font-semibold tabular-nums text-secondary">
                {filledLines}
              </span>{' '}
              of {items.length} lines filled
            </span>
            <span className="hidden sm:inline">
              <span className="font-semibold tabular-nums text-secondary">
                {byRoom.length}
              </span>{' '}
              {byRoom.length === 1 ? 'section' : 'sections'}
            </span>
            {/* the subtotal is already broken down in the right rail */}
          </div>

        {quoteView && interiorMode ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#ebe4d8] p-3 print:hidden sm:p-4">
            <CubicQuoteDocument
              title={title}
              project={project}
              tenant={tenant}
              boqType={boqType}
              items={items}
              template={template}
              gst={gst}
              chargesPercent={chargesPercent}
              chargesLabel={chargesLabel}
              discount={discount}
              status={status}
              docMeta={docMetaResolved}
            />
          </div>
        ) : null}
        </div>

        {/* Right panel */}
        <aside
          className={cn(
            'flex w-full shrink-0 flex-col gap-3 overflow-y-auto lg:w-[324px] [&>section]:shrink-0',
            quoteView && interiorMode && 'hidden',
          )}
        >
          {/* Totals */}
          <section
            className={cn(CARD, 'overflow-hidden p-4')}
            style={{
              backgroundImage:
                'radial-gradient(360px 140px at 100% 0%, rgba(37,99,235,0.07), transparent 70%)',
            }}
          >
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#9aa7ba]">
              Grand total
            </p>
            <p className="mt-1 text-[28px] font-semibold tabular-nums leading-none tracking-[-0.03em] text-[#0b1220]">
              {formatInr(grand)}
            </p>

            <div className="mt-4 space-y-2.5 border-t border-border pt-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-[#8a98ac]">Subtotal</span>
                <span className="font-semibold tabular-nums text-primary">
                  {formatInr(subtotal)}
                </span>
              </div>
              {interiorMode && (
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-[#8a98ac]"
                    title={chargesLabel || 'Design & handling charges'}
                  >
                    {chargesLabel
                      ? chargesLabel.replace(/\s*[\d.]+\s*%\s*$/, '')
                      : 'Design & handling'}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        disabled={locked}
                        value={chargesPercent}
                        onChange={(e) => {
                          markDirty()
                          setChargesPercent(Number(e.target.value))
                        }}
                        className="h-7 w-16 rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] pl-2 pr-5 text-right text-[12px] tabular-nums text-primary outline-none transition focus:border-[#b6cef7] focus:bg-surface focus:ring-2 focus:ring-[#3ecf8e]/10 disabled:opacity-50"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-[#9aa7ba]">
                        %
                      </span>
                    </div>
                    <span className="w-[84px] text-right font-semibold tabular-nums text-primary">
                      {formatInr(chargesAmount)}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#8a98ac]">GST</span>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      disabled={locked}
                      value={gst}
                      onChange={(e) => {
                        markDirty()
                        setGst(Number(e.target.value))
                      }}
                      className="h-7 w-16 rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] pl-2 pr-5 text-right text-[12px] tabular-nums text-primary outline-none transition focus:border-[#b6cef7] focus:bg-surface focus:ring-2 focus:ring-[#3ecf8e]/10 disabled:opacity-50"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-[#9aa7ba]">
                      %
                    </span>
                  </div>
                  <span className="w-[84px] text-right font-semibold tabular-nums text-primary">
                    {formatInr(gstAmount)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#8a98ac]">Discount</span>
                <input
                  type="number"
                  min="0"
                  disabled={locked}
                  value={discount}
                  onChange={(e) => {
                    markDirty()
                    setDiscount(Number(e.target.value))
                  }}
                  className="h-7 w-[124px] rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] px-2 text-right text-[12px] tabular-nums text-primary outline-none transition focus:border-[#b6cef7] focus:bg-surface focus:ring-2 focus:ring-[#3ecf8e]/10 disabled:opacity-50"
                />
              </div>
            </div>

            {!locked && (
              <>
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() => save.mutate(payload())}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#3ecf8e] text-[13px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(37,99,235,0.9)] transition hover:bg-[#24b47e] disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {save.isPending
                    ? 'Saving…'
                    : quotation
                      ? 'Save changes'
                      : 'Create BOQ'}
                </button>
                <p className="mt-1.5 text-center text-[10px] text-[#b4c0d0]">
                  Ctrl / ⌘ + S to save
                </p>
              </>
            )}
          </section>

          {/* Workflow */}
          {quotation && (
            <section className={cn(CARD, 'p-3.5')}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9aa7ba]">
                Workflow
              </h3>
              <div className="mt-2.5 space-y-1">
                <Step
                  index={1}
                  label="Draft"
                  hint="Build the sheet"
                  state={status === 'draft' ? 'current' : 'done'}
                />
                <Step
                  index={2}
                  label="Sent to client"
                  hint="Shared for approval"
                  state={
                    status === 'sent'
                      ? 'current'
                      : status === 'approved'
                        ? 'done'
                        : 'todo'
                  }
                />
                <Step
                  index={3}
                  label="Approved"
                  hint="Locks & sets budget"
                  state={status === 'approved' ? 'current' : 'todo'}
                  last
                />
              </div>

              <div className="mt-3 space-y-1.5">
                {status === 'draft' && (
                  <button
                    type="button"
                    disabled={save.isPending}
                    onClick={() => {
                      if (dirty) {
                        toast('Save the sheet first, then mark sent', {
                          type: 'info',
                        })
                        return
                      }
                      save.mutate(payload({ status: 'sent' }))
                    }}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#d7e5fc] bg-[#eef4ff] text-[12.5px] font-semibold text-[#24b47e] transition hover:bg-[#e0ebff] disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Mark sent to client
                  </button>
                )}

                {(status === 'draft' || status === 'sent') && (
                  <button
                    type="button"
                    disabled={save.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Approve this BOQ?\n\nProject budget will be set to ${formatInr(grand)} and the sheet will lock.`,
                        )
                      )
                        return
                      save.mutate(payload({ status: 'approved' }))
                      setTab('quote')
                    }}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-[12.5px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(5,150,105,0.8)] transition hover:bg-emerald-700 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve &amp; set budget
                  </button>
                )}

                {locked && (
                  <button
                    type="button"
                    disabled={unlock.isPending || !quotation?._id}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Unlock this approved BOQ?\n\nA locked copy stays in History. This sheet reopens as a draft you can edit.',
                        )
                      )
                        return
                      unlock.mutate()
                    }}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#e4eaf3] bg-surface text-[12px] font-semibold text-secondary transition hover:bg-[#f4f7fb]"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    {unlock.isPending ? 'Unlocking…' : 'Unlock to edit'}
                  </button>
                )}

                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete "${quotation.title}"? This cannot be undone.`,
                      )
                    )
                      remove.mutate()
                  }}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#f3d7d7] bg-surface text-[12px] font-semibold text-[#dc2626] transition hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete sheet
                </button>
              </div>
            </section>
          )}

          {/* Reference images */}
          <section className={cn(CARD, 'p-3.5')}>
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9aa7ba]">
                Reference images
              </h3>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addGalleryImages(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={locked || uploading}
                onClick={() => galleryInputRef.current?.click()}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#e4eaf3] bg-surface px-2 text-[11px] font-semibold text-secondary transition hover:border-[#c7dbfb] hover:text-[#24b47e] disabled:opacity-40"
              >
                <Upload className="h-3 w-3" />
                {uploading ? 'Uploading…' : 'Add'}
              </button>
            </div>

            {attachments.length === 0 ? (
              <p className="mt-2.5 rounded-xl border border-dashed border-[#dde5ef] bg-[#fafcfe] px-3 py-5 text-center text-[11.5px] leading-relaxed text-[#9aa7ba]">
                Drop images anywhere on the sheet
                <br />
                or click Add
              </p>
            ) : (
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {attachments.map((a, i) => (
                  <div key={a.url + i} className="group relative">
                    <img
                      src={assetUrl(a.url)}
                      alt={a.name || ''}
                      onClick={() => setPreview(assetUrl(a.url))}
                      className="aspect-square w-full cursor-zoom-in rounded-xl object-cover ring-1 ring-[#e4eaf3] transition hover:ring-[#b6cef7]"
                    />
                    {!locked && (
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => {
                          markDirty()
                          setAttachments((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }}
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-[#171717] text-white shadow-sm group-hover:flex"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Room breakdown */}
          {byRoom.length > 0 && subtotal > 0 && (
            <section className={cn(CARD, 'p-3.5')}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9aa7ba]">
                Cost by room
              </h3>
              <div className="mt-2.5 space-y-2.5">
                {byRoom.map(([room, amount]) => {
                  const pct = Math.round((amount / subtotal) * 100)
                  return (
                    <div key={room}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12px] font-medium text-primary">
                          {room}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#0b1220]">
                          {formatInr(amount)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full rounded-full bg-[#3ecf8e]/70 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-[#9aa7ba]">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </aside>
      </div>

      {preview && (
        <div
          role="presentation"
          onClick={() => setPreview(null)}
          className="on-dark fixed inset-0 z-[80] flex items-center justify-center bg-[#171717]/80 p-8 backdrop-blur-sm print:hidden"
        >
          <img
            src={preview}
            alt=""
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
          <button
            type="button"
            className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {headerOpen && interiorMode && (
        <QuoteHeaderEditor
          docMeta={docMeta}
          setDoc={setDoc}
          onUploadLogo={uploadLogo}
          uploading={uploading}
          locked={locked}
          project={project}
          tenant={tenant}
          measured={boqType !== 'commercial'}
          onClose={() => setHeaderOpen(false)}
        />
      )}

      {/* Full-bleed reader for the whole quotation — the docked panel only gets
          about half the width, which is too tight for a 9-column sheet. */}
      {fullQuote && interiorMode && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-[#1c1917]/60 backdrop-blur-sm print:hidden">
          <header className="flex shrink-0 items-center gap-3 border-b border-[#cfc2b0] bg-[#faf6f0] px-4 py-2.5 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-[#1c1917]">
                {title || 'Quotation'}
              </p>
              <p className="mt-0.5 truncate text-[11px] leading-tight text-[#8a7d70]">
                {BOQ_TYPE_META[boqType]?.label || 'Interior'} ·{' '}
                {project?.name || 'Project'} · {items.length} lines ·{' '}
                <span className="font-semibold tabular-nums text-[#1c1917]">
                  {formatInr(grand)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHeaderOpen((v) => !v)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition',
                headerOpen
                  ? 'border-[#1c1917] bg-[#1c1917] text-[#f4efe6]'
                  : 'border-[#cfc2b0] bg-white text-[#1c1917] hover:bg-[#f2ece2]',
              )}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Letterhead</span>
            </button>
            <button
              type="button"
              onClick={printSheet}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#cfc2b0] bg-white px-3 text-[12px] font-semibold text-[#1c1917] transition hover:bg-[#f2ece2]"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setFullQuote(false)}
              aria-label="Close quotation viewer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1c1917] text-[#f4efe6] transition hover:bg-[#3d352e]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#ebe4d8] px-3 py-5 sm:px-6 sm:py-8">
            <CubicQuoteDocument
              title={title}
              project={project}
              tenant={tenant}
              boqType={boqType}
              items={items}
              template={template}
              gst={gst}
              chargesPercent={chargesPercent}
              chargesLabel={chargesLabel}
              discount={discount}
              status={status}
              docMeta={docMetaResolved}
            />
          </div>
        </div>
      )}

      {/* Interior sheets print as the Cubic quotation; everything else keeps the
          generic BOQ print layout. Exactly one of the two reaches paper. */}
      {interiorMode ? (
        <div className="hidden print:block">
          <CubicQuoteDocument
            title={title}
            project={project}
            tenant={tenant}
            boqType={boqType}
            items={items}
            template={template}
            gst={gst}
            chargesPercent={chargesPercent}
            chargesLabel={chargesLabel}
            discount={discount}
            status={status}
            docMeta={docMetaResolved}
          />
        </div>
      ) : (
        <BoqPrintView
          title={title}
          versionLabel={versionLabel}
          project={project}
          status={status}
          items={items}
          attachments={attachments}
          subtotal={subtotal}
          gst={gst}
          gstAmount={gstAmount}
          discount={discount}
          grand={grand}
          byRoom={byRoom}
          materialMode={materialMode}
          boqType={boqType}
        />
      )}
    </>
  )
}

/** Editable letterhead: client logo + the details printed above the table. */
function QuoteHeaderEditor({
  docMeta,
  setDoc,
  onUploadLogo,
  uploading,
  locked,
  project,
  tenant,
  measured,
  onClose,
}) {
  const logoInput = useRef(null)

  const Text = ({ label, k, placeholder, wide }) => (
    <label className={cn('block', wide && 'sm:col-span-2')}>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#a3988b]">
        {label}
      </span>
      <input
        disabled={locked}
        value={docMeta[k] || ''}
        onChange={(e) => setDoc(k, e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 h-8 w-full rounded-lg border border-[#e0d6c9] bg-[#fffffe] px-2 text-[12px] text-[#1c1918] outline-none transition focus:border-[#c47a62] disabled:opacity-60"
      />
    </label>
  )

  const LogoRow = ({ label, k, inputRef, fallback }) => (
    <div className="flex items-center gap-3 rounded-xl border border-[#e0d6c9] bg-[#fffffe] p-2.5">
      <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#faf6f1] ring-1 ring-inset ring-[#efe6d9]">
        {docMeta[k] ? (
          <img
            src={assetUrl(docMeta[k])}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="px-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-[#b8ab9d]">
            {fallback}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-semibold text-[#1c1918]">{label}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={locked || uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#cfc2b1] bg-[#fffffe] px-2.5 text-[11px] font-semibold text-[#1c1918] transition hover:bg-[#faf6f1] disabled:opacity-50"
          >
            <Upload className="h-3 w-3" />
            {uploading ? 'Uploading…' : docMeta[k] ? 'Replace' : 'Upload'}
          </button>
          {docMeta[k] ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => setDoc(k, '')}
              className="inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-semibold text-[#b0705d] transition hover:bg-[#f7ece8] disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onUploadLogo(k, f)
          }}
        />
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-[#1c1918]/55 p-4 backdrop-blur-sm print:hidden sm:p-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Letterhead"
        className="my-auto w-full max-w-[640px] rounded-2xl border border-[#e0d6c9] bg-[#faf6f1] p-4 shadow-[0_30px_70px_-25px_rgba(28,25,23,0.6)] sm:p-5"
      >
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1c1918]">Letterhead</p>
          <p className="text-[11.5px] text-[#a3988b]">
            Printed above the table on page 1
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-[#a3988b] transition hover:bg-[#fffffe] hover:text-[#1c1918]"
          aria-label="Close letterhead editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-[#e0d6c9] bg-[#fffffe] p-2.5">
          <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#faf6f1] ring-1 ring-inset ring-[#efe6d9]">
            {tenant?.logoUrl ? (
              <img
                src={assetUrl(tenant.logoUrl)}
                alt="Company logo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="px-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-[#b8ab9d]">
                No logo
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold text-[#1c1918]">
              Company logo
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-[#a3988b]">
              From Platform Admin — prints on every quotation. Name text is not
              shown next to it.
            </p>
          </div>
        </div>
        <LogoRow
          label="Client logo"
          k="clientLogo"
          inputRef={logoInput}
          fallback="Client logo"
        />
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <Text label="Customer" k="customerName" placeholder={project?.clientName || 'Client name'} />
        <Text label="Quote no." k="quoteNo" placeholder="C2604-110" />
        <Text
          label="Client address"
          k="clientAddress"
          placeholder={project?.location || 'Site address'}
          wide
        />
        <Text label="Date" k="quoteDate" placeholder="30-04-2026" />
        <Text
          label="Company address"
          k="companyAddress"
          placeholder={tenant?.address || 'Registered address'}
        />
        <Text label="Company phone" k="companyPhone" placeholder="040-40047888" />
        {measured ? (
          <>
            <Text label="Architect" k="architect" placeholder="Mr. Rajiv" />
            <Text label="Email id" k="emailId" placeholder="name@cubicassociates.com" />
            <Text label="Contact no." k="contactNo" placeholder="+91 99085 50665" />
          </>
        ) : null}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg bg-[#1c1918] px-4 text-[12.5px] font-semibold text-[#f4efe6] transition hover:bg-black"
        >
          Done
        </button>
      </div>
      </section>
    </div>
  )
}

function ToolButton({ children, label, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg py-1.5 text-secondary transition hover:bg-[#f4f7fb] hover:text-[#0b1220] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Step({ index, label, hint, state, last }) {
  return (
    <div className="relative flex gap-2.5 pb-2 last:pb-0">
      {!last && (
        <span
          className={cn(
            'absolute left-[10px] top-[22px] h-[calc(100%-14px)] w-px',
            state === 'done' ? 'bg-emerald-300' : 'bg-[#e4eaf3]',
          )}
        />
      )}
      <span
        className={cn(
          'relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white',
          state === 'done' && 'bg-emerald-500 text-white',
          state === 'current' && 'bg-[#3ecf8e] text-white',
          state === 'todo' && 'bg-surface-raised text-[#b4c0d0]',
        )}
      >
        {state === 'done' ? <Check className="h-3 w-3" /> : index}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            'text-[12.5px] font-semibold leading-tight',
            state === 'todo' ? 'text-[#b4c0d0]' : 'text-[#0b1220]',
          )}
        >
          {label}
        </p>
        <p className="text-[11px] leading-tight text-[#9aa7ba]">{hint}</p>
      </div>
    </div>
  )
}

/* ─────────────── Print document ─────────────── */

function BoqPrintView({
  title,
  versionLabel,
  project,
  status,
  items,
  attachments,
  subtotal,
  gst,
  gstAmount,
  discount,
  grand,
  byRoom,
  materialMode,
  boqType,
}) {
  const printDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const rows = items.filter(
    (it) =>
      it.description?.trim() ||
      it.materialName ||
      it.materialFamily ||
      lineAmount(it) > 0,
  )

  return (
    <div className="hidden print:block">
      <header className="mb-6 flex items-start justify-between border-b-2 border-[#0b1220] pb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary">
            EPM — Editco Project Management
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-[#0b1220]">
            {title || 'Material Master / Bill of Quantities'}
          </h1>
          <p className="mt-1 text-[12px] text-secondary">
            {project?.name || 'Project'}
            {project?.clientName ? ` · ${project.clientName}` : ''}
            {project?.location ? ` · ${project.location}` : ''}
            {boqType && BOQ_TYPE_META[boqType]
              ? ` · ${BOQ_TYPE_META[boqType].label} · ${BOQ_TYPE_META[boqType].gradeLabel}`
              : ''}
          </p>
        </div>
        <div className="text-right text-[11px] text-secondary">
          <p>
            Version:{' '}
            <span className="font-semibold text-[#0b1220]">
              {versionLabel || 'Standard'}
            </span>
          </p>
          <p className="mt-0.5">Date: {printDate}</p>
          <p className="mt-0.5 capitalize">
            Status: <span className="font-semibold text-[#0b1220]">{status}</span>
          </p>
        </div>
      </header>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-[#c7c7c7] bg-[#eef1f5] text-left text-[9px] font-bold uppercase tracking-wide text-secondary">
            <th className="w-8 py-2 pr-1">S.No.</th>
            {materialMode ? (
              <>
                <th className="w-20 py-2 pr-1">Family</th>
                <th className="w-20 py-2 pr-1">Name</th>
                <th className="py-2 pr-1">Grade / Specification</th>
                <th className="w-14 py-2 pr-1">Thick.</th>
                <th className="w-20 py-2 pr-1">Brand</th>
                <th className="w-16 py-2 pr-1">Size</th>
              </>
            ) : (
              <>
                <th className="w-20 py-2 pr-1">Section</th>
                <th className="py-2 pr-1">Description</th>
              </>
            )}
            <th className="w-12 py-2 pr-1">Unit</th>
            <th className="w-12 py-2 pr-1 text-right">Qty</th>
            <th className="w-16 py-2 pr-1 text-right">Rate</th>
            <th className="w-18 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it, idx) => (
            <tr key={it._key} className="align-top border-b border-border">
              <td className="py-1.5 pr-1 tabular-nums text-secondary">{idx + 1}</td>
              {materialMode ? (
                <>
                  <td className="py-1.5 pr-1">{it.materialFamily || '—'}</td>
                  <td className="py-1.5 pr-1 font-medium">{it.materialName || '—'}</td>
                  <td className="whitespace-pre-line py-1.5 pr-1 leading-snug text-[#0b1220]">
                    {it.grade || '—'}
                  </td>
                  <td className="py-1.5 pr-1">{it.thickness || '—'}</td>
                  <td className="py-1.5 pr-1">{it.brand || '—'}</td>
                  <td className="py-1.5 pr-1">{it.dimensions || '—'}</td>
                </>
              ) : (
                <>
                  <td className="py-1.5 pr-1 text-primary">
                    {it.room || 'INTERIOR / JOINERY'}
                  </td>
                  <td className="py-1.5 pr-1 text-[#0b1220]">
                    {it.description || '—'}
                  </td>
                </>
              )}
              <td className="py-1.5 pr-1 text-secondary">{unitLabel(it.unit)}</td>
              <td className="py-1.5 pr-1 text-right tabular-nums">{it.qty}</td>
              <td className="py-1.5 pr-1 text-right tabular-nums">
                {formatInr(it.rate)}
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums">
                {formatInr(lineAmount(it))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-[240px] space-y-1.5 text-[12px]">
          <div className="flex justify-between text-secondary">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatInr(subtotal)}</span>
          </div>
          <div className="flex justify-between text-secondary">
            <span>GST ({gst || 0}%)</span>
            <span className="tabular-nums">{formatInr(gstAmount)}</span>
          </div>
          {(Number(discount) || 0) > 0 && (
            <div className="flex justify-between text-secondary">
              <span>Discount</span>
              <span className="tabular-nums">−{formatInr(discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-[#0b1220] pt-2 text-[14px] font-bold text-[#0b1220]">
            <span>Grand total</span>
            <span className="tabular-nums">{formatInr(grand)}</span>
          </div>
        </div>
      </div>

      {byRoom.length > 1 && (
        <div className="mt-8 border-t border-border pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-secondary">
            Summary by section
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px]">
            {byRoom.map(([room, amount]) => (
              <div key={room} className="flex justify-between gap-4">
                <span className="text-secondary">{room}</span>
                <span className="font-semibold tabular-nums text-[#0b1220]">
                  {formatInr(amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mt-8 border-t border-border pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-secondary">
            Reference images
          </p>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a, i) => (
              <img
                key={a.url + i}
                src={assetUrl(a.url)}
                alt={a.name || ''}
                className="aspect-square w-full rounded object-cover"
              />
            ))}
          </div>
        </div>
      )}

      <footer className="mt-10 border-t border-border pt-4 text-[10px] leading-relaxed text-secondary">
        <p>
          This quotation is valid for 30 days from the date above unless
          otherwise agreed. Rates are in INR and exclusive of any items not
          listed. Prepared by EPM — Editco Project Management.
        </p>
      </footer>
    </div>
  )
}

function formatHistoryDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function BoqHistoryPanel({ quotes = [], activeId, onClose, onSelect }) {
  const sorted = [...quotes].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })

  const openVersion = (q) => {
    if (String(q._id) === String(activeId)) {
      onClose?.()
      return
    }
    onSelect?.(q._id)
  }

  return (
    <div className="fixed inset-0 z-[85] flex justify-end print:hidden">
      <button
        type="button"
        aria-label="Close history"
        className="absolute inset-0 bg-[#0b1220]/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[#e1e8f1] bg-surface shadow-[-20px_0_50px_-28px_rgba(11,18,32,0.45)]">
        <header className="flex items-start gap-3 border-b border-[#edf1f7] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#3ecf8e]">
              <History className="h-3.5 w-3.5" />
              Version history
            </div>
            <h2 className="mt-1 text-[16px] font-semibold tracking-tight text-[#0b1220]">
              All BOQs for this project
            </h2>
            <p className="mt-0.5 text-[12px] text-[#8a98ac]">
              Tap a version to open it. Use History again anytime to switch back.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa7ba] transition hover:bg-[#f2f6fb] hover:text-[#0b1220]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sorted.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-[#8a98ac]">
              No BOQ versions yet for this project.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((q) => {
                const meta = STATUS_META[q.status] || STATUS_META.draft
                const active = String(q._id) === String(activeId)
                return (
                  <li key={q._id}>
                    <div
                      className={cn(
                        'rounded-xl border px-3.5 py-3 transition',
                        active
                          ? 'border-[#c7dbfb] bg-[#eef4ff] shadow-[0_1px_2px_rgba(37,99,235,0.08)]'
                          : 'border-[#e9eef6] bg-surface',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            meta.dot,
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-[#0b1220]">
                              {q.title || 'Untitled BOQ'}
                            </p>
                            {active ? (
                              <span className="shrink-0 rounded bg-[#dbeafe] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1d4ed8]">
                                Viewing
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11.5px] text-[#8a98ac]">
                            {q.versionLabel ||
                              BOQ_TYPE_META[q.boqType]?.label ||
                              'Standard'}
                            {' · '}
                            {meta.label}
                            {' · '}
                            {(q.items || []).length} lines
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] tabular-nums text-[#9aa7ba]">
                              {formatHistoryDate(q.updatedAt || q.createdAt)}
                            </span>
                            <span className="text-[12.5px] font-semibold tabular-nums text-[#0b1220]">
                              {formatInr(q.grandTotal || 0)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openVersion(q)}
                            className={cn(
                              'mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition',
                              active
                                ? 'border border-[#c7dbfb] bg-white text-[#24b47e]'
                                : 'bg-[#0b1220] text-white hover:bg-[#1f2937]',
                            )}
                          >
                            {active ? 'Close · keep viewing' : 'Open this version'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
