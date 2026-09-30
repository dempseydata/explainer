---
stages:
  - name: Ideate
    commands: [brainstorm, discover, write-prd, red-team-prd, pre-mortem, write-stories, test-scenarios, grill-me]
    paths: [background/ideation/, background/definition/]
  - name: Design
    commands: [design-sync, impeccable]
    paths: [background/design/, design/]
  - name: Plan
    commands: [wayfinder, grill-with-docs, to-spec, to-tickets, setup-matt-pocock-skills]
    skills: [grilling, domain-modeling, research, prototype]
    paths: [docs/adr/, CONTEXT.md]
  - name: Build
    commands: [mp-night-shift, implement, code-review, ponytail-review, diagnosing-bugs, ponytail-audit]
    skills: [tdd, code-review, playwright-cli]
    paths: [build/]
  - name: Release
    commands: [security-preflight, graphify, document-app, release-notes]
---
# my-process — what we do, and why

**Sync: duplicate.** The process details below are a verbatim copy of the master, `~/.claude/process/my-process.md`; a sync is a diff of the part between the two `process-details` markers and nothing else. A change may be trialled here first and this copy may run ahead of the master until it is promoted or dropped. The frontmatter is this project's declaration (the how-view reads it — ADR-0011 in hindsight). The project specifics after the end marker start empty. How the process came to be this shape is recorded in `what-is-installed.md` under *How we got here*.

<!-- process-details:start -->

Order follows the declared stages: **Ideate → Design → Plan → Build → Release**, with **Evaluation** recurring through all of them.

## Ideate

Idea → product definition. Exits to **Design**. Two doors in: a **rough** idea diverges first; a **well-formed** idea goes straight to the PRD row, and only if another person will review it.

| Step | Skill | When |
| --- | --- | --- |
| Diverge | `dempsey-skills:brainstorm` | The front door for a *rough* idea. Pick a stance (Facilitator / Creative Partner / Ideate-for-me), run a technique batch, then its own **converge** phase. Session state is a memlog on disk — it resumes. |
| De-risk | `/discover` (pm-product-discovery) | When the idea needs testing before commitment. Assumptions across 8 risk categories → Impact × Uncertainty → experiments with kill criteria. **Optional** — brainstorming alone has produced a usable definition before now, so don't run it by reflex. |
| Write for review | `/write-prd` (pm-execution — the *command*, not the bare `create-prd` skill: its template carries non-goals, a metrics table, P0–P2 story tables with acceptance criteria, and open questions with owners; the skill's eight stakeholder sections do not) | **Only when someone other than you will review it.** Its six-question gather is the right amount of interview for an idea already clear in your head. |
| Attack the plan | `/red-team-prd`, `/pre-mortem` (pm-execution) | Before committing to build — and, on the review path, between the PRD draft and the review, so the team attacks a document that has survived one attack. Load-bearing claims only, steelman then attack, cheapest test per claim. |
| Split for allocation | `/write-stories` (pm-execution) over the PRD's story tables | On the review path. Ask for two things it will not volunteer: **cross-story dependencies** (it insists stories are independent; the ones that cross the human/agent boundary are the ones that block you mid-build) and **which criteria are UI-observable**. The review allocates the stories; yours become the input scope for Plan. |
| Acceptance scenarios | `/test-scenarios` (pm-execution) over the stories allocated to you | Every criterion maps to at least one scenario (its coverage matrix). Written as prose for the human reviewer; the UI-observable ones become Playwright tests in Build. Say per scenario which are not UI-observable (data, API, performance) rather than discovering it at build time. |
| Frame the problem | Define-phase methods below | Whenever the output is a pile of ideas rather than a stated problem. |
| Filter for AI | — | When the product leans on a model: of the pain points surfaced, which are *genuinely* LLM-solvable? Rank by severity × frequency. Stops "put an LLM on it" reasoning, and feeds the first **Evaluation** moment. |

**Exit:** a stated problem and a definition solid enough to attack — or, on the review path, a reviewed PRD with allocated stories and their scenarios — into **Design** next, not straight to build. If the product has no visual surface at all, skip Design and enter Plan directly.

**Answer the publication question here, in one line:** *if this ever goes public, what's public — the app, or the record?* It decides the repo model (see **Release → Publication**) and it is far cheaper to answer at ideation than at ship.

**Answer the shipping question beside it, in one line:** *what shape does it ship in — an app, a CLI, a Claude Code skill or plugin, a library?* It decides the repo's folder layout from the first commit. Answered late, the layout has to be rearranged under a half-built product (Explainer: [ADR-0011](https://github.com/dempseydata/explainer/blob/main/docs/adr/0011-the-repo-is-a-claude-code-plugin.md)).

**A PRD is written only when someone other than you will review it.** Solo, it is wasted motion: `grilling` re-interrogates it from scratch and `to-spec` owns the spec slot. An **unreviewed** PRD is never the input to `grill-with-docs` — that rule stands. A **reviewed** PRD is the definition: it carries the team's decisions, the allocation, and what was struck out, and it is the input to whichever Plan front door the work's size selects. It maps onto a `wayfinder` map almost section for section:

| PRD section, post-review | Wayfinder map section |
| --- | --- |
| Objective and key results | Destination |
| Decisions the team made in review | Decisions so far |
| Open questions with owners | Not yet specified → one decision ticket each (`research` / `prototype` / `grilling`) |
| Stories allocated to others | Out of scope (and Matt's `.out-of-scope/` KB, so the agent never wanders into a human's piece) |
| Stories allocated to you | The scope the child tickets are cut from |

**Stories are the boundary of your work, not the tickets inside it.** pm stories are the allocation unit — the contract with the team about what is yours. Matt's tickets are the execution unit — vertical slices sized to a context window with blocking edges. One story may become three tickets; a tracer bullet may cut across two stories. Let `to-tickets` re-cut your stories; never force the two lists to match.

Nothing pm-shaped is ever an input to Matt's chain except through this door.

### Define-phase methods

A checklist, not a workflow — reach for one when the framing is soft. Adapted from BMAD's `design-thinking`.

- **Problem Framing** — turn observations into an actionable problem statement. *What's the real problem? Who experiences this? Why does it matter? What would success look like?*
- **How Might We** — reframe the problem as an opportunity question that opens solution space without prescribing the answer.
- **Point of View Statement** — *[user type] needs [need] because [insight].* Forces who/what/why into one line.
- **Affinity Clustering** — group related observations, name each cluster, ask what story they tell.
- **Jobs to be Done** — what job are they hiring this for? What progress do they want? What alternatives exist today?

### Six forcing questions

Use on a **new product premise**, before diverging — they test whether the thing should exist at all, which no other tool here does. `grilling` interrogates a plan; these interrogate the demand. Adapted from gstack's `office-hours`.

1. **Demand reality** — what's the strongest evidence someone would be *genuinely upset if it disappeared tomorrow*? Not interest, not a waitlist signup.
2. **Status quo** — what are they doing right now to solve this, even badly, and what does that workaround cost them? The status quo is the real competitor; if the answer is "nothing", the problem probably isn't painful enough to act on.
3. **Desperate specificity** — name the actual human. Title, what gets them promoted, what gets them fired, what keeps them up at night.
4. **Narrowest wedge** — smallest version someone would pay real money for *this week*, not after the platform is built. *Bonus:* what if they had to do nothing at all — no login, no integration, no setup?
5. **Observation & surprise** — have you watched someone use it without helping? What did they do that contradicted your assumptions? Surveys lie, demos are theatre, "as expected" means you're filtering through your own assumptions. The gold is users doing something it wasn't designed for.
6. **Future-fit** — if the world looks meaningfully different in three years, does this become *more* essential or less?

## Design

Takes the definition from **Ideate**, settles what the product looks like, and exits to **Plan**. Skip this phase entirely for a product with no visual surface.

Direction is chosen **comparatively, never in one shot**: comparative judgement is easy, absolute judgement is not, and one prompt only ever samples the model's centre of mass.

### The floor

There is no house look. A quality floor of mechanical universals applies to every product and says nothing about what it looks like:

- every colour is a named token, never a hex literal;
- a semantic role set exists (ok / caution / problem) with a bright weight and an AA-passing `-text` weight;
- semantic states pair red with **blue**, never red with green (Few);
- text-on-surface hits WCAG AA at the size actually used;
- the brand accent never carries body text or large surfaces;
- chart data ink uses its own palette, never brand or semantic colours;
- long-form line-height ≥ 1.50; no runtime font fetches.

**The product decides** hues, faces, radii, elevation, motion, and everything else that constitutes a look. So **the palette is per product**, an *output* of direction-setting, not an input from a standard. A branding or marketing surface runs free; a set of tool UIs may share a palette if they ought to read as a suite — that's positioning, not design system. A product's root `DESIGN.md`, if it has one, is derived from its shipped UI for Impeccable's drift detection — an output, never a source of truth.

### The flow

| Step | What | Tool |
| --- | --- | --- |
| 1. Taste | Curated reference library grouped by aesthetic family, each entry carrying vocabulary + a reusable brief | **Not yet built** — the standing gap (see the inventory) |
| 2. Wireframe *(optional)* | Low-fidelity layout pass before comps — boxes, hierarchy, no colour. Recommended for interactive or information-dense products; skip for hero-led marketing surfaces | **Claude Design**'s Wireframe mode; a greybox `prototype` ticket is the manual fallback |
| 3. Diverge | 5 candidate directions, side by side. One taste-skill variant *per candidate* — never stacked within one | **Claude Design**'s canvas (generate iterations, remix, compare). `taste-skill:high-end-visual-design` / `taste-skill:minimalist-ui` / `taste-skill:industrial-brutalist-ui` etc. as a taste-skill-only fallback |
| 4. Narrow | Pick one, generate 3 variants of it, pick one | same |
| 5. System | For anything with more than one screen: extract tokens before styling more surfaces | Export the chosen design's code/tokens out of Claude Design — the canvas builds real code, copy it out by hand; `/design-sync` pushes only. `/impeccable extract` as fallback |
| 6. Assets | Hero/background imagery once the direction is fixed | `/impeccable` (OpenAI `gpt-image-2` fallback, needs `OPENAI_API_KEY`, ~$0.05–0.25/image) |
| 7. Tweak | Live browser iteration on fonts, colour, motion | `/impeccable live` — **do not build a bespoke tweaks bar**, this is what it does |
| 8. Audit | Enforce the floor | `/impeccable audit` |

**Prompt shape for steps 3–4** — aesthetic · reference · intent · guardrails. Guardrails are where "no Inter, no purple gradients, no cream, no 3D blobs" live: per product, per direction, never in a standard.

**Optional: a hand-drawn sketch, photographed**, as a fifth input — useful when a layout idea is easier to draw than describe. Treat it as another reference, not a spec to match exactly.

**Weight the flow to the surface.** A marketing or branding surface is hero-led and rewards steps 3–4 heavily. A dense tool UI — multi-screen, state-heavy, read at small sizes — is decided by information density, hierarchy at 13px, and empty/error states; there step 5 matters more than five hero comps, and step 2 (wireframe) is where its real decisions actually get made.

### Prototype-first for dense tool UIs

For a data-heavy tool UI, Design is **deferred, not skipped**. Build the data pipeline first, then greybox the screens as throwaway prototypes — the `prototype` skill, or `wayfinder` prototype tickets — fed with **real data**, to settle the information architecture (density, hierarchy, empty/error states) before any direction-setting. Then run the flow above, styling layouts already validated, with real content in the comps: a better input to Diverge/Narrow than lorem ipsum, because "does this view feel reviewable at 40 real entries" is unanswerable in a comp.

Guardrails, all three load-bearing:

1. **An explicit gate, so deferred cannot decay into skipped:** no styled or production UI is built until Design has run.
2. **Throwaway means throwaway:** the prototype's *answer* is captured (an ADR or a design-phase input note); its code dies.
3. **Silence Impeccable during prototype tickets** (`/impeccable hooks off`) — greybox deliberately violates rules about decisions not yet made. Back on for the real build.

Hero-led marketing surfaces skip this and go straight to steps 3–4.

**Exit:** a chosen direction with its palette, faces and tokens settled, and the reasoning ready to be captured as ADRs by `grill-with-docs` at the top of Plan.

### Tools and hooks

**Claude Design is the tool for steps 2–5.** Its canvas is cloud-side and touches no local files; the bridge *into* the repo is manual export of the chosen design's code and tokens. `/design-sync` is the reverse bridge only — it uploads a **built** design system so the canvas composes with real components. A post-build tool. If Claude Design is unavailable, wireframing falls back to a greybox `prototype` ticket and token extraction to `/impeccable extract`, both manual.

**Run `/design-sync` from one surface at a time.** It executes as a Claude Code session and sees the repo's `.claude/` config, hooks included. Running it from Claude Desktop while VS Code has an active session on the same working tree is the ordinary two-sessions-one-tree collision — stale reads, overwritten edits, a corrupted hook cache. Run it from VS Code, or when the VS Code session is idle.

**Impeccable's hooks are live:** `PostToolUse` catches immediate-tier problems per edit, `Stop` runs the deep pass over every UI file touched in the session. `/impeccable hooks status` to inspect, `off` to silence.

## Plan

Entered from **Design** (or straight from Ideate for a product with no visual surface). `grill-with-docs` is the seam: it interrogates the definition *and* the design decisions, and writes both into `CONTEXT.md` + `docs/adr/`. Under the prototype-first path, Plan starts *before* Design — `grill-with-docs` then runs on the definition alone, and the design ADRs land when Design runs later; a deliberate seam, not drift.

| Step | Skill |
| --- | --- |
| Front door, multi-session effort (the usual case) | `wayfinder` — its charting session runs `grilling` + `domain-modeling` itself (which write `CONTEXT.md` + `docs/adr/`), then routes each ticket to the right skill (`research` / `prototype` / `grilling` / `task`). Don't invoke `grilling` directly on this path |
| Front door, fits one spec, touches the domain model | `grill-with-docs` (writes `CONTEXT.md` + `docs/adr/`). The criterion is new vocabulary or a hard-to-reverse choice, **not** size — a one-session change that introduces a term still comes in here |
| Front door, fits one session, touches neither | `grill-me` |
| Input at any front door | The definition — or, on the review path, the reviewed PRD plus the stories allocated to you (see the mapping in **Ideate**). Whether a PRD exists is orthogonal to which door |
| Spec | `to-spec` |
| Break into tracer-bullet tickets | `to-tickets` |

**Wayfinder discipline:** one ticket per session (research excepted); prototype liberally, and a prototype's *answer* is captured while its code dies on a throwaway branch.

**Specs and tickets are skill output.** `to-spec` writes the spec, `to-tickets` writes the tickets, into the product's tracker; never hand-write a PRD or spec into an issue body.

**Domain docs:** vocabulary → `CONTEXT.md`; decision rationale → `docs/adr/`. Read both before planning, building, debugging or refactoring. Run `/setup-matt-pocock-skills` once before the first `to-tickets` — it picks the ticket tracker (GitHub Issues if the product has a remote, else the plugin's local `.scratch/` convention — never a single combined tickets file) and the docs layout.

## Build

Starts where code starts: at `implement` for one ticket, or at `mp-night-shift` for a ticket set.

| Step | Skill |
| --- | --- |
| Build, a ticket set unattended (the usual case after `to-tickets`) | `/mp-night-shift <spec>` (dempsey-skills). A prescan, then one decision sitting where you settle every cross-ticket contract no ADR fixes and authorise pushes, tracker writes and the end state. Then per ticket: a fresh implementer and reviewer running the rows below, a commit, and the ticket closed. It ends with a handover. A blocker pushes to your phone and the shift works on; reply in the session to unblock. Works the `ready-for-agent` tickets only |
| Build, one ticket or at the keyboard | `implement`, with `tdd` as the red-green engine |
| Model output is load-bearing | see **Evaluation** below — `tdd` cannot test a prompt |
| Acceptance, story level (review path) | Scenarios whose criteria are UI-observable become **Playwright tests** in the repo, named by story and criterion so the coverage matrix is traceable in code, run before the ticket closes. The `playwright-cli` skill writes and runs them — the repeatable gate. The `playwright` MCP plugin walks one scenario interactively with screenshots — the artefact for a human reviewer. Not interchangeable. `tdd` at the seams stays underneath as the agent's own gate |
| Before commit | `code-review`, then `/ponytail-review` |
| Something breaks | `diagnosing-bugs` |
| Quality loop | `improve-codebase-architecture` + `/ponytail-audit` → back to `to-tickets` |

`ponytail` is always on. The Plan and Build chain is supplied by the `mattpocock-skills@mattpocock` plugin at user scope; `claude plugin update mattpocock-skills@mattpocock` to refresh. `mp-night-shift` comes from `dempsey-skills@dempsey` and rides on that chain: it needs `/setup-matt-pocock-skills` run in the product. **Never copy plugin skills into `.claude/skills/`** — a copy is a snapshot that goes stale silently.

## Release

- **Security gate:** `security-preflight` (both parts) before any deploy — and an export or a push to a public repo is a deploy. Findings become tickets; re-run until clean.
- **Deploy gate:** `setup-pre-commit` + `git-guardrails`, then `vercel` / `vercel --prod`.
- `/document-app` for the reviewability docs (`architecture`, `flows`, `permissions`, `variables`, `cron`, `automation`) into `docs/`.
- `/graphify .` after a build cycle; consult the graph before grepping.
- `release-notes` (pm-execution) back to the team on the review path, with the acceptance test run as the evidence.

### Publication

Two repo models, chosen at ideation by the publication question, never switched by flipping visibility — git history is append-only, so a flip publishes everything ever committed, deleted files and throwaway branches included.

- **Born public.** The working repo *is* the public repo from the first commit; the record (ideation, definition, design, tickets, the why) is published by design and written knowing that. A pre-commit hook refuses anything matching a denylist (home paths, key shapes, transcript filenames); extend the list, never bypass it.
- **Private working repo, curated export.** The working repo stays permanently private, record and history included. Publishing means exporting an app-only repo with its own README and fresh history — never filtered history, whose historical blobs still carry deleted personal content.

Under either model **real personal data never enters git**: fixtures derived from real sessions live in gitignored paths, screenshots are taken from a filtered or synthetic view, and issue bodies reference sessions by id rather than quoting transcript text from another project.

## Evaluation — a recurring discipline, not a stage

**Applies only when a model's output quality is load-bearing** — a curator, a classifier, an assessor, anything where "is this good?" is a judgement rather than a pass/fail. Deterministic code belongs to `tdd`; a prompt has no compiler, no type system, and no diff that `code-review` can read. If nothing in the product hangs on model output, skip this section entirely.

It has no fixed position. It recurs, and the moments do different jobs:

| Moment | What it answers | Output |
| --- | --- | --- |
| **Before committing to a design** | Does this approach work at all, on real data, before anything is built on it? | A killed or confirmed assumption, and an ADR |
| **Before implementing** | What is the bar for this piece of work? | A frozen eval set and a numeric threshold — written before the code, same discipline as `tdd`'s red step |
| **On any change touching a prompt or model** | Did that edit make it worse somewhere else? | A regression run against the standing set |
| **Before deploy** | Does it clear the bar, at an acceptable cost per unit of work? | A gate, beside `security-preflight` |
| **After deploy** | Does real usage match the eval set, and is it drifting? | Two standing metrics — a task/engagement measure **and** a model-quality measure |

Four rules that make the difference between an eval and a ritual:

- **Real data, not synthetic.** The pattern that has worked: a cheap-model dry-run over a handful of real project-days, scoring evidence pass-rate under normalised substring matching. It falsified a corpus choice and settled a load-bearing constraint — *capture must preserve verbatim text, because you cannot substring-verify a quote against a paraphrase* — before a line of the product existed. One script, real data, before any format is committed.
- **A number and a threshold, decided in advance.** "Below 90% triggers the fallback" is an eval. "It looks good" is a vibe. Deciding the threshold afterwards means deciding it to fit the result.
- **Cheap enough to run often.** Use the cheapest model that can hold the judgement. An eval that costs real money gets skipped, and a skipped eval is worse than none because it implies coverage that isn't there.
- **The eval set is itself a snapshot.** It was drawn from one moment and the ground moves — model updates, changed usage, a competitor shipping the thing you were differentiating against. Re-check it on the same instinct you'd re-check a copied dependency. This is the one honest answer to "PMF is a moving target": a standing measurement, not a document.

## The review path

The rows marked *review path* describe a **blended team** — you plus other people, human or agent, who review the PRD and take stories. It is a **variant with a trigger, not the default**: it becomes live on the first project where someone other than you reviews the PRD or commits code. Until then, solo routing applies; the pm plugins stay installed at user scope and the review-path commands simply go unused. They are kept as plugins, not lifted into `dempsey-skills`: their artifacts are for communicating with people who are not you, and they are never an input to the build except through the reviewed-PRD door in **Ideate**.

<!-- process-details:end -->

# Project specifics

**Publication model: born public** — this repo *is* the public repo from the first commit; the record is published by design (see the Visibility section of `CLAUDE.md` and `.githooks/`). Phase folders: `background/ideation/` → `background/definition/` → `background/design/` → `build/`; `design/` at the root holds only `tokens.css`.

**Does not apply:**
- **Design** — the product is a set of skills with no UI of its own. Style packs style the rendered output, not the product, and are decided on the wayfinder map, not through the Design flow.
- **Evaluation** — grounding is enforced deterministically (quotes substring-checked against sources); model judgement is either approved by the author at checkpoints or advisory. The author is the evaluator. Returns if a later phase takes the author out of the loop (Phase 4 automatic regeneration).
