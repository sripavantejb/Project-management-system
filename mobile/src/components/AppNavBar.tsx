import { useEffect, useMemo, useState } from 'react'
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { radius, spacing, typography, type AppColors } from '../constants/theme'
import { useColors, useShadows } from '../theme/useColors'
import { useAuthStore } from '../store/authStore'
import { capabilitiesForUser, ROLE_LABELS } from '../utils/roles'
import { projectsApi } from '../api/projects'
import { homeApi } from '../api/home'
import { adminApi } from '../api/admin'
import { leadsApi } from '../api/leads'
import { vendorsApi } from '../api/procurement'
import { openConversationFromTabs, openTabScreen } from '../navigation/openProject'
import type { RootDrawerParamList } from '../navigation/types'
import type { Task } from '../types/models'
import { ActiveTimerChip } from './ActiveTimerChip'
import { Avatar } from './Avatar'
import { isDarkColor } from '../utils/color'
import { glyphs, type Glyph } from '../icons'
import { Icon } from './Icon'

/** Home chrome sits on the ivory canvas — same surface as the operations dashboard. */
export const NAV_HERO_BG = '#faf9f7'
const HERO_WELL = 'rgba(255,255,255,0.14)'
const HERO_PILL = 'rgba(255,255,255,0.16)'

type SearchKind = 'task' | 'project' | 'person' | 'lead' | 'vendor' | 'shortcut'

type SearchHit = {
  key: string
  kind: SearchKind
  title: string
  subtitle?: string
  icon: Glyph
  onPress: () => void
}

type AppNavBarProps = {
  /** `hero` blends with home green; `default` follows light/dark canvas. */
  variant?: 'default' | 'hero'
  /** Home scroll — navbar background eases from hero → theme canvas. */
  scrollY?: Animated.Value
  /** Distance where navbar fully matches the page canvas. */
  coverRange?: number
  /**
   * Background to sit on, when a screen isn't using the theme canvas.
   * The bar reads its own contrast off this, so a screen only has to say what
   * colour it is — not which foreground to use.
   */
  background?: string
}

/**
 * Soft top chrome: avatar · pill search · circular action buttons.
 * Background tracks the active theme (and Home hero while scrolling).
 */
export function AppNavBar({
  variant = 'default',
  scrollY,
  coverRange = 180,
  background,
}: AppNavBarProps = {}) {
  const colors = useColors()
  const shadows = useShadows()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NavigationProp<RootDrawerParamList>>()
  const [heroActive, setHeroActive] = useState(variant === 'hero')
  const onHero = variant === 'hero' && heroActive
  /**
   * The colour actually behind the bar right now. During the Home hero scroll
   * `shellBg` is an animated interpolation, so contrast follows `heroActive`
   * — the same flag that decides which end of that animation we're at.
   */
  const resolvedBg = background ?? colors.canvas
  const onDark = isDarkColor(resolvedBg)
  const styles = useMemo(() => createStyles(colors, shadows, onDark), [colors, shadows, onDark])
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const caps = capabilitiesForUser(user)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (variant !== 'hero' || !scrollY) {
      setHeroActive(variant === 'hero')
      return
    }
    setHeroActive(true)
    const threshold = Math.max(coverRange * 0.35, 48)
    const id = scrollY.addListener(({ value }) => {
      setHeroActive(value < threshold)
    })
    return () => scrollY.removeListener(id)
  }, [variant, scrollY, coverRange])

  const shellBg = background ?? colors.canvas

  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => homeApi.get(),
    enabled: searchOpen,
  })
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    enabled: searchOpen && caps.projects,
  })
  const people = useQuery({
    queryKey: ['users'],
    queryFn: () => adminApi.users(),
    enabled: searchOpen && (caps.people || caps.managePeople || caps.inbox),
  })
  const leads = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadsApi.list(),
    enabled: searchOpen && caps.leads,
  })
  const vendors = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorsApi.list(),
    enabled: searchOpen && caps.procurement,
  })

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
  }

  const goMore = (screen: string, params?: object) => {
    navigation.navigate('MainTabs', {
      screen: 'More',
      params: params ? { screen, params } : { screen },
    } as never)
  }

  const goTab = (tab: string, screen?: string, params?: object) => {
    navigation.navigate('MainTabs', {
      screen: tab,
      params: screen ? (params ? { screen, params } : { screen }) : undefined,
    } as never)
  }

  const openProfile = () => goMore('ProfileHub')

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer())
  }

  const openReports = () => {
    if (caps.reports || caps.portfolio) {
      goMore('Reports')
      return
    }
    goMore('MoreMain')
  }

  const openTask = (task: Task) => {
    closeSearch()
    const projectId =
      typeof task.projectId === 'object' && task.projectId ? task.projectId._id : task.projectId
    if (projectId) {
      goTab('Projects', 'TaskDetail', { taskId: task._id })
      return
    }
    goTab('Home', 'TaskDetail', { taskId: task._id })
  }

  const openProject = (projectId: string, projectName?: string) => {
    closeSearch()
    goTab('Projects', 'ProjectOverview', { projectId, projectName })
  }

  const openPerson = (userId: string, userName: string) => {
    closeSearch()
    if (caps.people || caps.managePeople) {
      goMore('ProfileHub', { screen: 'PersonAccess', params: { userId } })
      return
    }
    openConversationFromTabs(navigation, userId, userName)
  }

  const results = useMemo((): SearchHit[] => {
    const q = query.trim().toLowerCase()
    const hits: SearchHit[] = []

    // Empty query → quick navigation shortcuts
    if (!q) {
      const shortcuts: SearchHit[] = [
        {
          key: 'sc-home',
          kind: 'shortcut',
          title: 'Home',
          subtitle: 'Your work today',
          icon: 'home-outline',
          onPress: () => {
            closeSearch()
            goTab('Home')
          },
        },
        ...(caps.projects
          ? [
              {
                key: 'sc-projects',
                kind: 'shortcut' as const,
                title: 'Projects',
                subtitle: 'All workspaces',
                icon: 'folder-outline' as const,
                onPress: () => {
                  closeSearch()
                  goTab('Projects')
                },
              },
            ]
          : []),
        {
          key: 'sc-inbox',
          kind: 'shortcut',
          title: 'Messages',
          subtitle: 'Team inbox',
          icon: 'chatbubbles-outline',
          onPress: () => {
            closeSearch()
            goTab('Inbox')
          },
        },
        {
          key: 'sc-more',
          kind: 'shortcut',
          title: 'More',
          subtitle: 'Tools and company',
          icon: 'grid-outline',
          onPress: () => {
            closeSearch()
            goTab('More')
          },
        },
      ]
      return shortcuts
    }

    // Tasks from home buckets
    const taskMap = new Map<string, Task>()
    const buckets = home.data?.tasks
    if (buckets) {
      for (const list of Object.values(buckets)) {
        if (!Array.isArray(list)) continue
        for (const t of list) {
          if (t?.title?.toLowerCase().includes(q)) taskMap.set(t._id, t)
        }
      }
    }
    for (const t of [...taskMap.values()].slice(0, 8)) {
      const projectName =
        typeof t.projectId === 'object' && t.projectId ? t.projectId.name : t.isPersonal ? 'Personal' : 'Task'
      hits.push({
        key: `task-${t._id}`,
        kind: 'task',
        title: t.title,
        subtitle: projectName,
        icon: 'checkbox-outline',
        onPress: () => openTask(t),
      })
    }

    // Projects
    if (caps.projects) {
      for (const p of (projects.data || [])
        .filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            (p.clientName || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q),
        )
        .slice(0, 6)) {
        hits.push({
          key: `project-${p._id}`,
          kind: 'project',
          title: p.name,
          subtitle: p.clientName || p.location || 'Project',
          icon: 'folder-outline',
          onPress: () => openProject(p._id, p.name),
        })
      }
    }

    // People
    for (const u of (people.data || [])
      .filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          (u.title || '').toLowerCase().includes(q),
      )
      .slice(0, 6)) {
      hits.push({
        key: `person-${u._id}`,
        kind: 'person',
        title: u.name,
        subtitle: u.title || ROLE_LABELS[u.role] || u.email,
        icon: 'person-outline',
        onPress: () => openPerson(u._id, u.name),
      })
    }

    // Leads
    if (caps.leads) {
      for (const lead of (leads.data || [])
        .filter(
          (l) =>
            l.clientName?.toLowerCase().includes(q) ||
            (l.contactName || '').toLowerCase().includes(q) ||
            (l.email || '').toLowerCase().includes(q) ||
            (l.phone || '').toLowerCase().includes(q),
        )
        .slice(0, 5)) {
        hits.push({
          key: `lead-${lead._id}`,
          kind: 'lead',
          title: lead.clientName,
          subtitle: lead.contactName || lead.stage || 'Enquiry',
          icon: 'briefcase-outline',
          onPress: () => {
            closeSearch()
            goMore('Leads')
          },
        })
      }
    }

    // Vendors
    if (caps.procurement) {
      for (const v of (vendors.data || [])
        .filter(
          (v) =>
            v.name?.toLowerCase().includes(q) ||
            (v.contact || '').toLowerCase().includes(q) ||
            (v.email || '').toLowerCase().includes(q),
        )
        .slice(0, 5)) {
        hits.push({
          key: `vendor-${v._id}`,
          kind: 'vendor',
          title: v.name,
          subtitle: v.contact || v.email || 'Vendor',
          icon: 'storefront-outline',
          onPress: () => {
            closeSearch()
            goMore('Vendors')
          },
        })
      }
    }

    return hits
  }, [
    query,
    home.data,
    projects.data,
    people.data,
    leads.data,
    vendors.data,
    caps,
  ])

  const kindLabel = (kind: SearchKind) => {
    switch (kind) {
      case 'task':
        return 'Tasks'
      case 'project':
        return 'Projects'
      case 'person':
        return 'People'
      case 'lead':
        return 'Enquiries'
      case 'vendor':
        return 'Vendors'
      default:
        return 'Quick open'
    }
  }

  // Group for section headers in FlatList
  const listData = useMemo(() => {
    const rows: ({ type: 'header'; title: string; key: string } | ({ type: 'hit' } & SearchHit))[] = []
    let lastKind: SearchKind | null = null
    for (const hit of results) {
      if (hit.kind !== lastKind) {
        rows.push({ type: 'header', title: kindLabel(hit.kind), key: `h-${hit.kind}` })
        lastKind = hit.kind
      }
      rows.push({ type: 'hit', ...hit })
    }
    return rows
  }, [results])

  // Deliberately not theme tokens: a light background in dark mode would take a
  // light `textPrimary` and disappear. Contrast is against the actual colour.
  const iconColor = onDark ? '#ffffff' : '#18181b'
  const searchIconColor = onDark ? 'rgba(255,255,255,0.75)' : '#a1a1aa'
  const searchTextColor = onDark ? 'rgba(255,255,255,0.7)' : '#a1a1aa'
  const statusStyle = onDark ? 'light' : 'dark'

  return (
    <>
      <StatusBar style={statusStyle} />
      <Animated.View
        style={[
          styles.shell,
          { paddingTop: Math.max(insets.top, spacing.sm), backgroundColor: shellBg },
        ]}
      >
        {onHero ? (
          <View style={styles.bar}>
            <CircleAction
              icon="menu-outline"
              label="Open menu"
              onPress={openDrawer}
              onDark={false}
              iconColor={colors.textPrimary}
              colors={colors}
              shadows={shadows}
            />
            <Pressable
              onPress={openDrawer}
              accessibilityRole="button"
              accessibilityLabel="Open studio menu"
              style={({ pressed }) => [styles.brandRow, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.mark}>
                <Text style={styles.markLetter}>C</Text>
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.studioKicker}>STUDIO</Text>
                <Text style={styles.studioName} numberOfLines={1}>
                  {tenant?.name || 'Clyro'}
                </Text>
              </View>
            </Pressable>
            <View style={styles.actions}>
              <CircleAction
                icon="notifications-outline"
                label="Notifications"
                onPress={() => goMore('Notifications')}
                onDark={false}
                iconColor={colors.textPrimary}
                colors={colors}
                shadows={shadows}
              />
              <Pressable
                onPress={openProfile}
                accessibilityRole="button"
                accessibilityLabel="Profile"
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <Avatar name={user?.name} uri={user?.avatar} size={36} />
              </Pressable>
            </View>
          </View>
        ) : (
        <View style={styles.bar}>
          <Pressable
            onPress={openProfile}
            onLongPress={openDrawer}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}
          >
            <Avatar name={user?.name} uri={user?.avatar} size={40} />
          </Pressable>

          <Pressable
            onPress={() => setSearchOpen(true)}
            accessibilityRole="search"
            accessibilityLabel="Search"
            style={({ pressed }) => [styles.searchPill, pressed && styles.searchPillPressed]}
          >
            <Icon name={glyphs.search} size="search" color={searchIconColor} decorative />
            <Text style={[styles.searchPlaceholder, { color: searchTextColor }]} numberOfLines={1}>
              Search tasks, projects, people…
            </Text>
          </Pressable>

          <ActiveTimerChip />

          <View style={styles.actions}>
            {caps.reports || caps.portfolio ? (
              <CircleAction
                icon="bar-chart-outline"
                label="Reports"
                onPress={openReports}
                onDark={onDark}
                iconColor={iconColor}
                colors={colors}
                shadows={shadows}
              />
            ) : null}
            <CircleAction
              icon="menu-outline"
              label="Open sidebar"
              onPress={openDrawer}
              onDark={onDark}
              iconColor={iconColor}
              colors={colors}
              shadows={shadows}
            />
          </View>
        </View>
        )}
      </Animated.View>

      <Modal
        visible={searchOpen}
        animationType="fade"
        transparent
        onRequestClose={closeSearch}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.modalBar}>
            <View style={styles.searchField}>
              <Icon name={glyphs.search} size="search" color={colors.textMuted} decorative />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search tasks, projects, people…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <Pressable onPress={closeSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close search">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>

          <FlatList
            data={listData}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.results}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.trim() ? `No results for “${query.trim()}”.` : 'Search across tasks, projects, and people.'}
              </Text>
            }
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return <Text style={styles.sectionLabel}>{item.title}</Text>
              }
              return (
                <Pressable
                  style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
                  onPress={item.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <View style={styles.resultIcon}>
                    <Icon name={item.icon} size="search" color={colors.textPrimary} decorative />
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={styles.resultMeta} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name={glyphs.chevronForward} size="inline" color={colors.textMuted} decorative />
                </Pressable>
              )
            }}
          />
        </View>
      </Modal>
    </>
  )
}

function CircleAction({
  icon,
  label,
  onPress,
  onDark,
  iconColor,
  colors,
  shadows,
}: {
  icon: Glyph
  label: string
  onPress: () => void
  onDark: boolean
  iconColor: string
  colors: AppColors
  shadows: ReturnType<typeof useShadows>
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: onDark ? HERO_WELL : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          ...(onDark ? {} : shadows.card),
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Icon name={icon} size="button" color={iconColor} decorative />
    </Pressable>
  )
}

function createStyles(c: AppColors, shadows: ReturnType<typeof useShadows>, onHero: boolean) {
  return StyleSheet.create({
    shell: {
      // backgroundColor set dynamically (theme canvas / hero blend)
      paddingBottom: spacing.sm,
      /**
       * Stay above the Home white sheet so search chrome never scrolls under
       * content — but via `zIndex` only. Android's `elevation` cannot raise a
       * view without also casting a shadow, and that shadow fell as a dark
       * band across the hero directly below. The bar and the hero are the same
       * green (#004838), so the shadow was the entire reason the navbar read
       * as a separate, lighter strip.
       */
      zIndex: 20,
      position: 'relative',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 48,
    },
    brandRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
    },
    brandCopy: { flex: 1, minWidth: 0 },
    mark: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#1e2022',
      alignItems: 'center',
      justifyContent: 'center',
    },
    markLetter: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    studioKicker: {
      ...typography.micro,
      color: c.textMuted,
      letterSpacing: 1.2,
      fontSize: 10,
    },
    studioName: {
      ...typography.captionStrong,
      color: c.textPrimary,
      marginTop: 1,
    },
    avatarWrap: {
      borderRadius: 22,
      borderWidth: onHero ? 2 : 0,
      borderColor: onHero ? 'rgba(255,255,255,0.35)' : 'transparent',
      ...(!onHero ? shadows.card : {}),
    },
    searchPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      backgroundColor: onHero ? HERO_PILL : c.surface,
      ...(onHero ? {} : shadows.card),
    },
    searchPillPressed: {
      backgroundColor: onHero ? 'rgba(255,255,255,0.22)' : c.surfaceRaised,
    },
    searchPlaceholder: {
      ...typography.body,
      color: c.textMuted,
      flex: 1,
      minWidth: 0,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    modalRoot: {
      flex: 1,
      backgroundColor: c.canvas,
    },
    modalBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    searchField: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      backgroundColor: c.surface,
      ...shadows.card,
    },
    searchInput: {
      ...typography.body,
      color: c.textPrimary,
      flex: 1,
      paddingVertical: spacing.sm,
      minWidth: 0,
    },
    cancel: {
      ...typography.bodyStrong,
      color: c.accentHover,
    },
    results: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: 2,
    },
    empty: {
      ...typography.caption,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    sectionLabel: {
      ...typography.micro,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      paddingHorizontal: 4,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      marginBottom: spacing.sm,
      ...shadows.card,
    },
    resultRowPressed: {
      backgroundColor: c.accentSoft,
    },
    resultIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceRaised,
    },
    resultText: { flex: 1, minWidth: 0, gap: 2 },
    resultTitle: { ...typography.bodyStrong, color: c.textPrimary },
    resultMeta: { ...typography.caption, color: c.textSecondary },
  })
}
