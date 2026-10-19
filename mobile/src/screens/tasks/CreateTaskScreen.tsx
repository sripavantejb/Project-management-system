import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { Avatar } from '../../components/Avatar'
import { PRIORITY_LABELS, STATUS_LABELS, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { tasksApi } from '../../api/tasks'
import { adminApi } from '../../api/admin'
import { isApiError } from '../../api/client'
import type { TaskPriority, TaskStatus } from '../../types/models'
import type { RouteProp, NavigationProp } from '@react-navigation/native'
import type { HomeStackParamList } from '../../navigation/types'

type Props = {
  route: RouteProp<HomeStackParamList, 'CreateTask'>
  navigation: NavigationProp<HomeStackParamList>
}

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review']
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']

export function CreateTaskScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { isPersonal } = route.params || {}
  const [projectId, setProjectId] = useState(route.params?.projectId)
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [estimateHours, setEstimateHours] = useState('')
  const [tagText, setTagText] = useState('')
  const [checks, setChecks] = useState<string[]>([])
  const [checkDraft, setCheckDraft] = useState('')
  const [error, setError] = useState('')

  const people = useQuery({ queryKey: ['users'], queryFn: adminApi.users, enabled: !isPersonal })

  const mutation = useMutation({
    mutationFn: () => {
      const hours = Number(estimateHours)
      const tags = tagText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      return tasksApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        projectId,
        isPersonal: !!isPersonal,
        status,
        priority,
        assignee: assignee || undefined,
        startDate: startDate.trim() || null,
        dueDate: dueDate.trim() || null,
        timeEstimate: Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : null,
        tags,
        checklist: checks.map((text) => ({ text, done: false })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      navigation.goBack()
    },
    onError: (err: unknown) => setError(isApiError(err) ? err.message : 'Could not create task'),
  })

  const onSubmit = () => {
    if (!isPersonal && !projectId) {
      setError('Select a project')
      return
    }
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setError('')
    mutation.mutate()
  }

  const addCheck = () => {
    const text = checkDraft.trim()
    if (!text) return
    setChecks((prev) => [...prev, text])
    setCheckDraft('')
  }

  return (
    <FormLayout
      title="New task"
      subtitle="Draft spec"
      subtitleIcon="checkbox-outline"
      card={false}
      footer={<Button title="Create task" onPress={onSubmit} loading={mutation.isPending} fullWidth />}
    >
      {isPersonal ? null : <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />}
      <View style={styles.card}>
        <Text style={styles.label}>Task title</Text>
        <Input placeholder="What needs to happen?" value={title} onChangeText={setTitle} autoFocus />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Stage</Text>
        <View style={styles.row}>
          {STATUSES.map((key) => {
            const on = status === key
            return (
              <Pressable key={key} onPress={() => setStatus(key)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{STATUS_LABELS[key]}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {!isPersonal && (people.data || []).length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Assignee</Text>
          <View style={styles.row}>
            {(people.data || []).slice(0, 8).map((person) => {
              const on = assignee === person._id
              return (
                <Pressable
                  key={person._id}
                  onPress={() => setAssignee(on ? null : person._id)}
                  style={[styles.person, on && styles.chipOn]}
                >
                  <Avatar name={person.name} uri={person.avatar} size={22} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                    {person.name.split(' ')[0]}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.row}>
          {PRIORITIES.map((key) => {
            const on = priority === key
            return (
              <Pressable key={key} onPress={() => setPriority(key)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{PRIORITY_LABELS[key]}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Schedule</Text>
        <Input label="Start" placeholder="2026-10-07" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
        <Input label="Due" placeholder="2026-10-12" value={dueDate} onChangeText={setDueDate} autoCapitalize="none" />
        <Input
          label="Time estimate (hours)"
          placeholder="3.5"
          keyboardType="decimal-pad"
          value={estimateHours}
          onChangeText={setEstimateHours}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Scope</Text>
        <Input
          placeholder="What has to be true before this is done"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
        <Input label="Tags" placeholder="snagging, joinery" value={tagText} onChangeText={setTagText} autoCapitalize="none" />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Checklist</Text>
        {checks.map((item) => (
          <Text key={item} style={styles.check}>
            {item}
          </Text>
        ))}
        <Input placeholder="Add a checklist point" value={checkDraft} onChangeText={setCheckDraft} onSubmitEditing={addCheck} />
        <Pressable onPress={addCheck}>
          <Text style={styles.add}>Add item</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 8,
    },
    label: {
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.textMuted,
      fontWeight: '600',
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: '#faf9f7',
    },
    chipOn: { backgroundColor: '#1e2022', borderColor: '#1e2022' },
    chipText: { ...typography.captionStrong, color: c.textSecondary },
    chipTextOn: { color: '#fff' },
    person: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 8,
      paddingVertical: 6,
      maxWidth: 140,
    },
    check: { ...typography.body, color: c.textPrimary },
    add: { ...typography.captionStrong, color: '#7a573b' },
    error: { ...typography.caption, color: c.danger },
  })
}
