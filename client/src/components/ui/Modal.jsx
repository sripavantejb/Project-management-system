import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { modalBackdrop, useMotion } from '../../lib/motion'

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = 'md',
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }
  const motionSys = useMotion()

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={motionSys.modalTransition}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative w-full rounded-[16px] border border-border bg-surface text-primary shadow-[0_16px_48px_rgba(0,0,0,0.12)]',
              'dark-modal',
              widths[size],
              className,
            )}
            variants={motionSys.modalPanel}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={motionSys.modalTransition}
          >
            {(title || onClose) && (
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h2 className="text-base font-semibold tracking-tight text-primary">
                  {title}
                </h2>
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-1.5 text-secondary transition-colors duration-150 hover:bg-surface-raised hover:text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <div className="max-h-[min(80vh,720px)] overflow-y-auto p-5">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
