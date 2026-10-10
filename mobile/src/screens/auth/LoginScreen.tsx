import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useMutation } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthHero } from '../../components/AuthHero'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { KeyboardAwareView } from '../../components/KeyboardAwareView'
import { isKeyboardOpen, useKeyboardInset } from '../../hooks/useKeyboardInset'
import { heroLight, radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { isApiError } from '../../api/client'
import type { AuthStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

const CANVAS = '#f7fbf9'

/**
 * Momento-inspired welcome + sign-in: brand header, project beam hero,
 * credential form, and pill CTAs — all in Cubic emerald.
 */
export function LoginScreen({ navigation }: Props) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const keyboardInset = useKeyboardInset()
  const keyboardOpen = isKeyboardOpen(keyboardInset)
  const compact = windowHeight < 780
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact])

  const lastWorkspace = useAuthStore((s) => s.lastWorkspace) || ''
  const [workspace, setWorkspace] = useState<string | null>(null)
  const workspaceValue = workspace ?? lastWorkspace
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const setAuth = useAuthStore((s) => s.setAuth)

  const mutation = useMutation({
    mutationFn: () =>
      authApi.login({
        email: email.trim().toLowerCase(),
        password,
        workspace: workspaceValue.trim().toLowerCase(),
      }),
    onSuccess: (data) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenant: data.tenant,
      })
    },
    onError: (err) => {
      setErrors({ form: isApiError(err) ? err.message : 'Couldn’t sign in. Check your details and try again.' })
    },
  })

  const onSubmit = () => {
    const next: Record<string, string> = {}
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(workspaceValue.trim())) next.workspace = 'Enter the company workspace from your login'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid work email'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate()
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.ambient} />
      <KeyboardAwareView style={styles.flex}>
        <View
          style={[
            styles.body,
            keyboardOpen && styles.bodyKeyboard,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md },
          ]}
        >
          <View style={styles.top}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Welcome to</Text>
              <Text style={styles.wordmark}>Cubic</Text>
              <Text style={styles.tagline}>
                All your projects, people,{'\n'}and progress — in one place.
              </Text>
            </View>

            {!keyboardOpen ? (
              <View style={styles.hero}>
                <AuthHero size={compact ? 'sm' : 'md'} animated />
              </View>
            ) : null}
          </View>

          <View style={styles.bottom}>
            <View style={styles.form}>
              {errors.form ? (
                <View style={styles.formError}>
                  <Text style={styles.formErrorText}>{errors.form}</Text>
                </View>
              ) : null}
              <Input
                label="Workspace"
                placeholder="cubicassociates"
                autoCapitalize="none"
                autoCorrect={false}
                value={workspaceValue}
                onChangeText={setWorkspace}
                error={errors.workspace}
                returnKeyType="next"
              />
              <Input
                label="Email"
                placeholder="you@company.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                returnKeyType="next"
              />
              <Input
                label="Password"
                placeholder="Your password"
                secureTextEntry
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
            </View>

            <View style={styles.actions}>
              <Button title="Sign in" onPress={onSubmit} loading={mutation.isPending} fullWidth />
              <Button
                title="Join Now"
                variant="secondary"
                onPress={() => navigation.navigate('Register')}
                fullWidth
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('ForgotPassword')}
                style={styles.forgot}
              >
                <Text style={styles.forgotLabel}>Forgot password?</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAwareView>
    </View>
  )
}

function createStyles(c: AppColors, compact: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: CANVAS,
      overflow: 'hidden',
    },
    flex: { flex: 1, minHeight: 0, overflow: 'hidden' },
    ambient: {
      position: 'absolute',
      top: '18%',
      alignSelf: 'center',
      width: 320,
      height: 320,
      borderRadius: 999,
      backgroundColor: 'rgba(62, 207, 142, 0.11)',
    },
    body: {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      paddingHorizontal: spacing.xl,
      paddingTop: compact ? spacing.md : spacing.lg,
      justifyContent: 'space-between',
      gap: compact ? spacing.sm : spacing.md,
    },
    bodyKeyboard: {
      paddingTop: spacing.md,
      justifyContent: 'flex-start',
    },
    top: {
      flexShrink: 1,
      minHeight: 0,
      alignItems: 'center',
      gap: compact ? 4 : 8,
    },
    bottom: {
      flexShrink: 0,
      gap: spacing.md,
    },
    header: {
      alignItems: 'center',
      width: '100%',
    },
    welcome: {
      ...typography.body,
      color: c.textSecondary,
      fontSize: 15,
      lineHeight: 20,
      textAlign: 'center',
    },
    wordmark: {
      ...typography.h1,
      fontSize: compact ? 32 : 38,
      lineHeight: compact ? 38 : 44,
      letterSpacing: -0.8,
      color: heroLight.bg,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 2,
    },
    tagline: {
      ...typography.body,
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      alignSelf: 'center',
    },
    hero: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: compact ? -4 : 0,
    },
    form: {
      gap: 14,
    },
    formError: {
      backgroundColor: c.dangerSoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    formErrorText: { ...typography.caption, color: c.danger },
    actions: {
      gap: 10,
    },
    forgot: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    forgotLabel: {
      ...typography.caption,
      color: c.textSecondary,
      lineHeight: 18,
      textAlign: 'center',
    },
  })
}
