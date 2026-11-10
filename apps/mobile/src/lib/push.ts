import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { secrets } from './storage';

const TOKEN_KEY = 'myna.pushToken';

// Show banners for notifications that arrive while the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** EAS project id: env override, then app config (filled in by `eas init`). */
function projectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export type PushResult = 'registered' | 'denied' | 'unsupported' | 'not_configured' | 'failed';

/**
 * Asks for permission (once — iOS never shows the prompt again) and registers this device's
 * Expo push token with the API. Safe to call on every launch.
 */
export async function registerForPush(): Promise<PushResult> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Myna', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const id = projectId();
    if (!id) return 'not_configured';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    await api('POST', '/me/push-tokens', { token, platform: Platform.OS });
    await secrets.set(TOKEN_KEY, token);
    return 'registered';
  } catch {
    return 'failed';
  }
}

/** On sign-out: stop pushes for the previous account on this device. */
export async function unregisterPush(): Promise<void> {
  const token = await secrets.get(TOKEN_KEY);
  if (!token) return;
  await api('DELETE', '/me/push-tokens', { token }).catch(() => {});
  await secrets.set(TOKEN_KEY, null);
}

/** Calls `open(url)` when the user taps a notification (including the one that launched the app). */
export function onNotificationTap(open: (url: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const handle = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) open(url);
  };
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
