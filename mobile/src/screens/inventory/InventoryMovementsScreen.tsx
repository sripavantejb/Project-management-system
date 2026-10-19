import { NestedChrome } from '../../components/NestedChrome'
import { useNavigation } from '@react-navigation/native'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { SurfaceCard } from '../../components/SurfaceCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { inventoryApi } from '../../api/inventory'
import { isApiError } from '../../api/client'

function typeColorMap(c: AppColors) {
  return { in: c.success, out: c.danger, adjust: c.accent }
}

export function InventoryMovementsScreen() {
  const navigation = useNavigation()
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [filter, setFilter] = useState<'all' | 'in' | 'out' | 'adjust'>('all')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: () => inventoryApi.movements(),
  })

  const chromeProps = {
    title: 'Stock movement history',
    subtitle: 'Inward, dispatch, and adjustments',
    subtitleIcon: 'time-outline' as const,
  }

  if (isLoading) {
    return (
      <NestedChrome {...chromeProps}>
      <LoadingState label="Loading movements…" variant="list" />
      </NestedChrome>
    )
  }
  if (isError) {
    return (
      <NestedChrome {...chromeProps}>
      <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
      </NestedChrome>
    )
  }

  const movements = (data || []).filter((m) => filter === 'all' || m.type === filter)
  const inward = (data || []).filter((m) => m.type === 'in').reduce((n, m) => n + m.quantity, 0)
  const dispatched = (data || []).filter((m) => m.type === 'out').reduce((n, m) => n + m.quantity, 0)

  return (
    <NestedChrome {...chromeProps}>
      <FlatList
        data={movements}
        keyExtractor={(m) => m._id}
        contentContainerStyle={listContent}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Total inward</Text>
                <Text style={styles.metricValue}>{inward}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Total dispatched</Text>
                <Text style={styles.metricValue}>{dispatched}</Text>
              </View>
            </View>
            <View style={styles.filters}>
              {(['all', 'in', 'out', 'adjust'] as const).map((key) => (
                <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.filterOn]}>
                  <Text style={[styles.filterText, filter === key && styles.filterTextOn]}>
                    {key === 'all' ? 'All' : key === 'in' ? 'Inward' : key === 'out' ? 'Dispatch' : 'Adjust'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const itemName = typeof item.itemId === 'object' ? item.itemId?.name : 'Item'
          const signed = item.type === 'out' ? -item.quantity : item.quantity
          const who = item.createdBy?.name
          const where = item.projectId?.name
          return (
            <SurfaceCard>
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.kind}>
                    {item.type === 'in' ? 'Inward' : item.type === 'out' ? 'Dispatch' : 'Adjustment'}
                    {' · '}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {itemName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {[where, who, item.note, `Balance ${item.balanceAfter}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={[styles.qty, { color: typeColorMap(colors)[item.type] }]}>
                  {signed > 0 ? `+${signed}` : signed}
                </Text>
              </View>
            </SurfaceCard>
          )
        }}
        ListEmptyComponent={<EmptyState title="No stock movements yet" />}
      />
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    metrics: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: c.border, padding: 12 },
    metricLabel: { ...typography.micro, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    metricValue: { fontSize: 28, fontWeight: '500', color: c.textPrimary, marginTop: 4 },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filter: { backgroundColor: '#efeeec', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
    filterOn: { backgroundColor: '#1e2022' },
    filterText: { ...typography.captionStrong, color: '#44474a' },
    filterTextOn: { color: '#fff' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    kind: { ...typography.micro, color: '#7a573b', letterSpacing: 0.4, textTransform: 'uppercase' },
    name: { ...typography.bodyStrong, color: c.textPrimary, fontSize: 16 },
    meta: { ...typography.caption, color: c.textSecondary },
    qty: { fontSize: 22, fontWeight: '600' },
  })
}
