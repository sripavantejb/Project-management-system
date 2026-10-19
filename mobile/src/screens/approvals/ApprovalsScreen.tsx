import { NestedChrome } from '../../components/NestedChrome'
import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { IconButton } from '../../components/IconButton'
import { SurfaceCard } from '../../components/SurfaceCard'
import { Avatar } from '../../components/Avatar'
import { Pill } from '../../components/Badge'
import { ErrorState, LoadingState } from '../../components/States'
import { formatInr, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { approvalsApi } from '../../api/approvals'
import { CentralApprovalsQueue } from './CentralApprovalsQueue'
import { isApiError } from '../../api/client'
import { useToastStore } from '../../store/toastStore'
import { ROLE_LABELS } from '../../utils/roles'
import type { ApprovalBand, ApprovalFlowType } from '../../types/models'
import type { MoreStackParamList } from '../../navigation/types'
import { smartGoBack } from '../../navigation/openProject'

type Props = NativeStackScreenProps<MoreStackParamList, 'Approvals'>

/** `approverRole` is free-form server-side, so fall back to the raw key. */
function roleLabel(role?: string) {
  if (!role) return ''
  return (ROLE_LABELS as Record<string, string>)[role] || role
}

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  purchase_order: 'cube-outline',
  boq: 'document-text-outline',
  expense: 'wallet-outline',
  task: 'checkbox-outline',
}

/**
 * The server hands back effective bands rather than raw rules, so there is no
 * routing logic here — only how to word one.
 */
function bandLabel(band: ApprovalBand, hasAmount: boolean) {
  if (band.shadowed) return 'Never applies'
  if (!hasAmount) return 'Every one'
  if (band.max == null) {
    return band.min === 0 ? 'Any amount' : `${formatInr(band.min)} and above`
  }
  return `${formatInr(band.min)} – ${formatInr(band.max - 1)}`
}

export function ApprovalsScreen({ route, navigation }: Props) {
  const [mode, setMode] = useState<'queue' | 'routing'>('queue')
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()
  const pushToast = useToastStore((s) => s.push)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['approvals', 'flow'],
    queryFn: approvalsApi.flow,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['approvals'] })
  const notifyError = (err: unknown) =>
    pushToast({
      title: 'Something went wrong',
      body: isApiError(err) ? err.message : undefined,
      type: 'error',
    })

  const removeRule = useMutation({
    mutationFn: approvalsApi.removeRule,
    onSuccess: () => {
      invalidate()
      pushToast({ title: 'Routing removed' })
    },
    onError: notifyError,
  })

  const removeType = useMutation({
    mutationFn: approvalsApi.removeType,
    onSuccess: (removedRules) => {
      invalidate()
      pushToast({
        title: removedRules
          ? `Type removed with ${removedRules} rule${removedRules === 1 ? '' : 's'}`
          : 'Type removed',
      })
    },
    onError: notifyError,
  })

  const confirmRemoveType = (type: ApprovalFlowType) => {
    if (!type._id) return
    const id = type._id
    Alert.alert(
      `Remove “${type.label}”?`,
      'Any routing on it goes too. Records already routed keep their approver.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeType.mutate(id) },
      ],
    )
  }

  if (mode === 'queue') {
    return (
      <NestedChrome
        title="Central approvals"
        subtitle="Drawings, expenses, and tasks waiting for a sign-off"
        subtitleIcon="shield-checkmark-outline"
        onBack={() => smartGoBack(navigation, route)}
        right={
          <IconButton
            icon="options-outline"
            label="Approval routing"
            tone="ghost"
            onPress={() => setMode('routing')}
          />
        }
      >
        <CentralApprovalsQueue />
      </NestedChrome>
    )
  }

  const chromeProps = {
    title: 'Approvals',
    subtitle: 'Who signs off on what',
    subtitleIcon: 'shield-checkmark-outline' as const,
    onBack: () => setMode('queue'),
    right: (
      <IconButton
        icon="add-outline"
        label="New approval type"
        tone="ghost"
        onPress={() => navigation.navigate('CreateApprovalType')}
      />
    ),
  }

  if (isLoading) {
    return (
      <NestedChrome {...chromeProps}>
      <LoadingState label="Loading approvals…" variant="list" />
      </NestedChrome>
    )
  }

  if (isError) {
    return (
      <NestedChrome {...chromeProps}>
      <ErrorState
          message={isApiError(error) ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </NestedChrome>
    )
  }

  const flow = data?.flow || []
  const routedCount = flow.reduce((n, t) => n + t.bands.length, 0)

  return (
    <NestedChrome {...chromeProps}>
      <ScrollView contentContainerStyle={listContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          When someone raises one of these it routes automatically to the approver
          whose band the amount falls into. The most specific band wins, so you can
          layer an escalation on top of a catch-all.
        </Text>

        {routedCount === 0 && (
          <View style={styles.notice}>
            <Ionicons name="shield-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.noticeText}>
              Nothing needs approval yet. Add routing to a type below and new
              records will start going to that approver.
            </Text>
          </View>
        )}

        {flow.map((type) => (
          <SurfaceCard key={type.key}>
            <View style={styles.cardTop}>
              <View style={styles.iconWell}>
                <Ionicons
                  name={TYPE_ICONS[type.key] || 'document-outline'}
                  size={16}
                  color={colors.textSecondary}
                />
              </View>
              <View style={styles.cardHeadText}>
                <View style={styles.titleRow}>
                  <Text style={styles.typeName} numberOfLines={1}>
                    {type.label}
                  </Text>
                  {!type.isBuiltin && (
                    <Pill label="Custom" color={colors.textSecondary} bg={colors.surfaceRaised} />
                  )}
                </View>
                {!!type.description && (
                  <Text style={styles.typeDesc} numberOfLines={2}>
                    {type.description}
                  </Text>
                )}
              </View>
              {!type.isBuiltin && (
                <Pressable
                  onPress={() => confirmRemoveType(type)}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${type.label}`}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {type.bands.length === 0 ? (
              <Text style={styles.emptyLine}>No routing — these don&rsquo;t need approval.</Text>
            ) : (
              <View style={styles.bands}>
                {type.bands.map((band, i) => (
                  <BandRow
                    key={`${band.ruleId}-${i}`}
                    band={band}
                    hasAmount={!!type.amountPath}
                    colors={colors}
                    styles={styles}
                    onRemove={() =>
                      Alert.alert('Remove this routing?', bandLabel(band, !!type.amountPath), [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeRule.mutate(band.ruleId),
                        },
                      ])
                    }
                  />
                ))}
              </View>
            )}

            <Pressable
              style={styles.addBtn}
              onPress={() =>
                navigation.navigate('CreateApprovalRule', {
                  entityType: type.key,
                  typeLabel: type.label,
                  hasAmount: !!type.amountPath,
                })
              }
            >
              <Ionicons name="add" size={14} color={colors.accent} />
              <Text style={styles.addText}>Add routing</Text>
            </Pressable>
          </SurfaceCard>
        ))}
      </ScrollView>
    </NestedChrome>
  )
}

function BandRow({
  band,
  hasAmount,
  colors,
  styles,
  onRemove,
}: {
  band: ApprovalBand
  hasAmount: boolean
  colors: AppColors
  styles: ReturnType<typeof createStyles>
  onRemove: () => void
}) {
  const approver = band.rule?.resolvedApprover
  const pinned = !!band.rule?.approverUser

  return (
    <View style={[styles.band, band.shadowed && styles.bandDead]}>
      <View style={styles.bandTop}>
        <Text style={[styles.bandLabel, band.shadowed && styles.bandLabelDead]}>
          {bandLabel(band, hasAmount)}
        </Text>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove this routing">
          <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.bandBottom}>
        <Ionicons name="arrow-forward" size={13} color={colors.textMuted} />
        {approver ? (
          <>
            <Avatar name={approver.name} uri={approver.avatar} size={22} />
            <Text style={styles.approverName} numberOfLines={1}>
              {approver.name}
            </Text>
          </>
        ) : (
          /* A role nobody holds would silently swallow approvals — say so. */
          <Text style={styles.noApprover}>Nobody in this role</Text>
        )}
        <Text style={styles.roleTag} numberOfLines={1}>
          {pinned ? 'Pinned' : roleLabel(band.rule?.approverRole)}
        </Text>
      </View>
    </View>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    intro: { ...typography.caption, color: c.textSecondary, lineHeight: 19 },

    notice: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    noticeText: { ...typography.caption, color: c.textSecondary, flex: 1, lineHeight: 19 },

    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    iconWell: {
      width: 32,
      height: 32,
      borderRadius: radius.md,
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeadText: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    typeName: { ...typography.bodyStrong, color: c.textPrimary, flexShrink: 1 },
    typeDesc: { ...typography.micro, color: c.textMuted, marginTop: 2 },

    emptyLine: { ...typography.caption, color: c.textSecondary, marginTop: spacing.md },

    bands: { gap: spacing.sm, marginTop: spacing.md },
    band: { backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: spacing.md },
    bandDead: { backgroundColor: `${c.danger}0d`, borderWidth: 1, borderColor: `${c.danger}33` },
    bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bandLabel: { ...typography.captionStrong, color: c.textPrimary, flex: 1 },
    bandLabelDead: { color: c.danger },
    bandBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.sm,
    },
    approverName: { ...typography.caption, color: c.textPrimary, flexShrink: 1 },
    noApprover: { ...typography.caption, color: c.danger, flexShrink: 1 },
    roleTag: { ...typography.micro, color: c.textMuted, marginLeft: 'auto' },

    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      marginTop: spacing.md,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      backgroundColor: `${c.accent}14`,
    },
    addText: { ...typography.micro, color: c.accent },
  })
}
