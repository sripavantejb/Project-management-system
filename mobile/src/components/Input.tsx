import { forwardRef, useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { radius, typography, type AppColors } from '../constants/theme'
import { useColors } from '../theme/useColors'
import { scrollInputIntoView } from '../hooks/useKeyboardInset'
import { glyphs } from '../icons'
import { Icon } from './Icon'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  hint?: string
  containerStyle?: StyleProp<ViewStyle>
}

const FIELD_H = 50
const INSET = 16

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, hint, style, containerStyle, onFocus, onBlur, secureTextEntry, ...props }, ref) => {
    const colors = useColors()
    const styles = useMemo(() => createStyles(colors), [colors])
    const [focused, setFocused] = useState(false)
    const [passwordVisible, setPasswordVisible] = useState(false)
    const isPassword = secureTextEntry === true

    return (
      <View style={[styles.wrap, containerStyle]}>
        {label ? (
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        <View
          style={[
            styles.field,
            focused && styles.fieldFocused,
            !!error && styles.fieldError,
          ]}
        >
          <TextInput
            ref={ref}
            style={[styles.input, style]}
            placeholderTextColor={colors.textMuted}
            allowFontScaling={false}
            textAlignVertical="center"
            underlineColorAndroid="transparent"
            secureTextEntry={isPassword ? !passwordVisible : secureTextEntry}
            onFocus={(e) => {
              setFocused(true)
              scrollInputIntoView(e.nativeEvent.target)
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setFocused(false)
              onBlur?.(e)
            }}
            {...props}
          />
          {isPassword ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
              hitSlop={4}
              onPress={() => setPasswordVisible((v) => !v)}
              style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.7 }]}
            >
              <Icon
                name={passwordVisible ? glyphs.eyeOff : glyphs.eye}
                size="button"
                color={colors.textSecondary}
                decorative
              />
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text style={styles.error} numberOfLines={3}>
            {error}
          </Text>
        ) : hint ? (
          <Text style={styles.hint} numberOfLines={3}>
            {hint}
          </Text>
        ) : null}
      </View>
    )
  },
)
Input.displayName = 'Input'

function createStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: { gap: 6, alignSelf: 'stretch' },
    label: {
      ...typography.micro,
      color: c.textSecondary,
      paddingHorizontal: 2,
      lineHeight: 14,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      height: FIELD_H,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      paddingLeft: INSET,
      paddingRight: 6,
      width: '100%',
      overflow: 'hidden',
    },
    fieldFocused: { borderColor: c.textPrimary, backgroundColor: c.surface },
    fieldError: { borderColor: c.danger, backgroundColor: c.dangerSoft },
    input: {
      flex: 1,
      minWidth: 0,
      height: FIELD_H,
      margin: 0,
      padding: 0,
      ...typography.input,
      lineHeight: 20,
      color: c.textPrimary,
      backgroundColor: 'transparent',
      textAlignVertical: 'center',
      includeFontPadding: false,
      ...(Platform.OS === 'web'
        ? ({
            outlineStyle: 'none',
            boxSizing: 'border-box',
          } as object)
        : null),
    },
    eyeBtn: {
      width: 40,
      height: FIELD_H,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    error: { ...typography.caption, color: c.danger, paddingHorizontal: INSET, lineHeight: 16 },
    hint: { ...typography.caption, color: c.textMuted, paddingHorizontal: INSET, lineHeight: 16 },
  })
}
