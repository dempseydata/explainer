# Build ledger: Explainer MVP (#12), branch build/mvp, run 2026-09-27

The unattended build of the MVP's tickets: one implementer and one reviewer per ticket, one commit each. All tickets below are merged to main and closed on GitHub, except #25 (awaiting its human run).


RULES (author, 2026-09-27): fix-round limit 3; a single small contained defect remaining after the limit is fixed without stopping the run. Unspecified hard-to-reverse decisions still STOP and ask.

| Ticket | Title | Status | Commit | Notes |
|---|---|---|---|---|
| #13 | Tracer: a two-node script renders to a playable explainer.html | done | 5f6bc19 | 1 fix round (crash report, atomic writes, pack sizes) |
| ADR-0008 | CLI binary renamed to `explainer` (author decision) | done | 9a5fa15 | author chose; #12 wording now stale |
| #14 | The validator enforces all of schema v0.1 | done | 4592697 | 3 fix rounds (paths per #8, layout guard, blank-quote) |
| #15 | The Wayfinder example lands and validates | done | 71b576f | clean first review |
| #16 | fetch writes extracts deterministically | done | f84298d | stopped once for CLI surface (author: ADR-0009); 2 fix rounds (symlink/wx, Chromium errors->1, symlinked sources dir) |
| #17 | Pack coverage and overrun validation | done | 012fbb5 | 1 fix round (prototype-chain lookup; animation_s/pack fields) |
| #18 | The standard pack renders the whole Wayfinder script | done | 9274da1 | 1 fix round (frameKey at reveal onset; dead code) |
| #19 | Layout wraps sibling groups to maximise label size | done | 04ba790 | 1 fix round (unbounded packing search -> one split per row count) |
| #20 | Step-through controls and burned-in captions | done | e9633fd | clean first review |
| #21 | Capture to MP4, plus captions.srt and narration.md | done | fa1234e | 1 fix round (timing flake, browser leak, float headings) |
| #22 | The check pass: findings stop capture | done | e341ae7 | clean review; 1 small fix (stale frames/) |
| #23 | The pencil pack renders Wayfinder with no script edits | done | 53f4163 | clean review; 1 follow-up (pencil sizes into pack, dedupe) |
| #25 | /explainer-script through Checkpoint 1 | done (text) | 8f960d2 | 1 fix round (exit 70/2 handling, text nits); all 5 criteria need a human run |

## Decisions not made by spec/ADRs (flag for ADR)
- #13 CLI surface: `render render ...` -> SETTLED by author as `explainer` (ADR-0008); --pack required remains implementer's call
- #13 Report: JSON on stdout {errors:[{message,at,line}],written:[]}; human lines on stderr
- #13 Exit codes: 0 ok, 1 validation, 2 usage, 70 internal/crash (3 left free for findings stop)
- #13 Output path: <root>/explainers/<slug>/script -> <root>/local-data/<slug>/<pack>/ (no check the script sits under explainers/)
- #13 pack.json format: tokens, ground, face, label_px, stroke_px, corner_px, arrow_px, node_types[type]{size,fill,stroke,text}, edge_kinds, verbs.reveal.duration_s
- #13 Reveal = linear fade, frameKey quantised to 1/1000; frameKey has no step term until #20
- #13 Deps: elkjs + yaml runtime; playwright dev; tests need ffmpeg (undeclared)

- #14 warnings array in report; strict schema (unknown keys error); vocab membership, duplicate source ids, self-nesting groups checked; coverage only when steps exist; ajv dep
- #14 layout rule: script must sit at <root>/explainers/<slug>/ or <root>/local-data/<slug>/ else exit 2

- #15 vendored source at explainers/wayfinder/sources/ (ADR-0002 said examples/...; #8/ADR-0005 governs) — ADR-0002 line 46 now stale
- #15 extracts copied into local-data/wayfinder/sources/; old skillmd.md and 1-byte pillitteri.txt in local-data now unused (author may delete)

- #16 implementer: pandoc -f html -t plain --wrap=none; Chromium goto commit + 5 s networkidle then innerText; whitespace word count; words only on success; missing pandoc -> 70; HTTP 30 s timeout; HTTP 403 does not fall back to Chromium

- #17 overrun suggestion is a field on the error {message,at,line,suggested_duration_s,animation_s,pack} (reviewer: spec settles 'carries the suggestion in the report'; not a top-level overruns array)
- #17 pack checks only with --pack; unknown --pack exit 2 before validation; missing pack key maps none; unmapped verb once per use; no overrun check on step with unmapped verb; ms rounding; narration length in code points

- #18 pack.json keys: layout + face blocks, tokens, per-type shape/stroke/icon, state marks slot/ring/badge/none, motion in verbs (reviewer: contents match spec's 'A pack holds' list; keys unsettled but cheap). OPEN before #23: one shared player.js vs per-pack player (spec says 'the pencil player')
- #18 glyph sizes vs x-height F (icon 1.75, badge 1.8, goal r 1.9); card tints fill-opacity 0.14 on type token; layout fits frame capped 32 px; sibling groups chained in declaration order; goal ports at circle height
- #18 frameKey = eased values rounded to 0.01; page contract adds data-id/data-outline/data-head (tests + #22 rely on them); licences embedded as comments; focus unmapped in standard

- #19 sibling order: ties at first set_state compare later set_state steps (literal ADR-0003/#9 rule 4 gives declaration order for Wayfinder) -> amend ADR-0003 wording
- #19 caption.band_px 150 in pack; equal F -> fewer rows then better unclamped fit; gaps 2F in row, 1.1F between rows; one split per row count (narrowest widest row, DP); same-row sibling edges dog-leg + port run-on can cross a card (ponytail: notes)
- #19 ADR-0003 figures stale: actual [r1] over [r2 r3], F 22.08 vs 15.57

- #20 `?bare` query is the page/capture contract for the frame alone (record in ADR-0007 or #21); caption font_px 40 / line_px 52 / weight 400; overflowing captions drawn not clipped (#22 reports); End/bar max = last rest; Next mid-step while paused jumps to that rest; fullscreen = frame + bar; chrome tokens neutral grey, system face; no visible key hint (title + aria-keyshortcuts)

- #21 report gains capture {frames, screenshots, workers}; main(argv,{workers}) test hook, binary uses 4; libx264 veryfast crf 18 yuv420p; concat 'option framerate 30' + -vf fps=30; narration.md = section per step (time span 0.1 s, narration, quoted sources) then Sources list; SRT cue ends at step end

- #22 findings stop = exit 3; report findings[{step (1-based|'graph'), check, message, accepted?}]; --frame accepts a draft, reports findings, exits 0, writes only frames/*.png; each render deletes prior keyframes/review.md/mp4/srt/narration.md by fixed name; review.md = '# Review…' + '## Findings' table Step·Check·Finding·Status or 'Nothing to report.'; findings deduped to first step; data-note attribute on annotations

- #23 player question SETTLED by spec: one shared player.js, rough branch when pack has `rough` block. New pack keys: libraries, paper, rough, glyphs, text halo, state marks corner + glyph badge; goal = rough circle with label below; @ drawn as glyph (label checks skip it); annotations on paper patch; grain token; per-stroke draw-on paths

- #25 skill folder build/skill/explainer-script/ (from the brief; spec silent); draft written when Checkpoint 1 is shown; pack: null until Checkpoint 2; gaps as strings; root as typed; author saves supplied text themselves; ignore check tests a file path (global excludes report dirs as ignored); INSTALL method open (implementer suggests symlink ~/.claude/skills/explainer-script + npm link in build/render)

## Review findings / fix rounds
- #13 deferred to later tickets: unmapped node type/verb currently exit 70, spec says validation failure (exit 1) -> #17 must change code + tests (cli.js:4, test/cli.test.js:63,72); unmapped edge kind exits 0 then page throws -> #17; edge end on a group crashes layout -> #14; duration_s:0 NaN opacity; YAML line numbers lost on stderr; temp dirs not cleaned
- #14 round1: extract paths root-relative via shared rootOf (#8); render -> local-data/<slug>/render/<pack>/ (#8, also fixes #13); group labels uncapped (ADR-0002)
- #14 round2: script not under explainers/<slug>/ or local-data/<slug>/ -> exit 2; absolute/.. source paths -> exit 1
- #14 final review: MUST-FIX blank quote passes. DEFER: early return after schema errors; YAML/empty-file locations; draft root: ignored (fine, #25); normaliser strips all * _ `; render --draft ignored (#22); draft-location test (#25). #15 must place example at explainers/wayfinder/
- #15 nits: denylist.txt has no private-project names though CLAUDE.md says it should (pre-existing); temp dirs not cleaned
- #16 nits: empty dirs may be created outside via symlinked local-data (no content); --overwrite writes through hardlink/raced symlink; evaluate has no timeout; res.text() assumes UTF-8; wx EEXIST race -> 70; extra args ignored
- #17 nits: --pack ../x resolves outside packs/; verbs looked up twice
- #18: Wayfinder labels F=15.48 px < 16 floor -> #19 must lift; frameKey lacks step term -> #20; annotation cost ignores edges; ponytail nits (cloneExample dup, highlight branches)
- #20 nits: arrow keys on focused slider step instead of nudge; after scrub into a hold, first Next does nothing visible; end-1/30 duplicated; caption pack fields unvalidated; player.js:149 comment cites future check pass
- #21: suite 41 s -> 98 s since every render captures; move layout-only tests to `render --frame graph` once #22 lands. Nits: wayfinder.test.js still has own open()/psnr(); rmSync skipped if browser.close throws; graph cites not in narration.md; capture.workers counts idle
- #22 nits: CONTEXT.md Finding omits the caption check; tests leave extra PNGs in temp output; suite now ~124 s
- #23: step 6 Research's @ badge touches Task's frontier ring (ELK componentComponent spacing unset; predates #23; check pass doesn't measure state marks); dots guard checks pack.json text not player; bent dashed edge shows perpendicular leg at once; suite ~190 s
- #25 nits: fetch/usage errors carry only message; declined --overwrite unspecified; quote version in YAML; several drafts found unspecified
