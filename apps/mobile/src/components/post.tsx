import { CATEGORY_EMOJI, categoryName, LANG_TAG, scaleFor, verdict, type Category, type Locale, type PostCard, type Tier } from '@myna/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { avgColors, brand } from '../lib/theme';
import { Card, T } from './ui';

export function AvgBadge({ post, big }: { post: Pick<PostCard, 'avg' | 'locked' | 'total'>; big?: boolean }) {
  const { colors, t } = useSettings();
  const { bg, fg } = avgColors(post.locked ? null : post.avg, colors);
  const label = post.total === 0 ? t('no_score') : post.locked ? t('locked_badge') : post.avg!.toFixed(1);
  return (
    <View style={[s.avg, { backgroundColor: bg }, big && { paddingHorizontal: 10 }]}>
      <Text style={{ color: fg, fontWeight: '900', fontSize: post.total === 0 || post.locked ? 12 : 14 }}>{label}</Text>
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

function MiniBar({ dist }: { dist: number[] }) {
  const { colors } = useSettings();
  const total = dist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <View style={[s.mini, { backgroundColor: colors.track }]}>
      {dist.map((c, i) => (c ? <View key={i} style={{ flex: c, backgroundColor: brand.bars[i] }} /> : null))}
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
  const where = showDistance && post.distanceKm !== undefined ? `${post.distanceKm}km` : post.placeName;
  return (
    <Card onPress={open} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={[s.cover, { backgroundColor: colors.soft }]}>
        <Text style={{ fontSize: 58 }}>{post.emoji || CATEGORY_EMOJI[post.category]}</Text>
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
          <AvgBadge post={post} />
          {post.dist && <MiniBar dist={post.dist} />}
          <T muted style={{ fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {post.total === 0 ? t('first_rate_card') : `${post.total}${t('reviews_unit')}`}
          </T>
        </View>
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

/** §4.4 detail score block + five-tier distribution labelled with the category scale. */
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
  if (post.locked || !post.dist || post.avg === null) {
    return (
      <View>
        <T style={{ fontSize: 42, fontWeight: '900', color: colors.faint }}>?.?</T>
        <T style={{ color: brand.red, fontWeight: '700', marginTop: 6 }}>{t('locked_title')}</T>
        <T muted style={{ fontSize: 12, marginTop: 4 }}>
          {t('blind_ing', { n: post.total })}
        </T>
      </View>
    );
  }
  const v = verdict(post.avg);
  const { bg, fg } = avgColors(post.avg, colors);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <T style={{ fontSize: 42, fontWeight: '900', lineHeight: 46 }}>{post.avg.toFixed(1)}</T>
        <View>
          <View style={[s.avg, { backgroundColor: bg, alignSelf: 'flex-start' }]}>
            <Text style={{ color: fg, fontWeight: '900', fontSize: 13 }}>{t(`verdict_${v}`)}</Text>
          </View>
          <T muted style={{ fontSize: 12, marginTop: 5 }}>
            {t('reviews_count', { n: post.total })}
          </T>
        </View>
      </View>
      <View style={{ marginTop: 8 }}>
        {[4, 3, 2, 1, 0].map((i) => (
          <View key={i} style={s.distRow}>
            <T style={{ width: 112, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {sc[i].emoji} {sc[i].label}
            </T>
            <View style={[s.track, { backgroundColor: colors.track }]}>
              <View style={{ width: `${(post.dist![i] / post.total) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: brand.bars[i] }} />
            </View>
            <T muted style={{ width: 42, textAlign: 'right', fontSize: 12 }}>
              {post.dist![i]}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  avg: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  tier: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6, backgroundColor: '#FFF4D6' },
  tierText: { fontSize: 11, fontWeight: '800', color: '#7A5B00' },
  mini: { flexDirection: 'row', height: 8, borderRadius: 99, overflow: 'hidden', flexGrow: 1, flexBasis: 30, minWidth: 30 },
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
