import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { connectivity } from '../lib/api';
import { useSettings } from '../lib/settings';

/** Thin banner while the API is unreachable; tap to retry everything. */
export function OfflineBanner() {
  const { t } = useSettings();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(connectivity.online);
  useEffect(() => connectivity.subscribe(setOnline), []);
  if (online) return null;
  return (
    <Pressable
      onPress={() => qc.refetchQueries({ type: 'active' })}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 4, left: 16, right: 16, backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, zIndex: 2000 }}
    >
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>📡 {t('offline')} · {t('retry')}</Text>
    </Pressable>
  );
}
