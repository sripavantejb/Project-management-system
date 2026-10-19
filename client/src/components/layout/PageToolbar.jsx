import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

/**
 * Shared page chrome: filters / nav on the left, primary actions on the right.
 */
export function PageToolbar({ left, right, className }) {
  const hasLeft = left != null && left !== false
  const hasRight = right != null && right !== false

  if (!hasLeft && !hasRight) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        hasLeft && hasRight ? 'justify-between' : hasRight ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {hasLeft ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      ) : null}
      {hasRight ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {right}
        </div>
      ) : null}
    </div>
  )
}

/** Shared selected-pill look — theme tokens (light + dark) */
export const PILL_TRACK =
  'inline-flex flex-wrap items-center gap-0.5 rounded-[4px] border border-border bg-surface p-[3px]'
export const PILL_ACTIVE =
  'bg-surface text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]'
export const PILL_IDLE = 'text-secondary hover:text-primary'

/** Segmented control — white selected pill on quiet track */
export function ToolbarPills({ items, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cn(PILL_TRACK, className)}
    >
      {items.map((item) => {
        const key = item.key ?? item.id ?? item.value
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(key)}
            className={cn(
              'relative rounded-[4px] px-3.5 py-1.5 text-[12px] font-medium tracking-[0.01em] transition-[color,background-color,box-shadow] duration-200 ease-out',
              active ? PILL_ACTIVE : PILL_IDLE,
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/** Quiet left-side contextual nav link */
export function ToolbarLink({ to, children, className, ...props }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-secondary transition hover:bg-surface hover:text-primary',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}
