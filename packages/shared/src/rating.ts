import type { Tier } from './scales';

/** §4.4 — blind posts hide their score from people who have not rated, for this many hours after posting. */
export const BLIND_HOURS = 24;

/** §4.5 — each user may edit a rating at most 3 times. */
export const MAX_EDITS = 3;

/** Vote counts per tier, index 0 = tier 1. */
export type Distribution = [number, number, number, number, number];

export const emptyDistribution = (): Distribution => [0, 0, 0, 0, 0];

export function total(d: Distribution): number {
  return d[0] + d[1] + d[2] + d[3] + d[4];
}

/** Mean on the 1–5 scale rounded to one decimal, or null when nobody rated. */
export function average(d: Distribution): number | null {
  const n = total(d);
  if (n === 0) return null;
  const sum = d.reduce((acc, c, i) => acc + c * (i + 1), 0);
  return Math.round((sum / n) * 10) / 10;
}

export function addVote(d: Distribution, tier: Tier): Distribution {
  const next = [...d] as Distribution;
  next[tier - 1] += 1;
  return next;
}

export function moveVote(d: Distribution, from: Tier, to: Tier): Distribution {
  const next = [...d] as Distribution;
  if (next[from - 1] <= 0) throw new Error(`no vote to move from tier ${from}`);
  next[from - 1] -= 1;
  next[to - 1] += 1;
  return next;
}

export function editsLeft(editedCount: number): number {
  return Math.max(0, MAX_EDITS - editedCount);
}

export type Verdict = 'good' | 'mid' | 'bad';
/** Same thresholds as the prototype: ≥4 good, ≥2.5 mixed, else caution. */
export function verdict(avg: number): Verdict {
  return avg >= 4 ? 'good' : avg >= 2.5 ? 'mid' : 'bad';
}

/** §4.4 auto tags. Thresholds are operating parameters — defaults mirror the prototype. */
export interface AutoTagConfig {
  /** Posts younger than this are "new". */
  newPostDays: number;
  /** "Hidden gem": new post, at least minTotal ratings, share of tiers 4–5 ≥ highShare. */
  potentialMinTotal: number;
  potentialHighShare: number;
  /** "Flop alert": at least minTotal ratings, share of tiers 1–2 ≥ lowShare. */
  warnMinTotal: number;
  warnLowShare: number;
}

export const DEFAULT_AUTO_TAG_CONFIG: AutoTagConfig = {
  newPostDays: 30,
  potentialMinTotal: 20,
  potentialHighShare: 0.6,
  warnMinTotal: 50,
  warnLowShare: 0.5,
};

export type AutoTag = 'potential' | 'warn';

export function autoTags(d: Distribution, createdAt: Date, now: Date, cfg: AutoTagConfig = DEFAULT_AUTO_TAG_CONFIG): AutoTag[] {
  const n = total(d);
  const tags: AutoTag[] = [];
  if (n === 0) return tags;
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  if (ageDays <= cfg.newPostDays && n >= cfg.potentialMinTotal && (d[3] + d[4]) / n >= cfg.potentialHighShare) tags.push('potential');
  if (n >= cfg.warnMinTotal && (d[0] + d[1]) / n >= cfg.warnLowShare) tags.push('warn');
  return tags;
}
