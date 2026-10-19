import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { MaterialCatalogPicker } from '../../components/MaterialCatalogPicker'
import { SectionLabel } from '../../components/SectionLabel'
import { SurfaceCard } from '../../components/SurfaceCard'
import { formatInr, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { vendorsApi } from '../../api/procurement'
import { rfqsApi } from '../../api/rfq'
import { isApiError } from '../../api/client'
import type { MaterialCatalogItem, RfqItem } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { SharedOpsParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<SharedOpsParamList, 'CreateRfq'>

export function CreateRfqScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = route.params
  const queryClient = useQueryClient()

  const [projectId, setProjectId] = useState(params.projectId || undefined)
  const [vendorIds, setVendorIds] = useState<string[]>([])
  const [closingDate, setClosingDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<RfqItem[]>([])
  const [desc, setDesc] = useState('')
  const [unit, setUnit] = useState('nos')
  const [qty, setQty] = useState('1')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [error, setError] = useState('')

  const { data: vendors } = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list })

  const toggleVendor = (id: string) => {
    setVendorIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const addItem = () => {
    const qtyNum = Number(qty) || 0
    if (!desc.trim() || qtyNum <= 0) {
      setError('Description and quantity are required for each line item')
      return
    }
    setError('')
    setItems((prev) => [...prev, { description: desc.trim(), unit: unit.trim() || 'nos', qty: qtyNum }])
    setDesc('')
    setQty('1')
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const pickCatalogItem = (item: MaterialCatalogItem) => {
    setDesc(item.description)
    setUnit(item.unit || 'nos')
    if (item.rate != null) {
      // boqRate stored when sourced from catalog
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      rfqsApi.create({
        projectId: projectId!,
        quotationId: params.quotationId,
        items,
        vendorIds,
        closingDate: closingDate.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (rfq) => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      navigation.replace('RfqDetail', { rfqId: rfq._id })
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not create RFQ'),
  })

  return (
    <FormLayout
      title="New RFQ"
      subtitle="Request vendor quotes"
      subtitleIcon="document-text-outline"

      footer={
        <Button
          title="Create RFQ"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
              return
            }
            if (!items.length) {
              setError('Add at least one line item')
              return
            }
            if (!vendorIds.length) {
              setError('Select at least one vendor')
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

      <View style={styles.wrap}>
        <Text style={styles.label}>Vendors</Text>
        {!vendors?.length ? (
          <Text style={styles.hint}>No vendors yet — add one first.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {vendors.map((v) => {
              const active = vendorIds.includes(v._id)
              return (
                <Text
                  key={v._id}
                  onPress={() => toggleVendor(v._id)}
                  style={[styles.chip, active && styles.chipActive]}
                  numberOfLines={1}
                >
                  {v.name}
                </Text>
              )
            })}
          </ScrollView>
        )}
      </View>

      <Input label="Closing date (optional)" placeholder="YYYY-MM-DD" value={closingDate} onChangeText={setClosingDate} />
      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />

      <SectionLabel count={items.length}>Line items</SectionLabel>
      {items.map((item, index) => (
        <SurfaceCard key={`${item.description}-${index}`}>
          <View style={styles.itemRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.itemDesc} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={styles.itemMeta}>
                {item.qty} {item.unit}
                {item.boqRate != null ? ` · ${formatInr(item.boqRate)}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => removeItem(index)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        </SurfaceCard>
      ))}

      <SurfaceCard style={styles.addCard}>
        <Pressable onPress={() => setCatalogOpen(true)} style={styles.catalogBtn}>
          <Ionicons name="search-outline" size={16} color={colors.accent} />
          <Text style={styles.catalogText}>Pick from catalog</Text>
        </Pressable>
        <Input placeholder="Description" value={desc} onChangeText={setDesc} />
        <View style={styles.addRow}>
          <Input placeholder="Unit" value={unit} onChangeText={setUnit} containerStyle={{ flex: 1 }} />
          <Input placeholder="Qty" keyboardType="numeric" value={qty} onChangeText={setQty} containerStyle={{ flex: 1 }} />
        </View>
        <Button title="Add line item" size="sm" onPress={addItem} />
      </SurfaceCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <MaterialCatalogPicker visible={catalogOpen} onClose={() => setCatalogOpen(false)} onPick={pickCatalogItem} />
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { ...typography.captionStrong, color: c.textSecondary },
    hint: { ...typography.caption, color: c.textMuted },
    chipRow: { gap: spacing.sm, paddingVertical: 2 },
    chip: {
      ...typography.caption,
      color: c.textSecondary,
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.full,
      overflow: 'hidden',
      maxWidth: 200,
    },
    chipActive: { backgroundColor: c.textPrimary, color: c.canvas },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    itemDesc: { ...typography.body, color: c.textPrimary },
    itemMeta: { ...typography.caption, color: c.textSecondary },
    addCard: { gap: spacing.sm },
    addRow: { flexDirection: 'row', gap: spacing.sm },
    catalogBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
    catalogText: { ...typography.caption, color: c.accent, fontWeight: '600' },
    error: { ...typography.caption, color: c.danger },
  })
}
