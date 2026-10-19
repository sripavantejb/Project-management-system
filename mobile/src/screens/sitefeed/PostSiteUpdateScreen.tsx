import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import * as ImagePicker from 'expo-image-picker'
import { mediaApi } from '../../api/media'
import { siteFeedApi } from '../../api/siteFeed'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { SharedOpsParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<SharedOpsParamList, 'PostSiteUpdate'>

export function PostSiteUpdateScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = route.params || {}
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(params.projectId)
  const [note, setNote] = useState('')
  const [progress, setProgress] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (res.canceled || !res.assets[0]) return
    const asset = res.assets[0]
    const uploaded = await mediaApi.uploadImage({
      uri: asset.uri,
      name: asset.fileName || 'site-photo.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
    })
    setPhotoUrl(uploaded.url)
  }

  const mutation = useMutation({
    mutationFn: () =>
      siteFeedApi.postUpdate({
        projectId: projectId!,
        note: note.trim(),
        progress: progress ? Number(progress) : undefined,
        photos: photoUrl ? [{ url: photoUrl }] : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-updates'] })
      queryClient.invalidateQueries({ queryKey: ['site-updates-home'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not post update'),
  })

  return (
    <FormLayout
      title="Post update"
      subtitle="Share progress from the site"
      subtitleIcon="camera-outline"

      footer={
        <Button
          title="Post update"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
              return
            }
            if (!note.trim()) {
              setError('Write an update first')
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
        label="Update"
        placeholder="What's happening on site?"
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={4}
        style={{ minHeight: 96, textAlignVertical: 'top' }}
      />
      <Input
        label="Progress % (optional)"
        placeholder="0-100"
        keyboardType="numeric"
        value={progress}
        onChangeText={setProgress}
      />
      <Button title={photoUrl ? 'Photo attached' : 'Add photo'} variant="secondary" onPress={pickPhoto} fullWidth />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    error: { ...typography.caption, color: c.danger },
  })
}
