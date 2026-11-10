import type { Locale } from './locales';

/** §4.1 — two-level taxonomy. Keys are stable identifiers stored in the DB. */
export const PRODUCT_CATEGORIES = ['drinks', 'snacks', 'electronics', 'beauty', 'food', 'household'] as const;
export const EVENT_CATEGORIES = ['life', 'love', 'work', 'family', 'education', 'other'] as const;
export const CATEGORIES = [...PRODUCT_CATEGORIES, ...EVENT_CATEGORIES] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type Category = ProductCategory | EventCategory;
export type PostType = 'product' | 'event';

export function isCategory(x: unknown): x is Category {
  return typeof x === 'string' && (CATEGORIES as readonly string[]).includes(x);
}

export function typeOfCategory(c: Category): PostType {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(c) ? 'product' : 'event';
}

export function categoriesOf(type: PostType): readonly Category[] {
  return type === 'product' ? PRODUCT_CATEGORIES : EVENT_CATEGORIES;
}

export const CATEGORY_EMOJI: Record<Category, string> = {
  drinks: '🥤', snacks: '🍿', electronics: '🎧', beauty: '💄', food: '🍜', household: '🧺',
  life: '🌿', love: '💌', work: '💼', family: '🏠', education: '🎓', other: '✨',
};

/** Chinese names are the canonical spec names (≤4 chars, §2). */
export const CATEGORY_ZH: Record<Category, string> = {
  drinks: '饮料', snacks: '零食', electronics: '电子产品', beauty: '美妆个护', food: '餐饮美食', household: '日用百货',
  life: '生活', love: '情感', work: '职场', family: '家庭', education: '教育', other: '其他',
};

export function categoryFromZh(zh: string): Category | undefined {
  return (Object.keys(CATEGORY_ZH) as Category[]).find((k) => CATEGORY_ZH[k] === zh);
}

const NAMES: Record<Exclude<Locale, 'zh'>, Record<Category, string>> = {
  en: { drinks: 'Drinks', snacks: 'Snacks', electronics: 'Electronics', beauty: 'Beauty & Care', food: 'Dining', household: 'Daily Goods', life: 'Life', love: 'Relationships', work: 'Career', family: 'Family', education: 'Education', other: 'Other' },
  es: { drinks: 'Bebidas', snacks: 'Snacks', electronics: 'Electrónica', beauty: 'Belleza y cuidado', food: 'Restaurantes', household: 'Hogar', life: 'Vida', love: 'Relaciones', work: 'Trabajo', family: 'Familia', education: 'Educación', other: 'Otros' },
  fr: { drinks: 'Boissons', snacks: 'Collations', electronics: 'Électronique', beauty: 'Beauté & soins', food: 'Restaurants', household: 'Maison', life: 'Vie', love: 'Relations', work: 'Carrière', family: 'Famille', education: 'Éducation', other: 'Autre' },
  ja: { drinks: 'ドリンク', snacks: 'お菓子', electronics: 'ガジェット', beauty: '美容', food: '外食', household: '日用品', life: 'ライフ', love: '恋愛', work: '仕事', family: '家族', education: '教育', other: 'その他' },
  ko: { drinks: '음료', snacks: '간식', electronics: '전자제품', beauty: '뷰티', food: '맛집', household: '생활용품', life: '생활', love: '연애', work: '직장', family: '가족', education: '교육', other: '기타' },
  it: { drinks: 'Bevande', snacks: 'Snack', electronics: 'Elettronica', beauty: 'Bellezza', food: 'Ristoranti', household: 'Casa', life: 'Vita', love: 'Relazioni', work: 'Lavoro', family: 'Famiglia', education: 'Istruzione', other: 'Altro' },
};

const BOARD_NAMES: Record<Locale, Record<'drinks' | 'food' | 'event', string>> = {
  zh: { drinks: '饮料', food: '食品', event: '事件' },
  en: { drinks: 'Drinks', food: 'Food', event: 'Events' },
  es: { drinks: 'Bebidas', food: 'Comida', event: 'Eventos' },
  fr: { drinks: 'Boissons', food: 'Cuisine', event: 'Événements' },
  ja: { drinks: 'ドリンク', food: '食べ物', event: 'イベント' },
  ko: { drinks: '음료', food: '음식', event: '이벤트' },
  it: { drinks: 'Bevande', food: 'Cibo', event: 'Eventi' },
};

export const FOR_YOU: Record<Locale, string> = { zh: '推荐', en: 'For You', es: 'Para ti', fr: 'Pour toi', ja: 'おすすめ', ko: '추천', it: 'Per te' };

export function categoryName(c: Category, locale: Locale): string {
  return locale === 'zh' ? CATEGORY_ZH[c] : NAMES[locale][c];
}

/** §6 — board categories and the scale each one's entries are read with. */
export const BOARD_CATEGORIES = ['drinks', 'food', 'event'] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];
export const BOARD_MEMBERS: Record<BoardCategory, readonly Category[]> = {
  drinks: ['drinks'],
  food: ['snacks', 'food'],
  event: EVENT_CATEGORIES,
};
export const BOARD_EMOJI: Record<BoardCategory, string> = { drinks: '🥤', food: '🍽️', event: '🎉' };

export function boardCategoryName(c: BoardCategory, locale: Locale): string {
  return BOARD_NAMES[locale][c];
}
