import { cn } from '../../lib/utils'

/** Shared canvas + padding for every project tab — Apple-quiet, aligned. */
export function ProjectPageShell({
  children,
  className,
  flush = false,
  narrow = false,
}) {
  return (
    <div
      className={cn(
        'min-h-full bg-[var(--bg-canvas)]',
        !flush && 'p-4 md:p-5 lg:p-6',
        narrow && 'mx-auto w-full max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** White panel used as the primary surface on the gray canvas */
export function ProjectPanel({ children, className, padding = true }) {
  return (
    <section
      className={cn(
        'rounded-xl border border-[#e5dfd7] bg-white shadow-none',
        padding && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** Compact tab toolbar row (filters left, actions right) */
export function ProjectTabBar({ left, right, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2.5 sm:px-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      {right ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {right}
        </div>
      ) : null}
    </div>
  )
}
