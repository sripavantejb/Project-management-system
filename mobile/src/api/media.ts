import { http } from './client'
import { compressImageAsset, type UploadAsset } from '../lib/compressImage'

export interface StoredMedia {
  id: string
  url: string
  name: string
  mime: string
  size: number
}

export const mediaApi = {
  /**
   * Upload an image to GridFS and get back a stable `/api/media/:id` link.
   *
   * `imagesOnly=1` makes the server reject anything that isn't an image, so a
   * mis-picked PDF fails here rather than becoming someone's avatar.
   */
  uploadImage: async (file: UploadAsset) => {
    const asset = await compressImageAsset(file)

    const form = new FormData()
    form.append('file', {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || 'image/jpeg',
    } as unknown as Blob)

    return http
      .post<{ success: true } & StoredMedia>('/media?imagesOnly=1', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  /** Any file (PDF, CAD, image) for enquiry / project attachments. */
  uploadFile: async (file: UploadAsset) => {
    const form = new FormData()
    form.append('file', {
      uri: file.uri,
      name: file.name || 'file',
      type: file.mimeType || 'application/octet-stream',
    } as unknown as Blob)

    return http
      .post<{ success: true } & StoredMedia>('/media', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
}
