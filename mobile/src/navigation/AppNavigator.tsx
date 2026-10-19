import { useWindowDimensions } from 'react-native'
import { createDrawerNavigator } from '@react-navigation/drawer'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { HomeNavigator } from './HomeNavigator'
import { ProjectNavigator } from './ProjectNavigator'
import { InboxNavigator } from './InboxNavigator'
import { MoreNavigator } from './MoreNavigator'
import { GlassyTabBar } from '../components/GlassyTabBar'
import { AppDrawerContent } from '../components/AppDrawerContent'
import { useAuthStore } from '../store/authStore'
import { capabilitiesForUser } from '../utils/roles'
import { useColors } from '../theme/useColors'
import { useLiveSync } from '../hooks/useLiveSync'
import { useRoleLanding } from '../hooks/useRoleLanding'
import type { RootDrawerParamList, RootTabParamList } from './types'

const Tab = createBottomTabNavigator<RootTabParamList>()
const Drawer = createDrawerNavigator<RootDrawerParamList>()

function MainTabs() {
  const user = useAuthStore((s) => s.user)
  const caps = capabilitiesForUser(user)
  useLiveSync()
  useRoleLanding()

  return (
    <Tab.Navigator
      tabBar={(props) => <GlassyTabBar {...props} />}
      /**
       * Tab switches were a hard cut while every other transition in the app
       * moved — stacks slide from the right, the drawer slides in. 'shift'
       * cross-fades and nudges the outgoing screen, which reads as the same
       * family of motion without the lateral travel a tab bar shouldn't imply.
       */
        screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Tab.Screen name="Home" component={HomeNavigator} />
      {caps.projects ? <Tab.Screen name="Projects" component={ProjectNavigator} /> : null}
      <Tab.Screen name="Inbox" component={InboxNavigator} />
      <Tab.Screen name="More" component={MoreNavigator} />
    </Tab.Navigator>
  )
}

export function AppNavigator() {
  const colors = useColors()
  const { width } = useWindowDimensions()
  /**
   * Proportional so it stays comfortable on a small phone, capped so it never
   * becomes a full-bleed panel on a tablet — the point of a drawer is that the
   * screen behind it stays visible.
   */
  const drawerWidth = Math.min(Math.round(width * 0.82), 360)

  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        // 'front' overlays the tabs rather than pushing them, so opening the
        // drawer never reflows the screen underneath.
        drawerType: 'front',
        drawerPosition: 'left',
        overlayColor: 'rgba(15, 15, 15, 0.45)',
        drawerStyle: {
          width: drawerWidth,
          backgroundColor: colors.canvas,
        },
        swipeEnabled: true,
      }}
    >
      <Drawer.Screen name="MainTabs" component={MainTabs} />
    </Drawer.Navigator>
  )
}
