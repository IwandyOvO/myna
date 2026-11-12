import { categoryName, translate, type Locale, type PostCard } from '@myna/shared';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Share landing page for https://<api>/p/<postId>. Messaging apps read the Open Graph tags for the
 * link preview; people tap "Open in Myna" (myna:// deep link) or go to the store. Blind scores stay hidden.
 */
export function landingPage(post: PostCard | null, locale: Locale, appStoreUrl: string | null): string {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const title = post ? post.title : 'Myna';
  const score = post && post.avg !== null && !post.locked ? `${post.avg.toFixed(1)} / 5 · ${t('reviews_count', { n: post.total })}` : post ? t('reviews_count', { n: post.total }) : '';
  const desc = post ? `${categoryName(post.category, locale)} · ${score}` : t('slogan');
  const deepLink = post ? `myna://post/${post.id}` : 'myna://';
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Myna</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Myna">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta name="twitter:card" content="summary">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; background: #F6F5F2; color: #1A1A1A; display: grid; place-items: center; min-height: 100vh; }
  @media (prefers-color-scheme: dark) { body { background: #16171B; color: #F4F2EE; } .card { background: #232429 !important; } }
  .card { background: #fff; border-radius: 20px; padding: 28px 24px; max-width: 420px; margin: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); text-align: center; }
  .emoji { font-size: 64px; } h1 { font-size: 20px; margin: 12px 0 6px; } p { color: #8A8680; margin: 0 0 20px; }
  .score { font-size: 40px; font-weight: 900; margin: 8px 0; }
  a.btn { display: block; background: #FF5A3C; color: #fff; text-decoration: none; font-weight: 800; padding: 14px; border-radius: 999px; margin-top: 10px; }
  a.ghost { background: transparent; color: inherit; border: 1.5px solid #EEEAE4; }
</style>
</head>
<body>
<div class="card">
  <div class="emoji">${esc(post?.emoji ?? '🐦')}</div>
  <h1>${esc(title)}</h1>
  ${post && post.avg !== null && !post.locked ? `<div class="score">${post.avg.toFixed(1)}</div>` : ''}
  <p>${esc(desc)}</p>
  <a class="btn" href="${deepLink}">${esc(t('open_in_app'))}</a>
  ${appStoreUrl ? `<a class="btn ghost" href="${esc(appStoreUrl)}">${esc(t('get_app'))}</a>` : ''}
  <p style="margin-top:18px;font-size:12px">${esc(t('slogan'))}</p>
</div>
</body>
</html>`;
}
