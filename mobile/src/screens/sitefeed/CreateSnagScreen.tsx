import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { siteFeedApi } from '../../api/siteFeed'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateSnag'>

export function CreateSnagScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = route.params || {}
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(params.projectId)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => siteFeedApi.createSnag({ projectId: projectId!, title: title.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snags'] })
      queryClient.invalidateQueries({ queryKey: ['snags-home'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not log snag'),
  })

  return (
    <FormLayout
      title="Log issue"
      subtitle="Capture a snag from the site"
      subtitleIcon="warning-outline"

      footer={
        <Button
          title="Log snag"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
              return
            }
            if (!title.trim()) {
              setError('Describe the issue')
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
      <Input
        label="Issue"
        placeholder="e.g. Chipped tile in master bath"
        value={title}
        onChangeText={setTitle}
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
