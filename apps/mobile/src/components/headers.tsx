import { LOCALES, LOCALE_LABELS, type Locale } from '@myna/shared';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useUpdateProfileSettings } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';
import { useDrawer } from './Drawer';
import { Logo } from './Logo';
import { Sheet, T, useToast } from './ui';

function RoundButton({ label, onPress, children, badge }: { label: string; onPress: () => void; children: ReactNode; badge?: number }) {
  const { colors } = useSettings();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[s.round, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {children}
      {!!badge && (
        <View style={s.badge}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** §3 Home top bar: ☰ | Logo | search | 🌐 | 🔔 */
export function HomeTopBar({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const { colors, t, contentLangs, update } = useSettings();
  const { signedIn } = useAuth();
  const sync = useUpdateProfileSettings();
  const { open } = useDrawer();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [langOpen, setLangOpen] = useState(false);

  const toggleLang = (l: Locale) => {
    const next = contentLangs.includes(l) ? contentLangs.filter((x) => x !== l) : [...contentLangs, l];
    if (next.length === 0) return toast(t('keep_one_lang'));
    update({ contentLangs: next });
    if (signedIn) sync.mutate({ contentLangs: next });
  };

  return (
    <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
      <RoundButton label={t('open_menu')} onPress={open}>
        <T style={{ fontSize: 17 }}>☰</T>
      </RoundButton>
      <Logo width={86} />
      <View style={[s.search, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={{ fontSize: 13 }}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder={t('search_ph')}
          placeholderTextColor={colors.faint}
          returnKeyType="search"
          style={{ flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0, minWidth: 0 }}
          accessibilityLabel={t('search_ph')}
        />
      </View>
      <RoundButton label={t('content_langs')} onPress={() => setLangOpen(true)} badge={contentLangs.length < LOCALES.length ? contentLangs.length : undefined}>
        <Text style={{ fontSize: 17 }}>🌐</Text>
      </RoundButton>
      <RoundButton label="🔔" onPress={() => toast(t('notif_empty'))}>
        <Text style={{ fontSize: 17 }}>🔔</Text>
      </RoundButton>
      <Sheet visible={langOpen} title={t('content_lang_t')} onClose={() => setLangOpen(false)}>
        <T muted style={{ fontSize: 13, marginBottom: 10 }}>
          {t('content_lang_sub')}
        </T>
        {LOCALES.map((l) => {
          const on = contentLangs.includes(l);
          return (
            <Pressable key={l} onPress={() => toggleLang(l)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[s.langRow, { borderBottomColor: colors.line }]}>
              <T style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{LOCALE_LABELS[l]}</T>
              <View style={[s.check, { borderColor: on ? brand.red : colors.line, backgroundColor: on ? brand.red : 'transparent' }]}>
                {on && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>✓</Text>}
              </View>
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

/** Top bar for the other main tabs: ☰ + title. */
export function TabHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { t } = useSettings();
  const { open } = useDrawer();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
      <RoundButton label={t('open_menu')} onPress={open}>
        <T style={{ fontSize: 17 }}>☰</T>
      </RoundButton>
      <T style={{ fontSize: 20, fontWeight: '900', flex: 1 }}>{title}</T>
      {right}
    </View>
  );
}

/** Stack page header with a back button (Settings, Link Finder, lists…). */
export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8, backgroundColor: colors.bg }]}>
      <RoundButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <T style={{ fontSize: 18, fontWeight: '700' }}>‹</T>
      </RoundButton>
      <T style={{ fontSize: 17, fontWeight: '900', flex: 1 }} numberOfLines={1}>
        {title}
      </T>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  round: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: brand.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderRadius: 19, borderWidth: 1.5, paddingHorizontal: 12, minWidth: 0 },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
