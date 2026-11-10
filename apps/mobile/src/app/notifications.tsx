import { notificationText, timeAgo, type Notification } from '@myna/shared';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { Card, Empty, ErrorView, Loading, T } from '../components/ui';
import { useMarkAllRead, useNotifications } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';

const ICON: Record<Notification['type'], string> = { reply: '💬', like: '♥', follow: '👤', badge: '🏅', season: '🏆' };

/** In-app notification center (also where push notifications land). Opening it marks everything read. */
export default function Notifications() {
  const { t, colors, locale } = useSettings();
  const q = useNotifications();
  const markAll = useMarkAllRead();
  const unread = q.data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) markAll.mutate();
  }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('notif_title')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty emoji="🔔" text={t('notif_empty')} />}
        renderItem={({ item: n }) => {
          const msg = notificationText(locale, n.type, n.actor?.nickname ?? null, n.data);
          return (
            <Card onPress={() => router.push(n.url as never)} style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={[s.icon, { backgroundColor: colors.soft }]}>
                <Text style={{ fontSize: 18 }}>{n.actor?.avatar ?? ICON[n.type]}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={{ fontWeight: n.read ? '600' : '900', fontSize: 14 }} numberOfLines={2}>
                  {ICON[n.type]} {msg.title}
                </T>
                {!!msg.body && (
                  <T style={{ fontSize: 13, color: colors.body, marginTop: 3 }} numberOfLines={2}>
                    {msg.body}
                  </T>
                )}
                {n.postTitle && n.type !== 'season' && (
                  <T muted style={{ fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                    {n.postTitle}
                  </T>
                )}
                <T style={{ fontSize: 11, color: colors.faint, marginTop: 4 }}>{timeAgo(locale, n.createdAt)}</T>
              </View>
              {!n.read && <View style={s.dot} />}
            </Card>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: brand.red, marginTop: 6 },
});
