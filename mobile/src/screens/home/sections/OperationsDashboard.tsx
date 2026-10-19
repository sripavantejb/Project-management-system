import { useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Avatar } from '../../../components/Avatar'
import { stageLabel, typography, type AppColors } from '../../../constants/theme'
import { useColors } from '../../../theme/useColors'
import { assetUrl } from '../../../constants/env'
import type { Project } from '../../../types/models'
import type { SiteUpdate } from '../../../types/ops'
import { timeAgo } from '../../../utils/time'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'design', label: 'Concept' },
  { key: 'planning', label: 'Detailed Design' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'execution', label: 'Execution' },
  { key: 'handover', label: 'Handover' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

type Props = {
  userName: string
  greeting: string
  projects: Project[]
  overdueCount: number
  approvalCount: number
  updates: SiteUpdate[]
  canCreate: boolean
  onOpenProject: (project: Project) => void
  onNewProject: () => void
  onOpenDispatch: () => void
  onOpenOverdue: () => void
  onOpenApprovals: () => void
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function shortDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function daySpan(project: Project) {
  if (!project.startDate || !project.endDate) return null
  const start = new Date(project.startDate).getTime()
  const end = new Date(project.endDate).getTime()
  if (!start || !end || end <= start) return null
  const now = Date.now()
  const total = Math.max(1, Math.round((end - start) / 86400000))
  const day = Math.min(total, Math.max(1, Math.round((now - start) / 86400000)))
  return `Day ${day} / ${total}`
}

function toneFor(project: Project) {
  if (project.status === 'delayed' || project.isDelayed) {
    return { label: 'Delayed', color: '#9e3b3b', bg: '#ffdad6' }
  }
  if (project.status === 'on_hold') {
    return { label: 'On hold', color: '#7a573b', bg: '#f3e6d4' }
  }
  if (project.status === 'completed') {
    return { label: 'Complete', color: '#2d5a46', bg: '#e4f3ea' }
  }
  return { label: 'On track', color: '#2d5a46', bg: '#e4f3ea' }
}

export function OperationsDashboard({
  userName,
  greeting,
  projects,
  overdueCount,
  approvalCount,
  updates,
  canCreate,
  onOpenProject,
  onNewProject,
  onOpenDispatch,
  onOpenOverdue,
  onOpenApprovals,
}: Props) {
  const colors = useColors()
  const { width } = useWindowDimensions()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const spotlightWidth = Math.min(width - 64, 320)

  const active = projects.filter((p) => p.status !== 'completed')
  const visible = projects.filter((p) => {
    if (filter !== 'all' && p.currentStage !== filter) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [p.name, p.clientName, p.location, p.code].filter(Boolean).join(' ').toLowerCase().includes(q)
  })
  const spotlight = visible.slice(0, 8)

  const dispatch = updates.slice(0, 3)

  return (
    <View style={styles.wrap}>
      <View style={styles.kickerRow}>
        <Text style={styles.kicker}>Operations control</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Studio live</Text>
        </View>
      </View>

      <Text style={styles.hello}>
        {greeting}, {userName}
      </Text>
      <Text style={styles.sub}>
        {active.length} active project{active.length === 1 ? '' : 's'}
        {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
        {approvalCount > 0 ? ` · ${approvalCount} waiting on approval` : ''}
      </Text>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Active projects</Text>
          <Text style={styles.metricValue}>{pad(active.length)}</Text>
          <Text style={styles.metricHint}>In the studio</Text>
        </View>
        <Pressable style={styles.metric} onPress={onOpenOverdue} accessibilityRole="button">
          <Text style={[styles.metricLabel, overdueCount > 0 && styles.metricLabelDanger]}>Overdue</Text>
          <Text style={[styles.metricValue, overdueCount > 0 && styles.metricValueDanger]}>{pad(overdueCount)}</Text>
          <Text style={styles.metricHint}>Milestones at risk</Text>
        </Pressable>
        <Pressable style={styles.metric} onPress={onOpenApprovals} accessibilityRole="button">
          <Text style={styles.metricLabel}>Approvals</Text>
          <Text style={styles.metricValue}>{pad(approvalCount)}</Text>
          <Text style={styles.metricHint}>Waiting on you</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search projects, client, location…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((item) => {
          const on = filter === item.key
          const count =
            item.key === 'all'
              ? projects.length
              : projects.filter((p) => p.currentStage === item.key).length
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {item.label} ({count})
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {spotlight.length > 0 ? (
        <View style={styles.spotHead}>
          <Text style={styles.dispatchTitle}>Spotlight</Text>
          <Text style={styles.spotHint}>Swipe</Text>
        </View>
      ) : null}
      {spotlight.length > 0 ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={spotlightWidth + 12}
          snapToAlignment="start"
          contentContainerStyle={styles.spotRow}
        >
          {spotlight.map((project, index) => (
            <SpotlightCard
              key={project._id}
              project={project}
              index={index}
              width={spotlightWidth}
              onPress={() => onOpenProject(project)}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.dispatchHead}>
        <Text style={styles.dispatchTitle}>All projects</Text>
        <Text style={styles.spotHint}>
          {visible.length} of {projects.length}
        </Text>
      </View>
      {visible.length === 0 ? (
        <Text style={styles.empty}>No projects in this view.</Text>
      ) : (
        visible.map((project, index) => (
          <ProjectCard
            key={project._id}
            project={project}
            index={index}
            styles={styles}
            colors={colors}
            onPress={() => onOpenProject(project)}
          />
        ))
      )}

      <View style={styles.dispatchHead}>
        <Text style={styles.dispatchTitle}>Daily site dispatch</Text>
        <Pressable onPress={onOpenDispatch} accessibilityRole="button">
          <Text style={styles.dispatchLink}>View live log</Text>
        </Pressable>
      </View>
      {dispatch.length === 0 ? (
        <Text style={styles.empty}>No site updates yet.</Text>
      ) : (
        dispatch.map((update) => {
          const projectName =
            update.projectId && typeof update.projectId === 'object' ? update.projectId.name : 'Site'
          return (
            <Pressable key={update._id} style={styles.dispatchRow} onPress={onOpenDispatch} accessibilityRole="button">
              <View style={styles.dispatchDot} />
              <View style={styles.dispatchCopy}>
                <Text style={styles.dispatchWhen}>
                  {timeAgo(update.createdAt)} · {projectName}
                </Text>
                <Text style={styles.dispatchNote} numberOfLines={2}>
                  {update.note}
                </Text>
                <Text style={styles.dispatchMeta} numberOfLines={1}>
                  {update.author?.name || 'Site crew'}
                </Text>
              </View>
            </Pressable>
          )
        })
      )}

      {canCreate ? (
        <Pressable style={styles.newBtn} onPress={onNewProject} accessibilityRole="button" accessibilityLabel="New project">
          <Ionicons name="add" size={18} color="#ffffff" />
          <Text style={styles.newBtnText}>New project</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  return letters.toUpperCase() || 'PR'
}

function Cover({
  project,
  style,
  markStyle,
}: {
  project: Project
  style: object
  markStyle: object
}) {
  const cover = project.coverImage ? assetUrl(project.coverImage) : null
  if (cover) return <Image source={{ uri: cover }} style={style} />
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e2022' }]}>
      <Text style={markStyle}>{initials(project.name)}</Text>
    </View>
  )
}

function SpotlightCard({
  project,
  index,
  width,
  onPress,
}: {
  project: Project
  index: number
  width: number
  onPress: () => void
}) {
  const tone = toneFor(project)
  const progress = Math.max(0, Math.min(100, Math.round(project.progress || 0)))
  return (
    <Pressable style={[spot.card, { width }]} onPress={onPress} accessibilityRole="button">
      <Cover project={project} style={spot.cover} markStyle={spot.mark} />
      <View style={spot.shade} />
      <View style={spot.top}>
        <Text style={[spot.badge, { color: tone.color, backgroundColor: tone.bg }]}>{tone.label}</Text>
        <Text style={spot.index}>{pad(index + 1)}</Text>
      </View>
      <View style={spot.copy}>
        <Text style={spot.title} numberOfLines={2}>
          {project.name}
        </Text>
        <Text style={spot.meta} numberOfLines={1}>
          {[project.clientName, project.location].filter(Boolean).join(' · ') || stageLabel(project.currentStage)}
        </Text>
        <View style={spot.track}>
          <View style={[spot.fill, { width: `${Math.max(progress, 4)}%` }]} />
        </View>
      </View>
    </Pressable>
  )
}

const spot = StyleSheet.create({
  card: {
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1e2022',
  },
  cover: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(30,32,34,0.28)',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  badge: {
    ...typography.micro,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  index: { color: '#ffffff', fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  copy: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 4 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  meta: { color: 'rgba(255,255,255,0.82)', fontSize: 12 },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 6, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2, backgroundColor: '#e7d3c1' },
  mark: { color: '#e7d3c1', fontSize: 42, fontWeight: '500', letterSpacing: 1 },
})

function ProjectCard({
  project,
  index,
  styles,
  colors,
  onPress,
}: {
  project: Project
  index: number
  styles: ReturnType<typeof createStyles>
  colors: AppColors
  onPress: () => void
}) {
  const tone = toneFor(project)
  const progress = Math.max(0, Math.min(100, Math.round(project.progress || 0)))
  const pm = project.projectManager?.name
  const due = shortDate(project.endDate)
  const span = daySpan(project)

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
      <Cover project={project} style={styles.banner} markStyle={styles.bannerMark} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.badge, { color: tone.color, backgroundColor: tone.bg }]}>{tone.label}</Text>
          <Text style={styles.index}>{pad(index + 1)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {project.name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[project.clientName, project.location].filter(Boolean).join(' · ') || 'Interior project'}
        </Text>
        <Text style={styles.stage}>
          {stageLabel(project.currentStage) || 'In studio'}
          {span ? `  ·  ${span}` : ''}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress}%`, backgroundColor: progress > 0 ? colors.accent : 'transparent' }]} />
          </View>
          <Text style={styles.pct}>{progress}%</Text>
        </View>
        <View style={styles.cardFoot}>
          <View style={styles.pm}>
            <Avatar name={pm || project.clientName} size={22} />
            <Text style={styles.pmName} numberOfLines={1}>
              {pm || 'Unassigned'}
            </Text>
          </View>
          {due ? <Text style={styles.due}>Due {due}</Text> : null}
        </View>
      </View>
    </Pressable>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 12 },
    kickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kicker: {
      ...typography.micro,
      color: c.textMuted,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#f4f3f1',
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2d5a46' },
    liveText: { ...typography.micro, color: c.textSecondary },
    hello: {
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '500',
      letterSpacing: -0.6,
      color: c.textPrimary,
    },
    sub: { ...typography.caption, color: c.textSecondary, marginTop: -4 },
    metrics: { flexDirection: 'row', gap: 8, marginTop: 4 },
    metric: {
      flex: 1,
      backgroundColor: '#ffffff',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      minHeight: 92,
    },
    metricLabel: { ...typography.micro, color: c.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
    metricLabelDanger: { color: '#9e3b3b' },
    metricValue: { fontSize: 28, fontWeight: '500', color: c.textPrimary, letterSpacing: -0.8, marginTop: 4 },
    metricValueDanger: { color: '#9e3b3b' },
    metricHint: { ...typography.micro, color: c.textMuted, marginTop: 2, fontWeight: '400' },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#ffffff',
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      minHeight: 44,
    },
    searchInput: { flex: 1, ...typography.body, color: c.textPrimary, paddingVertical: 8 },
    chips: { gap: 8, paddingVertical: 2 },
    chip: {
      borderRadius: 4,
      backgroundColor: '#efeeec',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    chipOn: { backgroundColor: '#1e2022' },
    chipText: { ...typography.captionStrong, color: '#44474a' },
    chipTextOn: { color: '#ffffff' },
    empty: { ...typography.caption, color: c.textSecondary, paddingVertical: 8 },
    spotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    spotHint: { ...typography.micro, color: c.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
    spotRow: { gap: 12, paddingRight: 8 },
    card: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    banner: { width: '100%', height: 132, backgroundColor: '#1e2022' },
    bannerMark: { color: '#e7d3c1', fontSize: 36, fontWeight: '500', letterSpacing: 1 },
    cardBody: { padding: 14, gap: 6 },
    index: { ...typography.micro, color: c.textMuted, letterSpacing: 0.6 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
    badge: {
      ...typography.micro,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      overflow: 'hidden',
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    span: { ...typography.micro, color: c.textMuted, fontWeight: '500' },
    thumb: { width: 56, height: 44, borderRadius: 6, backgroundColor: '#f4f3f1' },
    cardTitle: { fontSize: 18, fontWeight: '500', color: c.textPrimary, letterSpacing: -0.3 },
    cardMeta: { ...typography.caption, color: c.textSecondary },
    stage: { ...typography.micro, color: '#7a573b', letterSpacing: 0.4, textTransform: 'uppercase' },
    track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#efeeec', overflow: 'hidden' },
    fill: { height: 3, borderRadius: 2 },
    pct: { ...typography.micro, color: c.textMuted, alignSelf: 'flex-end' },
    cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    pm: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    pmName: { ...typography.caption, color: c.textPrimary, flex: 1 },
    due: { ...typography.micro, color: c.textMuted },
    dispatchHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    dispatchTitle: { fontSize: 18, fontWeight: '500', color: c.textPrimary },
    dispatchLink: { ...typography.micro, color: c.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
    dispatchRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
    dispatchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1e2022', marginTop: 6 },
    dispatchCopy: { flex: 1, gap: 2 },
    dispatchWhen: { ...typography.captionStrong, color: c.textPrimary },
    dispatchNote: { ...typography.caption, color: c.textSecondary },
    dispatchMeta: { ...typography.micro, color: c.textMuted, fontWeight: '400' },
    newBtn: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#1e2022',
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 8,
    },
    newBtnText: { color: '#ffffff', ...typography.captionStrong },
  })
}
