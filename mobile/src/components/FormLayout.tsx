import type { ReactElement, ReactNode } from 'react'
import { Children, cloneElement, isValidElement, useMemo } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useNavigation, useRoute, type NavigationProp, type ParamListBase } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Screen } from './Screen'
import { PageHeader } from './PageHeader'
import { KeyboardAwareView } from './KeyboardAwareView'
import { LoadingState } from './States'
import { Icon } from './Icon'
import { TAB_BAR_CLEARANCE } from './GlassyTabBar'
import { radius, spacing, typography, type AppColors } from '../constants/theme'
import { useColors, useShadows } from '../theme/useColors'
import { useResponsive } from '../theme/useResponsive'
import { isKeyboardOpen, useKeyboardInset } from '../hooks/useKeyboardInset'
import { smartGoBack } from '../navigation/openProject'
import { PageEnter } from '../motion/PageEnter'
import { glyphs, type Glyph } from '../icons'
import { PageScrollView, mergePageScrollProps } from './PageScrollView'

type FormLayoutProps = {
  title: string
  subtitle?: string
  subtitleIcon?: Glyph
  /** Defaults to smartGoBack (stack root fallback). */
  onBack?: () => void
  children: ReactNode
  /** Primary action, laid out with the form (not a nested sticky overlay). */
  footer?: ReactNode
  /** Wrap fields in a surface card (default true). */
  card?: boolean
  /**
   * `sheet` — create popup chrome (title + close).
   * `page` — full-screen page header (edit profile, etc.).
   */
  variant?: 'sheet' | 'page'
  /** Reserve space above the bottom tab bar (default true). */
  tabBarClearance?: boolean
  loading?: boolean
  loadingVariant?: import('./Skeleton').SkeletonVariant
}

function isVerticalPageScroller(node: ReactNode): node is ReactElement {
  if (!isValidElement(node)) return false
  const props = node.props as { horizontal?: boolean }
  if (props.horizontal) return false
  const type = node.type as { displayName?: string; name?: string }
  return (
    node.type === FlatList ||
    node.type === ScrollView ||
    type?.displayName === 'FlatList' ||
    type?.displayName === 'ScrollView' ||
    type?.name === 'FlatList' ||
    type?.name === 'ScrollView'
  )
}

/**
 * Create/edit chrome. Sheet variant is for modal form-sheet popups.
 */
export function FormLayout({
  title,
  subtitle,
  subtitleIcon,
  onBack,
  children,
  footer,
  card = true,
  variant = 'sheet',
  tabBarClearance,
  loading = false,
  loadingVariant = 'form',
}: FormLayoutProps) {
  const navigation = useNavigation()
  const route = useRoute()
  const colors = useColors()
  const shadows = useShadows()
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardInset()
  const keyboardOpen = isKeyboardOpen(keyboardInset)
  const { pagePadding } = useResponsive()
  const handleBack = onBack ?? (() => smartGoBack(navigation as NavigationProp<ParamListBase>, route))
  const styles = useMemo(
    () => createStyles(colors, shadows, pagePadding),
    [colors, shadows, pagePadding],
  )
  const isSheet = variant === 'sheet'
  // Tab bar is absolute on every main tab screen — always lift content above it.
  const reserveTabBar = tabBarClearance ?? true
  const scrollBottomPad = keyboardOpen
    ? spacing.lg
    : reserveTabBar
      ? TAB_BAR_CLEARANCE
      : Math.max(insets.bottom, 16) + spacing.md
  const dismissMode = Platform.OS === 'ios' ? ('interactive' as const) : ('on-drag' as const)
  const childList = Children.toArray(children)
  const onlyChild = childList[0]
  const useChildScroller =
    !loading &&
    !card &&
    !footer &&
    childList.length === 1 &&
    isVerticalPageScroller(onlyChild)

  let body: ReactNode
  if (useChildScroller && isValidElement(onlyChild)) {
    const prev = onlyChild.props as Record<string, unknown>
    body = cloneElement(
      onlyChild,
      mergePageScrollProps({
        ...prev,
        style: [styles.scrollView, prev.style],
        contentContainerStyle: [
          styles.scroll,
          { paddingBottom: scrollBottomPad },
          prev.contentContainerStyle,
        ],
        keyboardDismissMode: dismissMode,
      }) as Record<string, unknown>,
    )
  } else {
    body = (
      <PageScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
        keyboardDismissMode={dismissMode}
      >
        {loading ? (
          <LoadingState variant={loadingVariant} />
        ) : (
          <PageEnter fill={false} axis="y" distance={6} style={styles.body}>
            {card ? <View style={styles.card}>{children}</View> : children}
            {footer ? <View style={styles.footerSlot}>{footer}</View> : null}
          </PageEnter>
        )}
      </PageScrollView>
    )
  }

  return (
    <Screen
      padded={false}
      edges={isSheet ? ['left', 'right'] : ['top', 'left', 'right']}
      background={colors.canvas}
    >
      {isSheet ? (
        <View style={styles.sheetChrome}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitles}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <View style={styles.sheetSubtitleRow}>
                  {subtitleIcon ? (
                    <Icon name={subtitleIcon} size="subtitle" color={colors.accentHover} decorative />
                  ) : null}
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    {subtitle}
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            >
              <Icon name={glyphs.close} size="button" color={colors.textPrimary} decorative />
            </Pressable>
          </View>
        </View>
      ) : (
        <PageHeader title={title} subtitle={subtitle} subtitleIcon={subtitleIcon} onBack={handleBack} />
      )}

      <KeyboardAwareView
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {body}
      </KeyboardAwareView>
    </Screen>
  )
}

function createStyles(
  c: AppColors,
  sh: ReturnType<typeof useShadows>,
  pagePadding: number,
) {
  return StyleSheet.create({
    flex: { flex: 1, minHeight: 0 },
    scrollView: {
      flex: 1,
      minHeight: 0,
      ...(Platform.OS === 'web' ? ({ overflow: 'auto' } as object) : null),
    },
    sheetChrome: {
      paddingHorizontal: pagePadding,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
      backgroundColor: c.canvas,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    sheetTitles: {
      flex: 1,
      minWidth: 0,
      gap: 4,
      paddingTop: 2,
    },
    sheetTitle: {
      ...typography.h2,
      fontSize: 22,
      color: c.textPrimary,
      letterSpacing: -0.4,
    },
    sheetSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sheetSubtitle: {
      ...typography.caption,
      color: c.textSecondary,
      flex: 1,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: pagePadding,
      gap: spacing.md,
    },
    body: {
      flexGrow: 1,
      gap: spacing.md,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.borderStrong,
      padding: spacing.lg,
      gap: spacing.md,
      overflow: 'visible',
      ...sh.card,
    },
    /**
     * Lives in the page scroll, not a sticky overlay. Short forms pin the
     * action to the bottom of the screen; long forms just keep it after the
     * last field — one scroll, no nested card scrollbar.
     */
    footerSlot: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      minHeight: 48,
    },
  })
}
