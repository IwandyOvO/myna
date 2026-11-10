import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TabHeader } from '../../components/headers';
import { Button, Card, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useBadges, useWeekly } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));

/** §5.6 Me: profile card with reputation, tappable stats, badge showcase, weekly report, quick access grid. */
export default function MeTab() {
  const { t, colors } = useSettings();
  const { me, signedIn } = useAuth();
  const badges = useBadges();
  const week = useWeekly();

  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TabHeader title={t('nav_me')} />
        <View style={{ padding: 24, gap: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 56 }}>🐦</Text>
          <T style={{ fontSize: 18, fontWeight: '900' }}>{t('login_t')}</T>
          <T muted style={{ textAlign: 'center' }}>
            {t('login_sub')}
          </T>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label={t('login')} onPress={() => router.push('/login')} />
          </View>
        </View>
      </View>
    );
  }

  const unlocked = badges.data?.items.filter((b) => b.unlockedAt) ?? [];
  const total = badges.data?.items.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title={t('nav_me')} right={<T muted onPress={() => router.push('/settings')}>⚙️</T>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card style={{ padding: 18 }}>
          <Pressable onPress={() => router.push('/me/edit')} accessibilityRole="button" accessibilityLabel={t('edit_profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[s.ava, { backgroundColor: colors.soft }]}>
              <Text style={{ fontSize: 36 }}>{me?.avatar ?? '🐦'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontSize: 19, fontWeight: '900' }}>{me?.nickname ?? '…'}</T>
              <T muted style={{ fontSize: 12, marginTop: 3 }}>
                @{me?.handle} · ✏️ {t('edit_profile')}
              </T>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '900', color: brand.red }}>{me?.reputation ?? '–'}</Text>
              <T muted style={{ fontSize: 11 }}>
                {t('rep')}
              </T>
            </View>
          </Pressable>
          <T muted style={{ fontSize: 11.5, marginTop: 10 }}>
            {t('rep_note')}
          </T>
          <View style={[s.stats, { borderTopColor: colors.line }]}>
            {[
              { n: me?.stats.posts ?? 0, label: t('stat_posts'), go: () => router.push('/me/posts') },
              { n: me?.stats.ratings ?? 0, label: t('stat_rates'), go: () => router.push('/me/ratings') },
              { n: me?.stats.likes ?? 0, label: t('stat_likes'), go: () => router.push('/me/likes') },
            ].map((x) => (
              <Pressable key={x.label} onPress={x.go} accessibilityRole="button" style={s.stat}>
                <T style={{ fontSize: 20, fontWeight: '900' }}>{fmt(x.n)}</T>
                <T muted style={{ fontSize: 12, marginTop: 2 }}>
                  {x.label}
                </T>
              </Pressable>
            ))}
          </View>
        </Card>

        <SectionTitle right={<T muted style={{ fontSize: 12 }}>{t('unlocked_fmt', { x: unlocked.length, y: total })}</T>}>{t('my_badges')}</SectionTitle>
        <Card onPress={() => router.push('/achievements')} style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          {unlocked.slice(0, 4).map((b) => (
            <View key={b.key} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 30 }}>{b.icon}</Text>
              <T style={{ fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                {b.name}
              </T>
            </View>
          ))}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T style={{ fontSize: 18, fontWeight: '900', color: brand.red }}>+{Math.max(0, total - Math.min(4, unlocked.length))}</T>
            <T muted style={{ fontSize: 11, marginTop: 4 }}>
              {t('all_badges')}
            </T>
          </View>
        </Card>

        <SectionTitle>{t('weekly_title')}</SectionTitle>
        <Card style={{ padding: 16, flexDirection: 'row' }}>
          {[
            { n: week.data?.ratings ?? 0, label: t('weekly_rates') },
            { n: week.data?.newBadges ?? 0, label: t('new_badges') },
            { n: week.data ? `${week.data.reputationDelta >= 0 ? '+' : ''}${week.data.reputationDelta}` : '0', label: t('rep_change') },
          ].map((x) => (
            <View key={x.label} style={{ flex: 1, alignItems: 'center' }}>
              <T style={{ fontSize: 22, fontWeight: '900' }}>{x.n}</T>
              <T muted style={{ fontSize: 11.5, marginTop: 3, textAlign: 'center' }}>
                {x.label}
              </T>
            </View>
          ))}
        </Card>

        <SectionTitle>{t('freq_title')}</SectionTitle>
        <Card style={{ flexDirection: 'row', paddingVertical: 14 }}>
          {(
            [
              { icon: '⭐', label: t('fav_t'), to: '/me/favorites' },
              { icon: '🕘', label: t('hist_t'), to: '/me/history' },
              { icon: '📝', label: t('draft_t'), to: '/me/drafts' },
              { icon: '👥', label: t('follow_t'), to: '/me/following' },
            ] as const
          ).map((x) => (
            <Pressable key={x.label} onPress={() => router.push(x.to)} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 24 }}>{x.icon}</Text>
              <T style={{ fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                {x.label}
              </T>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  ava: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center' },
});
