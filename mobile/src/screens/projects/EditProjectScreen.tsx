import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { LoadingState, ErrorState } from '../../components/States'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { projectsApi } from '../../api/projects'
import { isApiError } from '../../api/client'
import type { ProjectStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<ProjectStackParamList, 'EditProject'>

const TYPES: { value: 'residential' | 'commercial'; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
]

const STATUSES: { value: string; label: string }[] = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'completed', label: 'Completed' },
]

export function EditProjectScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()
  const { projectId } = route.params

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  })

  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [type, setType] = useState<'residential' | 'commercial'>('residential')
  const [status, setStatus] = useState('in_progress')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!data?.project) return
    const p = data.project
    setName(p.name)
    setClientName(p.clientName)
    setClientPhone(p.clientPhone || '')
    setLocation(p.location || '')
    setBudget(p.budget ? String(p.budget) : '')
    setType(p.type === 'commercial' ? 'commercial' : 'residential')
    const raw = p.isDelayed || p.status === 'delayed' ? 'delayed' : p.status || 'in_progress'
    setStatus(STATUSES.some((s) => s.value === raw) ? raw : 'in_progress')
  }, [data?.project])

  const saveMutation = useMutation({
    mutationFn: () =>
      projectsApi.update(projectId, {
        name: name.trim(),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        location: location.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        type,
        status,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigation.navigate('ProjectOverview', { projectId: project._id, projectName: project.name })
    },
    onError: (err) => setErrors({ form: isApiError(err) ? err.message : 'Could not save project' }),
  })

  const removeMutation = useMutation({
    mutationFn: () => projectsApi.remove(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigation.reset({
        index: 0,
        routes: [{ name: 'ProjectsList' }],
      })
    },
    onError: (err) => Alert.alert('Could not delete', isApiError(err) ? err.message : 'Try again'),
  })

  const onSubmit = () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Project name is required'
    if (!clientName.trim()) next.clientName = 'Client name is required'
    setErrors(next)
    if (Object.keys(next).length === 0) saveMutation.mutate()
  }

  if (isLoading) {
    return (
      <FormLayout title="Edit project" subtitle="Loading…" subtitleIcon="folder-outline">
        <LoadingState label="Loading project…" variant="detail" />
      </FormLayout>
    )
  }
  if (isError || !data) {
    return (
      <FormLayout title="Edit project" subtitle="Project" subtitleIcon="folder-outline">
        <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
      </FormLayout>
    )
  }

  return (
    <FormLayout
      title="Edit project"
      subtitle={data.project.name}
      subtitleIcon="folder-outline"

      footer={
        <View style={styles.footer}>
          <Button title="Save changes" onPress={onSubmit} loading={saveMutation.isPending} fullWidth />
          <Button
            title="Delete project"
            variant="secondary"
            onPress={() =>
              Alert.alert('Delete project', `Remove ${data.project.name}? This cannot be undone.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeMutation.mutate() },
              ])
            }
            loading={removeMutation.isPending}
            fullWidth
          />
        </View>
      }
    >
      <View>
        <Text style={styles.label}>Property type</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setType(t.value)}
              style={[styles.typeChip, type === t.value && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, type === t.value && styles.typeChipTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View>
        <Text style={styles.label}>Status</Text>
        <View style={styles.typeRow}>
          {STATUSES.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => setStatus(s.value)}
              style={[styles.typeChip, status === s.value && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, status === s.value && styles.typeChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Input label="Project name" value={name} onChangeText={setName} error={errors.name} />
      <Input label="Client name" value={clientName} onChangeText={setClientName} error={errors.clientName} />
      <Input label="Client phone (optional)" keyboardType="phone-pad" value={clientPhone} onChangeText={setClientPhone} />
      <Input label="Location (optional)" value={location} onChangeText={setLocation} />
      <Input label="Budget (optional)" keyboardType="numeric" value={budget} onChangeText={setBudget} />
      {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    footer: { gap: spacing.sm },
    label: { ...typography.captionStrong, color: c.textSecondary, marginBottom: spacing.sm },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    typeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
    },
    typeChipActive: { backgroundColor: c.textPrimary },
    typeChipText: { ...typography.caption, color: c.textSecondary },
    typeChipTextActive: { color: c.canvas, fontWeight: '700' },
    error: { ...typography.caption, color: c.danger },
  })
}
