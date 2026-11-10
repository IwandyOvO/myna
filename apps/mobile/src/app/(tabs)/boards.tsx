import { BOARD_CATEGORIES, BOARD_EMOJI, boardCategoryName, type BoardCategory, type BoardDirection, type BoardPeriod } from '@myna/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { TabHeader } from '../../components/headers';
import { AvgBadge } from '../../components/post';
import { Chip, Empty, ErrorView, Loading, Seg, T } from '../../components/ui';
import { useBoard } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

const MEDALS = ['🥇', '🥈', '🥉'];

/** §6 boards: (monthly | all-time) × (drinks | food | events) × (best | worst) Top 20. Rows open the shared detail page. */
export default function Boards() {
  const { t, locale, colors } = useSettings();
  const [period, setPeriod] = useState<BoardPeriod>('monthly');
  const [cat, setCat] = useState<BoardCategory>('drinks');
  const [dir, setDir] = useState<BoardDirection>('best');
  const q = useBoard(period, cat, dir);
  const b = q.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title={t('rank_title')} />
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <Seg value={period} onChange={setPeriod} options={[{ value: 'monthly', label: t('month') }, { value: 'all', label: t('alltime') }]} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {BOARD_CATEGORIES.map((c) => (
            <Chip key={c} label={`${BOARD_EMOJI[c]} ${boardCategoryName(c, locale)}`} on={cat === c} onPress={() => setCat(c)} />
          ))}
        </View>
        <Seg small value={dir} onChange={setDir} options={[{ value: 'best', label: t('best20') }, { value: 'worst', label: t('worst20') }]} />
        <T muted style={{ fontSize: 12 }}>
          {b?.period === 'monthly' ? `${t('month_meta_a')}${b.daysToSettle}${t('month_meta_b')}` : t('all_meta')}
          {b ? ` · ${t('board_min_fmt', { n: b.minRatings })}` : ''}
        </T>
      </View>
      <FlatList
        data={b?.entries ?? []}
        keyExtractor={(e) => e.post.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}
        ListEmptyComponent={q.isPending ? <Loading /> : q.isError ? <ErrorView onRetry={() => q.refetch()} /> : <Empty emoji="🏆" text={t('board_empty')} />}
        renderItem={({ item: e }) => (
          <Pressable
            onPress={() => router.push(`/post/${e.post.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [s.row, { backgroundColor: colors.card }, pressed && { opacity: 0.85 }]}
          >
            <Text style={[s.rank, { color: e.rank <= 3 ? brand.red : colors.muted }]}>{e.rank <= 3 ? MEDALS[e.rank - 1] : e.rank}</Text>
            <View style={[s.thumb, { backgroundColor: colors.soft }]}>
              <Text style={{ fontSize: 22 }}>{e.post.emoji}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontWeight: '800', fontSize: 14.5 }} numberOfLines={1}>
                {e.post.title}
              </T>
              <T muted style={{ fontSize: 12, marginTop: 2 }}>
                {e.total}
                {t('reviews_unit')}
              </T>
            </View>
            <AvgBadge post={{ avg: e.avg, total: e.total, locked: false }} />
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14 },
  rank: { width: 28, textAlign: 'center', fontSize: 16, fontWeight: '900' },
  thumb: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
