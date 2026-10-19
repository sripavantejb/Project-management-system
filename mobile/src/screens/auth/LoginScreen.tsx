import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useMutation } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { KeyboardAwareView } from '../../components/KeyboardAwareView'
import { isKeyboardOpen, useKeyboardInset } from '../../hooks/useKeyboardInset'
import { spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../store/authStore'
import { isApiError } from '../../api/client'
import type { AuthStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

const CANVAS = '#faf9f7'
const INK = '#191b1d'
const GOLD = '#c5a880'
const MUTED = '#6b6964'

/**
 * Studio sign-in. Workspace, email, and password are the only credentials
 * the API accepts. Forgot password and the access note stay because those
 * screens already exist.
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
      <KeyboardAwareView style={styles.flex}>
        <View
          style={[
            styles.body,
            keyboardOpen && styles.bodyKeyboard,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markLetter}>C</Text>
              <View style={styles.markDot} />
            </View>
            <Text style={styles.wordmark}>Clyro</Text>
            <Text style={styles.tagline}>Studio operations</Text>
          </View>

          <View style={styles.workspace}>
            <Text style={styles.fieldLabel}>Workspace</Text>
            <Input
              placeholder="your-studio"
              autoCapitalize="none"
              autoCorrect={false}
              value={workspaceValue}
              onChangeText={setWorkspace}
              error={errors.workspace}
              returnKeyType="next"
            />
          </View>

          <View style={styles.card}>
            {errors.form ? <Text style={styles.formErrorText}>{errors.form}</Text> : null}
            <Text style={styles.fieldLabel}>Work email</Text>
            <Input
              placeholder="you@studio.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              returnKeyType="next"
            />
            <View style={styles.passwordHead}>
              <Text style={styles.fieldLabel}>Password</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('ForgotPassword')}
                hitSlop={8}
              >
                <Text style={styles.forgot}>Forgot credentials?</Text>
              </Pressable>
            </View>
            <Input
              placeholder="Your password"
              secureTextEntry
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
            <Button title="Enter studio" onPress={onSubmit} loading={mutation.isPending} fullWidth />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Register')}
            style={styles.access}
          >
            <Text style={styles.accessText}>Need access? Ask your studio admin</Text>
          </Pressable>
        </View>
      </KeyboardAwareView>
    </View>
  )
}

function createStyles(c: AppColors, compact: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: CANVAS },
    flex: { flex: 1, minHeight: 0 },
    body: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: compact ? 12 : 28,
      gap: 18,
    },
    bodyKeyboard: { paddingTop: 8 },
    brand: { alignItems: 'center', gap: 8 },
    mark: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#e4e2dd',
    },
    markLetter: {
      fontSize: 28,
      fontWeight: '500',
      color: INK,
      letterSpacing: -0.5,
    },
    markDot: {
      position: 'absolute',
      right: 10,
      bottom: 12,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: GOLD,
    },
    wordmark: {
      ...typography.h1,
      fontSize: compact ? 32 : 36,
      lineHeight: compact ? 36 : 40,
      color: INK,
      fontWeight: '500',
      marginTop: 4,
    },
    tagline: {
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: MUTED,
      fontWeight: '600',
    },
    workspace: { gap: 6 },
    card: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#e4e2dd',
      padding: 16,
      gap: 8,
    },
    fieldLabel: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: MUTED,
      fontWeight: '600',
    },
    passwordHead: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    forgot: {
      fontSize: 12,
      color: GOLD,
      fontWeight: '600',
    },
    formErrorText: { ...typography.caption, color: c.danger },
    access: { alignItems: 'center', paddingVertical: 4 },
    accessText: { fontSize: 13, color: MUTED },
  })
}
