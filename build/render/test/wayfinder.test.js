// The Wayfinder example rendered in the standard pack (#18), driven through explainer.html in headless Chromium.
// Elements are found by their data-id; an element's drawn outline carries data-outline.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parse } = require('yaml');
const { chromium } = require('playwright');
const { main } = require('../cli.js');

const EXAMPLE = path.join(__dirname, '../../../explainers/wayfinder');
const FPS = 30;
const script = parse(fs.readFileSync(path.join(EXAMPLE, 'script.yaml'), 'utf8'));
const ends = script.steps.map((s, i, all) => all.slice(0, i + 1).reduce((sum, x) => sum + x.duration_s, 0));
const rests = ends.map(end => end - 1 / FPS);
let browser, url, lay;

before(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-wayfinder-'));
  fs.cpSync(EXAMPLE, path.join(root, 'explainers', 'wayfinder'), { recursive: true });
  const { code, report } = await main(['render', path.join(root, 'explainers', 'wayfinder', 'script.yaml'), '--pack', 'standard']);
  assert.equal(code, 0, JSON.stringify(report.errors));
  url = `${pathToFileURL(report.written.find(p => p.endsWith('explainer.html'))).href}?bare`; // the frame alone, as capture loads it
  lay = JSON.parse(fs.readFileSync(report.written.find(p => p.endsWith('layout.json')), 'utf8'));
  browser = await chromium.launch();
});
after(() => browser?.close());

async function open() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

test('render plays all 12 Wayfinder steps, and nothing moves between steps', async () => {
  const page = await open();
  const visible = new Set();
  const boxes = {};
  let lastKey;
  for (const [i, step] of script.steps.entries()) {
    for (const action of step.actions) {
      if (action.reveal) [].concat(action.reveal).forEach(id => visible.add(id));
      if (action.hide) [].concat(action.hide).forEach(id => visible.delete(id));
    }
    const seen = await page.evaluate(t => {
      seek(t);
      return [...document.querySelectorAll('[data-id]')].map(e => {
        const r = e.querySelector('[data-outline]').getBoundingClientRect();
        return { id: e.dataset.id, opacity: getComputedStyle(e).opacity, box: [r.x, r.y, r.width, r.height].map(v => v.toFixed(2)).join(' ') };
      });
    }, rests[i]);
    assert.deepEqual(seen.filter(e => e.opacity === '1').map(e => e.id).sort(), [...visible].sort(), `step ${i + 1}: visible elements`);
    assert.deepEqual(seen.filter(e => e.opacity !== '1').map(e => e.opacity), seen.filter(e => e.opacity !== '1').map(() => '0'), `step ${i + 1}: the rest are hidden`);
    for (const e of seen) {
      boxes[e.id] ??= e.box;
      assert.equal(e.box, boxes[e.id], `step ${i + 1}: ${e.id} moved`);
    }
    const key = await page.evaluate(t => frameKey(t), rests[i]);
    assert.notEqual(key, lastKey, `step ${i + 1} changes the frame`);
    lastKey = key;
  }
  assert.equal(Object.keys(boxes).length, script.graph.groups.length + script.graph.nodes.length + script.graph.edges.length);
  await page.close();
});

const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/standard/pack.json'), 'utf8'));

test('at every step\'s rest, the caption shows that step\'s narration in the pack\'s face, inside the band, in at most two lines', async () => {
  const page = await open();
  for (const [i, t] of rests.entries()) {
    const caption = await page.evaluate(t => {
      seek(t);
      const e = document.querySelector('#frame [data-caption]');
      const lines = [...e.querySelectorAll('tspan')].map(s => s.textContent);
      const box = e.getBBox();
      const cs = getComputedStyle(e);
      return { lines, top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width,
        loaded: document.fonts.check(`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`), family: cs.fontFamily };
    }, t);
    assert.equal(caption.lines.join(' '), script.steps[i].narration, `step ${i + 1}: caption text`);
    assert.ok(caption.lines.length <= 2, `step ${i + 1}: ${caption.lines.length} lines`);
    assert.match(caption.family, /Inter/);
    assert.ok(caption.loaded, `step ${i + 1}: the caption's face is loaded`);
    assert.ok(caption.top >= 1080 - pack.caption.band_px && caption.bottom <= 1080, `step ${i + 1}: caption spans y ${caption.top}–${caption.bottom}`);
    assert.ok(caption.left >= 0 && caption.right <= 1920, `step ${i + 1}: caption spans x ${caption.left}–${caption.right}`);
  }
  await page.close();
});

// Layout (#19): the x-height floor and ceiling are rendered pixels at 1080p (ADR-0003).
const X_HEIGHT = { floor: 16, ceiling: 32 };

test('at every step, every label\'s x-height lies between the floor and the ceiling, and nothing enters the caption band', async () => {
  const page = await open();
  const bandTop = 1080 - pack.caption.band_px;
  for (const [i, t] of rests.entries()) {
    const seen = await page.evaluate(t => {
      seek(t);
      const frame = document.getElementById('frame').getBoundingClientRect();
      const scale = frame.width / 1920;
      const shown = e => { for (; e && e.id !== 'frame'; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return false; return true; };
      const ctx = document.createElement('canvas').getContext('2d');
      const labels = [...document.querySelectorAll('#frame text')].filter(shown).map(e => {
        const cs = getComputedStyle(e);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        // Font sizes are in the frame's viewBox units, which are 1080p pixels at any viewport.
        return { text: e.textContent, x: ctx.measureText('x').actualBoundingBoxAscent };
      });
      // The band is the caption's own; everything else is the diagram.
      const drawn = [...document.querySelectorAll('#frame *')].filter(e => e instanceof SVGGraphicsElement && !(e instanceof SVGGElement) && !e.closest('[data-caption]') && shown(e));
      const bottom = Math.max(...drawn.map(e => (e.getBoundingClientRect().bottom - frame.top) / scale));
      return { labels, bottom };
    }, t);
    assert.ok(seen.labels.length > 0);
    for (const l of seen.labels) {
      assert.ok(l.x >= X_HEIGHT.floor - 0.01 && l.x <= X_HEIGHT.ceiling + 0.01, `step ${i + 1}: "${l.text}" has x-height ${l.x.toFixed(2)} px`);
    }
    assert.ok(seen.bottom <= bandTop, `step ${i + 1}: drawing reaches y ${seen.bottom.toFixed(1)}, into the caption band`);
  }
  await page.close();
});

test('Wayfinder\'s labels are larger than the single-row layout gives, and layout.json records the chosen packing', () => {
  const single = lay.packings.find(p => p.packing.map.length === 1);
  assert.ok(lay.F > single.F, `F ${lay.F} against ${single.F} in one row`);
  assert.ok(lay.packing.map.length > 1, JSON.stringify(lay.packing));
  assert.ok(lay.F >= X_HEIGHT.floor, `F ${lay.F}`);
  assert.deepEqual(lay.packing.map.flat(), ['r1', 'r2', 'r3']);
});

test('the fog patches keep reading order however they are declared', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-wayfinder-'));
  fs.cpSync(EXAMPLE, path.join(root, 'explainers', 'wayfinder'), { recursive: true });
  const file = path.join(root, 'explainers', 'wayfinder', 'script.yaml');
  const yaml = fs.readFileSync(file, 'utf8');
  const patches = ['r1', 'r2', 'r3'].map(id => yaml.split('\n').find(line => line.startsWith(`    - {id: ${id}, type: fog`)));
  fs.writeFileSync(file, yaml.replace(patches.join('\n'), [...patches].reverse().join('\n')));
  const { code, report } = await main(['render', file, '--pack', 'standard']);
  assert.equal(code, 0, JSON.stringify(report.errors));
  const reversed = JSON.parse(fs.readFileSync(report.written.find(p => p.endsWith('layout.json')), 'utf8'));
  assert.deepEqual(reversed.packing.map.flat(), ['r1', 'r2', 'r3']);
  assert.deepEqual(reversed.packing, lay.packing);
});

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = c => {
  const [r, g, b] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('no colour appears outside the pack\'s named tokens', async () => {
  const page = await open();
  const tokens = new Set(Object.values(pack.tokens).map(hex => `rgb(${rgb(hex).join(', ')})`));
  const paints = await page.evaluate(() => [
    ['body background', getComputedStyle(document.body).backgroundColor],
    ...[...document.querySelectorAll('svg *')].filter(e => e instanceof SVGGeometryElement || e instanceof SVGTextElement)
      .flatMap(e => [[`${e.tagName} fill`, getComputedStyle(e).fill], [`${e.tagName} stroke`, getComputedStyle(e).stroke]]),
  ]);
  assert.ok(paints.length > 100);
  const outside = paints.filter(([, value]) => value !== 'none' && !tokens.has(value));
  assert.deepEqual(outside, []);
  await page.close();
});

test('every label meets WCAG AA (4.5:1) on the ground it is actually drawn over, at every step', async () => {
  const page = await open();
  let checked = 0;
  for (const [i, t] of rests.entries()) {
    await page.evaluate(t => seek(t), t);
    const png = (await page.screenshot({ type: 'png' })).toString('base64');
    const labels = await page.evaluate(async png => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const ctx = new OffscreenCanvas(image.width, image.height).getContext('2d');
      ctx.drawImage(image, 0, 0);
      const shown = e => { for (; e && e.tagName !== 'svg'; e = e.parentElement) if (getComputedStyle(e).opacity !== '1') return false; return true; };
      return [...document.querySelectorAll('text')].filter(shown).map(e => {
        const r = e.getBoundingClientRect();
        const px = ctx.getImageData(Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)).data;
        const counts = {};
        for (let p = 0; p < px.length; p += 4) counts[`${px[p]},${px[p + 1]},${px[p + 2]}`] = (counts[`${px[p]},${px[p + 1]},${px[p + 2]}`] ?? 0) + 1;
        const ground = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
        return { text: e.textContent, fill: getComputedStyle(e).fill.match(/\d+/g).map(Number), ground };
      });
    }, png);
    for (const l of labels) {
      assert.ok(contrast(l.fill, l.ground) >= 4.5, `step ${i + 1}: "${l.text}" at ${contrast(l.fill, l.ground).toFixed(2)}:1 on rgb(${l.ground})`);
      checked++;
    }
  }
  assert.ok(checked > 50, `${checked} labels checked`);
  await page.close();
});

test('edge ends meet the drawn outline of what they join, including the goal\'s circle', async () => {
  const page = await open();
  const ends = await page.evaluate(edges => edges.map(e => {
    const edge = document.querySelector(`[data-id="${e.id}"]`);
    const tip = edge.querySelector('[data-head]').getPointAtLength(0);
    const tail = edge.querySelector('[data-outline]').points[0];
    // How far a point lies from an outline's stroke band: 0 inside the band, else the gap to it.
    const gap = (id, p) => {
      const o = document.querySelector(`[data-id="${id}"] [data-outline]`);
      const half = Number(o.getAttribute('stroke-width')) / 2;
      if (o.tagName === 'circle') {
        return Math.max(0, Math.abs(Math.hypot(p.x - o.cx.baseVal.value, p.y - o.cy.baseVal.value) - o.r.baseVal.value) - half);
      }
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(k => o[k].baseVal.value);
      const outside = Math.hypot(Math.max(x - p.x, 0, p.x - x - w), Math.max(y - p.y, 0, p.y - y - h));
      const inside = Math.min(p.x - x, x + w - p.x, p.y - y, y + h - p.y);
      return Math.max(0, (outside > 0 ? outside : inside) - half);
    };
    return { id: e.id, shape: document.querySelector(`[data-id="${e.to}"] [data-outline]`).tagName, head: gap(e.to, tip), tail: gap(e.from, tail) };
  }), script.graph.edges);
  assert.equal(ends.find(e => e.id === 'h1').shape, 'circle', 'the handoff ends at the goal\'s circle');
  for (const e of ends) {
    assert.ok(e.head <= 1, `${e.id}: its head stops ${e.head.toFixed(1)} px from the outline`);
    assert.ok(e.tail <= 1, `${e.id}: its tail starts ${e.tail.toFixed(1)} px from the outline`);
  }
  await page.close();
});

test('across each reveal onset, an unchanged frameKey means unchanged pixels', async () => {
  const page = await open();
  const onsets = await page.evaluate(() => [...new Set(DATA.events.filter(e => e.verb === 'reveal' && e.t0 > 0).map(e => e.t0))]);
  for (const f of onsets.map(t => Math.round(t * FPS))) {
    const frames = [];
    for (const g of [f - 1, f]) {
      frames.push({ key: await page.evaluate(t => (seek(t), frameKey(t)), g / FPS), png: await page.screenshot({ type: 'png' }) });
    }
    if (frames[0].key === frames[1].key) assert.ok(frames[0].png.equals(frames[1].png), `frames ${f - 1} and ${f} share a key but differ`);
  }
  await page.close();
});

test('purity holds for the Wayfinder render: a cold seek to t matches a sequentially reached t at >= 50 dB PSNR', async () => {
  const { spawnSync } = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-psnr-'));
  const psnr = (a, b) => {
    fs.writeFileSync(path.join(tmp, 'a.png'), a);
    fs.writeFileSync(path.join(tmp, 'b.png'), b);
    const log = spawnSync('ffmpeg', ['-hide_banner', '-i', path.join(tmp, 'a.png'), '-i', path.join(tmp, 'b.png'), '-lavfi', 'psnr', '-f', 'null', '-']).stderr.toString();
    return Number(/average:(\S+)/.exec(log)[1].replace('inf', 'Infinity'));
  };
  // Mid-reveal, mid-fog, mid-annotation, mid-frontier, mid-hide, mid-highlight, the last annotation, the final rest.
  const picks = [0.2, 0.6, 6.6, 19.6, 38.55, 39.0, 67.2, rests.at(-1)].map(t => Math.round(t * FPS));
  const sequential = {};
  const page = await open();
  let from = 0;
  for (const f of picks) {
    await page.evaluate(([a, b]) => { for (let g = a; g <= b; g++) seek(g / 30); }, [from, f]);
    sequential[f] = await page.screenshot({ type: 'png' });
    from = f + 1;
  }
  await page.close();
  for (const f of picks) {
    const cold = await open();
    await cold.evaluate(t => seek(t), f / FPS);
    const db = psnr(await cold.screenshot({ type: 'png' }), sequential[f]);
    assert.ok(db >= 50, `frame ${f}: ${db} dB`);
    await cold.close();
  }
});

test('the page never scrolls: the frame stays in view at 1440×600 and at 700 px wide, and only the transcript scrolls to keep the current line in view', async () => {
  for (const viewport of [{ width: 1440, height: 600 }, { width: 700, height: 600 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(url.replace('?bare', ''));
    const at = `${viewport.width}×${viewport.height}`;
    const rect = selector => page.locator(selector).evaluate(e => e.getBoundingClientRect().toJSON());
    const lineInView = i => page.locator('#transcript li').nth(i).evaluate(li => {
      const [r, list] = [li.getBoundingClientRect(), li.parentElement.getBoundingClientRect()];
      return r.top >= list.top - 0.5 && r.bottom <= list.bottom + 0.5;
    });
    const last = script.steps.length - 1;
    assert.equal(await lineInView(last), false, `${at}: the last line starts out of view`);
    await page.keyboard.press('End');
    assert.equal(await lineInView(last), true, `${at}: End brings the last line into view`);
    assert.deepEqual(await page.locator('#transcript [aria-current="step"]').allInnerTexts(), [script.steps[last].narration]);
    const frame = await rect('#frame');
    assert.ok(frame.top >= 0 && frame.left >= 0 && frame.bottom <= viewport.height && frame.right <= viewport.width, `${at}: frame at ${JSON.stringify(frame)}`);
    const transcript = await rect('#transcript');
    assert.ok(viewport.width < 800 ? transcript.top >= frame.bottom : transcript.left >= frame.right, `${at}: the transcript sits ${viewport.width < 800 ? 'under' : 'beside'} the frame`);
    assert.deepEqual(await page.evaluate(() => [scrollX, scrollY, document.documentElement.scrollWidth, document.documentElement.scrollHeight]),
      [0, 0, viewport.width, viewport.height], `${at}: the page does not scroll`);
    await page.close();
  }
});
