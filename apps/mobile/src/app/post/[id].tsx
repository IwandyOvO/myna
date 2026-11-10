import { categoryName, scaleFor, timeAgo, type Comment, type ReportReason, type Tier } from '@myna/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { mediaUrl } from '../../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/headers';
import { CommentThread } from '../../components/comments';
import { Pills, ScoreBlock } from '../../components/post';
import { RateSheet } from '../../components/RateSheet';
import { Button, Card, Chip, ChipRow, Empty, ErrorView, Loading, Sheet, T, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useBlock, useComments, useDeleteReply, useFavorite, usePost, useReply, useReport } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** §5.2 detail page — also the target of every board row. */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, colors } = useSettings();
  const { signedIn, me } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const toast = useToast();
  const post = usePost(id);
  const [filter, setFilter] = useState<Tier | null>(null);
  const comments = useComments(id, filter);
  const report = useReport();
  const block = useBlock();
  const fav = useFavorite(id);
  const [rateOpen, setRateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentMenu, setCommentMenu] = useState<{ id: string; authorId: string; mine: boolean; isReply: boolean } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const sendReply = useReply();
  const deleteReply = useDeleteReply();
  const commentActions = {
    onMenu: (c: Comment) => setCommentMenu({ id: c.id, authorId: c.author.id, mine: c.mine, isReply: !!c.parentId }),
    onReply: (c: Comment) => (signedIn ? setReplyTo({ id: c.id, name: c.author.nickname }) : router.push('/login')),
  };
  const submitReply = () => {
    if (!replyTo || !replyText.trim()) return;
    sendReply.mutate(
      { commentId: replyTo.id, body: replyText.trim() },
      {
        onSuccess: () => {
          setReplyText('');
          setReplyTo(null);
          toast(t('reply_sent'));
        },
        onError: () => toast(t('error_generic')),
      },
    );
  };

  if (post.isPending) return <View style={{ flex: 1, backgroundColor: colors.bg }}><PageHeader title="" /><Loading /></View>;
  if (post.isError || !post.data) return <View style={{ flex: 1, backgroundColor: colors.bg }}><PageHeader title="" /><ErrorView onRetry={() => post.refetch()} /></View>;
  const p = post.data;
  const sc = scaleFor(p.category, locale);
  const mr = p.myRating;
  const mine = me?.id === p.author.id;

  const cta = !mr ? t('cta_rate') : mr.editsLeft <= 0 ? t('cta_max') : t('cta_edit_fmt', { x: mr.editsLeft });
  const onCta = () => (signedIn ? setRateOpen(true) : router.push('/login'));

  // The same sheet reports/blocks either the post or one comment (App Store 1.2 covers all UGC).
  const target = commentMenu ? { commentId: commentMenu.id, authorId: commentMenu.authorId, mine: commentMenu.mine } : { postId: p.id, authorId: p.author.id, mine };
  const closeMenus = () => {
    setMenuOpen(false);
    setCommentMenu(null);
  };
  const doReport = (reason: ReportReason) => {
    closeMenus();
    if (!signedIn) return router.push('/login');
    const { authorId: _a, mine: _m, ...ref } = target;
    report.mutate({ ...ref, reason }, { onSuccess: () => toast(t('report_ok')), onError: () => toast(t('error_generic')) });
  };
  const doBlock = () => {
    const isPost = !commentMenu;
    closeMenus();
    if (!signedIn) return router.push('/login');
    block.mutate(
      { userId: target.authorId, block: true },
      {
        onSuccess: () => {
          toast(t('blocked_ok'));
          if (isPost) router.back();
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        title={categoryName(p.category, locale)}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              onPress={() => {
                if (!signedIn) return router.push('/login');
                const on = !p.favorited;
                fav.mutate(on, { onSuccess: () => toast(on ? t('fav_added') : t('fav_removed')) });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('fav_add')}
              accessibilityState={{ selected: p.favorited }}
              hitSlop={8}
              style={{ paddingHorizontal: 6 }}
            >
              <Text style={{ fontSize: 22, color: p.favorited ? '#FFB020' : colors.faint }}>{p.favorited ? '★' : '☆'}</Text>
            </Pressable>
            {!mine && (
              <T style={{ fontSize: 22, paddingHorizontal: 6 }} onPress={() => setMenuOpen(true)}>
                ⋯
              </T>
            )}
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        {p.imageUrls.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ height: 260 }}>
            {p.imageUrls.map((u, i) => (
              <View key={u + i} style={{ width: windowWidth, height: 260 }}>
                <Image source={{ uri: mediaUrl(u) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                {i === 0 && <Pills post={p} />}
                {p.imageUrls.length > 1 && (
                  <View style={s.counter}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                      {i + 1}/{p.imageUrls.length}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={[s.cover, { backgroundColor: colors.soft }]}>
            <Text style={{ fontSize: 76 }}>{p.emoji}</Text>
            <Pills post={p} />
          </View>
        )}
        <View style={{ padding: 16 }}>
          <T style={{ fontSize: 20, fontWeight: '900', lineHeight: 27 }}>{p.title}</T>
          {!!p.body && <T style={{ fontSize: 14.5, lineHeight: 22, marginTop: 8, color: colors.body }}>{p.body}</T>}
          <T muted style={{ fontSize: 12, marginTop: 10 }} onPress={() => router.push(`/user/${p.author.id}`)}>
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
              <CommentThread key={c.id} c={c} category={p.category} actions={commentActions} />
            ))
          )}
        </View>
      </ScrollView>
      {replyTo ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.replyWrap}>
          <View style={[s.replyBar, { backgroundColor: colors.card, borderTopColor: colors.line, paddingBottom: 10 + insets.bottom }]}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder={t('reply_to_fmt', { name: replyTo.name })}
              placeholderTextColor={colors.faint}
              autoFocus
              multiline
              maxLength={500}
              style={[s.replyInput, { backgroundColor: colors.soft, color: colors.ink }]}
            />
            <Pressable onPress={submitReply} disabled={!replyText.trim() || sendReply.isPending} accessibilityRole="button" accessibilityLabel={t('send')} style={[s.send, { opacity: replyText.trim() ? 1 : 0.4 }]}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>{t('send')}</Text>
            </Pressable>
            <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={8}>
              <T muted style={{ fontSize: 16 }}>✕</T>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={[s.cta, { bottom: 16 + insets.bottom }]}>
          <Button label={cta} onPress={onCta} disabled={!!mr && mr.editsLeft <= 0} />
        </View>
      )}
      <RateSheet post={p} visible={rateOpen} onClose={() => setRateOpen(false)} />
      <Sheet visible={menuOpen || !!commentMenu} title={commentMenu?.mine ? '' : t('report_title')} onClose={closeMenus}>
        {commentMenu?.mine && commentMenu.isReply && (
          <Pressable
            onPress={() => {
              const id = commentMenu.id;
              closeMenus();
              deleteReply.mutate(id, { onSuccess: () => toast(t('delete_ok')) });
            }}
            accessibilityRole="button"
            style={[s.menuRow, { borderBottomColor: colors.line }]}
          >
            <T style={{ fontSize: 15, color: '#C92A1A', fontWeight: '700' }}>🗑 {t('draft_delete')}</T>
          </Pressable>
        )}
        {!target.mine && (['spam', 'abuse', 'illegal', 'other'] as const).map((r) => (
          <Pressable key={r} onPress={() => doReport(r)} accessibilityRole="button" style={[s.menuRow, { borderBottomColor: colors.line }]}>
            <T style={{ fontSize: 15 }}>{t(`report_${r}`)}</T>
          </Pressable>
        ))}
        {!target.mine && (
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
  counter: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  comment: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  cta: { position: 'absolute', left: 16, right: 16 },
  menuRow: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  replyWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  replyInput: { flex: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, maxHeight: 110 },
  send: { backgroundColor: '#FF5A3C', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
});
