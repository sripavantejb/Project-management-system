import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { financeApi } from '../../api/finance'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateExpense'>

export function CreateExpenseScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = route.params || {}
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(params.projectId)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.createExpense({
        projectId: projectId!,
        amount: Number(amount),
        category: category.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not submit expense'),
  })

  return (
    <FormLayout
      title="New expense"
      subtitle="Log a cost against a project"
      subtitleIcon="wallet-outline"

      footer={
        <Button
          title="Submit expense"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
              return
            }
            if (!(Number(amount) > 0)) {
              setError('Enter a valid amount')
              return
            }
            setError('')
            mutation.mutate()
          }}
          loading={mutation.isPending}
          fullWidth
        />
      }
    >
      <ProjectPicker value={projectId} onChange={(id) => setProjectId(id)} />
      <Input label="Amount" placeholder="0" keyboardType="numeric" value={amount} onChangeText={setAmount} />
      <Input label="Category (optional)" placeholder="Materials" value={category} onChangeText={setCategory} />
      <Input
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    error: { ...typography.caption, color: c.danger },
  })
}
