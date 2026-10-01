---
status: accepted
---

# A style pack is `cli/packs/<name>/pack.json` and its assets, and the player reads these keys

The spec ([#12](https://github.com/dempseydata/explainer/issues/12)) lists what a pack holds: visuals for every vocabulary entry, motion per verb, named colour tokens, a face and caption size, outlines for edge clipping, and licensed assets. The build named the keys in [#13](https://github.com/dempseydata/explainer/issues/13), [#18](https://github.com/dempseydata/explainer/issues/18), [#19](https://github.com/dempseydata/explainer/issues/19), [#20](https://github.com/dempseydata/explainer/issues/20) and [#23](https://github.com/dempseydata/explainer/issues/23). No schema checks `pack.json`: the CLI and the player read it directly. This ADR is the contract a new pack is written to.

**The folder.** `cli/packs/<name>/` holds `pack.json` and the fonts, icons (`icons/<name>.svg`) and licence texts it names, with paths relative to the folder. The `name` in `pack.json` is the folder's name. One shared player draws every pack (#23). A `rough` block selects its rough.js branch; without one, the player draws plain SVG.

**Units and colours.** A size is in rendered pixels at 1080p (`_px`), a multiple of the label x-height F (`_F`), or, inside a glyph, a unit of its 48-unit box (`_u`). A colour is always a token's name. Only `tokens` holds hex values.

| Key | Holds |
| --- | --- |
| `name` | The folder's name. |
| `about` | Free text, read by no code. |
| `ground` | The background's token. |
| `tokens` | `{name: "#rrggbb"}`, each becoming the CSS custom property `--name`. |
| `face` | `family`; `files`, one WOFF2 per weight, inlined; `text`, its token; and optionally a `halo` token with `halo_px` behind lettering. |
| `caption` | `band_px`, `font_px`, `line_px` and `weight`. |
| `licences` | `[{assets, licence, file}]`, each inlined into the page as a comment. |
| `libraries` | Optional: npm module paths, inlined as scripts. |
| `paper` | Optional: a static noise texture over the ground, given as a `grain` token, `frequency`, `octaves`, `seed` and `opacity`. |
| `layout` | `margin_px`, then these multiples of F: `node_gap_F`, `layer_gap_F`, `edge_gap_F`, `group_pad_F`, `card_height_F`, `card_pad_F`, `icon_F`, `icon_gap_F`, `badge_F`, `label_gap_F`, `annotation_gap_F`, `annotation_pad_F` and `annotation_height_F`. |
| `group_types`, `node_types`, `edge_kinds`, `states` | One entry per vocabulary name the pack maps. |
| `verbs` | One entry per verb the pack maps, each with `duration_s`. |
| `rough` | Rough packs only: `boil_fps`, `roughness` (the default), `hachure_gap_px`, `hachure_px`, `glyph_px`, `glyph_hachure_gap_u`, `glyph_hachure_u` and `wipe_pad_px`. |
| `glyphs` | Rough packs only: `{name: [{d, fill?}]}`, paths in a 48-unit box. A part with a `fill` token is hachured in that token. |

Each entry holds these keys. Where a branch is named, the key belongs to that branch.

- **A group type:** `stroke` and `stroke_px`, and optionally `dash_px` and `label_weight`. Plain packs add an optional `corner_px`; rough packs add `roughness` and `double_px`. A `shape` key may be present, but nothing reads it.
- **A node type:** `shape`, which is `rect` (a card) or `circle` (with `radius_F`, and its label below it); `stroke` and `stroke_px`; optionally `dash_px` and `label_weight`.
  - Plain packs add `fill`, optional `fill_opacity`, `corner_px`, `icon` and `icon_colour`, and `icon_F` for a circle.
  - Rough packs add `glyph`, optional `hachure`, and `glyph_F` for a circle.
- **An edge kind:** `stroke`, `stroke_px`, `head` (`filled` or `open`) and `head_px` (`[length, width]`). Optionally `dash_px` and `roughness`.
- **A state:** a `mark`, which is one of:
  - `none`;
  - `slot` (plain only: `fill`, `icon`, `icon_px` and `icon_colour`), which fills the outline under the body;
  - `ring` (`stroke`, `stroke_px` and `offset_px`, with optional `roughness`);
  - `badge`, which takes `fill`, `icon` and `icon_colour` in a plain pack, or `glyph` and `stroke` in a rough one;
  - `corner` (rough only: `glyph`, `stroke`, `stroke_px`, `fill`, `size_F` and `glyph_F`).
- **The verbs:**
  - `reveal`, `hide` and `set_state` take `duration_s`. A plain `reveal` also takes `scale_from`.
  - `highlight` takes `stroke`, `stroke_px` and `offset_px`. A plain pack adds an optional `glow_px`. A rough pack adds `roughness`, `ellipse_box` and `ellipse_circle_box`.
  - `annotate` takes `stroke` and `stroke_px`. A plain pack adds `fill` and `corner_px`; a rough pack adds a `text` token and `head_px`.

## Consequences

- **Coverage is membership.** `validate --pack` and `render` check two things. Each declared group type, node type, edge kind and state must be an own key of the matching block. Each verb a step uses must be in `verbs`. Anything missing is a validation error (exit 1). Neither installed pack maps `focus`, so a script that uses it fails in both until a pack does (the spec's Out of Scope).
- **Nothing else is checked.** A pack missing a key the player reads either fails at render as an internal error (exit 70) or draws wrongly. Rendering Wayfinder in a new pack is the test of that pack.
- **Some mark kinds belong to one branch.** A rough pack cannot use `slot`, and a plain pack cannot use `corner`.
- **The page carries the pack.** `DATA.pack` holds all of it except `licences` and `libraries` (ADR-0019), so the page needs no other file.
- **The pack's name is part of its render folder** (ADR-0018), so renaming a pack moves its renders.

## Considered options

- **A player per pack.** The spec spoke of "the pencil player". Rejected in #23 for one shared `player.js` with a branch for rough packs: the timeline, the caption, `frameKey` and the page contract would otherwise each have two copies.
