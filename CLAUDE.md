# Explainer

Turns a conversation about a process into a short, source-grounded animated flowchart — a versioned script rendered through swappable style packs — for people who explain tools and processes. The brief is `docs/ideation/brief.md`.

## Visibility
**Born public.** This repo is the public repo — there is no private working copy and no
export step. Everything committed here is publishable from the first commit:

- The working record — everything under `docs/`: ideation, definition, design comps, the why,
  the build ledgers and `docs/adr/` — is public by design. Write it knowing that.
- Real session-derived data, fixtures drawn from it, unfiltered screenshots, secrets and
  machine paths never enter git. `local-data/` is ignored for the first; screenshots are
  taken from a filtered or synthetic view; issue bodies reference sessions by id, never
  quoted transcript text from another project.
- Toolchain is plugins at user scope plus `~/.claude/skills/`. Nothing under `.claude/` is
  tracked here: the process copy and project settings are tooling, kept local.
- `.githooks/pre-commit` refuses a commit that matches `.githooks/denylist.txt` (home
  paths, key shapes, transcript filenames) or a private-project name listed in
  `~/.config/git/denylist-private.txt`, a file kept outside every repo so the names are
  never published; the hook warns while it has none. Add to the lists; do not bypass it.

Issues live on this repo and are public. Publication is therefore not a phase — the repo
flips visibility on GitHub when the README says what the product is and `security-preflight`
has run. If a product cannot meet this, it is a private-forever project and starts from
`project-template/`, not from here.

## Phase layout
`docs/ideation/` → `docs/definition/` → `docs/design/` → `build/`.
Context from earlier phases informs later ones — don't engage on design without reading the
definition, don't engage on build without reading the design decisions. `docs/why.md`
is the story the README used to tell: why it was built, how, and what was reversed.

## Process
`.claude/my-process.md` is the process — frontmatter the how-view reads, the house process details, then this project's specifics.

@.claude/my-process.md

## Stack conventions
- Domain vocabulary → `CONTEXT.md`. Decision rationale → `docs/adr/`. Reviewability docs
  (`architecture`, `flows`, `permissions`, `variables`, …) → `docs/`, from `/document-app`.
- `diagnosing-bugs` and `improve-codebase-architecture` must read `CONTEXT.md` + `docs/adr/` first.

There is no house DESIGN.md; a product's root `DESIGN.md`, if any, is derived from its shipped UI for Impeccable's drift detection, never a source of truth. The design floor is in `.claude/my-process.md` → Design.

## Design skills
Pick ONE taste-skill style variant per product (`taste-skill:high-end-visual-design`, `taste-skill:minimalist-ui`, or `taste-skill:industrial-brutalist-ui` — from the `taste-skill@taste-skill` plugin, user scope, nothing copied into the repo); `impeccable` fine-tunes only after a direction is chosen.

## Agent skills

### Issue tracker

GitHub Issues on `dempseydata/explainer` (public), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unrenamed. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
