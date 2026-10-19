import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { boqApi } from '../../api/boq'
import { projectsApi } from '../../api/projects'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateBoq'>

const TYPES = [
  { value: 'residential' as const, label: 'Residential', hint: 'Home interior schedule' },
  { value: 'commercial' as const, label: 'Commercial', hint: 'Office renovation schedule' },
]

export function CreateBoqScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = route.params || {}
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(params.projectId)
  const [boqType, setBoqType] = useState<'residential' | 'commercial' | null>(null)
  const [error, setError] = useState('')

  // The sheet defaults to the property type set on the project; the picker below
  // still lets you override it before the template is seeded.
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  })
  const project = projects?.find((p) => p._id === projectId)
  const effectiveType =
    boqType ?? (project?.type === 'commercial' ? 'commercial' : 'residential')

  const mutation = useMutation({
    mutationFn: () =>
      boqApi.create({
        title: title.trim(),
        projectId,
        boqType: effectiveType,
        seedCatalog: true,
      }),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      navigation.replace('BoqDetail', { quotationId: quotation._id })
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not create quotation'),
  })

  return (
    <FormLayout
      title="New quotation"
      subtitle="Start a BOQ estimate"
      subtitleIcon="document-text-outline"

      footer={
        <Button
          title="Create quotation"
          onPress={() => {
            if (!title.trim()) {
              setError('Title is required')
              return
            }
            setError('')
            mutation.mutate()
          }}
          loading={mutation.isPending}
          fullWidth
        />
      }
    >
      <Input
        label="Title"
        placeholder="e.g. Sharma Penthouse — Quotation"
        value={title}
        onChangeText={setTitle}
      />
      <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
      <Text style={styles.label}>Property type</Text>
      <View style={styles.typeRow}>
        {TYPES.map((opt) => {
          const active = effectiveType === opt.value
          return (
            <Text
              key={opt.value}
              onPress={() => setBoqType(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.typeChip, active && styles.typeChipActive]}
            >
              {opt.label}
            </Text>
          )
        })}
      </View>
      <Text style={styles.hint}>
        {effectiveType === 'commercial'
          ? 'Loads the full office renovation schedule — every row from the Clyro template.'
          : 'Loads the full home interior schedule — every row from the Clyro template.'}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    error: { ...typography.caption, color: c.danger },
    label: { ...typography.micro, color: c.textMuted, marginTop: spacing.md },
    typeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    typeChip: {
      ...typography.body,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.full,
      borderWidth: 1,
      color: c.textPrimary,
      overflow: 'hidden',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    typeChipActive: {
      backgroundColor: c.accentSoft,
      borderColor: c.accent,
      color: c.accent,
      fontWeight: '700',
    },
    hint: { ...typography.caption, color: c.textMuted, marginTop: spacing.xs },
  })
}
