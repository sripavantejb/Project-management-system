import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Avatar } from '../../components/Avatar'
import { SectionLabel } from '../../components/SectionLabel'
import { formatInr, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { approvalsApi } from '../../api/approvals'
import { isApiError } from '../../api/client'
import { ROLE_LABELS } from '../../utils/roles'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateApprovalRule'>

function roleLabel(role?: string) {
  if (!role) return ''
  return (ROLE_LABELS as Record<string, string>)[role] || role
}

export function CreateApprovalRuleScreen({ route, navigation }: Props) {
  const { entityType, typeLabel, hasAmount } = route.params
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()

  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [steps, setSteps] = useState([{ approverRole: 'owner', approverUser: null as string | null }])
  const [error, setError] = useState('')

  const { data } = useQuery({ queryKey: ['approvals', 'flow'], queryFn: approvalsApi.flow })
  const members = data?.members || []
  const roles = data?.roles || []

  // Pinning a person is an override, so the role follows them. The rule still
  // stores a role, for when the pin is cleared later.
  const mutation = useMutation({
    mutationFn: () => {
      const clean = steps.map((step) => {
        const pinned = members.find((m) => m._id === step.approverUser)
        return { approverRole: pinned?.role || step.approverRole, approverUser: step.approverUser }
      })
      return approvalsApi.createRule({
        entityType,
        minAmount: hasAmount && minAmount !== '' ? Number(minAmount) : 0,
        maxAmount: hasAmount && maxAmount !== '' ? Number(maxAmount) : null,
        approverRole: clean[0].approverRole,
        approverUser: clean[0].approverUser,
        steps: clean,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      navigation.goBack()
    },
    onError: (err) =>
      setError(isApiError(err) ? err.message : 'Could not add this routing'),
  })

  const submit = () => {
    if (hasAmount && maxAmount !== '' && Number(maxAmount) <= Number(minAmount || 0)) {
      setError('The upper limit must be greater than the lower limit')
      return
    }
    setError('')
    mutation.mutate()
  }

  const preview = hasAmount
    ? maxAmount !== ''
      ? `${formatInr(Number(minAmount || 0))} – ${formatInr(Number(maxAmount) - 1)}`
      : Number(minAmount || 0) === 0
        ? 'Any amount'
        : `${formatInr(Number(minAmount))} and above`
    : 'Every one'

  return (
    <FormLayout
      title="Add routing"
      subtitle={typeLabel}
      subtitleIcon="shield-checkmark-outline"

      footer={
        <Button
          title="Add routing"
          onPress={submit}
          loading={mutation.isPending}
          fullWidth
        />
      }
    >
      {hasAmount && (
        <>
          <Input
            label="From amount"
            value={minAmount}
            onChangeText={setMinAmount}
            keyboardType="numeric"
            placeholder="0"
            hint="Leave blank to start at zero"
          />
          <Input
            label="Up to (optional)"
            value={maxAmount}
            onChangeText={setMaxAmount}
            keyboardType="numeric"
            placeholder="No upper limit"
            hint="Blank means this band has no ceiling"
          />
        </>
      )}

      <View style={styles.previewRow}>
        <Ionicons name="filter-outline" size={14} color={colors.textMuted} />
        <Text style={styles.previewText}>
          Applies to: <Text style={styles.previewStrong}>{preview}</Text>
        </Text>
      </View>

      {steps.map((step, index) => {
        const pinned = members.find((m) => m._id === step.approverUser)
        const effectiveRole = pinned?.role || step.approverRole
        return (
          <View key={index}>
            <SectionLabel>{steps.length > 1 ? `Step ${index + 1}` : 'Approver role'}</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
              {roles.map((r) => {
                const active = effectiveRole === r && !pinned
                return (
                  <Pressable
                    key={r}
                    onPress={() =>
                      setSteps((prev) => prev.map((row, i) => (i === index ? { approverRole: r, approverUser: null } : row)))
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{roleLabel(r)}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <Pressable
              onPress={() => setSteps((prev) => prev.map((row, i) => (i === index ? { ...row, approverUser: null } : row)))}
              style={[styles.person, !step.approverUser && styles.personActive]}
            >
              <Text style={styles.personName}>Anyone with the {roleLabel(effectiveRole)} role</Text>
            </Pressable>
            {members.map((m) => {
              const active = step.approverUser === m._id
              return (
                <Pressable
                  key={m._id}
                  onPress={() =>
                    setSteps((prev) =>
                      prev.map((row, i) => (i === index ? { ...row, approverUser: active ? null : m._id } : row)),
                    )
                  }
                  style={[styles.person, active && styles.personActive]}
                >
                  <Avatar name={m.name} uri={m.avatar} size={26} />
                  <Text style={styles.personName}>{m.name}</Text>
                </Pressable>
              )
            })}
          </View>
        )
      })}
      <Button
        title="Add next approver"
        variant="secondary"
        onPress={() => setSteps((prev) => [...prev, { approverRole: 'owner', approverUser: null }])}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    previewText: { ...typography.caption, color: c.textSecondary, flex: 1 },
    previewStrong: { color: c.textPrimary, fontWeight: '600' },

    chipScroll: { flexGrow: 0 },
    chipRow: { gap: spacing.sm, paddingVertical: 2 },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.full,
      backgroundColor: c.surfaceRaised,
    },
    chipActive: { backgroundColor: c.accent },
    chipText: { ...typography.caption, color: c.textSecondary },
    chipTextActive: { color: c.textOnAccent, fontWeight: '600' },

    person: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: spacing.sm,
    },
    personActive: { borderColor: c.accent, backgroundColor: `${c.accent}0d` },
    anyoneWell: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personText: { flex: 1, minWidth: 0 },
    personName: { ...typography.caption, color: c.textPrimary, flex: 1 },
    personRole: { ...typography.micro, color: c.textMuted, marginTop: 1 },

    error: { ...typography.caption, color: c.danger, marginTop: spacing.md },
  })
}
