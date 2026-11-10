import type { AuthResponse } from '@myna/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useSettings } from '../lib/settings';
import { useToast } from './ui';

WebBrowser.maybeCompleteAuthSession();

/**
 * Client IDs come from EXPO_PUBLIC_* env vars. A provider without configuration
 * renders a button that explains it is not set up yet — the provider SDK hooks
 * throw when their client ID is missing, so they are only mounted when configured.
 */
const env = {
  googleIos: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  googleAndroid: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  googleWeb: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  facebook: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
};
const googleConfigured = !!(Platform.select({ ios: env.googleIos, android: env.googleAndroid, default: env.googleWeb }));

type Done = (r: AuthResponse) => void;

function Btn({ label, icon, onPress, disabled, dark }: { label: string; icon: string; onPress: () => void; disabled?: boolean; dark?: boolean }) {
  const { colors } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.btn,
        dark ? { backgroundColor: colors.ink } : { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {!!icon && <Text style={{ fontSize: 16, color: dark ? colors.bg : colors.ink, fontWeight: '900' }}>{icon}</Text>}
      <Text style={{ fontSize: 15, fontWeight: '700', color: dark ? colors.bg : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function GoogleButton({ onDone, onError }: { onDone: Done; onError: () => void }) {
  const { t } = useSettings();
  const [req, res, prompt] = Google.useIdTokenAuthRequest({ iosClientId: env.googleIos, androidClientId: env.googleAndroid, webClientId: env.googleWeb });
  useEffect(() => {
    if (res?.type !== 'success') return;
    const idToken = res.params.id_token;
    if (!idToken) return onError();
    api<AuthResponse>('POST', '/auth/google', { idToken }).then(onDone, onError);
  }, [res, onDone, onError]);
  return <Btn icon="G" label={t('login_google')} onPress={() => prompt()} disabled={!req} />;
}

function FacebookButton({ onDone, onError }: { onDone: Done; onError: () => void }) {
  const { t } = useSettings();
  const [req, res, prompt] = Facebook.useAuthRequest({ clientId: env.facebook });
  useEffect(() => {
    if (res?.type !== 'success') return;
    const accessToken = res.authentication?.accessToken ?? res.params.access_token;
    if (!accessToken) return onError();
    api<AuthResponse>('POST', '/auth/facebook', { accessToken }).then(onDone, onError);
  }, [res, onDone, onError]);
  return <Btn icon="f" label={t('login_facebook')} onPress={() => prompt()} disabled={!req} />;
}

export function SocialButtons({ onDone }: { onDone: Done }) {
  const { t, isDark } = useSettings();
  const toast = useToast();
  const onError = () => toast(t('error_generic'));
  const unavailable = () => toast(t('provider_unavailable'));

  const apple = async () => {
    if (!(await AppleAuthentication.isAvailableAsync())) return unavailable();
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) return onError();
      const fullName = cred.fullName ? AppleAuthentication.formatFullName(cred.fullName) : undefined;
      onDone(await api<AuthResponse>('POST', '/auth/apple', { identityToken: cred.identityToken, fullName: fullName || undefined }));
    } catch (e) {
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') onError();
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {Platform.OS === 'ios' ? (
        // Apple's own button keeps us within the Human Interface Guidelines (App Review 4.8).
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={24}
          style={{ height: 48 }}
          onPress={apple}
        />
      ) : (
        <Btn icon="" label={t('login_apple')} onPress={unavailable} dark />
      )}
      {googleConfigured ? <GoogleButton onDone={onDone} onError={onError} /> : <Btn icon="G" label={t('login_google')} onPress={unavailable} />}
      {env.facebook ? <FacebookButton onDone={onDone} onError={onError} /> : <Btn icon="f" label={t('login_facebook')} onPress={unavailable} />}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 13, borderRadius: 999 },
});
