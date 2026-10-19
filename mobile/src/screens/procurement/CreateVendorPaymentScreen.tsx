import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { SurfaceCard } from '../../components/SurfaceCard'
import { VendorPicker } from '../../components/VendorPicker'
import { ProjectPicker } from '../../components/ProjectPicker'
import { formatInr, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { billingApi } from '../../api/billing'
import { purchaseOrdersApi } from '../../api/procurement'
import { procurementFlowApi } from '../../api/procurementFlow'
import { isApiError } from '../../api/client'
import { refId } from './procurementMeta'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateVendorPayment'>

/**
 * Raise a vendor payment. Linking both a PO and a vendor invoice lets the
 * server run its 3-way match — a mismatch parks the payment on hold instead
 * of letting it through to accounts.
 */
export function CreateVendorPaymentScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const qc = useQueryClient()
  const params = route.params || {}

  const [projectId, setProjectId] = useState(params.projectId || '')
  const [vendor, setVendor] = useState<string | undefined>(undefined)
  const [purchaseOrder, setPurchaseOrder] = useState('')
  const [vendorInvoice, setVendorInvoice] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [debitAmount, setDebitAmount] = useState('')
  const [tdsAmount, setTdsAmount] = useState('')
  const [otherDeductions, setOtherDeductions] = useState('')
  const [creditDays, setCreditDays] = useState('30')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const pos = useQuery({
    queryKey: ['purchase-orders', projectId],
    queryFn: () => purchaseOrdersApi.list(projectId ? { projectId } : undefined),
  })
  const invoices = useQuery({
    queryKey: ['billing-invoices', 'unpaid', ''],
    queryFn: () => billingApi.invoices({ status: 'unpaid' }),
  })

  // Only offer paperwork that belongs to the chosen vendor.
  const vendorPos = (pos.data || []).filter((po) => !vendor || refId(po.vendor) === vendor)
  const vendorInvoices = (invoices.data || []).filter((inv) => !vendor || refId(inv.vendor) === vendor)

  const net = Math.max(
    0,
    (Number(invoiceAmount) || 0) -
      (Number(debitAmount) || 0) -
      (Number(tdsAmount) || 0) -
      (Number(otherDeductions) || 0),
  )

  const mutation = useMutation({
    mutationFn: () =>
      procurementFlowApi.createPayment({
        vendor: vendor!,
        projectId: projectId || null,
        purchaseOrder: purchaseOrder || null,
        vendorInvoice: vendorInvoice || null,
        invoiceAmount: Number(invoiceAmount) || 0,
        debitAmount: Number(debitAmount) || 0,
        tdsAmount: Number(tdsAmount) || 0,
        otherDeductions: Number(otherDeductions) || 0,
        creditDays: Number(creditDays) || 30,
        dueDate: dueDate.trim() || null,
        notes: notes.trim(),
      }),
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: ['vendor-payments'] })
      qc.invalidateQueries({ queryKey: ['procurement-dashboard'] })
      navigation.goBack()
      return payment
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not raise the payment'),
  })

  return (
    <FormLayout
      title="Raise payment"
      subtitle="Vendor payment gate"
      subtitleIcon="wallet-outline"
      card={false}
      footer={
        <Button
          title="Raise payment"
          onPress={() => {
            if (!vendor) {
              setError('Choose the vendor being paid')
              return
            }
            if (!(Number(invoiceAmount) > 0)) {
              setError('Enter the invoice amount')
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
      <VendorPicker label="Vendor" value={vendor} onChange={setVendor} />
      <ProjectPicker label="Project (optional)" value={projectId} onChange={setProjectId} />

      <Text style={styles.label}>Purchase order</Text>
      {vendorPos.length === 0 ? (
        <Text style={styles.hint}>No purchase orders for this vendor — the match will stay pending.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {vendorPos.map((po) => {
            const active = po._id === purchaseOrder
            return (
              <Pressable
                key={po._id}
                onPress={() => {
                  setPurchaseOrder(active ? '' : po._id)
                  if (!active && !invoiceAmount) setInvoiceAmount(String(po.value || ''))
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {po.poNumber} · {formatInr(po.value)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      <Text style={styles.label}>Vendor invoice</Text>
      {vendorInvoices.length === 0 ? (
        <Text style={styles.hint}>No unpaid invoices stored for this vendor.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {vendorInvoices.map((inv) => {
            const active = inv._id === vendorInvoice
            return (
              <Pressable
                key={inv._id}
                onPress={() => {
                  setVendorInvoice(active ? '' : inv._id)
                  if (!active) setInvoiceAmount(String(inv.amount || ''))
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {inv.invoiceNumber} · {formatInr(inv.amount)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      <Input
        label="Invoice amount"
        keyboardType="numeric"
        value={invoiceAmount}
        onChangeText={setInvoiceAmount}
      />

      <Text style={styles.label}>Deductions</Text>
      <View style={styles.row}>
        <Input
          label="Debit notes"
          keyboardType="numeric"
          placeholder="0"
          value={debitAmount}
          onChangeText={setDebitAmount}
          containerStyle={styles.flex}
        />
        <Input
          label="TDS"
          keyboardType="numeric"
          placeholder="0"
          value={tdsAmount}
          onChangeText={setTdsAmount}
          containerStyle={styles.flex}
        />
        <Input
          label="Other"
          keyboardType="numeric"
          placeholder="0"
          value={otherDeductions}
          onChangeText={setOtherDeductions}
          containerStyle={styles.flex}
        />
      </View>

      <SurfaceCard>
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net payable</Text>
          <Text style={styles.netValue}>{formatInr(net)}</Text>
        </View>
        <Text style={styles.netHint}>Invoice − debit − TDS − other.</Text>
      </SurfaceCard>

      <View style={styles.row}>
        <Input
          label="Credit days"
          keyboardType="numeric"
          value={creditDays}
          onChangeText={setCreditDays}
          containerStyle={styles.flex}
        />
        <Input
          label="Due date"
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          value={dueDate}
          onChangeText={setDueDate}
          containerStyle={styles.flex}
        />
      </View>

      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />

      {vendor && purchaseOrder && vendorInvoice ? (
        <Text style={styles.matchHint}>
          Both the PO and invoice are linked, so a 3-way match runs when this is raised.
        </Text>
      ) : (
        <Text style={styles.hint}>
          Link both a PO and an invoice to get an automatic 3-way match.
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    label: { ...typography.captionStrong, color: c.textSecondary, marginTop: spacing.sm },
    hint: { ...typography.micro, color: c.textMuted },
    chipRow: { gap: spacing.sm, paddingVertical: 2 },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { ...typography.caption, color: c.textSecondary },
    chipTextActive: { color: c.textOnAccent, fontWeight: '700' },
    row: { flexDirection: 'row', gap: spacing.sm },
    flex: { flex: 1 },
    netRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    netLabel: { ...typography.caption, color: c.textSecondary },
    netValue: { ...typography.h2, color: c.textPrimary },
    netHint: { ...typography.micro, color: c.textMuted, marginTop: 4 },
    matchHint: { ...typography.micro, color: c.accentHover },
    error: { ...typography.caption, color: c.danger },
  })
}
