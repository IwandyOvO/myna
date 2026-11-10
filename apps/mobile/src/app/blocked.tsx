import { FlatList, Pressable, Text, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { Card, Empty, Loading, T } from '../components/ui';
import { useBlock, useBlocks } from '../lib/queries';
import { useSettings } from '../lib/settings';

export default function Blocked() {
  const { t, colors } = useSettings();
  const q = useBlocks();
  const block = useBlock();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('block_list')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={q.isPending ? <Loading /> : <Empty emoji="🕊️" text={t('nothing_yet')} />}
        renderItem={({ item: u }) => (
          <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 26 }}>{u.avatar}</Text>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800' }}>{u.nickname}</T>
              <T muted style={{ fontSize: 12 }}>
                @{u.handle}
              </T>
            </View>
            <Pressable onPress={() => block.mutate({ userId: u.id, block: false })} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.soft }}>
              <T style={{ fontSize: 13, fontWeight: '700' }}>{t('unblock')}</T>
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}
