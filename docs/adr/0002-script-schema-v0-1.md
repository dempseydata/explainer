---
status: accepted
---

# Script schema v0.1, frozen against the whole Wayfinder story

The brief's draft schema was tested by hand-writing the complete Wayfinder script against it: 12 steps, 74 s, 30 quotes, every quote substring-checked against its stored extract. The story fitted, but only by improvising in 15 places, four of them outright breaks. The schema is frozen at v0.1 with the changes below. It supersedes the schema section of `background/ideation/brief.md`. The script is [`build/examples/wayfinder/script.yaml`](https://github.com/dempseydata/explainer/blob/prototype/schema-wayfinder/build/examples/wayfinder/script.yaml) on the throwaway branch `prototype/schema-wayfinder`; the first commit there is the draft with its bend markers.

## The schema

| Section | Holds | Rules |
| --- | --- | --- |
| `meta` | `schema: 0.1`, title, audience, outcome sentence | No duration: the total is derived from the steps. |
| `sources` | id, title, url and/or path, fetched date, version where pinned | `path` locates the stored extract, committed or gitignored. The quote check warns, rather than passes, when an extract is absent. |
| `graph.group_types`, `node_types`, `edge_kinds`, `states` | Declared vocabularies | A style pack maps every entry. A dot in a type name is part of the name, not inheritance. |
| `graph.groups` | id, type, optional `parent`, optional label, `cite` | Spatial containment, laid out by ELK as compound nodes. |
| `graph.nodes` | id, type, label (≤ 30 chars), optional `group`, `cite` | `group` must resolve to a declared group. |
| `graph.edges` | id, `from`, `to`, kind, `cite` | Either end may be a node or a group. There are no edge labels. |
| `steps` | actions (≤ 3), narration, `duration_s`, `cite` | |
| `style_hints` | Optional per-node hints | Packs may ignore them. |

**One namespace.** Groups, nodes and edges share one id space, and any action may target any of them. Nothing is visible until revealed.

**Actions.** Every action has the form `{verb: target}`, or `{verb: {target, …}}` when it takes arguments. A target is an id or a list of ids. An action aimed at a group acts on the group itself, meaning its frame or its state, never on its members.

| Verb | Lifetime | Form |
| --- | --- | --- |
| `reveal`, `hide` | Persistent | `{reveal: [t1, t2]}` |
| `set_state` | Persistent | `{set_state: {target: [t1, t2], state: frontier}}`, using declared states only |
| `highlight`, `focus` | This step only | `{highlight: map}` |
| `annotate` | This step only | `{annotate: {target: goal, text: "…"}}`, text ≤ 30 chars |

A step's actions play in the order listed. Each starts when the previous one's animation ends, the pack sets how long each animation takes, and the step then holds until `duration_s`. The targets within one action appear together. So the frame at time `t` is the persistent state accumulated so far plus the current step's transient effects, and `seek(t)` never replays transient effects from earlier steps.

**Citations.** Every `cite` is a `{src, quote}` or a list of them. Before matching, quotes and extracts are normalised: whitespace, case, Markdown emphasis and code marks, and typographic punctuation (‘’“” become straight quotes; – and — become `-`). Annotation text is covered by its step's cites; the author judges it at Checkpoint 3, the same standard node labels meet.

## Consequences

- **Where the draft broke.** Edges had no ids, so no step could reveal blocking edges after their tickets. `set_state` could not take a list. Five of the twelve narration lines make two claims and needed two quotes. Containment was expressed three ways (a `region` node type, an undeclared `group` tag, and `contains` edges), and none of them meant "inside". A typo in a group name created a new group.
- **The map is a group**, a frame holding the fog patches and the tickets. Being a child issue is shown by position, and the `contains` edge kind is gone. The graph went from 16 nodes and 14 edges to 4 groups, 11 nodes and 6 edges.
- **`unhighlight` and `pause` are gone.** Emphasis that should last is a state; a pause is a step with no actions.
- **Layout covers every element ever revealed, not the final frame.** Sessions and subagents are hidden by the end but need positions.
- **Timing depends on the pack.** A script can fit its durations in the standard pack and overrun in pencil, where reveals draw on. The overrun check reports against a named pack.
- **Invented instance labels cannot be cited.** "Grill: scope" appears in no source, so the example labels its tickets by type. This is a rule for the scripting skill, not the schema.
- **Typographic folding is required, not cosmetic.** The Latent Space extract uses curly apostrophes, so a quote typed with a straight one failed.
- **The example survives.** `script.yaml` becomes M1's hand-written example and M6's baseline for "an equivalent script". The prototype checker dies; M1 builds the validator test-first in Node. M1 vendors the pinned `SKILL.md` under `examples/wayfinder/sources/` with its MIT notice.

## Considered options

- **The map as a hub node with `contains` edges to each ticket** (the brief's version). Rejected: 8 edges fanning out across the route, growing with each wave. In Wayfinder the fog of war is on the map, not beside it.
- **Transient emphasis that persists until undone.** Rejected: it needs `unhighlight` and ids for annotations, and the script never wanted emphasis to outlive its step.
- **Annotations with their own cite, or text restricted to a verbatim fragment of a quote.** Rejected: the first checks the same quote twice; the second forces callouts written in the source's prose rather than the viewer's language.
- **Simultaneous actions, or author-set offsets.** Rejected: simultaneous starts would draw edges before their tickets appear, and offsets put timing, which belongs to the pack, into the script.
