import { resolveLocale, translate } from '@myna/shared';
import { getLocales } from 'expo-localization';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { brand, dark, light } from '../lib/theme';

/**
 * Route error boundary (expo-router `ErrorBoundary` export). Deliberately independent of app
 * context/providers — they may be what crashed. Uses the system language and colour scheme.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const c = useColorScheme() === 'dark' ? dark : light;
  const l = resolveLocale(getLocales()[0]?.languageTag);
  const t = (k: string) => translate(l, k);
  if (__DEV__) console.error(error);
  const btn = { paddingVertical: 13, paddingHorizontal: 22, borderRadius: 999, alignItems: 'center' as const };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Text style={{ fontSize: 48 }}>🐦</Text>
      <Text style={{ fontSize: 18, fontWeight: '900', color: c.ink, textAlign: 'center' }}>{t('crash_title')}</Text>
      <Text style={{ fontSize: 14, color: c.muted, textAlign: 'center' }}>{t('crash_body')}</Text>
      {__DEV__ && (
        <Text style={{ fontSize: 11, color: c.faint, textAlign: 'center' }} numberOfLines={4}>
          {error.message}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Pressable onPress={retry} accessibilityRole="button" style={[btn, { backgroundColor: brand.red }]}>
          <Text style={{ color: '#fff', fontWeight: '900' }}>{t('retry')}</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/')} accessibilityRole="button" style={[btn, { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.line }]}>
          <Text style={{ color: c.ink, fontWeight: '800' }}>{t('home')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
