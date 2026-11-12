import type {
  Draft, DraftPayload, LeaderboardRow, LikeReceived, Notification, UserProfile, WeeklyChallenge,
  Badge, Board, BoardCategory, BoardDirection, BoardPeriod, Category, Comment, CreatePostInput, Locale,
  Me, Page, PostCard, ReportReason, Tier, UserSummary, Weekly,
} from '@myna/shared';
import { LOCALES } from '@myna/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, qs } from './api';
import { useAuth } from './auth';

export function useFeed(category: Category | undefined, langs: Locale[], q: string) {
  const langParam = langs.length === LOCALES.length ? undefined : langs.join(',');
  // Browsing is ranked by what's hot; searching is newest-first.
  const sort = q.trim() ? 'new' : 'hot';
  return useInfiniteQuery({
    queryKey: ['feed', category ?? 'all', langParam ?? 'all', q, sort],
    queryFn: ({ pageParam }) => api<Page<PostCard>>('GET', `/feed${qs({ category, langs: langParam, q, sort, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const usePost = (id: string) => useQuery({ queryKey: ['post', id], queryFn: () => api<PostCard>('GET', `/posts/${id}`), enabled: !!id });

export const useComments = (postId: string, tier: Tier | null) =>
  useInfiniteQuery({
    queryKey: ['comments', postId, tier ?? 'all'],
    queryFn: ({ pageParam }) => api<Page<Comment>>('GET', `/posts/${postId}/comments${qs({ tier, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { nickname?: string; avatar?: string }) => api<Me>('PUT', '/me/profile', p),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me);
      for (const k of ['feed', 'comments', 'profile', 'post']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export const useNearby = (coords: { lat: number; lng: number } | null, radiusKm: number | null) =>
  useQuery({
    queryKey: ['nearby', coords?.lat, coords?.lng, radiusKm],
    queryFn: () => api<{ items: PostCard[] }>('GET', `/nearby${qs({ lat: coords!.lat, lng: coords!.lng, radius_km: radiusKm })}`),
    enabled: !!coords,
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => api<Page<PostCard>>('GET', `/search${qs({ q })}`),
    enabled: q.trim().length > 0,
  });

export const useBoard = (period: BoardPeriod, category: BoardCategory, direction: BoardDirection) =>
  useQuery({ queryKey: ['board', period, category, direction], queryFn: () => api<Board>('GET', `/boards${qs({ period, category, direction })}`) });

function useMine<T>(key: string, path: string) {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: [key], queryFn: () => api<T>('GET', path), enabled: signedIn });
}
export const useMyPosts = () => useMine<{ items: PostCard[] }>('my-posts', '/me/posts');
export const useMyRatings = () => useMine<{ items: PostCard[] }>('my-ratings', '/me/ratings');
export const useBadges = () => useMine<{ items: Badge[] }>('badges', '/me/badges');
export const useWeekly = () => useMine<Weekly>('weekly', '/me/weekly');
export const useBlocks = () => useMine<{ items: UserSummary[] }>('blocks', '/me/blocks');

/** After any write that changes a post, refresh everything that may show it. */
function refreshPost(qc: QueryClient, post: PostCard) {
  qc.setQueryData(['post', post.id], post);
  for (const k of ['feed', 'comments', 'my-ratings', 'my-posts', 'nearby', 'search', 'me', 'weekly', 'badges', 'board', 'challenge', 'leaderboard', 'history', 'notifications', 'unread']) qc.invalidateQueries({ queryKey: [k] });
}

export function useRate(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tier: Tier; reason: string; editing: boolean }) =>
      api<PostCard>(v.editing ? 'PATCH' : 'POST', v.editing ? `/posts/${postId}/ratings/me` : `/posts/${postId}/ratings`, { tier: v.tier, reason: v.reason }),
    onSuccess: (post) => refreshPost(qc, post),
  });
}

export function usePublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => api<PostCard>('POST', '/posts', input),
    onSuccess: (post) => refreshPost(qc, post),
  });
}

export function useLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { commentId: string; like: boolean }) => api<{ likeCount: number }>(v.like ? 'PUT' : 'DELETE', `/comments/${v.commentId}/like`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  });
}

export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; block: boolean }) => api(v.block ? 'PUT' : 'DELETE', `/me/blocks/${v.userId}`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export const useReport = () =>
  useMutation({ mutationFn: (v: { postId?: string; commentId?: string; reason: ReportReason }) => api('POST', '/reports', v) });

export function useUpdateProfileSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: { locale?: Locale | null; contentLangs?: Locale[]; visibility?: Me['settings']['visibility']; notifySocial?: boolean; notifyRank?: boolean }) =>
      api<Me>('PUT', '/me/settings', s),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}

// ---- phase 2 (§5.6 quick access) --------------------------------------------------------
export const useFavorites = () => useMine<{ items: PostCard[] }>('favorites', '/me/favorites');
export const useHistory = () => useMine<{ items: PostCard[] }>('history', '/me/history');
export const useDrafts = () => useMine<{ items: Draft[] }>('drafts', '/drafts');
export const useLikesReceived = () => useMine<{ items: LikeReceived[] }>('likes', '/me/likes');
export const useFollowing = () => useMine<{ items: UserSummary[] }>('following', '/me/following');

export const useProfile = (id: string) => useQuery({ queryKey: ['profile', id], queryFn: () => api<UserProfile>('GET', `/users/${id}`) });

export function useFavorite(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => api<{ favorited: boolean }>(on ? 'PUT' : 'DELETE', `/posts/${postId}/favorite`),
    onSuccess: ({ favorited }) => {
      qc.setQueryData<PostCard>(['post', postId], (p) => (p ? { ...p, favorited } : p));
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api('DELETE', '/me/history'), onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }) });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; payload: DraftPayload }) => api<Draft>('POST', '/drafts', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] }),
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api('DELETE', `/drafts/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] }) });
}

export function useFollow(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => api<{ following: boolean }>(on ? 'PUT' : 'DELETE', `/users/${userId}/follow`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      qc.invalidateQueries({ queryKey: ['following'] });
    },
  });
}

export const useChallenge = () => useMine<WeeklyChallenge>('challenge', '/me/challenge');
export const useLeaderboard = () => useQuery({ queryKey: ['leaderboard'], queryFn: () => api<{ items: LeaderboardRow[] }>('GET', '/leaderboard') });

// ---- replies, notifications, seasons --------------------------------------------------------
export const useReplies = (commentId: string, enabled: boolean) =>
  useQuery({ queryKey: ['replies', commentId], queryFn: () => api<{ items: Comment[] }>('GET', `/comments/${commentId}/replies`), enabled });

export function useReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { commentId: string; body: string }) => api<{ items: Comment[]; threadId: string }>('POST', `/comments/${v.commentId}/replies`, { body: v.body }),
    onSuccess: (r) => {
      qc.setQueryData(['replies', r.threadId], { items: r.items });
      qc.invalidateQueries({ queryKey: ['comments'] });
    },
  });
}

export function useDeleteReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api('DELETE', `/comments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments'] });
      qc.invalidateQueries({ queryKey: ['replies'] });
    },
  });
}

export const useNotifications = () => useMine<{ items: Notification[]; unread: number }>('notifications', '/notifications');

export function useUnread() {
  const { signedIn } = useAuth();
  return useQuery({ queryKey: ['unread'], queryFn: () => api<{ unread: number }>('GET', '/notifications/unread'), enabled: signedIn, refetchInterval: 60_000 });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('POST', '/notifications/read-all'),
    onSuccess: () => {
      qc.setQueryData(['unread'], { unread: 0 });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export interface SeasonAwardRow { category: string; rank: number; avg: number; total: number; post_id: string; title: string; emoji: string }
export const useLastSeason = () => useQuery({ queryKey: ['last-season'], queryFn: () => api<{ season: string; awards: SeasonAwardRow[] }>('GET', '/seasons/last') });

export function useEditPost(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { title?: string; body?: string; emoji?: string; imageUrls?: string[] }) => api<PostCard>('PATCH', `/posts/${postId}`, p),
    onSuccess: (post) => refreshPost(qc, post),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api('DELETE', `/posts/${postId}`),
    onSuccess: () => qc.invalidateQueries(),
  });
}
