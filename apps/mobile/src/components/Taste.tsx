import { TASTE_EMOJI, TASTE_MIN_RATINGS, type TasteProfile } from '@myna/shared';
import { Text, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { T } from './ui';

/** "🙃 Contrarian" — a taste identity instead of a reputation score. */
export function tasteLabel(taste: TasteProfile, t: (k: string, v?: Record<string, string | number>) => string): string {
  return `${TASTE_EMOJI[taste.key]} ${t(`taste_${taste.key}`)}`;
}

/** Taste block for profiles: label plus the numbers behind it. */
export function TasteCard({ taste }: { taste: TasteProfile }) {
  const { t, colors } = useSettings();
  const stats =
    taste.key === 'newbie'
      ? t('taste_newbie_d', { n: Math.max(1, TASTE_MIN_RATINGS - taste.rated) })
      : [
          taste.agreement !== null ? t('taste_agree_fmt', { n: taste.agreement }) : null,
          t('taste_hot_fmt', { n: taste.hotTakes }),
          taste.avgTier !== null ? t('taste_avg_fmt', { x: taste.avgTier.toFixed(1) }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.soft }}>
      <Text style={{ fontSize: 30 }}>{TASTE_EMOJI[taste.key]}</Text>
      <View style={{ flex: 1 }}>
        <T muted style={{ fontSize: 11, fontWeight: '700' }}>
          {t('taste_title')}
        </T>
        <T style={{ fontSize: 17, fontWeight: '900', marginTop: 1 }}>{t(`taste_${taste.key}`)}</T>
        <T muted style={{ fontSize: 12, marginTop: 3 }}>
          {stats}
        </T>
      </View>
    </View>
  );
}
