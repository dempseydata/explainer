// PROTOTYPE — renders the end of steps 1, 6, 11 and 12 in each look, plus a contact sheet.
// Usage: node shoot.mjs   → frames/<look>-s<step>.png, frames/contact.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

// WCAG relative luminance contrast
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const STEPS = [1, 6, 11, 12];
const LOOKS_TO_SHOOT = process.argv.slice(2).length ? process.argv.slice(2) : ['A', 'B', 'C'];
await mkdir('frames', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const look of LOOKS_TO_SHOOT) {
  await page.goto(`${base}/player.html?look=${look}&shot`);
  await page.waitForFunction(() => window.READY);
  const info = await page.evaluate(() => window.LOOK_INFO);
  const xh = await page.evaluate(({ font, size }) => {       // measured x-height of the label face at its set size
    const c = document.createElement('canvas').getContext('2d'); c.font = `${size}px ${font}`;
    return c.measureText('x').actualBoundingBoxAscent;
  }, info);
  console.log(`${look} ${info.name}: ${info.font} ${info.size}px, x-height ${xh.toFixed(1)}px; text ${contrast(info.tokens.graphite, info.tokens.paper).toFixed(1)}:1, accent ${contrast(info.tokens.accent, info.tokens.paper).toFixed(1)}:1`);
  for (const s of STEPS) {
    await page.evaluate(s => seek(STEP_T[s - 1] + STEPS[s - 1].d - 0.01), s);
    await page.screenshot({ path: `frames/${look}-s${s}.png` });
  }
}
// contact sheet: rows are looks, columns are steps
const cells = LOOKS_TO_SHOOT.map(l => `<div class=l>${l}</div>` + STEPS.map(s => `<img src="frames/${l}-s${s}.png">`).join('')).join('');
await page.setViewportSize({ width: 4 * 640 + 60, height: LOOKS_TO_SHOOT.length * 360 + 40 });
await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:40px repeat(4,640px);gap:4px;background:#222;font:24px system-ui;color:#fff;padding:4px}
  .l{display:flex;align-items:center;justify-content:center}.h{text-align:center;font-size:18px}img{width:640px;display:block}</style>
  <div></div>${STEPS.map(s => `<div class=h>end of step ${s}</div>`).join('')}${cells}`.replace(/src="/g, `src="${base}/`));
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'frames/contact.png', fullPage: true });
await browser.close(); server.close();
