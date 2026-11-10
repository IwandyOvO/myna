import type { Badge } from '@myna/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { ErrorView, Loading, Sheet, T } from '../components/ui';
import { useBadges } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';

/** §5.7 badge wall (11 badges). Limited-time challenges and the leaderboard ship in phase 2. */
export default function Achievements() {
  const { t, colors, locale } = useSettings();
  const q = useBadges();
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
                ? `${t('badge_unlocked')}${new Date(sel.unlockedAt).toLocaleDateString(locale)}`
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
});
