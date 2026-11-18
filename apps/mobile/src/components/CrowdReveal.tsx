import { type CrowdReveal as Crowd, type PostCard } from '@myna/shared';
import { Text, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';
import { SplitBar, VerdictBadge } from './post';
import { T } from './ui';

/** "You're with 71% of people" / "Hot take! Only 9% agree" — shown right after rating. */
export function CrowdRevealView({ post, crowd }: { post: PostCard; crowd: Crowd | null }) {
  const { t } = useSettings();
  const headline = !crowd || crowd.first
    ? { emoji: '🚩', text: t('reveal_first') }
    : crowd.minority
      ? { emoji: '🔥', text: t('reveal_minority_fmt', { n: crowd.sameSide }) }
      : { emoji: crowd.sameSide >= 50 ? '🤝' : '🧐', text: t('reveal_with_fmt', { n: crowd.sameSide }) };
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }} accessibilityLiveRegion="polite">
      <Text style={{ fontSize: 54 }}>{headline.emoji}</Text>
      <T style={{ fontSize: 20, fontWeight: '900', textAlign: 'center', color: crowd?.minority ? brand.red : undefined }}>{headline.text}</T>
      {crowd && !crowd.first && (
        <T muted style={{ fontSize: 13, textAlign: 'center' }}>
          {t('reveal_exact_fmt', { n: crowd.sameTier })}
        </T>
      )}
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 4 }}>
        <View style={{ alignItems: 'center' }}>
          <VerdictBadge post={post} />
        </View>
        {post.split && <SplitBar split={post.split} big />}
      </View>
    </View>
  );
}
