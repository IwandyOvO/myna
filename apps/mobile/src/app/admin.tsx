import { timeAgo, type ReportItem } from '@myna/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { Card, Empty, ErrorView, Loading, T, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useSettings } from '../lib/settings';

/** Moderation console for admins: open reports grouped by post/comment (App Store 1.2). */
export default function Admin() {
  const { t, colors, locale } = useSettings();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-reports'], queryFn: () => api<{ items: ReportItem[] }>('GET', '/admin/reports') });
  const act = useMutation({
    mutationFn: async (v: { item: ReportItem; action: 'remove' | 'restore' | 'dismiss' | 'ban' }) => {
      if (v.action === 'ban') {
        await api('PUT', `/admin/users/${v.item.author.id}/ban`);
        await api('POST', '/admin/reports/resolve', { targetType: v.item.targetType, targetId: v.item.targetId, action: 'remove' });
      } else await api('POST', '/admin/reports/resolve', { targetType: v.item.targetType, targetId: v.item.targetId, action: v.action });
    },
    onSuccess: () => {
      toast(t('done'));
      qc.invalidateQueries();
    },
    onError: () => toast(t('error_generic')),
  });

  const Btn = ({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.btn, { backgroundColor: danger ? '#FFE8E2' : colors.soft }]}>
      <Text style={{ fontSize: 12.5, fontWeight: '800', color: danger ? '#C92A1A' : colors.ink }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('admin_title')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(i) => i.targetType + i.targetId}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty emoji="✅" text={t('admin_empty')} />}
        renderItem={({ item }) => (
          <Card style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={{ fontWeight: '900', color: '#C92A1A' }}>{t('reporters_fmt', { n: item.reporters })}</T>
              {item.status !== 'active' && (
                <View style={[s.tag, { backgroundColor: colors.soft }]}>
                  <T style={{ fontSize: 11, fontWeight: '700' }}>{item.status === 'hidden' ? t('status_hidden') : t('status_removed')}</T>
                </View>
              )}
              <T muted style={{ fontSize: 11, marginLeft: 'auto' }}>{timeAgo(locale, item.lastReportedAt)}</T>
            </View>
            <T muted style={{ fontSize: 12 }}>
              {Object.entries(item.reasons)
                .map(([r, n]) => `${t(`report_${r}`)} ×${n}`)
                .join(' · ')}
            </T>
            <T style={{ fontSize: 14, color: colors.body }} numberOfLines={4} onPress={() => router.push(`/post/${item.postId}`)}>
              {item.targetType === 'comment' ? '💬 ' : '📝 '}
              {item.text}
            </T>
            <T muted style={{ fontSize: 12 }} onPress={() => router.push(`/user/${item.author.id}`)}>
              {item.author.avatar} {item.author.nickname} @{item.author.handle}
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <Btn label={t('admin_remove')} danger onPress={() => act.mutate({ item, action: 'remove' })} />
              {item.status === 'hidden' && <Btn label={t('admin_restore')} onPress={() => act.mutate({ item, action: 'restore' })} />}
              <Btn label={t('admin_dismiss')} onPress={() => act.mutate({ item, action: 'dismiss' })} />
              <Btn label={t('admin_ban')} danger onPress={() => act.mutate({ item, action: 'ban' })} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  btn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  tag: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
});
