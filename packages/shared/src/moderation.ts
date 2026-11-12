/**
 * Spec §4.2 tone: "有梗但不骂人" (funny, not mean). A small, conservative block-list for clear
 * profanity, insults and slurs in titles, bodies, comments and nicknames. It is a first line of
 * defence only — reports + the admin queue handle everything else. Keep entries unambiguous to
 * avoid blocking innocent text (English terms match whole words only).
 */
const ZH = ['傻逼', '傻b', '煞笔', '沙比', '操你', '草泥马', '你妈死', '妈的智障', '去死吧', '尼玛的', '狗日的', '贱人', '婊子', '脑残', '弱智儿'];
const EN = ['fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'asshole', 'retard', 'faggot', 'nigger', 'whore', 'slut', 'dickhead'];
const EN_RE = new RegExp(`\\b(${EN.join('|')})\\b`, 'i');

/** Normalises common evasions: full-width letters, spaces/dots between characters. */
function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s.·•_*\-]+/g, '');
}

export function containsBlockedWords(text: string): boolean {
  if (!text) return false;
  if (EN_RE.test(text.normalize('NFKC').replace(/[_\-.*]+/g, ' '))) return true;
  const n = normalise(text);
  return ZH.some((w) => n.includes(w));
}
