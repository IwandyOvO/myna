/**
 * Myna app icon — "bubble-bird, soft light" (chosen 2026-11).
 * Generates every icon/splash asset in apps/mobile/assets from one vector source.
 *   node tools/brand/build-icons.cjs        (needs Playwright + Chromium installed)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '../../apps/mobile/assets');
const RED = '#FF5A3C', INK = '#17171A';

const BODY = `M392 300 H612 A168 168 0 0 1 780 468 V516 A168 168 0 0 1 612 684 H470
  C430 684 392 700 362 728 C338 750 312 768 282 778 C300 752 310 724 312 694
  C266 664 224 604 224 516 V468 A168 168 0 0 1 392 300 Z`;
const BEAK_TOP = 'M772 418 C820 420 866 432 902 450 C866 462 822 470 776 470 Z';
const BEAK_BOTTOM = 'M776 482 C812 484 846 494 872 508 C842 516 808 518 772 512 Z';

const defs = `<defs>
  <radialGradient id="bg" cx="38%" cy="28%" r="85%"><stop offset="0" stop-color="#FBFAF7"/><stop offset="1" stop-color="#EFEBE3"/></radialGradient>
  <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34343A"/><stop offset="1" stop-color="#101012"/></linearGradient>
  <linearGradient id="inkDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF8F4"/><stop offset="1" stop-color="#D8D3CA"/></linearGradient>
  <linearGradient id="yel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD866"/><stop offset="1" stop-color="#FFB21E"/></linearGradient>
  <radialGradient id="sh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <mask id="eyeHole"><rect width="1024" height="1024" fill="#fff"/><circle cx="648" cy="440" r="46" fill="#000"/></mask>
</defs>`;

/** The bird, centred on (512,512). k scales it (Android safe zone), dark = light-bodied variant for dark backgrounds. */
function mark({ k = 1, dark = false, shadow = true } = {}) {
  return `<g transform="translate(512 512) scale(${1.08 * k}) translate(-584 -540)">
    ${shadow && !dark ? '<ellipse cx="510" cy="826" rx="270" ry="34" fill="url(#sh)"/>' : ''}
    <path d="${BODY}" fill="url(#${dark ? 'inkDark' : 'ink'})"/>
    <path d="${BEAK_TOP}" fill="url(#yel)"/><path d="${BEAK_BOTTOM}" fill="#E9A000"/>
    <circle cx="648" cy="440" r="46" fill="url(#yel)"/><circle cx="659" cy="437" r="21" fill="${INK}"/>
    <circle cx="667" cy="428" r="7" fill="#fff" opacity=".9"/>
    <circle cx="930" cy="404" r="27" fill="${RED}"/>
  </g>`;
}

/** Single-colour silhouette for Android 13+ themed icons (the system tints it). */
function monochrome(k) {
  return `<g transform="translate(512 512) scale(${1.08 * k}) translate(-584 -540)" fill="#000">
    <path d="${BODY}" mask="url(#eyeHole)"/><circle cx="659" cy="437" r="21"/>
    <path d="${BEAK_TOP}"/><path d="${BEAK_BOTTOM}"/><circle cx="930" cy="404" r="27"/>
  </g>`;
}

const svg = (inner, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${defs}${inner}</svg>`;
const BG = '<rect width="1024" height="1024" fill="url(#bg)"/>';
// Android adaptive icons are masked to as little as a 66% circle: keep the bird well inside it.
const ANDROID_K = 0.7;

const assets = {
  'icon.png': { svg: svg(BG + mark()), size: 1024 },
  'android-icon-background.png': { svg: svg(BG), size: 1024 },
  'android-icon-foreground.png': { svg: svg(mark({ k: ANDROID_K })), size: 1024, transparent: true },
  'android-icon-monochrome.png': { svg: svg(monochrome(ANDROID_K)), size: 1024, transparent: true },
  'splash-icon.png': { svg: svg(mark({ shadow: false })), size: 1024, transparent: true },
  'splash-icon-dark.png': { svg: svg(mark({ dark: true })), size: 1024, transparent: true },
  'favicon.png': { svg: svg(`<clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#r)">${BG}${mark()}</g>`), size: 48, transparent: true },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, a] of Object.entries(assets)) {
    await page.setViewportSize({ width: a.size, height: a.size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${a.svg.replace('width="1024" height="1024" viewBox', `width="${a.size}" height="${a.size}" viewBox`)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, name), omitBackground: !!a.transparent, clip: { x: 0, y: 0, width: a.size, height: a.size } });
    console.log('wrote', name);
  }
  fs.writeFileSync(path.join(__dirname, 'icon.svg'), assets['icon.png'].svg);
  await browser.close();
})();
