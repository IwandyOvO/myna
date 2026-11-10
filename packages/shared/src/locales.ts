/** §5.9 — 7 UI languages; content languages use the same 7 codes. */
export const LOCALES = ['zh', 'en', 'es', 'fr', 'ja', 'ko', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '简体中文',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어',
  it: 'Italiano',
};

export const LANG_TAG: Record<Locale, string> = { zh: '中', en: 'EN', es: 'ES', fr: 'FR', ja: '日', ko: '한', it: 'IT' };

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

/** Map a BCP-47 tag such as "zh-Hans-CN" or "en-US" to a supported locale (default en). */
export function resolveLocale(tag: string | null | undefined): Locale {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : 'en';
}
