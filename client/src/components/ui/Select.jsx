import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Select = forwardRef(function Select(
  {
    className,
    label,
    error,
    light = false,
    options = [],
    placeholder,
    children,
    ...props
  },
  ref,
) {
  return (
    <label className="relative flex w-full flex-col gap-1.5">
      {label && (
        <span className="text-xs font-semibold text-primary">{label}</span>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'form-field h-10 w-full appearance-none rounded-[8px] px-3 pr-9 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out',
            'border border-border bg-surface-raised text-primary',
            'focus:border-accent/50 focus:ring-2 focus:ring-accent/15',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-status-delayed',
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
      </div>
      {error && <span className="text-xs text-status-delayed">{error}</span>}
    </label>
  )
})
