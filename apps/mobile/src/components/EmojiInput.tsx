import { isSingleEmoji } from '@myna/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';
import { T } from './ui';

/**
 * "Or type any emoji": a small field next to the preset grid. Accepts exactly one emoji
 * (skin tones, ZWJ sequences and flags included); anything else shows a hint and is ignored.
 */
export function EmojiInput({ value, presets, onChange }: { value: string | null; presets: string[]; onChange: (e: string) => void }) {
  const { t, colors } = useSettings();
  const custom = value && !presets.includes(value) ? value : '';
  const [text, setText] = useState(custom);
  const [bad, setBad] = useState(false);
  // A preset was tapped: the typed emoji is no longer the selection.
  useEffect(() => {
    if (value && presets.includes(value)) {
      setText('');
      setBad(false);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (raw: string) => {
    // Keep only what was just typed: replacing the field's content is the natural gesture on phones.
    const next = raw.startsWith(text) && text ? raw.slice(text.length) : raw;
    const v = next.trim();
    setText(v);
    if (!v) return setBad(false);
    if (isSingleEmoji(v)) {
      setBad(false);
      onChange(v);
    } else setBad(true);
  };
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput
          value={text}
          onChangeText={change}
          placeholder="🙂"
          placeholderTextColor={colors.faint}
          accessibilityLabel={t('emoji_custom')}
          style={[s.box, { borderColor: custom ? brand.red : colors.line, backgroundColor: colors.card, color: colors.ink }]}
        />
        <T muted style={{ fontSize: 12.5, flex: 1 }}>
          {bad ? t('emoji_invalid') : t('emoji_custom')}
        </T>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: 56, height: 44, borderRadius: 12, borderWidth: 2, textAlign: 'center', fontSize: 22, paddingVertical: 0 },
});
