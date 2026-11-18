import { CATEGORIES, CATEGORY_EMOJI, categoryName, type Category } from '@myna/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostCardView } from '../components/post';
import { Chip, ChipRow, Empty, ErrorView, Loading, T } from '../components/ui';
import { useFeed } from '../lib/queries';
import { useSettings } from '../lib/settings';

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

const CATS = CATEGORIES.filter((c) => c !== 'other');

/** Dedicated search: type to search everything, or narrow by category; categories are browsable before typing. */
export default function Search() {
  const { t, locale, contentLangs, colors } = useSettings();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | undefined>();
  const q = useDebounced(query.trim());
  const active = !!q || !!cat;
  const feed = useFeed(cat, contentLangs, q, 'hot', active);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('back')} hitSlop={8} style={[s.back, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <T style={{ fontSize: 16 }}>‹</T>
        </Pressable>
        <View style={[s.input, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={{ fontSize: 13 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={t('search_hint')}
            placeholderTextColor={colors.faint}
            returnKeyType="search"
            accessibilityLabel={t('search_title')}
            style={{ flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 0, minWidth: 0 }}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <T muted>✕</T>
            </Pressable>
          )}
        </View>
      </View>
      <ChipRow>
        {CATS.map((c) => (
          <Chip key={c} label={`${CATEGORY_EMOJI[c]} ${categoryName(c, locale)}`} on={cat === c} onPress={() => setCat(cat === c ? undefined : c)} />
        ))}
      </ChipRow>
      {!active ? (
        <View style={{ padding: 16 }}>
          <T muted style={{ fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
            {t('search_try')}
          </T>
          <View style={s.grid}>
            {CATS.map((c) => (
              <Pressable key={c} onPress={() => setCat(c)} accessibilityRole="button" style={[s.tile, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Text style={{ fontSize: 28 }}>{CATEGORY_EMOJI[c]}</Text>
                <T style={{ fontSize: 13, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                  {categoryName(c, locale)}
                </T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostCardView post={item} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={feed.isPending ? <Loading /> : feed.isError ? <ErrorView onRetry={() => feed.refetch()} /> : <Empty text={t('empty_search')} />}
          onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 21, borderWidth: 1, paddingHorizontal: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
});
