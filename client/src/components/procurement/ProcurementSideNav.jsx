import { Link, useNavigate } from 'react-router-dom'
import {
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileWarning,
  Gauge,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Plus,
  Receipt,
  Send,
  Store,
  Truck,
  Wallet,
} from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Vertical Materials / Procurement menu — one page per section
 * (same idea as a classic Procurement sidebar: Dashboard, Vendors, PO, GRN…).
 */
export const PROCUREMENT_NAV = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: Gauge,
    hint: 'Pipeline overview',
  },
  {
    key: 'inventory',
    label: 'Product Master',
    icon: PackageCheck,
    hint: 'Stock & catalogue',
  },
  {
    key: 'boq',
    label: 'BOQ control',
    icon: FileSpreadsheet,
    hint: 'What still needs buying',
  },
  {
    key: 'vendors',
    label: 'Vendors',
    icon: Store,
    hint: 'Directory & ratings',
    create: true,
  },
  {
    key: 'requests',
    label: 'Purchase Request',
    icon: ClipboardList,
    hint: 'Material requests',
    create: true,
  },
  {
    key: 'rfqs',
    label: 'RFQs',
    icon: Send,
    hint: 'Get vendor prices',
  },
  {
    key: 'orders',
    label: 'Purchase Order',
    icon: Package,
    hint: 'Raise & track POs',
    create: true,
  },
  {
    key: 'invoices',
    label: 'Purchase Invoice',
    icon: Receipt,
    hint: 'Vendor bills',
  },
  {
    key: 'grn',
    label: 'GRN',
    icon: PackagePlus,
    hint: 'Goods received',
    create: true,
  },
  {
    key: 'qc',
    label: 'QC',
    icon: ClipboardCheck,
    hint: 'Quality checks',
  },
  {
    key: 'transit',
    label: 'Transit',
    icon: Truck,
    hint: 'Live shipment board',
  },
  {
    key: 'debit',
    label: 'Debit notes',
    icon: FileWarning,
    hint: 'Short / damage claims',
  },
  {
    key: 'issues',
    label: 'Issues',
    icon: PackageMinus,
    hint: 'Material out to site',
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: Wallet,
    hint: 'Settle vendors',
  },
]

const VALID = new Set(PROCUREMENT_NAV.map((n) => n.key))

export function isProcurementSection(key) {
  return VALID.has(key)
}

export function procurementPath(key) {
  return `/procurement/${key || 'dashboard'}`
}

export function ProcurementSideNav({ section, onCreate }) {
  const navigate = useNavigate()
  const active = isProcurementSection(section) ? section : 'dashboard'

  return (
    <aside className="flex w-full flex-col sm:w-[220px] sm:shrink-0">
      <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#e5dfd7] bg-[#f3efea] px-3 py-2.5 sm:mb-4">
        <Briefcase className="h-3.5 w-3.5 text-[#a27b5c]" />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#1e2022]">
          Procurement
        </span>
      </div>

      {/* Mobile: horizontal chips */}
      <nav
        aria-label="Procurement sections"
        className="-mx-1 mb-1 flex gap-1 overflow-x-auto px-1 pb-2 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {PROCUREMENT_NAV.map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <Link
              key={item.key}
              to={procurementPath(item.key)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition',
                isActive
                  ? 'bg-[#1e2022] text-[#faf9f7]'
                  : 'bg-surface text-secondary ring-1 ring-inset ring-border hover:text-primary',
              )}
            >
              <Icon className="h-3 w-3" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Desktop: light vertical list — readable on the cream canvas */}
      <nav
        aria-label="Procurement sections"
        className="hidden overflow-hidden rounded-[12px] border border-[#e5dfd7] bg-white shadow-[0_1px_2px_rgba(30,32,34,0.04)] sm:block"
      >
        <ul className="divide-y divide-[#f0ebe4] py-0.5">
          {PROCUREMENT_NAV.map((item) => {
            const Icon = item.icon
            const isActive = active === item.key
            return (
              <li key={item.key}>
                <div
                  className={cn(
                    'group flex items-center gap-0.5',
                    isActive && 'bg-[#f3efea]',
                  )}
                >
                  <Link
                    to={procurementPath(item.key)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition',
                      isActive
                        ? 'font-semibold text-[#1e2022]'
                        : 'font-medium text-[#68645e] hover:bg-[#faf9f7] hover:text-[#1e2022]',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        isActive ? 'text-[#a27b5c]' : 'text-[#8a847c]',
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  {item.create ? (
                    <button
                      type="button"
                      title={`New ${item.label}`}
                      aria-label={`New ${item.label}`}
                      onClick={(e) => {
                        e.preventDefault()
                        navigate(`${procurementPath(item.key)}?new=1`)
                        onCreate?.(item.key)
                      }}
                      className={cn(
                        'mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition',
                        isActive
                          ? 'text-[#1e2022] hover:bg-[#e5dfd7]'
                          : 'text-[#8a847c] hover:bg-[#f3efea] hover:text-[#1e2022]',
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  ) : (
                    <span className="w-2 shrink-0" aria-hidden />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </nav>

      <p className="mt-3 hidden text-[11px] leading-relaxed text-secondary sm:block">
        Each item opens its own page so the pipeline stays readable.
      </p>
    </aside>
  )
}
