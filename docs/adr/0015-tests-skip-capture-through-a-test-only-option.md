---
status: accepted
---

# Tests skip capture through a test-only option on `main`

Every render captures, so the suite grew to about 200 s ([#34](https://github.com/dempseydata/explainer/issues/34)). `render --frame` skips capture, but it writes only `frames/*.png`, and the layout and player tests read `layout.json` and `explainer.html`.

Tests that need the render's files but not the MP4 call the CLI's entry point with a test-only option, `main(argv, {capture: false})`, beside the existing `{workers}` option. The render then stops where capture would begin. The public CLI is unchanged.

## Consequences

- Tests still drive seam 1, the CLI's entry point in the same process. The option only removes the capture step.
- A test that asserts on the MP4, `captions.srt`, `narration.md` or capture counts keeps the full render.

## Considered options

- **`--frame` also writes `layout.json` and `explainer.html`.** Rejected: Checkpoint 2's `--frame graph` would overwrite a real render's files.
- **A public `--no-capture` flag.** Rejected: a user-facing flag added for the tests' sake.
