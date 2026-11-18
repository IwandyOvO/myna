import { router } from 'expo-router';
import { useState } from 'react';
import { type StyleProp, type TextStyle, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useFeatures, useTranslate } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { T } from './ui';

/**
 * Text with a "Translate" link (when the server has translation and the content isn't in your language).
 * Tapping again shows the original.
 */
export function Translatable({ text, show, style, numberOfLines }: { text: string; show: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { t, colors, locale } = useSettings();
  const { signedIn } = useAuth();
  const features = useFeatures();
  const tr = useTranslate();
  const [translated, setTranslated] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const available = show && !!text.trim() && !!features.data?.translate;

  const toggle = () => {
    if (!signedIn) return router.push('/login');
    if (on) return setOn(false);
    if (translated) return setOn(true);
    tr.mutate(
      { text, target: locale },
      {
        onSuccess: (r) => {
          setTranslated(r.text);
          setOn(true);
        },
      },
    );
  };

  return (
    <View>
      <T style={style} numberOfLines={numberOfLines}>
        {on && translated ? translated : text}
      </T>
      {available && (
        <T style={{ fontSize: 12, fontWeight: '700', color: tr.isError ? '#C92A1A' : colors.muted, marginTop: 4 }} onPress={toggle}>
          {tr.isPending ? '…' : tr.isError ? t('translate_failed') : on ? t('translated_show_original') : `🌐 ${t('translate')}`}
        </T>
      )}
    </View>
  );
}
