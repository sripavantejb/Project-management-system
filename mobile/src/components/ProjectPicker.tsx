import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radius, spacing, typography, type AppColors } from '../constants/theme'
import { useColors } from '../theme/useColors'
import { projectsApi } from '../api/projects'

interface ProjectPickerProps {
  label?: string
  value?: string
  onChange: (projectId: string, projectName: string) => void
  error?: string
}

/** Closed field that opens a searchable project list. */
export function ProjectPicker({ label = 'Project', value, onChange, error }: ProjectPickerProps) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() })

  const selected = data?.find((p) => p._id === value)
  const q = query.trim().toLowerCase()
  const visible = (data || []).filter((p) => {
    if (!q) return true
    return [p.name, p.clientName, p.code, p.location].filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.field, error && styles.fieldError]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label}, ${selected.name}` : `Select ${label}`}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {isLoading ? 'Loading projects…' : selected?.name || 'Select a project'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {selected?.clientName ? <Text style={styles.hint}>{selected.clientName}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { paddingTop: insets.top + 8 }]}>
          <View style={styles.sheetBar}>
            <Text style={styles.sheetTitle}>Select a project</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search projects"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoFocus
            />
          </View>
          <FlatList
            data={visible}
            keyExtractor={(item) => item._id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={<Text style={styles.empty}>{isLoading ? 'Loading…' : 'No projects match.'}</Text>}
            renderItem={({ item }) => {
              const on = item._id === value
              return (
                <Pressable
                  style={[styles.option, on && styles.optionOn]}
                  onPress={() => {
                    onChange(item._id, item.name)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.optionName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.optionMeta} numberOfLines={1}>
                      {[item.clientName, item.location].filter(Boolean).join(' · ') || 'Interior project'}
                    </Text>
                  </View>
                  {on ? <Ionicons name="checkmark" size={18} color={colors.textPrimary} /> : null}
                </Pressable>
              )
            }}
          />
        </View>
      </Modal>
    </View>
  )
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { ...typography.captionStrong, color: c.textSecondary },
    field: {
      minHeight: 48,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    fieldError: { borderColor: c.danger },
    value: { ...typography.body, color: c.textPrimary, flex: 1 },
    placeholder: { color: c.textMuted },
    hint: { ...typography.caption, color: c.textMuted },
    error: { ...typography.caption, color: c.danger },
    sheet: { flex: 1, backgroundColor: c.canvas },
    sheetBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sheetTitle: { ...typography.h3, color: c.textPrimary },
    done: { ...typography.bodyStrong, color: c.textPrimary },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      paddingHorizontal: 12,
      minHeight: 44,
    },
    searchInput: { flex: 1, ...typography.body, color: c.textPrimary, paddingVertical: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    optionOn: { backgroundColor: c.surfaceRaised },
    optionName: { ...typography.bodyStrong, color: c.textPrimary },
    optionMeta: { ...typography.caption, color: c.textSecondary, marginTop: 2 },
    empty: { ...typography.caption, color: c.textSecondary, padding: spacing.lg },
  })
}
