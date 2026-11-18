import type { Distribution } from './rating';
import type { Tier } from './scales';

/**
 * "Fun layer": what a post's ratings *mean*, said the way people talk about it.
 * Cards and detail pages lead with the verdict; the 1–5 average is secondary.
 */
export type VerdictKey = 'fresh' | 'controversial' | 'legend' | 'hated' | 'loved' | 'flop' | 'mid';

export const VERDICT_EMOJI: Record<VerdictKey, string> = {
  fresh: '🆕',
  controversial: '⚔️',
  legend: '👑',
  hated: '💀',
  loved: '😍',
  flop: '💣',
  mid: '😐',
};

/** Fewer ratings than this and we don't pretend to know yet. */
export const VERDICT_MIN_RATINGS = 3;

/** Shares of low (tiers 1–2), middle (3) and high (4–5) votes as whole percentages summing to 100. */
export interface VoteSplit {
  low: number;
  mid: number;
  high: number;
}

export function voteSplit(d: Distribution): VoteSplit {
  const n = d[0] + d[1] + d[2] + d[3] + d[4];
  if (!n) return { low: 0, mid: 0, high: 0 };
  const low = Math.round(((d[0] + d[1]) / n) * 100);
  const high = Math.round(((d[3] + d[4]) / n) * 100);
  return { low, high, mid: Math.max(0, 100 - low - high) };
}

export function verdictOf(d: Distribution): VerdictKey {
  const n = d[0] + d[1] + d[2] + d[3] + d[4];
  if (n < VERDICT_MIN_RATINGS) return 'fresh';
  const low = (d[0] + d[1]) / n;
  const high = (d[3] + d[4]) / n;
  if (low >= 0.3 && high >= 0.3) return 'controversial';
  if (high >= 0.8 && d[4] / n >= 0.5) return 'legend';
  if (low >= 0.8 && d[0] / n >= 0.5) return 'hated';
  if (high >= 0.6) return 'loved';
  if (low >= 0.6) return 'flop';
  return 'mid';
}

export type Side = 'low' | 'mid' | 'high';
export const sideOf = (t: Tier): Side => (t <= 2 ? 'low' : t === 3 ? 'mid' : 'high');

/** "You're with 71% of people" — computed from the post's distribution (which already includes your vote). */
export interface CrowdReveal {
  /** Nobody else has rated yet. */
  first: boolean;
  /** Share of *other* raters on the same side (low/mid/high) as you, 0–100. */
  sameSide: number;
  /** Share of other raters who picked exactly your tier, 0–100. */
  sameTier: number;
  minority: boolean;
}

export function crowdReveal(d: Distribution, mine: Tier): CrowdReveal {
  const others = [...d] as Distribution;
  others[mine - 1] = Math.max(0, others[mine - 1] - 1);
  const n = others[0] + others[1] + others[2] + others[3] + others[4];
  if (!n) return { first: true, sameSide: 0, sameTier: 0, minority: false };
  const side = sideOf(mine);
  const onSide = side === 'low' ? others[0] + others[1] : side === 'mid' ? others[2] : others[3] + others[4];
  const sameSide = Math.round((onSide / n) * 100);
  return { first: false, sameSide, sameTier: Math.round((others[mine - 1] / n) * 100), minority: sameSide < 25 };
}

/** Taste identity — replaces reputation on profiles (a label you'd show off, not a score you protect). */
export type TasteKey = 'newbie' | 'contrarian' | 'harsh' | 'sweet' | 'mainstream' | 'independent';
export const TASTE_EMOJI: Record<TasteKey, string> = {
  newbie: '🐣',
  contrarian: '🙃',
  harsh: '🌶️',
  sweet: '🍯',
  mainstream: '📣',
  independent: '🧭',
};

export interface TasteProfile {
  key: TasteKey;
  /** Ratings that count (posts other people also rated). */
  rated: number;
  /** Share of those where you sided with the majority, 0–100 (null when nothing counts yet). */
  agreement: number | null;
  /** Average tier you give, 1–5 (null when you haven't rated). */
  avgTier: number | null;
  /** Times you were in a minority under 25%. */
  hotTakes: number;
}

/** Minimum comparable ratings before a taste label is assigned. */
export const TASTE_MIN_RATINGS = 5;

export function tasteKey(rated: number, agreement: number | null, avgTier: number | null): TasteKey {
  if (rated < TASTE_MIN_RATINGS || agreement === null || avgTier === null) return 'newbie';
  if (agreement < 45) return 'contrarian';
  if (avgTier <= 2.2) return 'harsh';
  if (avgTier >= 4.1) return 'sweet';
  if (agreement >= 75) return 'mainstream';
  return 'independent';
}

/** Weekly posting theme, rotating by ISO-ish week number (Monday-based, UTC). Keys are i18n `theme_<n>`. */
export const WEEKLY_THEME_COUNT = 8;
export function weeklyThemeIndex(now: Date = new Date()): number {
  const monday = Date.UTC(1970, 0, 5); // a Monday
  const weeks = Math.floor((now.getTime() - monday) / (7 * 86_400_000));
  return ((weeks % WEEKLY_THEME_COUNT) + WEEKLY_THEME_COUNT) % WEEKLY_THEME_COUNT;
}

/**
 * True when `s` is one emoji (incl. skin tones, ZWJ sequences, flags, keycaps).
 * Plain code-point checks instead of \p{…} regexes so it runs on every JS engine (Hermes included).
 */
export function isSingleEmoji(s: string): boolean {
  if (!s || s.length > 16) return false;
  const cps = Array.from(s).map((c) => c.codePointAt(0)!);
  const isJoiner = (c: number) => c === 0x200d || c === 0xfe0f || c === 0xfe0e || c === 0x20e3 || (c >= 0x1f3fb && c <= 0x1f3ff) || (c >= 0xe0020 && c <= 0xe007f);
  const isRegional = (c: number) => c >= 0x1f1e6 && c <= 0x1f1ff;
  const isPictographic = (c: number) =>
    (c >= 0x1f000 && c <= 0x1faff) || (c >= 0x2600 && c <= 0x27bf) || (c >= 0x2300 && c <= 0x23ff) || (c >= 0x2b00 && c <= 0x2bff) ||
    (c >= 0x2190 && c <= 0x21ff) || (c >= 0x2900 && c <= 0x297f) || c === 0x00a9 || c === 0x00ae || c === 0x203c || c === 0x2049 ||
    c === 0x2122 || c === 0x2139 || c === 0x3030 || c === 0x303d || c === 0x3297 || c === 0x3299 || c === 0x24c2;
  // Flags: exactly two regional indicators.
  if (cps.length === 2 && cps.every(isRegional)) return true;
  // Keycaps: [0-9#*] FE0F? 20E3
  if ((cps[0]! >= 0x30 && cps[0]! <= 0x39) || cps[0] === 0x23 || cps[0] === 0x2a) {
    return cps[cps.length - 1] === 0x20e3 && cps.slice(1, -1).every((c) => c === 0xfe0f);
  }
  let pictos = 0;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i]!;
    if (isJoiner(c)) continue;
    if (isPictographic(c)) {
      // Each pictograph after the first must follow a zero-width joiner.
      if (pictos > 0 && cps[i - 1] !== 0x200d) return false;
      pictos++;
    } else return false;
  }
  return pictos > 0 && pictos <= 4 && isPictographic(cps[0]!);
}
