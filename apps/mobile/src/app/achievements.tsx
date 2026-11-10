import type { Badge } from '@myna/shared';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { ErrorView, Loading, Sheet, T } from '../components/ui';
import { useBadges, useChallenge, useLeaderboard } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';

/** §5.7 badge wall (11 badges). Limited-time challenges and the leaderboard ship in phase 2. */
export default function Achievements() {
  const { t, colors } = useSettings();
  const q = useBadges();
  const ch = useChallenge();
  const lb = useLeaderboard();
  const [sel, setSel] = useState<Badge | null>(null);
  const items = q.data?.items ?? [];
  const unlocked = items.filter((b) => b.unlockedAt).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('ach_title')} right={<T muted style={{ fontSize: 13 }}>{unlocked}/{items.length}</T>} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <T muted style={{ fontSize: 12.5, marginBottom: 12 }}>
            {t('ach_note')}
          </T>
          <View style={s.grid}>
            {items.map((b) => {
              const on = !!b.unlockedAt;
              return (
                <Pressable key={b.key} onPress={() => setSel(b)} accessibilityRole="button" style={[s.cell, { backgroundColor: colors.card }]}>
                  <Text style={[{ fontSize: 34 }, !on && { opacity: 0.3 }]}>{b.icon}</Text>
                  <T style={{ fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 6 }} numberOfLines={2}>
                    {b.name}
                  </T>
                  {!on && (
                    <View style={[s.track, { backgroundColor: colors.track }]}>
                      <View style={{ width: `${(b.progress.current / b.progress.target) * 100}%`, height: '100%', backgroundColor: brand.red }} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {ch.data && (
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <T style={{ fontWeight: '900', fontSize: 15 }}>{t('chal_title')} · {t('chal_name')}</T>
              <T muted style={{ fontSize: 13, marginTop: 4 }}>{t('chal_desc')}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <View style={[s.track, { flex: 1, marginTop: 0, height: 8, backgroundColor: colors.track }]}>
                  <View style={{ width: `${(ch.data.current / ch.data.target) * 100}%`, height: '100%', backgroundColor: ch.data.done ? '#0CA678' : brand.red }} />
                </View>
                <T style={{ fontWeight: '800', fontSize: 13 }}>
                  {ch.data.done ? '✓ ' : ''}
                  {ch.data.current}/{ch.data.target}
                </T>
              </View>
            </View>
          )}

          {!!lb.data?.items.length && (
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <T style={{ fontWeight: '900', fontSize: 15, marginBottom: 6 }}>{t('ach_rank_t')}</T>
              {lb.data.items.map((r) => (
                <Pressable key={r.user.id} onPress={() => router.push(`/user/${r.user.id}`)} accessibilityRole="button" style={[s.lbRow, { borderTopColor: colors.line }]}>
                  <T style={{ width: 26, fontWeight: '900', color: r.rank <= 3 ? brand.red : colors.muted }}>{r.rank}</T>
                  <Text style={{ fontSize: 20 }}>{r.user.avatar}</Text>
                  <T style={{ flex: 1, fontWeight: r.isMe ? '900' : '600' }} numberOfLines={1}>
                    {r.user.nickname}
                    {r.isMe ? ` (${t('my_name')})` : ''}
                  </T>
                  <T muted style={{ fontSize: 12 }}>🏅 {r.badges} · {t('rep')} {r.reputation}</T>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <Sheet visible={!!sel} title={sel ? `${sel.icon} ${sel.name}` : ''} onClose={() => setSel(null)}>
        {sel && (
          <View style={{ gap: 8, paddingVertical: 8 }}>
            <T style={{ color: colors.body }}>{sel.desc}</T>
            <T muted style={{ fontSize: 13 }}>
              {t('badge_cond_s')}: {sel.cond}
            </T>
            <T style={{ fontWeight: '800', color: sel.unlockedAt ? '#078043' : colors.muted }}>
              {sel.unlockedAt
                ? `${t('badge_unlocked')}${sel.unlockedAt.slice(0, 10)}`
                : `${t('badge_progress')}: ${sel.progress.current}/${sel.progress.target}`}
            </T>
          </View>
        )}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31%', flexGrow: 1, maxWidth: '32%', alignItems: 'center', padding: 12, borderRadius: 14 },
  track: { height: 5, borderRadius: 99, overflow: 'hidden', alignSelf: 'stretch', marginTop: 8 },
  card: { marginTop: 16, padding: 16, borderRadius: 16 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
