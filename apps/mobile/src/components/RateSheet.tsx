import { scaleFor, type PostCard, type Tier } from '@myna/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiFailure } from '../lib/api';
import { useRate } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';
import { Button, Sheet, T, useToast } from './ui';

/** §4.5 rating sheet: pick one of five tiers (required) + optional reason. Also used for edits. */
export function RateSheet({ post, visible, onClose }: { post: PostCard; visible: boolean; onClose: () => void }) {
  const { colors, t, locale } = useSettings();
  const toast = useToast();
  const rate = useRate(post.id);
  const editing = !!post.myRating;
  const [tier, setTier] = useState<Tier | null>(post.myRating?.tier ?? null);
  const [reason, setReason] = useState('');
  const scale = scaleFor(post.category, locale);

  useEffect(() => {
    if (visible) {
      setTier(post.myRating?.tier ?? null);
      setReason('');
    }
  }, [visible, post.myRating?.tier]);

  const submit = () => {
    if (!tier) return;
    rate.mutate(
      { tier, reason, editing },
      {
        onSuccess: (p) => {
          toast(editing ? t('edit_ok_fmt', { x: p.myRating?.editsLeft ?? 0 }) : t('rate_ok'));
          onClose();
        },
        onError: (e) => toast(e instanceof ApiFailure && e.code === 'edit_limit_reached' ? t('edit_limit') : t('error_generic')),
      },
    );
  };

  return (
    <Sheet visible={visible} title={editing ? t('edit_rate_title') : t('rate_title')} onClose={onClose}>
      <T muted style={{ fontSize: 13 }} numberOfLines={2}>
        {post.title}
      </T>
      <View style={s.grid}>
        {scale.map((st, i) => {
          const value = (i + 1) as Tier;
          const sel = tier === value;
          return (
            <Pressable
              key={i}
              onPress={() => setTier(value)}
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
