---
status: accepted
---

# The draft is the script plus a `draft:` block, and Emit validates, moves, then stamps

ADR-0005 makes the draft one file, the script so far plus a `draft:` block, saved at each checkpoint and removed at Emit. ADR-0011 puts `/explainer-script` at `skills/explainer-script/`. Neither says what the block's fields mean, how the CLI treats the block, or the order of Emit. That order matters: a failure halfway could leave a script with no stamp, or a stamp for a script that never landed. [#25](https://github.com/dempseydata/explainer/issues/25) and [#26](https://github.com/dempseydata/explainer/issues/26) settled it.

**The draft** is `<root>/local-data/<slug>/script.draft.yaml`. It holds the script so far, under schema v0.1, with no `steps` until Sequencing. It also holds this block:

```yaml
draft:
  checkpoint: 1     # the checkpoint a resume presents: 1, 2 or 3
  pack: null        # the chosen pack's name, set when Checkpoint 2 is approved
  target_s: 75      # the Intent's target duration, in seconds
  gaps: []          # each an unsupported claim, as a string in the author's words
  root: .           # the root, as the author gave it
```

The skill writes the draft with its file tool, and only at a checkpoint. **The CLI never reads the block.** `validate --draft` and `render --frame` drop it, and let `steps` be absent. Every other command rejects `draft` as not part of schema v0.1. So a draft cannot be fully rendered, or emitted, with its block on. A draft found under the working directory is offered back in one line, `Resume "<meta.title>" from Checkpoint <draft.checkpoint>? (<path>)`. When there are several, each gets one such line, and the skill asks which.

**Emit**, on approval of Checkpoint 3, runs in this order:

1. Strip the `draft:` block. Then run `validate`, without `--draft`, in every installed pack. On any error, put the block back and return to Tightening.
2. `mv` the draft to `<root>/explainers/<slug>/script.yaml`. One move writes the script and removes the draft.
3. Write the approval stamp (ADR-0012), hashing the file just moved.

**Edit in place** never edits the script. It copies the script to the draft with `cp`, then appends a block: `checkpoint: 3`, `pack` from the stamp (or asked for if there is none), `target_s` set to the script's current total, `gaps: []`, and `root`. A draft found beside a committed script is resumed as an edit. The committed script changes only at Emit, and Emit rewrites the stamp.

## Consequences

- **The bytes validated are the bytes committed and hashed.** Nothing rewrites the file between the validation, the move and the stamp.
- **A stamp never describes a script that did not land.** A failure before the move leaves the committed script and its stamp as they were. If the stamp fails after the move, the old stamp no longer matches, or there is none, so `/explainer-render` runs the look (ADR-0012).
- **The move is the only step that changes the committed script.** On one filesystem it either happens or it does not, and a failed move leaves the draft for Emit to resume from.
- **Open gaps are dropped with the block at Emit**, and the skill does not mention them.
- **A session that stops between the strip and a restore** leaves a draft with no block.

## Considered options

- **Writing the script, then deleting the draft.** Not taken in #26: a failure between the two steps leaves both files.
