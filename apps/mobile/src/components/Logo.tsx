import { Platform } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText, TSpan } from 'react-native-svg';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';

/** Same bubble-bird as the app icon (tools/brand/build-icons.cjs), in 1024-unit space. */
const BODY = `M392 300 H612 A168 168 0 0 1 780 468 V516 A168 168 0 0 1 612 684 H470
  C430 684 392 700 362 728 C338 750 312 768 282 778 C300 752 310 724 312 694
  C266 664 224 604 224 516 V468 A168 168 0 0 1 392 300 Z`;

/**
 * Myna logo. `mark` = the bubble-bird alone (home header); `full` = bird + "Myna" wordmark
 * with a tomato-red "a" (login, splash-like places). In dark mode the bird and wordmark invert
 * to light; beak/eye stay yellow, the "a" and dot stay red.
 */
export function Logo({ width = 86, variant = 'full' }: { width?: number; variant?: 'full' | 'mark' }) {
  const { colors } = useSettings();
  const ink = colors.ink;
  const font = Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' });
  if (variant === 'mark') {
    // Bird bounding box in icon space ≈ x 224–960, y 300–778.
    return (
      <Svg width={width} height={(width * 490) / 740} viewBox="222 296 740 490" accessibilityRole="image" accessibilityLabel="Myna">
        <Path d={BODY} fill={ink} />
        <Path d="M772 418 C820 420 866 432 902 450 C866 462 822 470 776 470 Z" fill={brand.yellow} />
        <Path d="M776 482 C812 484 846 494 872 508 C842 516 808 518 772 512 Z" fill={brand.yellowDeep} />
        <Circle cx={648} cy={440} r={48} fill={brand.yellow} />
        <Circle cx={659} cy={437} r={22} fill="#17171A" />
        <Circle cx={930} cy={404} r={30} fill={brand.red} />
      </Svg>
    );
  }
  return (
    <Svg width={width} height={(width * 44) / 142} viewBox="0 0 142 44" accessibilityRole="image" accessibilityLabel="Myna">
      <G transform="translate(0 3) scale(0.072) translate(-224 -300)">
        <Path d={BODY} fill={ink} />
        <Path d="M772 418 C820 420 866 432 902 450 C866 462 822 470 776 470 Z" fill={brand.yellow} />
        <Path d="M776 482 C812 484 846 494 872 508 C842 516 808 518 772 512 Z" fill={brand.yellowDeep} />
        <Circle cx={648} cy={440} r={48} fill={brand.yellow} />
        <Circle cx={659} cy={437} r={22} fill="#17171A" />
        <Circle cx={930} cy={404} r={30} fill={brand.red} />
      </G>
      <SvgText x={64} y={32} fontSize={29} fontWeight="900" letterSpacing={-0.8} fill={ink} fontFamily={font}>
        Myn<TSpan fill={brand.red}>a</TSpan>
      </SvgText>
    </Svg>
  );
}
