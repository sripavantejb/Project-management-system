import { useState } from 'react'
import { FileText, Image as ImageIcon, Film, File } from 'lucide-react'
import { assetUrl } from '../../lib/api'
import { cn } from '../../lib/utils'
import { StatusChip } from './StatusChip'

function pickIcon(mime = '', name = '') {
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return ImageIcon
  if (mime.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(name)) return Film
  if (/\.(pdf|doc|docx)$/i.test(name)) return FileText
  return File
}

export function FileThumbnail({
  name,
  mime,
  url,
  version,
  status,
  className,
  onClick,
}) {
  const Icon = pickIcon(mime, name)
  const isImage = mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name || '')
  const resolved = assetUrl(url)
  // Files uploaded before the GridFS migration (or otherwise missing from
  // storage) 404 forever — fall back to the type icon instead of a
  // permanently broken image.
  const [broken, setBroken] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-[16px] border border-border bg-surface text-left transition-all duration-150 hover:border-accent/30 hover:bg-surface-raised',
        className,
      )}
    >
      <div className="relative aspect-[4/3] bg-surface-raised">
        {isImage && resolved && !broken ? (
          <img
            src={resolved}
            alt={name}
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-secondary">
            <Icon className="h-8 w-8" />
          </div>
        )}
        {version && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {version}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="truncate text-sm font-medium text-primary">{name}</span>
        {status && <StatusChip status={status} />}
      </div>
    </button>
  )
}
