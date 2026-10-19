import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { SurfaceCard } from '../../components/SurfaceCard'
import { SearchField } from '../../components/SearchField'
import { ProjectPicker } from '../../components/ProjectPicker'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { inventoryApi } from '../../api/inventory'
import { procurementFlowApi } from '../../api/procurementFlow'
import { isApiError } from '../../api/client'
import type { InventoryItem } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateMaterialIssue'>

interface DraftLine {
  inventoryItemId: string
  description: string
  unit: string
  available: number
  qty: string
  batchNo: string
}

/**
 * Issue material out of the store. Every line must come from inventory —
 * the server rejects the issue if stock is short, so quantities are checked
 * here first.
 */
export function CreateMaterialIssueScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const qc = useQueryClient()
  const params = route.params || {}

  const [projectId, setProjectId] = useState(params.projectId || '')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [receivedByName, setReceivedByName] = useState('')
  const [notes, setNotes] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [error, setError] = useState('')

  const items = useQuery({
    queryKey: ['inventory-items', itemSearch],
    queryFn: () => inventoryApi.items(itemSearch.trim() || undefined),
    enabled: pickerOpen,
  })

  const addItem = (item: InventoryItem) => {
    setLines((prev) =>
      prev.some((line) => line.inventoryItemId === item._id)
        ? prev
        : [
            ...prev,
            {
              inventoryItemId: item._id,
              description: item.name,
              unit: item.unit || 'nos',
              available: Number(item.quantity) || 0,
              qty: '',
              batchNo: '',
            },
          ],
    )
    setPickerOpen(false)
  }

  const setLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const overdrawn = lines.filter((line) => Number(line.qty) > line.available)

  const mutation = useMutation({
    mutationFn: () =>
      procurementFlowApi.createMaterialIssue({
        projectId,
        materialRequest: params.materialRequestId || null,
        receivedByName: receivedByName.trim(),
        notes: notes.trim(),
        items: lines
          .filter((line) => Number(line.qty) > 0)
          .map((line) => ({
            inventoryItemId: line.inventoryItemId,
            description: line.description,
            unit: line.unit,
            qty: Number(line.qty) || 0,
            batchNo: line.batchNo.trim(),
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-issues'] })
      qc.invalidateQueries({ queryKey: ['material-requests'] })
      qc.invalidateQueries({ queryKey: ['inventory-items'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['procurement-dashboard'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not issue the material'),
  })

  return (
    <FormLayout
      title="Issue material"
      subtitle={params.requestNumber ? `Against ${params.requestNumber}` : 'Out of the store'}
      subtitleIcon="exit-outline"
      card={false}
      footer={
        <Button
          title="Issue material"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
              return
            }
            if (!lines.some((line) => Number(line.qty) > 0)) {
              setError('Add at least one item with a quantity')
              return
            }
            if (overdrawn.length) {
              setError(`Not enough stock for ${overdrawn[0].description}`)
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

      <Text style={styles.label}>Items from stock</Text>
      {lines.length === 0 ? (
        <Text style={styles.hint}>Nothing added yet — pick items from inventory below.</Text>
      ) : null}

      {lines.map((line, i) => {
        const short = Number(line.qty) > line.available
        return (
          <SurfaceCard key={line.inventoryItemId}>
            <View style={styles.lineHead}>
              <Text style={styles.lineDesc} numberOfLines={1}>
                {line.description}
              </Text>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${line.description}`}
                onPress={() => setLines((prev) => prev.filter((_, index) => index !== i))}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            </View>
            <Text style={styles.lineMeta}>
              {line.available} {line.unit} in stock
            </Text>
            <View style={styles.row}>
              <Input
                label="Issue quantity"
                keyboardType="numeric"
                value={line.qty}
                onChangeText={(v) => setLine(i, { qty: v })}
                containerStyle={styles.flex}
                error={short ? 'More than in stock' : undefined}
              />
              <Input
                label="Batch no."
                value={line.batchNo}
                onChangeText={(v) => setLine(i, { batchNo: v })}
                containerStyle={styles.flex}
              />
            </View>
          </SurfaceCard>
        )
      })}

      <Pressable style={styles.addLine} onPress={() => setPickerOpen(true)}>
        <Ionicons name="add-outline" size={16} color={colors.accentHover} />
        <Text style={styles.addLineText}>Add item from inventory</Text>
      </Pressable>

      <Input label="Received by (name)" value={receivedByName} onChangeText={setReceivedByName} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Pick from inventory</Text>
            <SearchField
              value={itemSearch}
              onChangeText={setItemSearch}
              placeholder="Search stock"
              inset={false}
            />
            <FlatList
              data={items.data || []}
              keyExtractor={(item) => item._id}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <Pressable style={styles.sheetRow} onPress={() => addItem(item)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sheetRowText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.sheetRowMeta} numberOfLines={1}>
                      {item.quantity} {item.unit} in stock
                      {item.location ? ` · ${item.location}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="add-outline" size={22} color={colors.accent} />
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.sheetEmpty}>
                  {items.isLoading ? 'Loading stock…' : 'No stock matches that search.'}
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    label: { ...typography.captionStrong, color: c.textSecondary, marginTop: spacing.sm },
    hint: { ...typography.caption, color: c.textMuted },
    lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    lineDesc: { ...typography.bodyStrong, color: c.textPrimary, flex: 1 },
    lineMeta: { ...typography.micro, color: c.textMuted, marginTop: 2, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.md },
    flex: { flex: 1 },
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
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
      maxHeight: '75%',
    },
    sheetTitle: { ...typography.h3, color: c.textPrimary },
    sheetList: { maxHeight: 340 },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sheetRowText: { ...typography.bodyStrong, color: c.textPrimary },
    sheetRowMeta: { ...typography.micro, color: c.textMuted, marginTop: 2 },
    sheetEmpty: { ...typography.caption, color: c.textSecondary, paddingVertical: spacing.md },
  })
}
