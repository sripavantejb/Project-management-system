import { useMemo, useRef, useState } from 'react'
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { CompositeNavigationProp } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '../../components/Screen'
import { AppNavBar } from '../../components/AppNavBar'
import { SectionLabel } from '../../components/SectionLabel'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { Avatar } from '../../components/Avatar'
import { TAB_BAR_CLEARANCE } from '../../components/GlassyTabBar'
import { heroFor, STATUS_LABELS, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors, useShadows } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { assetUrl } from '../../constants/env'
import { homeApi } from '../../api/home'
import { notificationsApi } from '../../api/notifications'
import { siteFeedApi } from '../../api/siteFeed'
import { projectsApi } from '../../api/projects'
import { useAuthStore } from '../../store/authStore'
import { isApiError } from '../../api/client'
import { capabilitiesForUser } from '../../utils/roles'
import type { HomeStackParamList, RootTabParamList } from '../../navigation/types'
import { openProjectScreen, openMoreScreen } from '../../navigation/openProject'
import { MyWorkViews } from './MyWorkViews'
import { ViewPills, type MyWorkView } from '../../components/ViewPills'
import type { HomeData, Task } from '../../types/models'
import type { SiteUpdate, Snag } from '../../types/ops'
import { timeAgo } from '../../utils/time'

import { OperationsDashboard } from './sections/OperationsDashboard'

const HERO = heroFor('light')
type Props = {
  navigation: CompositeNavigationProp<
    NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>,
    BottomTabNavigationProp<RootTabParamList>
  >
  route: { params?: HomeStackParamList['HomeMain'] }
}

function firstName(name?: string) {
  if (!name) return 'there'
  return name.trim().split(/\s+/)[0] || 'there'
}

function timeGreeting(now = new Date()) {
  const h = now.getHours()
  if (h < 17) return 'Bonjour'
  return 'Good evening'
}

function taskProgress(task: Task) {
  if (typeof task.progress === 'number' && task.progress > 0) {
    return Math.min(100, Math.round(task.progress))
  }
  const list = task.checklist || []
  if (list.length) {
    const done = list.filter((c) => c.done).length
    return Math.round((done / list.length) * 100)
  }
  if (task.status === 'done') return 100
  if (task.status === 'review') return 80
  if (task.status === 'in_progress') return 40
  return 10
}

function projectNameOf(task?: Task | null) {
  if (!task?.projectId) return null
  if (typeof task.projectId === 'object') return task.projectId.name
  return null
}

function pickFocusTask(data: HomeData | undefined, projectId?: string | null) {
  if (!data) return null
  const inProject = (t: Task) => {
    if (!projectId) return true
    const pid = typeof t.projectId === 'object' ? t.projectId?._id : t.projectId
    return pid === projectId
  }
  const todayOpen = data.tasks.today.find((t) => t.status !== 'done' && inProject(t))
  if (todayOpen) return todayOpen
  const inProgress = data.tasks.assigned.find((t) => t.status === 'in_progress' && inProject(t))
  if (inProgress) return inProgress
  const assignedOpen = data.tasks.assigned.find((t) => t.status !== 'done' && inProject(t))
  if (assignedOpen) return assignedOpen
  return data.agenda?.find((t) => t.status !== 'done' && inProject(t)) || null
}

type AttentionItem = {
  key: string
  tone: 'danger' | 'warning' | 'accent'
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
  meta: string
  thumb?: string | null
  onPress: () => void
}

export function HomeScreen({ navigation, route }: Props) {
  const colors = useColors()
  const shadows = useShadows()
  const { height: windowHeight } = useWindowDimensions()
  const { pagePadding, isCompact } = useResponsive()
  /**
   * Freeze the first measured window height. On web, `useWindowDimensions`
   * ticks as the browser chrome shows/hides during scroll; rebuilding styles
   * (sheet minHeight) is what made the green hero judder.
   */
  const [stableWindowHeight] = useState(windowHeight)
  const styles = useMemo(
    () => createStyles(colors, shadows, pagePadding, isCompact, stableWindowHeight),
    [colors, shadows, pagePadding, isCompact, stableWindowHeight],
  )
  const isWeb = Platform.OS === 'web'
  /**
   * Two values off one scroll, because they can't share a driver. The hero pin
   * has to run on the UI thread or it lands a frame behind every scroll frame
   * and the green card visibly judders; the navbar animates `backgroundColor`,
   * which the native driver can't do at all. So the pin gets the native value
   * and the navbar gets a JS one mirrored from the same event.
   *
   * Web skips the transform pin entirely â€” CSS `position: sticky` keeps the
   * hero still without fighting the compositor, which is the shake we saw.
   */
  const scrollYNative = useRef(new Animated.Value(0)).current
  const scrollY = useRef(new Animated.Value(0)).current
  /** Measured, not assumed â€” the hero's height varies with role and font scale. */
  const [heroHeight, setHeroHeight] = useState(0)

  const user = useAuthStore((s) => s.user)
  const caps = capabilitiesForUser(user)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [workView, setWorkView] = useState<MyWorkView>(route.params?.view || 'all')

  const { data, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['home'],
    queryFn: homeApi.get,
  })
  const alerts = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 20_000,
  })
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    enabled: caps.projects,
  })
  const siteUpdates = useQuery({
    queryKey: ['site-updates-home'],
    queryFn: () => siteFeedApi.updates(),
    enabled: caps.siteFeed,
  })
  const snags = useQuery({
    queryKey: ['snags-home', selectedProjectId],
    queryFn: () => siteFeedApi.snags(selectedProjectId ? { projectId: selectedProjectId } : undefined),
    enabled: caps.siteFeed,
  })

  const projectList = projects.data || []
  const activeProject =
    (selectedProjectId
      ? projectList.find((p) => p._id === selectedProjectId)
      : projectList[0]) || null
  const activeProjectId = activeProject?._id || null

  const focus = pickFocusTask(data, activeProjectId)
  const progress = focus ? taskProgress(focus) : 0
  const openSnags = (snags.data || []).filter((s: Snag) => s.status === 'open')
  const overdueCount = (data?.tasks.overdue || []).length
  const remainingToday = (data?.tasks.today || []).filter((t) => t.status !== 'done').length
  const assignedOpen = (data?.tasks.assigned || []).filter((t) => t.status !== 'done').length
  const checklistLeft = focus?.checklist?.filter((c) => !c.done).length
  const tasksRemaining = checklistLeft ?? remainingToday
  const heroStat = remainingToday || assignedOpen

  const scheduleLabel = overdueCount > 0 ? 'At Risk' : 'On Track'
  const scheduleTone = overdueCount > 0 ? colors.danger : colors.success
  const crewCount = activeProject?.members?.length || 0
  const materialsPending = (data?.approvals || []).length
  const issuesOpen = openSnags.length

  const goMore = (screen: string, params?: Record<string, unknown>, _fromHome = true) => {
    openMoreScreen(navigation, screen as never, params, { fromHome: true })
  }

  const myTasks = useMemo(() => {
    const seen = new Set<string>()
    const out: Task[] = []
    for (const t of [...(data?.tasks.today || []), ...(data?.tasks.assigned || []), ...(data?.tasks.overdue || [])]) {
      if (t.status === 'done' || seen.has(t._id)) continue
      seen.add(t._id)
      out.push(t)
    }
    return out
  }, [data])

  const openMyTasks = () => setTasksOpen(true)

  const goProject = (screen: string, params?: Record<string, unknown>) => {
    if (!activeProjectId) {
      navigation.navigate('Projects' as never)
      return
    }
    openProjectScreen(
      navigation,
      screen as never,
      {
        projectId: activeProjectId,
        projectName: activeProject?.name,
        ...params,
      },
      { fromHome: true },
    )
  }

  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = []
    for (const s of openSnags.slice(0, 2)) {
      const proj =
        typeof s.projectId === 'string'
          ? projectList.find((p) => p._id === s.projectId)?.name
          : null
      items.push({
        key: `snag-${s._id}`,
        tone: 'danger',
        icon: 'warning-outline',
        title: s.title || 'Open snag',
        body: s.assignee?.name ? `Assigned to ${s.assignee.name}` : 'Needs attention on site',
        meta: `${proj || activeProject?.name || 'Site'} Â· ${timeAgo(s.createdAt)}`,
        thumb: s.photo ? assetUrl(s.photo) : null,
        onPress: () => goMore('Snags', activeProjectId ? { projectId: activeProjectId } : undefined),
      })
    }
    for (const a of (data?.approvals || []).slice(0, 2)) {
      if (items.length >= 3) break
      items.push({
        key: `appr-${a._id}`,
        tone: 'warning',
        icon: 'time-outline',
        title: a.title || 'Awaiting approval',
        body: 'Submitted for review',
        meta: `${projectNameOf(a) || activeProject?.name || 'Project'} Â· ${timeAgo(a.updatedAt || a.createdAt)}`,
        onPress: () => navigation.navigate('TaskDetail', { taskId: a._id }),
      })
    }
    for (const n of (alerts.data || []).filter((x) => !x.read).slice(0, 3)) {
      if (items.length >= 3) break
      items.push({
        key: `n-${n._id}`,
        tone: 'warning',
        icon: 'notifications-outline',
        title: n.title,
        body: n.body || 'Needs a response',
        meta: timeAgo(n.createdAt),
        onPress: () => goMore('Notifications'),
      })
    }
    return items.slice(0, 3)
  }, [openSnags, data?.approvals, alerts.data, activeProject, activeProjectId, projectList])

  const recentUpdate = ((siteUpdates.data || []) as SiteUpdate[]).find((u) => {
    if (!activeProjectId) return true
    const pid = typeof u.projectId === 'object' ? u.projectId?._id : u.projectId
    return !pid || pid === activeProjectId
  }) || (siteUpdates.data || [])[0]

  const quickActions = (
    [
      {
        key: 'update',
        label: 'Post Update',
        icon: 'camera-outline' as const,
        color: colors.accentHover,
        bg: colors.accentSoft,
        visible: caps.siteFeed,
        onPress: () => goMore('PostSiteUpdate', activeProjectId ? { projectId: activeProjectId } : undefined),
      },
      {
        key: 'issue',
        label: 'Log Issue',
        icon: 'warning-outline' as const,
        color: colors.danger,
        bg: colors.dangerSoft,
        visible: caps.siteFeed,
        onPress: () => goMore('CreateSnag', activeProjectId ? { projectId: activeProjectId } : undefined),
      },
      {
        key: 'material',
        label: 'Request Material',
        icon: 'cart-outline' as const,
        color: colors.warning,
        bg: colors.warningSoft,
        visible: caps.procurement,
        onPress: () =>
          goMore('CreatePurchaseOrder', activeProjectId ? { projectId: activeProjectId } : undefined),
      },
      {
        key: 'photos',
        label: 'Site Photos',
        icon: 'images-outline' as const,
        color: colors.accent,
        bg: colors.accentSoft,
        visible: caps.siteFeed,
        onPress: () => goMore('SiteFeed', activeProjectId ? { projectId: activeProjectId } : undefined),
      },
    ] as const
  ).filter((a) => a.visible)

  if (!data && !isError) {
    return (
      <Screen padded={false} edges={['left', 'right']} background={colors.canvas}>
        <AppNavBar variant="hero" />
        <LoadingState label="Loading your workâ€¦" variant="home" />
      </Screen>
    )
  }

  if (isError) {
    return (
      <Screen padded={false} edges={['left', 'right']} background={colors.canvas}>
        <AppNavBar variant="hero" />
        <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
      </Screen>
    )
  }

  const focusStatusColor = focus ? colors.status[focus.status] || colors.accent : colors.accent
  const updateProject =
    recentUpdate?.projectId && typeof recentUpdate.projectId === 'object'
      ? recentUpdate.projectId.name
      : activeProject?.name
  const updatePhotos = recentUpdate?.photos || []
  const updateThumb = updatePhotos[0]?.url ? assetUrl(updatePhotos[0].url) : null

  const coverRange = 160

  /**
   * The hero and the sheet share one scroll, but only the sheet is meant to
   * travel: cancelling the scroll out of the hero one-for-one pins it in place
   * so the sheet slides up over it. The pin stops once the sheet has climbed
   * the hero's full height â€” past that the hero is completely covered, so
   * holding it any longer would just drag an invisible view down the screen.
   *
   * `heroHeight` is 0 for the first frame, before layout has run; the `max`
   * keeps the interpolation valid until a real height arrives.
   */
  const heroPin = scrollYNative.interpolate({
    inputRange: [0, Math.max(heroHeight, 1)],
    outputRange: [0, Math.max(heroHeight, 1)],
    extrapolate: 'clamp',
  })

  return (
      <Screen padded={false} edges={['left', 'right']} background={colors.canvas}>
      <AppNavBar variant="hero" scrollY={scrollY} coverRange={coverRange} />
      <View style={styles.root}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          nestedScrollEnabled
          bounces={!isWeb}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          onScroll={
            isWeb
              ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  scrollY.setValue(e.nativeEvent.contentOffset.y)
                }
              : Animated.event([{ nativeEvent: { contentOffset: { y: scrollYNative } } }], {
                  useNativeDriver: true,
                  listener: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
                    scrollY.setValue(e.nativeEvent.contentOffset.y),
                })
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch()
                alerts.refetch()
                siteUpdates.refetch()
                snags.refetch()
                projects.refetch()
              }}
              tintColor={colors.textPrimary}
              colors={[colors.textPrimary]}
            />
          }
        >
          <View style={styles.sheet}>
            {workView === 'all' ? null : (
              <View style={{ marginBottom: spacing.md }}>
                <Pressable onPress={() => setWorkView('all')} accessibilityRole="button">
                  <Text style={styles.backToDash}>Operations</Text>
                </Pressable>
                <ViewPills value={workView} onChange={setWorkView} />
              </View>
            )}

            {/*
              * A pill selection swaps what the sheet shows, in place. This used
              * to early-return a whole separate screen, which is why picking
              * Assigned/Today/Personal felt like being navigated away: the hero,
              * the navbar and the sheet all disappeared.
              */}
            {workView !== 'all' ? (
              <MyWorkViews
                embedded
                view={workView}
                onViewChange={setWorkView}
                onTaskPress={(t) => navigation.navigate('TaskDetail', { taskId: t._id })}
                onCreatePersonal={() => navigation.navigate('CreateTask', { isPersonal: true })}
                onOpenCalendar={() => goMore('ProfileHub', { screen: 'GoogleCalendar' })}
              />
            ) : (
              <OperationsDashboard
                userName={firstName(user?.name)}
                greeting={timeGreeting()}
                projects={projectList}
                overdueCount={overdueCount}
                approvalCount={(data?.approvals || []).length}
                updates={(siteUpdates.data || []) as SiteUpdate[]}
                canCreate={caps.projects}
                onOpenProject={(project) =>
                  openProjectScreen(
                    navigation,
                    "ProjectOverview",
                    { projectId: project._id, projectName: project.name },
                    { fromHome: true },
                  )
                }
                onNewProject={() => navigation.navigate("Projects", { screen: "CreateProject" } as never)}
                onOpenDispatch={() => goMore("SiteFeed")}
                onOpenOverdue={openMyTasks}
                onOpenApprovals={() => goMore("Approvals", undefined, true)}
              />
            )}
          </View>
        </Animated.ScrollView>

        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Projects</Text>
            {projectList.map((p) => (
              <Pressable
                key={p._id}
                style={styles.modalRow}
                onPress={() => {
                  setSelectedProjectId(p._id)
                  setPickerOpen(false)
                }}
              >
                <Text style={styles.modalRowText} numberOfLines={1}>
                  {p.name}
                </Text>
                {activeProjectId === p._id ? (
                  <Ionicons name="checkmark" size={18} color={colors.accentHover} />
                ) : null}
              </Pressable>
            ))}
            {!projectList.length ? (
              <Text style={styles.attentionEmpty}>No projects yet.</Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={tasksOpen} transparent animationType="fade" onRequestClose={() => setTasksOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTasksOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>My tasks</Text>
            {myTasks.map((t) => (
              <Pressable
                key={t._id}
                style={styles.modalRow}
                onPress={() => {
                  setTasksOpen(false)
                  navigation.navigate('TaskDetail', { taskId: t._id })
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.modalRowText} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.attentionEmpty} numberOfLines={1}>
                    {STATUS_LABELS[t.status] || t.status}
                    {projectNameOf(t) ? ` Â· ${projectNameOf(t)}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
            {!myTasks.length ? (
              <View style={styles.activityEmpty}>
                <Text style={styles.attentionEmpty}>No open tasks right now.</Text>
                <Pressable
                  style={styles.postBtn}
                  onPress={() => {
                    setTasksOpen(false)
                    navigation.navigate('CreateTask', { isPersonal: true })
                  }}
                >
                  <Text style={styles.postBtnText}>New task</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      </View>
    </Screen>
  )
}

function HealthTile({
  styles,
  icon,
  iconColor,
  iconBg,
  label,
  value,
  valueColor,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>
  icon: keyof typeof Ionicons.glyphMap
  iconColor: string
  iconBg: string
  label: string
  value: string
  valueColor: string
  onPress?: () => void
}) {
  return (
    <Pressable
      style={styles.healthTile}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <View style={[styles.healthIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={[styles.healthValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  )
}

function createStyles(
  c: AppColors,
  sh: ReturnType<typeof useShadows>,
  pagePadding: number,
  isCompact: boolean,
  windowHeight: number,
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.canvas,
    },
    backToDash: {
      ...typography.captionStrong,
      color: c.textSecondary,
      marginBottom: spacing.sm,
    },
    scrollView: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scroll: {
      flexGrow: 1,
      backgroundColor: 'transparent',
    },
    /**
     * Sits under the sheet in the same scroll. `zIndex` is what guarantees the
     * sheet paints on top on Android, where the elevation on the cards inside
     * it would otherwise decide the order for us.
     *
     * Web uses sticky instead of a JS translateY pin â€” mapping scroll to a CSS
     * transform on the same node that is also scrolling is what shook the hero.
     */
    heroLayer: {
      zIndex: 0,
      ...(Platform.OS === 'web'
        ? ({
            position: 'sticky',
            top: 0,
            backfaceVisibility: 'hidden',
          } as object)
        : { backfaceVisibility: 'hidden' as const }),
    },
    heroInner: {
      paddingHorizontal: pagePadding,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.lg + 4,
    },
    heroHelloLine: {
      ...typography.h3,
      fontSize: 18,
      color: HERO.mute,
    },
    heroHelloName: {
      color: HERO.white,
      fontWeight: '700',
    },
    heroStatBlock: {
      gap: 4,
    },
    heroStatLabel: {
      ...typography.captionStrong,
      color: HERO.lime,
    },
    heroStatValue: {
      fontSize: isCompact ? 40 : 48,
      fontWeight: '700',
      color: HERO.white,
      letterSpacing: -1.2,
      lineHeight: isCompact ? 46 : 54,
    },
    heroStatUnit: {
      fontSize: 22,
      fontWeight: '600',
      color: HERO.mute,
    },
    heroStatHint: {
      ...typography.caption,
      color: HERO.mute,
      marginTop: 2,
    },
    heroCtas: {
      flexDirection: 'row',
      gap: 16,
      marginTop: spacing.sm,
    },
    heroCta: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 50,
      borderRadius: radius.full,
      backgroundColor: HERO.lime,
      paddingHorizontal: spacing.md,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
    },
    heroCtaPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    heroCtaText: {
      ...typography.bodyStrong,
      color: HERO.limeText,
    },
    heroPanel: {
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      backgroundColor: HERO.panel,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.12)',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      gap: 8,
    },
    heroPanelLabel: {
      ...typography.micro,
      color: HERO.mute,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    heroProjectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 28,
    },
    heroProjectName: {
      ...typography.bodyStrong,
      color: HERO.white,
      flex: 1,
      minWidth: 0,
    },
    sheet: {
      backgroundColor: c.canvas,
      zIndex: 1,
      paddingBottom: TAB_BAR_CLEARANCE + spacing.xl,
      gap: spacing.md,
      minHeight: Math.max(windowHeight - 100, 520),
      ...(Platform.OS === 'web'
        ? ({
            position: 'relative',
          } as object)
        : null),
    },
    healthRow: { flexDirection: 'row', gap: 8 },
    healthTile: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 4,
      ...sh.card,
    },
    healthIcon: {
      width: 28,
      height: 28,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    healthLabel: { ...typography.micro, color: c.textMuted },
    healthValue: { ...typography.captionStrong, fontSize: 11, textAlign: 'center' },
    focusCard: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      gap: 8,
      ...sh.card,
    },
    focusEmpty: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: 140,
      ...sh.card,
    },
    focusTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusPillText: { ...typography.micro },
    focusHeroIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.lg,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    focusTitle: { ...typography.h3, fontSize: 18, color: c.textPrimary },
    focusMeta: { ...typography.caption, color: c.textSecondary },
    progressTrack: {
      height: 8,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
      overflow: 'hidden',
      marginTop: 4,
    },
    progressFill: { height: '100%', backgroundColor: c.accent, borderRadius: radius.full },
    focusFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    focusRemaining: { ...typography.caption, color: c.textSecondary },
    focusArrow: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.cta,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attentionCard: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      ...sh.card,
    },
    attentionEmpty: {
      ...typography.caption,
      color: c.textSecondary,
      padding: spacing.lg,
    },
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    attentionRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    attentionIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attentionCopy: { flex: 1, minWidth: 0, gap: 2 },
    attentionTitle: { ...typography.bodyStrong, color: c.textPrimary },
    attentionBody: { ...typography.caption, color: c.textSecondary },
    attentionMeta: { ...typography.micro, color: c.textMuted },
    attentionThumb: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceRaised,
    },
    actionsRow: { flexDirection: 'row', gap: 8 },
    actionCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 6,
      alignItems: 'center',
      gap: 8,
      ...sh.card,
    },
    actionIconWell: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      ...typography.micro,
      color: c.textPrimary,
      textAlign: 'center',
      fontWeight: '600',
    },
    activityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      ...sh.card,
    },
    activityCopy: { flex: 1, minWidth: 0, gap: 2 },
    activityProject: { ...typography.captionStrong, color: c.textPrimary },
    activityNote: { ...typography.caption, color: c.textSecondary },
    activityMeta: { ...typography.micro, color: c.textMuted },
    activityThumbWrap: { position: 'relative' },
    activityThumb: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      backgroundColor: c.surfaceRaised,
    },
    activityThumbFallback: { alignItems: 'center', justifyContent: 'center' },
    photoBadge: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: radius.full,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    photoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    activityEmpty: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
      gap: spacing.sm,
      ...sh.card,
    },
    postBtn: {
      alignSelf: 'flex-start',
      backgroundColor: c.accentSoft,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    postBtnText: { ...typography.captionStrong, color: c.accentHover },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: 4,
      maxHeight: '70%',
    },
    modalTitle: { ...typography.h3, color: c.textPrimary, marginBottom: spacing.sm },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalRowText: { ...typography.body, color: c.textPrimary, flex: 1, paddingRight: 12 },
  })
}
