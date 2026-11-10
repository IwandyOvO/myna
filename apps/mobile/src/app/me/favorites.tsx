import { PostListScreen } from '../../components/PostListScreen';
import { useFavorites } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

export default function Favorites() {
  const { t } = useSettings();
  return <PostListScreen title={t('fav_t')} query={useFavorites()} empty={t('nothing_yet')} emoji="⭐" />;
}
