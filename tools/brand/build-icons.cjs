/**
 * Myna app icon — "walking myna, black & white" (chosen 2026-11-12).
 * A singing myna in profile: solid silhouette, wing set off by a negative-space crescent, happy closed
 * eye, two chirp marks. Generates every icon/splash asset in apps/mobile/assets from one vector source.
 *   node tools/brand/build-icons.cjs        (needs Playwright + Chromium installed)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '../../apps/mobile/assets');

// Geometry is drawn in a 1254-unit square (the reference artwork); MARK() maps it into 1024 space.
const P = {
  body: `M500 605 C560 560 600 500 630 452 C680 380 740 345 800 345 C860 345 905 368 930 393
    C980 388 1030 395 1065 410 C1010 440 940 475 915 545 C930 600 935 650 925 700
    C900 820 780 905 620 928 C540 905 470 905 410 925 C340 948 270 980 205 995
    C188 996 182 988 192 975 C230 925 275 885 315 855 C290 850 250 842 218 834
    C205 830 207 822 220 818 C330 735 420 660 500 605 Z`,
  crescent: 'M492 610 C580 566 650 556 702 574 C764 596 764 694 722 764 C672 836 520 862 314 858 L214 832 Z',
  wing: 'M222 830 C335 745 470 642 578 627 C638 620 652 655 634 690 C590 770 432 836 302 840 C268 840 240 836 222 830 Z',
  leg: 'M606 922 L652 1016 L708 1016 L644 932 Z',
  foot: 'M528 1050 C540 1026 590 1014 662 1014 C740 1014 800 1026 815 1050 Z',
  eye: 'M736 476 C741 430 770 404 800 404 C830 404 854 424 860 452',
  chirp: 'M968 226 L952 300 M1086 270 L1026 330',
};

/** The bird. ink = silhouette colour, paper = the negative-space colour (wing crescent, eye). */
function mark({ k = 1, ink = '#111111', paper = '#FFFFFF', chirps = true } = {}) {
  return `<g transform="translate(512 512) scale(${0.879 * k}) translate(-627.5 -627.5)">
    <path d="${P.body}" fill="${ink}"/>
    <path d="${P.crescent}" fill="${paper}"/>
    <path d="${P.wing}" fill="${ink}"/>
    <path d="${P.leg}" fill="${ink}"/><path d="${P.foot}" fill="${ink}"/>
    <path d="${P.eye}" fill="none" stroke="${paper}" stroke-width="24" stroke-linecap="round"/>
    ${chirps ? `<path d="${P.chirp}" fill="none" stroke="${ink}" stroke-width="34" stroke-linecap="round"/>` : ''}
  </g>`;
}

/** Single-colour silhouette with real holes (Android themed icon / notification icon are alpha masks). */
function silhouette(k, fill) {
  return `<defs><mask id="holes"><rect width="1024" height="1024" fill="#fff"/>
      <g transform="translate(512 512) scale(${0.879 * k}) translate(-627.5 -627.5)">
        <path d="${P.crescent}" fill="#000"/><path d="${P.wing}" fill="#fff"/>
        <path d="${P.eye}" fill="none" stroke="#000" stroke-width="24" stroke-linecap="round"/></g></mask></defs>
    <g mask="url(#holes)">${mark({ k, ink: fill, paper: fill })}</g>`;
}

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
const WHITE = '<rect width="1024" height="1024" fill="#FFFFFF"/>';
const ANDROID_K = 0.74; // keep the bird inside the 66% safe circle of adaptive icons

const assets = {
  'icon.png': { svg: svg(WHITE + mark()), size: 1024 },
  'android-icon-background.png': { svg: svg(WHITE), size: 1024 },
  'android-icon-foreground.png': { svg: svg(mark({ k: ANDROID_K })), size: 1024, transparent: true },
  'android-icon-monochrome.png': { svg: svg(silhouette(ANDROID_K, '#000')), size: 1024, transparent: true },
  'notification-icon.png': { svg: svg(silhouette(1, '#fff')), size: 96, transparent: true },
  'splash-icon.png': { svg: svg(mark()), size: 1024, transparent: true },
  'splash-icon-dark.png': { svg: svg(mark({ ink: '#F4F2EE', paper: '#16171B' })), size: 1024, transparent: true },
  'favicon.png': { svg: svg(`<clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#r)">${WHITE}${mark()}</g>`), size: 48, transparent: true },
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
  // The app draws the same bird for its in-app logo.
  fs.writeFileSync(path.join(__dirname, '../../apps/mobile/src/components/mark-paths.json'), JSON.stringify(P, null, 2) + '\n');
  await browser.close();
})();
