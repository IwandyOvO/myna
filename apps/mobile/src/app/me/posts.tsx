import { PostListScreen } from '../../components/PostListScreen';
import { useMyPosts } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

export default function MyPosts() {
  const { t } = useSettings();
  return <PostListScreen title={t('me_posts')} query={useMyPosts()} empty={t('nothing_yet')} />;
}
