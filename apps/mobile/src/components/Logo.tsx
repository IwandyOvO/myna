import { Platform } from 'react-native';
import Svg, { G, Path, Text as SvgText, TSpan } from 'react-native-svg';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';
import P from './mark-paths.json';

/** The walking-myna mark from the app icon (tools/brand/build-icons.cjs), in its 1254-unit artwork space. */
function Bird({ ink, paper }: { ink: string; paper: string }) {
  return (
    <>
      <Path d={P.body} fill={ink} />
      <Path d={P.crescent} fill={paper} />
      <Path d={P.wing} fill={ink} />
      <Path d={P.leg} fill={ink} />
      <Path d={P.foot} fill={ink} />
      <Path d={P.eye} fill="none" stroke={paper} strokeWidth={24} strokeLinecap="round" />
      <Path d={P.chirp} fill="none" stroke={ink} strokeWidth={34} strokeLinecap="round" />
    </>
  );
}

/**
 * Myna logo. `mark` = the bird alone (home header); `full` = bird + "Myna" wordmark with a tomato-red
 * "a" (login). Black on light backgrounds; in dark mode the bird and wordmark invert to light.
 */
export function Logo({ width = 86, variant = 'full' }: { width?: number; variant?: 'full' | 'mark' }) {
  const { colors } = useSettings();
  const ink = colors.ink;
  const paper = colors.bg; // negative space (wing crescent, eye) shows the page behind the logo
  if (variant === 'mark') {
    return (
      <Svg width={width} height={(width * 860) / 930} viewBox="175 200 930 860" accessibilityRole="image" accessibilityLabel="Myna">
        <Bird ink={ink} paper={paper} />
      </Svg>
    );
  }
  const font = Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' });
  return (
    <Svg width={width} height={(width * 44) / 142} viewBox="0 0 142 44" accessibilityRole="image" accessibilityLabel="Myna">
      <G transform="translate(0 1) scale(0.0465) translate(-175 -200)">
        <Bird ink={ink} paper={paper} />
      </G>
      <SvgText x={50} y={33} fontSize={29} fontWeight="900" letterSpacing={-0.8} fill={ink} fontFamily={font}>
        Myn<TSpan fill={brand.red}>a</TSpan>
      </SvgText>
    </Svg>
  );
}
