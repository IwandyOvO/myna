import { Platform } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon, Text as SvgText, TSpan } from 'react-native-svg';
import { brand } from '../lib/theme';
import { useSettings } from '../lib/settings';

/**
 * Myna lockup (spec §2): myna perched on the M's right shoulder, beak open, tail
 * sweeping under the wordmark into a tomato-red "a". In dark mode the bird and
 * wordmark invert; beak stays yellow and the "a" stays red.
 */
export function Logo({ width = 86 }: { width?: number }) {
  const { colors } = useSettings();
  const ink = colors.ink;
  // Heavy sans wordmark; react-native-svg needs a concrete family per platform.
  const font = Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' });
  return (
    <Svg width={width} height={width / 2} viewBox="0 0 100 50" accessibilityRole="image" accessibilityLabel="Myna">
      <Path d="M26,12 C15,17 6,27 7,36 C8,44 28,47 48,46.5 C60,46 70,44 79,40" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <SvgText x={2} y={36} fontSize={30} fontWeight="900" letterSpacing={-1} fill={ink} fontFamily={font}>
        Myn<TSpan fill={brand.red}>a</TSpan>
      </SvgText>
      <G>
        <Ellipse cx={30} cy={9.5} rx={6.8} ry={5} transform="rotate(-16 30 9.5)" fill={ink} />
        <Circle cx={36.5} cy={5.5} r={4.2} fill={ink} />
        <Polygon points="40,4 47,5.6 40.4,7.4" fill={brand.yellow} />
        <Polygon points="40.4,7.6 46,10 40,9.4" fill={brand.yellowDeep} />
        <Circle cx={37.2} cy={5} r={2.1} fill={brand.yellow} />
        <Circle cx={37.6} cy={5} r={1} fill={colors.bg} />
        <Ellipse cx={28.5} cy={10} rx={3.8} ry={2.2} transform="rotate(-24 28.5 10)" fill={colors.muted} opacity={0.45} />
      </G>
    </Svg>
  );
}
