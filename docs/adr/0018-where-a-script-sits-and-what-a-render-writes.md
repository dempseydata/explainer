---
status: accepted
---

# A script sits at `explainers/<slug>/` or `local-data/<slug>/`, and renders by fixed name to `local-data/<slug>/render/<pack>/`

[#8](https://github.com/dempseydata/explainer/issues/8) and ADR-0005 put the committed script at `<root>/explainers/<slug>/script.yaml`. Extracts, the draft and renders go in the gitignored `<root>/local-data/<slug>/`. The spec ([#12](https://github.com/dempseydata/explainer/issues/12)) derives the render folder from the script's path, so the CLI must find the root from that path alone. ADR-0004 and ADR-0006 say what a render writes, but not which files it uses, or what happens to the previous render's files. [#13](https://github.com/dempseydata/explainer/issues/13), [#14](https://github.com/dempseydata/explainer/issues/14), [#21](https://github.com/dempseydata/explainer/issues/21) and [#22](https://github.com/dempseydata/explainer/issues/22) settled both.

**Where a script sits.** The folder above the script's own folder must be named `explainers` or `local-data`, or the CLI exits 2. That folder's parent is the **root**, and the script's own folder name is the **slug**. The CLI checks those names only. It does not check the file name: the skills use `script.yaml` and `script.draft.yaml`. Nor does it check the slug's characters, which the skills keep to `[a-z0-9-]`. A source's `path` is relative to the root. An absolute path, or one containing `..`, is a validation error (exit 1).

**Where it renders.** A render of the script, or of its draft, in pack `<pack>` goes to `<root>/local-data/<slug>/render/<pack>/`:

| File | Written |
| --- | --- |
| `layout.json`, `explainer.html` | By every render but `--frame`. |
| `keyframes/step-NN.png` | By every render but `--frame`: one per step, at its rest, numbered from `01`. |
| `review.md` | By every render but `--frame`, once, after the keyframes and before capture (ADR-0014). |
| `explainer.mp4`, `captions.srt`, `narration.md` | Only when the render captures, which needs no findings or `--accept-findings`. |
| `frames/graph.png`, `frames/step-NN.png` | By `render --frame` only, which first deletes `frames/`. |

**Prior outputs are cleared by fixed name.** A render builds everything the check pass needs before it writes anything. Then, after the check pass and before its first write, it deletes `keyframes/`, `review.md`, `explainer.mp4`, `captions.srt` and `narration.md`. `layout.json` and `explainer.html` are overwritten. A `--frame` run deletes `frames/` and nothing else. Nothing else in the folder is touched.

**`review.md`**, as the CLI writes it:

```markdown
# Review: <meta.title>, <pack> pack

## Findings

| Step | Check | Finding | Status |
| --- | --- | --- | --- |
| 6 | overlap | … | stopped capture |
```

`Status` is `stopped capture`, or `accepted` under `--accept-findings`. A `|` in a message is written `\|`. With no findings, the line `Nothing to report.` replaces the table. The skills append `## Look` after it (ADR-0006).

**`render --frame graph`, or `render --frame <n>,<n>,…`,** runs the check pass at the named frames and never captures. It reads the script as a draft, so steps may be absent and a `draft:` block is dropped. `graph` is one made-up step that reveals every declared group, node and edge at once, with no states, transients or caption. A list names steps counting from 1, and a step the script lacks exits 2. Layout is the script's own, so a frame puts each element where the full render does. It writes only `frames/`, reports `findings`, and exits 0.

**The narration outputs.** `captions.srt` has one cue per step, from its start to its end. `narration.md` has the heading `# <title>`. Then each step has a `## Step N · <start>–<end> s` section, holding its narration and each cite as `"quote" — <source title>`. A `## Sources` list ends the file.

## Consequences

- **No stale output once the clear has run.** A render that stops at findings leaves no MP4 from the last render beside its `review.md`. A render that fails during capture leaves the pre-capture files, and no MP4. A render that exits 1 or 2, or 70 before the clear, leaves the previous render's files as they were, its MP4 included.
- **A draft and its script share a render folder.** Checkpoint 2's `--frame graph` cannot overwrite a real render's files, because it writes only `frames/`.
- **A file the CLI does not name survives a render.** The look the skill appended goes with `review.md`. Anything else in the folder stays.
- **The location check is by name only**, like `fetch`'s (ADR-0009). Whether `local-data/` is gitignored is `/explainer-script`'s check, not the CLI's.
- **`narration.md` carries only the steps' cites.** The graph's cites are in the script and in Checkpoint 1's grounding table.

## Considered options

- **Deriving the root from the path without checking where the script sits** (#13's first cut). Rejected in #14's review. #8 fixes where a script sits, and a script anywhere else would put a `local-data/` two folders above it, wherever that happened to be.
