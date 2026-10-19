import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Screen } from './Screen'
import { KeyboardAwareView } from './KeyboardAwareView'
import { PageScrollView } from './PageScrollView'
import { isKeyboardOpen, useKeyboardInset } from '../hooks/useKeyboardInset'
import { spacing, typography, type AppColors } from '../constants/theme'
import { useColors } from '../theme/useColors'
import { useResponsive } from '../theme/useResponsive'

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
  /** Optional brand mark above the title (login). */
  brand?: ReactNode
}

/**
 * Shared chrome for sign-in / onboarding / password gates.
 * Matches FormLayout card language so auth feels like the rest of the app.
 */
export function AuthLayout({ title, subtitle, children, footer, brand }: AuthLayoutProps) {
  const colors = useColors()
  const keyboardInset = useKeyboardInset()
  const keyboardOpen = isKeyboardOpen(keyboardInset)
  const { pagePadding } = useResponsive()
  const styles = useMemo(
    () => createStyles(colors, pagePadding),
    [colors, pagePadding],
  )

  return (
    <Screen padded={false} edges={['top', 'left', 'right', 'bottom']} background={colors.canvas}>
      <KeyboardAwareView style={styles.flex}>
        <PageScrollView
          contentContainerStyle={[
            styles.scroll,
            keyboardOpen && styles.scrollWithKeyboard,
            { paddingBottom: spacing.xl },
          ]}
          keyboardDismissMode="interactive"
        >
          <View style={styles.page}>
            <Text style={styles.kicker}>Studio</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={styles.fields}>{children}</View>
            {footer}
          </View>
        </PageScrollView>
      </KeyboardAwareView>
    </Screen>
  )
}

function createStyles(c: AppColors, pagePadding: number) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: pagePadding,
      paddingVertical: spacing.xl,
      gap: spacing.lg,
    },
    scrollWithKeyboard: {
      justifyContent: 'flex-start',
      paddingTop: spacing.lg,
    },
    page: {
      width: '100%',
      gap: spacing.md,
    },
    kicker: {
      ...typography.micro,
      color: '#a27b5c',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    title: {
      ...typography.h2,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '500',
      color: c.textPrimary,
      letterSpacing: -0.6,
    },
    subtitle: {
      ...typography.body,
      color: c.textSecondary,
      marginTop: -4,
    },
    fields: { gap: spacing.md },
  })
}
