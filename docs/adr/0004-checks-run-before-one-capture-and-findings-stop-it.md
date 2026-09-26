---
status: accepted
---

# Checks run before a single capture, and findings stop it

The brief captured to MP4 first, then ran geometric checks, fixed layout or timing, and re-rendered up to twice, so one render could capture three times. By the time the order came up, the loop had nothing left to fix. Layout is a pure function of script and pack, and it already maximises the label x-height `F` (ADR-0003). The renderer never edits the script. So each check becomes an assertion, run once on the player's DOM before capture. "Re-render" now means the author changes the script and runs it again; the only loop left inside a render is layout's own convergence. The reasoning is in the resolution of [Do geometric checks run before capture, so a render captures once?](https://github.com/dempseydata/explainer/issues/7).

The pipeline is: validate → layout → build player → check pass → capture once → captions and narration → readability look.

## Consequences

- **Overrun is a validation check, per pack, and needs no DOM.** A step's animation time is the sum of its verbs' durations in the pack: the actions play in order, and their targets appear together (ADR-0002). When that sum exceeds `duration_s`, validation rejects the script for that pack. The rejection names the step, the pack and the animation time. It also suggests a `duration_s`: the animation time rounded up to the next 0.5 s, in a form a program can read. `/explainer-script` puts that suggestion to the author for approval, and the CLI never writes it. A longer duration only adds hold time, so fixing an overrun in one pack cannot create an overrun in another.
- **The check pass measures x-height and overlap.** It seeks to each step's last frame, `t_end − 1/30 s`, not to the boundary: at the boundary, the transient effects under review have already gone.
- **The readability look's keyframes come from the check pass.** It takes one PNG per step at the same seek, so keyframes exist before capture, and the look can run while capture is going on. `render --frame` takes a list of steps and uses the same mechanism.
- **A finding stops the render before capture.** A finding is anything the check pass reports. The render still writes `explainer.html`, the keyframes, `layout.json` and `review.md`, then exits non-zero. `--accept-findings` captures anyway and marks the findings as accepted in `review.md`. Both checks are treated alike: an annotation covering a label is not cosmetic, and the CLI does not rank severity.
- **M5's done-when changes.** It becomes: a seeded overlap and a seeded over-long script are each caught and reported; a seeded overrun is rejected with a suggested duration; a clean script captures exactly once. The acceptance criterion "no text under 24 px at 1080p" becomes the x-height floor.

## Considered options

- **The brief's order: capture, then check, fix and re-render up to twice.** Rejected. It could capture three times, and after ADR-0003 there is nothing for the loop to fix.
- **Fitting an overrun inside the player**, either by compressing the step's animations or by stretching the step. Rejected. Compressing gives one step different motion from every other without saying so. Stretching makes `duration_s` stop meaning what the script says, and lets the total length differ between packs by accident.
- **Taking keyframes from the capture.** Rejected. Capture writes JPEG and deduplicates frames, so finding a step-end frame means mapping time back to the held frame. It also means the look can start only once capture has finished.
- **Capturing anyway and reporting**, as the brief did. Rejected once no fix loop remained: the MP4 would add a minute and a file not to share, when the HTML and keyframes already show the problem.
- **Stopping only on text below the floor, and reporting overlaps.** Rejected: deciding which findings are cosmetic is the author's call, not the CLI's.
