---
status: accepted
---

# /explainer-script: grounding at Checkpoint 1, timing fitted to every pack, and extracts the model never writes

The brief described `/explainer-script`'s three checkpoints, its resumable draft and its edit-in-place in one paragraph each. Worked through against schema v0.1 (ADR-0002) and the pre-capture checks (ADR-0004), three of its decisions are ones a later reader would not guess. The full resolution, including the checkpoint contents, the draft's shape and where generated files go, is in [How does /explainer-script run its checkpoints, resume, and edit one section in place?](https://github.com/dempseydata/explainer/issues/8).

**Grounding is judged where it is cheapest to fix.** The validator proves a quote is in its extract; only the author can judge that it supports the label. Checkpoint 1 shows a grounding table of every group, node and edge beside the Mermaid graph, so graph grounding is approved with the graph. Checkpoint 3 judges only the steps' narration and annotations. A label found unsupported at Checkpoint 3 would unwind the steps that reveal it.

**Timing is fitted to every installed pack; geometry to the chosen one.** Overrun suggestions from every pack are put to the author in one turn, and each step takes the largest. A longer duration only adds hold time (ADR-0004), so the fix is monotone and the script stays swappable across packs. Findings are not: shortening a label to clear an overlap in one pack may do nothing, or worse, in another. So the check pass runs at Checkpoint 3 in the chosen pack only, and `/explainer-render` meets findings only when rendering in a pack not approved.

**The model never writes an extract.** A quote substring-checked against a file the model wrote is self-certifying. The CLI's `fetch` writes bytes straight to disk: HTTP and pandoc, then headless Chromium, with a 100-word floor below which the fetch has failed. Only then does the skill offer fetch tools it finds available (Tavily and the like). Their output reaches disk through the model, so the source records `via: <tool>` and the grounding tables label its quotes *transcribed*. After that, the author supplies the text or the source is dropped; nothing is invented to fill the gap.

## Consequences

- **Checkpoint 2 needs `render --frame graph`.** Steps are written after the pack is chosen, so no step-based frame exists yet. It reveals every declared element with no states; both packs are shown side by side. Checkpoint 3's covering frames (the fewest steps that between them use every verb and state) come from the check pass.
- **M1's validator gains `validate --draft`,** which accepts a draft without `steps` and ignores its `draft:` block, and **a rule that an element declared but never revealed is an error.**
- **The draft is one file:** the script so far plus a `draft:` block (`checkpoint`, `pack`, `target_s`, `gaps`, `root`), saved at each checkpoint and removed at Emit. Edit-in-place works on a draft copy, re-runs the full validation, and re-shows only the changed rows.
- **Generated files go where the author says,** asked once before the first write: the project root by default, beside a named local source, or another path. `explainers/<slug>/script.yaml` is committed; `local-data/<slug>/` (extracts, draft, renders) is gitignored, and the skill asks before adding the ignore line. A project's own files are cited in place at a commit, not copied.
- **Unsupported wording has three ways on:** fall back to what the source supports, find a source, or say it in an author-notes source cited like any other. A loosened quote is not one of them.

## Considered options

- **Grounding judged once, at Checkpoint 3.** Rejected: it audits the graph after steps depend on it.
- **Fitting the chosen pack only.** Rejected: a script that renders in one pack breaks "swappable style packs" silently.
- **Checking geometry in every pack.** Rejected: it makes the author chase findings in a look they did not choose, with fixes that can conflict.
- **`WebFetch` or an MCP extract tool as the first fetch.** Rejected: a model processes or transcribes the page, so the quote check proves less.
