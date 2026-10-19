import { useCallback } from 'react'
import { useNavigation, type NavigationProp, type ParamListBase, type RouteProp } from '@react-navigation/native'
import type { MobileHomeTarget, MoreStackParamList, ProjectStackParamList, RootDrawerParamList, RootTabParamList } from './types'

type ProjectParams = { projectId: string; projectName?: string; returnTo?: 'home' }

/** First screen in each tab stack — kept underneath pushed routes so Back always works. */
export const TAB_ROOT_SCREEN: Record<keyof RootTabParamList, string> = {
  Home: 'HomeMain',
  Projects: 'ProjectsList',
  Inbox: 'InboxHub',
  More: 'MoreMain',
}

/** Nested stack roots (ProfileHub, PlatformAdmin, etc.). */
const NESTED_STACK_ROOTS = ['ProfileMain', 'PlatformOverview'] as const

/**
 * Minimal surface these helpers need to jump between root tabs.
 */
export type TabNavigation = {
  navigate(screen: keyof RootTabParamList, params?: object): void
}

type MainTabsNavigation = {
  navigate(screen: 'MainTabs', params?: object): void
}

function stackWithRoot(root: string, screen: string, params?: object) {
  return {
    state: {
      routes: [{ name: root }, { name: screen, params }],
      index: 1,
    },
  }
}

/** Navigate to a tab, preserving the tab root under nested screens. Works from drawer or tabs. */
export function openTabScreen(
  navigation: TabNavigation | MainTabsNavigation | NavigationProp<RootDrawerParamList>,
  tab: keyof RootTabParamList,
  screen?: string,
  params?: object,
) {
  const root = TAB_ROOT_SCREEN[tab]

  if (!screen || screen === root) {
    ;(navigation as MainTabsNavigation).navigate('MainTabs', {
      screen: tab,
      ...(screen ? { params: { screen, params } } : null),
    })
    return
  }

  ;(navigation as MainTabsNavigation).navigate('MainTabs', {
    screen: tab,
    params: stackWithRoot(root, screen, params),
  })
}

/** Build params for role landing (same stack preservation as openTabScreen). */
export function landingTabParams(target: MobileHomeTarget) {
  const root = TAB_ROOT_SCREEN[target.tab]
  if (!root || target.screen === root) {
    return { screen: target.screen, params: target.params }
  }
  return stackWithRoot(root, target.screen, target.params)
}

const TAB_NAMES = new Set(['Home', 'Projects', 'Inbox', 'More'])
const STACK_ROOTS = new Set([...Object.values(TAB_ROOT_SCREEN), ...NESTED_STACK_ROOTS])

function findTabNavigator(navigation: NavigationProp<ParamListBase>) {
  let current: NavigationProp<ParamListBase> | undefined = navigation
  for (let i = 0; i < 6 && current; i += 1) {
    const names = current.getState?.()?.routeNames as string[] | undefined
    if (names?.includes('Home') && names?.includes('More')) return current
    current = current.getParent?.() as NavigationProp<ParamListBase> | undefined
  }
  return undefined
}

/**
 * Universal back: one step to the screen you opened this from.
 * A remembered tab (opened from Home, Projects, or Chat) returns there
 * instead of dumping you on the More menu that sits under those screens.
 */
export function smartGoBack(
  navigation: NavigationProp<ParamListBase>,
  route?: RouteProp<ParamListBase, string>,
) {
  const raw = (route?.params as { returnTo?: string } | undefined)?.returnTo
  const returnTab = raw === 'home' ? 'Home' : raw && TAB_NAMES.has(raw) ? raw : undefined

  if (returnTab && returnTab !== 'More') {
    const state = navigation.getState()
    const index = state?.index ?? 0
    const previous = state?.routes?.[index - 1]
    if (navigation.canGoBack() && previous && !STACK_ROOTS.has(previous.name)) {
      navigation.goBack()
      return
    }
    const tab = findTabNavigator(navigation)
    if (tab) {
      tab.navigate(returnTab as never)
      return
    }
  }

  if (navigation.canGoBack()) {
    navigation.goBack()
    return
  }

  const parent = navigation.getParent()
  if (parent?.canGoBack()) {
    parent.goBack()
    return
  }

  const findRoot = (routeNames?: string[]) => {
    if (!routeNames) return undefined
    for (const root of Object.values(TAB_ROOT_SCREEN)) {
      if (routeNames.includes(root)) return root
    }
    for (const root of NESTED_STACK_ROOTS) {
      if (routeNames.includes(root)) return root
    }
    return undefined
  }

  const ownRoot = findRoot(navigation.getState()?.routeNames as string[] | undefined)
  if (ownRoot) {
    navigation.navigate(ownRoot as never)
    return
  }

  const parentRoot = findRoot(parent?.getState()?.routeNames as string[] | undefined)
  if (parentRoot && parent) {
    parent.navigate(parentRoot as never)
    return
  }

  const tabNav = parent?.getParent?.() || parent
  tabNav?.navigate('Home' as never)
}

/** @deprecated Use smartGoBack */
export function goBackOrMoreMain(navigation: NavigationProp<ParamListBase>) {
  smartGoBack(navigation)
}

/** @deprecated Use smartGoBack */
export function goBackOrHome(
  navigation: NavigationProp<ParamListBase>,
  route?: RouteProp<ParamListBase, string>,
) {
  smartGoBack(navigation, route)
}

/** Back within stack, or to parent navigator when nested (e.g. platform admin). */
export function useStackBack() {
  const navigation = useNavigation()
  return useCallback(() => {
    smartGoBack(navigation as NavigationProp<ParamListBase>)
  }, [navigation])
}

/**
 * Open a screen inside the Projects tab with a clean stack.
 * When `fromHome` is set, Back returns to Home (not Projects list / overview).
 */
export function openProjectScreen(
  navigation: TabNavigation,
  screen: keyof ProjectStackParamList,
  params?: ProjectParams & Record<string, unknown>,
  opts?: { fromHome?: boolean },
) {
  if (screen === 'ProjectsList' || !params?.projectId) {
    navigation.navigate('Projects', { screen: 'ProjectsList' })
    return
  }

  const projectParams: ProjectParams = {
    projectId: params.projectId,
    projectName: params.projectName,
    ...(opts?.fromHome ? { returnTo: 'home' as const } : null),
  }

  const leafParams = { ...params, ...projectParams }

  if (opts?.fromHome) {
    navigation.navigate('Projects', {
      state: {
        routes: [
          { name: 'ProjectsList' as const },
          { name: screen, params: leafParams },
        ],
        index: 1,
      },
    })
    return
  }

  const routes =
    screen === 'ProjectOverview'
      ? [
          { name: 'ProjectsList' as const },
          { name: 'ProjectOverview' as const, params: projectParams },
        ]
      : [
          { name: 'ProjectsList' as const },
          { name: 'ProjectOverview' as const, params: projectParams },
          { name: screen, params: leafParams },
        ]

  navigation.navigate('Projects', {
    state: {
      routes,
      index: routes.length - 1,
    },
  })
}

/** Open a More-tab screen; always keeps MoreMain under the leaf. */
export function openMoreScreen(
  navigation: TabNavigation,
  screen: keyof MoreStackParamList,
  params?: Record<string, unknown>,
  opts?: { fromHome?: boolean },
) {
  const nextParams = opts?.fromHome ? { ...params, returnTo: 'home' as const } : params

  navigation.navigate('More', {
    state: {
      routes: [
        { name: 'MoreMain' as const },
        { name: screen, params: nextParams },
      ],
      index: 1,
    },
  } as never)
}

type ConversationParams = { userId: string; userName: string }

/** Push a conversation (always fresh params — avoid stale peer from `navigate`). */
export function pushConversation(
  navigation: { push: (screen: 'Conversation', params: ConversationParams) => void },
  userId: string,
  userName: string,
) {
  navigation.push('Conversation', { userId, userName })
}

/** Open a chat from another tab with InboxHub preserved under the thread. */
export function openConversationFromTabs(
  navigation: TabNavigation,
  userId: string,
  userName: string,
) {
  openTabScreen(navigation, 'Inbox', 'Conversation', { userId, userName })
}
