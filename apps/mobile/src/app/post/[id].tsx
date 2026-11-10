import { categoryName, scaleFor, timeAgo, type ReportReason, type Tier } from '@myna/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/headers';
import { Pills, ScoreBlock, TierBadge } from '../../components/post';
import { RateSheet } from '../../components/RateSheet';
import { Button, Card, Chip, ChipRow, Empty, ErrorView, Loading, Sheet, T, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useBlock, useComments, useLike, usePost, useReport } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** §5.2 detail page — also the target of every board row. */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, colors } = useSettings();
  const { signedIn, me } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const post = usePost(id);
  const [filter, setFilter] = useState<Tier | null>(null);
  const comments = useComments(id, filter);
  const like = useLike();
  const report = useReport();
  const block = useBlock();
  const [rateOpen, setRateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (post.isPending) return <View style={{ flex: 1, backgroundColor: colors.bg }}><PageHeader title="" /><Loading /></View>;
  if (post.isError || !post.data) return <View style={{ flex: 1, backgroundColor: colors.bg }}><PageHeader title="" /><ErrorView onRetry={() => post.refetch()} /></View>;
  const p = post.data;
  const sc = scaleFor(p.category, locale);
  const mr = p.myRating;
  const mine = me?.id === p.author.id;

  const cta = !mr ? t('cta_rate') : mr.editsLeft <= 0 ? t('cta_max') : t('cta_edit_fmt', { x: mr.editsLeft });
  const onCta = () => (signedIn ? setRateOpen(true) : router.push('/login'));

  const doReport = (reason: ReportReason) => {
    setMenuOpen(false);
    if (!signedIn) return router.push('/login');
    report.mutate({ postId: p.id, reason }, { onSuccess: () => toast(t('report_ok')), onError: () => toast(t('error_generic')) });
  };
  const doBlock = () => {
    setMenuOpen(false);
    if (!signedIn) return router.push('/login');
    block.mutate(
      { userId: p.author.id, block: true },
      {
        onSuccess: () => {
          toast(t('blocked_ok'));
          router.back();
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={categoryName(p.category, locale)} right={<T style={{ fontSize: 22, paddingHorizontal: 6 }} onPress={() => setMenuOpen(true)}>⋯</T>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <View style={[s.cover, { backgroundColor: colors.soft }]}>
          <Text style={{ fontSize: 76 }}>{p.emoji}</Text>
          <Pills post={p} />
        </View>
        <View style={{ padding: 16 }}>
          <T style={{ fontSize: 20, fontWeight: '900', lineHeight: 27 }}>{p.title}</T>
          {!!p.body && <T style={{ fontSize: 14.5, lineHeight: 22, marginTop: 8, color: colors.body }}>{p.body}</T>}
          <T muted style={{ fontSize: 12, marginTop: 10 }}>
            {p.author.avatar} {p.author.nickname} · {timeAgo(locale, p.createdAt)}
            {p.placeName ? ` · 📍${p.placeName}` : ''}
          </T>

          <Card style={{ padding: 16, marginTop: 16 }}>
            <ScoreBlock post={p} />
          </Card>

          <T style={{ fontSize: 16, fontWeight: '800', marginTop: 22 }}>{t('comments_title')}</T>
        </View>
        {!p.locked && (
          <ChipRow>
            <Chip label={t('filter_all')} on={filter === null} onPress={() => setFilter(null)} />
            {sc.map((st, i) => (
              <Chip key={i} label={`${st.emoji} ${st.label}`} on={filter === i + 1} onPress={() => setFilter((i + 1) as Tier)} />
            ))}
          </ChipRow>
        )}
        <View style={{ paddingHorizontal: 16 }}>
          {comments.isPending ? (
            <Loading />
          ) : !comments.data?.items.length ? (
            <Empty emoji="💬" text={t('no_comments_tier')} />
          ) : (
            comments.data.items.map((c) => (
              <View key={c.id} style={[s.comment, { borderBottomColor: colors.line }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={{ fontSize: 19 }}>{c.author.avatar}</Text>
                  <T style={{ fontSize: 13, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
                    {c.mine ? `${c.author.nickname} (${t('my_name')})` : c.author.nickname}
                  </T>
                  <TierBadge category={p.category} tier={c.tier} locale={locale} />
                  <Pressable
                    style={{ marginLeft: 'auto', paddingVertical: 4, paddingLeft: 8 }}
                    accessibilityRole="button"
                    onPress={() => (signedIn ? like.mutate({ commentId: c.id, like: !c.likedByMe }) : router.push('/login'))}
                  >
                    <T style={{ fontSize: 12, color: c.likedByMe ? '#FF5A3C' : colors.faint }}>
                      {c.likedByMe ? '♥' : '♡'} {c.likeCount}
                    </T>
                  </Pressable>
                </View>
                {!!c.body && <T style={{ fontSize: 14, lineHeight: 22, marginTop: 7, color: colors.body }}>{c.body}</T>}
                {c.edited && <T style={{ fontSize: 11, color: colors.faint, marginTop: 4 }}>{t('edited')}</T>}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <View style={[s.cta, { bottom: 16 + insets.bottom }]}>
        <Button label={cta} onPress={onCta} disabled={!!mr && mr.editsLeft <= 0} />
      </View>
      <RateSheet post={p} visible={rateOpen} onClose={() => setRateOpen(false)} />
      <Sheet visible={menuOpen} title={t('report_title')} onClose={() => setMenuOpen(false)}>
        {(['spam', 'abuse', 'illegal', 'other'] as const).map((r) => (
          <Pressable key={r} onPress={() => doReport(r)} accessibilityRole="button" style={[s.menuRow, { borderBottomColor: colors.line }]}>
            <T style={{ fontSize: 15 }}>{t(`report_${r}`)}</T>
          </Pressable>
        ))}
        {!mine && (
          <Pressable onPress={doBlock} accessibilityRole="button" style={s.menuRow}>
            <T style={{ fontSize: 15, color: '#C92A1A', fontWeight: '700' }}>🚫 {t('block_user')}</T>
          </Pressable>
        )}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  cover: { height: 180, alignItems: 'center', justifyContent: 'center' },
  comment: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  cta: { position: 'absolute', left: 16, right: 16 },
  menuRow: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
});
