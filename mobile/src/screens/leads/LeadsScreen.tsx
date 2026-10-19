import { useMemo, useState } from 'react'
import { Alert, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NestedChrome } from '../../components/NestedChrome'
import { Fab } from '../../components/Fab'
import { Pill } from '../../components/Badge'
import { SurfaceCard } from '../../components/SurfaceCard'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { formatInr, radius, spacing, stageLabel, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { leadsApi } from '../../api/leads'
import { adminApi } from '../../api/admin'
import { isApiError } from '../../api/client'
import { telLink, whatsappLink } from '../../utils/phone'
import type { LeadStage } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { CompositeNavigationProp } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import type { MoreStackParamList, RootTabParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'Leads'>
type Nav = CompositeNavigationProp<
  Props['navigation'],
  BottomTabNavigationProp<RootTabParamList>
>

function stageColorMap(c: AppColors): Record<LeadStage, string> {
  return {
    new_enquiry: c.textMuted,
    site_visit: c.accent,
    quotation_sent: c.warning,
    negotiation: c.warning,
    mood_board: c.accent,
    hot: c.success,
    dead: c.danger,
    won: c.success,
    lost: c.danger,
  }
}

const STAGE_ORDER: LeadStage[] = [
  'new_enquiry',
  'site_visit',
  'quotation_sent',
  'negotiation',
  'mood_board',
  'hot',
  'dead',
]

export function LeadsScreen({ navigation }: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const tabNav = navigation as unknown as Nav

  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['leads'],
    queryFn: leadsApi.list,
  })
  const users = useQuery({ queryKey: ['users'], queryFn: adminApi.users })

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) => leadsApi.update(id, { stage }),
    onSettled: () => {
      setBusyId(null)
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, owner }: { id: string; owner: string | null }) => leadsApi.update(id, { owner }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const convertMutation = useMutation({
    mutationFn: (id: string) => leadsApi.convert(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
  Alert.alert('Marked Hot', `${result.project.name} was added to Projects.`, [
        {
          text: 'Open project',
          onPress: () =>
            tabNav.navigate('Projects', {
              screen: 'ProjectOverview',
              params: { projectId: result.project._id, projectName: result.project.name },
            }),
        },
        { text: 'OK' },
      ])
    },
    onError: (err) => Alert.alert('Could not convert lead', isApiError(err) ? err.message : 'Try again'),
    onSettled: () => setBusyId(null),
  })

  const nextStage = (stage: LeadStage): LeadStage | null => {
    const normalized =
      stage === 'won' ? 'hot' : stage === 'lost' ? 'dead' : stage
    const idx = STAGE_ORDER.indexOf(normalized)
    // Stop before hot/dead — those are explicit actions
    if (idx < 0 || idx >= STAGE_ORDER.indexOf('hot') - 1) return null
    return STAGE_ORDER[idx + 1]
  }

  return (
    <NestedChrome
      title="Client enquiries"
      subtitle="Pipeline from first call to a live project"
      subtitleIcon="briefcase-outline"
    >
      {isLoading ? (
        <LoadingState label="Loading enquiries…" variant="list" />
      ) : isError ? (
        <ErrorState message={isApiError(error) ? error.message : undefined} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(l) => l._id}
          contentContainerStyle={listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          ListHeaderComponent={
            <View style={styles.pipeline}>
              <Text style={styles.pipelineValue}>{formatInr((data || []).reduce((n, l) => n + (l.estimatedValue || 0), 0))}</Text>
              <Text style={styles.pipelineHint}>{(data || []).filter((l) => l.stage !== 'dead' && l.stage !== 'lost').length} active enquiries</Text>
            </View>
          }
          renderItem={({ item }) => {
            const next = nextStage(item.stage)
            const ownerId = item.owner?._id
            return (
              <Pressable onPress={() => navigation.navigate('LeadDetail', { leadId: item._id })}>
              <SurfaceCard>
                <View style={styles.cardInner}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.clientName}
                    </Text>
                    <Pill label={stageLabel(item.stage)} color={stageColorMap(colors)[item.stage]} bg={`${stageColorMap(colors)[item.stage]}22`} />
                  </View>
                  {item.phone || item.email ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.phone, item.email].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  {item.phone ? (
                    <View style={styles.contactRow}>
                      <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(telLink(item.phone))}>
                        <Ionicons name="call-outline" size={14} color={colors.accent} />
                        <Text style={styles.contactText}>Call</Text>
                      </Pressable>
                      <Pressable
                        style={styles.contactBtn}
                        onPress={() =>
                          Linking.openURL(
                            whatsappLink(item.phone, `Hi ${item.clientName}, following up on your enquiry.`),
                          )
                        }
                      >
                        <Ionicons name="logo-whatsapp" size={14} color={colors.success} />
                        <Text style={styles.contactText}>WhatsApp</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Text style={styles.value}>{formatInr(item.estimatedValue)} estimated</Text>

                  <Text style={styles.assignLabel}>Assign employee</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {(users.data || []).map((u) => {
                      const active = ownerId === u._id
                      return (
                        <Pressable
                          key={u._id}
                          onPress={() => assignMutation.mutate({ id: item._id, owner: active ? null : u._id })}
                          style={[styles.chip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                            {u.name}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </ScrollView>

                  <View style={styles.actions}>
                    {next ? (
                      <Pressable
                        style={styles.actionBtn}
                        disabled={busyId === item._id}
                        onPress={() => {
                          setBusyId(item._id)
                          stageMutation.mutate({ id: item._id, stage: next })
                        }}
                      >
                        <Text style={styles.actionText}>Move to {stageLabel(next)}</Text>
                      </Pressable>
                    ) : null}
                    {item.stage !== 'hot' &&
                    item.stage !== 'dead' &&
                    item.stage !== 'won' &&
                    item.stage !== 'lost' ? (
                      <>
                        <Pressable
                          style={[styles.actionBtn, styles.wonBtn]}
                          disabled={busyId === item._id}
                          onPress={() => {
                            setBusyId(item._id)
                            convertMutation.mutate(item._id)
                          }}
                        >
                          <Text style={[styles.actionText, { color: colors.success }]}>Mark Hot</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, styles.lostBtn]}
                          disabled={busyId === item._id}
                          onPress={() => {
                            setBusyId(item._id)
                            stageMutation.mutate({ id: item._id, stage: 'dead' })
                          }}
                        >
                          <Text style={[styles.actionText, { color: colors.danger }]}>Mark Dead</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              </SurfaceCard>
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <EmptyState
              title="No enquiries yet"
              body="New client enquiries will show up here."
              action="Add enquiry"
              onAction={() => navigation.navigate('CreateLead')}
            />
          }
        />
      )}

      <Fab label="Add enquiry" onPress={() => navigation.navigate('CreateLead')} />
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    pipeline: { marginBottom: 8, gap: 2 },
    pipelineValue: { fontSize: 32, fontWeight: '500', letterSpacing: -0.6, color: c.textPrimary },
    pipelineHint: { ...typography.caption, color: c.textSecondary },
    cardInner: { gap: 4 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    name: { ...typography.bodyStrong, color: c.textPrimary, flexShrink: 1 },
    meta: { ...typography.caption, color: c.textSecondary },
    value: { ...typography.captionStrong, color: c.accent },
    contactRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    contactBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    contactText: { ...typography.micro, color: c.textSecondary },
    assignLabel: { ...typography.micro, color: c.textMuted, marginTop: 8 },
    chips: { gap: 8, paddingVertical: 4 },
    chip: {
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    chipActive: { backgroundColor: c.textPrimary },
    chipText: { ...typography.micro, color: c.textSecondary, maxWidth: 120 },
    chipTextActive: { color: c.canvas },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    convertBtn: { backgroundColor: c.successSoft },
    wonBtn: { backgroundColor: c.successSoft },
    lostBtn: { backgroundColor: c.dangerSoft },
    actionText: { ...typography.micro, color: c.textSecondary },
  })
}
