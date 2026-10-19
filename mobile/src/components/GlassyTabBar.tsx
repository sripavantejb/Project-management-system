import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps, BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { typography, radius, type AppColors } from '../constants/theme'
import { useColors } from '../theme/useColors'
import { useResponsive } from '../theme/useResponsive'
import { glyphs, type Glyph } from '../icons'
import { Icon } from './Icon'
import { QuickCreateSheet } from './QuickCreateSheet'
import { TAB_ROOT_SCREEN } from '../navigation/openProject'
import type { RootTabParamList } from '../navigation/types'

/** Home · Projects · center FAB · Chat · More */
const ICONS: Record<string, { on: Glyph; off: Glyph; label: string }> = {
  Home: { on: glyphs.homeFilled, off: glyphs.home, label: 'Home' },
  Projects: { on: glyphs.projectsFilled, off: glyphs.projects, label: 'Projects' },
  Inbox: { on: glyphs.chatFilled, off: glyphs.chat, label: 'Chat' },
  More: { on: glyphs.gridFilled, off: glyphs.grid, label: 'More' },
}

/**
 * Space a scroll view must leave at its bottom so content never ends up under
 * the tab bar. Sized for the floating pill: its own height plus the gap it
 * leaves at the bottom of the screen.
 */
export const TAB_BAR_CLEARANCE = 104

export function GlassyTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { isCompact, pagePadding } = useResponsive()
  const styles = useMemo(
    () => createStyles(colors, pagePadding, isCompact),
    [colors, pagePadding, isCompact],
  )
  // Floating pill, so it needs a visible gap under it, not just inset clearance.
  const bottomPad = Math.max(insets.bottom, 14)
  const [createOpen, setCreateOpen] = useState(false)

  const leftRoutes = state.routes.filter((r) => r.name === 'Home' || r.name === 'Projects')
  const rightRoutes = state.routes.filter((r) => r.name === 'Inbox' || r.name === 'More')

  const renderTab = (route: (typeof state.routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key)
    const focused = state.index === index
    const meta = ICONS[route.name] || ICONS.More

    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })
          if (event.defaultPrevented) return
          const root = TAB_ROOT_SCREEN[route.name as keyof RootTabParamList]
          navigation.navigate(route.name, root ? { screen: root } : route.params)
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
        style={({ pressed }) => [styles.item, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
      >
        <Icon
          name={focused ? meta.on : meta.off}
          size={isCompact ? 21 : 23}
          color={focused ? colors.textPrimary : colors.textMuted}
          decorative
        />
        <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
          {meta.label}
        </Text>
      </Pressable>
    )
  }

  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: bottomPad }]}>
      <View style={styles.bar}>
        {/* Left pair — equal columns */}
        <View style={styles.pair}>
          {leftRoutes.map((route) => (
            <View key={route.key} style={styles.slot}>
              {renderTab(route)}
            </View>
          ))}
          {/* Keep grid balanced if Projects tab is gated off */}
          {leftRoutes.length === 1 ? <View style={styles.slot} /> : null}
        </View>

        {/* Center FAB — opens create action sheet */}
        <View style={styles.fabSlot}>
          <Pressable
            style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
            onPress={() => setCreateOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Quick create"
          >
            <Icon name={glyphs.add} size="tabFab" color={colors.textOnAccent} decorative />
          </Pressable>
        </View>

        {/* Right pair — mirrors left */}
        <View style={styles.pair}>
          {rightRoutes.map((route) => (
            <View key={route.key} style={styles.slot}>
              {renderTab(route)}
            </View>
          ))}
        </View>
      </View>

      <QuickCreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        navigation={navigation as unknown as BottomTabNavigationProp<RootTabParamList>}
      />
    </View>
  )
}

function createStyles(c: AppColors, pagePadding: number, isCompact: boolean) {
  const edge = Math.max(pagePadding - 2, 12)

  return StyleSheet.create({
    /**
     * Transparent positioner. The bar itself floats inside it, so the dock can
     * own the safe-area padding without painting a slab behind the gesture
     * handle.
     */
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.canvas,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingHorizontal: edge,
      paddingTop: 8,
      paddingBottom: 8,
      minHeight: 56,
    },
    pair: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    slot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    item: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minWidth: 56,
      paddingVertical: 2,
    },
    label: {
      ...typography.micro,
      fontSize: 11,
      lineHeight: 13,
      letterSpacing: 0.2,
      color: c.textMuted,
      textAlign: 'center',
    },
    labelActive: {
      color: c.textPrimary,
      fontWeight: '600',
    },
    fabSlot: {
      width: isCompact ? 64 : 72,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    fab: {
      width: 44,
      height: 44,
      borderRadius: radius.sm,
      backgroundColor: c.cta,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
