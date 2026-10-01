# Build ledger: Explainer MVP follow-ups (#12) — branch night-shift/mvp-follow-ups

Authority: push + tracker yes · End state: merge + push (fast-forward main) · Baseline: 109 tests, 199 s

Order: #36, #28, #32, #33, #34, #24, #26, #31, #35. #25 and #27 are human tickets and are skipped.

Sitting (2026-09-30): ADR-0012 (approval stamp), ADR-0013 (the CLI is found with `cd -P` and bootstrapped by `cli/setup.sh`; Chromium lives in the shared cache), ADR-0014 (the look lives in one file and waits on `review.md`), ADR-0015 (tests skip capture with `main(argv, {capture:false})`), ADR-0016 (finding kinds `overlap` and `crossing`).
- #31 runs after #32–#34, #24 and #26, so the ADRs it writes match the final code. This sitting's decisions are already recorded in ADR-0012 to ADR-0016.
- #26's blocking edge on #25 is waived. #26's skill text is built tonight; #25 and #26 both stay open for one M6 run.
- #36 may re-point `~/.claude/skills/explainer-script`, add `~/.claude/skills/explainer-render` when #24 lands, and re-run `npm link` from `cli/`. It may move the untracked `build/render/prototype-*-pack/` into `local-data/prototypes/`, drop `build/render/node_modules`, and edit the untracked `.claude/my-process.md`.

| Ticket | Status | Commit | Rounds | Suite | Notes |
| --- | --- | --- | --- | --- | --- |
| #36 | built, open (human run) | 49303e7 | 1 | 109 / 189 s | round-1 must-fix was the untracked process copy (fixed by the orchestrator, as authorised); links re-pointed, `npm link` re-run from cli/ |
| #28 | done | fde3f1b | 0 | 109 / 190 s | clean review; 3 wording nits fixed by the orchestrator |
| #32 | done | 086c07c | 2 | 115 / 188 s | round 1: meta-refresh/JS navigation inward, unbounded loop, CDP throw lost the report, sub-resource failed the fetch; round 2 (orchestrator): proxy env in the loop test, 100.64/10 blocked |
| #33 | done | c32484b | 3 | 119 / 191 s | r1: a group mark over its own member went unreported; r2: marks vs edges (pencil step-6 @ on edge b1), pencil card corner mark inset d/2; r3: inset for cards only |
| #34 | done | 26e863b | 1 | 120 / 78 s | capture:false moves took 191→149 s; round 1 (orchestrator, measured by reviewer): --test-concurrency=4 |
| #24 | built, open (human run) | eba9920 | 1 | 120 / 78 s | r1: exit before review.md (3, fast 0), unbounded waiter, temp dir leak, expired transient read as a change; 3 nits by the orchestrator (viewer never a fork, stamp needs string pack+sha256, path printed before cp); `~/.claude/skills/explainer-render` linked |
| #26 | built, open (human run, M6) | 6a4c404 | 1 | 120 / 78 s | #25 edge waived; r1 (orchestrator, reviewer-prescribed one-liners): edit-in-place ran the check pass and look in every pack (ADR-0005: geometry in the chosen pack only); `cd` into cli/packs moved the session cwd (also fixed in /explainer-render); slug clash guard |
| #31 | done | this commit | 1 | 120 / 80 s | ADR-0017–0021 + in-place amendments; r1: two ADR statements contradicted the code; the skill offered `focus`, which no pack maps (removed) |

## Owed
- #31: CONTEXT.md Finding omits `crossing` (and the caption check)

## Decisions
- #26: Emit strips the draft block, validates in every pack, then `mv`s the draft to script.yaml (write + remove in one move), then stamps; an edit copies the script with `cp` and appends a draft block; an edit takes its pack from the stamp and target_s from the current total; several drafts: one line each, then ask — ADR? yes (#31: the draft format and Emit)
- #24: two background jobs (render + a review.md waiter bounded at 600 s); a findings stop writes "Not run: findings stopped capture." under ## Look; emphasis is checked against what the narration names (the misplaced-highlight case needs it); the pack defaults to the stamp's; look.md takes any folder of step-NN.png (#26 must pass every step to --frame) — ADR? no
- #34: renders shared per test file by script text; the layout read-back test keeps full capture (it compares MP4 bytes); test files run 4 at a time (no shared paths or ports) — ADR? no
- #33: slot marks (fog) are not measured; only ring marks are exempt from their own contents and edges; a crossing counts any node (goal included); ELK componentComponent spacing = node_gap_F; page contract adds `data-mark` and edge from/to; pencil card corner mark sits d/2 inside the corner — ADR? yes (#31: page contract, check kinds)
- #32: `--pack` is exactly a `cli/packs/<name>/` folder holding pack.json, else exit 2 listing the installed packs; fetch follows HTTP redirects by hand (cap 20) and checks every hop and every later main-frame navigation by resolved address (RFC 1918, loopback, link-local, 100.64/10, IPv6 equivalents), exit 1; a directly given loopback URL is allowed; an inward sub-resource is blocked, not fatal — ADR? yes (#31: fetch surface, amend ADR-0009)
- #28: source text is data; http(s) URLs only; slugs and source ids `[a-z0-9-]`; the draft and extracts written with the file tool; quotes as single-quoted YAML — ADR? no
- #36: `plugin.json` drops `skills`; default discovery finds `skills/*` — ADR? no (ADR-0011 covers it)
- #36: setup.sh treats Chromium as missing when a headless launch fails (the headless shell is a separate install; ~0.5 s per run) — ADR? no

## Blocked
- #24 (for the author, at the human run): on the clean Wayfinder script the hand-run look raised steps 7 and 9 (narration not visible: "no one-line gist on screen", "no sessions shown"), and the emphasis-vs-narration rule raised 9 and 11, so criterion 4's clean case ("Nothing to report.") does not hold as the script stands. Either the script's narration changes, or the rule loosens — downstream: none

## Nits
- #31: ADR-0019 could say that without `data-caption` the caption is still x-height-checked as a label; only its line count goes unmeasured
- #31: a rough pack using `slot` state marks crashes in drawOn (exit 70) and a plain pack with `corner` draws nothing; neither is reachable with the installed packs
- #26: between Emit's strip and a restore the draft has no draft block; gaps are dropped at Emit without mention; a graph edit re-lays out untouched steps but shows only changed frames; exit 2 at Checkpoint 2 unhandled
- #34: the pencil Wayfinder budget test (< 60 s, ADR-0001) has 2.7× headroom, below the probes' 4×; the player settle loop has ~2.5×
- #33: crossing tests the goal circle by its bounding box (corner false positives possible); same-row dog-leg routing is reported, not fixed (ADR-0003 defers routing)
- #33: the check measures mark bounding boxes, so a group corner mark beside a member card corner can be a false positive (circle clears by ~0.46F); measure marks as circles if a real script hits it
- #32: DNS rebinding between check and connect is a ponytail ceiling; a sub-resource fetched directly from a private address (no redirect) still loads; the loop test needs a Node that honours NODE_USE_ENV_PROXY and package.json has no `engines`
- #28: no instruction for a resumed hand-edited draft whose source id breaks `[a-z0-9-]`
- #36: setup.sh would print "installed Chromium" if Chromium is present but fails to launch for another reason (reasoned, not reproduced)
- #36: `claude plugin validate` warns that the root CLAUDE.md is not loaded as plugin context (pre-existing)
