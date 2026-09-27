---
status: accepted
---

# Captions are burned into the frame, and the step-through is a frame beside a transcript

The MVP has no audio, so its captions carry all of its narration. A sidecar `captions.srt` is ignored wherever an MP4 is most often shared (Slack, X, a slide deck), and there the explainer would play unnarrated. So the caption is part of the frame. Each pack draws a caption band across the foot of the 1920×1080 frame in its own face, and `seek(t)` sets its text. The HTML and the MP4 then show the same captions, and sync is exact by construction: the brief's 0.5 s criterion cannot fail. The prototype and the full resolution are in [How small can the step-through HTML's controls be?](https://github.com/dempseydata/explainer/issues/11).

With the caption inside the frame, the controls are the only chrome `explainer.html` adds. They are chosen to be almost invisible. The frame sits beside a transcript of the narration, above a hairline bar with a notch at each step boundary. There are no visible buttons except a fullscreen toggle.

## Consequences

- **Layout reserves the band.** ADR-0003 maximises label x-height within the area above the band, not within the whole frame. The prototype measured the cost with a 150 px band. It was nothing on the standard pack's ELK layout, which is bounded by width. It was 9 % on the pencil layout, which fills the height. Row packing fills the height, so expect the second figure.
- **A caption is at most two lines.** Each pack states its caption size in rendered pixels. The check pass reports narration that wraps past two lines in the pack's face as a finding, because only the DOM can measure it. The 15 cps rule (ADR-0006) keeps it rare: Wayfinder's longest line, 97 characters, fits in two.
- **The caption belongs to its step.** It changes at the step boundary, so `frameKey`'s step term already covers it, and the check pass's keyframes carry it.
- **Stepping.** Every control goes through `seek(t)`. A step's rest is its last frame, `t_end − 1/30 s`, the check pass's seek (ADR-0004).
  - **Next** plays the next step and holds at its rest. Pressed while a step is playing, it finishes that step.
  - **Back** jumps to the previous step's rest, with no reverse animation.
  - **Scrubbing** is free.
  - **Keys:** ← and → step, space plays and pauses, Home and End go to the ends, and `f` toggles fullscreen.
  - Clicking the left or right half of the frame also steps back or forward.
- **The transcript is the page's accessible text.** Burned-in captions are pixels. The transcript lists every narration line and marks the current one, which scrolls into view as the explainer plays. Clicking a line seeks to that step's rest. Only the transcript scrolls; the frame never leaves view. Below 800 px it moves under the frame.
- **The x-height floor is stated at 1080p, and the page is usually smaller.** At 1440×900 the transcript leaves the frame 1,092 px wide, which takes the 16 px floor down to about 9 px. Fullscreen gives the frame the whole screen and leaves the transcript behind. The floor is not restated for smaller windows; fullscreen is the answer.
- **The chrome is neutral.** One set of controls serves every pack. A pack styles only what capture records, and never needs a page stylesheet.
- **Capture never sees the controls.** It loads the player bare, at 1920×1080.
- **`captions.srt` is still written.** It serves as an index and a transcript. Uploading it beside the MP4 would double the captions.

## Considered options

- **Sidecar `.srt` only.** Rejected: an MP4 shared where `.srt` is ignored plays unnarrated. It would keep the full frame for layout, but a silent explainer does not work.
- **A transport bar beneath the frame** (back, play, next and a step counter). Workable, and it keeps more of the frame's width than a transcript does. It was not chosen, because the transcript does more: it gives an overview, navigation and accessible text in one element.
- **A video-player overlay that fades on idle.** Rejected: the burned-in caption owns the foot of the frame, which pushes the overlay to the top, and there it covers the diagram.
- **A collapsible transcript**, to give the frame its width back. Rejected in favour of fullscreen: it would be a second layout to maintain, where fullscreen is one button.
- **Chrome styled by each pack.** Rejected: every pack would own page CSS. In the pencil pack, a Kalam transcript also competes with the Kalam captions.
