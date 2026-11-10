import { FlatList, View } from 'react-native';
import { PageHeader } from '../../components/headers';
import { PostCardView } from '../../components/post';
import { Empty, Loading } from '../../components/ui';
import { useMyPosts } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

export default function MyPosts() {
  const { t, colors } = useSettings();
  const q = useMyPosts();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t('me_posts')} />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCardView post={item} />}
        ListEmptyComponent={q.isPending ? <Loading /> : <Empty text={t('nothing_yet')} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      />
    </View>
  );
}
