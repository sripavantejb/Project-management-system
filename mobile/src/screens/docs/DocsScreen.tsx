import { useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { NestedChrome } from '../../components/NestedChrome'
import { Input } from '../../components/Input'
import { SurfaceCard } from '../../components/SurfaceCard'
import { EmptyState } from '../../components/States'
import { spacing, typography } from '../../constants/theme'
import { useColors } from '../../theme/useColors'
import { useResponsive } from '../../theme/useResponsive'
import { useAuthStore } from '../../store/authStore'
import { capabilitiesForUser } from '../../utils/roles'
import { HANDBOOK_SECTIONS } from './handbookSections'
import type { MoreStackParamList } from '../../navigation/types'

type Props = NativeStackScreenProps<MoreStackParamList, 'Docs'>

export function DocsScreen(_props: Props) {
  const colors = useColors()
  const { listContent } = useResponsive()
  const styles = useMemo(() => createStyles(colors), [colors])
  const user = useAuthStore((s) => s.user)
  const caps = capabilitiesForUser(user)
  const [q, setQ] = useState('')

  const sections = HANDBOOK_SECTIONS.map((section) => ({
    ...section,
    features: section.features.filter((f) => !f.cap || (caps as unknown as Record<string, boolean>)[f.cap]),
  })).filter((s) => s.features.length)

  const filtered = sections
    .map((s) => ({
      ...s,
      features: s.features.filter(
        (f) => !q.trim() || f.name.toLowerCase().includes(q.toLowerCase()) || f.what.toLowerCase().includes(q.toLowerCase()),
      ),
    }))
    .filter((s) => s.features.length)

  return (
    <NestedChrome title="Handbook" subtitle="How Clyro works" subtitleIcon="book-outline">
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.search}>
            <Input placeholder="Search features…" value={q} onChangeText={setQ} />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No matches" body="Try a different search term." />}
        renderItem={({ item: section }) => (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{section.title}</Text>
            {section.features.map((f) => (
              <SurfaceCard key={f.name} style={styles.card}>
                <Text style={[styles.featureName, { color: colors.textPrimary }]}>{f.name}</Text>
                <Text style={[styles.what, { color: colors.textSecondary }]}>{f.what}</Text>
                {f.use?.map((step, i) => (
                  <Text key={i} style={[styles.step, { color: colors.textMuted }]}>
                    {i + 1}. {step}
                  </Text>
                ))}
                {'caveat' in f && typeof f.caveat === 'string' ? (
                  <Text style={[styles.caveat, { color: colors.warning }]}>{f.caveat}</Text>
                ) : null}
              </SurfaceCard>
            ))}
          </View>
        )}
      />
    </NestedChrome>
  )
}

function createStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    search: { marginBottom: spacing.sm },
    sectionTitle: { ...typography.h2, marginBottom: spacing.sm },
    card: { marginBottom: spacing.sm, gap: spacing.xs },
    featureName: { ...typography.body, fontWeight: '700' },
    what: { ...typography.caption },
    step: { ...typography.caption, marginTop: 2 },
    caveat: { ...typography.micro, marginTop: spacing.sm },
  })
}
