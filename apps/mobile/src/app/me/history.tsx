import { PostListScreen } from '../../components/PostListScreen';
import { T, useToast } from '../../components/ui';
import { useClearHistory, useHistory } from '../../lib/queries';
import { useSettings } from '../../lib/settings';

export default function History() {
  const { t } = useSettings();
  const q = useHistory();
  const clear = useClearHistory();
  const toast = useToast();
  const right = q.data?.items.length ? (
    <T muted style={{ fontSize: 14, paddingHorizontal: 6 }} onPress={() => clear.mutate(undefined, { onSuccess: () => toast(t('hist_cleared')) })}>
      {t('hist_clear')}
    </T>
  ) : undefined;
  return <PostListScreen title={t('hist_t')} query={q} empty={t('nothing_yet')} emoji="🕘" right={right} />;
}
