import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { compressFormDataUploads } from './compressImage'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const RESERVED_SUBS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'static',
  'assets',
])

/**
 * Workspace slug for X-Tenant-Slug:
 * 1) ?tenant= / localStorage override
 * 2) subdomain (acme.editcomedia.com)
 * 3) VITE_TENANT_SLUG / "cubic"
 */
export function getTenantSlug() {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get('tenant')?.trim().toLowerCase()
    if (fromQuery) {
      localStorage.setItem('cubic-tenant-slug', fromQuery)
      return fromQuery
    }
    const stored = localStorage.getItem('cubic-tenant-slug')?.trim().toLowerCase()
    if (stored) return stored

    const host = window.location.hostname.toLowerCase()
    if (host && host !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split('.')
      if (parts.length >= 3) {
        const sub = parts[0]
        if (!RESERVED_SUBS.has(sub)) return sub
      }
    }
  }
  return (import.meta.env.VITE_TENANT_SLUG || 'cubic').toLowerCase()
}

export function setTenantSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
  if (s) localStorage.setItem('cubic-tenant-slug', s)
  else localStorage.removeItem('cubic-tenant-slug')
}

/**
 * Public app origin for shareable login links.
 * Prefer VITE_PUBLIC_APP_URL so localhost platform creates still copy the live URL.
 */
export function publicAppOrigin() {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** Company login link with workspace (+ optional admin portal). */
export function companyLoginUrl(workspace, portal = 'staff') {
  const origin = publicAppOrigin()
  const slug = String(workspace || getTenantSlug() || 'cubic')
    .trim()
    .toLowerCase()
  const params = new URLSearchParams()
  if (portal === 'admin') params.set('portal', 'admin')
  params.set('tenant', slug)
  return `${origin}/login?${params.toString()}`
}

/** Origin of the API host (no trailing slash), e.g. https://project-management-backend-nine-tau.vercel.app */
export function apiOrigin() {
  const raw = (import.meta.env.VITE_API_URL || '').trim()
  if (!raw || raw.startsWith('/')) {
    if (typeof window !== 'undefined') return window.location.origin
    return ''
  }
  try {
    const u = new URL(raw)
    return u.origin
  } catch {
    return raw.replace(/\/api\/?$/, '')
  }
}

/**
 * Resolve asset URLs so they hit the API host when the SPA is on another origin.
 * Supports MongoDB media links (/api/media/:id) and legacy /uploads/...
 */
export function assetUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  const path = url.startsWith('/') ? url : `/${url}`
  const origin = apiOrigin()
  // /api/media is already under the API — when VITE_API_URL is absolute, prefix origin
  if (path.startsWith('/api/media')) {
    if (origin && !API_URL.startsWith('/')) {
      return `${origin}${path}`
    }
    return path
  }
  return origin ? `${origin}${path}` : path
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      tenant: null,
      // Set the moment any request comes back 403 TENANT_BLOCKED (workspace
      // suspended/cancelled), cleared the moment any request succeeds again —
      // a transient runtime signal, not saved state, so it never persists.
      tenantBlocked: null,
      setTenantBlocked: (payload) => set({ tenantBlocked: payload }),
      setAuth: ({ user, accessToken, refreshToken, tenant }) => {
        if (tenant?.slug) {
          try {
            setTenantSlug(tenant.slug)
          } catch {
            /* ignore */
          }
        }
        set({
          user,
          accessToken,
          refreshToken,
          ...(tenant !== undefined ? { tenant } : {}),
        })
      },
      setUser: (user) => set({ user }),
      setTenant: (tenant) => {
        if (tenant?.slug) {
          try {
            setTenantSlug(tenant.slug)
          } catch {
            /* ignore */
          }
        }
        set({ tenant })
      },
      logout: () => {
        try {
          // Dynamic to avoid circular import at module load
          import('./socket.js').then((m) => m.disconnectSocket()).catch(() => {})
        } catch {
          /* ignore */
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          tenant: null,
          tenantBlocked: null,
        })
      },
      getAccessToken: () => get().accessToken,
    }),
    {
      name: 'cubic-auth',
      // tenantBlocked is a live signal from the last request, not durable
      // state — persisting it would show a stale lock screen (or hide a real
      // one) until the next request happens to disagree with it.
      partialize: (state) => {
        const { tenantBlocked, ...rest } = state
        return rest
      },
    },
  ),
)

function tenantHeaders() {
  // Prefer the logged-in workspace from auth state so a stale localStorage /
  // VITE_TENANT_SLUG default (often "cubic") cannot 403 every API call.
  const fromAuth = useAuthStore.getState().tenant?.slug
  const slug = String(fromAuth || getTenantSlug() || 'cubic')
    .trim()
    .toLowerCase()
  return { 'X-Tenant-Slug': slug }
}

/**
 * Single-flight token refresh. When the access token expires, many queries
 * fail with 401 at the same time — they must all share ONE refresh call,
 * otherwise the second call sends an already-rotated token and the server
 * rejects it, which used to log the user out.
 */
let refreshInFlight = null

function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { refreshToken, setAuth, logout } = useAuthStore.getState()
    if (!refreshToken) return null
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...tenantHeaders(),
        },
        body: JSON.stringify({ refreshToken }),
      })
      if (res.ok) {
        const data = await res.json()
        setAuth({
          user: useAuthStore.getState().user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tenant: useAuthStore.getState().tenant,
        })
        try {
          const { syncSocketAuth } = await import('./socket.js')
          syncSocketAuth()
        } catch {
          /* ignore */
        }
        return data.accessToken
      }
      // Only end the session when the server explicitly rejects the token.
      // Transient failures (5xx, server restarting) should not log out.
      if (res.status === 401 || res.status === 403) logout()
      return null
    } catch {
      // Network hiccup — keep the session, the next request will retry.
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

// Vercel's serverless functions cap a request body at ~4.5MB — a platform
// limit no server config can raise. Rather than add a non-Mongo storage
// service, anything still over CHUNK_THRESHOLD after compression gets sliced
// into CHUNK_SIZE pieces and reassembled server-side in MongoDB (see
// POST /media/chunk[/finish] and middleware/chunkedUpload.js).
const CHUNK_THRESHOLD = 4 * 1024 * 1024
const CHUNK_SIZE = 3 * 1024 * 1024

function makeUploadId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function uploadFileInChunks(file) {
  const uploadId = makeUploadId()
  const total = Math.ceil(file.size / CHUNK_SIZE) || 1

  for (let i = 0; i < total; i++) {
    const slice = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    const fd = new FormData()
    fd.append('chunk', slice, file.name)
    fd.append('uploadId', uploadId)
    fd.append('index', String(i))
    // Sequential on purpose: chunks are a few MB each, and the server has to
    // see all `total` of them before it will reassemble anything.
    // eslint-disable-next-line no-await-in-loop
    await api('/media/chunk', { method: 'POST', body: fd })
  }

  const { pendingId } = await api('/media/chunk/finish', {
    method: 'POST',
    body: JSON.stringify({ uploadId, filename: file.name, mimeType: file.type, total }),
    headers: { 'Content-Type': 'application/json' },
  })
  return pendingId
}

/**
 * Swap any FormData file bigger than CHUNK_THRESHOLD for a `<field>PendingId`
 * once it's been chunk-uploaded, so every existing upload call site (they all
 * go through `api()`) gets large-file support with no changes of its own.
 */
async function uploadOversizedFields(formData) {
  const entries = [...formData.entries()]
  const hasOversized = entries.some(
    ([, value]) => value instanceof File && value.size > CHUNK_THRESHOLD,
  )
  if (!hasOversized) return formData

  const next = new FormData()
  for (const [key, value] of entries) {
    if (value instanceof File && value.size > CHUNK_THRESHOLD) {
      const pendingId = await uploadFileInChunks(value)
      next.append(`${key}PendingId`, pendingId)
    } else {
      next.append(key, value)
    }
  }
  return next
}

export async function api(path, options = {}) {
  const { accessToken, refreshToken } = useAuthStore.getState()
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  const headers = {
    ...tenantHeaders(),
    ...(options.headers || {}),
  }
  // Let the browser set multipart boundary for FormData
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  // Shrink images once, here, so every upload in the app benefits without each
  // call site remembering to. Non-image parts are passed through untouched, and
  // a failed compression falls back to the original file.
  let body = isFormData ? await compressFormDataUploads(options.body) : options.body
  // Whatever's still too big for one request (videos, large PDFs, etc.) goes
  // through chunked upload instead of failing outright.
  if (isFormData) body = await uploadOversizedFields(body)
  const requestInit = { ...options, body, headers }

  let res = await fetch(`${API_URL}${path}`, requestInit)

  if (res.status === 401 && refreshToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`
      res = await fetch(`${API_URL}${path}`, requestInit)
    }
  }

  const data = await res.json().catch(() => ({}))

  // The workspace was suspended/cancelled — every request now 403s with this
  // code (server: middleware/tenant.js). Flip the lock screen on immediately
  // rather than let it surface as a confusing one-off error on whatever the
  // user happened to be doing.
  if (!res.ok && data.code === 'TENANT_BLOCKED') {
    useAuthStore.getState().setTenantBlocked({ message: data.message })
  } else if (res.ok && useAuthStore.getState().tenantBlocked) {
    // Any successful call after that means access was restored — self-heal
    // without requiring a manual sign-out/sign-in.
    useAuthStore.getState().setTenantBlocked(null)
  }

  if (!res.ok) {
    const err = new Error(data.message || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}
