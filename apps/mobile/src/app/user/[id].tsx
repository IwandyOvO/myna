import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { PostCardView } from '../../components/post';
import { Card, Empty, ErrorView, Loading, T, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useFollow, useProfile } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

/** Public profile: avatar, reputation, counts, follow button, their posts. */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, colors } = useSettings();
  const { signedIn } = useAuth();
  const toast = useToast();
  const q = useProfile(id);
  const follow = useFollow(id);
  const p = q.data;

  const toggle = () => {
    if (!signedIn) return router.push('/login');
    const on = !p?.followedByMe;
    follow.mutate(on, { onSuccess: () => toast(on ? t('followed_toast') : t('unfollowed_toast')) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={p?.user.nickname ?? ''} />
      {q.isPending ? (
        <Loading />
      ) : q.isError || !p ? (
        <ErrorView onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={p.posts}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => <PostCardView post={item} />}
          ListHeaderComponent={
            <Card style={{ margin: 16, padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={[s.ava, { backgroundColor: colors.soft }]}>
                  <Text style={{ fontSize: 34 }}>{p.user.avatar}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 18, fontWeight: '900' }}>{p.user.nickname}</T>
                  <T muted style={{ fontSize: 12, marginTop: 3 }}>
                    @{p.user.handle} · {t('rep')} {p.reputation}
                  </T>
                </View>
                {!p.isMe && (
                  <Pressable
                    onPress={toggle}
                    accessibilityRole="button"
                    style={[s.follow, p.followedByMe ? { backgroundColor: colors.soft } : { backgroundColor: brand.red }]}
                  >
                    <Text style={{ fontWeight: '800', fontSize: 13, color: p.followedByMe ? colors.muted : '#fff' }}>{p.followedByMe ? t('followed') : t('follow')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={[s.stats, { borderTopColor: colors.line }]}>
                {[
                  [p.stats.posts, t('stat_posts')],
                  [p.stats.ratings, t('stat_rates')],
                  [p.stats.followers, t('followers')],
                  [p.stats.following, t('following_n')],
                ].map(([n, label]) => (
                  <View key={String(label)} style={{ flex: 1, alignItems: 'center' }}>
                    <T style={{ fontSize: 18, fontWeight: '900' }}>{n}</T>
                    <T muted style={{ fontSize: 11.5, marginTop: 2 }}>{label}</T>
                  </View>
                ))}
              </View>
            </Card>
          }
          ListEmptyComponent={<Empty text={t('nothing_yet')} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  ava: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  follow: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
  stats: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
