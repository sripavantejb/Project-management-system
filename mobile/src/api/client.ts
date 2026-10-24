import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { API_URL, TENANT_SLUG } from '../constants/env'
import { getAuthState } from '../store/authStore'
import type { ApiError } from '../types/models'

type TenantRequest = InternalAxiosRequestConfig & { tenantSlug?: string }

function headerSlug(headers: InternalAxiosRequestConfig['headers']): string {
  if (!headers) return ''
  const raw =
    typeof (headers as AxiosHeaders).get === 'function'
      ? (headers as AxiosHeaders).get('X-Tenant-Slug')
      : (headers as Record<string, unknown>)['X-Tenant-Slug']
  return String(Array.isArray(raw) ? raw[0] : raw || '')
    .trim()
    .toLowerCase()
}

/**
 * Which company this call belongs to.
 * The workspace typed on the login screen wins, so a company created in
 * platform admin can sign in the same way as on the website. After that,
 * every call uses the company that actually signed in. The build-time slug
 * is only a fallback when nothing else is known.
 */
export function resolveTenantSlug(explicit?: string | null): string {
  const typed = String(explicit || '').trim().toLowerCase()
  if (typed) return typed
  const signedIn = String(getAuthState().tenant?.slug || '').trim().toLowerCase()
  if (signedIn) return signedIn
  const remembered = String(getAuthState().lastWorkspace || '').trim().toLowerCase()
  if (remembered) return remembered
  return TENANT_SLUG
}

export const http = axios.create({
  baseURL: API_URL,
  // Fail fast so a stuck request cannot freeze chat / screens for 20s.
  timeout: 12000,
})

http.interceptors.request.use((config) => {
  const request = config as TenantRequest
  config.headers = config.headers ?? new AxiosHeaders()
  const explicit = request.tenantSlug || headerSlug(config.headers)
  config.headers.set('X-Tenant-Slug', resolveTenantSlug(explicit))
  const { accessToken } = getAuthState()
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return config
})

/**
 * Single-flight token refresh — mirrors the web client. When the access
 * token expires, several screens' queries can 401 within the same tick;
 * they must all await ONE refresh call instead of racing separate ones,
 * otherwise the second request presents an already-rotated refresh token
 * and the server rejects it.
 */
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { refreshToken, setTokens, logout } = getAuthState()
    if (!refreshToken) return null
    try {
      const res = await axios.post(
        `${API_URL}/auth/refresh`,
        { refreshToken },
        { headers: { 'X-Tenant-Slug': resolveTenantSlug() } },
      )
      const { accessToken, refreshToken: newRefresh } = res.data
      setTokens(accessToken, newRefresh)
      return accessToken as string
    } catch (err) {
      const status = (err as AxiosError)?.response?.status
      // Only end the session on an explicit rejection — a network hiccup or
      // 5xx during a server restart shouldn't log the user out.
      if (status === 401 || status === 403) logout()
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string }>) => {
    const original = error.config
    if (error.response?.status === 401 && original && !(original as any)._retried) {
      const { refreshToken } = getAuthState()
      if (refreshToken) {
        ;(original as any)._retried = true
        const newToken = await refreshAccessToken()
        if (newToken) {
          original.headers = original.headers ?? {}
          ;(original.headers as any).Authorization = `Bearer ${newToken}`
          return http(original)
        }
      }
    }

    const apiError: ApiError = {
      status: error.response?.status,
      message:
        error.response?.data?.message ||
        (error.code === 'ECONNABORTED'
          ? 'Request timed out. Check your connection and try again.'
          : error.message === 'Network Error'
            ? 'Cannot reach the server. Check your connection.'
            : 'Something went wrong. Please try again.'),
      data: error.response?.data,
    }
    return Promise.reject(apiError)
  },
)

export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'message' in err
}
