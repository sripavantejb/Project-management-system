import { NestedChrome } from '../../components/NestedChrome'
import { useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionLabel } from '../../components/SectionLabel'
import { StatCard } from '../../components/StatCard'
import { SurfaceCard } from '../../components/SurfaceCard'
import { Fab } from '../../components/Fab'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { formatInr, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { inventoryApi } from '../../api/inventory'
import { isApiError } from '../../api/client'
import type { InventoryItem } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'Inventory'>

export function InventoryScreen({ navigation }: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])

  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)

  const summary = useQuery({ queryKey: ['inventory-summary'], queryFn: inventoryApi.summary })
  const items = useQuery({ queryKey: ['inventory-items'], queryFn: () => inventoryApi.items() })

  const moveMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: 'in' | 'out' }) => inventoryApi.move(id, { type, quantity: 1 }),
    onSettled: () => {
      setBusyId(null)
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
    },
    onError: (err) => Alert.alert('Could not update stock', isApiError(err) ? err.message : 'Try again'),
  })

  const chromeProps = {
    title: 'Master stock catalog',
    subtitle: 'On-hand materials, value, and low stock',
    subtitleIcon: 'cube-outline' as const,
  }

  if (summary.isLoading || items.isLoading) {
    return (
      <NestedChrome {...chromeProps}>
      <LoadingState label="Loading inventory…" variant="dashboard" />
      </NestedChrome>
    )
  }
  if (summary.isError) {
    return (
      <NestedChrome {...chromeProps}>
      <ErrorState message={isApiError(summary.error) ? summary.error.message : undefined} onRetry={() => summary.refetch()} />
      </NestedChrome>
    )
  }

  const data = summary.data!
  const list = items.data || []
  const renderItem = ({ item }: { item: InventoryItem }) => {
    const low = item.quantity <= item.reorderLevel
    return (
      <SurfaceCard>
        <View style={styles.cardTop}>
          <Text style={styles.sku} numberOfLines={1}>
            {[item.sku, item.category].filter(Boolean).join(' · ') || 'Stock'}
          </Text>
          <Text style={[styles.stockPill, low && styles.stockPillLow]}>{low ? 'Low stock' : 'In stock'}</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.meta}>
          {item.quantity} {item.unit}
          {item.location ? ` · ${item.location}` : ''}
          {item.reorderLevel ? ` · reorder at ${item.reorderLevel}` : ''}
        </Text>
        <Text style={styles.value}>{formatInr(item.quantity * item.unitCost)}</Text>
        <View style={styles.moveRow}>
          <Pressable
            style={[styles.moveBtn, styles.moveBtnDark]}
            disabled={busyId === item._id}
            onPress={() => {
              setBusyId(item._id)
              moveMutation.mutate({ id: item._id, type: 'in' })
            }}
          >
            <Text style={styles.moveTextLight}>Receive</Text>
          </Pressable>
          <Pressable
            style={styles.moveBtn}
            disabled={busyId === item._id || item.quantity <= 0}
            onPress={() => {
              setBusyId(item._id)
              moveMutation.mutate({ id: item._id, type: 'out' })
            }}
          >
            <Text style={styles.moveText}>Dispatch</Text>
          </Pressable>
          <Pressable style={styles.moveBtn} onPress={() => navigation.navigate('InventoryMovements')}>
            <Text style={styles.moveText}>Ledger</Text>
          </Pressable>
        </View>
      </SurfaceCard>
    )
  }

  return (
    <NestedChrome {...chromeProps}>
      <FlatList
        data={list}
        keyExtractor={(i) => i._id}
        contentContainerStyle={listContent}
        refreshControl={
          <RefreshControl
            refreshing={items.isRefetching || summary.isRefetching}
            onRefresh={() => {
              items.refetch()
              summary.refetch()
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View style={styles.statsGrid}>
              <StatCard label="Active SKUs" value={data.totals.items} />
              <StatCard label="Stock value" value={formatInr(data.totals.value)} />
              <StatCard label="Low stock" value={data.totals.lowStock} tone={data.totals.lowStock ? 'warning' : 'default'} />
            </View>
            {list.length > 0 ? <SectionLabel count={list.length}>Items</SectionLabel> : null}
          </View>
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
            title="No inventory items yet"
            body="Add materials and stock levels to track on hand."
            action="Add item"
            onAction={() => navigation.navigate('CreateInventoryItem')}
          />
        }
      />
      <Fab label="Add item" onPress={() => navigation.navigate('CreateInventoryItem')} />
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sku: { ...typography.micro, color: '#7a573b', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 },
    stockPill: { ...typography.micro, color: '#2d5a46', backgroundColor: '#e4f3ea', overflow: 'hidden', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
    stockPillLow: { color: '#9e3b3b', backgroundColor: '#ffdad6' },
    name: { ...typography.bodyStrong, color: c.textPrimary, fontSize: 18, marginTop: 4 },
    meta: { ...typography.caption, color: c.textSecondary, marginTop: 4 },
    value: { ...typography.captionStrong, color: c.textPrimary, marginTop: 2 },
    moveRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 10 },
    moveBtn: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 4, backgroundColor: '#efeeec' },
    moveBtnDark: { backgroundColor: '#1e2022' },
    moveText: { ...typography.micro, color: c.textSecondary, fontWeight: '700', letterSpacing: 0.3 },
    moveTextLight: { ...typography.micro, color: '#ffffff', fontWeight: '700', letterSpacing: 0.3 },
  })
}
