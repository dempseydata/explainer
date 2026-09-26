// PROTOTYPE — renders the end of steps 1, 6, 11 and 12 in each look, plus a contact sheet and a contrast/geometry report.
// Usage: node shoot.mjs [A B C]   → frames/<look>-s<step>.png, frames/contact.png, frames/report.json
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try { const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1); const b = await readFile(p); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const STEPS = [1, 6, 11, 12];
// Each look lays out with its own card widths (LOOK:ticket:small): label width depends on the face.
import { execFileSync } from 'node:child_process';
const SPECS = (process.argv.slice(2).length ? process.argv.slice(2) : ['A', 'B', 'C']).map(a => a.split(':'));
const LOOKS = SPECS.map(s => s[0]);
await mkdir('frames', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => console.log(`  [${m.type()}] ${m.text()}`));
page.on('pageerror', e => console.log(`  [error] ${e.message}`));
const reports = [];
for (let [look, tw = 244, sw = 210] of SPECS) {
  // Fixed point: card width → ELK width → scale → font size → label width → card width. Iterate until labels fit.
  for (let i = 1; ; i++) {
    const lay = execFileSync('node', ['layout.mjs', '--order', `--ticket=${tw}`, `--small=${sw}`]).toString().split('\n')[0];
    await page.goto(`${base}/player.html?look=${look}&shot`);
    await page.waitForFunction(() => window.READY);
    const { needTicket, needSmall } = await page.evaluate(() => report());
    console.log(`${look} pass ${i}: ticket ${tw} small ${sw} → ${lay}; labels need ${needTicket}/${needSmall}`);
    if ((needTicket <= tw && needSmall <= sw) || i === 8) break;
    tw = Math.max(tw, needTicket); sw = Math.max(sw, needSmall);
  }
  for (const s of STEPS) {
    await page.evaluate(s => seek(STEP_T[s - 1] + STEPS[s - 1].d - 0.01), s);
    await page.screenshot({ path: `frames/${look}-s${s}.png` });
  }
  const r = await page.evaluate(() => report()); reports.push(r); console.log(JSON.stringify(r));
}
await writeFile('frames/report.json', JSON.stringify(reports, null, 1));
const cells = LOOKS.map(l => `<div class=l>${l}</div>` + STEPS.map(s => `<img src="frames/${l}-s${s}.png">`).join('')).join('');
await page.setViewportSize({ width: 4 * 640 + 60, height: LOOKS.length * 360 + 40 });
await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:40px repeat(4,640px);gap:4px;background:#222;font:24px system-ui;color:#fff;padding:4px}
  .l{display:flex;align-items:center;justify-content:center}.h{text-align:center;font-size:18px}img{width:640px;display:block}</style>
  <div></div>${STEPS.map(s => `<div class=h>end of step ${s}</div>`).join('')}${cells}`.replace(/src="/g, `src="${base}/`));
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'frames/contact.png', fullPage: true });
await browser.close(); server.close();
