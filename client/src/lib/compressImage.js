/**
 * Whole-site upload compressor — images + PDFs before they leave the browser.
 *
 * Images: resize + JPEG/WebP-ish JPEG to cut phone camera dumps from many MB
 * to a few hundred KB. PDFs: rewrite via pdf-lib (drops unused objects).
 *
 * Best-effort: anything that fails returns the original file so uploads never
 * break because of compression.
 */

import { PDFDocument } from 'pdf-lib'

/** Long edge cap — plenty for site photos / BOQ refs on a laptop or tablet. */
const MAX_EDGE = 1920

/** Slightly more aggressive than before — still looks clean in-app. */
const QUALITY = 0.72

const SKIP_IMAGE_TYPES = new Set(['image/gif', 'image/svg+xml'])

const IMAGE_EXT_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

/** Drawing formats used in the Drawings folder. Never re-encode these. */
const CAD_MIME = {
  dwg: 'application/acad',
  dxf: 'application/dxf',
  dwf: 'model/vnd.dwf',
  dwt: 'application/acad',
  dws: 'application/acad',
  dgn: 'application/x-dgn',
  rvt: 'application/vnd.autodesk.revit',
  rfa: 'application/vnd.autodesk.revit',
  rte: 'application/vnd.autodesk.revit',
  ifc: 'application/x-step',
  skp: 'application/vnd.sketchup.skp',
  '3dm': 'application/x-3dm',
  plt: 'application/vnd.hp-hpgl',
  stl: 'model/stl',
  obj: 'model/obj',
  step: 'application/step',
  stp: 'application/step',
  iges: 'model/iges',
  igs: 'model/iges',
}

function fileExt(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

export function isCadFile(file) {
  return Object.prototype.hasOwnProperty.call(CAD_MIME, fileExt(file?.name))
}

/** Browsers often leave DWG/DXF type blank, or mislabel them as images. */
export function tagCadFile(file) {
  const mime = CAD_MIME[fileExt(file?.name)]
  if (!mime || !file) return file
  if (String(file.type || '').toLowerCase() === mime) return file
  try {
    return new File([file], file.name, {
      type: mime,
      lastModified: file.lastModified || Date.now(),
    })
  } catch {
    return file
  }
}

/**
 * Keep real photos even when the browser leaves `file.type` blank
 * (common for HEIC and some camera dumps). Returns null for non-images.
 */
export function asUploadableImage(file) {
  if (!file) return null
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/')) return file
  const ext = String(file.name || '').split('.').pop()?.toLowerCase()
  const mime = IMAGE_EXT_MIME[ext]
  if (!mime) return null
  try {
    return new File([file], file.name || `photo.${ext}`, {
      type: mime,
      lastModified: file.lastModified || Date.now(),
    })
  } catch {
    return file
  }
}

function isCompressibleImage(file) {
  if (isCadFile(file)) return false
  const type = String(file?.type || '').toLowerCase()
  return type.startsWith('image/') && !SKIP_IMAGE_TYPES.has(type)
}

function isPdf(file) {
  const type = String(file?.type || '').toLowerCase()
  const name = String(file?.name || '').toLowerCase()
  return type === 'application/pdf' || name.endsWith('.pdf')
}

function jpegName(name) {
  return String(name || 'image').replace(/\.[^.]+$/, '') + '.jpg'
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

export async function compressImageFile(file) {
  if (typeof window === 'undefined') return file
  if (!(file instanceof File) && !(file instanceof Blob)) return file
  if (!isCompressibleImage(file)) return file
  if (typeof createImageBitmap !== 'function') return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)

    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    if (!width || !height) return file

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    // Try a couple of qualities and keep the smallest that still beat the
    // original — large photos shrink a lot; already-small icons often don't.
    let best = null
    for (const q of [QUALITY, 0.62, 0.55]) {
      const blob = await canvasToBlob(canvas, q)
      if (!blob) continue
      if (!best || blob.size < best.size) best = blob
      if (blob.size < file.size * 0.35) break
    }
    if (!best || best.size >= file.size) return file

    return new File([best], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Rewrite a PDF through pdf-lib. Often trims a bit; never enlarges what we keep.
 */
export async function compressPdfFile(file) {
  if (typeof window === 'undefined') return file
  if (!(file instanceof File) && !(file instanceof Blob)) return file
  if (!isPdf(file)) return file
  // Tiny PDFs aren't worth the CPU; huge ones benefit most.
  if (file.size < 80_000) return file

  try {
    const bytes = await file.arrayBuffer()
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const page of pages) out.addPage(page)
    const saved = await out.save({ useObjectStreams: true })
    if (!saved?.length || saved.length >= file.size) return file
    const name = String(file.name || 'document.pdf').replace(/\.pdf$/i, '') + '.pdf'
    return new File([saved], name, {
      type: 'application/pdf',
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}

/** Compress any single uploadable File (image or PDF). */
export async function compressUploadFile(file) {
  if (!(file instanceof File) && !(file instanceof Blob)) return file
  if (isCompressibleImage(file)) return compressImageFile(file)
  if (isPdf(file)) return compressPdfFile(file)
  return file
}

/**
 * Rebuild FormData with every image/PDF entry compressed.
 * Returns the original instance when nothing changed.
 */
export async function compressFormDataImages(formData) {
  return compressFormDataUploads(formData)
}

export async function compressFormDataUploads(formData) {
  if (typeof FormData === 'undefined' || !(formData instanceof FormData)) {
    return formData
  }

  const entries = [...formData.entries()]
  const needsWork = entries.some(
    ([, value]) =>
      value instanceof File &&
      (isCadFile(value) || isCompressibleImage(value) || isPdf(value)),
  )
  if (!needsWork) return formData

  const next = new FormData()
  for (const [key, value] of entries) {
    if (!(value instanceof File)) {
      next.append(key, value)
      continue
    }
    const tagged = tagCadFile(value)
    next.append(key, isCadFile(tagged) ? tagged : await compressUploadFile(tagged))
  }
  return next
}
