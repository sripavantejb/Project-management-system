import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { AuthLayout } from '../components/AuthLayout'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { spacing, typography, type AppColors } from '../constants/theme'
import { useColors } from '../theme/useColors'
import { authApi } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { isApiError } from '../api/client'

export function OnboardingScreen() {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])

  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => authApi.updateMe({ title: title || undefined, onboardingCompleted: true }),
    onSuccess: (data) => setUser(data.user),
    onError: (err) => setError(isApiError(err) ? err.message : 'Something went wrong'),
  })

  return (
    <AuthLayout
      title={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`}
      subtitle="Let’s set up your profile so Clyro feels like home."
      footer={<Button title="Enter Clyro" onPress={() => mutation.mutate()} loading={mutation.isPending} fullWidth />}
    >
      <View style={styles.progress}>
        <View style={styles.progressFill} />
      </View>
      <Input
        label="Your title (optional)"
        placeholder="e.g. Senior Project Manager"
        value={title}
        onChangeText={setTitle}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </AuthLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    progress: { height: 2, backgroundColor: c.border, overflow: 'hidden' },
    progressFill: { height: '100%', width: '70%', backgroundColor: c.textPrimary },
    error: { ...typography.caption, color: c.danger },
  })
}
