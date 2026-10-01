---
status: accepted
---

# The page contract is `?bare`, `seek`, `frameKey`, `DATA` and the frame's data attributes

*Amends ADR-0001 and ADR-0016.*

ADR-0001 gives the player `seek(t)` and `frameKey(t)`, and ADR-0007 has capture load the player bare. Capture, the check pass and the tests all drive `explainer.html` in headless Chromium (seam 2). The build added what they read: the bare view in [#20](https://github.com/dempseydata/explainer/issues/20), the data attributes in [#18](https://github.com/dempseydata/explainer/issues/18), [#22](https://github.com/dempseydata/explainer/issues/22) and [#33](https://github.com/dempseydata/explainer/issues/33), and the data the page is drawn from. This ADR records them, so that a change to the player knows what it must keep.

**`?bare`.** With a `bare` query parameter, whatever its value, the page is the frame alone. There is no chrome, no transcript and no key handling, only the SVG `#frame` (viewBox 1920×1080) at the viewport's width. Capture and the check pass load the page this way, at a 1920×1080 viewport. Without the parameter, ADR-0007's step-through controls wrap the same frame.

**Globals.**
- `seek(t)` draws exactly the frame at `t` seconds, from any prior state (ADR-0001).
- `frameKey(t)` is described below.
- `DATA` is what the page is drawn from. The check pass reads `DATA.nodes` (`id`, `label`) and `DATA.edges` (`id`, `from`, `to`, and `points`, the route in frame pixels). It also reads `DATA.pack`, which is the pack without `licences` and `libraries`. The tests also read `DATA.events` (`verb`, `id`, `t0`, `d`, `step`).

**Data attributes**, all inside `#frame`:

| Attribute | On |
| --- | --- |
| `data-id="<id>"` | Each group's, node's and edge's `<g>`, one per element. |
| `data-outline` | The element's outline, a direct child of its `<g>`: a node's or group's shape, or an edge's route. In a pack with a `rough` block, it is the unpainted ideal outline that the strokes are drawn from. |
| `data-line`, `data-head` | An edge's line, and its arrowhead. In a pack with a `rough` block, an annotation's arrow carries them too. |
| `data-mark="<state>"` | A state mark's `<g>`, inside its group's or node's `<g>`; edges have none. There is one for each state the pack draws, meaning each state whose `mark` is not `none`. |
| `data-note` | Each annotation's `<g>`, outside every `data-id`. |
| `data-caption` | The caption's `<text>`, with one `<tspan>` per line. |

**Hidden means opacity 0, never absent.** Every element, mark and annotation is drawn once. One that is not shown has opacity 0, on its own `<g>` or on an ancestor's. The check pass counts something as shown only when no ancestor up to `#frame` has opacity 0.

**`frameKey(t)`.** Two times with the same key draw the same frame. Capture relies on this to screenshot each distinct key once. The key covers:
- the step at `t`, which also covers the caption (ADR-0007);
- each action target's progress at `t`, as the player draws it, rounded to 0.01. A highlight or an annotation is 0 outside its own step;
- in a pack with a `rough` block, the boil tick, `⌊t × rough.boil_fps⌋`, but only while something is shown.

Only equality is part of the contract, not the key's format. Anything else that moves with `t`, such as idle motion or a camera, must add a term.

## Consequences

- **Capture, the check pass and the tests share this one interface.** They reach nothing else inside the player.
- **A new player branch keeps the attributes.** The check pass finds elements, outlines, marks, annotations and the caption through them. Without `data-outline` on a shown node, or `data-id` on a shown edge, the check pass throws and the run exits 70. Without `data-mark`, `data-note` or `data-caption`, the marks, annotations or caption go unmeasured, silently.
- **What the check pass measures** is ADR-0016's four kinds ([#22](https://github.com/dempseydata/explainer/issues/22), [#33](https://github.com/dempseydata/explainer/issues/33)). A `crossing` is an edge's route against the bounding box of every other shown node's outline. A `ring` mark is not measured against what lies inside its element's outline, or against edges. A `slot` mark is not measured at all. Every other mark is measured against every edge, its own element's included.
- **A key that changes with no visible change costs one screenshot**, and nothing else.
