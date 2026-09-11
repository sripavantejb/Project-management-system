import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowUpRight, ListChecks, Info, Sparkles, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { GUIDE_SECTIONS, searchGuideTopics } from '../../lib/guideContent'

/**
 * Standalone, static "how to use the app" guide — a W3Schools-style
 * two-pane layout (topic tree + search on the left, article on the right).
 * Same content for every viewer; not tied to who is looking at it.
 */
export function UserGuide() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0].topics[0].id)

  const searchResults = useMemo(() => searchGuideTopics(query), [query])

  const activeTopic = useMemo(() => {
    for (const section of GUIDE_SECTIONS) {
      const hit = section.topics.find((t) => t.id === activeId)
      if (hit) return { ...hit, sectionLabel: section.label, sectionIcon: section.icon }
    }
    return null
  }, [activeId])

  const select = (id) => {
    setActiveId(id)
    setQuery('')
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:items-start">
      {/* ── Left: search + topic tree ── */}
      <div className="md:sticky md:top-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="w-full rounded-[10px] border border-border bg-surface py-2 pl-9 pr-8 text-[13px] text-primary outline-none placeholder:text-secondary focus:border-accent/50"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-secondary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="max-h-[70vh] overflow-y-auto rounded-[12px] border border-border bg-surface thin-scroll">
          {query.trim() ? (
            searchResults.length ? (
              <div className="p-1.5">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                  {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
                </p>
                {searchResults.map((topic) => (
                  <TopicButton
                    key={topic.id}
                    topic={topic}
                    active={topic.id === activeId}
                    onClick={() => select(topic.id)}
                    subLabel={topic.sectionLabel}
                  />
                ))}
              </div>
            ) : (
              <p className="p-4 text-center text-[13px] text-secondary">
                No matches for "{query}". Try a different word.
              </p>
            )
          ) : (
            <div className="p-1.5">
              {GUIDE_SECTIONS.map((section) => (
                <div key={section.id} className="mb-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                    <section.icon className="h-3.5 w-3.5" />
                    {section.label}
                  </div>
                  {section.topics.map((topic) => (
                    <TopicButton
                      key={topic.id}
                      topic={topic}
                      active={topic.id === activeId}
                      onClick={() => select(topic.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: article ── */}
      {activeTopic ? (
        <article className="min-w-0 rounded-[12px] border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                <activeTopic.sectionIcon className="h-3.5 w-3.5" />
                {activeTopic.sectionLabel}
              </p>
              <h2 className="mt-0.5 text-[19px] font-semibold tracking-tight text-primary">
                {activeTopic.title}
              </h2>
            </div>
            {activeTopic.route ? (
              <button
                type="button"
                onClick={() => navigate(activeTopic.route)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-[#171717] transition hover:bg-accent-hover"
              >
                Open this page
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-[14px] leading-relaxed text-primary">{activeTopic.summary}</p>

          {activeTopic.requires ? (
            <Callout icon={Info} tone="info" label="Before you start">
              {activeTopic.requires}
            </Callout>
          ) : null}

          {activeTopic.steps?.length ? (
            <div className="mt-4">
              <SectionLabel icon={ListChecks}>How to use it</SectionLabel>
              <ol className="mt-2 space-y-2">
                {activeTopic.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-primary">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-secondary">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {activeTopic.result ? (
            <Callout icon={Sparkles} tone="success" label="What happens next">
              {activeTopic.result}
            </Callout>
          ) : null}

          {activeTopic.actions?.length ? (
            <div className="mt-5 border-t border-border pt-4">
              <SectionLabel>Options on this page</SectionLabel>
              <div className="mt-2 space-y-2.5">
                {activeTopic.actions.map((action) => (
                  <div
                    key={action.label}
                    className="rounded-[10px] border border-border bg-surface-raised p-3"
                  >
                    <p className="text-[13.5px] font-semibold text-primary">{action.label}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-secondary">{action.detail}</p>
                    {action.result ? (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-accent-text">
                        → {action.result}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  )
}

function TopicButton({ topic, active, onClick, subLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition',
        active
          ? 'bg-accent/15 font-semibold text-accent-text'
          : 'text-primary hover:bg-surface-raised',
      )}
    >
      {topic.title}
      {subLabel ? (
        <span className="ml-1.5 text-[11px] font-normal text-secondary">· {subLabel}</span>
      ) : null}
    </button>
  )
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-secondary">
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </p>
  )
}

function Callout({ icon: Icon, tone, label, children }) {
  return (
    <div
      className={cn(
        'mt-3 flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed',
        tone === 'success' && 'border-accent/25 bg-accent/10 text-primary',
        tone === 'info' && 'border-border bg-surface-raised text-primary',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'success' ? 'text-accent-text' : 'text-secondary')} />
      <span>
        <span className="font-semibold">{label}: </span>
        {children}
      </span>
    </div>
  )
}
