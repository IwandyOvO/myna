import { CATEGORIES, categoryName, type Category, type FeedSort } from '@myna/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { HomeTopBar } from '../../components/headers';
import { PostCardView } from '../../components/post';
import { Chip, ChipRow, Empty, ErrorView, Loading, T } from '../../components/ui';
import { useFeed } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

/** "other" is reachable via publish only, as in the prototype. */
const HOME_CATS = CATEGORIES.filter((c) => c !== 'other');
const SORTS: { sort: FeedSort; label: string }[] = [
  { sort: 'hot', label: 'chip_hot' },
  { sort: 'new', label: 'chip_new' },
  { sort: 'controversial', label: 'chip_controversial' },
  { sort: 'top', label: 'chip_top' },
  { sort: 'flop', label: 'chip_flop' },
];

/**
 * Home: one list of chips is the whole navigation — rankings (hot / new / controversial / top / flops),
 * places (nearby, monthly boards) and categories — instead of separate tabs for each.
 */
export default function Home() {
  const { t, locale, contentLangs, colors } = useSettings();
  const [sel, setSel] = useState<{ sort: FeedSort } | { cat: Category }>({ sort: 'hot' });
  const cat = 'cat' in sel ? sel.cat : undefined;
  const sort = 'sort' in sel ? sel.sort : 'hot';
  const feed = useFeed(cat, contentLangs, '', sort);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <HomeTopBar />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCardView post={item} />}
        ListHeaderComponent={
          <ChipRow>
            {SORTS.map((x) => (
              <Chip key={x.sort} label={t(x.label)} on={'sort' in sel && sel.sort === x.sort} onPress={() => setSel({ sort: x.sort })} />
            ))}
            <Chip label={t('chip_nearby')} on={false} onPress={() => router.push('/nearby')} />
            <Chip label={t('chip_boards')} on={false} onPress={() => router.push('/boards')} />
            {HOME_CATS.map((c) => (
              <Chip key={c} label={categoryName(c, locale)} on={cat === c} onPress={() => setSel({ cat: c })} />
            ))}
          </ChipRow>
        }
        ListEmptyComponent={feed.isPending ? <Loading /> : feed.isError ? <ErrorView onRetry={() => feed.refetch()} /> : <Empty text={t('empty_lang')} />}
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
