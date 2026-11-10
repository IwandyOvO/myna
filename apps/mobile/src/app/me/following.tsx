import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { Card, Empty, ErrorView, Loading, T } from '../../components/ui';
import { useFollowing } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

export default function Following() {
  const { t, colors } = useSettings();
  const q = useFollowing();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('follow_t')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty emoji="👥" text={t('nothing_yet')} />}
        renderItem={({ item: u }) => (
          <Card onPress={() => router.push(`/user/${u.id}`)} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>{u.avatar}</Text>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800' }}>{u.nickname}</T>
              <T muted style={{ fontSize: 12 }}>@{u.handle}</T>
            </View>
            <T style={{ color: colors.faint, fontSize: 17 }}>›</T>
          </Card>
        )}
      />
    </View>
  );
}
