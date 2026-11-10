import type { BoardCategory, Category, PostType } from './categories';
import type { Locale } from './locales';
import type { AutoTag, Distribution } from './rating';
import type { Tier } from './scales';

/** Wire types shared by apps/server and apps/mobile. Dates are ISO strings. */

export type AuthProvider = 'email' | 'google' | 'facebook' | 'apple';

export interface UserSummary {
  id: string;
  nickname: string;
  handle: string;
  avatar: string; // emoji avatar for now; avatar_url later
}

export interface Me extends UserSummary {
  reputation: number;
  locale: Locale | null;
  stats: { posts: number; ratings: number; likes: number };
  settings: UserSettings;
}

export type Visibility = 'everyone' | 'following' | 'only_me';
export interface UserSettings {
  contentLangs: Locale[];
  visibility: Visibility;
}

export interface AuthResponse {
  token: string;
  user: Me;
}

export interface MyRating {
  tier: Tier;
  reason: string;
  editedCount: number;
  editsLeft: number;
}

export interface PostCard {
  id: string;
  type: PostType;
  category: Category;
  title: string;
  body: string;
  emoji: string;
  imageUrls: string[];
  lang: Locale;
  blind: boolean;
  placeName: string | null;
  distanceKm?: number;
  author: UserSummary;
  createdAt: string;
  total: number;
  /** null when nobody rated OR the post is blind and the viewer has not rated (locked). */
  avg: number | null;
  /** null when locked (blind and not yet rated by viewer). */
  dist: Distribution | null;
  locked: boolean;
  tags: AutoTag[];
  myRating: MyRating | null;
}

export interface Comment {
  id: string;
  author: UserSummary;
  /** null when the post is locked for the viewer (blind) so tiers do not leak. */
  tier: Tier | null;
  body: string;
  likeCount: number;
  likedByMe: boolean;
  edited: boolean;
  mine: boolean;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CreatePostInput {
  category: Category;
  title: string;
  body?: string;
  emoji?: string;
  blind?: boolean;
  lang: Locale;
  location?: { lat: number; lng: number; placeName: string } | { placeName: string } | null;
}

export interface RateInput {
  tier: Tier;
  reason?: string;
}

export type BoardPeriod = 'monthly' | 'all';
export type BoardDirection = 'best' | 'worst';
export interface BoardEntry {
  rank: number;
  post: Pick<PostCard, 'id' | 'title' | 'emoji' | 'category'>;
  avg: number;
  total: number;
}
export interface Board {
  period: BoardPeriod;
  category: BoardCategory;
  direction: BoardDirection;
  season: string | null; // "2026-11" for monthly
  minRatings: number;
  daysToSettle: number | null;
  entries: BoardEntry[];
}

export interface Badge {
  key: string;
  icon: string;
  name: string;
  desc: string;
  cond: string;
  unlockedAt: string | null;
  progress: { current: number; target: number };
}

export interface Weekly {
  ratings: number;
  newBadges: number;
  reputationDelta: number;
}

export type ReportReason = 'spam' | 'abuse' | 'illegal' | 'other';

export interface ApiError {
  error: string; // machine code, e.g. "edit_limit_reached"
  message?: string;
}
