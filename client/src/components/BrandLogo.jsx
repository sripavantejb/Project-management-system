import { cn } from '../lib/utils'

/** Clyro wordmark / icon used in chrome, login, and marketing. */
export function BrandLogo({
  size = 36,
  className,
  alt = 'Clyro',
  rounded = true,
}) {
  return (
    <img
      src="/clyro-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={cn(
        'object-cover',
        rounded && 'rounded-[8px]',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}
