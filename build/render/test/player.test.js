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
  url = `${pathToFileURL(html).href}?bare`; // the frame alone, as capture loads it (ADR-0007)
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

// The step-through page (ADR-0007): the same file without ?bare.
const NARRATION = ['First, write it.', 'Then review it.'];
const REST = [2 - 1 / FPS, 5 - 1 / FPS];
async function openPage(viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto(url.replace('?bare', ''));
  return { page, requests };
}
const box = (page, selector) => page.locator(selector).evaluate(e => e.getBoundingClientRect().toJSON());

test('the page puts the frame beside a transcript of every narration line, offline', async () => {
  const { page, requests } = await openPage();
  assert.deepEqual(requests, [url.replace('?bare', '')]);
  const lines = page.getByRole('list', { name: 'Transcript' }).getByRole('listitem');
  assert.deepEqual(await lines.allInnerTexts(), NARRATION);
  const [frame, transcript] = [await box(page, '#frame'), await box(page, '[aria-label="Transcript"]')];
  assert.ok(frame.right <= transcript.left, `frame ends at x ${frame.right}, transcript starts at ${transcript.left}`);
  await page.close();
});

test('the bare capture view shows the frame alone at 1920×1080', async () => {
  const { page } = await open();
  assert.deepEqual(await box(page, '#frame'), { x: 0, y: 0, width: 1920, height: 1080, top: 0, left: 0, right: 1920, bottom: 1080 });
  assert.equal(await page.locator('button, input, ol, [role]').count(), 0);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [1920, 1080]);
  await page.close();
});

// What the page shows, against a reference page's seek(t): stepping is judged by the frame it lands on.
let reference;
const shown = page => page.evaluate(() => document.getElementById('frame').innerHTML);
async function frameAt(t) {
  reference ??= (await openPage()).page;
  return reference.evaluate(t => (seek(t), document.getElementById('frame').innerHTML), t);
}
async function settles(page, t, what) {
  const want = await frameAt(t);
  for (const until = Date.now() + 5000; await shown(page) !== want;) {
    assert.ok(Date.now() < until, `${what}: the frame never reached t = ${t.toFixed(3)}`);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(250);
  assert.equal(await shown(page), want, `${what}: the frame holds at t = ${t.toFixed(3)}`);
}

test('Next plays the next step to its rest and holds; Next during a step finishes it; Next clamps at the end', async () => {
  const { page } = await openPage();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150); // step 1's reveal takes 0.4 s
  const playing = await shown(page);
  assert.notEqual(playing, await frameAt(0), 'step 1 has started');
  assert.notEqual(playing, await frameAt(REST[0]), 'step 1 is still playing');
  await settles(page, REST[0], 'Next from the start');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settles(page, REST[1], 'Next during step 2');
  await page.keyboard.press('ArrowRight');
  await settles(page, REST[1], 'Next at the last rest');
  await page.close();
});

test('Back goes to the previous rest from a rest, to the last completed rest mid-step, and clamps at the start; Home and End go to the ends', async () => {
  const { page } = await openPage();
  await page.keyboard.press('End');
  await settles(page, REST[1], 'End');
  await page.keyboard.press('ArrowLeft');
  await settles(page, REST[0], 'Back from the last rest');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await settles(page, REST[0], 'Back mid-step');
  await page.keyboard.press('ArrowLeft');
  await settles(page, 0, 'Back from the first rest');
  await page.keyboard.press('ArrowLeft');
  await settles(page, 0, 'Back at the start');
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await settles(page, 0, 'Home');
  await page.close();
});

test('space plays and pauses, and Next finishes a paused step', async () => {
  const { page } = await openPage();
  await page.keyboard.press(' ');
  await page.waitForTimeout(250);
  await page.keyboard.press(' ');
  const paused = await shown(page);
  await page.waitForTimeout(250);
  assert.equal(await shown(page), paused, 'paused');
  assert.notEqual(paused, await frameAt(0), 'it played');
  assert.notEqual(paused, await frameAt(REST[0]), 'it paused mid-step');
  await page.keyboard.press('ArrowRight');
  await settles(page, REST[0], 'Next while paused mid-step');
  await page.keyboard.press(' ');
  await settles(page, REST[1], 'space plays to the end');
  await page.close();
});

test('clicking the right half of the frame steps forward and the left half steps back', async () => {
  const { page } = await openPage();
  const frame = await box(page, '#frame');
  const half = side => page.mouse.click(frame.x + frame.width * (side === 'right' ? 0.75 : 0.25), frame.y + frame.height / 2);
  await half('right');
  await half('right');
  await settles(page, REST[0], 'right, right');
  await half('left');
  await settles(page, 0, 'left');
  await page.close();
});

test('clicking a transcript line seeks to its step\'s rest, and the line is marked current', async () => {
  const { page } = await openPage();
  const current = () => page.locator('#transcript [aria-current="step"]').allInnerTexts();
  assert.deepEqual(await current(), [NARRATION[0]]);
  await page.getByRole('button', { name: NARRATION[1] }).click();
  await settles(page, REST[1], 'line 2');
  assert.deepEqual(await current(), [NARRATION[1]]);
  await page.getByRole('button', { name: NARRATION[0] }).click();
  await settles(page, REST[0], 'line 1');
  assert.deepEqual(await current(), [NARRATION[0]]);
  await page.close();
});

test('the step bar is notched at each step boundary, sized by duration, and scrubs freely', async () => {
  const { page } = await openPage();
  const bar = page.getByRole('slider', { name: 'Position' });
  const track = await bar.evaluate(e => e.getBoundingClientRect().toJSON());
  const notches = await page.locator('[data-notch]').evaluateAll(ns => ns.map(n => n.getBoundingClientRect().toJSON()));
  assert.equal(notches.length, 1, 'one boundary between two steps');
  const at = (notches[0].left + notches[0].width / 2 - track.left) / track.width;
  assert.ok(Math.abs(at - 2 / REST[1]) * track.width < 1, `the notch sits at ${at.toFixed(3)} of the bar`);
  await bar.fill('3.3');
  await settles(page, 3.3, 'scrubbed to 3.3 s');
  assert.deepEqual(await page.locator('#transcript [aria-current="step"]').allInnerTexts(), [NARRATION[1]]);
  await page.keyboard.press('ArrowLeft');
  await settles(page, REST[0], 'Back from a scrubbed position');
  await page.close();
});

test('fullscreen, by f or its button, gives the frame the whole screen and leaves the transcript behind', async () => {
  const { page } = await openPage();
  const state = () => page.evaluate(() => {
    const full = document.fullscreenElement;
    const frame = document.getElementById('frame').getBoundingClientRect();
    return { full: !!full, frame: full?.contains(document.getElementById('frame')), transcript: full?.contains(document.getElementById('transcript')),
      fills: Math.max(frame.width / innerWidth, frame.height / innerHeight), screen: [innerWidth, innerHeight] };
  });
  for (const toggle of [() => page.keyboard.press('f'), () => page.getByRole('button', { name: 'Fullscreen' }).click()]) {
    await toggle();
    await page.waitForFunction(() => document.fullscreenElement && document.querySelector('[aria-pressed="true"]'));
    const s = await state();
    assert.equal(s.frame, true);
    assert.equal(s.transcript, false);
    assert.ok(s.fills > 0.95, `the frame fills ${(s.fills * 100).toFixed(1)}% of the ${s.screen.join('×')} screen`);
    assert.equal(await page.getByRole('button', { name: 'Fullscreen' }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement && document.querySelector('[aria-pressed="false"]'));
    assert.equal(await page.getByRole('button', { name: 'Fullscreen' }).getAttribute('aria-pressed'), 'false');
  }
  await page.close();
});

test('every control is reached by Tab and has an accessible name, and the transcript\'s text meets WCAG AA', async () => {
  const { page } = await openPage();
  const expected = ['button "Previous step"', 'button "Next step"', 'slider "Position"', 'button "Fullscreen"', ...NARRATION.map(n => `button "${n}"`)];
  const reached = [];
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press('Tab');
    reached.push((await page.locator(':focus').ariaSnapshot()).replace(/^- /, '').replace(/:.*$|\s*\[.*$/s, ''));
  }
  assert.deepEqual(reached, expected);
  assert.equal(await page.locator('button, input, a, [tabindex]').count(), expected.length, 'no control outside the tab order');
  const pairs = await page.locator('#transcript button').evaluateAll(bs => bs.map(b => {
    let e = b;
    while (getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)') e = e.parentElement;
    return [getComputedStyle(b).color, getComputedStyle(e).backgroundColor].map(c => c.match(/\d+/g).slice(0, 3).map(Number));
  }));
  const luminance = c => c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0);
  for (const [fg, bg] of pairs) {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `rgb(${fg}) on rgb(${bg})`);
  }
  await page.close();
});
