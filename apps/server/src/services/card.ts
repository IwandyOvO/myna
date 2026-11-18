import { Resvg } from '@resvg/resvg-js';
import { categoryName, translate, type Locale, type PostCard, type VerdictKey } from '@myna/shared';

/**
 * 1200×630 share image for link previews (og:image): verdict, title, vote split and the best roast.
 * Rendered from SVG with system fonts (the Docker image installs a CJK font). Colour emoji don't render
 * in resvg, so the card uses text and shapes only.
 */
const W = 1200;
const H = 630;
const FONT = `'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans CJK KR', 'WenQuanYi Zen Hei', 'Noto Sans', 'DejaVu Sans', sans-serif`;

const VERDICT_COLORS: Record<VerdictKey, { bg: string; fg: string }> = {
  controversial: { bg: '#F1E6FF', fg: '#6A1FB0' },
  legend: { bg: '#FFF1C2', fg: '#7A5200' },
  loved: { bg: '#E6F9ED', fg: '#078043' },
  flop: { bg: '#FFE8E2', fg: '#C92A1A' },
  hated: { bg: '#1A1A1A', fg: '#FFC93C' },
  mid: { bg: '#ECE9E3', fg: '#555555' },
  fresh: { bg: '#E7F0FF', fg: '#1F5BD8' },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Strip emoji / symbols the renderer can't draw (they would show as boxes). */
const drawable = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim();

/** Approximate advance width in em: CJK/fullwidth ≈ 1, everything else ≈ 0.56. */
const charW = (c: string) => (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 1 : 0.56);

/** Greedy wrap to `maxEm` per line, at most `lines` lines; the last line gets "…" if text remains. */
export function wrap(text: string, maxEm: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  let w = 0;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cw = charW(ch);
    if (w + cw <= maxEm || !cur) {
      cur += ch;
      w += cw;
      continue;
    }
    if (out.length === lines - 1) {
      // No room for another line: trim and mark the cut.
      out.push(Array.from(cur).slice(0, -1).join('').trimEnd() + '…');
      return out;
    }
    out.push(cur.trimEnd());
    cur = ch === ' ' ? '' : ch;
    w = cur ? cw : 0;
  }
  if (cur) out.push(cur.trimEnd());
  return out;
}

export function cardSvg(post: PostCard | null, locale: Locale): string {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#F6F5F2"/>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="12" fill="#FF5A3C"/>`);
  parts.push(`<text x="64" y="92" font-family="${FONT}" font-size="40" font-weight="900" fill="#1A1A1A">Myn<tspan fill="#FF5A3C">a</tspan></text>`);
  if (!post) {
    parts.push(`<text x="64" y="330" font-family="${FONT}" font-size="64" font-weight="900" fill="#1A1A1A">${esc(t('slogan'))}</text>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
  }
  parts.push(`<text x="${W - 64}" y="92" text-anchor="end" font-family="${FONT}" font-size="28" fill="#8A8680">${esc(categoryName(post.category, locale))}</text>`);

  // Verdict pill
  let y = 150;
  const key: VerdictKey | null = post.locked ? null : post.verdict;
  const label = key ? t(`v_${key}`) : t('locked_badge');
  const { bg, fg } = key ? VERDICT_COLORS[key] : { bg: '#ECE9E3', fg: '#8A8680' };
  const pillW = Math.round(Array.from(label).reduce((a, c) => a + charW(c), 0) * 44 + 64);
  parts.push(`<rect x="64" y="${y}" width="${pillW}" height="72" rx="36" fill="${bg}"/>`);
  parts.push(`<text x="96" y="${y + 50}" font-family="${FONT}" font-size="44" font-weight="900" fill="${fg}">${esc(label)}</text>`);
  if (!post.locked && post.avg !== null && post.total > 0) {
    parts.push(`<text x="${64 + pillW + 24}" y="${y + 48}" font-family="${FONT}" font-size="30" fill="#8A8680">${esc(`${t('ratings_fmt', { n: post.total })} · ${t('avg_fmt', { x: post.avg.toFixed(1) })}`)}</text>`);
  }

  // Title
  y += 140;
  const title = wrap(drawable(post.title) || post.title, 19, 2);
  title.forEach((line, i) => parts.push(`<text x="64" y="${y + i * 66}" font-family="${FONT}" font-size="56" font-weight="900" fill="#1A1A1A">${esc(line)}</text>`));
  y += title.length * 66 + 10;

  // Vote split
  if (post.split && !post.locked) {
    const barW = W - 128;
    const segs: { v: number; c: string }[] = [
      { v: post.split.low, c: '#FF5A3C' },
      { v: post.split.mid, c: '#FFC93C' },
      { v: post.split.high, c: '#0CA678' },
    ];
    parts.push(`<clipPath id="bar"><rect x="64" y="${y}" width="${barW}" height="24" rx="12"/></clipPath>`);
    parts.push(`<rect x="64" y="${y}" width="${barW}" height="24" rx="12" fill="#ECE9E3"/>`);
    let x = 64;
    const g: string[] = [];
    for (const s of segs) {
      const w = (s.v / 100) * barW;
      if (w > 0) g.push(`<rect x="${x}" y="${y}" width="${w}" height="24" fill="${s.c}"/>`);
      x += w;
    }
    parts.push(`<g clip-path="url(#bar)">${g.join('')}</g>`);
    const ly = y + 66;
    [
      { v: post.split.low, c: '#FF5A3C', x: 64, a: 'start' },
      { v: post.split.mid, c: '#B88A00', x: W / 2, a: 'middle' },
      { v: post.split.high, c: '#0CA678', x: W - 64, a: 'end' },
    ].forEach((l) => parts.push(`<text x="${l.x}" y="${ly}" text-anchor="${l.a}" font-family="${FONT}" font-size="34" font-weight="900" fill="${l.c}">${l.v}%</text>`));
    y = ly + 30;
  }

  // Best roast
  if (post.topComment && !post.locked) {
    const quote = wrap(`“${drawable(post.topComment.body)}”`, 32, 2);
    quote.forEach((line, i) => parts.push(`<text x="64" y="${Math.min(y + 50 + i * 44, H - 40)}" font-family="${FONT}" font-size="34" font-weight="700" fill="#444444">${esc(line)}</text>`));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
}

export function renderCard(post: PostCard | null, locale: Locale): Buffer {
  const svg = cardSvg(post, locale);
  const r = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Noto Sans CJK SC' }, fitTo: { mode: 'width', value: W } });
  return Buffer.from(r.render().asPng());
}
