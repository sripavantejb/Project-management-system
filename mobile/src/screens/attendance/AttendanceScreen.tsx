import { memo, useMemo, useState } from 'react'
import { Alert, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NestedChrome } from '../../components/NestedChrome'
import { Button } from '../../components/Button'
import { Avatar } from '../../components/Avatar'
import { SegmentedControl } from '../../components/SegmentedControl'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { attendanceApi, type AttendanceRecord, type AttendanceUser } from '../../api/attendance'
import { isApiError } from '../../api/client'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useAuthStore } from '../../store/authStore'
import { canReviewAttendance, canUseAttendance, roleLabelFor } from '../../utils/roles'
import { capturePunchLocation } from './location'
import { formatPunchTime, formatWorkDate, indiaToday, mapsUrl, shiftWorkDate } from './format'

type TeamPerson = { user: AttendanceUser; record: AttendanceRecord | null }

function messageOf(err: unknown) {
  if (isApiError(err)) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

function LocationLine({
  label,
  latitude,
  longitude,
  color,
}: {
  label: string
  latitude?: number | null
  longitude?: number | null
  color: string
}) {
  const url = mapsUrl(latitude, longitude)
  if (!url) return null
  return (
    <Pressable onPress={() => void Linking.openURL(url)} hitSlop={6} accessibilityRole="link">
      <Text style={{ ...typography.caption, color }}>{label}</Text>
    </Pressable>
  )
}

function MyDay() {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)

  const today = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: attendanceApi.today,
  })
  const history = useQuery({
    queryKey: ['attendance', 'mine'],
    queryFn: attendanceApi.mine,
    enabled: today.data?.eligible !== false,
  })

  if (today.isLoading) return <LoadingState label="Loading attendance" />
  if (today.isError) {
    return <ErrorState message={messageOf(today.error)} onRetry={() => void today.refetch()} />
  }
  if (!today.data?.eligible) {
    return <EmptyState title="Attendance is for studio staff" body="Client and vendor accounts don’t punch in." />
  }

  const record = today.data.record
  const punchedIn = !!record?.punchIn
  const punchedOut = !!record?.punchOut
  const status = punchedOut ? 'Day closed' : punchedIn ? 'You’re in' : 'Not punched in'
  const hint = punchedOut
    ? `In ${formatPunchTime(record?.punchIn?.at)} · Out ${formatPunchTime(record?.punchOut?.at)}`
    : punchedIn
      ? `Started at ${formatPunchTime(record?.punchIn?.at)}`
      : 'Punch in when the day starts. Location is read only at that tap.'

  const punch = async (kind: 'in' | 'out') => {
    if (busy) return
    setBusy(kind)
    try {
      const pin = await capturePunchLocation()
      if (kind === 'in') await attendanceApi.punchIn(pin)
      else await attendanceApi.punchOut(pin)
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
    } catch (err) {
      Alert.alert(kind === 'in' ? 'Could not punch in' : 'Could not punch out', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{formatWorkDate(today.data.workDate)}</Text>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.hint}>{hint}</Text>
        <View style={styles.heroActions}>
          {!punchedIn ? (
            <Button title="Punch in" fullWidth loading={busy === 'in'} disabled={!!busy} onPress={() => void punch('in')} />
          ) : null}
          {punchedIn && !punchedOut ? (
            <Button title="Punch out" fullWidth loading={busy === 'out'} disabled={!!busy} onPress={() => void punch('out')} />
          ) : null}
        </View>
        <LocationLine label="Where you punched in" latitude={record?.punchIn?.latitude} longitude={record?.punchIn?.longitude} color={colors.accentText} />
        <LocationLine label="Where you punched out" latitude={record?.punchOut?.latitude} longitude={record?.punchOut?.longitude} color={colors.accentText} />
      </View>

      <Text style={styles.section}>Recent days</Text>
      {(history.data || []).length === 0 ? (
        <Text style={styles.empty}>No punches yet.</Text>
      ) : (
        (history.data || []).map((row) => (
          <View key={row.id} style={styles.historyRow}>
            <Text style={styles.historyDate}>{formatWorkDate(row.workDate)}</Text>
            <Text style={styles.historyTimes}>
              {formatPunchTime(row.punchIn?.at)} – {row.punchOut ? formatPunchTime(row.punchOut.at) : 'open'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const TeamRow = memo(function TeamRow({ item }: { item: TeamPerson }) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const punchedIn = !!item.record?.punchIn
  const punchedOut = !!item.record?.punchOut
  const status = punchedOut ? 'Out' : punchedIn ? 'In' : 'Not in'
  const tone = punchedOut ? colors.textSecondary : punchedIn ? colors.successText : colors.warningText

  return (
    <View style={styles.person}>
      <Avatar name={item.user.name} uri={item.user.avatar} size={40} />
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>{item.user.name}</Text>
        <Text style={styles.personMeta} numberOfLines={1}>{roleLabelFor(item.user.role)}</Text>
        <Text style={styles.personTimes}>
          In {formatPunchTime(item.record?.punchIn?.at)} · Out {formatPunchTime(item.record?.punchOut?.at)}
        </Text>
        <View style={styles.links}>
          <LocationLine label="In location" latitude={item.record?.punchIn?.latitude} longitude={item.record?.punchIn?.longitude} color={colors.accentText} />
          <LocationLine label="Out location" latitude={item.record?.punchOut?.latitude} longitude={item.record?.punchOut?.longitude} color={colors.accentText} />
        </View>
      </View>
      <Text style={[styles.badge, { color: tone }]}>{status}</Text>
    </View>
  )
})

function TeamDay({ todayDate }: { todayDate: string }) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [date, setDate] = useState(todayDate)
  const query = useQuery({
    queryKey: ['attendance', 'team', date],
    queryFn: () => attendanceApi.team(date),
    enabled: !!date,
  })

  return (
    <FlatList
      data={query.data?.people || []}
      keyExtractor={(item) => item.user.id}
      renderItem={({ item }) => <TeamRow item={item} />}
      initialNumToRender={12}
      windowSize={7}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.stepper}>
          <Pressable onPress={() => setDate((current) => shiftWorkDate(current, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous day">
            <Text style={styles.step}>Previous</Text>
          </Pressable>
          <Text style={styles.stepDate}>{formatWorkDate(date)}</Text>
          <Pressable
            onPress={() => setDate((current) => shiftWorkDate(current, 1))}
            disabled={date >= todayDate}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next day"
          >
            <Text style={[styles.step, date >= todayDate && { opacity: 0.35 }]}>Next</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        query.isLoading ? (
          <LoadingState label="Loading team" />
        ) : query.isError ? (
          <ErrorState message={messageOf(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="No staff on this day" />
        )
      }
    />
  )
}

export function AttendanceScreen() {
  const user = useAuthStore((s) => s.user)
  const canReview = canReviewAttendance(user)
  const [tab, setTab] = useState<'me' | 'team'>(canUseAttendance(user) ? 'me' : 'team')
  const today = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: attendanceApi.today,
    staleTime: 15_000,
  })
  const todayDate = today.data?.workDate || indiaToday()

  return (
    <NestedChrome
      title="Attendance"
      subtitle="Location is saved only when someone punches in or out"
    >
      {canReview ? (
        <SegmentedControl
          options={[
            { key: 'me' as const, label: 'My day' },
            { key: 'team' as const, label: 'Team' },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      {tab === 'team' && canReview ? <TeamDay todayDate={todayDate} /> : <MyDay />}
    </NestedChrome>
  )
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
    list: { paddingBottom: spacing.xxl },
    hero: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    kicker: { ...typography.micro, color: colors.textMuted, textTransform: 'uppercase' },
    status: { ...typography.h2, color: colors.textPrimary },
    hint: { ...typography.body, color: colors.textSecondary },
    heroActions: { marginTop: spacing.sm },
    section: { ...typography.captionStrong, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
    empty: { ...typography.body, color: colors.textSecondary },
    historyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    historyDate: { ...typography.body, color: colors.textPrimary },
    historyTimes: { ...typography.body, color: colors.textSecondary },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    step: { ...typography.captionStrong, color: colors.accentText },
    stepDate: { ...typography.bodyStrong, color: colors.textPrimary },
    person: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    personCopy: { flex: 1, minWidth: 0, gap: 2 },
    personName: { ...typography.bodyStrong, color: colors.textPrimary },
    personMeta: { ...typography.caption, color: colors.textSecondary },
    personTimes: { ...typography.caption, color: colors.textPrimary, marginTop: 2 },
    links: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
    badge: { ...typography.captionStrong },
  })
}
