---
status: accepted
---

# Layout packs sibling groups into rows to maximise label size

A story laid out by ELK alone runs about 5:1. Wayfinder's end frame binds on width at ×0.58, leaves about two-thirds of a 16:9 frame empty, and renders labels only at the x-height floor. Explainers will be embedded in documents and slides at reduced size, where floor-sized text stops being legible. So the renderer maximises the label x-height `F` rather than holding it at the floor, and gets there by wrapping. Groups that share a parent are each laid out by ELK on their own. The renderer packs them into rows in reading order, trying every row count and keeping the one with the largest `F`, and ELK lays out the level above around the packed parent. Estimated on Wayfinder: ≈ ×0.70, about +20 % label size. The rules in full are in the resolution of [What layout rules does the renderer add around ELK?](https://github.com/dempseydata/explainer/issues/9).

## Consequences

- **Layout is a pure function of script and pack.** `layout.json` is written for the checks and for debugging, and never read back. The brief's hand-adjust-and-lock is dropped: the file lived in gitignored `out/`, and any change of label, node or pack invalidates its coordinates. A layout override, if one is ever needed, belongs in the script, where it is versioned.
- **The x-height floor is a minimum, not a target.** A ceiling of about 2× the floor stops small scripts rendering slide-title labels. Both are single constants in rendered pixels, the same for every face. Labels are measured in the pack's face in the headless Chromium that capture already launches.
- **A row breaks only where no edge crosses the break.** elkjs cannot route edges between fixed positions, so a script whose sibling groups are connected gets fewer break points, and in the limit one row.
- **Sibling order is derived from the script:** first reveal, then first state change, then declaration order. The fog clears in reading order however the author declares the patches.
- **The transient band stays.** Root-level nodes are placed by ELK, so the session/subagent column (about 14 % of the width) is empty in Wayfinder's end frame. That is the price of ADR-0002's fixed positions.

## Considered options

- **Accept 5:1.** No code, and the floor still guarantees legibility at full size. Rejected because the explainer is embedded at reduced size.
- **ELK's own graph wrapping.** It does not reach inside compound groups. With a 16:9 target it gained scale only by moving the Destination below-left of the map.
- **A per-step camera** (a `focus`-style `viewBox` tween around what is visible). It enlarges early steps but leaves the end frame unchanged.
- **A fixed wrap threshold** ("wrap past 3:1"). It needs an unjustifiable number, and it can pick a worse packing than one row.
- **A router for edges between rows.** Deferred: no edge crosses a row break in the one real script.
