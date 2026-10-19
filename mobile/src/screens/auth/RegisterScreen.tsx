import { StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AuthLayout } from '../../components/AuthLayout'
import { Button } from '../../components/Button'
import { spacing, typography } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import type { AuthStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>

export function RegisterScreen({ navigation }: Props) {
  const colors = useColors()
  return (
    <AuthLayout
      title="Invite only"
      subtitle="Clyro workspaces are created by your company admin or Editco platform team."
      footer={
        <>
          <Button title="Back to sign in" onPress={() => navigation.navigate('Login')} fullWidth />
        </>
      }
    >
      <View style={styles.box}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Ask your workspace admin for an invite email, or contact Editco if you are setting up a new company.
        </Text>
      </View>
    </AuthLayout>
  )
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  body: { ...typography.body, lineHeight: 22 },
})
