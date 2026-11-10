import { router } from 'expo-router';
import { FlatList, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { AvgBadge, TierBadge } from '../../components/post';
import { Card, Empty, Loading, T } from '../../components/ui';
import { useMyRatings } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** "My ratings": each row shows my tier (category scale) next to the post average. */
export default function MyRatings() {
  const { t, colors, locale } = useSettings();
  const q = useMyRatings();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('me_rates')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        ListEmptyComponent={q.isPending ? <Loading /> : <Empty text={t('nothing_yet')} />}
        renderItem={({ item: p }) => (
          <Card onPress={() => router.push(`/post/${p.id}`)} style={{ padding: 14, gap: 8 }}>
            <T style={{ fontWeight: '800', fontSize: 15 }} numberOfLines={2}>
              {p.emoji} {p.title}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TierBadge category={p.category} tier={p.myRating?.tier ?? null} locale={locale} />
              {!!p.myRating?.editedCount && <T style={{ fontSize: 11, color: colors.faint }}>{t('edited')}</T>}
              <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T muted style={{ fontSize: 12 }}>
                  {t('post_avg')}
                </T>
                <AvgBadge post={p} />
              </View>
            </View>
            {!!p.myRating?.reason && <T style={{ fontSize: 13.5, color: colors.body }}>{p.myRating.reason}</T>}
          </Card>
        )}
      />
    </View>
  );
}
