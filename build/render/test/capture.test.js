// Capture (#21, ADR-0001): render captures explainer.html to explainer.mp4, and writes captions.srt and narration.md.
// Driven through the CLI (report and files written; the MP4 read with ffprobe and ffmpeg) and the page's seek(t) and
// frameKey(t) in headless Chromium, loaded bare as capture loads it (ADR-0007).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parse } = require('yaml');
const { chromium } = require('playwright');
const { main } = require('../cli.js');
const { writeScript, TWO_NODE, open: openAt, psnr } = require('./scripts.js');

const FPS = 30;
// The two-node script, 2 s + 3 s, with a second step citing two quotes.
const YAML = TWO_NODE.replace('    cite: {src: notes, quote: "write before review"}\n',
  '    cite:\n      - {src: notes, quote: "write before review"}\n      - {src: notes, quote: "review it"}\n');
const script = parse(YAML);
const band = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/standard/pack.json'), 'utf8')).caption.band_px;
let browser, report, out, file;

before(async () => {
  ({ report } = await main(['render', writeScript(YAML), '--pack', 'standard']));
  assert.deepEqual(report.errors, []);
  file = name => report.written.find(p => path.basename(p) === name);
  out = path.dirname(file('explainer.html'));
  browser = await chromium.launch();
});
after(() => browser?.close());

const open = async () => (await openAt(browser, `${pathToFileURL(file('explainer.html')).href}?bare`)).page;

const ffmpeg = (...args) => spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { encoding: 'utf8' });
// The caption band of frame n of the MP4, as a PNG.
function bandOf(mp4, n, png) {
  assert.equal(ffmpeg('-y', '-i', mp4, '-vf', `select=eq(n\\,${n}),crop=1920:${band}:0:${1080 - band}`, '-frames:v', '1', png).status, 0);
  return png;
}
function cues(srt) {
  return srt.trim().split(/\n\n+/).map(block => {
    const [n, times, ...text] = block.split('\n');
    const [from, to] = times.split(' --> ').map(s => {
      const [h, m, sec] = s.replace(',', '.').split(':').map(Number);
      return h * 3600 + m * 60 + sec;
    });
    return { n: Number(n), from, to, text: text.join('\n') };
  });
}

test('render writes explainer.mp4, captions.srt and narration.md beside the player and layout', () => {
  assert.deepEqual(report.written.map(p => path.basename(p)).sort(),
    ['captions.srt', 'explainer.html', 'explainer.mp4', 'layout.json', 'narration.md']);
  for (const p of report.written) assert.equal(path.dirname(p), out);
});

test('the MP4 is 1920×1080 at 30 fps, and its frame count is the total duration × 30, final hold included', () => {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', file('explainer.mp4')], { encoding: 'utf8' });
  const [stream] = JSON.parse(probe.stdout).streams;
  assert.deepEqual([stream.width, stream.height, stream.r_frame_rate], [1920, 1080, '30/1']);
  assert.equal(Number(stream.nb_read_frames), 5 * FPS);
  assert.equal(report.capture.frames, 5 * FPS);
});

test('the number of screenshots equals the number of distinct frameKey values', async () => {
  const page = await open();
  const distinct = await page.evaluate(({ n, fps }) => new Set(Array.from({ length: n }, (_, f) => frameKey(f / fps))).size, { n: 5 * FPS, fps: FPS });
  await page.close();
  assert.equal(report.capture.screenshots, distinct);
  assert.ok(distinct < 5 * FPS, 'holds are not screenshotted twice');
});

test('captions.srt has one cue per step, timed from step durations, carrying its narration', () => {
  const ends = script.steps.map((s, i, all) => all.slice(0, i + 1).reduce((sum, x) => sum + x.duration_s, 0));
  assert.deepEqual(cues(fs.readFileSync(file('captions.srt'), 'utf8')),
    script.steps.map((s, i) => ({ n: i + 1, from: i ? ends[i - 1] : 0, to: ends[i], text: s.narration })));
});

test('the captions burned into the MP4 match captions.srt step for step, from each cue\'s first frame to its last', async () => {
  const srt = cues(fs.readFileSync(file('captions.srt'), 'utf8'));
  // What the player draws in the band at each cue's rest, and the text it draws there.
  const page = await open();
  const refs = [];
  for (const [i, cue] of srt.entries()) {
    const text = await page.evaluate(t => (seek(t), [...document.querySelectorAll('[data-caption] tspan')].map(s => s.textContent).join(' ')), cue.to - 1 / FPS);
    assert.equal(text, cue.text, `cue ${cue.n}: the player's caption`);
    refs.push(path.join(out, `ref${i}.png`));
    await page.screenshot({ path: refs[i], clip: { x: 0, y: 1080 - band, width: 1920, height: band } });
  }
  await page.close();
  for (const [i, cue] of srt.entries()) {
    for (const n of [Math.round(cue.from * FPS), Math.round(cue.to * FPS) - 1]) {
      const shot = bandOf(file('explainer.mp4'), n, path.join(out, `mp4-${n}.png`));
      const scores = refs.map(ref => psnr(shot, ref));
      assert.equal(scores.indexOf(Math.max(...scores)), i, `frame ${n} shows cue ${cue.n}: ${scores.map(s => s.toFixed(1))} dB`);
      assert.ok(scores[i] >= 35, `frame ${n}: ${scores[i]} dB against cue ${cue.n}`);
    }
  }
});

test('narration.md carries every narration line, in step order, with each of its quotes and their sources', async () => {
  // 1.1 + 2.2 is 3.3000000000000003 in floating point; the headings show 0.1 s.
  const noisy = YAML.replace('duration_s: 2\n', 'duration_s: 1.1\n').replace('duration_s: 3\n', 'duration_s: 2.2\n');
  const { report } = await main(['render', writeScript(noisy), '--pack', 'standard']);
  const md = fs.readFileSync(report.written.find(p => p.endsWith('narration.md')), 'utf8');
  const sections = md.split(/^## /m).slice(1);
  assert.deepEqual(sections.slice(0, 2).map(s => s.split('\n')[0]), ['Step 1 · 0–1.1 s', 'Step 2 · 1.1–3.3 s']);
  const title = Object.fromEntries(script.sources.map(s => [s.id, s.title]));
  for (const [i, step] of script.steps.entries()) {
    assert.ok(sections[i].includes(step.narration), `step ${i + 1}: narration`);
    for (const c of [].concat(step.cite)) {
      assert.ok(sections[i].includes(`"${c.quote}"`), `step ${i + 1}: quote ${c.quote}`);
      assert.ok(sections[i].includes(title[c.src]), `step ${i + 1}: source ${c.src}`);
    }
  }
});

// Same frames within ADR-0001's purity tolerance: pages raster identical scenes a few bits apart (65–85 dB).
test('parallel capture produces the same frames as a single worker', async () => {
  const single = await main(['render', writeScript(YAML), '--pack', 'standard'], { workers: 1 });
  assert.deepEqual([single.report.capture.workers, report.capture.workers], [1, 4]);
  const stats = spawnSync('ffmpeg', ['-hide_banner', '-i', single.report.written.find(p => p.endsWith('explainer.mp4')), '-i', file('explainer.mp4'),
    '-lavfi', 'psnr=stats_file=-', '-f', 'null', '-'], { encoding: 'utf8' }).stdout.trim().split('\n');
  assert.equal(stats.length, 5 * FPS);
  for (const line of stats) {
    const db = Number(/psnr_avg:(\S+)/.exec(line)[1].replace('inf', 'Infinity'));
    assert.ok(db >= 50, `${line.split(' ')[0]}: ${db} dB`);
  }
});
