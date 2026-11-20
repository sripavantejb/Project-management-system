import { http } from './client'
import type { Lead, LeadAttachment, Quotation } from '../types/ops'
import type { Project } from '../types/models'

export interface CreateLeadPayload {
  clientName: string
  contactName?: string
  email?: string
  phone?: string
  source?: string
  estimatedValue?: number
  notes?: string
  owner?: string
  attachments?: LeadAttachment[]
}

export const leadsApi = {
  list: () => http.get<{ success: true; leads: Lead[] }>('/leads').then((r) => r.data.leads),

  get: async (id: string) => {
    const leads = await http.get<{ success: true; leads: Lead[] }>('/leads').then((r) => r.data.leads)
    const lead = leads.find((l) => l._id === id)
    if (!lead) throw new Error('Enquiry not found')
    return lead
  },

  create: (payload: CreateLeadPayload) =>
    http.post<{ success: true; lead: Lead }>('/leads', payload).then((r) => r.data.lead),

  update: (id: string, payload: Omit<Partial<Lead>, 'owner' | 'stage'> & { owner?: string | null; stage?: Lead['stage'] }) =>
    http.patch<{ success: true; lead: Lead }>(`/leads/${id}`, payload).then((r) => r.data.lead),

  convert: (id: string) =>
    http
      .post<{ success: true; project: Project; quotation: Quotation }>(`/leads/${id}/convert`)
      .then((r) => r.data),

  remove: (id: string) => http.delete<{ success: true }>(`/leads/${id}`).then((r) => r.data),

  addAttachment: (id: string, file: { uri: string; name?: string; mimeType?: string }) => {
    const form = new FormData()
    form.append('file', {
      uri: file.uri,
      name: file.name || 'file',
      type: file.mimeType || 'application/octet-stream',
    } as unknown as Blob)
    return http
      .post<{ success: true; lead: Lead; attachment: LeadAttachment }>(`/leads/${id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  removeAttachment: (id: string, attachmentId: string) =>
    http
      .delete<{ success: true; lead: Lead }>(`/leads/${id}/attachments/${attachmentId}`)
      .then((r) => r.data.lead),
}
