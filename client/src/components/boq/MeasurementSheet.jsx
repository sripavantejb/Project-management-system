import { Fragment, useMemo, useState } from 'react'
import {
  Check,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'

const cn = (...c) => c.filter(Boolean).join(' ')

const UNIT_LABEL = {
  sft: 'Sqfts',
  rft: 'Rft',
  nos: "No's",
  ls: 'LS',
  load: 'Load',
}

export function rowQty(r) {
  const nos = Number(r.nos) || 0
  const l = Number(r.length) || 0
  const w = Number(r.width) || 0
  if (nos && l && w) return nos * l * w
  if (nos && l) return nos * l
  return Number(r.qty) || nos || 0
}

const sumRows = (rows = []) => rows.reduce((s, r) => s + rowQty(r), 0)

/** Override wins when set, otherwise the rows speak for themselves. */
export function itemTotal(it) {
  return it?.overrideTotal != null && it.overrideTotal !== ''
    ? Number(it.overrideTotal) || 0
    : sumRows(it?.rows)
}

const nf = (n) => {
  const v = Number(n)
  if (!v) return '—'
  return Number(v.toFixed(2)).toLocaleString('en-IN')
}

/* ─────────────────────────── space filter ─────────────────────────── */

function SpacePopover({ spaces, selected, onApply, onClose }) {
  const [picked, setPicked] = useState(() => new Set(selected))
  const [q, setQ] = useState('')
  const shown = spaces.filter((s) =>
    s.name.toLowerCase().includes(q.trim().toLowerCase()),
  )

  return (
    <div className="absolute right-0 top-9 z-30 w-[min(420px,88vw)] rounded-2xl border border-[#e1e8f1] bg-surface p-3 shadow-[0_20px_50px_-20px_rgba(11,18,32,0.35)]">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#5b6b80]">
          Spaces in this office
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded-md p-1 text-[#9aa7ba] transition hover:bg-[#f4f7fb] hover:text-[#0b1220]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 text-[11.5px] text-[#8a98ac]">
        Unticking a space hides its measurement rows from the sheet.
      </p>

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9aa7ba]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter spaces…"
          className="h-8 w-full rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] pl-7 pr-2 text-[12px] outline-none focus:border-[#b6cef7] focus:bg-surface"
        />
      </div>

      <div className="mt-2 max-h-[46vh] overflow-y-auto pr-0.5">
        {shown.map((s) => {
          const on = picked.has(s.name)
          return (
            <button
              key={s.name}
              type="button"
              onClick={() =>
                setPicked((prev) => {
                  const next = new Set(prev)
                  if (next.has(s.name)) next.delete(s.name)
                  else next.add(s.name)
                  return next
                })
              }
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-[#f7f9fc]"
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  on
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[#d7e0ec] bg-surface',
                )}
              >
                {on ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#0b1220]">
                {s.name}
              </span>
              <span className="text-[10.5px] tabular-nums text-[#9aa7ba]">{s.uses}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-1.5 border-t border-[#eef2f7] pt-2">
        <button
          type="button"
          onClick={() => setPicked(new Set(spaces.map((s) => s.name)))}
          className="h-7 rounded-lg px-2 text-[11.5px] font-semibold text-[#5b6b80] transition hover:bg-[#f4f7fb]"
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setPicked(new Set())}
          className="h-7 rounded-lg px-2 text-[11.5px] font-semibold text-[#5b6b80] transition hover:bg-[#f4f7fb]"
        >
          None
        </button>
        <span className="text-[11.5px] text-[#8a98ac]">{picked.size} selected</span>
        <button
          type="button"
          disabled={!picked.size}
          onClick={() => onApply([...picked])}
          className="ml-auto h-7 rounded-lg bg-[var(--accent)] px-3 text-[11.5px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────── the sheet ─────────────────────────── */

/**
 * Chrome reserves room for the spin buttons inside a number input, which pushes
 * right-aligned text left of the plain-text cells in the same column. Strip the
 * spinners so every numeric column lines up on the same edge.
 */
const noSpin =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0'

const cell = `h-[26px] w-full rounded-md border border-transparent bg-transparent px-2 text-right text-[12px] tabular-nums text-[#0b1220] outline-none transition hover:bg-[#eef2f7] focus:border-[#b6cef7] focus:bg-surface disabled:opacity-60 ${noSpin}`

/**
 * One continuous grid, laid out exactly like the source take-off sheet:
 * group band, work item, its measured spaces, then the item TOTAL. Everything
 * is on screen at once — the quantities are the whole point of the page, so
 * nothing is hidden behind a disclosure.
 */
export function MeasurementSheet({
  measurements,
  spaces = [],
  selectedSpaces = [],
  locked,
  onChange,
  onPickSpaces,
  onPushToBoq,
}) {
  const [spacesOpen, setSpacesOpen] = useState(false)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = []
    let group = null
    let section = null
    ;(measurements || []).forEach((it, idx) => {
      if (
        q &&
        !it.name.toLowerCase().includes(q) &&
        !it.group.toLowerCase().includes(q) &&
        !(it.sectionName || '').toLowerCase().includes(q)
      )
        return
      if (it.group !== group) {
        out.push({ kind: 'group', title: it.group, key: `g${idx}` })
        group = it.group
        section = null
      }
      if (it.sectionName && it.sectionName !== section) {
        out.push({
          kind: 'section',
          title: it.sectionName,
          no: it.sectionNo,
          key: `s${idx}`,
        })
        section = it.sectionName
      }
      out.push({ kind: 'item', it, idx, key: `i${idx}` })
    })
    return out
  }, [measurements, query])

  const grandRows = (measurements || []).reduce((s, i) => s + i.rows.length, 0)
  const linked = (measurements || []).filter((i) => i.boqRef?.index >= 0).length

  const setRow = (idx, i, key, value) => {
    const it = measurements[idx]
    onChange(idx, {
      ...it,
      rows: it.rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)),
    })
  }
  const addRow = (idx) => {
    const it = measurements[idx]
    onChange(idx, {
      ...it,
      rows: [
        ...it.rows,
        { space: '', unit: it.unit, nos: 1, length: 0, width: 0, qty: 0 },
      ],
    })
  }
  const removeRow = (idx, i) => {
    const it = measurements[idx]
    onChange(idx, { ...it, rows: it.rows.filter((_, k) => k !== i) })
  }

  if (!measurements?.length) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-[13px] text-[#8a98ac]">Loading the take-off sheet…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <datalist id="measure-spaces">
        {spaces.map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>

      {/* toolbar */}
      <div className="relative flex flex-wrap items-center gap-2 border-b border-[#e8eef5] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9aa7ba]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a work item…"
            className="h-8 w-[190px] rounded-lg border border-[#e4eaf3] bg-[#f7f9fc] pl-7 pr-2 text-[12px] outline-none focus:border-[#b6cef7] focus:bg-surface"
          />
        </div>
        <span className="text-[11.5px] text-[#8a98ac]">
          <b className="font-semibold tabular-nums text-[#0b1220]">
            {measurements.length}
          </b>{' '}
          items ·{' '}
          <b className="font-semibold tabular-nums text-[#0b1220]">{grandRows}</b>{' '}
          measurements ·{' '}
          <b className="font-semibold tabular-nums text-[#0b1220]">{linked}</b> feed
          the BOQ
        </span>

        <div className="relative ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSpacesOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4eaf3] bg-surface px-2.5 text-[12px] font-semibold text-[#5b6b80] transition hover:border-[#c7dbfb]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Spaces
            <span className="tabular-nums text-[#9aa7ba]">
              {selectedSpaces.length || spaces.length}
            </span>
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={onPushToBoq}
            title="Copy every item total into the BOQ quantities"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[12px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            Apply to BOQ
          </button>
          {spacesOpen ? (
            <SpacePopover
              spaces={spaces}
              selected={selectedSpaces.length ? selectedSpaces : spaces.map((s) => s.name)}
              onApply={(picked) => {
                onPickSpaces(picked)
                setSpacesOpen(false)
              }}
              onClose={() => setSpacesOpen(false)}
            />
          ) : null}
        </div>
      </div>

      {/* grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 z-[6]">
            <tr className="bg-[#f4f7fb] text-[10px] font-bold uppercase tracking-[0.08em] text-[#7c8ba0] [&>th]:border-b [&>th]:border-[#dbe3ee] [&>th]:px-2 [&>th]:py-1.5">
              <th className="w-14 text-left">S.No</th>
              <th className="text-left">Description</th>
              <th className="w-[76px] text-left">Units</th>
              <th className="w-[74px] text-right">No&apos;s</th>
              <th className="w-[74px] text-right">L</th>
              <th className="w-[74px] text-right">W</th>
              <th className="w-[104px] text-right">Qty</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === 'group') {
                return (
                  <tr key={r.key}>
                    {/* not sticky: several bands pinned to the same offset
                        stack on scroll and read as one black bar */}
                    <td
                      colSpan={8}
                      className="border-y border-[#0b1220] bg-[#0b1220] px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-[#f8fafc]"
                    >
                      {r.title}
                    </td>
                  </tr>
                )
              }
              if (r.kind === 'section') {
                return (
                  <tr key={r.key} className="bg-[#eef2f7]">
                    <td className="border-b border-[#dbe3ee] px-2 py-1 text-[11px] font-bold tabular-nums text-[#5b6b80]">
                      {r.no || ''}
                    </td>
                    <td
                      colSpan={7}
                      className="border-b border-[#dbe3ee] px-2 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#1e3a8a]"
                    >
                      {r.title}
                    </td>
                  </tr>
                )
              }

              const { it, idx } = r
              const summed = sumRows(it.rows)
              const total = itemTotal(it)
              const overridden =
                it.overrideTotal != null && it.overrideTotal !== ''

              return (
                <Fragment key={r.key}>
                  {/* work item */}
                  <tr className="bg-[#fbfcfe]">
                    <td className="border-b border-[#e8eef5] px-2 py-1.5 text-[11px] font-semibold tabular-nums text-[#7c8ba0]">
                      {it.no || ''}
                    </td>
                    <td
                      colSpan={2}
                      className="border-b border-[#e8eef5] px-2 py-1.5 text-[12.5px] font-bold text-[#0b1220]"
                    >
                      {it.name}
                      {it.boqRef?.index >= 0 ? (
                        <span
                          className="ml-2 text-[10.5px] font-normal text-[#9aa7ba]"
                          title={`Feeds BOQ line ${it.boqRef.slNo} ${it.boqRef.label}`}
                        >
                          → {it.boqRef.slNo || it.boqRef.label}
                        </span>
                      ) : (
                        <span className="ml-2 text-[10.5px] font-normal text-[#c2872f]">
                          not priced
                        </span>
                      )}
                    </td>
                    <td colSpan={4} className="border-b border-[#e8eef5]" />
                    <td className="border-b border-[#e8eef5] px-1 py-1.5">
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => addRow(idx)}
                          title={`Add a measurement to ${it.name}`}
                          className="rounded-md p-1 text-[#9aa7ba] transition hover:bg-[#eef2f7] hover:text-[var(--accent)]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* measured spaces */}
                  {it.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="group/mrow [&>td]:border-b [&>td]:border-[#f1f5f9]"
                    >
                      <td />
                      <td className="py-0.5 pl-5 pr-1">
                        <input
                          list="measure-spaces"
                          disabled={locked}
                          value={row.space || ''}
                          placeholder="Space"
                          onChange={(e) => setRow(idx, i, 'space', e.target.value)}
                          className="h-[26px] w-full rounded-md border border-transparent bg-transparent px-1.5 text-[12px] text-[#3d4a5c] outline-none transition hover:bg-[#eef2f7] focus:border-[#b6cef7] focus:bg-surface disabled:opacity-60"
                        />
                      </td>
                      <td className="px-2 py-0.5 text-[11.5px] text-[#8a98ac]">
                        {UNIT_LABEL[row.unit] || row.unit}
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="number"
                          step="any"
                          disabled={locked}
                          value={row.nos ?? ''}
                          onChange={(e) => setRow(idx, i, 'nos', e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="number"
                          step="any"
                          disabled={locked}
                          value={row.length ?? ''}
                          onChange={(e) => setRow(idx, i, 'length', e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          type="number"
                          step="any"
                          disabled={locked}
                          value={row.width ?? ''}
                          onChange={(e) => setRow(idx, i, 'width', e.target.value)}
                          className={cell}
                        />
                      </td>
                      <td className="px-2 py-0.5 text-right text-[12px] font-semibold tabular-nums text-[#0b1220]">
                        {nf(rowQty(row))}
                      </td>
                      <td className="px-1 py-0.5">
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => removeRow(idx, i)}
                            title="Remove measurement"
                            className="rounded-md p-1 text-[#c3cbd6] opacity-0 transition group-hover/mrow:opacity-100 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* item total */}
                  <tr className="[&>td]:border-b [&>td]:border-[#e8eef5]">
                    <td />
                    <td
                      colSpan={5}
                      className="px-2 py-1 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-[#5b6b80]"
                    >
                      Total
                      {/* A typed total that disagrees with the rows is not an
                          error — the source sheet does it for lump-sum work —
                          so say what the rows come to and offer it in a click. */}
                      {overridden ? (
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() =>
                            onChange(idx, { ...it, overrideTotal: null })
                          }
                          title={`These rows add up to ${nf(summed)}. Click to use that instead of the typed ${nf(total)}.`}
                          className="ml-2 inline-flex items-center gap-1 rounded-md border border-[#f0c9a0] bg-[#fff8f0] px-1.5 py-0.5 font-semibold normal-case tracking-normal text-[#a2620f] transition hover:bg-[#ffeeda] disabled:opacity-50"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          rows add to {nf(summed)}
                        </button>
                      ) : null}
                    </td>
                    {/* same padding as the Qty cells above so the figures
                        share one right edge */}
                    <td className="py-1">
                      <input
                        type="number"
                        step="any"
                        disabled={locked}
                        placeholder={nf(summed)}
                        value={it.overrideTotal ?? ''}
                        title="Leave blank to use the measured sum"
                        onChange={(e) =>
                          onChange(idx, {
                            ...it,
                            overrideTotal:
                              e.target.value === '' ? null : e.target.value,
                          })
                        }
                        className={cn(
                          'h-[26px] w-full rounded-md border px-2 text-right text-[12.5px] font-bold tabular-nums outline-none transition disabled:opacity-60',
                          noSpin,
                          overridden
                            ? 'border-[#f0c9a0] bg-[#fff8f0] text-[#a2620f]'
                            : 'border-transparent bg-transparent text-[#0b1220] placeholder:text-[#0b1220] hover:bg-[#eef2f7] focus:border-[#b6cef7] focus:bg-surface',
                        )}
                      />
                    </td>
                    <td />
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
