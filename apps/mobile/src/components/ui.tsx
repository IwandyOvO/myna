import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../lib/settings';
import { brand, shadow } from '../lib/theme';

export function T({ style, muted, children, numberOfLines, onPress }: { style?: StyleProp<TextStyle>; muted?: boolean; children: ReactNode; numberOfLines?: number; onPress?: () => void }) {
  const { colors } = useSettings();
  return (
    <Text numberOfLines={numberOfLines} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={[{ color: muted ? colors.muted : colors.ink, fontSize: 14 }, style]}>
      {children}
    </Text>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  const { colors } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : colors.card }]}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.bg : colors.sub }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
      {children}
    </ScrollView>
  );
}

export function Seg<V extends string>({ options, value, onChange, small }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; small?: boolean }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.seg, { backgroundColor: colors.seg }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segBtn, small && { paddingVertical: 7 }, on && { backgroundColor: colors.card, ...shadow }]}
          >
            <Text numberOfLines={1} style={{ fontWeight: '800', fontSize: small ? 12.5 : 14, color: on ? colors.ink : colors.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { colors } = useSettings();
  const s = [styles.card, { backgroundColor: colors.card }, style];
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...s, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

export function Button({ label, onPress, disabled, variant = 'primary', loading }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'ghost'; loading?: boolean }) {
  const { colors } = useSettings();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.btn,
        primary
          ? { backgroundColor: disabled ? colors.disabled : brand.red, ...(disabled ? {} : styles.btnShadow) }
          : { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {loading ? <ActivityIndicator color={primary ? '#fff' : colors.ink} /> : <Text style={{ color: primary ? '#fff' : colors.ink, fontSize: 16, fontWeight: '900' }}>{label}</Text>}
    </Pressable>
  );
}

export function Empty({ text, emoji = '🐦' }: { text: string; emoji?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 36, gap: 8 }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <T muted style={{ textAlign: 'center', fontSize: 13 }}>
        {text}
      </T>
    </View>
  );
}

export function Loading() {
  const { colors } = useSettings();
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

export function ErrorView({ onRetry }: { onRetry?: () => void }) {
  const { t } = useSettings();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
      <T muted>{t('error_generic')}</T>
      {onRetry && <Button variant="ghost" label={t('retry')} onPress={onRetry} />}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 }}>
      <T style={{ fontSize: 16, fontWeight: '800', flex: 1 }}>{children}</T>
      {right}
    </View>
  );
}

// ---- bottom sheet ----------------------------------------------------------------

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.mask }} onPress={onClose} accessibilityLabel={t('close')} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: 24 + insets.bottom }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <T style={{ fontSize: 17, fontWeight: '900', flex: 1 }}>{title}</T>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} style={[styles.roundBtn, { backgroundColor: colors.soft }]}>
            <T>✕</T>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

// ---- toast -------------------------------------------------------------------------

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null)), 2000);
    },
    [opacity],
  );
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg !== null && (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite">
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

export const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  seg: { flexDirection: 'row', borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999 },
  card: { borderRadius: 16, overflow: 'hidden', ...shadow },
  btn: { borderRadius: 999, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  btnShadow: { shadowColor: brand.red, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 20, maxHeight: '86%' },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(26,26,26,0.92)', paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999, maxWidth: '86%' },
});
