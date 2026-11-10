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
