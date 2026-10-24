import { useMemo, useState } from 'react'
import { ActionSheetIOS, Alert, FlatList, Platform, RefreshControl, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Screen } from '../../components/Screen'
import { SearchField } from '../../components/SearchField'
import { KeyboardAwareView } from '../../components/KeyboardAwareView'
import { InboxChatHeader, type ChatContact } from '../../components/inbox/InboxChatHeader'
import { type InboxTab } from '../../components/inbox/InboxTabs'
import { ThreadRow } from '../../components/inbox/ThreadRow'
import { NotificationTriageRow } from '../../components/NotificationTriageRow'
import { EmptyState, LoadingState } from '../../components/States'
import { PageEnter } from '../../motion/PageEnter'
import { FadeIn } from '../../motion/FadeIn'
import { TAB_BAR_CLEARANCE } from '../../components/GlassyTabBar'
import { notificationsApi } from '../../api/notifications'
import { mailApi } from '../../api/mail'
import { useChatColors } from '../../theme/useChatColors'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { spacing } from '../../constants/theme'
import type { InboxStackParamList } from '../../navigation/types'
import type { AppNotification } from '../../types/ops'
import { pushConversation } from '../../navigation/openProject'
import { useSocketConnected } from '../../hooks/useSocketConnected'

type Props = NativeStackScreenProps<InboxStackParamList, 'InboxHub'>

const HERO: Record<InboxTab, string> = {
  primary: 'Notifications',
  mail: 'Messages',
  later: 'Saved for later',
  cleared: 'Recently cleared',
}

const EMPTY: Record<InboxTab, { title: string; body: string; icon: 'mail-outline' | 'chatbubbles-outline' | 'time-outline' | 'checkmark-done-outline' }> = {
  primary: {
    title: 'All caught up',
    body: 'Task assigns, mentions, and updates will appear here.',
    icon: 'mail-outline',
  },
  mail: {
    title: 'Start a conversation',
    body: 'Message anyone on your team — like internal company mail.',
    icon: 'chatbubbles-outline',
  },
  later: {
    title: 'Nothing saved for later',
    body: 'Tap Later on a notification to park it here.',
    icon: 'time-outline',
  },
  cleared: {
    title: 'Cleared is empty',
    body: 'Notifications you clear will show up here.',
    icon: 'checkmark-done-outline',
  },
}

function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000
}

export function InboxHubScreen({ navigation, route }: Props) {
  const colors = useColors()
  const chat = useChatColors()
  const { pagePadding } = useResponsive()
  const [tab, setTab] = useState<InboxTab>(route.params?.tab || 'mail')
  const [search, setSearch] = useState('')
  const qc = useQueryClient()
  const live = useSocketConnected()

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    enabled: tab !== 'mail',
    staleTime: 20_000,
    // Socket pushes notification:new; poll only as a safety net.
    refetchInterval: tab !== 'mail' && !live ? 12_000 : false,
  })

  const threadsQuery = useQuery({
    queryKey: ['mail-threads'],
    queryFn: mailApi.threads,
    enabled: tab === 'mail',
    staleTime: 15_000,
    refetchInterval: tab === 'mail' && !live ? 4_000 : false,
  })

  const readMut = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const readAllMut = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const laterMut = useMutation({
    mutationFn: notificationsApi.markLater,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const clearMut = useMutation({
    mutationFn: notificationsApi.clear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const notifications = notificationsQuery.data || []
  const filteredNotifications = useMemo(() => {
    const list = notifications.filter((n: AppNotification) => {
      if (tab === 'primary') return !n.cleared && !n.later
      if (tab === 'later') return !!n.later && !n.cleared
      if (tab === 'cleared') return !!n.cleared
      return false
    })
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (n) => n.title.toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q),
    )
  }, [notifications, tab, search])

  const unreadCount = notifications.filter((n) => !n.read && !n.cleared && !n.later).length

  const threads = useMemo(() => {
    const list = threadsQuery.data || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (t) =>
        t.user.name.toLowerCase().includes(q) ||
        t.lastMessage.body.toLowerCase().includes(q),
    )
  }, [threadsQuery.data, search])

  const contacts: ChatContact[] = useMemo(
    () =>
      (threadsQuery.data || []).slice(0, 12).map((t) => ({
        id: t.user._id,
        name: t.user.name,
        avatar: t.user.avatar,
        unread: t.unread,
      })),
    [threadsQuery.data],
  )

  const empty = EMPTY[tab]
  const booting = tab === 'mail' ? threadsQuery.isPending : notificationsQuery.isPending
  const isRefreshing =
    tab === 'mail' ? threadsQuery.isRefetching : notificationsQuery.isRefetching

  const onRefresh = () => {
    if (tab === 'mail') threadsQuery.refetch()
    else notificationsQuery.refetch()
  }

  const openConversation = (userId: string, userName: string) => {
    pushConversation(navigation, userId, userName)
  }

  const openMenu = () => {
    const options = [
      ...(tab === 'primary' && unreadCount > 0
        ? [{ label: 'Mark all read', onPress: () => readAllMut.mutate() }]
        : []),
      ...(tab === 'mail'
        ? [{ label: 'New message', onPress: () => navigation.navigate('NewMessage') }]
        : []),
      { label: 'Cancel', onPress: () => undefined },
    ]

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: options.map((o) => o.label),
          cancelButtonIndex: options.length - 1,
          title: 'Chat',
        },
        (index) => options[index]?.onPress(),
      )
      return
    }

    Alert.alert(
      'Chat',
      undefined,
      options.map((o, i) => ({
        text: o.label,
        style: i === options.length - 1 ? 'cancel' : 'default',
        onPress: o.onPress,
      })),
    )
  }

  const listStyle = { backgroundColor: chat.listBg, flex: 1 as const }

  const listHeader = (
    <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={tab === 'mail' ? 'Search conversations…' : 'Search notifications…'}
      />
    </View>
  )

  // No 'top' edge: the chat header is a coloured band and should bleed behind
  // the status bar, so InboxChatHeader takes the inset itself rather than
  // letting the shell pad a pale strip above it.
  return (
    <Screen padded={false} edges={['left', 'right']} background={chat.listBg}>
      <FadeIn delay={0} distance={4} style={{ width: '100%' }}>
      <InboxChatHeader
        title={HERO[tab]}
        tab={tab}
        onTabChange={setTab}
        contacts={contacts}
        onAddContact={() => navigation.navigate('NewMessage')}
        onContactPress={(c) => openConversation(c.id, c.name)}
        onMenuPress={openMenu}
      />
      </FadeIn>

      <PageEnter axis="x" distance={8}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <KeyboardAwareView style={{ flex: 1, minHeight: 0 }}>
      {tab === 'mail' ? (
        <FlatList
          style={listStyle}
          data={threads}
          keyExtractor={(t) => t.user._id}
          automaticallyAdjustKeyboardInsets
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <ThreadRow
              name={item.user.name}
              avatar={item.user.avatar}
              preview={item.lastMessage.body}
              time={item.lastMessage.createdAt}
              unread={item.unread}
              online={item.unread > 0 || isRecent(item.lastMessage.createdAt)}
              onPress={() => openConversation(item.user._id, item.user.name)}
            />
          )}
          ListEmptyComponent={
            booting ? (
              <LoadingState label="Loading conversations…" variant="rows" />
            ) : (
              <View style={{ paddingHorizontal: pagePadding }}>
                <EmptyState
                  icon={empty.icon}
                  title={empty.title}
                  body={empty.body}
                  action="New message"
                  onAction={() => navigation.navigate('NewMessage')}
                />
              </View>
            )
          }
          contentContainerStyle={{
            paddingBottom: TAB_BAR_CLEARANCE,
            flexGrow: threads.length === 0 ? 1 : undefined,
          }}
        />
      ) : (
        <FlatList
          style={listStyle}
          data={filteredNotifications}
          keyExtractor={(item) => item._id}
          automaticallyAdjustKeyboardInsets
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <NotificationTriageRow
              item={item}
              onPress={() => !item.read && readMut.mutate(item._id)}
              onLater={tab === 'primary' ? () => laterMut.mutate(item._id) : undefined}
              onClear={tab !== 'cleared' ? () => clearMut.mutate(item._id) : undefined}
              onRestore={tab === 'cleared' || tab === 'later' ? () => readMut.mutate(item._id) : undefined}
            />
          )}
          ListEmptyComponent={
            booting ? (
              <LoadingState label="Loading notifications…" variant="rows" />
            ) : (
              <View style={{ paddingHorizontal: pagePadding }}>
                <EmptyState icon={empty.icon} title={empty.title} body={empty.body} />
              </View>
            )
          }
          contentContainerStyle={{
            paddingBottom: TAB_BAR_CLEARANCE,
            flexGrow: filteredNotifications.length === 0 ? 1 : undefined,
          }}
        />
      )}
        </KeyboardAwareView>
      </View>
      </PageEnter>
    </Screen>
  )
}
