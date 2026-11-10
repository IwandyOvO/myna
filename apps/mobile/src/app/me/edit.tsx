import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { Button, T, useToast } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useUpdateProfile } from '../../lib/queries';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

const AVATARS = ['🐦', '🦜', '🐧', '🦉', '🐤', '🦩', '🦚', '🕊️', '🍚', '🧋', '🍜', '🍰', '🍿', '🥑', '🌸', '🌿', '🐱', '🐶', '🦊', '🐼', '🐻', '🐰', '🐸', '🐙'];

export default function EditProfile() {
  const { t, colors } = useSettings();
  const { me } = useAuth();
  const toast = useToast();
  const save = useUpdateProfile();
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [avatar, setAvatar] = useState(me?.avatar ?? '🐦');
  useEffect(() => {
    if (me) {
      setNickname(me.nickname);
      setAvatar(me.avatar);
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = nickname.trim().length > 0 && [...nickname.trim()].length <= 24;
  const submit = () =>
    save.mutate(
      { nickname: nickname.trim(), avatar },
      {
        onSuccess: () => {
          toast(t('saved'));
          router.back();
        },
        onError: () => toast(t('error_generic')),
      },
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('edit_profile')} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <View style={[s.big, { backgroundColor: colors.soft }]}>
            <Text style={{ fontSize: 52 }}>{avatar}</Text>
          </View>
          <T muted style={{ marginTop: 8, fontSize: 12 }}>@{me?.handle}</T>
        </View>
        <View>
          <T style={s.label}>{t('nickname')}</T>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            maxLength={24}
            style={[s.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
            accessibilityLabel={t('nickname')}
          />
        </View>
        <View>
          <T style={s.label}>{t('avatar')}</T>
          <View style={s.grid}>
            {AVATARS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setAvatar(a)}
                accessibilityRole="radio"
                accessibilityState={{ selected: avatar === a }}
                style={[s.cell, { borderColor: avatar === a ? brand.red : colors.line, backgroundColor: colors.card }]}
              >
                <Text style={{ fontSize: 26 }}>{a}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Button label={t('save_changes')} onPress={submit} disabled={!valid} loading={save.isPending} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  big: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '800', marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: 52, height: 52, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
