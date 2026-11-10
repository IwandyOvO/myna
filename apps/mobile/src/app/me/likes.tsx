import { timeAgo } from '@myna/shared';
import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { TierBadge } from '../../components/post';
import { Card, Empty, ErrorView, Loading, T } from '../../components/ui';
import { useLikesReceived } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** §5.6 获赞记录: who liked which of my comments. */
export default function Likes() {
  const { t, colors, locale } = useSettings();
  const q = useLikesReceived();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('my_likes_t')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(l, i) => `${l.liker.id}-${l.createdAt}-${i}`}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty emoji="♥" text={t('nothing_yet')} />}
        renderItem={({ item: l }) => (
          <Card onPress={() => router.push(`/post/${l.post.id}`)} style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22 }}>{l.liker.avatar}</Text>
              <T style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>
                <T style={{ fontWeight: '800', fontSize: 13.5 }}>{l.liker.nickname}</T> {t('liked_comment')}
              </T>
              <T muted style={{ fontSize: 11 }}>{timeAgo(locale, l.createdAt)}</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TierBadge category={l.post.category} tier={l.tier} locale={locale} />
              <T muted style={{ fontSize: 12, flex: 1 }} numberOfLines={1}>
                {l.post.title}
              </T>
            </View>
            {!!l.commentBody && (
              <T style={{ fontSize: 13.5, color: colors.body }} numberOfLines={2}>
                “{l.commentBody}”
              </T>
            )}
          </Card>
        )}
      />
    </View>
  );
}
