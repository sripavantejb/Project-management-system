import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { SurfaceCard } from '../../components/SurfaceCard'
import { ProjectPicker } from '../../components/ProjectPicker'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { procurementFlowApi } from '../../api/procurementFlow'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateMaterialRequest'>

interface DraftLine {
  description: string
  unit: string
  qty: string
  remarks: string
}

const EMPTY_LINE: DraftLine = { description: '', unit: 'nos', qty: '', remarks: '' }

const UNITS = ['nos', 'sft', 'rft', 'kg', 'bag', 'ltr', 'set', 'ls']

/** What site needs from the store — the request the store issues against. */
export function CreateMaterialRequestScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const qc = useQueryClient()

  const [projectId, setProjectId] = useState(route.params?.projectId || '')
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }])
  const [requiredBy, setRequiredBy] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const setLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const mutation = useMutation({
    mutationFn: () =>
      procurementFlowApi.createMaterialRequest({
        projectId,
        requiredBy: requiredBy.trim() || null,
        notes: notes.trim(),
        status: 'submitted',
        items: lines
          .filter((line) => line.description.trim() && Number(line.qty) > 0)
          .map((line) => ({
            description: line.description.trim(),
            unit: line.unit,
            qty: Number(line.qty) || 0,
            remarks: line.remarks.trim(),
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-requests'] })
      qc.invalidateQueries({ queryKey: ['procurement-dashboard'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not raise the request'),
  })

  return (
    <FormLayout
      title="Material request"
      subtitle="Ask the store for material"
      subtitleIcon="clipboard-outline"
      card={false}
      footer={
        <Button
          title="Submit request"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
              return
            }
            if (!lines.some((line) => line.description.trim() && Number(line.qty) > 0)) {
              setError('Add at least one item with a quantity')
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
      <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />

      <Input
        label="Needed by"
        placeholder="YYYY-MM-DD"
        value={requiredBy}
        onChangeText={setRequiredBy}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Items</Text>
      {lines.map((line, i) => (
        <SurfaceCard key={i}>
          <View style={styles.lineHead}>
            <Text style={styles.lineIndex}>Item {i + 1}</Text>
            {lines.length > 1 ? (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove item ${i + 1}`}
                onPress={() => setLines((prev) => prev.filter((_, index) => index !== i))}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          <Input
            label="Description"
            value={line.description}
            onChangeText={(v) => setLine(i, { description: v })}
          />
          <View style={styles.row}>
            <Input
              label="Quantity"
              keyboardType="numeric"
              value={line.qty}
              onChangeText={(v) => setLine(i, { qty: v })}
              containerStyle={styles.flex}
            />
            <View style={styles.flex}>
              <Text style={styles.unitLabel}>Unit</Text>
              <View style={styles.unitRow}>
                {UNITS.map((unit) => (
                  <Pressable
                    key={unit}
                    onPress={() => setLine(i, { unit })}
                    style={[styles.unitChip, line.unit === unit && styles.unitChipActive]}
                  >
                    <Text style={[styles.unitText, line.unit === unit && styles.unitTextActive]}>{unit}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <Input label="Remarks" value={line.remarks} onChangeText={(v) => setLine(i, { remarks: v })} />
        </SurfaceCard>
      ))}

      <Pressable style={styles.addLine} onPress={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}>
        <Ionicons name="add-outline" size={16} color={colors.accentHover} />
        <Text style={styles.addLineText}>Add another item</Text>
      </Pressable>

      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    label: { ...typography.captionStrong, color: c.textSecondary, marginTop: spacing.sm },
    lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    lineIndex: { ...typography.captionStrong, color: c.textMuted },
    row: { flexDirection: 'row', gap: spacing.md },
    flex: { flex: 1 },
    unitLabel: { ...typography.captionStrong, color: c.textSecondary, marginBottom: 6 },
    unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    unitChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
    },
    unitChipActive: { backgroundColor: c.accent },
    unitText: { ...typography.micro, color: c.textSecondary },
    unitTextActive: { color: c.textOnAccent, fontWeight: '700' },
    addLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
    },
    addLineText: { ...typography.captionStrong, color: c.accentHover },
    error: { ...typography.caption, color: c.danger },
  })
}
