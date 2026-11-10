import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { PageHeader } from '../components/headers';
import { PostCardView } from '../components/post';
import { Button, Card, Empty, Loading, T } from '../components/ui';
import { useSearch } from '../lib/queries';
import { useSettings } from '../lib/settings';

/**
 * §7 Link Finder (MVP slice). The real entry point is the OS share sheet
 * (iOS Share Extension / Android ACTION_SEND), scheduled for phase 2. Until then
 * this page only offers an honest manual lookup — it never guesses a product (§7.1 red line).
 */
export default function LinkFinder() {
  const { t, colors } = useSettings();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const res = useSearch(q);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('nav_scan')} />
      <FlatList
        data={q ? (res.data?.items ?? []) : []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCardView post={item} />}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <Card style={{ padding: 14 }}>
              <T style={{ fontSize: 13.5, lineHeight: 20, color: colors.body }}>🔗 {t('finder_desc')}</T>
            </Card>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('manual_ph')}
              placeholderTextColor={colors.faint}
              returnKeyType="search"
              onSubmitEditing={() => setQ(text.trim())}
              style={{ borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink, borderRadius: 12, padding: 13, fontSize: 15 }}
            />
            <Button label={t('manual_btn')} onPress={() => setQ(text.trim())} disabled={!text.trim()} />
          </View>
        }
        ListEmptyComponent={q ? res.isPending ? <Loading /> : <Empty emoji="🤔" text={t('no_results')} /> : undefined}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}
