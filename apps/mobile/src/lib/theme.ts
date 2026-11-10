/** Design tokens from the v0.8 prototype (spec §2). Light and dark map 1:1. */
export const brand = {
  red: '#FF5A3C',
  yellow: '#FFC93C',
  yellowDeep: '#FFB020',
  /** Distribution bar colours, tier 1 → tier 5. */
  bars: ['#FF5A3C', '#FF9F43', '#FFC93C', '#51CF66', '#0CA678'] as const,
};

export const light = {
  bg: '#F6F5F2', card: '#FFFFFF', ink: '#1A1A1A', sub: '#555555', body: '#444444', muted: '#8A8680', faint: '#BBBBBB',
  line: '#EEEAE4', seg: '#EAE7E1', soft: '#F1EFEA', track: '#F0EEE9', optbg: '#FAF9F7', optSel: '#FFF0EB',
  navbg: 'rgba(255,255,255,0.97)', mask: 'rgba(0,0,0,0.45)', disabled: '#B9B5AD',
};

export const dark: typeof light = {
  bg: '#16171B', card: '#232429', ink: '#F4F2EE', sub: '#C9C6C0', body: '#D8D5CF', muted: '#9B978E', faint: '#6E6B64',
  line: '#33343C', seg: '#2B2C33', soft: '#2B2C33', track: '#2E2F36', optbg: '#26272E', optSel: '#3A2620',
  navbg: 'rgba(28,29,34,0.97)', mask: 'rgba(0,0,0,0.6)', disabled: '#55524C',
};

export type Palette = typeof light;

export function avgColors(avg: number | null, p: Palette): { bg: string; fg: string } {
  if (avg === null) return { bg: p.soft, fg: p.muted };
  if (avg >= 4) return { bg: '#E6F9ED', fg: '#078043' };
  if (avg >= 2.5) return { bg: '#FFF3C4', fg: '#8A6D00' };
  return { bg: '#FFE8E2', fg: '#C92A1A' };
}

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
