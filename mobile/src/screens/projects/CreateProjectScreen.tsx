import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { CollapsibleSection } from '../../components/CollapsibleSection'
import { Button } from '../../components/Button'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { projectsApi } from '../../api/projects'
import { spacesApi } from '../../api/spaces'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProjectStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<ProjectStackParamList, 'CreateProject'>

const TYPES: {
  value: 'residential' | 'commercial' | 'renovation' | 'custom'
  label: string
  hint: string
}[] = [
  { value: 'residential', label: 'Residential', hint: 'Home interiors' },
  { value: 'commercial', label: 'Commercial', hint: 'Offices & retail' },
  { value: 'renovation', label: 'Renovation', hint: 'Remodel & retrofit' },
  { value: 'custom', label: 'Custom', hint: 'Build your own schedule' },
]

export function CreateProjectScreen({ navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [type, setType] = useState<'residential' | 'commercial' | 'renovation' | 'custom'>(
    'residential',
  )
  const [spaceId, setSpaceId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const spaces = useQuery({ queryKey: ['spaces'], queryFn: spacesApi.list })

  const mutation = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: name.trim(),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        location: location.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        type,
        spaceId: spaceId || undefined,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigation.replace('ProjectOverview', { projectId: project._id, projectName: project.name })
    },
    onError: (err) => setErrors({ form: isApiError(err) ? err.message : 'Could not create project' }),
  })

  const onSubmit = () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Project name is required'
    if (!clientName.trim()) next.clientName = 'Client name is required'
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate()
  }

  return (
    <FormLayout
      title="New project"
      subtitle="Creates 5 stages (Design → Handover) and template tasks"
      subtitleIcon="folder-outline"
      footer={<Button title="Create project" onPress={onSubmit} loading={mutation.isPending} fullWidth />}
    >
      <Input
        label="Project name"
        placeholder="e.g. Sharma Penthouse"
        value={name}
        onChangeText={setName}
        error={errors.name}
      />
      <Input
        label="Client"
        placeholder="Client / company"
        value={clientName}
        onChangeText={setClientName}
        error={errors.clientName}
      />
      <Input
        label="Client phone"
        placeholder="98765 43210"
        keyboardType="phone-pad"
        value={clientPhone}
        onChangeText={setClientPhone}
      />

      <View>
        <Text style={styles.label}>Property type</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => {
            const active = type === t.value
            return (
              <Pressable
                key={t.value}
                onPress={() => setType(t.value)}
                style={[styles.typeCard, active && styles.typeCardActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.typeLabel, active && styles.typeLabelActive]}>{t.label}</Text>
                <Text style={styles.typeHint}>{t.hint}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <CollapsibleSection>
        <Input label="Location" placeholder="City, area" value={location} onChangeText={setLocation} />
        <Input
          label="Budget (INR)"
          placeholder="0"
          keyboardType="numeric"
          value={budget}
          onChangeText={setBudget}
        />

        <View>
          <View style={styles.spaceHead}>
            <Text style={styles.label}>Space</Text>
            <Pressable
              onPress={() => navigation.navigate('CreateSpace')}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.spaceAction}>New space</Text>
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setSpaceId('')}
              style={[styles.chip, !spaceId && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: !spaceId }}
            >
              <Text style={[styles.chipText, !spaceId && styles.chipTextActive]}>No space</Text>
            </Pressable>
            {(spaces.data || []).map((sp) => (
              <Pressable
                key={sp._id}
                onPress={() => setSpaceId(sp._id)}
                style={[styles.chip, spaceId === sp._id && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: spaceId === sp._id }}
              >
                <View style={[styles.spaceDot, { backgroundColor: sp.color || colors.accent }]} />
                <Text
                  style={[styles.chipText, spaceId === sp._id && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {sp.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </CollapsibleSection>

      {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    label: {
      ...typography.captionStrong,
      color: c.textPrimary,
      marginBottom: spacing.sm,
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    typeCard: {
      width: '48%',
      flexGrow: 1,
      minWidth: '46%',
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    typeCardActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    typeLabel: {
      ...typography.captionStrong,
      color: c.textPrimary,
    },
    typeLabelActive: {
      color: c.textPrimary,
    },
    typeHint: {
      ...typography.micro,
      color: c.textSecondary,
      marginTop: 4,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceRaised,
      maxWidth: '100%',
    },
    chipActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    chipText: { ...typography.caption, color: c.textSecondary },
    chipTextActive: { color: c.textPrimary, fontWeight: '700' },
    error: { ...typography.caption, color: c.danger },
    spaceHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    spaceAction: {
      ...typography.captionStrong,
      color: c.accentText,
      marginBottom: spacing.sm,
    },
    spaceDot: { width: 8, height: 8, borderRadius: 4 },
  })
}
