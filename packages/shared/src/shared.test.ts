import { describe, expect, it } from 'vitest';
import {
  CATEGORIES, CATEGORY_SCALES, DICTIONARIES, LOCALES, addVote, genericScale, autoTags, average, categoryName,
  moveVote, placeholderFor, resolveLocale, scaleFor, scaleForBoard, timeAgo, translate,
} from './index';
import { OVERRIDES } from './i18n/overrides';

describe('scales', () => {
  it('zh/en category scales match spec §4.2 samples', () => {
    expect(scaleFor('drinks', 'zh').map((t) => t.label)).toEqual(['一口皱眉', '差点意思', '白开水+', '好喝', '吨吨吨']);
    expect(scaleFor('love', 'en')[4]).toEqual({ emoji: '😍', label: 'Lock It Down' });
    expect(scaleFor('education', 'en')[0].label).toBe('Learned a Whole Lot of Nothing');
  });
  it('"other" and non zh/en locales fall back to generic scales (§4.3)', () => {
    expect(scaleFor('other', 'zh').map((t) => t.label)).toEqual(['别去', '不推荐', '看情况', '值得去', '必冲']);
    expect(scaleFor('drinks', 'es')[4].label).toBe('De primera');
    expect(scaleFor('work', 'ja')[0]).toEqual({ emoji: '🙅', label: '行かない' });
  });
  it('generic zh product scale follows the §4.2 tone rule (spec v0.8.1)', () => {
    expect(genericScale('product', 'zh').map((t) => t.label)).toEqual(['踩雷', '不太行', '一般', '不错', '顶级']);
    expect(JSON.stringify([CATEGORY_SCALES, LOCALES.map((l) => [genericScale('product', l), genericScale('event', l)])])).not.toContain('屎');
  });
  it('board scales map drinks→drinks, food→food, event→generic event (§6)', () => {
    expect(scaleForBoard('food', 'zh')[4].label).toBe('排队也值');
    expect(scaleForBoard('event', 'en')[4].label).toBe('Must Go');
  });
  it('never uses 💩 anywhere (§2)', () => {
    const all = JSON.stringify([CATEGORY_SCALES, LOCALES.map((l) => CATEGORIES.map((c) => scaleFor(c, l))), DICTIONARIES]);
    expect(all).not.toContain('💩');
  });
  it('zh category scale labels are ≤ 4 characters (§2)', () => {
    for (const c of CATEGORIES) for (const t of scaleFor(c, 'zh')) expect([...t.label].length).toBeLessThanOrEqual(4);
    for (const c of CATEGORIES) expect([...categoryName(c, 'zh')].length).toBeLessThanOrEqual(4);
  });
});

describe('rating math', () => {
  it('average rounds to one decimal and handles empty', () => {
    expect(average([0, 0, 0, 0, 0])).toBeNull();
    expect(average([180, 120, 80, 40, 22])).toBe(2.1); // spec §12 says ≈2.1
    expect(average([0, 0, 0, 0, 3])).toBe(5);
  });
  it('add/move votes', () => {
    expect(addVote([0, 0, 0, 0, 0], 3)).toEqual([0, 0, 1, 0, 0]);
    expect(moveVote([0, 0, 1, 0, 0], 3, 5)).toEqual([0, 0, 0, 0, 1]);
    expect(() => moveVote([0, 0, 0, 0, 0], 1, 2)).toThrow();
  });
  it('auto tags', () => {
    const now = new Date('2026-11-10');
    expect(autoTags([4, 8, 22, 60, 96], new Date('2026-11-01'), now)).toEqual(['potential']);
    expect(autoTags([4, 8, 22, 60, 96], new Date('2026-01-01'), now)).toEqual([]);
    expect(autoTags([180, 120, 80, 40, 22], new Date('2026-01-01'), now)).toEqual(['warn']);
  });
});

describe('i18n', () => {
  it('every override key exists in all 7 languages', () => {
    const keys = Object.keys(OVERRIDES.en).sort();
    for (const l of LOCALES) expect(Object.keys(OVERRIDES[l]).sort()).toEqual(keys);
  });
  it('every base key exists in all 7 languages', () => {
    const keys = Object.keys(DICTIONARIES.en);
    for (const l of LOCALES) for (const k of keys) expect(DICTIONARIES[l][k], `${l}.${k}`).toBeTruthy();
  });
  it('translate fills vars and falls back', () => {
    expect(translate('zh', 'cta_edit_fmt', { x: 2 })).toBe('修改评价（还可改 2 次）');
    expect(translate('ko', 'no_such_key')).toBe('no_such_key');
  });
  it('timeAgo needs no Intl.RelativeTimeFormat (absent on Hermes)', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(timeAgo('zh', '2026-11-10T07:00:00Z', now)).toBe('5 小时前');
    expect(timeAgo('en', '2026-11-10T11:58:30Z', now)).toBe('1 min ago');
    expect(timeAgo('ja', '2026-11-07T12:00:00Z', now)).toBe('3日前');
    expect(timeAgo('it', '2026-11-10T11:59:59Z', now)).toBe('adesso');
    expect(timeAgo('fr', '2026-01-02T00:00:00Z', now)).toBe('2026-01-02');
  });
  it('resolveLocale', () => {
    expect(resolveLocale('zh-Hans-CN')).toBe('zh');
    expect(resolveLocale('pt-BR')).toBe('en');
  });
  it('placeholders follow category for zh/en, type for others (§5.4)', () => {
    expect(placeholderFor('work', 'en').title).toBe('e.g. Team outing is a hike — should I go?');
    expect(placeholderFor('work', 'fr').title).toBe("Ex. : cet événement, j'y vais ?");
  });
});
