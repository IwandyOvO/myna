import { type Category, typeOfCategory, type PostType } from './categories';
import type { Locale } from './locales';

export interface Placeholder {
  title: string;
  desc: string;
}

/** §5.4 — per-category publish placeholders (zh/en verbatim). */
const BY_CATEGORY: Record<'zh' | 'en', Record<Category, Placeholder>> = {
  zh: {
    drinks: { title: '比如：新出的樱花汽水，好喝吗？', desc: '比如：什么口味、多少钱、在哪买到的，第一口什么感觉…' },
    snacks: { title: '比如：新出的螺蛳粉薯片，好吃吗？', desc: '比如：什么味道、脆不脆、多少钱一包…' },
    electronics: { title: '比如：刚发布的降噪耳机，值得买吗？', desc: '比如：价格、用了几天、和上一代比怎么样…' },
    beauty: { title: '比如：新出的修护面膜，好用吗？', desc: '比如：肤质、使用感、有没有过敏…' },
    food: { title: '比如：楼下新开的拉面店，好吃吗？', desc: '比如：招牌菜、价格、要不要排队…' },
    household: { title: '比如：新买的抽屉收纳盒，好用吗？', desc: '比如：材质、容量、是真方便还是占地方…' },
    life: { title: '比如：周末的跳蚤市集，值得去吗？', desc: '比如：时间地点、门票、适合带谁一起…' },
    love: { title: '比如：相亲对象约我看电影，去吗？', desc: '比如：对方什么情况、我纠结在哪…' },
    work: { title: '比如：部门团建去爬山，去吗？', desc: '比如：自费还是公司出、都有谁、要不要请假…' },
    family: { title: '比如：周末家庭聚餐，去吗？', desc: '比如：都有谁、在哪吃、我纠结在哪…' },
    education: { title: '比如：周一早八的选修课，值得选吗？', desc: '比如：老师怎么样、给分松不松、点名吗…' },
    other: { title: '比如：朋友约我去露营，去吗？', desc: '比如：时间地点、都有谁、大概什么情况…' },
  },
  en: {
    drinks: { title: 'e.g. Is the new sakura soda any good?', desc: 'Flavor, price, where you got it, first sip…' },
    snacks: { title: 'e.g. Are the new luosifen chips good?', desc: 'Flavor, crunch, price per bag…' },
    electronics: { title: 'e.g. Are the new noise-cancelling earbuds worth it?', desc: 'Price, days used, vs the last gen…' },
    beauty: { title: 'e.g. Is the new repair mask any good?', desc: 'Your skin type, how it feels, any irritation…' },
    food: { title: 'e.g. Is the new ramen place downstairs good?', desc: 'Signature dish, price, wait time…' },
    household: { title: 'e.g. Is this drawer organizer actually useful?', desc: 'Material, capacity, handy or just clutter…' },
    life: { title: 'e.g. Is the weekend flea market worth going to?', desc: 'When, where, ticket, who to bring…' },
    love: { title: 'e.g. My blind date asked me to a movie — should I go?', desc: "About them, and what's holding you back…" },
    work: { title: "e.g. Team outing is a hike — should I go?", desc: "Who pays, who's going, is it skippable…" },
    family: { title: 'e.g. Family dinner this weekend — should I go?', desc: "Who's there, where, what's the dilemma…" },
    education: { title: 'e.g. Is the 8am elective worth taking?', desc: 'The teacher, grading, attendance…' },
    other: { title: 'e.g. Friends invited me camping — should I go?', desc: 'When, where, who, the situation…' },
  },
};

/** Other 5 UI languages fall back to a per-type example (copy from the prototype). */
const BY_TYPE: Record<Exclude<Locale, 'zh' | 'en'>, Record<PostType, Placeholder>> = {
  es: { product: { title: 'Ej.: ¿está bueno el nuevo XX?', desc: 'Añade contexto: dónde lo viste, cuánto cuesta, tu duda…' }, event: { title: 'Ej.: ¿vale la pena ir a este evento?', desc: 'Añade contexto: cuándo es, dónde, quién va, tu duda…' } },
  fr: { product: { title: 'Ex. : le nouveau XX, il est bien ?', desc: 'Ajoutez du contexte : où vu, prix, hésitation…' }, event: { title: "Ex. : cet événement, j'y vais ?", desc: 'Ajoutez du contexte : quand, où, qui y va, hésitation…' } },
  ja: { product: { title: '例：新しいXX、いい？', desc: '背景を追加：どこで見た？いくら？迷ってる点は…' }, event: { title: '例：このイベント、行く？', desc: '背景を追加：いつ、どこで、誰と、迷ってる点は…' } },
  ko: { product: { title: '예: 새로 나온 XX, 괜찮아요?', desc: '배경을 적어 주세요: 어디서 봤는지, 가격, 고민되는 점…' }, event: { title: '예: 이 행사, 갈까요?', desc: '배경을 적어 주세요: 언제, 어디서, 누가 가는지, 고민되는 점…' } },
  it: { product: { title: 'Es.: il nuovo XX è buono?', desc: "Aggiungi contesto: dove l'hai visto, prezzo, dubbi…" }, event: { title: 'Es.: questo evento, ci vado?', desc: 'Aggiungi contesto: quando, dove, chi viene, dubbi…' } },
};

export function placeholderFor(category: Category, locale: Locale): Placeholder {
  if (locale === 'zh' || locale === 'en') return BY_CATEGORY[locale][category];
  return BY_TYPE[locale][typeOfCategory(category)];
}
