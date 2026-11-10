import type { PostCard } from '@myna/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSettings } from '../lib/settings';
import { PageHeader } from './headers';
import { PostCardView } from './post';
import { Empty, ErrorView, Loading } from './ui';

/** A back-button page listing post cards (favourites, history, my posts…). */
export function PostListScreen({ title, query, empty, emoji, right }: {
  title: string;
  query: UseQueryResult<{ items: PostCard[] }>;
  empty: string;
  emoji?: string;
  right?: ReactNode;
}) {
  const { colors } = useSettings();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={title} right={right} />
      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCardView post={item} />}
        ListEmptyComponent={query.isPending ? <Loading /> : query.isError ? <ErrorView onRetry={() => query.refetch()} /> : <Empty emoji={emoji} text={empty} />}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      />
    </View>
  );
}
