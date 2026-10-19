import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const variants = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_1px_2px_rgba(30,32,34,0.08)]',
  secondary:
    'bg-surface-raised text-primary border border-transparent hover:bg-active',
  ghost: 'bg-transparent text-secondary hover:text-primary hover:bg-surface-raised',
  danger:
    'bg-status-delayed/15 text-status-delayed border border-transparent hover:bg-status-delayed/25',
  light:
    'bg-surface text-on-light border border-transparent hover:bg-surface-raised',
  dark: 'bg-surface-raised text-primary border border-transparent hover:bg-active',
}

const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[14px] gap-2',
}

export const Button = forwardRef(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[4px] font-medium transition-[transform,background-color,color,box-shadow,opacity] duration-125 ease-out',
        'disabled:pointer-events-none disabled:border-transparent disabled:bg-surface-raised disabled:text-secondary disabled:shadow-none',
        'active:scale-[0.97] motion-reduce:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-16 animate-pulse rounded bg-black/10" />
      ) : (
        children
      )}
    </button>
  )
})
