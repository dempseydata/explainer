// PROTOTYPE — M0 capture spike. Throwaway; the answer lives in the ADR, not here.
// node capture.mjs --pack pencil --workers 4 --format jpeg --encoder x264 --shot cdp
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';

const { values: o } = parseArgs({ options: {
  pack: { type: 'string', default: 'standard' },
  workers: { type: 'string', default: '1' },
  format: { type: 'string', default: 'png' },      // png | jpeg
  encoder: { type: 'string', default: 'x264' },    // x264 | vt
  shot: { type: 'string', default: 'cdp' },        // cdp | pw
  nodedup: { type: 'boolean', default: false },
}});
const N = +o.workers, ext = o.format === 'png' ? 'png' : 'jpg';
const out = resolve('out', `${o.pack}-${N}w-${o.format}-${o.encoder}-${o.shot}${o.nodedup ? '-nodedup' : ''}`);
rmSync(out, { recursive: true, force: true }); mkdirSync(out + '/frames', { recursive: true });
const url = `file://${resolve('player.html')}?pack=${o.pack}`;
const now = () => performance.now() / 1000;
const T0 = now();

const browser = await chromium.launch();
const newPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url);
  return page;
};

// 1. Ask the player which frames differ — no screenshots needed to decide.
const probe = await newPage();
const keys = await probe.evaluate(() => Array.from({ length: Math.round(TOTAL * FPS) }, (_, f) => frameKey(f / FPS)));
await probe.close();
const runs = [];                                           // {f, count}: unique frame f held for count frames
keys.forEach((k, f) => (!o.nodedup && f && k === keys[f - 1]) ? runs.at(-1).count++ : runs.push({ f, count: 1 }));

// 2. Capture unique frames, split into N contiguous slices. seek(t) is pure, so slices are independent.
const T1 = now();
const slice = Math.ceil(runs.length / N);
const shotTimes = [];
await Promise.all(Array.from({ length: N }, async (_, w) => {
  const page = await newPage();
  const cdp = o.shot === 'cdp' && await page.context().newCDPSession(page);
  for (const r of runs.slice(w * slice, (w + 1) * slice)) {
    await page.evaluate(t => seek(t), r.f / 30);
    const s = now();
    const buf = cdp
      ? Buffer.from((await cdp.send('Page.captureScreenshot', { format: o.format, quality: o.format === 'jpeg' ? 90 : undefined, optimizeForSpeed: true })).data, 'base64')
      : await page.screenshot({ type: o.format, quality: o.format === 'jpeg' ? 90 : undefined });
    shotTimes.push(now() - s);
    writeFileSync(`${out}/frames/${String(r.f).padStart(5, '0')}.${ext}`, buf);
  }
}));
const T2 = now();

// 3. Purity check: seek a cold page straight to a few frames; pixels must match the captured ones.
// Byte equality is too strict (raster noise ~65–85 dB); visible drift shows as < 40 dB.
let purity = 'skipped (jpeg)';
if (o.format === 'png') {
  const page = await newPage();
  const picks = [runs[1], runs[Math.floor(runs.length / 3)], runs[Math.floor(2 * runs.length / 3)], runs.at(-2)];
  const cdp = await page.context().newCDPSession(page);
  const psnr = [];
  for (const r of picks) {
    await page.evaluate(t => seek(t), r.f / 30);
    writeFileSync(`${out}/cold.png`, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64'));
    const log = spawnSync('ffmpeg', ['-hide_banner', '-i', `${out}/cold.png`, '-i', `${out}/frames/${String(r.f).padStart(5, '0')}.png`,
      '-lavfi', 'psnr', '-f', 'null', '-']).stderr.toString();
    psnr.push(Number((/average:(\S+)/.exec(log)?.[1] ?? '0').replace('inf', 'Infinity')));
  }
  const min = Math.min(...psnr);
  purity = `min PSNR ${min === Infinity ? 'inf' : min.toFixed(1)} dB ${min >= 50 ? 'PASS' : 'FAIL'}`;
}
await browser.close();

// 4. Encode: concat demuxer holds each unique frame for its run length.
const list = runs.map(r => `file 'frames/${String(r.f).padStart(5, '0')}.${ext}'\nduration ${r.count / 30}`).join('\n')
  + `\nfile 'frames/${String(runs.at(-1).f).padStart(5, '0')}.${ext}'\n`;
writeFileSync(`${out}/list.txt`, list);
const codec = o.encoder === 'vt' ? ['-c:v', 'h264_videotoolbox', '-b:v', '10M'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'];
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-fps_mode', 'cfr', '-r', '30',
  ...codec, '-pix_fmt', 'yuv420p', '-frames:v', String(keys.length), 'explainer.mp4'], { cwd: out });
const T3 = now();

const probeOut = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
  'stream=nb_read_frames:format=duration', '-of', 'csv=p=0', `${out}/explainer.mp4`]).toString().trim().split('\n').join(' ');
shotTimes.sort((a, b) => a - b);
const r = {
  run: out.split('/').at(-1), frames: keys.length, unique: runs.length,
  setup_s: +(T1 - T0).toFixed(1), capture_s: +(T2 - T1).toFixed(1), encode_s: +(T3 - T2).toFixed(1), total_s: +(T3 - T0).toFixed(1),
  shot_ms_median: +(shotTimes[shotTimes.length >> 1] * 1000).toFixed(1), purity, mp4: probeOut,
};
console.log(JSON.stringify(r));
