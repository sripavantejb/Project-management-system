import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { CollapsibleSection } from '../../components/CollapsibleSection'
import { FieldRow } from '../../components/FieldRow'
import { Button } from '../../components/Button'
import { radius, spacing, typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { leadsApi } from '../../api/leads'
import { mediaApi } from '../../api/media'
import { adminApi } from '../../api/admin'
import { isApiError } from '../../api/client'
import type { LeadAttachment } from '../../types/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'CreateLead'>

export function CreateLeadScreen({ navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const queryClient = useQueryClient()
  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [notes, setNotes] = useState('')
  const [owner, setOwner] = useState('')
  const [attachments, setAttachments] = useState<LeadAttachment[]>([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [error, setError] = useState('')
  const users = useQuery({ queryKey: ['users'], queryFn: adminApi.users })

  const pickFiles = async () => {
    if (attachments.length >= 25) {
      setError('Maximum 25 files per enquiry')
      return
    }
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ['image/*', 'application/pdf', '*/*'],
    })
    if (result.canceled || !result.assets?.length) return

    setUploadBusy(true)
    setError('')
    try {
      const uploaded: LeadAttachment[] = []
      for (const asset of result.assets) {
        if (attachments.length + uploaded.length >= 25) break
        const saved = await mediaApi.uploadFile({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType,
        })
        uploaded.push({
          name: saved.name || asset.name || 'Attachment',
          url: saved.url,
          mime: saved.mime || asset.mimeType || '',
          size: saved.size || 0,
        })
      }
      setAttachments((prev) => [...prev, ...uploaded])
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not upload file')
    } finally {
      setUploadBusy(false)
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      leadsApi.create({
        clientName: clientName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
        notes: notes.trim() || undefined,
        owner: owner || undefined,
        attachments,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not create lead'),
  })

  return (
    <FormLayout
      title="New enquiry"
      subtitle="Capture a lead and assign follow-up"
      subtitleIcon="briefcase-outline"

      footer={
        <Button
          title="Add enquiry"
          onPress={() => {
            if (!clientName.trim()) {
              setError('Client name is required')
              return
            }
            setError('')
            mutation.mutate()
          }}
          loading={mutation.isPending || uploadBusy}
          fullWidth
        />
      }
    >
      <Input label="Client name" placeholder="e.g. Priya Sharma" value={clientName} onChangeText={setClientName} />
      {/* Capturing a lead should take one field; the rest is follow-up detail. */}
      <CollapsibleSection>
        <FieldRow>
          <Input label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Input
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </FieldRow>
        <Input
          label="Estimated value"
          placeholder="0"
          keyboardType="numeric"
          value={estimatedValue}
          onChangeText={setEstimatedValue}
        />
        {/* Free text stays full width — half a row can't show a sentence. */}
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
      <View>
        <Text style={styles.label}>Assign employee</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(users.data || []).map((u) => {
            const active = owner === u._id
            return (
              <Pressable
                key={u._id}
                onPress={() => setOwner(active ? '' : u._id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{u.name}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <View style={styles.filesBlock}>
        <Text style={styles.label}>Files (floor plan, docs, photos)</Text>
        <Pressable
          style={[styles.uploadBtn, (uploadBusy || attachments.length >= 25) && styles.uploadBtnDisabled]}
          disabled={uploadBusy || attachments.length >= 25}
          onPress={pickFiles}
        >
          <Ionicons name="attach-outline" size={16} color={colors.textPrimary} />
          <Text style={styles.uploadText}>
            {uploadBusy ? 'Uploading…' : 'Add floor plan or document'}
          </Text>
        </Pressable>
        <Text style={styles.hint}>Optional — drawings, PDFs, or site photos before converting.</Text>
        {attachments.map((file, idx) => (
          <View key={`${file.url}-${idx}`} style={styles.fileRow}>
            <Ionicons
              name={String(file.mime || '').startsWith('image/') ? 'image-outline' : 'document-text-outline'}
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.fileName} numberOfLines={1}>
              {file.name || 'Attachment'}
            </Text>
            <Pressable
              onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>
      </CollapsibleSection>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    error: { ...typography.caption, color: c.danger },
    label: { ...typography.captionStrong, color: c.textSecondary, marginBottom: spacing.sm },
    chips: { gap: 8, paddingVertical: 2 },
    chip: {
      backgroundColor: c.surfaceRaised,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    chipActive: { backgroundColor: c.textPrimary },
    chipText: { ...typography.caption, color: c.textSecondary },
    chipTextActive: { color: c.canvas },
    filesBlock: { marginTop: spacing.sm },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
    },
    uploadBtnDisabled: { opacity: 0.5 },
    uploadText: { ...typography.captionStrong, color: c.textPrimary },
    hint: { ...typography.caption, color: c.textMuted, marginTop: 6 },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    fileName: { ...typography.caption, color: c.textPrimary, flex: 1 },
  })
}
