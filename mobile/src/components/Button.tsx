import { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native'
import { radius, spacing, typography, type AppColors } from '../constants/theme'
import { useColors } from '../theme/useColors'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

/**
 * Apple-style pill CTAs — same language as Sign in / Join Now on login.
 * Primary = forest fill + white label. Secondary = white fill + hairline.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  icon,
  ...pressableProps
}: ButtonProps) {
  const colors = useColors()
  const themed = useMemo(() => createThemed(colors), [colors])
  const isDisabled = disabled || loading
  const spinnerColor =
    variant === 'secondary' || variant === 'ghost' ? colors.cta : colors.ctaText

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        themed.variant[variant],
        fullWidth && { alignSelf: 'stretch' },
        pressed && !isDisabled && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        isDisabled && { opacity: 0.45 },
      ]}
      disabled={isDisabled}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[styles.label, size === 'sm' && styles.labelSm, themed.label[variant]]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

function createThemed(c: AppColors) {
  return {
    variant: {
      primary: { backgroundColor: c.cta },
      secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderLight },
      ghost: { backgroundColor: 'transparent' },
      danger: { backgroundColor: c.danger },
    } as Record<Variant, object>,
    label: {
      primary: { color: c.ctaText },
      secondary: { color: c.textPrimary },
      ghost: { color: c.cta },
      danger: { color: c.textOnDanger },
    } as Record<Variant, object>,
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: { height: 44, paddingHorizontal: spacing.lg },
  sm: { height: 40, paddingHorizontal: spacing.md },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    ...typography.bodyStrong,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  labelSm: { fontSize: 14, lineHeight: 18 },
})
