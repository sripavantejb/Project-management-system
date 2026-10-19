import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg'
import { ArchitecturalLogo } from '../components/ArchitecturalLogo'
import { useIntroStore } from '../store/introStore'

const INK = '#191b1d'
const MUTED = '#6b6964'
const GOLD = '#c5a880'
const CANVAS = '#faf9f7'
const LINE = '#e4e2dd'

const SLIDES = [
  {
    quote: 'Spatial precision from concept drawing to turnkey site handover.',
    author: 'Atelier Clyro Principle',
    body: 'The quiet operating system engineered for high-end architecture practices and interior ateliers.',
    action: 'Continue',
  },
  {
    quote: 'From Tuscan quarry slabs to millwork detail, zero discrepancy.',
    author: 'The artisan accuracy standard',
    body: 'Direct dock-to-site tracking and synchronized contractor tenders engineered to eliminate project budget bleed.',
    action: 'Continue',
  },
  {
    quote: 'Effortless coordination across lead architects, joiners, and clients.',
    author: 'Harmonized practice operating system',
    body: 'Instant RFI resolution, verified site photo snags, and automated tax billing unified in one serene studio interface.',
    action: 'Enter Workspace',
  },
] as const

export function IntroTourScreen({ onDone }: { onDone?: () => void }) {
  const insets = useSafeAreaInsets()
  const setHasSeenIntro = useIntroStore((s) => s.setHasSeenIntro)
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  const finish = () => {
    setHasSeenIntro(true)
    onDone?.()
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style="dark" />
      <View style={styles.topRow}>
        <View style={styles.edition}>
          <View style={styles.dot} />
          <Text style={styles.editionText}>Edition 2025</Text>
        </View>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        {index === 0 ? <ArchitecturalLogo size={248} /> : null}
        {index === 1 ? <QuarryCard /> : null}
        {index === 2 ? <HandoverCard /> : null}
      </View>

      <View style={styles.copy}>
        <Text style={styles.author}>{slide.author}</Text>
        <Text style={styles.quote}>“{slide.quote}”</Text>
        <View style={styles.hairline} />
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dashes} accessibilityLabel={`Step ${index + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dash, i === index ? styles.dashOn : null]} />
          ))}
        </View>
        <Pressable
          onPress={() => (isLast ? finish() : setIndex((n) => n + 1))}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel={slide.action}
        >
          <Text style={styles.ctaText}>{slide.action}  →</Text>
        </Pressable>
        <Pressable onPress={finish} hitSlop={8} accessibilityRole="button">
          <Text style={styles.signIn}>
            Already have an account? <Text style={styles.signInStrong}>Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function QuarryCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTags}>
        <Text style={styles.tag}>Spec 02 • Quarry to site</Text>
        <Text style={styles.tagGold}>QC verified</Text>
      </View>
      <Svg width="100%" height={128} viewBox="0 0 192 128">
        <Line x1="16" y1="64" x2="176" y2="64" stroke="#e2ded9" strokeDasharray="3 3" strokeWidth="0.75" />
        <Line x1="96" y1="12" x2="96" y2="116" stroke="#e2ded9" strokeDasharray="3 3" strokeWidth="0.75" />
        <Path d="M 32 24 L 32 36 M 26 30 L 38 30" stroke="#75777a" strokeWidth="0.75" />
        <Path d="M 160 24 L 160 36 M 154 30 L 166 30" stroke="#75777a" strokeWidth="0.75" />
        <Path d="M 32 98 L 32 110 M 26 104 L 38 104" stroke="#75777a" strokeWidth="0.75" />
        <Path d="M 160 98 L 160 110 M 154 104 L 166 104" stroke="#75777a" strokeWidth="0.75" />
        <Polygon points="48,34 116,34 104,78 36,78" fill="#fdceaa" fillOpacity="0.22" stroke="#c5a880" strokeWidth="1.25" />
        <Polygon points="76,50 148,50 136,94 64,94" fill="#191b1d" fillOpacity="0.06" stroke="#191b1d" strokeWidth="1.25" />
        <Line x1="76" y1="50" x2="104" y2="78" stroke="#c5a880" strokeWidth="1.5" />
        <Line x1="64" y1="94" x2="136" y2="94" stroke="#191b1d" strokeWidth="1.5" />
        <SvgText x="110" y="28" fill="#75777a" fontSize="7">
          TOLERANCE ±0.25mm
        </SvgText>
        <SvgText x="44" y="90" fill="#c5a880" fontSize="7">
          SEC // A-02
        </SvgText>
      </Svg>
      <View style={styles.cardFoot}>
        <View>
          <Text style={styles.cardBrand}>CLYRO</Text>
          <Text style={styles.cardMeta}>Material & specification ledger</Text>
        </View>
        <Text style={styles.cardCoord}>43°46'N 10°08'E</Text>
      </View>
    </View>
  )
}

function HandoverCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTags}>
        <Text style={styles.tag}>Stage 06 • Handover pass</Text>
        <Text style={styles.cardMeta}>Tolerance ±0.5mm</Text>
      </View>
      <Svg width="100%" height={150} viewBox="0 0 260 176">
        <Path d="M10 88H250 M130 10V166" stroke="#c5c6ca" strokeDasharray="2 4" strokeWidth="0.75" />
        <Circle cx="130" cy="88" r="74" stroke="#c5c6ca" strokeDasharray="3 3" strokeWidth="0.75" fill="none" />
        <Path d="M72 136C72 90 108 54 154 54" stroke="#c5a880" strokeWidth="1.25" fill="none" />
        <Path d="M130 34L196 72V124L130 162L64 124V72L130 34Z" stroke="#191b1d" strokeWidth="1.75" fill="none" />
        <Path d="M130 34V162 M64 72L130 110L196 72" stroke="#191b1d" strokeWidth="1.25" fill="none" />
        <Path d="M130 64L166 84V122L130 142L94 122V84L130 64Z" fill="#faf9f7" stroke="#c5a880" strokeWidth="1.5" />
        <Path d="M130 64V142 M94 84L130 104L166 84" stroke="#c5a880" strokeWidth="1" fill="none" />
        <SvgText x="130" y="18" fill="#44474a" fontSize="7" textAnchor="middle">
          SPATIAL AXIS 12,400
        </SvgText>
      </Svg>
      <View style={styles.cardFoot}>
        <View>
          <Text style={styles.cardBrand}>CLYRO</Text>
          <Text style={styles.cardMeta}>Turnkey site execution</Text>
        </View>
        <Text style={styles.cardMeta}>Rev.final</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CANVAS,
    paddingHorizontal: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  edition: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  editionText: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: MUTED,
    fontWeight: '600',
  },
  skip: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: MUTED,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  author: {
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: GOLD,
    fontWeight: '600',
    textAlign: 'center',
  },
  quote: {
    marginTop: 10,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: INK,
    fontWeight: '500',
    textAlign: 'center',
  },
  hairline: {
    width: 32,
    height: 1,
    backgroundColor: LINE,
    marginVertical: 14,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: { gap: 14 },
  dashes: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dash: { width: 28, height: 2, borderRadius: 2, backgroundColor: LINE },
  dashOn: { width: 36, backgroundColor: INK },
  cta: {
    height: 48,
    backgroundColor: INK,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#ffffff', fontSize: 16, fontWeight: '500', letterSpacing: 0.3 },
  signIn: { textAlign: 'center', color: MUTED, fontSize: 13 },
  signInStrong: {
    color: INK,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    minHeight: 230,
    justifyContent: 'space-between',
  },
  cardTags: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tag: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: MUTED,
    backgroundColor: '#efeeec',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tagGold: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: GOLD,
    fontWeight: '700',
  },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  cardBrand: { fontSize: 14, letterSpacing: 2, color: INK, fontWeight: '700' },
  cardMeta: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED },
  cardCoord: { fontSize: 10, letterSpacing: 0.6, color: GOLD, fontWeight: '600' },
})
