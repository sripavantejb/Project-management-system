import Svg, { Path, Rect } from 'react-native-svg'

/** Architectural C from the Stitch onboarding mark. */
export function ClyroMark({ size = 168 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Rect x="10" y="10" width="180" height="180" rx="4" stroke="#1e2022" strokeWidth="1.25" fill="#faf9f7" />
      <Path
        d="M146 52c-8-16-28-28-48-28-36 0-64 30-64 76s28 76 64 76c20 0 40-12 48-28"
        stroke="#1e2022"
        strokeWidth="14"
        fill="none"
        strokeLinecap="butt"
      />
      <Path
        d="M132 70c-6-10-18-18-34-18-24 0-42 20-42 48s18 48 42 48c16 0 28-8 34-18"
        stroke="#c4b8a8"
        strokeWidth="1.5"
        fill="none"
      />
    </Svg>
  )
}
