import { weeklyThemeIndex, type RateResult, type Tier } from '@myna/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { CrowdRevealView } from '../../components/CrowdReveal';
import { TabHeader } from '../../components/headers';
import { PostCardView } from '../../components/post';
import { TierPicker } from '../../components/RateSheet';
import { Card, Empty, ErrorView, Loading, SectionTitle, T, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { errorText } from '../../lib/errors';
import { useDaily, useQuickRate } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

/** Daily ritual: one question for everyone, a streak for showing up, yesterday's result, this week's theme. */
export default function Daily() {
  const { t, colors } = useSettings();
  const { signedIn } = useAuth();
  const toast = useToast();
  const daily = useDaily();
  const rate = useQuickRate();
  const [result, setResult] = useState<RateResult | null>(null);
  const d = daily.data;
  const theme = t(`theme_${weeklyThemeIndex()}`);
  const hoursLeft = d ? Math.max(1, Math.ceil((new Date(d.endsAt).getTime() - Date.now()) / 3_600_000)) : 0;

  const answer = (tier: Tier) => {
    if (!signedIn) return router.push('/login');
    if (!d?.post) return;
    rate.mutate(
      { postId: d.post.id, tier, reason: '' },
      { onSuccess: (r) => { setResult(r); void daily.refetch(); }, onError: (e) => toast(errorText(e, t)) },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title={t('daily_title')} />
      <ScrollView
        contentContainerStyle={{ paddingVertical: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={daily.isRefetching} onRefresh={() => void daily.refetch()} />}
      >
        {daily.isPending ? (
          <Loading />
        ) : daily.isError || !d ? (
          <ErrorView onRetry={() => daily.refetch()} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12 }}>
              <T style={{ fontSize: 17, fontWeight: '900', flex: 1, color: d.streak ? brand.red : colors.ink }}>
                {d.streak ? t('daily_streak_fmt', { n: d.streak }) : t('daily_streak_zero')}
              </T>
              <T muted style={{ fontSize: 12 }}>{t('daily_new_in_fmt', { h: hoursLeft })}</T>
            </View>

            {!d.post ? (
              <Empty emoji="🗓" text={t('daily_none')} />
            ) : result ? (
              <Card style={{ marginHorizontal: 16, padding: 18 }}>
                <CrowdRevealView post={result} crowd={result.crowd} />
              </Card>
            ) : d.answered ? (
              <>
                <T style={{ marginHorizontal: 16, marginBottom: 8, fontWeight: '800', color: '#078043' }}>{t('daily_answered')}</T>
                <PostCardView post={d.post} />
              </>
            ) : (
              <Card style={{ marginHorizontal: 16, padding: 16 }}>
                <Pressable onPress={() => router.push(`/post/${d.post!.id}`)} accessibilityRole="button">
                  <Text style={{ fontSize: 56, textAlign: 'center' }}>{d.post.emoji}</Text>
                  <T style={{ fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: 8 }}>{d.post.title}</T>
                  {!!d.post.body && (
                    <T muted style={{ textAlign: 'center', marginTop: 6 }} numberOfLines={3}>
                      {d.post.body}
                    </T>
                  )}
                </Pressable>
                <TierPicker post={d.post} value={null} onChange={answer} />
                <T muted style={{ fontSize: 12, textAlign: 'center' }}>
                  {t('ratings_fmt', { n: d.post.total })}
                </T>
              </Card>
            )}

            <Card style={{ marginHorizontal: 16, marginTop: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 30 }}>🗓</Text>
              <View style={{ flex: 1 }}>
                <T muted style={{ fontSize: 11, fontWeight: '700' }}>{t('theme_label')}</T>
                <T style={{ fontSize: 16, fontWeight: '900', marginTop: 2 }}>{theme}</T>
              </View>
              <Pressable
                onPress={() => router.push(signedIn ? { pathname: '/publish', params: { theme } } : '/login')}
                accessibilityRole="button"
                style={{ backgroundColor: brand.red, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{t('theme_cta')}</Text>
              </Pressable>
            </Card>

            {d.yesterday && (
              <>
                <View style={{ marginHorizontal: 16 }}>
                  <SectionTitle>{t('daily_yesterday')}</SectionTitle>
                </View>
                <PostCardView post={d.yesterday} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
