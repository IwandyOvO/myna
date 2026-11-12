import type { AuthResponse } from '@myna/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { Logo } from '../components/Logo';
import { SocialButtons } from '../components/SocialButtons';
import { Button, T, useToast } from '../components/ui';
import { api, ApiFailure, API_URL } from '../lib/api';
import { errorText } from '../lib/errors';
import { brand } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

/** §5.8 sign-in: e-mail one-time code, Apple, Google, Facebook. Never asks for third-party passwords (§13.2). */
export default function Login() {
  const { t, colors } = useSettings();
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false);

  const done = useCallback(
    async (r: AuthResponse) => {
      await signIn(r);
      router.back();
    },
    [signIn],
  );

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('POST', '/auth/email/start', { email });
      setSent(true);
      if (r.devCode) setCode(r.devCode); // dev servers echo the code so the flow can be tested without e-mail
      toast(t('code_sent', { email }));
    } catch (e) {
      toast(
        e instanceof ApiFailure && e.code === 'code_recently_sent'
          ? t('code_sent', { email })
          : e instanceof ApiFailure && e.code === 'network_error'
            ? `${t('error_generic')} (${API_URL})`
            : t('error_generic'),
      );
      if (e instanceof ApiFailure && e.code === 'code_recently_sent') setSent(true);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await done(await api<AuthResponse>('POST', '/auth/email', { email, code, ageConfirmed: adult }));
    } catch (e) {
      toast(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const input = [s.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader title={t('login_t')} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <Logo width={140} />
          <T muted style={{ marginTop: 6 }}>
            {t('slogan')}
          </T>
        </View>
        <T muted style={{ textAlign: 'center', fontSize: 13 }}>
          {t('login_sub')}
        </T>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('email_ph')}
          placeholderTextColor={colors.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={input}
        />
        {sent && (
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('code_ph')}
            placeholderTextColor={colors.faint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            style={input}
          />
        )}
        <Pressable onPress={() => setAdult((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: adult }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[s.box, { borderColor: adult ? brand.red : colors.line, backgroundColor: adult ? brand.red : 'transparent' }]}>
            {adult && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>✓</Text>}
          </View>
          <T style={{ fontSize: 13.5 }}>{t('age_confirm')}</T>
        </Pressable>
        {sent ? (
          <Button label={t('verify')} onPress={verify} disabled={code.length !== 6 || !adult} loading={busy} />
        ) : (
          <Button label={t('send_code')} onPress={send} disabled={!/\S+@\S+\.\S+/.test(email) || !adult} loading={busy} />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 }}>
          <View style={[s.rule, { backgroundColor: colors.line }]} />
          <Text style={{ color: colors.faint, fontSize: 12 }}>·</Text>
          <View style={[s.rule, { backgroundColor: colors.line }]} />
        </View>
        <SocialButtons onDone={done} ageConfirmed={adult} onNeedAge={() => toast(t('age_required'))} />
        <T muted style={{ fontSize: 11.5, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
          {t('agree_prefix')}{' '}
          <T style={{ fontSize: 11.5, color: colors.ink, fontWeight: '700' }} onPress={() => router.push('/legal/terms')}>
            {t('terms')}
          </T>{' '}
          {t('and')}{' '}
          <T style={{ fontSize: 11.5, color: colors.ink, fontWeight: '700' }} onPress={() => router.push('/legal/privacy')}>
            {t('privacy')}
          </T>
        </T>
        {__DEV__ && (
          <T muted style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>
            API: {API_URL}
          </T>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 1.5, borderRadius: 12, padding: 13, fontSize: 15 },
  rule: { flex: 1, height: 1 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
