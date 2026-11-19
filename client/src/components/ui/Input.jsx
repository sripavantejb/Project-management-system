import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef(function Input(
  { className, label, error, hint, light = false, ...props },
  ref,
) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && (
        <span className="text-xs font-semibold text-primary">{label}</span>
      )}
      <input
        ref={ref}
        className={cn(
          'form-field h-10 w-full rounded-[8px] px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out',
          'border border-border bg-surface-raised text-primary placeholder:text-muted',
          'focus:border-accent/50 focus:ring-2 focus:ring-accent/15',
          error && 'border-status-delayed focus:border-status-delayed focus:ring-status-delayed/20',
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-status-delayed">{error}</span>}
      {hint && !error && (
        <span className="text-xs text-secondary">{hint}</span>
      )}
    </label>
  )
})
