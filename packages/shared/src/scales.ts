import { type BoardCategory, type Category, type PostType, typeOfCategory } from './categories';
import type { Locale } from './locales';

/** One rung of a five-tier scale. Index 0 = tier 1 (worst) … index 4 = tier 5 (best). */
export interface ScaleTier {
  emoji: string;
  label: string;
}
export type Scale = readonly [ScaleTier, ScaleTier, ScaleTier, ScaleTier, ScaleTier];

const s = (pairs: [string, string][]): Scale => pairs.map(([emoji, label]) => ({ emoji, label })) as unknown as Scale;

/**
 * §4.2 — category-specific scales. Copy is verbatim from the spec; do not edit
 * without a spec change. Only zh and en have category scales; "other" uses the
 * generic event scale.
 */
export const CATEGORY_SCALES: Record<'zh' | 'en', Partial<Record<Category, Scale>>> = {
  zh: {
    drinks: s([['👎', '一口皱眉'], ['😖', '差点意思'], ['😐', '白开水+'], ['😋', '好喝'], ['🤩', '吨吨吨']]),
    snacks: s([['👎', '拆开后悔'], ['😖', '就这？'], ['😐', '解个馋'], ['😋', '停不下来'], ['🤩', '一包炫完']]),
    electronics: s([['👎', '到手吃灰'], ['😖', '智商税'], ['😐', '能用'], ['😄', '真香'], ['🤩', '闭眼入']]),
    beauty: s([['👎', '拔草预警'], ['😖', '鸡肋'], ['😐', '无功无过'], ['😊', '回购款'], ['🤩', '本命']]),
    food: s([['👎', '味同嚼蜡'], ['😖', '名不副实'], ['😐', '填饱肚子'], ['😋', '下饭'], ['🤩', '排队也值']]),
    household: s([['👎', '闲置加一'], ['😖', '有点拉胯'], ['😐', '凑合'], ['😄', '好用'], ['🤩', '无限回购']]),
    life: s([['🙅', '去了后悔'], ['😒', '浪费时间'], ['🤔', '看心情'], ['👍', '值得一去'], ['🚀', '冲就完了']]),
    love: s([['💔', '快跑'], ['😒', '下头'], ['🤔', '再观察'], ['💗', '有点心动'], ['😍', '锁死']]),
    work: s([['👎', '想辞职了'], ['😖', '内耗'], ['😐', '混日子'], ['😄', '有奔头'], ['🚀', '前途无量']]),
    family: s([['🙅', '能躲就躲'], ['😖', '压力山大'], ['😐', '例行公事'], ['😊', '挺温馨'], ['🥰', '治愈']]),
    education: s([['👎', '学个寂寞'], ['😖', '催眠'], ['😐', '中规中矩'], ['😄', '干货满满'], ['🤩', '听君一席']]),
  },
  en: {
    drinks: s([['👎', 'Meme-Face Bad'], ['😖', 'Falls Short'], ['😐', 'Meh'], ['😋', 'Tasty'], ['🤩', 'Chug-worthy']]),
    snacks: s([['👎', 'Instant Regret'], ['😖', "That's It?"], ['😐', 'Snackable'], ['😋', "Can't Stop"], ['🤩', 'Demolished']]),
    electronics: s([['👎', 'Dust Collector'], ['😖', 'Sucker Tax'], ['😐', 'It Works'], ['😄', 'Actually Great'], ['🤩', 'No-Brainer']]),
    beauty: s([['👎', 'De-influenced'], ['😖', 'Pointless'], ['😐', 'Just Fine'], ['😊', 'Repurchase'], ['🤩', 'Holy Grail']]),
    food: s([['👎', 'Like Chewing Wax'], ['😖', 'Overhyped'], ['😐', 'Fills You Up'], ['😋', 'Hits the Spot'], ['🤩', 'Worth the Line']]),
    household: s([['👎', 'Clutter +1'], ['😖', 'Kinda Flimsy'], ['😐', 'Usable'], ['😄', 'Handy'], ['🤩', 'Restock Forever']]),
    life: s([['🙅', 'Instant Regret'], ['😒', 'Waste of Time'], ['🤔', 'Depends'], ['👍', 'Worth It'], ['🚀', 'Just Go']]),
    love: s([['💔', 'Run'], ['😒', 'The Ick'], ['🤔', 'Keep Watching'], ['💗', 'Butterflies'], ['😍', 'Lock It Down']]),
    work: s([['👎', 'Want to Quit Already'], ['😖', 'Soul-Draining'], ['😐', 'Paycheck Mode'], ['😄', 'Promising'], ['🚀', "Sky's the Limit"]]),
    family: s([['🙅', 'Dodge If Possible'], ['😖', 'Stressful'], ['😐', 'Routine'], ['😊', 'Cozy'], ['🥰', 'Healing']]),
    education: s([['👎', 'Learned a Whole Lot of Nothing'], ['😖', 'Snoozefest'], ['😐', 'By the Book'], ['😄', 'Packed With Value'], ['🤩', 'Mind-Blown']]),
  },
};

export const GENERIC_EMOJI: Record<PostType, readonly string[]> = {
  product: ['👎', '😖', '😐', '😋', '🤩'],
  event: ['🙅', '😒', '🤔', '👍', '🚀'],
};

/** §4.3 — generic fallback scales (zh/en from the spec, the rest from the prototype). */
const GENERIC_LABELS: Record<Locale, Record<PostType, readonly string[]>> = {
  zh: { product: ['屎', '不好喝', '一般', '好喝', '顶级'], event: ['别去', '不推荐', '看情况', '值得去', '必冲'] },
  en: { product: ['Terrible', 'Bad', 'Okay', 'Good', 'Top Tier'], event: ['Skip It', 'Not Recommended', 'Depends', 'Worth It', 'Must Go'] },
  es: { product: ['Pésimo', 'Malo', 'Regular', 'Bueno', 'De primera'], event: ['No vayas', 'No lo recomiendo', 'Depende', 'Vale la pena', '¡Imperdible!'] },
  fr: { product: ['Nul', 'Mauvais', 'Moyen', 'Bon', 'Excellent'], event: ["N'y va pas", 'Pas recommandé', 'Ça dépend', 'Ça vaut le coup', 'À ne pas manquer'] },
  ja: { product: ['最悪', 'まずい', 'まあまあ', 'おいしい', '神レベル'], event: ['行かない', 'おすすめしない', '場合による', '行く価値あり', '絶対行くべき'] },
  ko: { product: ['최악', '맛없어', '보통', '맛있어', '최고'], event: ['가지 마', '비추천', '상황 봐서', '갈 만해', '무조건 가야 해'] },
  it: { product: ['Pessimo', 'Cattivo', 'Nella media', 'Buono', 'Eccellente'], event: ['Non andare', 'Sconsigliato', 'Dipende', 'Ne vale la pena', 'Imperdibile'] },
};

export function genericScale(type: PostType, locale: Locale): Scale {
  return GENERIC_LABELS[locale][type].map((label, i) => ({ emoji: GENERIC_EMOJI[type][i], label })) as unknown as Scale;
}

/** The single entry point every screen uses to label tiers (§4.2: "全线统一按此解析"). */
export function scaleFor(category: Category, locale: Locale): Scale {
  if (locale === 'zh' || locale === 'en') {
    const specific = CATEGORY_SCALES[locale][category];
    if (specific) return specific;
  }
  return genericScale(typeOfCategory(category), locale);
}

/** §6 — board entries are read with a fixed scale per board. */
export function scaleForBoard(board: BoardCategory, locale: Locale): Scale {
  if (board === 'drinks') return scaleFor('drinks', locale);
  if (board === 'food') return scaleFor('food', locale);
  return genericScale('event', locale);
}

export type Tier = 1 | 2 | 3 | 4 | 5;
export function isTier(x: unknown): x is Tier {
  return x === 1 || x === 2 || x === 3 || x === 4 || x === 5;
}
export function tierOf(scale: Scale, tier: Tier): ScaleTier {
  return scale[tier - 1];
}
