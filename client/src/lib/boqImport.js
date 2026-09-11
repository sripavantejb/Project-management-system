/**
 * Parse Excel/CSV grids into BOQ lines.
 *
 * Residential and commercial use the SAME material-master columns:
 * S.No. | Material Family | Material Name | Grade / Specification |
 * Thickness | Brand / Make | Size / Dimensions | Unit | Qty
 * (Rate / Amount optional)
 */

const UNITS = [
  { value: 'sheet', label: 'Sheet' },
  { value: 'sft', label: 'Sq.ft' },
  { value: 'rft', label: 'Rft' },
  { value: 'nos', label: "No's" },
  { value: 'ls', label: 'LS' },
  { value: 'load', label: 'Load' },
  { value: 'sqm', label: 'Sq.mtr' },
  { value: 'rmt', label: 'Rmtr' },
]

export const BOQ_UNITS = UNITS

export function unitLabel(unit) {
  return UNITS.find((u) => u.value === unit)?.label || unit
}

export function matchUnit(raw) {
  const key = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  if (!key) return null
  return (
    UNITS.find(
      (u) =>
        u.value === key || u.label.toLowerCase().replace(/[^a-z]/g, '') === key,
    )?.value || null
  )
}

export const MATERIAL_TEMPLATE_HEADERS = [
  'S.No.',
  'Material Family',
  'Material Name',
  'Grade / Specification',
  'Thickness',
  'Brand / Make',
  'Size / Dimensions',
  'Unit',
  'Qty',
]

/** Positional map when the user imports data rows only (no header). */
const TEMPLATE_MAP = {
  sno: 0,
  materialFamily: 1,
  materialName: 2,
  grade: 3,
  thickness: 4,
  brand: 5,
  dimensions: 6,
  unit: 7,
  qty: 8,
  rate: 9,
  amount: 10,
}

const TEMPLATE_MAP_NO_SNO = {
  materialFamily: 0,
  materialName: 1,
  grade: 2,
  thickness: 3,
  brand: 4,
  dimensions: 5,
  unit: 6,
  qty: 7,
  rate: 8,
  amount: 9,
}

/**
 * Longest / exact aliases first. Short tokens like "no" or "name" are never
 * used as substring matches — that was mapping S.No. → Qty and Name → Description.
 */
const FIELD_ALIASES = [
  ['materialFamily', ['materialfamily', 'family', 'materialgroup', 'group']],
  ['materialName', ['materialname', 'itemname']],
  ['grade', ['gradespecification', 'gradespec', 'specification', 'grade', 'spec']],
  ['thickness', ['thicknessmm', 'thickness', 'thk', 'thick']],
  ['brand', ['brandmake', 'makebrand', 'manufacturer', 'brand', 'make']],
  ['dimensions', ['sizedimensions', 'sheetsize', 'dimensions', 'dimension', 'size']],
  ['qty', ['quantities', 'quantity', 'qty']],
  ['unit', ['units', 'uom', 'unit']],
  ['rate', ['unitrate', 'unitprice', 'rate', 'price']],
  ['amount', ['lineamount', 'totalamount', 'amount', 'total']],
  ['description', ['description', 'particulars', 'particular', 'details']],
  ['room', ['location', 'section', 'category', 'room', 'area', 'space', 'zone']],
  ['sno', ['serialnumber', 'serialno', 'itemno', 'srno', 'slno', 'sno']],
]

const SKIP_ROW_RE =
  /material\s*master|clarity\s*edition|note\s*to\s*user|qty\s*=\s*0|complete interior hardware|brands are reference|approved make list|sub[\s-]?total/i

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function matchHeader(value) {
  const key = normalizeHeader(value)
  if (!key || /^\d+$/.test(key)) return null

  for (const [field, aliases] of FIELD_ALIASES) {
    if (aliases.includes(key)) return field
  }

  let best = null
  let bestLen = 0
  for (const [field, aliases] of FIELD_ALIASES) {
    for (const alias of aliases) {
      if (alias.length < 4) continue
      if (key.includes(alias) || (alias.length >= 6 && alias.includes(key))) {
        if (alias.length > bestLen) {
          best = field
          bestLen = alias.length
        }
      }
    }
  }
  return best
}

/** Collapses a description to a stable key for duplicate detection on import. */
export function normalizeForDedupe(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function cellText(row, map, field) {
  if (map[field] === undefined) return ''
  const raw = row[map[field]]
  if (raw == null) return ''
  return String(raw).replace(/\r\n/g, '\n').trim()
}

function filledCells(row) {
  return (row || []).filter((c) => String(c ?? '').trim() !== '')
}

function isTitleOrNoteRow(row) {
  const filled = filledCells(row)
  if (!filled.length) return true
  const text = filled.map((c) => String(c)).join(' ')
  if (SKIP_ROW_RE.test(text)) return true
  if (filled.length === 1 && String(filled[0]).length > 48) return true
  return false
}

function isSectionRow(row, map) {
  const filled = filledCells(row)
  if (filled.length !== 1) return false
  const text = String(filled[0]).trim()
  if (SKIP_ROW_RE.test(text)) return false
  if (text.length > 48) return false
  if (map.qty !== undefined && toNumber(row[map.qty])) return false
  if (map.materialName !== undefined && cellText(row, map, 'materialName')) {
    return false
  }
  return /^[A-Z0-9][A-Z0-9 /&+–—-]*$/.test(text) || /joinery|interior|hardware|finishes|electrical/i.test(text)
}

function looksNumericSno(value) {
  const s = String(value ?? '').trim()
  return /^\d+(\.0+)?$/.test(s)
}

function inferPositionalMap(rows) {
  for (const row of rows) {
    const filled = filledCells(row)
    if (filled.length < 4) continue
    if (isTitleOrNoteRow(row)) continue
    const first = row[0]
    const width = row.length
    if (looksNumericSno(first) && width >= 8) return { ...TEMPLATE_MAP }
    if (!looksNumericSno(first) && width >= 7) return { ...TEMPLATE_MAP_NO_SNO }
  }
  return { ...TEMPLATE_MAP }
}

function findHeader(grid) {
  const limit = Math.min(grid.length, 40)
  for (let r = 0; r < limit; r += 1) {
    const map = {}
    ;(grid[r] || []).forEach((cell, c) => {
      const field = matchHeader(cell)
      if (field && map[field] === undefined) map[field] = c
    })
    const materialHits = [
      'materialFamily',
      'materialName',
      'grade',
      'thickness',
      'brand',
      'dimensions',
    ].filter((f) => map[f] !== undefined).length
    if (materialHits >= 3) {
      return { headerRow: r, columnMap: map, kind: 'material' }
    }
    /**
     * A serial-number column does NOT make this a material-template header —
     * that check already happened above and failed. Client quotation sheets
     * (S.No / Description / Unit / Dimensions / Qty / Rate / Amount) commonly
     * have both an sno column and a description column; excluding sno here
     * used to push those sheets into the positional material-template guess,
     * silently shifting every column (rate → qty, amount → rate, ...).
     */
    if (
      Object.keys(map).length >= 2 &&
      (map.description !== undefined || map.qty !== undefined)
    ) {
      return { headerRow: r, columnMap: map, kind: 'general' }
    }
  }
  return null
}

function composeDescription(line) {
  if (line.description) return line.description
  return [line.materialName, line.grade, line.thickness, line.brand, line.dimensions]
    .filter(Boolean)
    .join(' · ')
}

function lineFromRow(row, columnMap, lastRoom, uid) {
  const materialFamily = cellText(row, columnMap, 'materialFamily')
  const materialName = cellText(row, columnMap, 'materialName')
  const grade = cellText(row, columnMap, 'grade')
  const thickness = cellText(row, columnMap, 'thickness')
  const brand = cellText(row, columnMap, 'brand')
  const dimensions = cellText(row, columnMap, 'dimensions')
  const description = cellText(row, columnMap, 'description')
  const qty = columnMap.qty !== undefined ? toNumber(row[columnMap.qty]) : 0
  const rate = columnMap.rate !== undefined ? toNumber(row[columnMap.rate]) : 0
  const amount = columnMap.amount !== undefined ? toNumber(row[columnMap.amount]) : 0
  const roomCell = cellText(row, columnMap, 'room')
  const unitRaw = cellText(row, columnMap, 'unit')

  const hasMaterial = Boolean(
    materialFamily || materialName || grade || thickness || brand || dimensions,
  )

  /**
   * A row with nothing but an amount — no description, no qty, no rate — is
   * never a real line item (there'd be nothing to show or price). It's a
   * section-total artifact that repeats the section's own name instead of
   * saying "SUBTOTAL" (which the text-based skip above already catches), so
   * this is a second, structural net to keep those numbers out of the total.
   */
  if (!hasMaterial && !description && !qty && !rate) {
    return { skip: true, room: roomCell || lastRoom }
  }

  return {
    skip: false,
    line: {
      _key: uid(),
      room: roomCell || lastRoom || 'INTERIOR / JOINERY',
      materialFamily,
      materialName,
      grade,
      thickness,
      brand,
      dimensions,
      description:
        description ||
        composeDescription({
          materialName,
          grade,
          thickness,
          brand,
          dimensions,
        }) ||
        'Imported line',
      unit: matchUnit(unitRaw) || (hasMaterial ? 'sheet' : 'nos'),
      qty: qty || (amount && rate ? amount / rate : 0),
      rate: rate || (amount && qty ? amount / qty : 0),
      /**
       * Only derive Amount from Qty × Rate when the sheet has no Amount
       * column at all. When it does have one and a specific row's cell is
       * blank, that's the source explicitly leaving the line unpriced (e.g.
       * a "pending confirmation" section) — silently pricing it here would
       * add cost the sheet's own author chose to leave out of the total.
       */
      amount: columnMap.amount !== undefined ? amount : amount || qty * rate,
      image: '',
    },
  }
}

/**
 * @param {any[][]} grid  sheet_to_json(..., { header: 1 })
 * @param {{ uid?: () => string, defaultRoom?: string }} [opts]
 */
export function rowsToBoqLines(grid, opts = {}) {
  const uid = opts.uid || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const defaultRoom = opts.defaultRoom || 'INTERIOR / JOINERY'
  if (!Array.isArray(grid) || !grid.length) return []

  const found = findHeader(grid)
  let headerRow = found ? found.headerRow : -1
  let columnMap = found ? found.columnMap : inferPositionalMap(grid)

  const lines = []
  let lastRoom = defaultRoom
  let lastDescription = ''
  const start = headerRow + 1

  for (let r = start; r < grid.length; r += 1) {
    const row = grid[r] || []
    if (!filledCells(row).length) continue

    /**
     * The trailing "Notes:" block (terms, GST/handling %, sub/grand totals)
     * is not part of the line-item table — everything from here to the end
     * of the sheet gets ignored. Without this, numbers like the handling
     * charge or the pre-GST total get misread as a Rate on a fake row.
     */
    const firstCell = normalizeHeader(filledCells(row)[0])
    if (firstCell === 'notes') break

    if (isTitleOrNoteRow(row) && !cellText(row, columnMap, 'materialName')) continue

    if (isSectionRow(row, columnMap)) {
      lastRoom = String(filledCells(row)[0]).trim()
      continue
    }

    const description = cellText(row, columnMap, 'description')
    const materialName = cellText(row, columnMap, 'materialName')
    const qty = columnMap.qty !== undefined ? toNumber(row[columnMap.qty]) : 0
    const rate = columnMap.rate !== undefined ? toNumber(row[columnMap.rate]) : 0
    const amount = columnMap.amount !== undefined ? toNumber(row[columnMap.amount]) : 0
    const roomCell = cellText(row, columnMap, 'room')

    if (
      (description || materialName) &&
      !qty &&
      !rate &&
      !amount &&
      !roomCell &&
      !cellText(row, columnMap, 'materialFamily') &&
      !cellText(row, columnMap, 'thickness') &&
      !cellText(row, columnMap, 'brand')
    ) {
      lastRoom = description || materialName
      continue
    }

    const parsed = lineFromRow(row, columnMap, lastRoom, uid)
    if (parsed.skip) {
      if (parsed.room) lastRoom = parsed.room
      continue
    }

    /**
     * A merged "Dimensions" header (No's / W / H-L) produces continuation
     * rows with no real description — just a leftover measurement number in
     * whichever sub-column lines up with a mapped field. Rather than a line
     * item named "6", carry the previous row's description forward: it's
     * almost always another dimension set for the same item.
     */
    if (/^\d+(\.\d+)?$/.test(parsed.line.description.trim())) {
      if (lastDescription) parsed.line.description = lastDescription
    } else {
      lastDescription = parsed.line.description
    }

    lastRoom = parsed.line.room
    lines.push(parsed.line)
  }

  return lines
}

export function materialMasterAoa(items = []) {
  const header = [...MATERIAL_TEMPLATE_HEADERS]
  const aoa = [
    ['RESIDENTIAL & COMMERCIAL MATERIAL MASTER'],
    ['CLARITY EDITION — COMPLETE INTERIOR HARDWARE INCLUDED'],
    [
      'Qty = 0 intentionally: enter project-specific quantity after BOQ/drawing take-off. Brands are reference makes and must be checked against the project\'s approved make list.',
    ],
    [],
    header,
  ]
  let lastRoom = null
  items.forEach((it, i) => {
    const room = it.room?.trim() || 'INTERIOR / JOINERY'
    if (room !== lastRoom) {
      aoa.push([room])
      lastRoom = room
    }
    aoa.push([
      i + 1,
      it.materialFamily || '',
      it.materialName || '',
      it.grade || '',
      it.thickness || '',
      it.brand || '',
      it.dimensions || '',
      unitLabel(it.unit) || it.unit || 'Sheet',
      Number(it.qty) || 0,
    ])
  })
  return aoa
}
