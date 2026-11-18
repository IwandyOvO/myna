import { scaleFor, type PostCard, type RateResult, type Tier } from '@myna/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorText } from '../lib/errors';
import { useRate } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';
import { CrowdRevealView } from './CrowdReveal';
import { Button, Sheet, T, useToast } from './ui';

/** Five tier buttons in the category's own words (shared by the rating sheet and the quick-rate deck). */
export function TierPicker({ post, value, onChange }: { post: PostCard; value: Tier | null; onChange: (t: Tier) => void }) {
  const { colors, locale } = useSettings();
  const scale = scaleFor(post.category, locale);
  return (
    <View style={s.grid}>
      {scale.map((st, i) => {
        const v = (i + 1) as Tier;
        const sel = value === v;
        return (
          <Pressable
            key={i}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={st.label}
            style={[s.opt, { borderColor: sel ? brand.red : colors.line, backgroundColor: sel ? colors.optSel : colors.optbg }]}
          >
            <Text style={{ fontSize: 24 }}>{st.emoji}</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 3, color: colors.ink, textAlign: 'center' }} numberOfLines={2}>
              {st.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** §4.5 rating sheet: pick one of five tiers (required) + optional reason; then reveal how the crowd voted. */
export function RateSheet({ post, visible, onClose }: { post: PostCard; visible: boolean; onClose: () => void }) {
  const { colors, t } = useSettings();
  const toast = useToast();
  const rate = useRate(post.id);
  const editing = !!post.myRating;
  const [tier, setTier] = useState<Tier | null>(post.myRating?.tier ?? null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<RateResult | null>(null);

  // Reset only when the sheet opens — not when the post refreshes after rating (that would hide the reveal).
  useEffect(() => {
    if (visible) {
      setTier(post.myRating?.tier ?? null);
      setReason('');
      setResult(null);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!tier) return;
    rate.mutate(
      { tier, reason, editing },
      {
        onSuccess: (r) => {
          if (editing) toast(t('edit_ok_fmt', { x: r.myRating?.editsLeft ?? 0 }));
          setResult(r);
        },
        onError: (e) => toast(errorText(e, t)),
      },
    );
  };

  if (result) {
    return (
      <Sheet visible={visible} title="" onClose={onClose}>
        <CrowdRevealView post={result} crowd={result.crowd} />
        <View style={{ marginTop: 16 }}>
          <Button label={t('done')} onPress={onClose} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} title={editing ? t('edit_rate_title') : t('rate_title')} onClose={onClose}>
      <T muted style={{ fontSize: 13 }} numberOfLines={2}>
        {post.title}
      </T>
      <TierPicker post={post} value={tier} onChange={setTier} />
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder={editing && post.myRating?.reason ? post.myRating.reason : t('rate_ph')}
        placeholderTextColor={colors.faint}
        multiline
        maxLength={500}
        style={[s.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
      />
      <View style={{ marginTop: 14 }}>
        <Button label={editing ? t('save_changes') : t('submit_rate')} onPress={submit} disabled={!tier} loading={rate.isPending} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 7, marginVertical: 14 },
  opt: { flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 2, alignItems: 'center' },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 11, fontSize: 14, minHeight: 76, textAlignVertical: 'top' },
});
