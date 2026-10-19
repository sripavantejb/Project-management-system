import { NestedChrome } from '../../components/NestedChrome'
import { useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Fab } from '../../components/Fab'
import { SectionLabel } from '../../components/SectionLabel'
import { SurfaceCard } from '../../components/SurfaceCard'
import { Pill } from '../../components/Badge'
import { Input } from '../../components/Input'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { platformApi } from '../../api/platform'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { PlatformStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<PlatformStackParamList, 'PlatformCompanies'>

function statusColor(c: AppColors) {
  return { trial: c.warning, active: c.success, suspended: c.danger, cancelled: c.danger }
}

export function PlatformCompaniesScreen({ navigation }: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: platformApi.tenants,
  })

  const chromeProps = {
    title: "Companies",
    subtitle: "Workspaces on Clyro",
    subtitleIcon: 'business-outline' as const,
  }

  if (isLoading) {
    return (
      <NestedChrome {...chromeProps}>
      <LoadingState label="Loading companies…" variant="list" />
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

  const tenants = data || []
  const q = search.trim().toLowerCase()
  const filtered = q
    ? tenants.filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.slug?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q),
      )
    : tenants

  return (
    <NestedChrome {...chromeProps}>
      <FlatList
        data={filtered}
        keyExtractor={(t) => t._id}
        contentContainerStyle={listContent}
        ListHeaderComponent={
          <>
            <Input
              label="Search"
              placeholder="Company name or slug…"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {filtered.length > 0 ? <SectionLabel count={filtered.length}>Workspaces</SectionLabel> : null}
          </>
        }
        renderItem={({ item }) => (
          <SurfaceCard onPress={() => navigation.navigate('TenantDetail', { tenantId: item._id })}>
            <View style={styles.cardTop}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Pill
                label={item.status}
                color={statusColor(colors)[item.status]}
                bg={`${statusColor(colors)[item.status]}22`}
              />
            </View>
            <Text style={styles.meta}>
              {item.slug} · {item.seatsUsed}/{item.seatLimit} seats
              {item.subscriptionPlan ? ` · ${item.subscriptionPlan}` : ''}
            </Text>
          </SurfaceCard>
        )}
        ListEmptyComponent={
          <EmptyState
            title={q ? 'No matches' : 'No workspaces yet'}
            body={q ? 'Try a different search.' : 'Create the first tenant to onboard a company.'}
          />
        }
      />
      <Fab label="New workspace" onPress={() => navigation.navigate('CreateTenant')} aboveTabBar={false} />
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    name: { ...typography.bodyStrong, color: c.textPrimary, flexShrink: 1 },
    meta: { ...typography.caption, color: c.textSecondary, marginTop: 4 },
  })
}
