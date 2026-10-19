import { useMemo, useState } from 'react'
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NestedChrome } from '../../components/NestedChrome'
import { SectionLabel } from '../../components/SectionLabel'
import { SurfaceCard } from '../../components/SurfaceCard'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { Pill } from '../../components/Badge'
import { EmptyState, LoadingState } from '../../components/States'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGoogleCalendarEvents,
  getGoogleCalendarStatus,
  saveWorkspaceGoogleClientId,
} from '../../lib/googleCalendar'
import { isApiError } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { dayLabel } from '../../utils/time'
import type { GoogleCalendarEvent } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'GoogleCalendar'>

function timeRange(ev: GoogleCalendarEvent): string {
  if (!ev.start) return ''
  const start = new Date(ev.start)
  // All-day events arrive as a bare date; they have no clock time to show.
  const allDay = ev.start.length === 10
  if (allDay) return 'All day'
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const end = ev.end ? new Date(ev.end) : null
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start)
}

export function GoogleCalendarScreen(_: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()

  const me = useAuthStore((s) => s.user)
  const canConfigure = ['admin', 'owner'].includes(me?.role || '') || !!me?.isPlatformAdmin

  const [clientIdDraft, setClientIdDraft] = useState('')

  const status = useQuery({ queryKey: ['gcal-status'], queryFn: getGoogleCalendarStatus })
  const connected = !!status.data?.connected || !!status.data?.localConnected

  const events = useQuery({
    queryKey: ['gcal-events'],
    queryFn: () => fetchGoogleCalendarEvents(30),
    enabled: connected,
    retry: false,
  })

  const connectMutation = useMutation({
    mutationFn: () => connectGoogleCalendar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gcal-status'] })
      queryClient.invalidateQueries({ queryKey: ['gcal-events'] })
    },
    onError: (err) => {
      Alert.alert('Could not connect', err instanceof Error ? err.message : 'Try again.')
    },
  })

  const saveClientId = useMutation({
    mutationFn: async () => {
      const id = clientIdDraft.trim()
      if (!id) throw new Error('Paste your Google OAuth client ID first.')
      await saveWorkspaceGoogleClientId(id)
      return connectGoogleCalendar(id)
    },
    onSuccess: () => {
      setClientIdDraft('')
      queryClient.invalidateQueries({ queryKey: ['gcal-status'] })
      queryClient.invalidateQueries({ queryKey: ['gcal-events'] })
    },
    onError: (err: unknown) => {
      const message = isApiError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Try again.'
      Alert.alert('Could not save', message)
    },
  })

  const disconnect = useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gcal-status'] })
      queryClient.removeQueries({ queryKey: ['gcal-events'] })
    },
  })

  const grouped = useMemo(() => {
    const out: { title: string; items: GoogleCalendarEvent[] }[] = []
    let last = ''
    for (const ev of events.data || []) {
      const label = dayLabel(ev.start) || 'Scheduled'
      if (label !== last) {
        out.push({ title: label, items: [] })
        last = label
      }
      out[out.length - 1].items.push(ev)
    }
    return out
  }, [events.data])

  const chromeProps = {
    title: 'Google Calendar',
    subtitle: 'See your meetings next to your work',
    subtitleIcon: 'calendar-outline' as const,
  }

  if (status.isLoading) {
    return (
      <NestedChrome {...chromeProps}>
        <LoadingState label="Checking connection…" variant="detail" />
      </NestedChrome>
    )
  }

  const configured = !!status.data?.configured

  return (
    <NestedChrome {...chromeProps}>
      <ScrollView
        contentContainerStyle={listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={status.isRefetching || events.isRefetching}
            onRefresh={() => {
              status.refetch()
              if (connected) events.refetch()
            }}
            tintColor={colors.accent}
          />
        }
      >
        <SurfaceCard>
          <View style={styles.statusRow}>
            <View style={[styles.icon, { backgroundColor: connected ? colors.successSoft : colors.surfaceRaised }]}>
              <Ionicons
                name={connected ? 'checkmark-circle-outline' : 'calendar-outline'}
                size={20}
                color={connected ? colors.success : colors.textMuted}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>{connected ? 'Connected' : 'Not connected'}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {status.data?.email || status.data?.localEmail || 'Your meetings stay on Google — Clyro only reads them.'}
              </Text>
            </View>
            {connected ? <Pill label="Live" color={colors.success} bg={colors.successSoft} /> : null}
          </View>

          <View style={styles.actions}>
            {connected ? (
              <Button
                title="Disconnect"
                variant="secondary"
                size="sm"
                onPress={() =>
                  Alert.alert('Disconnect Google Calendar?', 'Events stop appearing in Clyro on this device.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Disconnect', style: 'destructive', onPress: () => disconnect.mutate() },
                  ])
                }
                loading={disconnect.isPending}
              />
            ) : configured ? (
              <Button
                title="Connect Google Calendar"
                onPress={() => connectMutation.mutate()}
                loading={connectMutation.isPending}
              />
            ) : null}
          </View>
        </SurfaceCard>

        {!configured ? (
          <>
            <SectionLabel>Workspace setup</SectionLabel>
            {canConfigure ? (
              <SurfaceCard>
                <Text style={styles.meta}>
                  Paste the OAuth client ID from your Google Cloud project. Everyone in this workspace
                  connects through it.
                </Text>
                <Input
                  label="Google OAuth client ID"
                  value={clientIdDraft}
                  onChangeText={setClientIdDraft}
                  placeholder="1234567890-abc.apps.googleusercontent.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  containerStyle={{ marginTop: spacing.md }}
                />
                <Button
                  title="Save & connect"
                  onPress={() => saveClientId.mutate()}
                  loading={saveClientId.isPending}
                  disabled={!clientIdDraft.trim()}
                />
                <Text
                  style={styles.link}
                  onPress={() => Linking.openURL('https://console.cloud.google.com/apis/credentials')}
                  accessibilityRole="link"
                >
                  Open Google Cloud credentials
                </Text>
              </SurfaceCard>
            ) : (
              <SurfaceCard>
                <Text style={styles.meta}>
                  Google Calendar isn’t enabled for this workspace yet. Ask an admin or owner to add the
                  OAuth client ID.
                </Text>
              </SurfaceCard>
            )}
          </>
        ) : null}

        {connected ? (
          <>
            <SectionLabel count={events.data?.length}>Next 30 days</SectionLabel>
            {events.isLoading ? (
              <LoadingState label="Loading events…" variant="list" />
            ) : events.isError ? (
              <SurfaceCard>
                <Text style={styles.meta}>
                  {events.error instanceof Error
                    ? events.error.message
                    : 'Could not reach Google Calendar.'}
                </Text>
                <Button title="Try again" size="sm" variant="secondary" onPress={() => events.refetch()} />
              </SurfaceCard>
            ) : !grouped.length ? (
              <EmptyState
                icon="calendar-outline"
                title="Nothing scheduled"
                body="Meetings in the next 30 days will show up here."
              />
            ) : (
              grouped.map((day) => (
                <View key={day.title} style={styles.daySection}>
                  <Text style={styles.dayHeader}>{day.title}</Text>
                  <SurfaceCard>
                    {day.items.map((ev, idx) => (
                      <View key={ev.id} style={[styles.eventRow, idx > 0 && styles.rowBorder]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.eventTitle} numberOfLines={2}>
                            {ev.summary || '(No title)'}
                          </Text>
                          <Text style={styles.meta} numberOfLines={1}>
                            {[timeRange(ev), ev.location].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        {ev.htmlLink ? (
                          <Ionicons
                            name="open-outline"
                            size={16}
                            color={colors.textMuted}
                            onPress={() => Linking.openURL(ev.htmlLink!)}
                          />
                        ) : null}
                      </View>
                    ))}
                  </SurfaceCard>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    icon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { ...typography.bodyStrong, color: c.textPrimary },
    meta: { ...typography.caption, color: c.textSecondary, lineHeight: 19 },
    actions: { marginTop: spacing.md, gap: spacing.sm },
    link: { ...typography.captionStrong, color: c.accentHover, marginTop: spacing.sm },
    daySection: { gap: spacing.sm },
    dayHeader: {
      ...typography.micro,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 11 },
    eventTitle: { ...typography.body, color: c.textPrimary },
  })
}
