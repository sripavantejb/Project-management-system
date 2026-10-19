import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { ArchitecturalLogo } from './ArchitecturalLogo'

/** Ivory canvas from the Stitch atelier system. */
export const SPLASH_BG = '#faf9f7'
const nativeDriver = Platform.OS !== 'web'

type SplashScreenProps = {
  onFinished?: () => void
  /** Minimum time on screen before dismissing (ms). */
  minDurationMs?: number
  /** When true, keep showing until parent flips this to false (then finish animation). */
  hold?: boolean
}

/**
 * Splash is the CAD monogram: the C draws in, milestone bars pulse,
 * and the gold scan runs once before the app continues.
 */
export function SplashScreen({ onFinished, minDurationMs = 3200, hold = false }: SplashScreenProps) {
  const styles = useMemo(() => createStyles(), [])
  const exit = useRef(new Animated.Value(0)).current
  const finishedRef = useRef(false)
  const readyAt = useRef(Date.now() + minDurationMs)

  useEffect(() => {
    if (hold) return
    if (finishedRef.current) return

    const remaining = Math.max(0, readyAt.current - Date.now())
    const timer = setTimeout(() => {
      finishedRef.current = true
      Animated.timing(exit, {
        toValue: 1,
        duration: 380,
        easing: Easing.in(Easing.quad),
        useNativeDriver: nativeDriver,
      }).start(({ finished }) => {
        if (finished) onFinished?.()
      })
    }, remaining)

    return () => clearTimeout(timer)
  }, [hold, exit, onFinished])

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }],
        },
      ]}
      accessibilityLabel="Clyro"
      accessibilityRole="image"
    >
      <StatusBar style="dark" />
      <View style={styles.mark}>
        <ArchitecturalLogo size={280} />
      </View>
    </Animated.View>
  )
}

function createStyles() {
  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      backgroundColor: SPLASH_BG,
      zIndex: 100,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mark: {
      width: 280,
      height: 280,
    },
  })
}
