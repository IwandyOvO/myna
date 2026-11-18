import { CATEGORY_EMOJI, categoryName, crowdReveal, scaleFor, VERDICT_EMOJI, type Category, type CrowdReveal, type PostCard, type Tier } from '@myna/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View, type FlatListProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, mediaUrl, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorText } from '../../lib/errors';
import { useDaily, useFeed, useQuickRate } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';
import { useToast } from '../../components/ui';

/** Background per category, so every page feels like its own "video". */
const BG: Record<Category, string> = {
  drinks: '#1F6F8B', snacks: '#B5452B', electronics: '#2D3142', beauty: '#A23B72', food: '#C0612B', household: '#3B6E4F',
  life: '#4A6C2F', love: '#B03A5B', work: '#3D405B', family: '#7A5C3E', education: '#2E5077', other: '#4B4B4B',
};

type Page = { post: PostCard; today?: boolean };

/** Endless unrated posts for signed-in users; each next page excludes everything already shown. */
function useEndlessDeck(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['deck'],
    enabled,
    initialPageParam: [] as string[],
    queryFn: ({ pageParam }) => api<{ items: PostCard[] }>('GET', `/deck${qs({ limit: 20, exclude: pageParam.slice(-150).join(',') || undefined })}`),
    getNextPageParam: (last, all) => (last.items.length ? all.flatMap((p) => p.items.map((x) => x.id)) : undefined),
    staleTime: Infinity,
  });
}

/**
 * 开评: a full-screen vertical feed — today's drop first, then one card after another, forever.
 * Tap a tier to rate → instant "you vs everyone" reveal → it slides to the next card by itself.
 * Swipe up to skip. Guests browse the hot feed and are asked to log in when they rate.
 */
export default function Play() {
  const { t, locale, contentLangs } = useSettings();
  const { signedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const daily = useDaily();
  const deck = useEndlessDeck(signedIn);
  const guest = useFeed(undefined, contentLangs, '', 'hot', !signedIn);
  const rate = useQuickRate();
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, { post: PostCard; crowd: CrowdReveal | null }>>({});
  const list = useRef<FlatList<Page>>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pages: Page[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Page[] = [];
    const add = (post: PostCard, today?: boolean) => {
      if (seen.has(post.id)) return;
      seen.add(post.id);
      out.push({ post, today });
    };
    if (daily.data?.post) add(daily.data.post, true);
    const src = signedIn ? deck.data?.pages.flatMap((p) => p.items) : guest.data?.pages.flatMap((p) => p.items);
    src?.forEach((p) => add(p));
    return out;
  }, [daily.data, deck.data, guest.data, signedIn]);

  const source = signedIn ? deck : guest;
  // Keep a few pages ahead so it never runs dry.
  useEffect(() => {
    if (pages.length && index >= pages.length - 4 && source.hasNextPage && !source.isFetchingNextPage) void source.fetchNextPage();
  }, [index, pages.length, source]);
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current); }, []);

  const onViewable = useRef<NonNullable<FlatListProps<Page>['onViewableItemsChanged']>>(({ viewableItems }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }).current;

  const pick = useCallback(
    (page: Page, i: number, tier: Tier) => {
      if (!signedIn) return router.push('/login');
      if (rate.isPending || results[page.post.id] || page.post.myRating) return;
      rate.mutate(
        { postId: page.post.id, tier, reason: '' },
        {
          onSuccess: (r) => {
            const { crowd, ...post } = r;
            setResults((m) => ({ ...m, [post.id]: { post, crowd } }));
            void daily.refetch();
            // Let the reveal land, then glide to the next card.
            if (advance.current) clearTimeout(advance.current);
            advance.current = setTimeout(() => list.current?.scrollToIndex({ index: Math.min(i + 1, pages.length - 1), animated: true }), 2200);
          },
          onError: (e) => toast(errorText(e, t)),
        },
      );
    },
    [signedIn, rate, results, daily, pages.length, toast, t],
  );

  const renderPage = ({ item, index: i }: { item: Page; index: number }) => {
    const done = results[item.post.id];
    const post = done?.post ?? item.post;
    const crowd = done?.crowd ?? (post.myRating && post.dist ? crowdReveal(post.dist, post.myRating.tier) : null);
    const rated = !!post.myRating;
    const sc = scaleFor(post.category, locale);
    return (
      <View style={{ height, backgroundColor: BG[post.category] ?? '#333' }}>
        {post.imageUrls[0] ? (
          <>
            <Image source={{ uri: mediaUrl(post.imageUrls[0]) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingBottom: height * 0.28 }]}>
            <Text style={{ fontSize: Math.min(150, height * 0.18) }}>{post.emoji || CATEGORY_EMOJI[post.category]}</Text>
          </View>
        )}

        {/* top: today's drop + streak */}
        <View style={[s.top, { paddingTop: insets.top + 10 }]}>
          {item.today ? <Text style={s.badge}>{t('today_badge')}</Text> : <View />}
          {signedIn && !!daily.data?.streak && <Text style={s.badge}>{t('daily_streak_fmt', { n: daily.data.streak })}</Text>}
        </View>

        {/* bottom: what it is, then either the five tiers or the reveal */}
        <View style={s.bottom}>
          <Text style={s.meta}>
            {categoryName(post.category, locale)} · {post.total ? t('ratings_fmt', { n: post.total }) : t('first_rate_card')}
          </Text>
          <Text style={s.title} numberOfLines={3} onPress={() => router.push(`/post/${post.id}`)}>
            {post.title}
          </Text>
          {!!post.body && (
            <Text style={s.body} numberOfLines={2}>
              {post.body}
            </Text>
          )}

          {rated ? (
            <View style={s.reveal}>
              <Text style={[s.revealHead, crowd?.minority && { color: brand.yellow }]}>
                {!crowd || crowd.first
                  ? `🚩 ${t('reveal_first')}`
                  : crowd.minority
                    ? `🔥 ${t('reveal_minority_fmt', { n: crowd.sameSide })}`
                    : `🤝 ${t('reveal_with_fmt', { n: crowd.sameSide })}`}
              </Text>
              {post.verdict && post.split && (
                <>
                  <Text style={s.verdict}>
                    {VERDICT_EMOJI[post.verdict]} {t(`v_${post.verdict}`)}
                  </Text>
                  <View style={s.bar}>
                    {post.split.low > 0 && <View style={{ flex: post.split.low, backgroundColor: brand.bars[0] }} />}
                    {post.split.mid > 0 && <View style={{ flex: post.split.mid, backgroundColor: brand.bars[2] }} />}
                    {post.split.high > 0 && <View style={{ flex: post.split.high, backgroundColor: brand.bars[4] }} />}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.pct}>👎 {post.split.low}%</Text>
                    <Text style={s.pct}>😐 {post.split.mid}%</Text>
                    <Text style={s.pct}>👍 {post.split.high}%</Text>
                  </View>
                </>
              )}
              {post.topComment && (
                <Text style={s.roast} numberOfLines={2}>
                  🔥 “{post.topComment.body}”
                </Text>
              )}
              <Pressable onPress={() => router.push(`/post/${post.id}`)} accessibilityRole="button" style={s.comments}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>💬 {t('open_comments')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.tiers}>
              {sc.map((st, k) => (
                <Pressable
                  key={k}
                  onPress={() => pick(item, i, (k + 1) as Tier)}
                  accessibilityRole="radio"
                  accessibilityLabel={st.label}
                  style={({ pressed }) => [s.tier, pressed && { transform: [{ scale: 0.94 }], backgroundColor: 'rgba(255,255,255,0.32)' }]}
                >
                  <Text style={{ fontSize: 28 }}>{st.emoji}</Text>
                  <Text style={s.tierLabel} numberOfLines={2}>
                    {st.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={s.hint}>↑ {t('swipe_hint')}</Text>
        </View>
      </View>
    );
  };

  // Wait for today's drop so it's always the first card (it would otherwise pop in above a card you're looking at).
  const loading = daily.isPending || (!pages.length && (source.isPending || source.isFetching));
  return (
    <View style={{ flex: 1, backgroundColor: '#111' }} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 &&
        (loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: height / 2 - 20 }} />
        ) : !pages.length ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <Text style={{ fontSize: 56 }}>🎉</Text>
            <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>{t('deck_empty')}</Text>
          </View>
        ) : (
          <FlatList
            ref={list}
            data={pages}
            keyExtractor={(p) => p.post.id}
            renderItem={renderPage}
            extraData={results}
            pagingEnabled
            snapToInterval={height}
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={VIEWABILITY}
            onScrollBeginDrag={() => advance.current && clearTimeout(advance.current)}
            windowSize={5}
            initialNumToRender={2}
            ListFooterComponent={source.isFetchingNextPage ? <ActivityIndicator color="#fff" style={{ padding: 24 }} /> : undefined}
          />
        ))}
    </View>
  );
}

const VIEWABILITY: FlatListProps<Page>['viewabilityConfig'] = { itemVisiblePercentThreshold: 60 };
const shadow = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };
const s = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  badge: { color: '#fff', fontWeight: '900', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.35)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingBottom: 14, gap: 8 },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', ...shadow },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 33, ...shadow },
  body: { color: 'rgba(255,255,255,0.9)', fontSize: 14.5, lineHeight: 21, ...shadow },
  tiers: { flexDirection: 'row', gap: 7, marginTop: 8 },
  tier: { flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 2, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  tierLabel: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  reveal: { marginTop: 8, gap: 8, padding: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)' },
  revealHead: { color: '#fff', fontSize: 18, fontWeight: '900' },
  verdict: { color: '#fff', fontSize: 15, fontWeight: '800' },
  bar: { flexDirection: 'row', height: 10, borderRadius: 99, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)' },
  pct: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  roast: { color: 'rgba(255,255,255,0.92)', fontSize: 13.5 },
  comments: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, textAlign: 'center', marginTop: 2 },
});
