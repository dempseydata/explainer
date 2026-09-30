# Build ledger: Explainer MVP follow-ups (#12) — branch night-shift/mvp-follow-ups

Authority: push + tracker yes · End state: merge + push (fast-forward main) · Baseline: 109 tests, 199 s

Order: #36, #28, #32, #33, #34, #24, #26, #31, #35. #25 and #27 are human tickets and are skipped.

Sitting (2026-09-30): ADR-0012 (approval stamp), ADR-0013 (the CLI is found with `cd -P` and bootstrapped by `cli/setup.sh`; Chromium lives in the shared cache), ADR-0014 (the look lives in one file and waits on `review.md`), ADR-0015 (tests skip capture with `main(argv, {capture:false})`), ADR-0016 (finding kinds `overlap` and `crossing`).
- #31 runs after #32–#34, #24 and #26, so the ADRs it writes match the final code. This sitting's decisions are already recorded in ADR-0012 to ADR-0016.
- #26's blocking edge on #25 is waived. #26's skill text is built tonight; #25 and #26 both stay open for one M6 run.
- #36 may re-point `~/.claude/skills/explainer-script`, add `~/.claude/skills/explainer-render` when #24 lands, and re-run `npm link` from `cli/`. It may move the untracked `build/render/prototype-*-pack/` into `local-data/prototypes/`, drop `build/render/node_modules`, and edit the untracked `.claude/my-process.md`.

| Ticket | Status | Commit | Rounds | Suite | Notes |
| --- | --- | --- | --- | --- | --- |

## Owed

## Decisions

## Blocked

## Nits
