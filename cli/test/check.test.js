// The check pass (#22, ADR-0004, ADR-0007): before its one capture, render seeks to each step's rest and measures label
// x-height against the floor, overlap, and captions past two lines; it writes a keyframe per step and review.md, and
// any finding stops capture. Driven through the CLI (exit code, report, files written) and, for the keyframes, the
// page's seek(t) in headless Chromium.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { main } = require('../cli.js');
const { writeScript, TWO_NODE, grid, open, psnr } = require('./scripts.js');

const FPS = 30;
const render = (file, ...flags) => main(['render', file, '--pack', 'standard', ...flags]);
const outOf = file => path.join(path.dirname(file), '../../local-data', path.basename(path.dirname(file)), 'render/standard');
const written = (file, report) => report.written.map(p => path.relative(outOf(file), p)).sort();
const read = (file, name) => fs.readFileSync(path.join(outOf(file), name), 'utf8');
const BEFORE_CAPTURE = ['explainer.html', 'keyframes/step-01.png', 'keyframes/step-02.png', 'layout.json', 'review.md'];

// Step 2's narration, 208 characters: three lines in the standard pack's caption, and 13.9 s to read at 15 cps.
const THREE_LINES = TWO_NODE.replace('narration: Then review it.\n    duration_s: 3', `narration: ${'Then review it. '.repeat(13).trim()}\n    duration_s: 14`);

function stopped(file, code, report) {
  assert.equal(code, 3, JSON.stringify(report.errors));
  assert.equal(report.capture, undefined, 'nothing was captured');
  assert.deepEqual(written(file, report), BEFORE_CAPTURE);
  const review = read(file, 'review.md');
  assert.match(review, /^## Findings$/m);
  for (const f of report.findings) {
    assert.equal(f.accepted, undefined);
    assert.ok(review.includes(f.message.replaceAll('|', '\\|')), `review.md reports: ${f.message}`);
  }
}

test('a seeded overlap, an annotation with no clear place, is reported and stops capture', async () => {
  const file = writeScript(grid(3, 3, { annotate: 'Look here' }));
  const { code, report } = await render(file);
  stopped(file, code, report);
  assert.ok(report.findings.length > 0);
  for (const f of report.findings) assert.deepEqual([f.step, f.check], [2, 'overlap'], f.message);
  assert.ok(report.findings.some(f => /annotation "Look here"/.test(f.message)), JSON.stringify(report.findings));
});

test('a seeded over-long label, which pushes every label under the x-height floor, is reported and stops capture', async () => {
  const file = writeScript(grid(1, 5, { label: 'Write every single word of it' }));
  const { code, report } = await render(file);
  assert.deepEqual(written(file, report), BEFORE_CAPTURE.filter(f => !f.endsWith('02.png')));
  assert.equal(code, 3);
  assert.equal(report.capture, undefined);
  for (const f of report.findings) assert.deepEqual([f.step, f.check], [1, 'x-height'], f.message);
  const long = report.findings.find(f => f.message.includes('"Write every single word of it"'));
  assert.ok(long, JSON.stringify(report.findings));
  assert.match(long.message, /under the 16 px floor/);
  assert.ok(read(file, 'review.md').includes(long.message));
});

test('a seeded three-line caption is reported and stops capture', async () => {
  const file = writeScript(THREE_LINES);
  const { code, report } = await render(file);
  stopped(file, code, report);
  assert.deepEqual(report.findings.map(f => [f.step, f.check]), [[2, 'caption']]);
  assert.match(report.findings[0].message, /3 lines/);
});

test('--accept-findings captures once and marks each finding accepted; a later stop leaves no stale capture behind', async () => {
  const file = writeScript(THREE_LINES);
  const accepted = await render(file, '--accept-findings');
  assert.equal(accepted.code, 0);
  assert.equal(accepted.report.capture.frames, (2 + 14) * FPS);
  assert.deepEqual(written(file, accepted.report), [...BEFORE_CAPTURE, 'captions.srt', 'explainer.mp4', 'narration.md'].sort());
  assert.deepEqual(accepted.report.findings.map(f => [f.step, f.check, f.accepted]), [[2, 'caption', true]]);
  const row = read(file, 'review.md').split('\n').find(line => line.includes(accepted.report.findings[0].message));
  assert.match(row, /accepted/);

  const again = await render(file);
  stopped(file, again.code, again.report);
  for (const name of ['explainer.mp4', 'captions.srt', 'narration.md']) assert.equal(fs.existsSync(path.join(outOf(file), name)), false, name);
  assert.doesNotMatch(read(file, 'review.md'), /accepted/);
});

test('a clean script captures exactly once, reports no findings, and its keyframes are each step\'s rest', async () => {
  const file = writeScript(TWO_NODE);
  const { code, report } = await render(file);
  assert.equal(code, 0);
  assert.deepEqual(report.findings, []);
  assert.equal(report.capture.frames, 5 * FPS);
  assert.deepEqual(written(file, report), [...BEFORE_CAPTURE, 'captions.srt', 'explainer.mp4', 'narration.md'].sort());
  const review = read(file, 'review.md');
  assert.match(review, /## Findings\n\nNothing to report\.\n$/, 'review.md ends at its findings, for the skill to append its look');

  const browser = await chromium.launch();
  const { page } = await open(browser, `${pathToFileURL(path.join(outOf(file), 'explainer.html')).href}?bare`);
  for (const [i, rest] of [2 - 1 / FPS, 5 - 1 / FPS].entries()) {
    await page.evaluate(t => seek(t), rest);
    const seen = path.join(outOf(file), `seen-${i}.png`);
    await page.screenshot({ path: seen });
    const db = psnr(seen, path.join(outOf(file), `keyframes/step-0${i + 1}.png`));
    assert.ok(db >= 50, `step ${i + 1}: keyframe against seek(rest) at ${db} dB`);
  }
  await browser.close();
});

// A PNG's width and height, from its IHDR chunk.
const size = png => { const b = fs.readFileSync(png); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
// A crop of a PNG, as a PNG beside it.
function crop(png, [w, h, x, y], name) {
  const to = path.join(path.dirname(png), name);
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', `crop=${w}:${h}:${x}:${y}`, to]).status, 0);
  return to;
}
const band = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/standard/pack.json'), 'utf8')).caption.band_px;

test('render --frame writes PNGs of the graph or of the steps listed, and nothing else, without capturing', async () => {
  const file = writeScript(TWO_NODE);
  const steps = await render(file, '--frame', '1,2');
  assert.equal(steps.code, 0, JSON.stringify(steps.report.errors));
  assert.deepEqual(written(file, steps.report), ['frames/step-01.png', 'frames/step-02.png']);
  assert.equal(steps.report.capture, undefined);
  assert.deepEqual(steps.report.findings, []);
  assert.deepEqual(fs.readdirSync(outOf(file)), ['frames']);
  const last = path.join(outOf(file), 'step-02.png'); // kept outside frames/, which the next --frame run clears
  fs.copyFileSync(path.join(outOf(file), 'frames/step-02.png'), last);

  const graph = await render(file, '--frame', 'graph');
  assert.equal(graph.code, 0);
  assert.deepEqual(written(file, graph.report), ['frames/graph.png']);
  const [png] = graph.report.written;
  assert.deepEqual(size(png), [1920, 1080]);
  // Two-node's last rest shows every element with no state or transient effect: the graph frame's diagram is its
  // diagram, and the graph frame has no caption.
  const above = [1920, 1080 - band, 0, 0], foot = [1920, band, 0, 1080 - band];
  const db = psnr(crop(png, above, 'a.png'), crop(last, above, 'b.png'));
  assert.ok(db >= 50, `the graph frame's diagram against step 2's: ${db} dB`);
  assert.ok(psnr(crop(png, foot, 'c.png'), crop(last, foot, 'd.png')) < 50, 'the graph frame has no caption');
});

test('render --frame clears the last --frame run\'s PNGs, so none sits stale beside this one\'s', async () => {
  const file = writeScript(TWO_NODE);
  assert.equal((await render(file, '--frame', '1,2')).code, 0);
  const { code, report } = await render(file, '--frame', '1');
  assert.equal(code, 0);
  assert.deepEqual(written(file, report), ['frames/step-01.png']);
  assert.deepEqual(fs.readdirSync(path.join(outOf(file), 'frames')), ['step-01.png']);
});

test('render --frame graph takes a draft with no steps (Checkpoint 2), and --frame 1,6,12 takes Wayfinder\'s steps', async () => {
  const draft = writeScript(`${TWO_NODE.slice(0, TWO_NODE.indexOf('steps:'))}draft:\n  checkpoint: 1\n  pack: standard\n  target_s: 75\n  gaps: []\n  root: .\n`);
  const graph = await render(draft, '--frame', 'graph');
  assert.equal(graph.code, 0, JSON.stringify(graph.report.errors));
  assert.deepEqual(written(draft, graph.report), ['frames/graph.png']);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-wayfinder-'));
  fs.cpSync(path.join(__dirname, '../../explainers/wayfinder'), path.join(root, 'explainers', 'wayfinder'), { recursive: true });
  const wayfinder = path.join(root, 'explainers', 'wayfinder', 'script.yaml');
  const { code, report } = await render(wayfinder, '--frame', '1,6,12');
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.deepEqual(written(wayfinder, report), ['frames/step-01.png', 'frames/step-06.png', 'frames/step-12.png']);
  for (const png of report.written) assert.deepEqual(size(png), [1920, 1080]);
});

test('render --frame refuses a step the script does not have, or a list it cannot read, as a usage error', async () => {
  const file = writeScript(TWO_NODE);
  for (const frame of [['0'], ['3'], ['1,x'], ['1,'], []]) {
    const { code, report } = await render(file, '--frame', ...frame);
    assert.equal(code, 2, `--frame ${frame}`);
    assert.deepEqual(report.written, []);
  }
});

test('the real binary exits 0 on success, 1 on a validation failure and 3 on a findings stop, reporting the findings', () => {
  const bin = path.join(__dirname, '../cli.js');
  const run = yaml => spawnSync(process.execPath, [bin, 'render', writeScript(yaml), '--pack', 'standard', '--frame', '1'], { encoding: 'utf8' });
  assert.equal(run(TWO_NODE).status, 0);
  assert.equal(run(TWO_NODE.replace('to: review', 'to: x')).status, 1);
  const stop = spawnSync(process.execPath, [bin, 'render', writeScript(THREE_LINES), '--pack', 'standard'], { encoding: 'utf8' });
  assert.equal(stop.status, 3);
  assert.deepEqual(JSON.parse(stop.stdout).findings.map(f => f.check), ['caption']);
  assert.match(stop.stderr, /finding: step 2: caption/);
});
