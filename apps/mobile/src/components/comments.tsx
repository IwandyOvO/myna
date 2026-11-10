import { timeAgo, type Category, type Comment } from '@myna/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useLike, useReplies } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { TierBadge } from './post';
import { T } from './ui';

export interface CommentActions {
  onMenu: (c: Comment) => void;
  onReply: (c: Comment) => void;
}

function Row({ c, category, actions, small }: { c: Comment; category: Category; actions: CommentActions; small?: boolean }) {
  const { t, colors, locale } = useSettings();
  const { signedIn } = useAuth();
  const like = useLike();
  const profile = () => router.push(`/user/${c.author.id}`);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ fontSize: small ? 16 : 19 }} onPress={profile}>
          {c.author.avatar}
        </Text>
        <T style={{ fontSize: small ? 12.5 : 13, fontWeight: '800', flexShrink: 1 }} numberOfLines={1} onPress={profile}>
          {c.mine ? `${c.author.nickname} (${t('my_name')})` : c.author.nickname}
        </T>
        {!c.parentId && <TierBadge category={category} tier={c.tier} locale={locale} />}
        {/* Nothing to do on your own rating comment (edit it via the rating); replies can be deleted. */}
        {!(c.mine && !c.parentId) && (
        <Pressable
          onPress={() => actions.onMenu(c)}
          accessibilityRole="button"
          accessibilityLabel={t('report')}
          hitSlop={8}
          style={{ marginLeft: 'auto', paddingHorizontal: 6, paddingVertical: 4 }}
        >
          <T style={{ fontSize: 14, color: colors.faint }}>⋯</T>
        </Pressable>
        )}
        <Pressable
          style={{ paddingVertical: 4, paddingLeft: 4, marginLeft: c.mine && !c.parentId ? 'auto' : 0 }}
          accessibilityRole="button"
          accessibilityState={{ selected: c.likedByMe }}
          onPress={() => (signedIn ? like.mutate({ commentId: c.id, like: !c.likedByMe }) : router.push('/login'))}
        >
          <T style={{ fontSize: 12, color: c.likedByMe ? '#FF5A3C' : colors.faint }}>
            {c.likedByMe ? '♥' : '♡'} {c.likeCount}
          </T>
        </Pressable>
      </View>
      {!!c.body && <T style={{ fontSize: small ? 13.5 : 14, lineHeight: small ? 20 : 22, marginTop: 6, color: colors.body }}>{c.body}</T>}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 5, alignItems: 'center' }}>
        <T style={{ fontSize: 11, color: colors.faint }}>{timeAgo(locale, c.createdAt)}</T>
        {c.edited && <T style={{ fontSize: 11, color: colors.faint }}>{t('edited')}</T>}
        <T style={{ fontSize: 12, color: colors.muted, fontWeight: '700' }} onPress={() => actions.onReply(c)}>
          {t('reply')}
        </T>
      </View>
    </View>
  );
}

/** A top-level comment with its reply thread (first few inline, the rest on demand). */
export function CommentThread({ c, category, actions }: { c: Comment; category: Category; actions: CommentActions }) {
  const { t, colors } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const full = useReplies(c.id, expanded);
  const replies = expanded && full.data ? full.data.items : c.replies;
  return (
    <View style={[s.comment, { borderBottomColor: colors.line }]}>
      <Row c={c} category={category} actions={actions} />
      {replies.length > 0 && (
        <View style={[s.thread, { backgroundColor: colors.soft }]}>
          {replies.map((r) => (
            <Row key={r.id} c={r} category={category} actions={actions} small />
          ))}
          {c.replyCount > c.replies.length && (
            <T style={{ fontSize: 12.5, color: colors.muted, fontWeight: '700' }} onPress={() => setExpanded((e) => !e)}>
              {expanded ? t('replies_hide') : t('replies_more_fmt', { n: c.replyCount })}
            </T>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  comment: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  thread: { marginTop: 10, marginLeft: 26, padding: 10, borderRadius: 12, gap: 12 },
});
