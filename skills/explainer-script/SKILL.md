---
name: explainer-script
description: Turn a conversation about a process into a source-grounded explainer script, approved at checkpoints. Use when the author wants to script an animated flowchart explainer, or to resume an explainer draft.
---

# /explainer-script

You turn a conversation about a process into a **script**: a graph of groups, nodes and edges, every one grounded in a verbatim quote from a source. Propose rather than ask, one decision per turn.

This skill currently runs Intent → Grounding → Checkpoint 1. After the author approves Checkpoint 1, give the draft's path, say that invoking this skill again resumes it and that the later checkpoints are not built yet, and stop.

## The CLI

Everything deterministic is the `explainer` CLI, in the plugin's `cli/` folder; never call `explainer` from PATH. Find it from this skill's base directory, `<skill-dir>`, with `CLI="$(cd -P "<skill-dir>/../../cli" && pwd)"`. Shell state does not carry between calls, so set `CLI` in every call that runs the CLI, as `node "$CLI/cli.js" <command> …`. Quote every argument built from input in single quotes, writing a `'` inside one as `'\''`.

Before the first CLI call in a session, run `"$CLI/setup.sh"`. It installs the CLI's dependencies and Chromium when they are missing, and says so in one line: pass that line on. If it exits non-zero, stop and report its output. It is not a CLI exit code.

Each command prints a JSON report on stdout: `errors` (each with `message`, `at`, `line`), `warnings`, `written`, and for `fetch`, `words`. Exit 0 is success, 1 a validation or fetch failure, 2 a usage error or refusal, 70 an internal error (pandoc missing, Chromium failing to launch): on 70, stop and report it to the author, and never fall back to another fetch tool. Read the report; never guess.

## Resume

Before anything else, look for drafts: `find . -path '*/local-data/*/script.draft.yaml' -not -path '*/node_modules/*'`. If one is found, offer it in one line: `Resume "<meta.title>" from Checkpoint <draft.checkpoint>? (<path>)`. On yes, load it, run `node "$CLI/cli.js" validate --draft '<path>'` and handle the report as at Checkpoint 1, then present that checkpoint again. On no, start fresh, and ask before any write that would replace that file. A draft elsewhere is resumed only when the author points you at it.

## 1. Intent

Capture, proposing each rather than asking open questions:
- **title**: `meta.title`, what the explainer is called;
- **audience**: who watches;
- **outcome**: one sentence, "after watching, the viewer understands …";
- **target duration**: default 60–90 s.

Then ask **once** where files go, before the first write: the project root (default), beside a named local source, or another path. That directory is the **root**. Propose a **slug** (kebab-case of the title) in the same turn. Files go only here:
- `<root>/local-data/<slug>/sources/`: extracts;
- `<root>/local-data/<slug>/script.draft.yaml`: the draft.

Check `local-data` is ignored: `git -C '<root>' check-ignore -q 'local-data/<slug>/script.draft.yaml'` (a file path, not `local-data/`). Exit 0: ignored. Exit 1: ask before adding the line `local-data/` to `<root>/.gitignore`; if the author declines, stop, since extracts and drafts must not reach git. Exit 128: the root is not in a git repo; say so and go on.

## 2. Grounding

Ask for sources: URLs, files, notes. An **extract** is written by `fetch`, never by you; one transcribed from another tool's output is marked as such. Each source gets an id, and ends up as one of:

- **A URL:** `node "$CLI/cli.js" fetch '<url>' '<root>/local-data/<slug>/sources/<id>.txt'`. On exit 0, record `{id, title, url, path: local-data/<slug>/sources/<id>.txt, fetched: <today>}`. On exit 2, read the error: an existing extract, ask before re-running with `--overwrite`; a path or symlink refusal is a bug in this skill, so stop and report it. Only exit 1 (an HTTP or network error, or under 100 words) leads to the next line.
- **Only if `fetch` exited 1:** name the fetch tools you actually have (for example a web-extract tool), and offer them. If the author picks one, write its output to that path yourself and add `via: <tool name>` to the source. Its quotes are *transcribed*: say so wherever they are shown. This is the only extract that passes through you, and it is marked.
- **If nothing can fetch it:** the author saves the text at the path you name, or the source is dropped and the claims resting on it become **gaps**.
- **A file in the project:** cite it in place, `{id, title, path: <path relative to root>, version: <git commit>}`. It must sit under the root.

Every `path` is relative to the root.

### Grounding rules

- Every group, node and edge carries a `cite`: `{src, quote}` or a list of them. The quote is verbatim from the extract.
- A label must be supported by its quote. Where the source names only a kind of thing, label it by type ("Research", not an invented topic).
- No fact a source does not state. A claim the author wants that no source supports is a **gap**: held in `draft.gaps`, never written into the graph. Offer three ways on, and only these:
  1. fall back to what the source does say (often the type name);
  2. find a source that says it;
  3. the author writes it in a notes file at a path you name, cited like any other source.
  A loosened quote is not a fourth way.

## 3. Concept map → Checkpoint 1

Propose the declared vocabulary (`group_types`, `node_types`, `edge_kinds`, `states`) and the `groups`, `nodes` and `edges`: one id namespace, labels ≤ 30 characters, no edge labels, containment by `group` / `parent`, never by an edge.

**Save the draft**, only here at the checkpoint, then validate it. The draft is the script so far (`meta` with `schema: 0.1`, title, audience, outcome; `sources`; `graph`; no `steps`) plus:

```yaml
draft:
  checkpoint: 1
  pack: null
  target_s: 75          # the Intent target
  gaps: []              # each an unsupported claim, in the author's words
  root: .               # the root, as the author gave it
```

Run `node "$CLI/cli.js" validate --draft '<root>/local-data/<slug>/script.draft.yaml'`. Fix every error and re-run until exit 0. A warning that an extract is absent or has no path means its quotes went unchecked: fix it as well, so that no quote reaches the author unchecked.

Then show Checkpoint 1:

1. **A Mermaid fence of the whole declared graph**: every group, node and edge, with no states.
   - Each group is a `subgraph <id>["<label or id>"]`, nested by `parent`.
   - Each node is `<id>["<label>"]`, assigned its node type's `classDef` with `class <id> <type>` (dots in type names become `_`). Prefix any id Mermaid reserves, such as `end`.
   - Every declared edge kind gets its own arrow style, in declaration order: `-->`, `-.->`, `==>`, `--o`, `--x`, then a `linkStyle` colour for any further kind. Follow the fence with a legend, one entry per kind: arrow → kind.
2. **A grounding table** of every group, node and edge: `id · label · src · quote`, one row per quote where an element cites several, quote in full, *transcribed* marked where the source has `via`.
3. **The gaps**, if any, each with its three ways on.

Ask the author to approve topology, labels and grounding. Not layout: that is Checkpoint 2. On a change, edit, save, validate and show Checkpoint 1 again.
