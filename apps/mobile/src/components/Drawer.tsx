import Constants from 'expo-constants';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { T, useToast } from './ui';

const Ctx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useDrawer = () => useContext(Ctx);

/**
 * §3 left drawer: ~78% width, translucent mask; closes on mask tap, ✕ or left swipe.
 * Link Finder and Settings are pushed as stack pages, so "back" returns to the tab you came from.
 */
export function DrawerHost({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const width = Math.min(Dimensions.get('window').width * 0.78, 302);
  const x = useRef(new Animated.Value(-width)).current;

  const animate = useCallback((to: number, done?: () => void) => Animated.timing(x, { toValue: to, duration: 260, useNativeDriver: true }).start(done), [x]);
  const open = useCallback(() => {
    setVisible(true);
    animate(0);
  }, [animate]);
  const close = useCallback(() => animate(-width, () => setVisible(false)), [animate, width]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -10 && Math.abs(g.dy) < Math.abs(g.dx),
        onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
        onPanResponderRelease: (_, g) => (g.dx < -width / 4 || g.vx < -0.5 ? close() : animate(0)),
      }),
    [x, width, close, animate],
  );

  const value = useMemo(() => ({ open, close }), [open, close]);
  const maskOpacity = x.interpolate({ inputRange: [-width, 0], outputRange: [0, 1] });

  return (
    <Ctx.Provider value={value}>
      {children}
      {visible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: maskOpacity }]}>
            <DrawerMask onPress={close} />
          </Animated.View>
          <Animated.View {...pan.panHandlers} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width, transform: [{ translateX: x }] }}>
            <DrawerContent close={close} />
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  );
}

function DrawerMask({ onPress }: { onPress: () => void }) {
  const { colors, t } = useSettings();
  return <Pressable style={{ flex: 1, backgroundColor: colors.mask }} onPress={onPress} accessibilityLabel={t('close')} />;
}

function DrawerContent({ close }: { close: () => void }) {
  const { colors, t } = useSettings();
  const { me, signedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const go = (path: Parameters<typeof router.push>[0]) => {
    close();
    router.push(path);
  };
  const soon = () => toast(t('coming_soon'));

  const Item = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.item, pressed && { backgroundColor: colors.soft }]}>
      <Text style={s.itemIcon}>{icon}</Text>
      <T style={{ fontSize: 15.5, fontWeight: '700', flex: 1 }}>{label}</T>
      <T style={{ color: colors.faint, fontSize: 17 }}>›</T>
    </Pressable>
  );

  return (
    <View style={[s.drawer, { backgroundColor: colors.card, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 18 }]}>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('close')} style={[s.x, { top: insets.top + 18, backgroundColor: colors.soft }]}>
        <T>✕</T>
      </Pressable>
      <Pressable
        onPress={() => go(signedIn ? '/me' : '/login')}
        accessibilityRole="button"
        style={[s.user, { borderBottomColor: colors.line }]}
      >
        <View style={[s.ava, { backgroundColor: colors.soft }]}>
          <Text style={{ fontSize: 32 }}>{me?.avatar ?? '🐦'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontSize: 17, fontWeight: '900' }} numberOfLines={1}>
            {me?.nickname ?? t('login_t')}
          </T>
          <T muted style={{ fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {me ? `@${me.handle} · ${t('rep')} ${me.reputation}` : t('login_sub')}
          </T>
        </View>
      </Pressable>
      <View style={{ paddingTop: 8 }}>
        <Item icon="🔗" label={t('nav_scan')} onPress={() => go('/link-finder')} />
        <Item icon="⚙️" label={t('settings')} onPress={() => go('/settings')} />
      </View>
      <View style={[s.sep, { backgroundColor: colors.line }]} />
      <Item icon="🏆" label={t('ach_title')} onPress={() => go(signedIn ? '/achievements' : '/login')} />
      <Item icon="⭐" label={t('fav_t')} onPress={soon} />
      <Item icon="🕘" label={t('hist_t')} onPress={soon} />
      <Item icon="📝" label={t('draft_t')} onPress={soon} />
      <T style={{ marginTop: 'auto', paddingHorizontal: 20, fontSize: 12, color: colors.faint }}>
        Myna v{Constants.expoConfig?.version ?? '0.8.0'}
      </T>
    </View>
  );
}

const s = StyleSheet.create({
  drawer: { flex: 1, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 6, height: 0 }, elevation: 16 },
  x: { position: 'absolute', right: 12, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 18, borderBottomWidth: 1 },
  ava: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 20 },
  itemIcon: { fontSize: 21, width: 26, textAlign: 'center' },
  sep: { height: 1, marginVertical: 10, marginHorizontal: 20 },
});
