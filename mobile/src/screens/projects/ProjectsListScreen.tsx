import { useMemo, useState } from 'react'
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { Screen } from '../../components/Screen'
import { SearchField } from '../../components/SearchField'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { formatInr, spacing, stageLabel, TAB_BAR_CLEARANCE, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { projectsApi } from '../../api/projects'
import { isApiError } from '../../api/client'
import { assetUrl } from '../../constants/env'
import { useAuthStore } from '../../store/authStore'
import { capabilitiesForUser } from '../../utils/roles'
import type { Project } from '../../types/models'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProjectStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<ProjectStackParamList, 'ProjectsList'>

const FILTERS = [
  { key: 'all', label: 'All projects' },
  { key: 'design', label: 'Design' },
  { key: 'planning', label: 'Planning' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'execution', label: 'On site' },
  { key: 'handover', label: 'Handover' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function compactInr(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)} Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`
  return formatInr(n)
}

function toneFor(project: Project) {
  if (project.status === 'delayed' || project.isDelayed) return { label: 'Delayed', color: '#9e3b3b', bg: '#ffdad6' }
  if (project.status === 'on_hold') return { label: 'On hold', color: '#7a573b', bg: '#f3e6d4' }
  if (project.status === 'completed') return { label: 'Complete', color: '#2d5a46', bg: '#e4f3ea' }
  return { label: 'In progress', color: '#2d5a46', bg: '#e4f3ea' }
}

export function ProjectsListScreen({ navigation }: Props) {
  const colors = useColors()
  const { pagePadding } = useResponsive()
  const styles = useMemo(() => createStyles(colors, pagePadding), [colors, pagePadding])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const user = useAuthStore((s) => s.user)
  const caps = capabilitiesForUser(user)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  })

  const projects = data || []
  const active = projects.filter((p) => p.status !== 'completed')
  const delayed = projects.filter((p) => p.status === 'delayed' || p.isDelayed)
  const pipeline = projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...projects]
      .filter((p) => (filter === 'all' ? true : p.currentStage === filter))
      .filter((p) => {
        if (!q) return true
        return [p.name, p.clientName, p.location, p.code].filter(Boolean).join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [projects, search, filter])

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.textPrimary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <Text style={styles.kicker}>Projects</Text>
              {caps.createProject ? (
                <Pressable
                  onPress={() => navigation.navigate('CreateProject')}
                  style={styles.addBtn}
                  accessibilityRole="button"
                  accessibilityLabel="New project"
                >
                  <Ionicons name="add" size={18} color="#ffffff" />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.title}>Projects directory</Text>
            <Text style={styles.subtitle}>
              {active.length} active · {projects.length} in the studio
            </Text>

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{String(active.length).padStart(2, '0')}</Text>
                <Text style={styles.metricLabel}>Active</Text>
              </View>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, delayed.length > 0 && styles.metricDanger]}>
                  {String(delayed.length).padStart(2, '0')}
                </Text>
                <Text style={styles.metricLabel}>Delayed</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValueSm}>{compactInr(pipeline)}</Text>
                <Text style={styles.metricLabel}>Pipeline</Text>
              </View>
            </View>

            <SearchField value={search} onChangeText={setSearch} placeholder="Search projects, clients, or codes" />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FILTERS.map((item) => {
                const on = filter === item.key
                return (
                  <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <Text style={styles.sort}>Sorted by latest update · {filtered.length}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <DirectoryCard
            project={item}
            onPress={() =>
              navigation.navigate('ProjectOverview', {
                projectId: item._id,
                projectName: item.name,
              })
            }
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <LoadingState label="Loading projects…" variant="cards" />
          ) : isError ? (
            <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon="folder-open-outline"
              title={search || filter !== 'all' ? 'No matching projects' : 'No projects yet'}
              body={search || filter !== 'all' ? 'Try another name or stage.' : 'New projects will appear here.'}
            />
          )
        }
      />
    </Screen>
  )
}

function DirectoryCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const colors = useColors()
  const styles = useMemo(() => cardStyles(colors), [colors])
  const tone = toneFor(project)
  const progress = Math.min(100, Math.round(project.progress || 0))
  const cover = project.coverImage ? assetUrl(project.coverImage) : null
  const stage = stageLabel(project.currentStage)

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.94 }]} accessibilityRole="button">
      <View style={styles.coverWrap}>
        {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : <View style={styles.coverFallback} />}
        <View style={styles.coverTop}>
          <Text style={[styles.badge, { color: tone.color, backgroundColor: tone.bg }]}>
            {stage ? `${stage} · ` : ''}
            {tone.label}
          </Text>
          <Text style={styles.pct}>{progress}%</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {[project.code, project.type].filter(Boolean).join(' · ') || 'Interior project'}
          </Text>
          <Text style={styles.client} numberOfLines={1}>
            {project.clientName}
          </Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {project.name}
        </Text>
        {project.location ? (
          <Text style={styles.location} numberOfLines={1}>
            {project.location}
          </Text>
        ) : null}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.foot}>
          <View>
            <Text style={styles.valueLabel}>Contract value</Text>
            <Text style={styles.value}>{project.budget ? formatInr(project.budget) : '—'}</Text>
          </View>
          <View style={styles.openBtn}>
            <Text style={styles.openText}>Open workspace</Text>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

function createStyles(c: AppColors, pagePadding: number) {
  return StyleSheet.create({
    listContent: {
      paddingHorizontal: pagePadding,
      paddingBottom: TAB_BAR_CLEARANCE + spacing.xl,
      gap: 14,
    },
    header: { gap: 10, paddingTop: 8, paddingBottom: 4 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kicker: { ...typography.micro, color: c.textMuted, letterSpacing: 1.4, textTransform: 'uppercase' },
    addBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#1e2022',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 32, lineHeight: 36, fontWeight: '500', letterSpacing: -0.6, color: c.textPrimary },
    subtitle: { ...typography.caption, color: c.textSecondary, marginTop: -4 },
    metrics: { flexDirection: 'row', gap: 8, marginTop: 4 },
    metric: {
      flex: 1,
      backgroundColor: '#ffffff',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    metricValue: { fontSize: 26, fontWeight: '500', color: c.textPrimary, letterSpacing: -0.6 },
    metricValueSm: { fontSize: 16, fontWeight: '600', color: c.textPrimary, marginTop: 6 },
    metricDanger: { color: '#9e3b3b' },
    metricLabel: { ...typography.micro, color: c.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
    chips: { gap: 8, paddingVertical: 4 },
    chip: { borderRadius: 4, backgroundColor: '#efeeec', paddingHorizontal: 12, paddingVertical: 8 },
    chipOn: { backgroundColor: '#1e2022' },
    chipText: { ...typography.captionStrong, color: '#44474a' },
    chipTextOn: { color: '#ffffff' },
    sort: { ...typography.micro, color: c.textMuted, letterSpacing: 0.3 },
  })
}

function cardStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    coverWrap: { height: 168, backgroundColor: '#e7e1d8' },
    cover: { width: '100%', height: '100%' },
    coverFallback: { flex: 1, backgroundColor: '#1e2022' },
    coverTop: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    badge: {
      ...typography.micro,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      borderRadius: 4,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      maxWidth: '75%',
    },
    pct: {
      color: '#1e2022',
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: 4,
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 12,
      fontWeight: '700',
    },
    body: { padding: 14, gap: 6 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    meta: { ...typography.micro, color: '#7a573b', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
    client: { ...typography.micro, color: c.textMuted, flexShrink: 1 },
    name: { fontSize: 22, fontWeight: '500', letterSpacing: -0.3, color: c.textPrimary },
    location: { ...typography.caption, color: c.textSecondary },
    track: { height: 3, borderRadius: 2, backgroundColor: '#efeeec', overflow: 'hidden', marginTop: 4 },
    fill: { height: 3, backgroundColor: '#a27b5c' },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    valueLabel: { ...typography.micro, color: c.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
    value: { ...typography.captionStrong, color: c.textPrimary, marginTop: 2 },
    openBtn: { backgroundColor: '#1e2022', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10 },
    openText: { color: '#ffffff', ...typography.micro, letterSpacing: 0.6, textTransform: 'uppercase' },
  })
}
