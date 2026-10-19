import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  FolderKanban,
  Plus,
  Receipt,
  ReceiptIndianRupee,
  ShieldCheck,
  TriangleAlert,
  Truck,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { api, assetUrl, useAuthStore } from '../lib/api'
import { formatInr } from '../lib/format'
import { cn } from '../lib/utils'
import {
  PageToolbar,
  ToolbarLink,
  ToolbarPills,
} from '../components/layout/PageToolbar'
import {
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Select,
  StatusChip,
  toast,
} from '../components/ui'

const REVIEW_ROLES = ['admin', 'owner', 'project_manager', 'hr']

const EXPENSE_CATEGORIES = [
  { value: 'Materials', label: 'Materials' },
  { value: 'Labour', label: 'Labour' },
  { value: 'Transport', label: 'Transport' },
  { value: 'Site', label: 'Site expense' },
  { value: 'Other', label: 'Other' },
]

function moneyMargin(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 1,
  }).format(Number(value))}%`
}

function formatWhen(value) {
  if (!value) return ''
  try {
    return format(new Date(value), 'd MMM yyyy')
  } catch {
    return ''
  }
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'blue', onClick }) {
  const tones = {
    blue: 'bg-[var(--nav-active-bg)] text-[var(--accent)]',
    slate: 'bg-surface-raised text-secondary',
    green: 'bg-[var(--nav-active-bg)] text-[#059669]',
    red: 'bg-[#fef2f2] text-[#dc2626]',
    amber: 'bg-[#fffbeb] text-[#d97706]',
  }
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-[12px] border border-border bg-surface p-4 text-left sm:p-5',
        onClick && 'transition hover:border-accent/40 hover:shadow-sm',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          tones[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">
          {label}
        </p>
        <p className="mt-1 truncate text-[21px] font-semibold leading-none tabular-nums text-primary sm:text-[24px]">
          {value}
        </p>
        {hint ? (
          <p className="mt-1.5 truncate text-[11px] text-secondary">{hint}</p>
        ) : null}
      </div>
      {onClick ? (
        <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-secondary" />
      ) : null}
    </Comp>
  )
}

function ConnectChip({ to, icon: Icon, label, note }) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 transition hover:border-accent/40 hover:bg-surface-raised"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-secondary ring-1 ring-border group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-primary">{label}</p>
        <p className="truncate text-[11px] text-secondary">{note}</p>
      </div>
      <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-secondary opacity-0 transition group-hover:opacity-100" />
    </Link>
  )
}

export function FinancePage() {
  const user = useAuthStore((s) => s.user)
  const canReview =
    !!user?.isPlatformAdmin || REVIEW_ROLES.includes(user?.role)
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const tabParam = params.get('tab')
  const initialTab =
    tabParam === 'approvals' && canReview
      ? 'approvals'
      : tabParam === 'expenses' || tabParam === 'commitments'
        ? tabParam
        : 'overview'

  const [tab, setTabState] = useState(initialTab)
  const [expenseFilter, setExpenseFilter] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    projectId: '',
    amount: '',
    category: 'Materials',
    note: '',
  })

  const setTab = (next) => {
    setTabState(next)
    const nextParams = new URLSearchParams(params)
    if (next === 'overview') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  const {
    data,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useQuery({
    queryKey: ['finance'],
    queryFn: () => api('/finance/summary'),
  })
  const {
    data: expenses,
    isLoading: expensesLoading,
    isError: expensesError,
  } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api('/expenses'),
  })
  const { data: poData, isLoading: poLoading } = useQuery({
    queryKey: ['purchase-orders', 'money'],
    queryFn: async () => {
      try {
        return await api('/purchase-orders')
      } catch {
        // Finance-only roles may lack procurement — fall back to summary commitments
        return null
      }
    },
  })

  const d = data?.data
  const pnl = d?.pnl || []
  const expenseList = expenses?.expenses || []
  const purchaseOrders =
    poData?.purchaseOrders?.length || poData?.orders?.length
      ? poData.purchaseOrders || poData.orders
      : d?.committedOrders || poData?.purchaseOrders || poData?.orders || []
  const variance = Number(d?.variance) || 0
  const overBudget = variance < 0

  const myExpenses = useMemo(
    () =>
      expenseList.filter(
        (ex) =>
          String(ex.submittedBy?._id || ex.submittedBy) === String(user?._id),
      ),
    [expenseList, user?._id],
  )

  const pendingApprovals = useMemo(
    () => expenseList.filter((ex) => ex.status === 'pending'),
    [expenseList],
  )

  const visibleExpenses = useMemo(() => {
    if (expenseFilter === 'mine') return myExpenses
    if (expenseFilter === 'all') return expenseList
    return expenseList.filter((ex) => ex.status === expenseFilter)
  }, [expenseFilter, expenseList, myExpenses])

  const committedPos = useMemo(
    () =>
      purchaseOrders.filter((po) =>
        ['approved', 'ordered', 'in_transit', 'delivered'].includes(po.status),
      ),
    [purchaseOrders],
  )

  const review = useMutation({
    mutationFn: ({ id, status }) =>
      api(`/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
      toast(
        vars.status === 'approved'
          ? 'Expense approved — spend updated'
          : 'Expense rejected',
        { type: 'success' },
      )
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const createExpense = useMutation({
    mutationFn: (body) =>
      api('/expenses', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
      setExpenseForm({
        projectId: '',
        amount: '',
        category: 'Materials',
        note: '',
      })
      setAddOpen(false)
      setTab('expenses')
      setExpenseFilter('mine')
      toast(
        canReview
          ? 'Expense submitted — review it under Approvals when ready'
          : 'Expense sent for approval',
        { type: 'success' },
      )
    },
    onError: (e) => toast(e.message, { type: 'error' }),
  })

  const submitExpense = (e) => {
    e.preventDefault()
    createExpense.mutate({
      ...expenseForm,
      amount: Number(expenseForm.amount),
    })
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'expenses', label: 'Expenses' },
    ...(canReview
      ? [
          {
            key: 'approvals',
            label:
              pendingApprovals.length > 0
                ? `Approvals (${pendingApprovals.length})`
                : 'Approvals',
          },
        ]
      : []),
    { key: 'commitments', label: 'Commitments' },
  ]

  if (summaryError || expensesError) {
    return (
      <Card className="border border-red-200 bg-red-50 text-center">
        <TriangleAlert className="mx-auto h-6 w-6 text-red-600" />
        <p className="mt-2 font-semibold text-red-800">
          Finance data could not be loaded
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['finance'] })
            qc.invalidateQueries({ queryKey: ['expenses'] })
          }}
        >
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-10">
      <PageToolbar
        left={<ToolbarPills items={tabs} value={tab} onChange={setTab} />}
        right={
          <>
            <ToolbarLink to="/projects">Projects</ToolbarLink>
            <ToolbarLink to="/procurement">Materials</ToolbarLink>
            <ToolbarLink to="/billing">Billing</ToolbarLink>
            {tab === 'expenses' || tab === 'overview' ? (
              <Button
                onClick={() => {
                  setTab('expenses')
                  setAddOpen(true)
                }}
              >
                <Plus className="h-4 w-4" />
                Submit expense
              </Button>
            ) : null}
          </>
        }
      />

      {tab === 'overview' && (
        <>
          {canReview && pendingApprovals.length > 0 && (
            <button
              type="button"
              onClick={() => setTab('approvals')}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-300"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-amber-950">
                    {pendingApprovals.length} expense
                    {pendingApprovals.length === 1 ? '' : 's'} waiting for
                    approval
                  </p>
                  <p className="text-[11px] text-amber-800/80">
                    {formatInr(d?.pendingAmount)} pending · open Approvals to
                    decide
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-900">
                Review now <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </button>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={WalletCards}
              label="Portfolio budget"
              value={summaryLoading ? '—' : formatInr(d?.totalBudget)}
              hint="From approved quotes / BOQ budgets"
            />
            <MetricCard
              icon={ReceiptIndianRupee}
              label="Actual spent"
              value={summaryLoading ? '—' : formatInr(d?.totalSpent)}
              hint={`${d?.approvedExpenseCount || 0} approved expenses + recorded costs`}
              tone="slate"
              onClick={() => {
                setTab('expenses')
                setExpenseFilter('approved')
              }}
            />
            <MetricCard
              icon={overBudget ? TriangleAlert : CircleDollarSign}
              label={overBudget ? 'Over budget' : 'Budget remaining'}
              value={summaryLoading ? '—' : formatInr(Math.abs(variance))}
              hint={
                overBudget ? 'Portfolio needs attention' : 'Across all projects'
              }
              tone={overBudget ? 'red' : 'green'}
            />
            <MetricCard
              icon={Clock3}
              label="Pending expenses"
              value={summaryLoading ? '—' : formatInr(d?.pendingAmount)}
              hint={`${d?.pendingExpenseCount || 0} awaiting decision`}
              tone="amber"
              onClick={() =>
                canReview ? setTab('approvals') : setTab('expenses')
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ConnectChip
              to="/projects"
              icon={FolderKanban}
              label="Projects"
              note="Budgets live on each project"
            />
            <ConnectChip
              to="/procurement"
              icon={Truck}
              label="Materials / POs"
              note={`${formatInr(d?.committedAmount || 0)} committed`}
            />
            <ConnectChip
              to="/billing"
              icon={Receipt}
              label="Vendor billing"
              note="Invoice files for purchase orders"
            />
            <ConnectChip
              to="/boq"
              icon={FileSpreadsheet}
              label="BOQ / Quotes"
              note="Approved quotes set project budget"
            />
          </div>

          <Card variant="light" padding={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-semibold text-on-light">
                  Project financial health
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Budget − (recorded costs + approved expenses). PO commitments
                  are tracked separately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('commitments')}
                className="text-[12px] font-semibold text-secondary hover:text-primary"
              >
                View PO commitments →
              </button>
            </div>

            <div className="divide-y divide-border-light md:hidden">
              {summaryLoading ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">
                  Calculating…
                </p>
              ) : pnl.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">
                  No projects yet. Create a project and approve a quote to set
                  budget.
                </p>
              ) : (
                pnl.map((row) => (
                  <Link
                    key={row.id}
                    to={`/projects/${row.id}/overview`}
                    className="block space-y-2 px-4 py-3 hover:bg-surface-raised"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-on-light">
                        {row.name}
                      </p>
                      <StatusChip
                        status={
                          row.health === 'over_budget'
                            ? 'delayed'
                            : row.health === 'no_budget'
                              ? 'draft'
                              : 'completed'
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>Budget {formatInr(row.quoted)}</span>
                      <span className="text-right">
                        Spent {formatInr(row.costs)}
                      </span>
                      <span>POs {formatInr(row.committed)}</span>
                      <span
                        className={cn(
                          'text-right font-semibold',
                          row.profit >= 0 ? 'text-emerald-700' : 'text-red-600',
                        )}
                      >
                        {row.profit >= 0 ? 'Left' : 'Over'}{' '}
                        {formatInr(Math.abs(row.profit))}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="hidden md:block">
              <DataTable
                className="rounded-none border-0"
                columns={[
                  {
                    key: 'name',
                    label: 'Project',
                    render: (v, row) => (
                      <Link
                        to={`/projects/${row.id}/overview`}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:text-[var(--accent)]"
                      >
                        {v} <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    ),
                  },
                  {
                    key: 'quoted',
                    label: 'Budget',
                    numeric: true,
                    align: 'right',
                    render: (v) => formatInr(v),
                  },
                  {
                    key: 'costs',
                    label: 'Spent',
                    numeric: true,
                    align: 'right',
                    render: (v) => formatInr(v),
                  },
                  {
                    key: 'committed',
                    label: 'PO committed',
                    numeric: true,
                    align: 'right',
                    render: (v) => (
                      <Link
                        to="/procurement"
                        className="tabular-nums text-secondary hover:text-primary"
                      >
                        {formatInr(v)}
                      </Link>
                    ),
                  },
                  {
                    key: 'profit',
                    label: 'Balance',
                    numeric: true,
                    align: 'right',
                    render: (v) => (
                      <span
                        className={
                          v >= 0
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-red-600'
                        }
                      >
                        {v < 0 ? '−' : ''}
                        {formatInr(Math.abs(v))}
                      </span>
                    ),
                  },
                  {
                    key: 'margin',
                    label: 'Margin',
                    numeric: true,
                    align: 'right',
                    render: (v) => moneyMargin(v),
                  },
                ]}
                data={pnl}
              />
            </div>
          </Card>
        </>
      )}

      {tab === 'expenses' && (
        <ExpensesPanel
          loading={expensesLoading}
          expenses={visibleExpenses}
          filter={expenseFilter}
          setFilter={setExpenseFilter}
          onSubmit={() => setAddOpen(true)}
        />
      )}

      {tab === 'approvals' && canReview && (
        <ApprovalsPanel
          loading={expensesLoading}
          expenses={pendingApprovals}
          reviewing={review.isPending}
          onReview={(id, status) => review.mutate({ id, status })}
        />
      )}

      {tab === 'commitments' && (
        <CommitmentsPanel
          loading={poLoading}
          orders={committedPos}
          totalCommitted={d?.committedAmount || 0}
        />
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Submit an expense"
      >
        <form className="space-y-4" onSubmit={submitExpense}>
          <p className="rounded-xl border border-border bg-canvas px-3 py-2 text-[12px] text-secondary">
            Expenses need manager approval before they count toward spend.
            Material purchases should usually go through{' '}
            <Link
              to="/procurement"
              className="font-semibold text-primary underline"
            >
              Materials → PO
            </Link>
            .
          </p>
          <Select
            label="Project"
            value={expenseForm.projectId}
            onChange={(e) =>
              setExpenseForm((form) => ({
                ...form,
                projectId: e.target.value,
              }))
            }
            options={[
              { value: '', label: 'Select a project' },
              ...pnl.map((project) => ({
                value: String(project.id),
                label: project.name,
              })),
            ]}
          />
          <Input
            label="Amount (₹)"
            type="number"
            min="1"
            step="1"
            value={expenseForm.amount}
            onChange={(e) =>
              setExpenseForm((form) => ({
                ...form,
                amount: e.target.value,
              }))
            }
            placeholder="Enter the exact amount"
          />
          <Select
            label="Category"
            value={expenseForm.category}
            onChange={(e) =>
              setExpenseForm((form) => ({
                ...form,
                category: e.target.value,
              }))
            }
            options={EXPENSE_CATEGORIES}
          />
          <Input
            label="Description"
            value={expenseForm.note}
            onChange={(e) =>
              setExpenseForm((form) => ({
                ...form,
                note: e.target.value,
              }))
            }
            placeholder="What was this expense for?"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createExpense.isPending}
              disabled={
                !expenseForm.projectId ||
                !expenseForm.note.trim() ||
                Number(expenseForm.amount) <= 0
              }
            >
              Send for approval
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function ExpensesPanel({ loading, expenses, filter, setFilter, onSubmit }) {
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'mine', label: 'Mine' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ]

  return (
    <Card padding={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-primary">Expense ledger</p>
          <p className="mt-0.5 text-[11px] text-secondary">
            Submit costs here. Managers decide on the Approvals tab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarPills items={filters} value={filter} onChange={setFilter} />
          <Button size="sm" onClick={onSubmit}>
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {loading ? (
          <p className="px-4 py-12 text-center text-sm text-secondary">
            Loading expenses…
          </p>
        ) : expenses.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-semibold text-primary">No expenses yet</p>
            <p className="mt-1 text-[12px] text-secondary">
              Field teams can also log expenses from Site mode.
            </p>
            <Button className="mt-4" onClick={onSubmit}>
              Submit expense
            </Button>
          </div>
        ) : (
          expenses.map((ex) => <ExpenseRow key={ex._id} expense={ex} />)
        )}
      </div>
    </Card>
  )
}

function ApprovalsPanel({ loading, expenses, reviewing, onReview }) {
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-primary">Approval queue</p>
        <p className="mt-0.5 text-[11px] text-secondary">
          Only pending expenses. Approving updates Actual spent on Overview.
        </p>
      </div>
      <div className="divide-y divide-border">
        {loading ? (
          <p className="px-4 py-12 text-center text-sm text-secondary">
            Loading queue…
          </p>
        ) : expenses.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-sm font-semibold text-primary">
              All caught up
            </p>
            <p className="mt-1 text-[12px] text-secondary">
              No expenses waiting for your decision.
            </p>
          </div>
        ) : (
          expenses.map((ex) => (
            <ExpenseRow
              key={ex._id}
              expense={ex}
              actions={
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => onReview(ex._id, 'rejected')}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => onReview(ex._id, 'approved')}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 text-[11px] font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </button>
                </div>
              }
            />
          ))
        )}
      </div>
    </Card>
  )
}

function CommitmentsPanel({ loading, orders, totalCommitted }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-primary">
            Purchase order commitments
          </p>
          <p className="mt-0.5 text-[11px] text-secondary">
            POs from Materials are buying commitments — not expense approvals.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">
            Committed
          </p>
          <p className="text-[20px] font-semibold tabular-nums text-primary">
            {formatInr(totalCommitted)}
          </p>
        </div>
      </div>

      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold">Open &amp; delivered POs</p>
          <Link
            to="/procurement"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-secondary hover:text-primary"
          >
            Open Materials <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <p className="px-4 py-12 text-center text-sm text-secondary">
              Loading purchase orders…
            </p>
          ) : orders.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-semibold text-primary">
                No committed POs
              </p>
              <p className="mt-1 text-[12px] text-secondary">
                Create purchase orders from Materials when you buy for site.
              </p>
              <Link to="/procurement">
                <Button className="mt-4">Go to Materials</Button>
              </Link>
            </div>
          ) : (
            orders.map((po) => (
              <div
                key={po._id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary">
                    {po.title || po.poNumber || 'Purchase order'}
                  </p>
                  <p className="truncate text-[11px] text-secondary">
                    {po.projectId?.name || 'Project'}
                    {po.vendor?.name ? ` · ${po.vendor.name}` : ''}
                    {po.updatedAt ? ` · ${formatWhen(po.updatedAt)}` : ''}
                  </p>
                </div>
                <StatusChip status={po.status} />
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatInr(po.value || po.total || 0)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/procurement"
          className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 transition hover:border-accent/40"
        >
          <div>
            <p className="text-[13px] font-semibold text-primary">
              Manage purchase orders
            </p>
            <p className="text-[11px] text-secondary">
              Create and advance POs on Materials
            </p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-secondary" />
        </Link>
        <Link
          to="/billing"
          className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 transition hover:border-accent/40"
        >
          <div>
            <p className="text-[13px] font-semibold text-primary">
              Vendor invoices &amp; bills
            </p>
            <p className="text-[11px] text-secondary">
              Attach invoice files to material POs
            </p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-secondary" />
        </Link>
      </div>
    </div>
  )
}

function ExpenseRow({ expense: ex, actions }) {
  return (
    <div className="space-y-2.5 px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-secondary">
          <ReceiptIndianRupee className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">
            {ex.note || ex.category}
          </p>
          <p className="truncate text-[11px] text-secondary">
            {ex.projectId?.name ? (
              <Link
                to={`/projects/${ex.projectId._id || ex.projectId}/overview`}
                className="hover:text-primary hover:underline"
              >
                {ex.projectId.name}
              </Link>
            ) : (
              'Unknown project'
            )}
            {' · '}
            {ex.category}
            {' · '}
            {ex.submittedBy?.name || 'Team member'}
            {ex.createdAt ? ` · ${formatWhen(ex.createdAt)}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
          {formatInr(ex.amount)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12">
        <StatusChip status={ex.status} />
        {ex.receiptUrl && (
          <a
            href={assetUrl(ex.receiptUrl)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
          >
            View receipt
          </a>
        )}
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>
    </div>
  )
}
