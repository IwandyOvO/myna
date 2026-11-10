import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';

const TABS: Record<string, { icon: string; label: string }> = {
  index: { icon: '🏠', label: 'nav_home' },
  nearby: { icon: '📍', label: 'nav_discover' },
  boards: { icon: '🏆', label: 'nav_rank' },
  me: { icon: '👤', label: 'nav_me' },
};

/** §3 bottom nav: Home / Nearby / (raised + Publish) / Rankings / Me. */
export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, t } = useSettings();
  const { signedIn } = useAuth();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const item = (r: (typeof routes)[number]) => {
    const on = state.routes[state.index]?.key === r.key;
    const meta = TABS[r.name]!;
    return (
      <Pressable
        key={r.key}
        onPress={() => navigateToTab(r.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t(meta.label)}
        style={s.item}
      >
        <Text style={[s.icon, !on && { opacity: 0.55 }]}>{meta.icon}</Text>
        <Text style={[s.label, { color: on ? colors.ink : colors.muted }]}>{t(meta.label)}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[s.bar, { backgroundColor: colors.navbg, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {routes.slice(0, 2).map(item)}
      <View style={s.item}>
        <Pressable
          onPress={() => router.push(signedIn ? '/publish' : '/login')}
          accessibilityRole="button"
          accessibilityLabel={t('pub_head')}
          style={({ pressed }) => [s.pub, { borderColor: colors.card }, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <Text style={s.plus}>+</Text>
        </Pressable>
        <Text style={[s.label, { color: colors.muted }]}>{t('publish')}</Text>
      </View>
      {routes.slice(2).map(item)}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20, lineHeight: 24 },
  label: { fontSize: 10.5, fontWeight: '600' },
  pub: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: brand.red, borderWidth: 4, alignItems: 'center', justifyContent: 'center', marginTop: -26,
    shadowColor: brand.red, shadowOpacity: 0.42, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  plus: { color: '#fff', fontSize: 30, lineHeight: 32, fontWeight: '500' },
});
