import { useState } from 'react'
import { assetUrl } from '../../lib/api'
import { cn } from '../../lib/utils'

const sizeMap = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-12 w-12 text-base',
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function Avatar({
  src,
  name = '',
  size = 'md',
  className,
  online,
}) {
  // Stored avatars are relative links like `/api/media/:id`. Resolving here
  // rather than at each call site means every avatar in the app works when the
  // SPA and API are on different origins. assetUrl leaves absolute URLs alone,
  // so passing an already-resolved src is harmless.
  const resolved = assetUrl(src)
  // Old records can point at files that no longer exist (e.g. legacy
  // pre-GridFS `/uploads/...` links) — fall back to initials instead of
  // leaving a permanently broken image icon on screen.
  const [broken, setBroken] = useState(false)

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      {resolved && !broken ? (
        <img
          src={resolved}
          alt={name}
          onError={() => setBroken(true)}
          className={cn(
            'rounded-full object-cover ring-2 ring-canvas',
            sizeMap[size],
          )}
        />
      ) : (
        <div
          className={cn(
            'rounded-full bg-surface-raised text-primary font-semibold flex items-center justify-center ring-2 ring-canvas',
            sizeMap[size],
          )}
        >
          {initials(name) || '?'}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas" />
      )}
    </div>
  )
}

export function AvatarStack({ users = [], max = 4, size = 'md', className }) {
  const visible = users.slice(0, max)
  const remaining = users.length - visible.length

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {visible.map((u, i) => (
        <Avatar
          key={u.id || u._id || i}
          src={u.avatar || u.src}
          name={u.name}
          size={size}
        />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'rounded-full bg-surface text-secondary font-semibold flex items-center justify-center ring-2 ring-canvas',
            sizeMap[size],
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}
