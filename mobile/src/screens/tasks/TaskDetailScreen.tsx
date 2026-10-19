import { NestedChrome } from '../../components/NestedChrome'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Avatar } from '../../components/Avatar'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { LoadingState, ErrorState } from '../../components/States'
import { TAB_BAR_CLEARANCE } from '../../components/GlassyTabBar'
import { PRIORITY_LABELS, STATUS_LABELS, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { tasksApi } from '../../api/tasks'
import { isApiError } from '../../api/client'
import { formatTrackedSeconds, liveTrackedSeconds, timeAgo } from '../../utils/time'
import { assetUrl } from '../../constants/env'
import type { ChecklistItem, TaskStatus } from '../../types/models'
import type { RouteProp } from '@react-navigation/native'
import type { HomeStackParamList } from '../../navigation/types'

const STATUS_FLOW: TaskStatus[] = ['todo', 'in_progress', 'review', 'done']

type Props = { route: RouteProp<HomeStackParamList, 'TaskDetail'> }

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function estimateLabel(minutes?: number | null) {
  if (!minutes) return 'Not set'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

export function TaskDetailScreen({ route }: Props) {
  const colors = useColors()
  const { listContent, pagePadding } = useResponsive()
  const styles = useMemo(() => createStyles(colors, pagePadding), [colors, pagePadding])

  const { taskId } = route.params
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [checkDraft, setCheckDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [feedTab, setFeedTab] = useState<'all' | 'comments'>('all')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    queryClient.invalidateQueries({ queryKey: ['home'] })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['active-timer'] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => tasksApi.update(taskId, { status }),
    onSuccess: invalidate,
  })

  const checklistMutation = useMutation({
    mutationFn: (checklist: ChecklistItem[]) => tasksApi.update(taskId, { checklist }),
    onSuccess: invalidate,
  })

  const commentMutation = useMutation({
    mutationFn: (body: string) => tasksApi.addComment(taskId, body),
    onSuccess: () => {
      setComment('')
      invalidate()
    },
  })

  const timerMutation = useMutation({
    mutationFn: async () => {
      const task = data?.task
      if (!task) return
      if (task.timeTrackingStartedAt) {
        return tasksApi.update(taskId, {
          timeSpent: liveTrackedSeconds(task.timeSpent, task.timeTrackingStartedAt),
          timeTrackingStartedAt: null,
          timeTrackingUserId: null,
        })
      }
      return tasksApi.update(taskId, { timeTrackingStartedAt: new Date().toISOString() })
    },
    onSuccess: invalidate,
  })

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!data?.task.timeTrackingStartedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [data?.task.timeTrackingStartedAt])

  const projectName =
    data?.task.projectId && typeof data.task.projectId === 'object' ? data.task.projectId.name : 'Project'
  const chromeProps = {
    title: projectName,
    compactHeader: true,
  }

  if (isLoading) {
    return (
      <NestedChrome {...chromeProps}>
        <LoadingState label="Loading task…" variant="detail" />
      </NestedChrome>
    )
  }
  if (isError || !data) {
    return (
      <NestedChrome {...chromeProps}>
        <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
      </NestedChrome>
    )
  }

  const { task, comments, activity } = data
  const assignee = task.assignee && typeof task.assignee === 'object' ? task.assignee : null
  const author = task.createdBy && typeof task.createdBy === 'object' ? task.createdBy : null
  const checks = task.checklist || []
  const doneCount = checks.filter((item) => item.done).length
  const progress = checks.length ? Math.round((doneCount / checks.length) * 100) : 0
  const feed = [
    ...activity.map((item) => ({
      id: item._id,
      name: item.actor?.name || 'Studio',
      avatar: item.actor?.avatar,
      body: item.message,
      at: item.createdAt,
    })),
    ...comments.map((item) => ({
      id: `c-${item._id}`,
      name: item.author?.name || 'Someone',
      avatar: item.author?.avatar,
      body: item.body,
      at: item.createdAt,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <NestedChrome {...chromeProps} keyboardAvoiding>
      <FlatList
        data={feedTab === 'comments' ? feed.filter((item) => item.id.startsWith('c-')) : feed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[listContent, styles.listGrow, { paddingBottom: 28 }]}
        ListHeaderComponent={
          <View style={styles.stack}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>Task</Text>
                <Text style={styles.title}>{task.title}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{STATUS_LABELS[task.status] || task.status}</Text>
              </View>
            </View>

            <View style={styles.metricBar}>
              <Pressable style={styles.metric} onPress={() => timerMutation.mutate()} disabled={timerMutation.isPending}>
                <View style={styles.metricLabelRow}>
                  <View style={[styles.liveDot, task.timeTrackingStartedAt && styles.liveDotOn]} />
                  <Text style={styles.metricLabel}>{task.timeTrackingStartedAt ? 'Live' : 'Tracked'}</Text>
                </View>
                <Text style={styles.metricValue}>
                  {formatTrackedSeconds(liveTrackedSeconds(task.timeSpent, task.timeTrackingStartedAt, now))}
                </Text>
              </Pressable>
              <View style={styles.metricRule} />
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Estimated</Text>
                <Text style={styles.metricValue}>{estimateLabel(task.timeEstimate)}</Text>
              </View>
              <View style={styles.metricRule} />
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Priority</Text>
                <Text style={styles.metricValue}>{PRIORITY_LABELS[task.priority] || 'Normal'}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.split}>
                <View style={styles.half}>
                  <Text style={styles.label}>Assignee</Text>
                  <View style={styles.person}>
                    <Avatar name={assignee?.name || 'Unassigned'} uri={assignee?.avatar} size={28} />
                    <Text style={styles.personName} numberOfLines={1}>
                      {assignee?.name || 'Unassigned'}
                    </Text>
                  </View>
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Assigned by</Text>
                  <View style={styles.person}>
                    <Avatar name={author?.name || 'Studio'} uri={author?.avatar} size={28} />
                    <Text style={styles.personName} numberOfLines={1}>
                      {author?.name || 'Studio'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.split}>
                <View style={styles.half}>
                  <Text style={styles.label}>Start</Text>
                  <Text style={styles.value}>{shortDate(task.startDate)}</Text>
                </View>
                <View style={styles.half}>
                  <Text style={styles.label}>Due</Text>
                  <Text style={styles.value}>{shortDate(task.dueDate)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Tags</Text>
              <View style={styles.tags}>
                {(task.tags || []).map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    #{tag}
                  </Text>
                ))}
              </View>
              <Input
                placeholder="Add a tag"
                value={tagDraft}
                onChangeText={setTagDraft}
                autoCapitalize="none"
                onSubmitEditing={() => {
                  const tag = tagDraft.trim()
                  if (!tag) return
                  tasksApi.update(taskId, { tags: [...(task.tags || []), tag] }).then(invalidate)
                  setTagDraft('')
                }}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.kickerGold}>Specification</Text>
              <Text style={styles.section}>Description</Text>
              <Text style={styles.body}>{task.description || 'No description yet. Add the scope when you edit this task.'}</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>Checklist</Text>
                <Text style={styles.progress}>{progress}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.when}>
                {doneCount} of {checks.length} complete
              </Text>
              {checks.map((item, index) => (
                <Pressable
                  key={item._id || `${item.text}-${index}`}
                  style={styles.checkRow}
                  onPress={() => {
                    const next = checks.map((row, i) => (i === index ? { ...row, done: !row.done } : row))
                    checklistMutation.mutate(next)
                  }}
                >
                  <View style={[styles.box, item.done && styles.boxOn]}>{item.done ? <Text style={styles.tick}>✓</Text> : null}</View>
                  <Text style={[styles.checkText, item.done && styles.checkDone]}>{item.text}</Text>
                </Pressable>
              ))}
              <View style={styles.addRow}>
                <Input
                  placeholder="Add checklist point"
                  value={checkDraft}
                  onChangeText={setCheckDraft}
                  containerStyle={{ flex: 1 }}
                  onSubmitEditing={() => {
                    const text = checkDraft.trim()
                    if (!text) return
                    checklistMutation.mutate([...checks, { text, done: false }])
                    setCheckDraft('')
                  }}
                />
              </View>
            </View>

            {(task.attachments || []).length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.section}>Visual records</Text>
                <View style={styles.photos}>
                  {task.attachments!.map((file) => (
                    <Image key={file.url} source={{ uri: assetUrl(file.url) }} style={styles.photo} />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.label}>Move this task</Text>
              <View style={styles.badgeRow}>
                {STATUS_FLOW.map((key) => {
                  const on = task.status === key
                  return (
                    <Pressable
                      key={key}
                      onPress={() => statusMutation.mutate(key)}
                      disabled={statusMutation.isPending}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{STATUS_LABELS[key]}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.section}>Activity</Text>
              <View style={styles.badgeRow}>
                {(['all', 'comments'] as const).map((key) => (
                  <Pressable key={key} onPress={() => setFeedTab(key)} style={[styles.chip, feedTab === key && styles.chipOn]}>
                    <Text style={[styles.chipText, feedTab === key && styles.chipTextOn]}>
                      {key === 'all' ? 'All' : 'Comments'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.feed}>
            <Avatar name={item.name} uri={item.avatar} size={28} />
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{item.name}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.when}>{timeAgo(item.at)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.when}>No activity yet.</Text>}
      />
      <View style={styles.composer}>
        <Input
          placeholder="Write a comment"
          value={comment}
          onChangeText={setComment}
          containerStyle={{ flex: 1 }}
        />
        <Button
          title="Send"
          size="sm"
          onPress={() => comment.trim() && commentMutation.mutate(comment.trim())}
          loading={commentMutation.isPending}
          disabled={!comment.trim()}
        />
      </View>
    </NestedChrome>
  )
}

function createStyles(c: AppColors, pagePadding: number) {
  return StyleSheet.create({
    listGrow: { flexGrow: 1, gap: 14 },
    stack: { gap: 14 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    kicker: { ...typography.micro, color: c.textMuted, letterSpacing: 1.4, textTransform: 'uppercase' },
    kickerGold: { ...typography.micro, color: '#7a573b', letterSpacing: 1.2, textTransform: 'uppercase' },
    title: { fontSize: 32, lineHeight: 36, fontWeight: '500', color: c.textPrimary, letterSpacing: -0.6, marginTop: 4 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    metricBar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: '#fff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
    },
    metricRule: { width: 1, backgroundColor: c.border },
    metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#e4e2dd' },
    liveDotOn: { backgroundColor: '#2d5a46' },
    track: { height: 4, borderRadius: 4, backgroundColor: '#efeeec', overflow: 'hidden' },
    trackFill: { height: 4, backgroundColor: '#1e2022' },
    photos: { flexDirection: 'row', gap: 8 },
    photo: { width: 120, height: 88, borderRadius: 10, backgroundColor: '#efeeec' },
    badge: { backgroundColor: '#fbf5ee', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    badgeText: { ...typography.micro, color: '#7a573b', letterSpacing: 0.4, textTransform: 'uppercase' },
    priority: { ...typography.caption, color: c.textSecondary },
    metrics: { flexDirection: 'row', gap: 8 },
    metric: {
      flex: 1,
      paddingHorizontal: 12,
      gap: 6,
      justifyContent: 'center',
    },
    metricLabel: { ...typography.micro, color: c.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
    metricValue: { fontSize: 18, fontWeight: '600', color: c.textPrimary },
    card: {
      backgroundColor: '#fff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 12,
    },
    split: { flexDirection: 'row', gap: 12 },
    half: { flex: 1, gap: 6 },
    label: { ...typography.micro, color: c.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
    value: { ...typography.bodyStrong, color: c.textPrimary },
    person: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    personName: { ...typography.captionStrong, color: c.textPrimary, flexShrink: 1 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
      ...typography.caption,
      color: '#7a573b',
      backgroundColor: '#fbf5ee',
      overflow: 'hidden',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    section: { ...typography.bodyStrong, color: c.textPrimary },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progress: { ...typography.caption, color: '#2d5a46' },
    body: { ...typography.body, color: c.textSecondary, lineHeight: 21 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    box: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: '#1e2022', borderColor: '#1e2022' },
    tick: { color: '#fff', fontSize: 12 },
    checkText: { ...typography.body, color: c.textPrimary, flex: 1 },
    checkDone: { color: c.textMuted, textDecorationLine: 'line-through' },
    addRow: { flexDirection: 'row' },
    chip: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: '#fff',
    },
    chipOn: { backgroundColor: '#1e2022', borderColor: '#1e2022' },
    chipText: { ...typography.caption, color: c.textSecondary },
    chipTextOn: { color: '#fff' },
    feed: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
    when: { ...typography.micro, color: c.textMuted, marginTop: 2 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: pagePadding,
      paddingTop: spacing.md,
      paddingBottom: TAB_BAR_CLEARANCE,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: '#faf9f7',
    },
  })
}
