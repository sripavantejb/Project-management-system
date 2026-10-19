import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * First-launch product tour — distinct from `user.onboardingCompleted`
 * (server-tracked, shown post-login). This one is purely local/device-level
 * and gates the pre-auth walkthrough shown once right after the splash.
 */
interface IntroState {
  hasSeenIntro: boolean
  hasHydrated: boolean
  setHasSeenIntro: (v: boolean) => void
  setHasHydrated: (v: boolean) => void
}

export const useIntroStore = create<IntroState>()(
  persist(
    (set) => ({
      hasSeenIntro: false,
      hasHydrated: false,
      setHasSeenIntro: (v) => set({ hasSeenIntro: v }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'clyro-intro-tour',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ hasSeenIntro: s.hasSeenIntro }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
