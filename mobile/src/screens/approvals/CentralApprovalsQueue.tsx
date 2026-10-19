import { useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../../components/Avatar'
import { ErrorState, LoadingState } from '../../components/States'
import { formatInr, TAB_BAR_CLEARANCE, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { approvalsApi, type ApprovalInboxItem } from '../../api/approvals'
import { assetUrl } from '../../constants/env'
import { isApiError } from '../../api/client'
import { timeAgo } from '../../utils/time'
import { useToastStore } from '../../store/toastStore'

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'file', label: 'Drawings' },
  { key: 'expense', label: 'Expenses' },
  { key: 'task', label: 'Tasks' },
  { key: 'purchase_order', label: 'POs' },
  { key: 'boq', label: 'Quotes' },
] as const

type KindKey = (typeof KINDS)[number]['key']

function kindLabel(item: ApprovalInboxItem) {
  if (item.kind === 'expense') return 'Site expense'
  if (item.kind === 'task') return 'Task sign-off'
  if (item.kind === 'purchase_order') return 'Purchase order'
  if (item.kind === 'boq') return 'Quotation'
  if (item.folder === 'drawings') return 'Drawing'
  return 'File'
}

function actionLabel(item: ApprovalInboxItem) {
  if (item.kind === 'expense') return 'Approve'
  if (item.kind === 'task') return 'Approve task'
  if (item.folder === 'drawings') return 'Approve drawing'
  return 'Approve file'
}

export function CentralApprovalsQueue() {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [kind, setKind] = useState<KindKey>('all')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()
  const pushToast = useToastStore((s) => s.push)

  const inbox = useQuery({
    queryKey: ['approvals', 'inbox', scope],
    queryFn: () => approvalsApi.inbox(scope),
    refetchInterval: 20_000,
  })

  const decide = useMutation({
    mutationFn: async ({
      item,
      decision,
      note,
    }: {
      item: ApprovalInboxItem
      decision: 'approved' | 'rejected'
      note?: string
    }) => approvalsApi.decide({ kind: item.kind, id: item.id, decision, note }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['approvals', 'inbox'] })
      pushToast({ title: vars.decision === 'approved' ? 'Approved' : 'Declined' })
    },
    onError: (err) =>
      pushToast({
        title: 'Could not update this sign-off',
        body: isApiError(err) ? err.message : undefined,
        type: 'error',
      }),
  })

  if (inbox.isLoading) return <LoadingState label="Loading sign-offs…" variant="list" />
  if (inbox.isError) {
    return <ErrorState message={isApiError(inbox.error) ? inbox.error.message : undefined} onRetry={() => inbox.refetch()} />
  }

  const items = inbox.data?.items || []
  const counts = inbox.data?.counts
  const visible = items.filter((item) => kind === 'all' || item.kind === kind)

  return (
    <ScrollView
      contentContainerStyle={[listContent, styles.pad, { paddingBottom: TAB_BAR_CLEARANCE + 72 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.kickerRow}>
        <Text style={styles.kicker}>Decisions and sign-offs</Text>
        <Text style={styles.count}>{counts?.total || 0} waiting</Text>
      </View>

      <View style={styles.scopeRow}>
        <Pressable onPress={() => setScope('mine')} style={[styles.scope, scope === 'mine' && styles.scopeOn]}>
          <Text style={[styles.scopeText, scope === 'mine' && styles.scopeTextOn]}>Pending for me</Text>
        </Pressable>
        <Pressable onPress={() => setScope('all')} style={[styles.scope, scope === 'all' && styles.scopeOn]}>
          <Text style={[styles.scopeText, scope === 'all' && styles.scopeTextOn]}>All pending</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {KINDS.map((item) => {
          const on = kind === item.key
          const n =
            item.key === 'all'
              ? items.length
              : items.filter((row) => row.kind === item.key).length
          return (
            <Pressable key={item.key} onPress={() => setKind(item.key)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {item.label} {n}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing waiting</Text>
          <Text style={styles.emptyBody}>When a drawing, expense, or task needs a sign-off, it shows up here.</Text>
        </View>
      ) : (
        visible.map((item) => {
          const preview = item.previewUrl ? assetUrl(item.previewUrl) : null
          const person = item.requestedBy?.name || item.approver?.name
          return (
            <View key={`${item.kind}-${item.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.kind}>{kindLabel(item)}</Text>
                {item.amount != null ? <Text style={styles.amount}>{formatInr(item.amount)}</Text> : null}
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.sub} numberOfLines={2}>
                {[item.projectName, item.subtitle].filter(Boolean).join(' · ')}
                {item.requestedAt ? ` · ${timeAgo(item.requestedAt)}` : ''}
              </Text>
              {item.stepTotal && item.stepTotal > 1 ? (
                <Text style={styles.note}>
                  Step {(item.step || 0) + 1} of {item.stepTotal}
                </Text>
              ) : null}
              {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
              <TextInput
                value={notes[item.id] || ''}
                onChangeText={(value) => setNotes((prev) => ({ ...prev, [item.id]: value }))}
                placeholder="Reason, required if you decline"
                placeholderTextColor={colors.textMuted}
                style={styles.noteInput}
              />
              {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : null}
              <View style={styles.foot}>
                <View style={styles.person}>
                  {person ? <Avatar name={person} uri={item.requestedBy?.avatar || item.approver?.avatar} size={28} /> : null}
                  <Text style={styles.personName} numberOfLines={1}>
                    {person || 'Studio'}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    style={styles.decline}
                    disabled={decide.isPending}
                    onPress={() => {
                      const note = (notes[item.id] || '').trim()
                      if (!note) {
                        pushToast({ title: 'Add a reason before declining', type: 'error' })
                        return
                      }
                      decide.mutate({ item, decision: 'rejected', note })
                    }}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={styles.approve}
                    disabled={decide.isPending}
                    onPress={() => decide.mutate({ item, decision: 'approved' })}
                  >
                    <Text style={styles.approveText}>{actionLabel(item)}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    pad: { gap: 12 },
    kickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kicker: { ...typography.micro, color: c.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
    count: { ...typography.micro, color: '#2d5a46' },
    scopeRow: { flexDirection: 'row', gap: 8 },
    scope: { borderRadius: 4, backgroundColor: '#efeeec', paddingHorizontal: 12, paddingVertical: 8 },
    scopeOn: { backgroundColor: '#1e2022' },
    scopeText: { ...typography.captionStrong, color: '#44474a' },
    scopeTextOn: { color: '#ffffff' },
    chips: { gap: 8 },
    chip: { borderRadius: 4, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
    chipOn: { backgroundColor: '#1e2022', borderColor: '#1e2022' },
    chipText: { ...typography.captionStrong, color: c.textSecondary },
    chipTextOn: { color: '#ffffff' },
    empty: {
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 24,
      gap: 6,
    },
    emptyTitle: { ...typography.bodyStrong, color: c.textPrimary },
    emptyBody: { ...typography.caption, color: c.textSecondary },
    card: {
      backgroundColor: '#fff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 6,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kind: { ...typography.micro, color: '#7a573b', letterSpacing: 0.6, textTransform: 'uppercase' },
    amount: { fontSize: 18, fontWeight: '600', color: c.textPrimary },
    title: { fontSize: 18, fontWeight: '500', color: c.textPrimary, letterSpacing: -0.2 },
    sub: { ...typography.caption, color: c.textSecondary },
    note: { ...typography.caption, color: c.textSecondary, fontStyle: 'italic' },
    noteInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: c.textPrimary,
      ...typography.caption,
    },
    preview: { width: '100%', height: 140, borderRadius: 8, backgroundColor: '#f4f3f1', marginTop: 4 },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
    person: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    personName: { ...typography.caption, color: c.textPrimary, flex: 1 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    decline: { paddingHorizontal: 10, paddingVertical: 8 },
    declineText: { ...typography.micro, color: '#9e3b3b', letterSpacing: 0.4, textTransform: 'uppercase' },
    approve: { backgroundColor: '#1e2022', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10 },
    approveText: { color: '#fff', ...typography.micro, letterSpacing: 0.4, textTransform: 'uppercase' },
  })
}
