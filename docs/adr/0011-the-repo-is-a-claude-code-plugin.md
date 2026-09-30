---
status: accepted
---

# The repo is a Claude Code plugin, and the skills run the CLI inside it

Explainer ships as a Claude Code plugin, but the repo grew as a project: the CLI in `build/render/`, the skill in `build/skill/`, and the CLI reached through `npm link` (ADR-0010). A plugin user would have had to clone the repo as well, which defeats the plugin.

**The repo root is the plugin root.** The layout is the conventional one:

```
.claude-plugin/plugin.json, marketplace.json   the plugin; the repo is its own marketplace
skills/<name>/                                 one folder per skill
cli/                                           the CLI (was build/render/)
explainers/                                    the example scripts
docs/ CONTEXT.md                               the record: docs/adr, ideation, definition, design, why, build ledgers
```

`build/` goes, and the record, once in `background/` and `.scratch/`, is gathered under `docs/`, so the root reads as the plugin. The installed copy carries the record too, about 100 KB, which costs nothing worth a deeper layout.

**The skills run the CLI from inside the plugin**, at `<skill-dir>/../../cli/cli.js`, never from PATH. On first use, and again after a plugin update replaces the copy, a skill finds the CLI's dependencies or Chromium missing, installs them into the plugin copy, and says so in one line.

## Consequences

- **A plugin install is the whole install**, apart from the system tools: Node, pandoc and ffmpeg.
- **`npm link` in `cli/` stays as the developer's route.** It puts `explainer` on PATH for running the CLI by hand; the skills don't depend on it.
- **ADR-0010 is superseded in part.** Its two skill routes stand, with the symlink now pointing at `skills/<name>/`. Its CLI route becomes the developer's route only.
- **The first run after an update is slower**, because it reinstalls the dependencies and may download Chromium.

## Considered options

- **The plugin nested in a `plugin/` folder**, so installs carry only the payload. Rejected: unconventional and one level deeper, to save about 100 KB.
- **The CLI on PATH for every user.** Rejected: plugin users would need a clone as well.
- **Moving near the end of the build.** Rejected: the open tickets would be built in the old layout and then moved.
