import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedLine = Animated.createAnimatedComponent(Line)

const DRAW = Easing.bezier(0.19, 1, 0.22, 1)

/**
 * CAD monogram: structural C, milestone bars, and a gold site-sync scan.
 * The wordmark sits inside the mark so splash and the first intro page match.
 */
export function ArchitecturalLogo({ size = 256 }: { size?: number }) {
  const draw = useRef(new Animated.Value(750)).current
  const scan = useRef(new Animated.Value(0)).current
  const barA = useRef(new Animated.Value(0.55)).current
  const barB = useRef(new Animated.Value(0.7)).current
  const barC = useRef(new Animated.Value(0.55)).current

  useEffect(() => {
    Animated.timing(draw, {
      toValue: 0,
      duration: 2800,
      easing: DRAW,
      useNativeDriver: false,
    }).start()

    const pulse = (value: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 0.95, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(value, { toValue: 0.55, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      )

    const scanLoop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: 4500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    )

    const a = pulse(barA, 1750, 0)
    const b = pulse(barB, 2000, 200)
    const c = pulse(barC, 1500, 500)
    scanLoop.start()
    a.start()
    b.start()
    c.start()
    return () => {
      scanLoop.stop()
      a.stop()
      b.stop()
      c.stop()
    }
  }, [barA, barB, barC, draw, scan])

  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [10, 230] })
  const scanOpacity = scan.interpolate({
    inputRange: [0, 0.15, 0.35, 0.7, 1],
    outputRange: [0, 0.85, 0.85, 0.85, 0],
  })

  return (
    <Svg width={size} height={size} viewBox="0 0 320 320">
      <Defs>
        <LinearGradient id="clyroScan" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#c5a880" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#c5a880" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#c5a880" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width="320" height="320" rx="32" fill="#faf9f7" />
      <Rect x="14" y="14" width="292" height="292" rx="24" stroke="#e4e2dd" strokeWidth="1.2" fill="none" />
      <G opacity={0.35}>
        <Line x1="50" y1="65" x2="270" y2="65" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
        <Line x1="50" y1="115" x2="270" y2="115" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
        <Line x1="50" y1="165" x2="270" y2="165" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
        <Line x1="50" y1="215" x2="270" y2="215" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
        <Line x1="75" y1="45" x2="75" y2="235" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
        <Line x1="160" y1="45" x2="160" y2="235" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
        <Line x1="245" y1="45" x2="245" y2="235" stroke="#222426" strokeWidth="0.85" strokeDasharray="4 6" />
      </G>
      <AnimatedLine
        x1="55"
        x2="265"
        y1={scanY}
        y2={scanY}
        stroke="url(#clyroScan)"
        strokeWidth="1.5"
        opacity={scanOpacity}
      />
      <AnimatedPath
        d="M 218,85 L 152,85 C 102,85 76,115 76,150 C 76,185 102,215 152,215 L 218,215 L 218,188 L 152,188 C 122,188 105,172 105,150 C 105,128 122,112 152,112 L 218,112 Z"
        stroke="#191b1d"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="750"
        strokeDashoffset={draw}
      />
      <AnimatedLine x1="126" y1="135" x2="235" y2="135" stroke="#c5a880" strokeWidth="2.5" strokeLinecap="round" opacity={barA} />
      <AnimatedLine x1="126" y1="150" x2="198" y2="150" stroke="#191b1d" strokeWidth="2.2" strokeLinecap="round" opacity={barB} />
      <AnimatedLine x1="126" y1="165" x2="224" y2="165" stroke="#c5a880" strokeWidth="2" strokeLinecap="round" opacity={barC} />
      <Path d="M 70,150 L 82,150 M 76,144 L 76,156" stroke="#c5a880" strokeLinecap="round" strokeWidth="1.2" />
      <Path d="M 218,80 L 218,90" stroke="#191b1d" strokeLinecap="round" strokeWidth="1.5" />
      <Path d="M 218,210 L 218,220" stroke="#191b1d" strokeLinecap="round" strokeWidth="1.5" />
      <Path d="M 152,80 L 152,90" stroke="#c5a880" strokeLinecap="round" strokeWidth="1.5" />
      <Path d="M 152,210 L 152,220" stroke="#c5a880" strokeLinecap="round" strokeWidth="1.5" />
      <SvgText x="56" y="60" fill="#92908a" fontSize="7.5" fontWeight="600" letterSpacing="1.2">
        STAGE 04 • LIVE OPS
      </SvgText>
      <SvgText x="212" y="60" fill="#92908a" fontSize="7.5" fontWeight="600" letterSpacing="1.2" textAnchor="end">
        BIM REV 3.2
      </SvgText>
      <SvgText x="160" y="260" fill="#191b1d" fontSize="24" fontWeight="700" letterSpacing="6" textAnchor="middle">
        CLYRO
      </SvgText>
      <SvgText x="160" y="278" fill="#7d7a74" fontSize="8" fontWeight="600" letterSpacing="1.6" textAnchor="middle">
        SPATIAL PROJECT MANAGEMENT
      </SvgText>
    </Svg>
  )
}
