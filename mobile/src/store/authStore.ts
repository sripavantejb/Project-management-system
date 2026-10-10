import { Platform } from 'react-native'
import { create } from 'zustand'
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Tenant, User } from '../types/models'

/** zustand's persist expects a plain key/value async storage; SecureStore's
 * API matches getItem/setItem/removeItem closely enough to adapt directly.
 * SecureStore has no web implementation at all (every call rejects), so the
 * web build — used for local RN Web smoke-testing — falls back to
 * AsyncStorage, which on web is just a thin wrapper over localStorage. This
 * only affects the web target; native iOS/Android always get the Keychain /
 * Keystore-backed SecureStore. */
const secureStorage: StateStorage =
  Platform.OS === 'web'
    ? {
        getItem: (name) => AsyncStorage.getItem(name),
        setItem: (name, value) => AsyncStorage.setItem(name, value),
        removeItem: (name) => AsyncStorage.removeItem(name),
      }
    : {
        getItem: (name) => SecureStore.getItemAsync(name),
        setItem: (name, value) => SecureStore.setItemAsync(name, value),
        removeItem: (name) => SecureStore.deleteItemAsync(name),
      }

interface AuthState {
  user: User | null
  tenant: Tenant | null
  accessToken: string | null
  refreshToken: string | null
  /** Last company workspace typed at login. Kept after logout so the next sign-in can use another company. */
  lastWorkspace: string
  hasHydrated: boolean
  setAuth: (payload: { user: User; accessToken: string; refreshToken: string; tenant?: Tenant }) => void
  setUser: (user: User) => void
  setTenant: (tenant: Tenant) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      lastWorkspace: '',
      hasHydrated: false,
      setAuth: ({ user, accessToken, refreshToken, tenant }) =>
        set({
          user,
          accessToken,
          refreshToken,
          ...(tenant
            ? { tenant, lastWorkspace: tenant.slug || '' }
            : {}),
        }),
      setUser: (user) => set({ user }),
      setTenant: (tenant) => set({ tenant, lastWorkspace: tenant.slug || '' }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      logout: () =>
        set({ user: null, tenant: null, accessToken: null, refreshToken: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'cubic-auth',
      storage: createJSONStorage(() => secureStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)

/** Snapshot getters for the non-React axios interceptor (avoids hooks there). */
export const getAuthState = () => useAuthStore.getState()
