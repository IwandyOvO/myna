import { Sentry } from '../lib/sentry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawerHost } from '../components/Drawer';
import { OfflineBanner } from '../components/OfflineBanner';
import { Onboarding } from '../components/Onboarding';
import { CrashScreen } from '../components/CrashScreen';

export { CrashScreen as ErrorBoundary };
import { ToastProvider } from '../components/ui';
import { apiSession } from '../lib/api';
import { onNotificationTap } from '../lib/push';
import { AuthProvider } from '../lib/auth';
import { SettingsProvider, useSettings } from '../lib/settings';

function Shell() {
  const { colors, isDark, locale, ready } = useSettings();
  useEffect(() => apiSession.setLocale(locale), [locale]);
  useEffect(() => (ready ? onNotificationTap((url) => router.push(url as never)) : undefined), [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <DrawerHost>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="publish" options={{ presentation: 'modal' }} />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        </Stack>
      </DrawerHost>
      <OfflineBanner />
      <Onboarding />
    </View>
  );
}

function RootLayout() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <SettingsProvider>
          <AuthProvider>
            <ToastProvider>
              <Shell />
            </ToastProvider>
          </AuthProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap catches render errors and measures app start.
export default Sentry.wrap(RootLayout);
