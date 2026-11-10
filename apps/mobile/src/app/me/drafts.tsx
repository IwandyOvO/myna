import { CATEGORY_EMOJI, categoryName, timeAgo } from '@myna/shared';
import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { Card, Empty, ErrorView, Loading, T } from '../../components/ui';
import { useDeleteDraft, useDrafts } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** §5.6 drafts: tap to continue on the publish page. */
export default function Drafts() {
  const { t, colors, locale } = useSettings();
  const q = useDrafts();
  const del = useDeleteDraft();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('draft_t')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty emoji="📝" text={t('nothing_yet')} />}
        renderItem={({ item: d }) => (
          <Card onPress={() => router.push({ pathname: '/publish', params: { draft: d.id } })} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>{d.payload.emoji ?? (d.payload.category ? CATEGORY_EMOJI[d.payload.category] : '📝')}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
                {d.payload.title?.trim() || t('draft_untitled')}
              </T>
              <T muted style={{ fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                {d.payload.category ? `${categoryName(d.payload.category, locale)} · ` : ''}
                {timeAgo(locale, d.updatedAt)} · {t('draft_sub')}
              </T>
            </View>
            <Pressable onPress={() => del.mutate(d.id)} accessibilityRole="button" accessibilityLabel={t('draft_delete')} hitSlop={8}>
              <T style={{ color: colors.faint, fontSize: 13 }}>{t('draft_delete')}</T>
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}
