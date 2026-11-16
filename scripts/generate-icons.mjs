// Renders the PWA icons and Open Graph image from inline SVG using the
// Playwright Chromium that is available in the dev environment.
// Run manually (npm run generate:icons); the PNGs are committed.
import { createRequire } from "node:module";

// Resolve playwright from the project or from NODE_PATH (it is not a project dependency).
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const mark = (bg = "#245033") => `
  <rect width="512" height="512" fill="${bg}"/>
  <path d="M64 400 208 160l80 128 48-64 112 176z" fill="#f5f2ea"/>
  <path d="m176 216 32-56 32 51-16 13-16-16z" fill="${bg}"/>
  <circle cx="368" cy="144" r="48" fill="#e08a2b"/>`;

const icons = [
  { file: "icon-192.png", size: 192, svg: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#c)">${mark()}</g></svg>` },
  { file: "icon-512.png", size: 512, svg: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#c)">${mark()}</g></svg>` },
  // Maskable: full-bleed background, artwork inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, svg: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#245033"/><g transform="translate(76.8 76.8) scale(.7)">${mark()}</g></svg>` },
  { file: "apple-touch-icon.png", size: 180, svg: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${mark()}</svg>` },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon.svg.replace("<svg ", `<svg width="${icon.size}" height="${icon.size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
}
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;font-family:system-ui,sans-serif;background:linear-gradient(#ecf4f9,#f5f2ea);position:relative;overflow:hidden">
  <svg viewBox="0 0 1440 320" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:260px"><path d="M0 250 180 120l120 90 160-150 200 170 140-90 220 140 180-110 240 130v70H0z" fill="#aed0b8" opacity=".55"/><path d="M0 290 140 200l150 70 210-130 170 120 190-90 160 80 200-110 220 120v60H0z" fill="#3d7a4f" opacity=".7"/><path d="M0 320V300l200-60 180 50 240-70 200 60 230-50 190 40 200-40v90z" fill="#245033"/></svg>
  <div style="position:absolute;left:80px;top:80px;display:flex;align-items:center;gap:24px">
    <svg width="96" height="96" viewBox="0 0 512 512"><clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#c)">${mark()}</g></svg>
    <span style="font-size:72px;font-weight:800;color:#1b3d27;letter-spacing:-2px">TurNær</span>
  </div>
  <p style="position:absolute;left:80px;top:210px;margin:0;font-size:56px;font-weight:800;color:#1c1f1e;letter-spacing:-1px">Find a great hike near you</p>
  <p style="position:absolute;left:80px;top:290px;margin:0;font-size:30px;color:#4a504d">Trips, trails, weather and terrain in Norway</p>
</body></html>`);
await page.screenshot({ path: "public/icons/og-image.png" });
await browser.close();
console.log("Icons generated");
