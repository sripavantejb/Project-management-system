import sharp from 'sharp'

/**
 * Compress images (and leave other MIME types alone) before GridFS storage.
 * Client already shrinks photos; this is the safety net for mobile / direct API uploads.
 */
const MAX_EDGE = 1920
const JPEG_QUALITY = 78
const PNG_QUALITY = 80

const SKIP = new Set(['image/gif', 'image/svg+xml', 'image/x-icon'])

const CAD_EXT = /\.(dwg|dxf|dwf|dwt|dws|dgn|rvt|rfa|rte|ifc|skp|3dm|plt|stl|obj|step|stp|iges|igs)$/i

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

function cadMime(file) {
  const name = String(file?.originalname || '')
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext && CAD_MIME[ext]) return CAD_MIME[ext]
  const mime = String(file?.mimetype || '').toLowerCase()
  if (
    mime === 'application/acad' ||
    mime === 'application/x-acad' ||
    mime === 'application/autocad_dwg' ||
    mime === 'image/vnd.dwg' ||
    mime === 'image/x-dwg' ||
    mime === 'application/dxf' ||
    mime === 'image/vnd.dxf'
  ) {
    return 'application/acad'
  }
  return ''
}

export async function compressUploadBuffer(file) {
  if (!file?.buffer) return file
  // Windows often labels DWG as image/vnd.dwg. Sharp must not turn that into a JPEG.
  const drawingMime = cadMime(file)
  if (drawingMime || CAD_EXT.test(String(file.originalname || ''))) {
    return { ...file, mimetype: drawingMime || file.mimetype || 'application/acad' }
  }
  const mime = String(file.mimetype || '').toLowerCase()
  if (!mime.startsWith('image/') || SKIP.has(mime)) return file

  try {
    let pipeline = sharp(file.buffer, { failOn: 'none' }).rotate()
    const meta = await pipeline.metadata()
    const w = meta.width || 0
    const h = meta.height || 0
    const longEdge = Math.max(w, h)
    if (longEdge > MAX_EDGE) {
      pipeline = pipeline.resize({
        width: w >= h ? MAX_EDGE : undefined,
        height: h > w ? MAX_EDGE : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    // Prefer JPEG for photos; keep PNG only when the source needs alpha.
    const wantsAlpha = Boolean(meta.hasAlpha) && mime === 'image/png'
    let out
    let outMime
    let outName = file.originalname || 'image'

    if (wantsAlpha) {
      out = await pipeline.png({ quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer()
      outMime = 'image/png'
    } else {
      out = await pipeline
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer()
      outMime = 'image/jpeg'
      outName = String(outName).replace(/\.[^.]+$/, '') + '.jpg'
    }

    if (!out?.length || out.length >= file.buffer.length) return file

    return {
      ...file,
      buffer: out,
      size: out.length,
      mimetype: outMime,
      originalname: outName,
    }
  } catch {
    return file
  }
}
