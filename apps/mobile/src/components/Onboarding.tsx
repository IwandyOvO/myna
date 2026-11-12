import { scaleFor } from '@myna/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../lib/settings';
import { prefs } from '../lib/storage';
import { brand } from '../lib/theme';
import { Logo } from './Logo';
import { Button, T } from './ui';

const KEY = 'myna.onboarded.v1';

/** First-launch intro: what Myna is, category scales, blind ratings & charts. Shown once. */
export function Onboarding() {
  const { t, colors, locale } = useSettings();
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    prefs.get<boolean>(KEY).then((done) => setShow(!done));
  }, []);
  if (!show) return null;
  const finish = () => {
    void prefs.set(KEY, true);
    setShow(false);
  };

  const drinks = scaleFor('drinks', locale);
  const slides = [
    { art: <Logo variant="mark" width={140} />, title: t('ob1_t'), body: t('ob1_b') },
    {
      art: (
        <View style={s.scale}>
          {drinks.map((x, i) => (
            <View key={i} style={[s.tier, { backgroundColor: colors.card, borderColor: i === 4 ? brand.red : colors.line }]}>
              <Text style={{ fontSize: 26 }}>{x.emoji}</Text>
              <T style={{ fontSize: 10.5, fontWeight: '700', textAlign: 'center', marginTop: 4 }} numberOfLines={2}>
                {x.label}
              </T>
            </View>
          ))}
        </View>
      ),
      title: t('ob2_t'),
      body: t('ob2_b'),
    },
    { art: <Text style={{ fontSize: 88 }}>🔒🏆</Text>, title: t('ob3_t'), body: t('ob3_b') },
  ];
  const slide = slides[step]!;
  const last = step === slides.length - 1;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 3000, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <Pressable onPress={finish} accessibilityRole="button" style={{ alignSelf: 'flex-end', padding: 16 }}>
        <T muted style={{ fontWeight: '700' }}>{t('ob_skip')}</T>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 }}>
        <View style={{ minHeight: 150, alignItems: 'center', justifyContent: 'center' }}>{slide.art}</View>
        <T style={{ fontSize: 26, fontWeight: '900', textAlign: 'center' }}>{slide.title}</T>
        <T style={{ fontSize: 15, lineHeight: 23, textAlign: 'center', color: colors.body }}>{slide.body}</T>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
        {slides.map((_, i) => (
          <View key={i} style={[s.dot, { backgroundColor: i === step ? brand.red : colors.line, width: i === step ? 22 : 8 }]} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 24 }}>
        <Button label={last ? t('ob_start') : t('ob_next')} onPress={() => (last ? finish() : setStep(step + 1))} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  scale: { flexDirection: 'row', gap: 6 },
  tier: { width: 58, borderWidth: 2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 2, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
});
