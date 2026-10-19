import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormLayout } from '../../components/FormLayout'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { ProjectPicker } from '../../components/ProjectPicker'
import { VendorPicker } from '../../components/VendorPicker'
import { typography, type AppColors } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { purchaseOrdersApi } from '../../api/procurement'
import { isApiError } from '../../api/client'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { SharedOpsParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<SharedOpsParamList, 'CreatePurchaseOrder'>

export function CreatePurchaseOrderScreen({ route, navigation }: Props) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const params = route.params || {}
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(params.projectId)
  const [vendor, setVendor] = useState<string | undefined>(undefined)
  const [description, setDescription] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.create({
        projectId: projectId!,
        vendor,
        value: Number(value) || 0,
        items: description.trim()
          ? [{ description: description.trim(), qty: 1, rate: Number(value) || 0, amount: Number(value) || 0 }]
          : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      navigation.goBack()
    },
    onError: (err) => setError(isApiError(err) ? err.message : 'Could not create purchase order'),
  })

  return (
    <FormLayout
      title="Purchase order"
      subtitle="Request materials from a vendor"
      subtitleIcon="cart-outline"

      footer={
        <Button
          title="Create purchase order"
          onPress={() => {
            if (!projectId) {
              setError('Select a project')
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
      <VendorPicker value={vendor} onChange={setVendor} />
      <Input label="Description (optional)" value={description} onChangeText={setDescription} />
      <Input label="Order value" placeholder="0" keyboardType="numeric" value={value} onChangeText={setValue} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormLayout>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    error: { ...typography.caption, color: c.danger },
  })
}
