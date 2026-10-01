---
status: accepted
---

# An SVG player, pure in time, captured to MP4 by headless Chromium

The renderer is an SVG + JavaScript player whose `seek(t)` draws exactly the frame at time `t`. The step-through `explainer.html` is the primary output, and `explainer.mp4` is a capture of it: headless Chromium steps through `seek(t)` and ffmpeg encodes the frames. The M0 spike measured a 75 s, 20-node stub at 1920×1080, 30 fps. The pencil pack, the slow case with line boil, took **58.9 s at one worker** (median of 3) against a 120 s threshold set in advance; the standard pack took 18.1 s. So the brief's re-render target of under 2 minutes stands, and Motion Canvas and Manim are not reopened. Measurements and method are on the throwaway branch [`prototype/capture-spike`](https://github.com/dempseydata/explainer/tree/prototype/capture-spike/build/render/prototype-capture-spike).

## Consequences

Each of these moved the measured time by 2× or more, or broke correctness, so the build treats them as requirements:

- **The player exposes `frameKey(t)` beside `seek(t)`.** It is a string that changes exactly when the frame's pixels do: the transition progress of every element, plus the boil tick for packs that boil. The capturer screenshots only when the key changes and holds each frame for its run. Without it, deduplication would still have to screenshot all 2,250 frames. With it, pencil capture drops by half (126 s → 58 s at the same settings).
  *Amended by ADR-0019:* the key also carries the current step, which covers the caption. It carries the boil tick only while something is shown. Capture screenshots each distinct key once.
- **Screenshots go through CDP `Page.captureScreenshot` (`optimizeForSpeed`), as JPEG q90.** Playwright's `page.screenshot` was about 5× slower (721 ms per shot at 6 pages). PNG intermediates made both capture and encode about 3× slower. After H.264 the JPEG intermediates are indistinguishable from PNG.
- **Capture parallelises over disjoint time slices.** Because `seek(t)` is pure, this needs no coordination. Four pages is the knee (pencil 24.0 s); beyond that, pages in one browser contend. It is headroom, not a requirement.
- **Pencil packs may not use rough.js `fillStyle: 'dots'`** (4.6.6). It calls `Math.random()` and ignores `seed`, so `seek(t)` stops being pure: frames diverged visibly, at 31 dB. It is also the costliest fill, at one path per dot. Every other fill style routes through the seeded randomiser.
- **Purity is a standing test with a tolerance, not byte equality.** Seeking a cold page straight to `t` must match a sequentially reached `t` at ≥ 50 dB PSNR. Identical scenes differ by raster noise at 65–85 dB; real drift showed at about 31 dB.
- **The encode uses the concat demuxer with `-frames:v N`, never `-t`.** `-t` silently truncated a 6.5 s final hold.
- **Geometric checks should run on the player's DOM before capture, not after it.** They read `getBBox()` and need no pixels. The brief's order (capture, then checks with up to 2 fix loops) would allow three captures per render. Decided in ADR-0004: they do, and a render captures once.

## Considered options

- **Motion Canvas or Manim.** Not reopened. Either would mean one renderer for video and another for the step-through, which the single-player design exists to avoid, and the SVG player cleared the target with 2× headroom unparallelised.
- **Recording real-time autoplay.** Rejected before the spike (brief, revision 8): it drops frames and puts caption sync at the mercy of machine load.
