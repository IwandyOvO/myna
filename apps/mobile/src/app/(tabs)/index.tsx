import { CATEGORIES, FOR_YOU, categoryName, type Category } from '@myna/shared';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { HomeTopBar } from '../../components/headers';
import { PostCardView } from '../../components/post';
import { Chip, ChipRow, Empty, ErrorView, Loading, T } from '../../components/ui';
import { useFeed } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** §5.1 chips: For You + the 11 sub-categories ("other" is reachable via publish only, as in the prototype). */
const HOME_CATS = CATEGORIES.filter((c) => c !== 'other');

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

export default function Home() {
  const { t, locale, contentLangs, colors } = useSettings();
  const [cat, setCat] = useState<Category | undefined>();
  const [query, setQuery] = useState('');
  const q = useDebounced(query);
  const feed = useFeed(cat, contentLangs, q);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HomeTopBar query={query} onQuery={setQuery} />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCardView post={item} />}
        ListHeaderComponent={
          <ChipRow>
            <Chip label={FOR_YOU[locale]} on={!cat} onPress={() => setCat(undefined)} />
            {HOME_CATS.map((c) => (
              <Chip key={c} label={categoryName(c, locale)} on={cat === c} onPress={() => setCat(c)} />
            ))}
          </ChipRow>
        }
        ListEmptyComponent={
          feed.isPending ? <Loading /> : feed.isError ? <ErrorView onRetry={() => feed.refetch()} /> : <Empty text={q ? t('empty_search') : t('empty_lang')} />
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <Loading />
          ) : items.length > 0 && !feed.hasNextPage ? (
            <T muted style={{ textAlign: 'center', fontSize: 12, paddingVertical: 18 }}>
              {t('feed_end')}
            </T>
          ) : undefined
        }
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}
