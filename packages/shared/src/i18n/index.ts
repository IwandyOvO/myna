import type { Locale } from '../locales';
import base from './base.json';
import { OVERRIDES } from './overrides';

type Dict = Record<string, string>;
const BASE = base as Record<Locale, Dict>;

export const DICTIONARIES: Record<Locale, Dict> = Object.fromEntries(
  (Object.keys(OVERRIDES) as Locale[]).map((l) => [l, { ...BASE[l], ...OVERRIDES[l] }]),
) as Record<Locale, Dict>;

/** Translate `key`; falls back to English, then to the key itself. `{name}` placeholders are filled from vars. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/**
 * "5 hr ago" style label. Uses the dictionaries instead of Intl.RelativeTimeFormat,
 * which Hermes (the React Native engine) does not implement. Older than 30 days → YYYY-MM-DD.
 */
export function timeAgo(locale: Locale, iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const sec = (now.getTime() - then.getTime()) / 1000;
  if (sec < 60) return translate(locale, 'ago_now');
  if (sec < 3600) return translate(locale, 'ago_min', { n: Math.floor(sec / 60) });
  if (sec < 86400) return translate(locale, 'ago_hour', { n: Math.floor(sec / 3600) });
  if (sec < 86400 * 30) return translate(locale, 'ago_day', { n: Math.floor(sec / 86400) });
  return then.toISOString().slice(0, 10);
}
