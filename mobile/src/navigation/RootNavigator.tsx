import { useMemo, useState } from 'react'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { AuthNavigator } from './AuthNavigator'
import { AppNavigator } from './AppNavigator'
import { OnboardingScreen } from '../screens/OnboardingScreen'
import { IntroTourScreen } from '../screens/IntroTourScreen'
import { ForceChangePasswordScreen } from '../screens/ForceChangePasswordScreen'
import { SplashScreen, SPLASH_BG } from '../components/SplashScreen'
import { useColors, useThemeMode } from '../theme/useColors'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useIntroStore } from '../store/introStore'
import { useSessionRestore } from '../hooks/useSession'
import { TenantLockScreen, TenantNoticeBanner } from '../components/TenantNotice'

export function RootNavigator() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const tenant = useAuthStore((s) => s.tenant)
  const authHydrated = useAuthStore((s) => s.hasHydrated)
  const uiHydrated = useUiStore((s) => s.hasHydrated)
  const introHydrated = useIntroStore((s) => s.hasHydrated)
  const { isRestoring } = useSessionRestore()
  const colors = useColors()
  const mode = useThemeMode()
  const [splashDone, setSplashDone] = useState(false)
  const [tourDone, setTourDone] = useState(false)

  const bootReady = authHydrated && uiHydrated && introHydrated && !isRestoring
  const showSplash = !splashDone
  const isAuthedEarly = !!user && !!accessToken
  // Logo splash, then the editorial pages, then sign-in. A restored session
  // skips the pages and opens the studio.
  const showTour = !showSplash && bootReady && !isAuthedEarly && !tourDone

  const navTheme = useMemo(
    () => ({
      ...(mode === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
        background: colors.canvas,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        primary: colors.accent,
      },
    }),
    [colors, mode],
  )

  const isAuthed = !!user && !!accessToken
  const locked = isAuthed && !!tenant?.notice?.blocking

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: showSplash || showTour ? SPLASH_BG : colors.canvas,
      }}
    >
      {showSplash ? (
        <SplashScreen hold={!bootReady} onFinished={() => setSplashDone(true)} />
      ) : showTour ? (
        <IntroTourScreen onDone={() => setTourDone(true)} />
      ) : (
        <NavigationContainer theme={navTheme}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          {!isAuthed ? (
            <AuthNavigator />
          ) : locked ? (
            // Checked before anything else in the authed app: a frozen workspace
            // shouldn't be reachable via a password prompt or onboarding either.
            <TenantLockScreen />
          ) : user.mustChangePassword ? (
            <ForceChangePasswordScreen />
          ) : !user.onboardingCompleted ? (
            <OnboardingScreen />
          ) : (
            <>
              <TenantNoticeBanner />
              <AppNavigator />
            </>
          )}
        </NavigationContainer>
      )}
    </View>
  )
}
