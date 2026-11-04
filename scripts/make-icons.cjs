// Draws the app icons from the MyMoney mark. Needs Playwright with Chromium (NODE_PATH=$(npm root -g)).
// Usage: node scripts/make-icons.cjs   Writes public/*.png and assets/*.png (inputs for `npm run mobile:icons`).
const { chromium } = require('playwright');
const { writeFileSync, mkdirSync } = require('node:fs');

const PATH = 'M6 94V34h16V14h56v20h16v60H70V46H60v34H40V46H30v48z';
const BG = '#0a0a0a';
const MINT = '#34d399';

// `scale` is how much of the tile the mark fills; `radius` rounds the tile (0 = full-bleed square).
const svg = ({ scale, radius }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024"><rect width="100" height="100" rx="${radius}" fill="${BG}"/><g transform="translate(${50 - 50 * scale} ${50 - 50 * scale}) scale(${scale})"><path fill="${MINT}" d="${PATH}"/></g></svg>`;

const ROUNDED = svg({ scale: 0.64, radius: 22 });
const SQUARE = svg({ scale: 0.64, radius: 0 });
// Maskable icons are cropped by the phone to a circle or squircle; keep the mark inside the middle 60%.
const MASKABLE = svg({ scale: 0.5, radius: 0 });
const FOREGROUND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024"><g transform="translate(19 19) scale(.62)"><path fill="${MINT}" d="${PATH}"/></g></svg>`;
const BACKGROUND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024"><rect width="100" height="100" fill="${BG}"/></svg>`;

(async () => {
  mkdirSync('public', { recursive: true });
  mkdirSync('assets', { recursive: true });
  writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${BG}"/><path transform="translate(18 18) scale(.64)" fill="${MINT}" d="${PATH}"/></svg>`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const shot = async (markup, file, size, transparent = false) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
    await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await shot(ROUNDED, 'public/icon-192.png', 192, true);
  await shot(ROUNDED, 'public/icon-512.png', 512, true);
  await shot(MASKABLE, 'public/icon-maskable-512.png', 512);
  await shot(SQUARE, 'public/apple-touch-icon.png', 180); // iOS rounds the corners itself
  // Sources for the native launcher icons and splash screens.
  await shot(SQUARE, 'assets/icon-only.png', 1024);
  await shot(FOREGROUND, 'assets/icon-foreground.png', 1024, true);
  await shot(BACKGROUND, 'assets/icon-background.png', 1024);
  await shot(svg({ scale: 0.24, radius: 0 }).replace('width="1024" height="1024"', 'width="2732" height="2732"'), 'assets/splash.png', 2732);
  await shot(svg({ scale: 0.24, radius: 0 }).replace('width="1024" height="1024"', 'width="2732" height="2732"'), 'assets/splash-dark.png', 2732);
  await browser.close();
  console.log('icons written');
})();
