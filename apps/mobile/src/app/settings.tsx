import { LOCALES, LOCALE_LABELS, type Visibility } from '@myna/shared';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { registerForPush } from '../lib/push';
import { brand } from '../lib/theme';
import { PageHeader } from '../components/headers';
import { Button, Card, Seg, Sheet, T, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBlocks, useUpdateProfileSettings } from '../lib/queries';
import { useSettings, type Appearance } from '../lib/settings';
import { prefs } from '../lib/storage';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <T muted style={{ fontSize: 12.5, fontWeight: '700', marginBottom: 8, marginLeft: 4 }}>
        {title}
      </T>
      <Card>{children}</Card>
    </View>
  );
}

function Row({ title, sub, value, onPress, children, last, danger, right }: { title: string; sub?: string; value?: string; onPress?: () => void; children?: ReactNode; last?: boolean; danger?: boolean; right?: ReactNode }) {
  const { colors } = useSettings();
  const style = [s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }];
  // A disabled Pressable swallows taps meant for its children (e.g. a Seg) on web, so rows without a handler are plain Views.
  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontSize: 15, fontWeight: '600', color: danger ? '#C92A1A' : colors.ink }}>{title}</T>
          {!!sub && (
            <T muted style={{ fontSize: 12, marginTop: 3 }}>
              {sub}
            </T>
          )}
        </View>
        {!!value && <T muted style={{ fontSize: 13 }}>{value}</T>}
        {right}
        {onPress && <Text style={{ color: colors.faint, fontSize: 17, marginLeft: 6 }}>›</Text>}
      </View>
      {children && <View style={{ marginTop: 10 }}>{children}</View>}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

/** §5.8 settings — an independent page opened from the drawer. */
export default function Settings() {
  const { t, colors, appLang, appearance, update, locale } = useSettings();
  const { me, signedIn, signOut } = useAuth();
  const sync = useUpdateProfileSettings();
  const blocks = useBlocks();
  const toast = useToast();
  const qc = useQueryClient();
  const [langOpen, setLangOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const visibility: Visibility = me?.settings.visibility ?? 'everyone';
  const soon = () => toast(t('coming_soon'));

  const clearCache = async () => {
    qc.clear();
    const keep = { appLang, appearance };
    await prefs.clear();
    update(keep); // keep the user's explicit choices, drop everything else
    toast(t('cache_cleared'));
  };

  const deleteAccount = async () => {
    setConfirmDelete(false);
    try {
      await api('DELETE', '/me');
      await signOut();
      router.replace('/');
    } catch {
      toast(t('error_generic'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('settings')} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ padding: 16 }}>
          {signedIn && me ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 34 }}>{me.avatar}</Text>
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 16, fontWeight: '900' }}>{me.nickname}</T>
                <T muted style={{ fontSize: 12, marginTop: 2 }}>
                  @{me.handle} · {t('rep')} {me.reputation}
                </T>
              </View>
              <Pressable onPress={signOut} accessibilityRole="button">
                <T style={{ color: '#C92A1A', fontWeight: '700' }}>{t('logout')}</T>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <T style={{ fontSize: 16, fontWeight: '900' }}>{t('login_t')}</T>
              <T muted style={{ fontSize: 12.5 }}>
                {t('login_sub')}
              </T>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                {['✉️', '', 'G', 'f'].map((ic, i) => (
                  <Pressable key={i} onPress={() => router.push('/login')} accessibilityRole="button" accessibilityLabel={t('login')} style={[s.soc, { borderColor: colors.line, backgroundColor: colors.card }]}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: colors.ink }}>{ic}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </Card>

        <Group title={t('grp_general')}>
          <Row title={t('app_lang')} sub={t('app_lang_sub')} value={appLang === 'system' ? t('follow_system') : LOCALE_LABELS[appLang]} onPress={() => setLangOpen(true)} />
          <Row title={t('appearance')} last>
            <Seg<Appearance>
              small
              value={appearance}
              onChange={(v) => update({ appearance: v })}
              options={[
                { value: 'system', label: t('follow_system') },
                { value: 'light', label: t('light') },
                { value: 'dark', label: t('dark') },
              ]}
            />
          </Row>
        </Group>

        {signedIn && me && (
          <Group title={t('push')}>
            {(
              [
                ['notifySocial', t('notif_social'), t('notif_social_sub')],
                ['notifyRank', t('notif_rank'), t('notif_rank_sub')],
              ] as const
            ).map(([key, title, sub], i) => (
              <Row
                key={key}
                title={title}
                sub={sub}
                last={i === 1}
                right={
                  <Switch
                    value={me.settings[key]}
                    trackColor={{ true: brand.red }}
                    onValueChange={async (v) => {
                      sync.mutate({ [key]: v });
                      if (v) {
                        const r = await registerForPush();
                        if (r === 'denied') toast(t('push_denied'));
                      }
                    }}
                  />
                }
              />
            ))}
          </Group>
        )}

        <Group title={t('grp_privacy')}>
          {signedIn && (
            <Row title={t('who_see')}>
              <Seg<Visibility>
                small
                value={visibility}
                onChange={(v) => sync.mutate({ visibility: v })}
                options={[
                  { value: 'everyone', label: t('see_all') },
                  { value: 'following', label: t('see_follow') },
                  { value: 'only_me', label: t('see_onlyme') },
                ]}
              />
            </Row>
          )}
          {signedIn && <Row title={t('block_list')} value={t('blocked_fmt', { n: blocks.data?.items.length ?? 0 })} onPress={() => router.push('/blocked')} />}
          <Row title={t('clear_cache')} onPress={clearCache} last />
        </Group>

        <Group title={t('grp_support')}>
          <Row title={t('terms')} onPress={soon} />
          <Row title={t('privacy')} onPress={soon} />
          <Row title={t('feedback')} onPress={soon} />
          <Row title={t('version')} value={`v${Constants.expoConfig?.version ?? '0.8.0'}`} last />
        </Group>

        {signedIn && (
          <Group title={t('grp_account')}>
            <Row title={t('delete_account')} danger onPress={() => setConfirmDelete(true)} last />
          </Group>
        )}
      </ScrollView>

      <Sheet visible={langOpen} title={t('app_lang')} onClose={() => setLangOpen(false)}>
        {(['system', ...LOCALES] as const).map((l) => (
          <Pressable
            key={l}
            onPress={() => {
              update({ appLang: l });
              if (signedIn) sync.mutate({ locale: l === 'system' ? null : l });
              setLangOpen(false);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: appLang === l }}
            style={[s.langRow, { borderBottomColor: colors.line }]}
          >
            <T style={{ flex: 1, fontSize: 15, fontWeight: appLang === l ? '800' : '500' }}>{l === 'system' ? `${t('follow_system')} (${LOCALE_LABELS[locale]})` : LOCALE_LABELS[l]}</T>
            {appLang === l && <T style={{ color: '#FF5A3C', fontWeight: '900' }}>✓</T>}
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={confirmDelete} title={t('delete_title')} onClose={() => setConfirmDelete(false)}>
        <T muted style={{ marginVertical: 10 }}>
          {t('delete_body')}
        </T>
        <View style={{ gap: 10 }}>
          <Button label={t('confirm_delete')} onPress={deleteAccount} />
          <Button variant="ghost" label={t('cancel')} onPress={() => setConfirmDelete(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  row: { paddingVertical: 14, paddingHorizontal: 16 },
  soc: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
