import { useEffect, useMemo } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  DrawerContentScrollView,
  useDrawerStatus,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radius, spacing, typography, type AppColors } from '../constants/theme'
import { useColors, useShadows } from '../theme/useColors'
import { useAuthStore } from '../store/authStore'
import { capabilitiesForUser, canUseAttendance } from '../utils/roles'
import { confirmSignOut } from '../screens/attendance/signOut'
import { openTabScreen } from '../navigation/openProject'
import { Avatar } from './Avatar'
import { glyphs, type Glyph } from '../icons'
import { Icon } from './Icon'

type DrawerLink = {
  key: string
  label: string
  icon: Glyph
  onPress: () => void
}

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const colors = useColors()
  const shadows = useShadows()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])
  const user = useAuthStore((s) => s.user)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const logout = useAuthStore((s) => s.logout)
  const caps = capabilitiesForUser(user)
  const { navigation } = props
  const drawerStatus = useDrawerStatus()

  /**
   * Esc closes the drawer wherever there's a physical keyboard — web and
   * desktop-class browsers. Native Android already closes it on hardware
   * back via the navigator, so this only fills the keyboard gap. The listener
   * is bound only while the drawer is open, so it can't swallow Esc from
   * anything else.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || drawerStatus !== 'open') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigation.closeDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerStatus, navigation])

  const goTab = (
    tab: keyof import('../navigation/types').RootTabParamList,
    screen?: string,
    params?: object,
  ) => {
    navigation.closeDrawer()
    const drawerState = navigation.getState()
    const main = drawerState.routes.find((r) => r.name === 'MainTabs')
    const tabState = main?.state as { index: number; routes: { name: string }[] } | undefined
    const from = tabState?.routes?.[tabState.index]?.name
    const remembered =
      screen && from && from !== 'More' && from !== tab ? { returnTo: from } : null
    openTabScreen(navigation, tab, screen, remembered ? { ...(params || {}), ...remembered } : params)
  }

  const sections: { title: string; items: DrawerLink[] }[] = [
    {
      title: 'Pipeline',
      items: [
        ...(caps.leads
          ? [{ key: 'leads', label: 'New enquiries', icon: 'briefcase-outline' as const, onPress: () => goTab('More', 'Leads') }]
          : []),
        ...(caps.myWork
          ? [{ key: 'live-board', label: 'Live board', icon: 'pulse-outline' as const, onPress: () => goTab('More', 'LiveBoard') }]
          : []),
        ...(caps.boq
          ? [{ key: 'boq', label: 'BOQ / Quotes', icon: 'document-text-outline' as const, onPress: () => goTab('More', 'BoqList') }]
          : []),
      ],
    },
    {
      title: 'Site and stock',
      items: [
        ...(caps.siteFeed
          ? [
              { key: 'site', label: 'Site updates', icon: 'camera-outline' as const, onPress: () => goTab('More', 'SiteFeed') },
              { key: 'snags', label: 'Snags', icon: 'warning-outline' as const, onPress: () => goTab('More', 'Snags') },
            ]
          : []),
        ...(caps.inventory
          ? [{ key: 'inventory', label: 'Inventory', icon: 'cube-outline' as const, onPress: () => goTab('More', 'Inventory') }]
          : []),
        ...(caps.procurement
          ? [
              { key: 'vendors', label: 'Vendors', icon: 'storefront-outline' as const, onPress: () => goTab('More', 'Vendors') },
              { key: 'pos', label: 'Purchase orders', icon: 'cart-outline' as const, onPress: () => goTab('More', 'PurchaseOrders') },
            ]
          : []),
      ],
    },
    {
      title: 'Money',
      items: [
        ...(caps.finance
          ? [
              { key: 'finance', label: 'Revenue', icon: 'wallet-outline' as const, onPress: () => goTab('More', 'Finance') },
              { key: 'billing', label: 'Billing', icon: 'receipt-outline' as const, onPress: () => goTab('More', 'Billing') },
              { key: 'tax-invoices', label: 'Tax invoices', icon: 'document-text-outline' as const, onPress: () => goTab('More', 'TaxInvoices') },
            ]
          : []),
      ],
    },
    {
      title: 'Studio',
      items: [
        ...(canUseAttendance(user)
          ? [{ key: 'attendance', label: 'Attendance', icon: 'time-outline' as const, onPress: () => goTab('More', 'Attendance') }]
          : []),
        ...(caps.reports
          ? [{ key: 'reports', label: 'Reports', icon: 'bar-chart-outline' as const, onPress: () => goTab('More', 'Reports') }]
          : []),
        ...(caps.portfolio
          ? [{ key: 'portfolio', label: 'Portfolio', icon: 'grid-outline' as const, onPress: () => goTab('More', 'Portfolio') }]
          : []),
        ...(caps.companyAdmin
          ? [{ key: 'company', label: 'Company', icon: 'stats-chart-outline' as const, onPress: () => goTab('More', 'CompanyAdminDashboard') }]
          : []),
        ...(caps.impact
          ? [{ key: 'impact', label: 'Impact', icon: 'trophy-outline' as const, onPress: () => goTab('More', 'Impact') }]
          : []),
        ...(caps.companyAdmin
          ? [{ key: 'approvals', label: 'Approvals', icon: 'shield-checkmark-outline' as const, onPress: () => goTab('More', 'Approvals') }]
          : []),
      ],
    },
  ].filter((section) => section.items.length > 0)

  return (
    <View style={styles.root}>
      {/*
        * Pinned rather than scrolled with the header: the tools list is long
        * enough to scroll the top out of view, and a close button you have to
        * scroll back up to find isn't a close button.
        */}
      <Pressable
        onPress={() => navigation.closeDrawer()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close sidebar"
        style={({ pressed }) => [
          styles.closeBtn,
          { top: insets.top + spacing.sm },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Icon name={glyphs.close} size="button" color={colors.textPrimary} decorative />
      </Pressable>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}
      >
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>Clyro</Text>
        <Text style={styles.brandHint}>Studio workspace</Text>
      </View>

      <Pressable
        style={styles.profileCard}
        onPress={() => goTab('More', 'ProfileHub')}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Avatar name={user?.name} uri={user?.avatar} size={44} />
        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {user?.name || 'Account'}
          </Text>
          <Text style={styles.profileMeta} numberOfLines={1}>
            {user?.email || 'Signed in'}
          </Text>
        </View>
        <Icon name={glyphs.chevronForward} size="search" color={colors.textMuted} decorative />
      </Pressable>

      {sections.map((section, index) => (
        <View key={section.title}>
          <Text style={[styles.sectionLabel, index > 0 && styles.sectionSpacer]}>{section.title}</Text>
          {section.items.map((item) => (
            <DrawerRow key={item.key} item={item} colors={colors} styles={styles} />
          ))}
        </View>
      ))}

      <Pressable
        style={styles.logout}
        onPress={() => {
          navigation.closeDrawer()
          confirmSignOut(refreshToken, logout)
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Icon name={glyphs.logout} size="button" color={colors.danger} decorative />
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>

        {/* Keep ScrollView happy on short drawers */}
        <View style={{ height: spacing.xxl }} />
      </DrawerContentScrollView>
    </View>
  )
}

function DrawerRow({
  item,
  colors,
  styles,
}: {
  item: DrawerLink
  colors: AppColors
  styles: ReturnType<typeof createStyles>
}) {
  return (
    <Pressable
      onPress={item.onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={styles.rowIcon}>
        <Icon name={item.icon} size="button" color={colors.textPrimary} decorative />
      </View>
      <Text style={styles.rowLabel}>{item.label}</Text>
    </Pressable>
  )
}

function createStyles(c: AppColors, shadows: ReturnType<typeof useShadows>) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    root: { flex: 1 },
    brandBlock: {
      paddingHorizontal: spacing.sm,
      // Clears the pinned close button floating in the top-right corner.
      paddingRight: 52,
      marginBottom: spacing.lg,
      gap: 2,
    },
    closeBtn: {
      position: 'absolute',
      right: spacing.lg,
      zIndex: 2,
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brand: {
      ...typography.h2,
      fontSize: 26,
      color: c.accentHover,
      letterSpacing: -0.5,
    },
    brandHint: {
      ...typography.caption,
      color: c.textSecondary,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: spacing.md,
      marginBottom: spacing.xl,
      ...shadows.card,
    },
    profileText: { flex: 1, minWidth: 0, gap: 2 },
    profileName: { ...typography.bodyStrong, color: c.textPrimary },
    profileMeta: { ...typography.caption, color: c.textSecondary },
    sectionLabel: {
      ...typography.micro,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    sectionSpacer: { marginTop: spacing.lg },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    rowPressed: { backgroundColor: c.accentSoft },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceRaised,
    },
    rowLabel: { ...typography.bodyStrong, color: c.textPrimary, flex: 1 },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xl,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    logoutText: { ...typography.bodyStrong, color: c.danger },
  })
}
