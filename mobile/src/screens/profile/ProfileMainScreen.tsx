import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { NestedChrome } from '../../components/NestedChrome'
import { Avatar } from '../../components/Avatar'
import { Pill } from '../../components/Badge'
import { NavRow, NavSection } from '../../components/NavRow'
import { SurfaceCard } from '../../components/SurfaceCard'
import { spacing, typography, type AppColors } from '../../constants/theme'
import { useColors, useThemeMode } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { useUiStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { capabilitiesForUser, ROLE_LABELS } from '../../utils/roles'
import { confirmSignOut } from '../attendance/signOut'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>

export function ProfileMainScreen({ navigation }: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const theme = useThemeMode()
  const setTheme = useUiStore((s) => s.setTheme)

  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const logout = useAuthStore((s) => s.logout)
  const caps = capabilitiesForUser(user)
  const showPeople = caps.people || caps.managePeople

  const doLogout = () => confirmSignOut(refreshToken, logout)

  return (
    <NestedChrome
      title="You"
      subtitle="Account and company"
      subtitleIcon="person-outline"
    >
      <ScrollView contentContainerStyle={listContent} showsVerticalScrollIndicator={false}>
        <SurfaceCard>
          <View style={styles.identity}>
            <Avatar name={user?.name} uri={user?.avatar} size={72} />
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.pillRow}>
              <Pill label={ROLE_LABELS[user?.role || 'client'] || user?.role || ''} bg={colors.accentSoft} color={colors.accent} />
              {tenant?.name ? <Pill label={tenant.name} /> : null}
            </View>
          </View>
        </SurfaceCard>

        <NavSection title="Account">
          <NavRow
            icon="pencil-outline"
            label="Edit profile"
            hint="Name and photo"
            tone={0}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <NavRow
            icon="lock-closed-outline"
            label="Password"
            hint="Update sign-in"
            tone={1}
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <NavRow
            icon="calendar-outline"
            label="Google Calendar"
            hint="See meetings next to your work"
            tone={4}
            onPress={() => navigation.navigate('GoogleCalendar')}
          />
          <NavRow
            icon="mail-outline"
            label="Email & alerts"
            hint="Company SMTP and who gets notified"
            tone={2}
            last={!showPeople}
            onPress={() => navigation.navigate('MailSettings')}
          />
          {showPeople ? (
            <NavRow
              icon="people-outline"
              label="People"
              hint="Teammates in this company"
              tone={3}
              last
              onPress={() => navigation.navigate('People')}
            />
          ) : null}
        </NavSection>

        <NavSection title="Appearance">
          <NavRow
            icon={theme === 'dark' ? 'moon-outline' : 'sunny-outline'}
            label="Appearance"
            hint={theme === 'dark' ? 'Dark mode on' : 'Light mode on'}
            tone={2}
            last
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
        </NavSection>

        <NavSection title="Session">
          <NavRow
            icon="log-out-outline"
            label="Log out"
            hint="Sign out of this device"
            tone={5}
            last
            onPress={doLogout}
          />
        </NavSection>
      </ScrollView>
    </NestedChrome>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    identity: {
      alignItems: 'center',
      gap: 6,
      paddingVertical: spacing.sm,
    },
    name: { ...typography.h2, color: c.textPrimary, marginTop: 6 },
    email: { ...typography.caption, color: c.textSecondary },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: 6 },
  })
}
