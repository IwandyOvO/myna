import { CATEGORY_EMOJI, categoryName, type PostCard, type RateResult, type Tier } from '@myna/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CrowdRevealView } from '../../components/CrowdReveal';
import { TabHeader } from '../../components/headers';
import { TierPicker } from '../../components/RateSheet';
import { Button, Card, Empty, ErrorView, Loading, T, useToast } from '../../components/ui';
import { mediaUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorText } from '../../lib/errors';
import { useDeck, useQuickRate } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

/**
 * Quick rate: one card at a time, one tap to rate, then an instant "you vs the crowd" reveal.
 * Lowest-effort way to take part — and it fills the database with votes.
 */
export default function Play() {
  const { t, colors, locale } = useSettings();
  const { signedIn } = useAuth();
  const toast = useToast();
  const deck = useDeck(signedIn);
  const rate = useQuickRate();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<RateResult | null>(null);
  const queue = useMemo(() => (deck.data?.items ?? []).filter((p) => !skipped.has(p.id) && !done.has(p.id)), [deck.data, skipped, done]);
  const card: PostCard | undefined = queue[0];

  const next = () => {
    setResult(null);
    setReason('');
    // Ran out: fetch a fresh batch (the server only returns posts you haven't rated).
    if (queue.length <= 1) {
      setSkipped(new Set());
      void deck.refetch();
    }
  };
  const pick = (tier: Tier) => {
    if (!card || rate.isPending) return;
    rate.mutate(
      { postId: card.id, tier, reason: reason.trim() },
      {
        onSuccess: (r) => {
          setDone((d) => new Set(d).add(card.id));
          setResult(r);
        },
        onError: (e) => toast(errorText(e, t)),
      },
    );
  };

  const header = <TabHeader title={t('deck_title')} right={done.size ? <T muted style={{ fontSize: 12 }}>{t('deck_count_fmt', { n: done.size })}</T> : undefined} />;

  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {header}
        <View style={{ padding: 24, gap: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 56 }}>🎴</Text>
          <T style={{ fontSize: 18, fontWeight: '900' }}>{t('deck_sub')}</T>
          <View style={{ alignSelf: 'stretch' }}>
            <Button label={t('deck_login')} onPress={() => router.push('/login')} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {result ? (
            <Card style={{ padding: 18 }}>
              <T muted style={{ fontSize: 13, textAlign: 'center' }} numberOfLines={2}>
                {result.emoji} {result.title}
              </T>
              <CrowdRevealView post={result} crowd={result.crowd} />
              <View style={{ gap: 10, marginTop: 16 }}>
                <Button label={`${t('ob_next')} →`} onPress={next} />
                <Button variant="ghost" label={t('deck_open')} onPress={() => router.push(`/post/${result.id}`)} />
              </View>
            </Card>
          ) : deck.isPending || (deck.isFetching && !card) ? (
            <Loading />
          ) : deck.isError ? (
            <ErrorView onRetry={() => deck.refetch()} />
          ) : !card ? (
            <Empty emoji="🎉" text={t('deck_empty')} />
          ) : (
            <Card style={{ overflow: 'hidden' }}>
              <View style={[s.cover, { backgroundColor: colors.soft }]}>
                {card.imageUrls[0] ? (
                  <Image source={{ uri: mediaUrl(card.imageUrls[0]) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                ) : (
                  <Text style={{ fontSize: 84 }}>{card.emoji || CATEGORY_EMOJI[card.category]}</Text>
                )}
                <View style={[s.cat, { backgroundColor: colors.card }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.sub }}>{categoryName(card.category, locale)}</Text>
                </View>
              </View>
              <View style={{ padding: 16 }}>
                <T style={{ fontSize: 20, fontWeight: '900', lineHeight: 27 }}>{card.title}</T>
                {!!card.body && (
                  <T muted style={{ fontSize: 14, marginTop: 6, lineHeight: 20 }} numberOfLines={3}>
                    {card.body}
                  </T>
                )}
                <T muted style={{ fontSize: 12, marginTop: 8 }}>
                  {card.total ? t('ratings_fmt', { n: card.total }) : t('first_rate_card')}
                </T>
                <TierPicker post={card} value={null} onChange={pick} />
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder={t('deck_reason_ph')}
                  placeholderTextColor={colors.faint}
                  maxLength={500}
                  style={[s.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
                />
                <Pressable
                  onPress={() => {
                    setSkipped((x) => new Set(x).add(card.id));
                    setReason('');
                    if (queue.length <= 1) void deck.refetch();
                  }}
                  accessibilityRole="button"
                  style={{ alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20, marginTop: 6 }}
                >
                  <T style={{ fontWeight: '800', color: colors.muted }}>{t('deck_skip')} ⏭</T>
                </Pressable>
                {rate.isPending && <T style={{ textAlign: 'center', color: brand.red }}>…</T>}
              </View>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  cover: { height: 200, alignItems: 'center', justifyContent: 'center' },
  cat: { position: 'absolute', top: 12, left: 12, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});
