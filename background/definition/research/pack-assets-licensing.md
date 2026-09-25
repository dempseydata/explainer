# Pack assets and libraries: what the style packs may bundle

Research for [#2](https://github.com/dempseydata/explainer/issues/2), part of the map [#1](https://github.com/dempseydata/explainer/issues/1). Checked 2026-09-25 against each project's own licence file, the licence texts themselves and the projects' official docs. Every licence claim links its source.

**Scope.** This note answers one question: which fonts, textures, glyph approaches, icons, shapes and tools are licensed so that a public MIT repo and its generated output can bundle or invoke them, using free and open-source software only. It shortlists candidates for each slot. It does **not** choose a look. That is for the pack prototypes, [#5](https://github.com/dempseydata/explainer/issues/5) (pencil) and [#6](https://github.com/dempseydata/explainer/issues/6) (standard).

**Column meanings.** *Redistributable* means the file may be committed to this repo. *Attribution* means what must travel with the file. *Bundle* means the file can ship inside the pack or be inlined into `explainer.html`, with nothing fetched at runtime.

## Summary

| Slot | Shortlist (unranked) | Licence | Redistributable | Attribution | Bundle |
| --- | --- | --- | --- | --- | --- |
| Handwriting font | Caveat · Patrick Hand · Kalam | OFL-1.1 | yes | copyright line + OFL text alongside the file | yes |
| Neutral sans font | Inter · Atkinson Hyperlegible Next · IBM Plex Sans | OFL-1.1 | yes | copyright line + OFL text; Plex has a Reserved Font Name | yes |
| Paper texture | procedural SVG `feTurbulence` · ambientCG `Paper001`–`006` | none (own code) · CC0-1.0 | yes | none | yes |
| Hand-drawn glyphs | own glyph geometry through rough.js · MIT/ISC icon paths through rough.js · Excalidraw libraries | MIT (ours) · MIT / ISC · MIT | yes | the source set's notice, if one is used | yes |
| Flowchart icons | Tabler Icons · Lucide · Phosphor | MIT · ISC AND MIT · MIT | yes | the set's licence notice | yes |
| BPMN-style shapes | own SVG primitives · bpmn-font | none (own code) · OFL-1.1 | yes | none · copyright line + OFL text | yes |
| Sketch strokes | rough.js 4.6.6 | MIT | yes | MIT notice | yes. Seedable, but **seed must be non-zero** |
| Auto-layout | elkjs 0.12.0 | EPL-2.0 (npm: `EPL-2.0 OR GPL-3.0-or-later`) | yes, with conditions | EPL notice + where to get source, **only if a copy is distributed** | yes, but it belongs in the build CLI, not the player |
| Capture | Playwright 1.63 (+ Chromium) | Apache-2.0 (Chromium BSD-3-Clause) | not needed | none: invoked, not distributed | n/a |
| Encode | ffmpeg (external binary) | LGPL-2.1-or-later, or GPL-2.0-or-later when built with e.g. libx264 | not needed | none: invoked, not distributed | n/a |

**Excluded:** bpmn-js (MIT plus a watermark clause), draw.io stencils (a field-of-use restriction beyond Apache-2.0), Excalifont (licence stated only inside a split font file, marked "All rights reserved" and trademarked), Subtle Patterns and Transparent Textures (licence version unstated). Reasons are given under each slot.

**No licence blockers.** There are three findings that should change other tickets or the brief's working rule. They are listed under [Consequences](#consequences-for-other-tickets).

## Fonts

All candidates are under the SIL Open Font License 1.1. The OFL permits bundling with software under other licences. The OFL FAQ Q1.3 says: "Only the portions based on the Font Software are required to be released under the OFL". Q1.20 sets the minimum: "you must include the copyright statement, the license notice and the license text". Embedding in a document is allowed "either in full or a subset", and "the restrictions regarding font modification and redistribution do not apply" (Q1.12). Crediting the author in the UI is not required (Q1.1.2). Source: [OFL FAQ](https://openfontlicense.org/ofl-faq/).

**Subsetting and Reserved Font Names.** Removing glyphs from a webfont "is considered modification" (FAQ Q2.6). A modified font may not use a Reserved Font Name (RFN) unless functional equivalence is preserved (Q2.7). The practical rule has two parts:

- Bundle RFN fonts whole.
- Subset only fonts that have no RFN.

Converting a TTF to WOFF2 without dropping glyphs preserves equivalence.

**Delivery.** Commit the font file and its `OFL.txt` into the pack folder. Inline the font as a `data:` URI in `@font-face` inside `explainer.html`. That meets the design floor's "no runtime font fetches".

### Handwriting (pencil pack)

| Font | Copyright line | RFN | Upstream | Licence source |
| --- | --- | --- | --- | --- |
| **Caveat** | 2014 The Caveat Project Authors | none | googlefonts/caveat | [google/fonts `ofl/caveat/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/caveat/OFL.txt) |
| **Patrick Hand** | 2010–2012 Patrick Wagesreiter | none | googlefonts | [google/fonts `ofl/patrickhand/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt) |
| **Kalam** | 2014 Indian Type Foundry | none | itfoundry/kalam | [google/fonts `ofl/kalam/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/kalam/OFL.txt) |
| Architects Daughter *(alternate)* | 2010 Kimberly Geswein | none | googlefonts/architectsdaughter | [google/fonts `ofl/architectsdaughter/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/architectsdaughter/OFL.txt) |
| Virgil *(alternate)* | 2021– Ellinor Rapp | **"Virgil"** | excalidraw/virgil | [excalidraw/virgil `LICENSE.md`](https://github.com/excalidraw/virgil/blob/main/LICENSE.md) |

Virgil is clean under the OFL, but it is the recognisable old Excalidraw hand. That is a look question for #5, not a licence question.

**Excluded: Excalifont.** It exists only as split `woff2` subsets inside the excalidraw app repo. There is no standalone licence file ([tree](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts/Excalifont)). The embedded metadata says "licensed under the SIL Open Font License, Version 1.1", but it also says "Copyright (c) 2024 by Excalidraw. All rights reserved" and "Excalifont is a trademark of Excalidraw" ([`index.ts` header](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/fonts/Excalifont/index.ts)). That is too ambiguous to vendor when Virgil offers the same lineage under a clean licence.

### Neutral sans (standard pack)

| Font | Copyright line | RFN | Upstream | Licence source |
| --- | --- | --- | --- | --- |
| **Inter** | 2020 The Inter Project Authors | none | rsms/inter | [google/fonts `ofl/inter/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt) |
| **Atkinson Hyperlegible Next** | 2020–2024 The Atkinson Hyperlegible Next Project Authors | none | googlefonts/atkinson-hyperlegible-next | [google/fonts `ofl/atkinsonhyperlegiblenext/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/atkinsonhyperlegiblenext/OFL.txt) |
| **IBM Plex Sans** | 2017 IBM Corp. | **"Plex"** | IBM/plex | [google/fonts `ofl/ibmplexsans/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/ibmplexsans/OFL.txt) |
| Source Sans 3 *(alternate)* | 2010–2020 Adobe | **"Source"**, which is also an Adobe trademark | adobe-fonts/source-sans | [google/fonts `ofl/sourcesans3/OFL.txt`](https://github.com/google/fonts/blob/main/ofl/sourcesans3/OFL.txt) |

The three fonts carry different constraints:

- **Inter:** often on a per-product "avoid" list. Whether that applies here is a design guardrail for #6, not a licence matter.
- **Atkinson Hyperlegible Next:** designed for legibility, which suits the 24 px floor at 1080p.
- **Plex:** must be bundled unsubset.

## Paper texture (pencil pack)

| Candidate | Licence | Attribution | Notes |
| --- | --- | --- | --- |
| **Procedural: SVG `feTurbulence`**, optionally lit with `feDiffuseLighting` | none: our own markup, MIT with the repo | none | No asset at all. Has a `seed` attribute ([MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence); [W3C Filter Effects](https://www.w3.org/TR/filter-effects-1/#feTurbulenceElement)), so it is deterministic under `seek(t)`. It costs render time at 1080p, which the M0 spike (#3) should measure if the pack uses it. |
| **ambientCG `Paper001`–`Paper006`** | CC0-1.0 | none ("You don't need to give credit") | Photographic. Six paper materials returned by the [ambientCG API](https://ambientcg.com/api/v2/full_json?q=paper). Licence: [ambientCG licence](https://docs.ambientcg.com/license/): "copy, modify, distribute and perform the assets, even for commercial purposes, all without asking permission". Use the albedo map only, and commit a downscaled tile. |

**Also checked:**

- **Poly Haven:** CC0, but has no paper texture ([API](https://api.polyhaven.com/assets?t=textures)).
- **Subtle Patterns:** excluded. The site says only "licensed under Creative Commons", with no version and an attribution expectation ([Toptal](https://www.toptal.com/designers/subtlepatterns/)).
- **Transparent Textures:** excluded. No licence is stated at all ([site](https://www.transparenttextures.com/)).

A licence that cannot be named cannot be committed to a public repo.

## Hand-drawn glyphs (pencil pack)

These are approaches, not asset sets. Each one still needs a glyph for the eight concepts: goal, hub, region, session, grilling, prototype, research and task.

| Approach | Licence | Attribution | Notes |
| --- | --- | --- | --- |
| **Author our own glyph geometry** (a few lines and arcs per glyph) and stroke it with rough.js | MIT: our own work plus rough.js (MIT) | rough.js notice only | No third-party art, so nothing to track. The glyphs are geometry, and the sketchiness comes from rough.js, seeded. |
| **Take icon paths from an MIT/ISC set** (Tabler, Lucide or Phosphor, below) and redraw them through rough.js `path()` | the source set's MIT/ISC | the set's licence notice | Both licences permit modification. It gives the two packs a shared icon vocabulary, which is a design choice for #5/#6. |
| **Excalidraw libraries** ([libraries.excalidraw.com](https://libraries.excalidraw.com/)) | MIT: "All the following libraries are under MIT License"; repo [excalidraw/excalidraw-libraries `LICENSE`](https://github.com/excalidraw/excalidraw-libraries/blob/main/LICENSE) | MIT notice; keep each library's author credit | Already hand-drawn, but stored as Excalidraw element JSON, not SVG, so it needs a conversion step. |

## Flowchart icons (standard pack)

All three sets cover all eight concepts. Existence was checked against each repo's SVG tree on 2026-09-25. The names are examples of fit, not choices.

| Concept | Tabler (`icons/outline/`) | Lucide (`icons/`) | Phosphor (`assets/regular/`) |
| --- | --- | --- | --- |
| goal | `target`, `flag` | `target`, `flag`, `goal` | `target`, `flag` |
| hub | `affiliate`, `topology-star`, `network` | `network`, `share-2` | `graph`, `share-network` |
| region | `map`, `square-dashed`, `frame` | `map`, `land-plot`, `square-dashed` | `map-pin` (a region-like frame needs a second look) |
| session | `messages`, `terminal`, `history` | `messages-square`, `terminal` | `chats`, `terminal` |
| grilling | `flame`, `message-circle-question` | `flame` | `flame`, `fire` |
| prototype | `flask`, `test-pipe`, `hammer` | `flask-conical`, `wrench`, `hammer` | `flask`, `wrench`, `hammer` |
| research | `search`, `microscope` | `search`, `book-open`, `microscope` | `magnifying-glass`, `book-open`, `microscope` |
| task | `square-check`, `circle-check`, `checkbox` | `square-check`, `list-checks` | `check-square`, `list-checks` |

| Set | Licence | Size | Attribution | Source |
| --- | --- | --- | --- | --- |
| **Tabler Icons** | MIT (© Paweł Kuna) | ~5,100 outline | MIT notice | [tabler/tabler-icons `LICENSE`](https://github.com/tabler/tabler-icons/blob/main/LICENSE) |
| **Lucide** | ISC, plus MIT for icons derived from Feather | ~1,850 | **both** notices when any Feather-derived icon is used; `target`, `crosshair`, `search` and `terminal` are on that list | [lucide-icons/lucide `LICENSE`](https://github.com/lucide-icons/lucide/blob/main/LICENSE) |
| **Phosphor** | MIT (© Phosphor Icons) | ~1,500 per weight | MIT notice | [phosphor-icons/core `LICENSE`](https://github.com/phosphor-icons/core/blob/main/LICENSE) |

GitHub reports Lucide's licence as `NOASSERTION` only because the file combines two licences. The SPDX expression is `ISC AND MIT`.

**Delivery.** Copy only the SVGs the pack maps into the pack folder, with the set's `LICENSE` beside them. Do not add an npm dependency for a handful of files.

## BPMN-style shapes (standard pack)

The brief asks for BPMN-*style* shapes: rounded rect, diamond, cylinder and document. These are geometric notation, not artwork.

| Candidate | Licence | Attribution | Notes |
| --- | --- | --- | --- |
| **Own SVG primitives**: `<rect rx>`, a diamond `<polygon>`, and a cylinder and document `<path>` | none: our own markup, MIT | none | Four shapes in a few lines each. They also stay parameterisable for ELK's node sizes. |
| **bpmn-font** (Camunda) | OFL-1.1 | copyright line + OFL text | An icon font of BPMN markers (events, gateways, task markers), for when a real BPMN glyph is wanted inside a shape. [bpmn-io/bpmn-font `LICENSE`](https://github.com/bpmn-io/bpmn-font/blob/master/LICENSE) |

**Excluded:**

- **bpmn-js.** Its [licence](https://github.com/bpmn-io/bpmn-js/blob/develop/LICENSE) is MIT plus the condition that the bpmn.io watermark "MUST NOT be removed or changed" and "must stay fully visible". That is not a standard open-source licence, and a watermark in every explainer is unacceptable in any case. It is also a full modeller, not a shape source.
- **draw.io stencils** (`bpmn.xml`, `flowchart.xml`). The code is Apache-2.0, but the [README](https://github.com/jgraph/drawio#license) adds that "icon sets and stencil libraries … and any derivatives thereof … may not be used as software assets in … Atlassian products". That is a field-of-use restriction, so the stencils fail the free/open-source constraint even though the restriction would not bite this project.

## Libraries

### rough.js: MIT, seedable, with one trap

- Licence: MIT, © 2019 Preet Shihn ([rough-stuff/rough `LICENSE`](https://github.com/rough-stuff/rough/blob/master/LICENSE)). Current version on npm is `roughjs@4.6.6`. The GitHub releases page stops at v3.1.0 (2019), so pin by npm version.
- **Seedable: yes.** `Options.seed?: number` ([`src/core.ts`](https://github.com/rough-stuff/rough/blob/master/src/core.ts)). The PRNG is a Park–Miller LCG ([`src/math.ts`](https://github.com/rough-stuff/rough/blob/master/src/math.ts)).
- **Trap: the default seed is `0`** ([`src/generator.ts`](https://github.com/rough-stuff/rough/blob/master/src/generator.ts)), and `Random.next()` falls back to `Math.random()` whenever the seed is falsy. **A seed of 0 is non-deterministic.** A `seek(t)` player must always pass a non-zero seed. For line boil, derive it from the node id and the boil frame, for example `1 + hash(id) + floor(t × 8)`. For multi-stroke, rough.js derives an overlay seed as `seed + 1` ([`src/renderer.ts`](https://github.com/rough-stuff/rough/blob/master/src/renderer.ts)), so adjacent seeds share strokes. Space per-node seeds apart.
- CDN: jsDelivr serves `roughjs@4.6.6` from npm (`/npm/roughjs@4.6.6/bundled/rough.js`, HTTP 200). **cdnjs carries only `rough.js` 3.1.0** ([cdnjs API](https://api.cdnjs.com/libraries?search=rough)), so "cdnjs" is not a real option for the current version.

### elkjs: EPL-2.0, compatible, and belongs at build time

- Licence: the repo's [`LICENSE.md`](https://github.com/kieler/elkjs/blob/master/LICENSE.md) is the Eclipse Public License 2.0. `package.json` and the header of the shipped bundle both declare `SPDX-License-Identifier: EPL-2.0 OR GPL-3.0-or-later`, © Kiel University and others. GitHub shows `NOASSERTION` because of the dual expression. Take the EPL-2.0 option.
- **Using it from MIT code creates no obligation on our code.** Under EPL-2.0 §1, "Modified Works" exclude works that only "link to, bind by name, or subclass the Program". A CLI that imports elkjs is not a Modified Work, so our code stays MIT.
- **Obligations apply only when we Distribute a copy** (§1: "making available in any manner that enables the transfer of a copy"). When we do, §3.1 and §3.3 require three things:
  1. A statement that the source is available under EPL-2.0 and how to obtain it.
  2. Retained notices.
  3. Any other licence we distribute it under must disclaim warranties and liability on behalf of the contributors, and must not limit recipients' rights to the source.

  Committing a vendored `elk.bundled.js` with its header intact, plus a line pointing to [kieler/elkjs](https://github.com/kieler/elkjs), satisfies this.
- **Loading from a CDN in generated HTML:** a `<script src>` pointing at a pinned jsDelivr URL distributes nothing from this repo. jsDelivr serves the npm package, and the npm package carries the licence. That is compatible with an MIT repo and has no obligations.
- **But the player should not need it.** The brief's pipeline places layout at build time ("Layout runs at build time; the player only reads positions"), so elkjs is an **npm dependency of `build/render/`**, installed into an ignored `node_modules/`. Nothing is committed, nothing is distributed, and nothing is fetched by the player. The bundle is 1.6 MB, which is another reason to keep it out of `explainer.html`.
- CDN: jsDelivr has `elkjs@0.12.0` (`/npm/elkjs@0.12.0/lib/elk.bundled.js`, HTTP 200). **cdnjs does not carry elkjs** ([cdnjs API](https://api.cdnjs.com/libraries?search=elk)).

### Playwright: Apache-2.0, invoked only

- Licence: Apache-2.0 ([microsoft/playwright](https://github.com/microsoft/playwright/blob/main/LICENSE)). Current version is `playwright@1.63.0` on npm. The browsers it downloads are open source: Chromium is BSD-3-Clause ([chromium/chromium `LICENSE`](https://github.com/chromium/chromium/blob/main/LICENSE)).
- Used as a dev-time tool that drives a local browser. Nothing is redistributed, so there are no attribution duties, and rendered frames are not a derivative of the tool.
- Alternative: Puppeteer is also Apache-2.0 (`puppeteer@25.12.0` on npm). Choosing between them is #3's call, not a licence question.

### ffmpeg: LGPL/GPL, invoked as an external binary

- Licence: "FFmpeg is licensed under the GNU Lesser General Public License (LGPL) version 2.1 or later". Optional parts are GPL-2.0-or-later, and "if those parts get used the GPL applies to all of FFmpeg", notably libx264 ([ffmpeg.org/legal](https://ffmpeg.org/legal.html)). Typical packaged builds enable libx264, so assume GPL.
- **That does not matter here.** The renderer pipes frames to a separately installed `ffmpeg` process, and the GNU FAQ treats "pipes, sockets and command-line arguments" as "communication mechanisms normally used between two separate programs" ([GPL FAQ #MereAggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)). GPLv2 §0 says "the act of running the Program is not restricted, and the output from the Program is covered only if its contents constitute a work based on the Program" ([GPLv2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)).
- The result: no obligations on the MIT repo or on the MP4s. The obligations would start only if we shipped an ffmpeg binary, which the MVP does not ("Installable by others" is out of scope on #1).

## Consequences for other tickets

1. **The brief's working rule, "pinned jsdelivr/cdnjs libraries only: elkjs, roughjs", needs amending. The map owner should decide; this note does not.** Three problems:
   - cdnjs carries neither current library. It has rough.js 3.1.0 only, and no elkjs.
   - elkjs belongs in the build CLI, not the player.
   - A CDN `<script src>` is a runtime fetch. That contradicts a *self-contained* `explainer.html` and makes capture depend on the network.

   Licensing permits the alternative fully. rough.js is MIT and can be inlined with its notice. elkjs is an npm dependency of the CLI. The likely replacement rule: "player libraries are inlined from pinned npm versions; no runtime fetches".
2. **#3 (M0 capture spike):**
   - Any rough.js seed of `0` silently becomes `Math.random()`. Line boil must use non-zero, spaced, time-derived seeds, or the dedup and determinism measurements are invalid.
   - If the pencil pack will use a procedural `feTurbulence` paper, include it in the boil case, because it adds per-frame filter cost.
   - ffmpeg with libx264 is fine to invoke.
3. **#5 and #6:** use only the shortlist above. bpmn-js, draw.io stencils, Excalifont, Subtle Patterns and Transparent Textures are out.

   Where a pack subsets a font, pick one without a Reserved Font Name (Caveat, Patrick Hand, Kalam, Inter or Atkinson Hyperlegible Next), or bundle Plex or Virgil whole.

   Each pack folder should carry a `LICENSES/` (or per-asset licence) file: OFL text plus copyright line per font, MIT/ISC notice per icon set, the rough.js MIT notice, and nothing for the CC0 texture or our own primitives.
