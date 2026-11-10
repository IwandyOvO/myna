import {
  CATEGORY_EMOJI, LANG_TAG, LOCALES, categoriesOf, categoryName, placeholderFor, scaleFor,
  type Category, type Locale, type PostType,
} from '@myna/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../components/headers';
import { Button, Card, Chip, Seg, Sheet, T, useToast } from '../components/ui';
import { CITIES, cityName, locate } from '../lib/location';
import { usePublish } from '../lib/queries';
import { useSettings } from '../lib/settings';
import { brand } from '../lib/theme';

const COVER_EMOJIS: Record<PostType, string[]> = {
  product: ['🥤', '🧋', '🍿', '🍜', '🎧', '💄', '🧺', '🍰'],
  event: ['🎉', '💼', '🏫', '💌', '🏠', '🏕️', '🎬', '✨'],
};

type Loc = { lat?: number; lng?: number; placeName: string } | null;

/** §5.3 publish page. */
export default function Publish() {
  const { t, locale, colors } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const publish = usePublish();
  const [type, setType] = useState<PostType>('product');
  const [category, setCategory] = useState<Category>('drinks');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [blind, setBlind] = useState(false);
  const [lang, setLang] = useState<Locale>(locale);
  const [loc, setLoc] = useState<Loc>(null);
  const [locating, setLocating] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const ph = placeholderFor(category, locale);
  const scale = scaleFor(category, locale);

  const switchType = (v: PostType) => {
    setType(v);
    setCategory(categoriesOf(v)[0]!);
    setEmoji(null);
  };

  const gps = async () => {
    setLocating(true);
    const fix = await locate();
    setLocating(false);
    if (fix) setLoc({ lat: fix.lat, lng: fix.lng, placeName: fix.placeName ?? `${fix.lat.toFixed(3)}, ${fix.lng.toFixed(3)}` });
    else {
      toast(t('loc_failed'));
      setCityOpen(true); // §5.3 fall back to the manual city list
    }
  };

  const submit = () => {
    if (!title.trim()) return toast(t('need_title'));
    publish.mutate(
      {
        category,
        title: title.trim(),
        body: body.trim() || t('default_desc'),
        emoji: emoji ?? CATEGORY_EMOJI[category],
        blind,
        lang,
        location: loc ? (loc.lat !== undefined ? { lat: loc.lat, lng: loc.lng!, placeName: loc.placeName } : { placeName: loc.placeName }) : null,
      },
      {
        onSuccess: (p) => {
          toast(t('published'));
          router.replace(`/post/${p.id}`);
        },
        onError: () => toast(t('error_generic')),
      },
    );
  };

  const input = [s.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader title={t('pub_head')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <Seg value={type} onChange={switchType} options={[{ value: 'product', label: t('type_product') }, { value: 'event', label: t('type_event') }]} />

        <View>
          <T style={s.label}>{t('pub_cat')}</T>
          <View style={s.wrap}>
            {categoriesOf(type).map((c) => (
              <Chip key={c} label={`${CATEGORY_EMOJI[c]} ${categoryName(c, locale)}`} on={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        </View>

        <View>
          <T style={s.label}>{t('pub_title_l')}</T>
          <TextInput value={title} onChangeText={setTitle} placeholder={ph.title} placeholderTextColor={colors.faint} maxLength={120} style={input} />
        </View>
        <View>
          <T style={s.label}>{t('pub_desc_l')}</T>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={ph.desc}
            placeholderTextColor={colors.faint}
            multiline
            maxLength={2000}
            style={[input, { minHeight: 90, textAlignVertical: 'top' }]}
          />
        </View>

        <View>
          <T style={s.label}>{t('pub_cover_emoji')}</T>
          <View style={s.wrap}>
            {COVER_EMOJIS[type].map((e) => {
              const on = (emoji ?? CATEGORY_EMOJI[category]) === e;
              return (
                <Pressable key={e} onPress={() => setEmoji(e)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.emoji, { borderColor: on ? brand.red : colors.line, backgroundColor: colors.card }]}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <T style={s.label}>{t('content_langs')}</T>
          <View style={s.wrap}>
            {LOCALES.map((l) => (
              <Chip key={l} label={LANG_TAG[l]} on={lang === l} onPress={() => setLang(l)} />
            ))}
          </View>
        </View>

        <Card style={{ padding: 14, gap: 10 }}>
          <T style={{ fontWeight: '700' }} numberOfLines={1}>
            📍 {loc ? loc.placeName : t('loc_add')}
          </T>
          <View style={s.wrap}>
            {loc ? (
              <Chip label={t('loc_clear')} onPress={() => setLoc(null)} />
            ) : (
              <>
                <Chip label={locating ? t('loc_locating') : '🛰️ GPS'} onPress={gps} />
                <Chip label={t('loc_manual')} onPress={() => setCityOpen(true)} />
              </>
            )}
          </View>
          {!loc && (
            <T muted style={{ fontSize: 12 }}>
              {t('loc_none')}
            </T>
          )}
        </Card>

        <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '800' }}>{t('blind')}</T>
            <T muted style={{ fontSize: 12, marginTop: 3 }}>
              {t('blind_sub')}
            </T>
          </View>
          <Switch value={blind} onValueChange={setBlind} trackColor={{ true: brand.red }} />
        </Card>

        <View style={[s.hint, { backgroundColor: colors.soft }]}>
          <T muted style={{ fontSize: 12 }}>
            {t('scale_hint')} {scale.map((x) => `${x.emoji} ${x.label}`).join(' · ')}
          </T>
        </View>

        <Button label={t('publish')} onPress={submit} loading={publish.isPending} disabled={!title.trim()} />
      </ScrollView>

      <Sheet visible={cityOpen} title={t('loc_manual')} onClose={() => setCityOpen(false)}>
        <View style={[s.wrap, { paddingVertical: 8 }]}>
          {CITIES.map((c) => (
            <Chip
              key={c.names.en}
              label={cityName(c, locale)}
              onPress={() => {
                setLoc({ lat: c.lat, lng: c.lng, placeName: cityName(c, locale) });
                setCityOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  label: { fontWeight: '800', marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14 },
  emoji: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  hint: { padding: 12, borderRadius: 12 },
});
