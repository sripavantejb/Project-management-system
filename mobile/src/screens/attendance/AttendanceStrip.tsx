import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { attendanceApi } from '../../api/attendance'
import { isApiError } from '../../api/client'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useAuthStore } from '../../store/authStore'
import { canUseAttendance } from '../../utils/roles'
import { formatPunchTime } from './format'

export function AttendanceStrip({ onOpen }: { onOpen: () => void }) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const user = useAuthStore((s) => s.user)
  const eligible = canUseAttendance(user)

  const query = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: attendanceApi.today,
    enabled: eligible,
    staleTime: 15_000,
  })

  if (!eligible) return null
  if (isApiError(query.error) && query.error.status === 404) return null

  const record = query.data?.record
  const punchedIn = !!record?.punchIn
  const punchedOut = !!record?.punchOut
  const title = punchedOut ? 'Day closed' : punchedIn ? 'Punched in' : 'Punch in for today'
  const detail = punchedOut
    ? `Out at ${formatPunchTime(record?.punchOut?.at)}`
    : punchedIn
      ? `In since ${formatPunchTime(record?.punchIn?.at)}`
      : 'Location is saved only when you tap'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] }]}
    >
      <View style={[styles.dot, punchedOut ? styles.dotDone : punchedIn ? styles.dotLive : styles.dotIdle]} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Text style={styles.action}>{punchedOut ? 'View' : punchedIn ? 'Punch out' : 'Start'}</Text>
    </Pressable>
  )
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    dotIdle: { backgroundColor: colors.accent },
    dotLive: { backgroundColor: colors.success },
    dotDone: { backgroundColor: colors.textMuted },
    copy: { flex: 1, minWidth: 0 },
    title: { ...typography.bodyStrong, color: colors.textPrimary },
    detail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    action: { ...typography.captionStrong, color: colors.accentText },
  })
}
