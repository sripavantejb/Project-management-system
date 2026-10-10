import type { AxiosRequestConfig } from 'axios'
import { http } from './client'
import type { Tenant, User } from '../types/models'

export interface LoginPayload {
  email: string
  password: string
  /** Workspace slug typed on the login screen — overrides the build-time default tenant. */
  workspace?: string
}

export interface AuthResponse {
  success: true
  user: User
  accessToken: string
  refreshToken: string
  tenant: Tenant
}

export const authApi = {
  login: ({ workspace, ...body }: LoginPayload) => {
    const slug = workspace?.trim().toLowerCase()
    return http
      .post<AuthResponse>('/auth/login', body, {
        headers: slug ? { 'X-Tenant-Slug': slug } : undefined,
        tenantSlug: slug,
      } as AxiosRequestConfig & { tenantSlug?: string })
      .then((r) => r.data)
  },

  me: () => http.get<{ success: true; user: User; tenant: Tenant | null }>('/auth/me').then((r) => r.data),

  updateMe: (payload: Partial<Pick<User, 'name' | 'phone' | 'title' | 'avatar' | 'company' | 'onboardingCompleted'>>) =>
    http.patch<{ success: true; user: User }>('/auth/me', payload).then((r) => r.data),

  changePassword: (payload: { currentPassword?: string; password: string }) =>
    http.post<{ success: true; message: string }>('/auth/change-password', payload).then((r) => r.data),

  forgotPassword: (email: string) =>
    http.post<{ success: true; message: string; resetToken?: string }>('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (payload: { token: string; password: string }) =>
    http.post<{ success: true; message: string }>('/auth/reset-password', payload).then((r) => r.data),

  logout: (refreshToken: string | null) =>
    http.post<{ success: true }>('/auth/logout', { refreshToken }).then((r) => r.data),
}
