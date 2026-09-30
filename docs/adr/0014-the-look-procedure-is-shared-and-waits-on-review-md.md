---
status: accepted
---

# The look's procedure lives in one file, and waits on `review.md`

ADR-0006 has `/explainer-render` run the readability look alongside capture. `/explainer-script` runs the same look over every step at Checkpoint 3. Neither source says where the procedure lives, or how the skill knows the keyframes are ready while capture is still running.

**One file.** The procedure, meaning the viewer subagent's prompt and the comparison against the script's actions, lives at `skills/explainer-render/look.md`. `/explainer-script` reads it through a `cd -P`-resolved path (ADR-0013). The seeded look cases test the only copy.

**The ready signal is `review.md`.** The CLI clears a render's previous keyframes and `review.md` only after its check pass, so polling for keyframes can pick up stale ones. Before starting `render` in the background, `/explainer-render` deletes `render/<pack>/review.md` itself. The file reappearing means the check pass has finished and this render's keyframes are on disk.

## Consequences

- An ordering contract with the CLI: `review.md` is written after the keyframes and before capture. The CLI already writes in that order (ADR-0004), and must keep doing so.
- On a findings stop, `review.md` still appears and the render exits 3. The skill then puts the stop to the author rather than running the look.

## Considered options

- **The procedure duplicated in both skills.** Rejected: only one copy would be tested.
- **A look-only mode of `/explainer-render`**, invoked by `/explainer-script`. Rejected: it couples the skills through invocation.
- **The CLI clearing outputs first, or printing a progress line.** Rejected: a CLI change for something the skill can arrange itself.
