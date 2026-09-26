# M0 capture spike — results

**PROTOTYPE, throwaway.** Answers [Can a seek(t) SVG player be captured to MP4 fast enough?](https://github.com/dempseydata/explainer/issues/3). The decision is `docs/adr/0001-svg-player-captured-by-headless-chromium.md` on main; this branch is its primary source.

Run: `npm i && node capture.mjs --pack pencil --workers 4 --format jpeg` · sweep: `./sweep.sh` · medians: `./medians.sh`.

Stub: 20 nodes, 22 edges, 12 steps, 75 s, 1920×1080 @ 30 fps = 2250 frames. Wall time is browser launch → finished MP4. Machine: Apple M1 Max, 10 cores, 32 GB; Chromium headless shell 153 (Playwright 1.63); ffmpeg 8.1.

**Threshold, fixed before measuring:** pencil < 120 s wall, median of 3.

## Chosen settings — median of 3 (`medians.jsonl`)

CDP `Page.captureScreenshot` (`optimizeForSpeed`), JPEG q90, libx264 veryfast crf 18, dedup by `frameKey(t)`.

| Pack | Unique frames | Workers | Capture s | Encode s | **Total s** |
| --- | --- | --- | --- | --- | --- |
| pencil | 993 | 1 | 53.4 | 5.1 | **58.9** |
| pencil | 993 | 4 | 18.5 | 5.1 | **24.0** |
| standard | 469 | 1 | 15.3 | 2.6 | **18.1** |
| standard | 469 | 4 | 5.1 | 2.5 | **7.9** |

## Sweep — single runs (`results.jsonl`)

| Run | Unique | Total s | ms/shot | Note |
| --- | --- | --- | --- | --- |
| pencil 1w png | 993 | 99.0 | 64 | |
| pencil 2w png | 993 | 76.5 | 78 | |
| pencil 4w png | 993 | 60.2 | 112 | |
| pencil 6w png | 993 | 58.1 | 148 | capture plateaus ~40 s past 4 workers |
| pencil 8w png | 993 | 56.1 | 190 | |
| pencil 6w **jpeg** | 993 | **20.7** | 48 | PNG compression was the bottleneck |
| pencil 6w png, VideoToolbox | 993 | 57.6 | 152 | encode is PNG-decode-bound, not encoder-bound |
| pencil 6w jpeg, VideoToolbox | 993 | 22.1 | 50 | no gain over libx264 |
| pencil 6w png, **Playwright `page.screenshot`** | 993 | **164.5** | 721 | ~5× slower than raw CDP |
| pencil 6w png, **no dedup** | 2250 | 126.2 | 162 | dedup halves pencil time |
| standard 1w png | 469 | 21.0 | 32 | |
| standard 4w png | 469 | 9.3 | 36 | |
| standard 1w png, no dedup | 2250 | 73.0 | 30 | |
| pencil 1w png, **rough.js `dots` fill** | 993 | 164.3 | 77 | first run, before the fix below |

## Findings beyond the timings

- **Unique frames are ~4× the ticket's guess for standard.** 469, not "dozens": every fade/scale transition is 30 fps. Pencil 993 = 600 boil ticks + draw-on frames between them.
- **rough.js 4.6.6 `dots` fill breaks `seek(t)` purity.** `dotsOnLines` calls `Math.random()` and ignores `seed`; cold-seek vs sequential frames differed at 31 dB. It also cost ~65 s on its own (one ellipse path per dot). Swapped for `dashed`: purity restored, 164 s → 99 s.
- **Byte-identical frames are the wrong purity test.** Cold-seek vs sequential frames differ by raster noise at 65–85 dB PSNR (invisible); real drift showed at ~31 dB. The check here passes at ≥ 50 dB.
- **JPEG q90 intermediates are visually lossless after H.264.** 40 dB vs the PNG-sourced MP4, dominated by paper-grain noise; strokes and hatching indistinguishable at 2× zoom.
- **ffmpeg concat demuxer + `-t` truncates** a long final hold (75 s → 68.6 s). `-frames:v 2250` is exact.
