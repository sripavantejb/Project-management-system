import { Image, StyleSheet, View } from 'react-native'

const logo = require('../../assets/icon.png')

/** Official Clyro mark (app icon). */
export function ClyroMark({ size = 168 }: { size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: Math.max(12, size * 0.18) }]}>
      <Image source={logo} style={styles.image} resizeMode="cover" accessibilityLabel="Clyro" />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
