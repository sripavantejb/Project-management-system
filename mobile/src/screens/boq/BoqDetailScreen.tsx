import { NestedChrome } from '../../components/NestedChrome'
import { useMemo, useState } from 'react'
import { ActionSheetIOS, Alert, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as XLSX from 'xlsx'
import { File } from 'expo-file-system'
import { SectionLabel } from '../../components/SectionLabel'
import { SurfaceCard } from '../../components/SurfaceCard'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Pill } from '../../components/Badge'
import { LoadingState, ErrorState } from '../../components/States'
import { formatInr, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { IconButton } from '../../components/IconButton'
import { boqApi } from '../../api/boq'
import { taxInvoicesApi } from '../../api/taxInvoices'
import { isApiError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { rowsToBoqLines, materialMasterAoa, unitLabel } from '../../lib/boqImport'
import { exportXlsxBase64, todayStamp } from '../../lib/exportFile'
import { shareQuotationPdf, printQuotation } from '../../lib/quotePdf'
import type { BoqItem, QuotationStatus } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'BoqDetail'>

const STATUS_FLOW: QuotationStatus[] = ['draft', 'sent', 'approved']

export function BoqDetailScreen({ route, navigation }: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])

  const { quotationId } = route.params
  const queryClient = useQueryClient()
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [rate, setRate] = useState('')
  const [addError, setAddError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const tenant = useAuthStore((st) => st.tenant)

  const { data: quotation, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['quotation', quotationId],
    queryFn: () => boqApi.get(quotationId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['quotation', quotationId] })
    queryClient.invalidateQueries({ queryKey: ['quotations'] })
  }

  // Every BOQ on the same project is a version of it — including the frozen
  // copies unlock leaves behind.
  const projectRef =
    typeof quotation?.projectId === 'object' ? quotation.projectId?._id : quotation?.projectId
  const versions = useQuery({
    queryKey: ['quotations', 'history', projectRef],
    queryFn: () => boqApi.list({ projectId: projectRef }),
    enabled: historyOpen && !!projectRef,
  })

  const updateItems = useMutation({
    mutationFn: (items: BoqItem[]) => boqApi.update(quotationId, { items }),
    onSuccess: invalidate,
  })

  const statusMutation = useMutation({
    mutationFn: (status: QuotationStatus) => boqApi.update(quotationId, { status }),
    onSuccess: invalidate,
  })

  /** Reopening an approved BOQ archives the signed-off copy under History. */
  const unlockMutation = useMutation({
    mutationFn: () => boqApi.unlock(quotationId),
    onSuccess: (res) => {
      invalidate()
      Alert.alert('BOQ unlocked', res.message || 'The approved copy is kept in history.')
    },
    onError: (err) => Alert.alert('Could not unlock', isApiError(err) ? err.message : 'Try again'),
  })

  const convertToInvoice = useMutation({
    mutationFn: () => taxInvoicesApi.fromQuotation(quotationId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['tax-invoices'] })
      navigation.navigate('TaxInvoiceDetail', { invoiceId: invoice._id })
    },
    onError: (err) =>
      Alert.alert('Could not create the invoice', isApiError(err) ? err.message : 'Try again'),
  })

  const chromeProps = {
    title: quotation?.title || 'Quotation',
    subtitle: quotation ? `${quotation.versionLabel} · BOQ` : 'Bill of quantities',
    subtitleIcon: 'document-text-outline' as const,
  }

  if (isLoading) {
    return (
      <NestedChrome {...chromeProps}>
      <LoadingState label="Loading quotation…" variant="detail" />
      </NestedChrome>
    )
  }
  if (isError || !quotation) {
    return (
      <NestedChrome {...chromeProps}>
      <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
      </NestedChrome>
    )
  }

  const addItem = () => {
    const qtyNum = Number(qty) || 0
    const rateNum = Number(rate) || 0
    if (!desc.trim() || qtyNum <= 0 || rateNum <= 0) {
      setAddError('Description, quantity, and rate are required')
      return
    }
    setAddError('')
    const nextItems: BoqItem[] = [
      ...quotation.items,
      { description: desc.trim(), unit: 'nos', qty: qtyNum, rate: rateNum, amount: qtyNum * rateNum },
    ]
    updateItems.mutate(nextItems)
    setDesc('')
    setQty('1')
    setRate('')
  }

  const removeItem = (index: number) => {
    const nextItems = quotation.items.filter((_, i) => i !== index)
    updateItems.mutate(nextItems)
  }

  /** Copy a line in place so a near-identical row is two taps, not a retype. */
  const duplicateItem = (index: number) => {
    const source = quotation.items[index]
    if (!source) return
    const copy: BoqItem = { ...source, _id: undefined }
    const nextItems = [
      ...quotation.items.slice(0, index + 1),
      copy,
      ...quotation.items.slice(index + 1),
    ]
    updateItems.mutate(nextItems)
  }

  /**
   * Import an Excel/CSV take-off. SheetJS reads base64 on device — there is no
   * ArrayBuffer from a file:// URI without reading it ourselves first.
   */
  const importSheet = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
          '*/*',
        ],
      })
      if (picked.canceled || !picked.assets?.[0]) return

      setBusy('import')
      const asset = picked.assets[0]
      const base64 = await new File(asset.uri).base64()
      const workbook = XLSX.read(base64, { type: 'base64' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) throw new Error('That file has no sheets.')

      const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        blankrows: false,
        defval: '',
      }) as (string | number | null)[][]

      const lines = rowsToBoqLines(grid)
      if (!lines.length) {
        Alert.alert(
          'Nothing to import',
          'No priced or measurable rows were found. Check that the sheet has Description / Qty columns, or start from the Clyro template.',
        )
        return
      }

      const nextItems: BoqItem[] = [
        ...quotation.items,
        ...lines.map((l) => ({
          description: l.description,
          unit: l.unit,
          qty: l.qty,
          rate: l.rate,
          amount: l.amount,
          room: l.room,
        })),
      ]

      Alert.alert(
        'Import lines?',
        `${lines.length} line${lines.length === 1 ? '' : 's'} read from ${asset.name}. They will be added below the existing items.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import', onPress: () => updateItems.mutate(nextItems) },
        ],
      )
    } catch (err) {
      Alert.alert('Could not read that file', err instanceof Error ? err.message : 'Try an .xlsx or .csv export.')
    } finally {
      setBusy(null)
    }
  }

  /** Hand back the material-master workbook, seeded with this quotation's lines. */
  const downloadTemplate = async () => {
    try {
      setBusy('template')
      const seed = quotation.items.length
        ? quotation.items.map((it) => ({
            room: it.room,
            materialName: it.description,
            unit: it.unit,
            qty: it.qty,
          }))
        : [
            {
              room: 'INTERIOR / JOINERY',
              materialFamily: 'Plywood',
              materialName: 'Plywood',
              grade:
                quotation.boqType === 'commercial'
                  ? 'BWP / Boiling Waterproof – 710 Grade'
                  : 'BWR / Boiling Water Resistant – IS 303',
              thickness: '18 mm',
              brand: 'Approved make / equivalent',
              dimensions: "8' × 4'",
              unit: 'sheet',
              qty: 0,
            },
          ]

      const aoa = materialMasterAoa(seed)
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [
        { wch: 8 },
        { wch: 16 },
        { wch: 16 },
        { wch: 52 },
        { wch: 12 },
        { wch: 22 },
        { wch: 14 },
        { wch: 10 },
        { wch: 8 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Material Master')
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
      await exportXlsxBase64(`cubic-material-master-${todayStamp()}`, base64)
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Could not build the template.')
    } finally {
      setBusy(null)
    }
  }

  const pdfOptions = () => ({
    quotation,
    tenant,
    projectName:
      typeof quotation.projectId === 'object' ? quotation.projectId?.name : undefined,
    clientName:
      typeof quotation.projectId === 'object' ? quotation.projectId?.clientName : undefined,
  })

  const sharePdfAction = async () => {
    try {
      setBusy('pdf')
      await shareQuotationPdf(pdfOptions())
    } catch (err) {
      Alert.alert('Could not build the PDF', err instanceof Error ? err.message : 'Try again.')
    } finally {
      setBusy(null)
    }
  }

  const printAction = async () => {
    try {
      setBusy('print')
      await printQuotation(pdfOptions())
    } catch (err) {
      Alert.alert('Could not print', err instanceof Error ? err.message : 'Try again.')
    } finally {
      setBusy(null)
    }
  }

  const locked = quotation.status === 'approved'

  const actions: { label: string; run: () => void }[] = [
    { label: 'Share as PDF', run: sharePdfAction },
    { label: 'Print', run: printAction },
    { label: 'Version history', run: () => setHistoryOpen(true) },
    {
      label: 'Convert to tax invoice',
      run: () =>
        Alert.alert(
          'Create a tax invoice',
          'A GST tax invoice will be drafted from these lines. You can edit it before issuing.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create', onPress: () => convertToInvoice.mutate() },
          ],
        ),
    },
    ...(locked
      ? [
          {
            label: 'Unlock to edit',
            run: () =>
              Alert.alert(
                'Unlock this BOQ',
                'It goes back to draft so it can be edited. The approved version is kept in history.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Unlock', onPress: () => unlockMutation.mutate() },
                ],
              ),
          },
        ]
      : [
          {
            label: 'Edit title, GST & discount',
            run: () => navigation.navigate('EditQuotation', { quotationId }),
          },
          { label: 'Measurement sheet', run: () => navigation.navigate('BoqMeasurement', { quotationId }) },
          { label: 'Import Excel / CSV', run: importSheet },
        ]),
    { label: 'Download Excel template', run: downloadTemplate },
  ]

  const openActions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a.label), 'Cancel'], cancelButtonIndex: actions.length },
        (i) => actions[i]?.run(),
      )
      return
    }
    Alert.alert('Quotation', undefined, [
      ...actions.map((a) => ({ text: a.label, onPress: a.run })),
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }

  // Same order the quotation sheets total in: subtotal → handling → GST → discount
  const chargesAmount = (quotation.subtotal * (quotation.chargesPercent || 0)) / 100
  const gstAmount =
    ((quotation.subtotal + chargesAmount) * (quotation.gstPercent || 0)) / 100
  const propertyType =
    quotation.boqType === 'commercial'
      ? 'Commercial'
      : quotation.boqType === 'residential'
        ? 'Residential'
        : null

  return (
    <NestedChrome
      {...chromeProps}
      right={
        <IconButton
          icon={busy ? 'hourglass-outline' : 'ellipsis-horizontal'}
          label="Quotation actions"
          tone="ghost"
          onPress={() => {
            if (!busy) openActions()
          }}
        />
      }
    >
      <FlatList
        data={quotation.items}
        keyExtractor={(item, i) => item._id || String(i)}
        contentContainerStyle={listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SurfaceCard style={styles.statusCard}>
              <View style={styles.badgeRow}>
                <Pill label={quotation.status} bg={colors.accentSoft} color={colors.accent} />
                {propertyType ? (
                  <Pill label={propertyType} bg={colors.muted} color={colors.textSecondary} />
                ) : null}
                <Text style={styles.versionLabel}>{quotation.versionLabel}</Text>
              </View>
              <SectionLabel>Status</SectionLabel>
              <View style={styles.statusRow}>
                {STATUS_FLOW.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => statusMutation.mutate(s)}
                    disabled={statusMutation.isPending}
                    style={[styles.statusChip, quotation.status === s && styles.statusChipActive]}
                  >
                    <Text style={[styles.statusChipText, quotation.status === s && styles.statusChipTextActive]}>
                      {s === 'draft' ? 'Draft' : s === 'sent' ? 'Send' : 'Approve'}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => statusMutation.mutate('rejected')}
                  disabled={statusMutation.isPending}
                  style={[styles.statusChip, quotation.status === 'rejected' && styles.statusChipDanger]}
                >
                  <Text style={[styles.statusChipText, quotation.status === 'rejected' && styles.statusChipTextDanger]}>
                    Reject
                  </Text>
                </Pressable>
              </View>
            </SurfaceCard>
            <SectionLabel count={quotation.items.length}>Line items</SectionLabel>
          </View>
        }
        renderItem={({ item, index }) => (
          <SurfaceCard>
            <View style={styles.itemRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemDesc} numberOfLines={2}>
                  {item.description}
                </Text>
                <Text style={styles.itemMeta}>
                  {`${item.qty} ${unitLabel(item.unit)} × ${formatInr(item.rate)}`}
                  {item.room ? ` · ${item.room}` : ''}
                </Text>
              </View>
              <Text style={styles.itemAmount}>{formatInr(item.amount)}</Text>
              {locked ? null : (
                <>
                  <Pressable
                    onPress={() => duplicateItem(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Duplicate ${item.description}`}
                  >
                    <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => removeItem(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.description}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </>
              )}
            </View>
          </SurfaceCard>
        )}
        ListFooterComponent={
          <View style={styles.footerBlock}>
            {locked ? (
              <SurfaceCard style={styles.lockCard}>
                <View style={styles.lockRow}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.lockTitle}>Approved and locked</Text>
                </View>
                <Text style={styles.lockBody}>
                  Unlock to edit — the approved version is archived under History so nothing signed
                  off is lost.
                </Text>
                <Button
                  title="Unlock to edit"
                  variant="secondary"
                  size="sm"
                  onPress={() => unlockMutation.mutate()}
                  loading={unlockMutation.isPending}
                />
              </SurfaceCard>
            ) : (
              <>
                <SectionLabel>Add item</SectionLabel>
                <SurfaceCard style={styles.addCard}>
                  <Input placeholder="Description" value={desc} onChangeText={setDesc} />
                  <View style={styles.addRow}>
                    <Input placeholder="Qty" keyboardType="numeric" value={qty} onChangeText={setQty} containerStyle={{ flex: 1 }} />
                    <Input placeholder="Rate" keyboardType="numeric" value={rate} onChangeText={setRate} containerStyle={{ flex: 1 }} />
                  </View>
                  {addError ? <Text style={styles.error}>{addError}</Text> : null}
                  <Button title="Add item" size="sm" onPress={addItem} loading={updateItems.isPending} />
                </SurfaceCard>
              </>
            )}

            <SectionLabel
              action={locked ? undefined : 'Edit'}
              onAction={locked ? undefined : () => navigation.navigate('EditQuotation', { quotationId })}
            >
              Totals
            </SectionLabel>
            <SurfaceCard>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{formatInr(quotation.subtotal)}</Text>
              </View>
              {chargesAmount > 0 ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel} numberOfLines={1}>
                    {quotation.chargesLabel || `Design & handling (${quotation.chargesPercent}%)`}
                  </Text>
                  <Text style={styles.totalValue}>{formatInr(chargesAmount)}</Text>
                </View>
              ) : null}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>GST ({quotation.gstPercent}%)</Text>
                <Text style={styles.totalValue}>{formatInr(gstAmount)}</Text>
              </View>
              {quotation.discount ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>-{formatInr(quotation.discount)}</Text>
                </View>
              ) : null}
              <View style={[styles.totalRow, styles.grandRow]}>
                <Text style={styles.grandLabel}>Grand total</Text>
                <Text style={styles.grandValue}>{formatInr(quotation.grandTotal)}</Text>
              </View>
            </SurfaceCard>
          </View>
        }
      />

      <Modal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setHistoryOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Version history</Text>
            <Text style={styles.sheetHint}>Every BOQ raised on this project, newest first.</Text>
            <ScrollView style={styles.sheetList}>
              {versions.isLoading ? (
                <Text style={styles.sheetEmpty}>Loading versions…</Text>
              ) : !versions.data?.length ? (
                <Text style={styles.sheetEmpty}>No other versions for this project yet.</Text>
              ) : (
                [...versions.data]
                  .sort(
                    (a, b) =>
                      new Date(b.updatedAt || b.createdAt).getTime() -
                      new Date(a.updatedAt || a.createdAt).getTime(),
                  )
                  .map((version) => {
                    const active = version._id === quotationId
                    return (
                      <Pressable
                        key={version._id}
                        style={[styles.versionRow, active && styles.versionRowActive]}
                        onPress={() => {
                          setHistoryOpen(false)
                          if (!active) navigation.push('BoqDetail', { quotationId: version._id })
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.versionTitle} numberOfLines={1}>
                            {version.title || 'Untitled BOQ'}
                            {active ? '  · viewing' : ''}
                          </Text>
                          <Text style={styles.versionMeta} numberOfLines={1}>
                            {[
                              version.versionLabel || 'Standard',
                              version.status,
                              `${(version.items || []).length} lines`,
                            ].join(' · ')}
                          </Text>
                        </View>
                        <Text style={styles.versionAmount}>{formatInr(version.grandTotal || 0)}</Text>
                      </Pressable>
                    )
                  })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    lockCard: { gap: spacing.sm },
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    lockTitle: { ...typography.bodyStrong, color: c.textPrimary },
    lockBody: { ...typography.caption, color: c.textSecondary },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: 4,
      maxHeight: '75%',
    },
    sheetTitle: { ...typography.h3, color: c.textPrimary },
    sheetHint: { ...typography.caption, color: c.textSecondary, marginBottom: spacing.sm },
    sheetList: { maxHeight: 400 },
    sheetEmpty: { ...typography.caption, color: c.textSecondary, paddingVertical: spacing.md },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    versionRowActive: { backgroundColor: c.accentSoft },
    versionTitle: { ...typography.bodyStrong, color: c.textPrimary },
    versionMeta: { ...typography.micro, color: c.textMuted, marginTop: 2 },
    versionAmount: { ...typography.bodyStrong, color: c.textPrimary },
    headerBlock: { gap: spacing.md },
    footerBlock: { gap: spacing.md, marginTop: spacing.sm },
    statusCard: { gap: spacing.sm },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    versionLabel: { ...typography.caption, color: c.textMuted },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    statusChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
      borderWidth: 1,
      borderColor: c.border,
    },
    statusChipActive: { backgroundColor: c.accent, borderColor: c.accent },
    statusChipDanger: { backgroundColor: c.dangerSoft, borderColor: c.dangerSoft },
    statusChipText: { ...typography.caption, color: c.textSecondary },
    statusChipTextActive: { color: c.textOnAccent, fontWeight: '700' },
    statusChipTextDanger: { color: c.danger, fontWeight: '700' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    itemDesc: { ...typography.body, color: c.textPrimary },
    itemMeta: { ...typography.caption, color: c.textSecondary },
    itemAmount: { ...typography.bodyStrong, color: c.textPrimary },
    addCard: { gap: spacing.sm },
    addRow: { flexDirection: 'row', gap: spacing.sm },
    error: { ...typography.caption, color: c.danger },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    totalLabel: { ...typography.caption, color: c.textSecondary },
    totalValue: { ...typography.caption, color: c.textPrimary },
    grandRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, marginTop: 4 },
    grandLabel: { ...typography.bodyStrong, color: c.textPrimary },
    grandValue: { ...typography.h3, color: c.accent },
  })
}
