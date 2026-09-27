// Seam 2: explainer.html's page contract — seek(t) and frameKey(t) — in headless Chromium.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { main } = require('../cli.js');
const { writeScript, TWO_NODE } = require('./scripts.js');

const FPS = 30;
const DURATION_S = 5; // the two-node script's steps: 2 s + 3 s
let browser, url, tmp;

before(async () => {
  const { report } = await main(['render', writeScript(TWO_NODE), '--pack', 'standard']);
  const html = report.written.find(p => p.endsWith('explainer.html'));
  url = pathToFileURL(html).href;
  tmp = path.dirname(html);
  browser = await chromium.launch();
});
after(() => browser.close());

async function open() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto(url);
  return { page, requests };
}

const shot = page => page.screenshot({ type: 'png' });

function psnr(a, b) {
  fs.writeFileSync(path.join(tmp, 'a.png'), a);
  fs.writeFileSync(path.join(tmp, 'b.png'), b);
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', path.join(tmp, 'a.png'), '-i', path.join(tmp, 'b.png'),
    '-lavfi', 'psnr', '-f', 'null', '-']).stderr.toString();
  return Number(/average:(\S+)/.exec(log)[1].replace('inf', 'Infinity'));
}

test('explainer.html makes no network request and exposes seek(t) and frameKey(t)', async () => {
  const { page, requests } = await open();
  assert.deepEqual(requests, [url]);
  assert.deepEqual(await page.evaluate(() => [typeof seek, typeof frameKey]), ['function', 'function']);
  await page.close();
});

test('purity: a cold seek to t matches a sequentially reached t at >= 50 dB PSNR', async () => {
  const picks = [0.4, 1.5, 2.2, 2.7, 4.9].map(t => Math.round(t * FPS)); // mid-reveal, hold, mid-reveal ×2, final hold
  const sequential = {};
  const { page } = await open();
  for (let f = 0; f <= Math.max(...picks); f++) {
    await page.evaluate(t => seek(t), f / FPS);
    if (picks.includes(f)) sequential[f] = await shot(page);
  }
  await page.close();
  for (const f of picks) {
    const cold = await open();
    await cold.page.evaluate(t => seek(t), f / FPS);
    const db = psnr(await shot(cold.page), sequential[f]);
    assert.ok(db >= 50, `frame ${f}: ${db} dB`);
    await cold.page.close();
  }
});

test('frameKey changes exactly when the pixels do: constant through a hold, changing during a reveal', async () => {
  const { page } = await open();
  const frames = [];
  for (let f = 0; f < DURATION_S * FPS; f++) {
    const key = await page.evaluate(t => (seek(t), frameKey(t)), f / FPS);
    frames.push({ key, png: await shot(page) });
  }
  await page.close();
  for (let f = 1; f < frames.length; f++) {
    const keyChanged = frames[f].key !== frames[f - 1].key;
    const pixelsChanged = !frames[f].png.equals(frames[f - 1].png);
    assert.equal(keyChanged, pixelsChanged, `frame ${f}: key ${keyChanged ? '' : 'un'}changed, pixels ${pixelsChanged ? '' : 'un'}changed`);
  }
  const key = t => frames[Math.round(t * FPS)].key;
  assert.equal(key(0.6), key(1.9), 'step 1 holds from the end of its reveal to its end');
  assert.notEqual(key(0.1), key(0.2), 'step 1 reveal is changing');
  assert.notEqual(key(2.6), key(2.7), 'step 2 second reveal is changing');
  assert.equal(key(3.1), key(4.9), 'step 2 holds to the end');
});
