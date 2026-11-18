import { CATEGORY_EMOJI, categoryName, LANG_TAG, scaleFor, VERDICT_EMOJI, type Category, type Locale, type PostCard, type Tier, type VerdictKey, type VoteSplit } from '@myna/shared';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { mediaUrl } from '../lib/api';
import { useSettings } from '../lib/settings';
import { avgColors, brand, verdictColors } from '../lib/theme';
import { Card, T } from './ui';

/** Numeric average — used on ranking boards, where comparing numbers is the point. */
export function AvgBadge({ post }: { post: Pick<PostCard, 'avg' | 'locked' | 'total'> }) {
  const { colors, t } = useSettings();
  const { bg, fg } = avgColors(post.locked ? null : post.avg, colors);
  const label = post.total === 0 ? t('no_score') : post.locked ? t('locked_badge') : post.avg!.toFixed(1);
  return (
    <View style={[s.avg, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '900', fontSize: post.total === 0 || post.locked ? 12 : 14 }}>{label}</Text>
    </View>
  );
}

/** The headline of every post: what people think, in words ("Controversial", "Legendary"…). */
export function VerdictBadge({ post, big }: { post: Pick<PostCard, 'verdict' | 'locked' | 'total'>; big?: boolean }) {
  const { colors, t } = useSettings();
  if (post.locked) {
    return (
      <View style={[s.verdict, { backgroundColor: colors.soft }, big && s.verdictBig]}>
        <Text style={{ color: colors.muted, fontWeight: '900', fontSize: big ? 17 : 13 }}>{t('locked_badge')}</Text>
      </View>
    );
  }
  const key: VerdictKey = post.verdict ?? 'fresh';
  const { bg, fg } = verdictColors(key, colors);
  return (
    <View style={[s.verdict, { backgroundColor: bg }, big && s.verdictBig]}>
      <Text style={{ color: fg, fontWeight: '900', fontSize: big ? 20 : 13 }}>
        {VERDICT_EMOJI[key]} {t(`v_${key}`)}
      </Text>
    </View>
  );
}

/** Real data instead of a rainbow: how many said bad / meh / good. */
export function SplitBar({ split, big }: { split: VoteSplit; big?: boolean }) {
  const { colors } = useSettings();
  const parts: { k: keyof VoteSplit; color: string; icon: string }[] = [
    { k: 'low', color: brand.bars[0], icon: '👎' },
    { k: 'mid', color: brand.bars[2], icon: '😐' },
    { k: 'high', color: brand.bars[4], icon: '👍' },
  ];
  return (
    <View style={{ gap: big ? 8 : 5 }}>
      <View style={[s.split, { backgroundColor: colors.track, height: big ? 12 : 8 }]}>
        {parts.map((p) => (split[p.k] ? <View key={p.k} style={{ flex: split[p.k], backgroundColor: p.color }} /> : null))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {parts.map((p) => (
          <Text key={p.k} style={{ fontSize: big ? 13 : 11.5, fontWeight: '800', color: split[p.k] ? colors.sub : colors.faint }}>
            {p.icon} {split[p.k]}%
          </Text>
        ))}
      </View>
    </View>
  );
}

/** The most-liked comment, quoted. */
export function RoastLine({ post }: { post: PostCard }) {
  const { colors } = useSettings();
  const c = post.topComment;
  if (!c) return null;
  return (
    <View style={[s.roast, { backgroundColor: colors.soft }]}>
      <T style={{ fontSize: 13, color: colors.body, flex: 1 }} numberOfLines={2}>
        🔥 “{c.body}”
      </T>
      <T muted style={{ fontSize: 11 }}>
        {c.author.avatar} {c.likeCount > 0 ? `♥${c.likeCount}` : ''}
      </T>
    </View>
  );
}

export function TierBadge({ category, tier, locale }: { category: Category; tier: Tier | null; locale: Locale }) {
  if (tier === null) {
    return (
      <View style={s.tier}>
        <Text style={s.tierText}>🔒</Text>
      </View>
    );
  }
  const st = scaleFor(category, locale)[tier - 1];
  return (
    <View style={s.tier}>
      <Text style={s.tierText}>
        {st.emoji} {st.label}
      </Text>
    </View>
  );
}

export function Pills({ post }: { post: PostCard }) {
  const { t } = useSettings();
  const pills: { label: string; style: object; text: object }[] = [];
  if (post.blind) pills.push({ label: t('blind_tag'), style: {}, text: {} });
  if (post.tags.includes('potential')) pills.push({ label: t('potential_tag'), style: { backgroundColor: '#E8FFF0' }, text: { color: '#087443' } });
  if (post.tags.includes('warn')) pills.push({ label: t('warn_tag'), style: { backgroundColor: '#1A1A1A' }, text: { color: brand.yellow } });
  if (!pills.length) return null;
  return (
    <View style={s.pills}>
      {pills.map((p) => (
        <View key={p.label} style={[s.pill, p.style]}>
          <Text style={[s.pillText, p.text]}>{p.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** §5.1 feed card. */
export function PostCardView({ post, showDistance }: { post: PostCard; showDistance?: boolean }) {
  const { colors, t, locale } = useSettings();
  const open = () => router.push(`/post/${post.id}`);
  const where = showDistance && post.distanceKm !== undefined ? (post.distanceKm < 1 ? t('km_lt1') : `${post.distanceKm}km`) : post.placeName;
  return (
    <Card onPress={open} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={[s.cover, { backgroundColor: colors.soft }]}>
        {post.imageUrls[0] ? (
          <Image source={{ uri: mediaUrl(post.imageUrls[0]) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <Text style={{ fontSize: 58 }}>{post.emoji || CATEGORY_EMOJI[post.category]}</Text>
        )}
        <Pills post={post} />
        {post.lang !== locale && (
          <View style={[s.lang, { backgroundColor: colors.card }]}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.sub }}>{LANG_TAG[post.lang]}</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 14, paddingTop: 12 }}>
        <T style={{ fontSize: 16, fontWeight: '800', lineHeight: 22 }} numberOfLines={2}>
          {post.title}
        </T>
        {!!post.body && (
          <T muted style={{ fontSize: 13, marginTop: 4 }} numberOfLines={1}>
            {post.body}
          </T>
        )}
        <View style={s.metaRow}>
          <VerdictBadge post={post} />
          <T muted style={{ fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {post.total === 0
              ? t('first_rate_card')
              : post.avg !== null && !post.locked
                ? `${t('ratings_fmt', { n: post.total })} · ${t('avg_fmt', { x: post.avg.toFixed(1) })}`
                : t('ratings_fmt', { n: post.total })}
          </T>
        </View>
        {post.split && (
          <View style={{ marginTop: 10 }}>
            <SplitBar split={post.split} />
          </View>
        )}
        {post.topComment && (
          <View style={{ marginTop: 10 }}>
            <RoastLine post={post} />
          </View>
        )}
        <View style={[s.metaRow, { marginTop: 10 }]}>
          <T muted style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>
            {post.author.avatar} {post.author.nickname} · {categoryName(post.category, locale)}
            {where ? ` · 📍${where}` : ''}
          </T>
          <Pressable
            onPress={open}
            accessibilityRole="button"
            style={[s.rateBtn, post.myRating ? { backgroundColor: colors.soft } : { backgroundColor: brand.red }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: post.myRating ? colors.muted : '#fff' }}>{post.myRating ? t('rated') : t('go_rate')}</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

/** §4.4 detail score block — verdict first, then the vote split, then the five tiers with percentages. */
export function ScoreBlock({ post }: { post: PostCard }) {
  const { colors, t, locale } = useSettings();
  const sc = scaleFor(post.category, locale);
  if (post.total === 0) {
    return (
      <View>
        <T style={{ fontSize: 26, fontWeight: '900' }}>{t('no_score')}</T>
        <T muted style={{ fontSize: 13, marginTop: 6 }}>
          {t('first_rate')}
        </T>
      </View>
    );
  }
  if (post.locked || !post.dist || post.avg === null || !post.split) {
    return (
      <View>
        <VerdictBadge post={post} big />
        <T style={{ color: brand.red, fontWeight: '700', marginTop: 10 }}>{t('locked_title')}</T>
        <T muted style={{ fontSize: 12, marginTop: 4 }}>
          {post.blindUntil
            ? `${t('reviews_count', { n: post.total })} · ${t('blind_left_fmt', { h: Math.max(1, Math.ceil((new Date(post.blindUntil).getTime() - Date.now()) / 3_600_000)) })}`
            : t('blind_ing', { n: post.total })}
        </T>
      </View>
    );
  }
  const key = post.verdict ?? 'fresh';
  return (
    <View>
      <VerdictBadge post={post} big />
      <T style={{ fontSize: 15, fontWeight: '700', marginTop: 10 }}>{t(`vd_${key}`, { n: post.total })}</T>
      <T muted style={{ fontSize: 12, marginTop: 4 }}>
        {t('ratings_fmt', { n: post.total })} · {t('avg_fmt', { x: post.avg.toFixed(1) })}
      </T>
      <View style={{ marginTop: 14 }}>
        <SplitBar split={post.split} big />
      </View>
      <View style={{ marginTop: 10 }}>
        {[4, 3, 2, 1, 0].map((i) => {
          const pct = Math.round((post.dist![i] / post.total) * 100);
          return (
            <View key={i} style={s.distRow}>
              <T style={{ width: 112, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                {sc[i].emoji} {sc[i].label}
              </T>
              <View style={[s.track, { backgroundColor: colors.track }]}>
                <View style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: brand.bars[i] }} />
              </View>
              <T muted style={{ width: 42, textAlign: 'right', fontSize: 12 }}>
                {pct}%
              </T>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  avg: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  verdict: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  verdictBig: { paddingVertical: 8, paddingHorizontal: 14 },
  split: { flexDirection: 'row', borderRadius: 99, overflow: 'hidden' },
  roast: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  tier: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6, backgroundColor: '#FFF4D6' },
  tierText: { fontSize: 11, fontWeight: '800', color: '#7A5B00' },
  cover: { height: 132, alignItems: 'center', justifyContent: 'center' },
  pills: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#1A1A1A' },
  lang: { position: 'absolute', top: 10, right: 10, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  rateBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  track: { flex: 1, height: 9, borderRadius: 99, overflow: 'hidden' },
});
