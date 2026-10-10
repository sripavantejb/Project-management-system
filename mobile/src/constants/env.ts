import { Platform } from 'react-native'
import Constants from 'expo-constants'

const API_PORT = 5000

/**
 * The server binds to a real port; Android's emulator and iOS's simulator
 * each resolve "the host machine" differently, and a physical device (Expo
 * Go / dev client) can only reach the host via its LAN IP. Try, in order:
 *
 * 1. EXPO_PUBLIC_API_URL — explicit override (staging/prod, or a physical
 *    device where you've pinned the host IP yourself).
 * 2. The Metro dev server host (Constants.expoConfig.hostUri) — this is the
 *    LAN IP Expo already used to reach *this* JS bundle, so it's correct for
 *    a physical device or an Android emulator/simulator without extra setup.
 * 3. Platform-specific localhost aliases as a last resort.
 */
function resolveApiOrigin(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')

  const hostUri =
    Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri
  if (hostUri) {
    const host = hostUri.split(':')[0]
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${API_PORT}`
    }
  }

  if (Platform.OS === 'android') return `http://10.0.2.2:${API_PORT}`
  return `http://localhost:${API_PORT}`
}

export const API_ORIGIN = resolveApiOrigin()
export const API_URL = `${API_ORIGIN}/api`
/**
 * Used only when no workspace was typed and nobody is signed in.
 * Login itself sends the company name from the screen, same as the website.
 */
export const TENANT_SLUG = (process.env.EXPO_PUBLIC_TENANT_SLUG || '').trim().toLowerCase()

/** Resolve a stored `/uploads/...` path to a full URL against the API host. */
export function assetUrl(url?: string | null): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  const path = url.startsWith('/') ? url : `/${url}`
  return `${API_ORIGIN}${path}`
}
