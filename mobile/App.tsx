import 'react-native-gesture-handler'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RootNavigator } from './src/navigation/RootNavigator'
import { LiveToastHost } from './src/components/LiveToast'
import { useColors } from './src/theme/useColors'

/** Keep Expo web inside the device frame — no document rubber-band / page scroll. */
function useLockWebDocumentScroll() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const style = document.createElement('style')
    style.setAttribute('data-cubic-lock-scroll', 'true')
    style.textContent = `
      html, body, #root {
        height: 100%;
        max-height: 100%;
        overflow: hidden;
        overscroll-behavior: none;
      }
    `
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

function ThemedAppShell({ children }: { children: React.ReactNode }) {
  const colors = useColors()
  useLockWebDocumentScroll()
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas, overflow: 'hidden' }}>
      {children}
    </GestureHandlerRootView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemedAppShell>
          <RootNavigator />
          <LiveToastHost />
        </ThemedAppShell>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
