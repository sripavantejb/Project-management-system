import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'

export interface UploadAsset {
  uri: string
  name: string
  mimeType?: string
}

/**
 * Long edge, in pixels, that an uploaded photo is capped at.
 *
 * A modern phone camera produces roughly 4000px wide files of 3–8MB. Nothing in
 * the app displays an image larger than a tablet screen, and 2560px still lets
 * someone pinch into a site photo to read a label or check a finish. Beyond that
 * we would be storing detail nobody ever sees — on an Atlas free tier shared
 * with every other collection.
 */
const MAX_EDGE = 1920

/** Still looks clean on phone/tablet; much smaller than camera originals. */
const QUALITY = 0.72

/**
 * Formats we deliberately leave alone.
 *
 * GIFs would lose their animation, and SVGs are vector text that re-encoding
 * would rasterise — both would come out worse and, for SVG, much larger.
 */
const SKIP_TYPES = ['image/gif', 'image/svg+xml']

const CAD_EXT = /\.(dwg|dxf|dwf|dwt|dws|dgn|rvt|rfa|rte|ifc|skp|3dm|plt)$/i

function isCompressibleImage(mimeType?: string, name?: string) {
  if (CAD_EXT.test(name || '')) return false
  const mime = String(mimeType || '').toLowerCase()
  if (/acad|autocad|dwg|dxf/.test(mime)) return false
  if (!mime.startsWith('image/')) return false
  return !SKIP_TYPES.includes(mime)
}

/** Byte size of a local file, or null when it can't be read. */
function fileSize(uri: string): number | null {
  try {
    return new File(uri).size ?? null
  } catch {
    return null
  }
}

/** `photo.HEIC` → `photo.jpg`, since the bytes we upload are now JPEG. */
function jpegName(name: string) {
  return name.replace(/\.[^.]+$/, '') + '.jpg'
}

/**
 * Shrink a picked image before it goes up the wire.
 *
 * Runs on the device, so a poor site connection uploads the small file rather
 * than the large one — which is the slow part of the round trip, not the
 * encoding.
 *
 * Compression is best-effort by design: an unreadable or exotic file, or a
 * manipulator that throws, returns the original asset untouched. Failing to
 * make a file smaller must never mean failing to upload it.
 */
export async function compressImageAsset(asset: UploadAsset): Promise<UploadAsset> {
  if (!isCompressibleImage(asset.mimeType, asset.name)) return asset

  try {
    const before = fileSize(asset.uri)

    const context = ImageManipulator.manipulate(asset.uri)
    const rendered = await context.renderAsync()

    // Only scale down. Enlarging a small image would add bytes, not save them.
    const longEdge = Math.max(rendered.width, rendered.height)
    if (longEdge > MAX_EDGE) {
      const portrait = rendered.height >= rendered.width
      context.resize(portrait ? { height: MAX_EDGE } : { width: MAX_EDGE })
    }

    const output = await (await context.renderAsync()).saveAsync({
      compress: QUALITY,
      format: SaveFormat.JPEG,
    })

    // Already-optimised files can come out bigger after a re-encode. When that
    // happens the original is the better upload.
    const after = fileSize(output.uri)
    if (before != null && after != null && after >= before) return asset

    return { uri: output.uri, name: jpegName(asset.name), mimeType: 'image/jpeg' }
  } catch {
    return asset
  }
}
