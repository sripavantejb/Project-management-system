import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Input = forwardRef(function Input(
  { className, label, error, hint, light = false, type = 'text', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword ? (visible ? 'text' : 'password') : type

  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && (
        <span className="text-xs font-semibold text-primary">{label}</span>
      )}
      <div className="relative">
        <input
          ref={ref}
          type={resolvedType}
          className={cn(
            'form-field h-10 w-full rounded-[8px] px-3 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-out',
            'border border-border bg-surface-raised text-primary placeholder:text-muted',
            'focus:border-accent/50 focus:ring-2 focus:ring-accent/15',
            isPassword && 'pr-10',
            error &&
              'border-status-delayed focus:border-status-delayed focus:ring-status-delayed/20',
            className,
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-secondary hover:bg-black/[0.04] hover:text-primary"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
      {error && <span className="text-xs text-status-delayed">{error}</span>}
      {hint && !error && (
        <span className="text-xs text-secondary">{hint}</span>
      )}
    </label>
  )
})
