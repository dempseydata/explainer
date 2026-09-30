---
status: accepted, superseded in part by ADR-0011
---

# The skills install by symlink or plugin; the CLI by `npm link`

The spec says the skills run the CLI, but not how either reaches a machine. Explainer is a rarely used tool, run in whichever project holds the process being explained, so both must install at user level.

**The CLI** goes on PATH with `npm link` in `build/render`. The link points at the working copy, so an edit to the CLI takes effect with no reinstall.

**The skills** have two routes, and a machine uses one:

- **Plugin**, for anyone using Explainer. The repo is its own marketplace: `claude plugin marketplace add dempseydata/explainer`, then `claude plugin install explainer@explainer`. The skill is invoked as `/explainer:explainer-script`. A plugin install is a copy, so it changes only on `claude plugin update`.
- **Symlink**, for working on the skills. Link `build/skill/<name>` into `~/.claude/skills/<name>`. The skill is invoked as `/explainer-script`, and an edit takes effect in the next session.

## Consequences

- **The CLI is installed separately on either route.** A plugin cannot put a binary on PATH, so `npm link` (and its prerequisites: pandoc, ffmpeg, Playwright's Chromium) is always a manual step.
- **One route per machine.** With both installed, two copies of the skill are live and which one fires is arbitrary.
- **Each new skill joins both routes.** `.claude-plugin/plugin.json` lists every folder under `build/skill/`, and the symlink step names it.
- **The plugin reads the repo at its default branch.** Whatever is on `main` is what `claude plugin update` installs.

## Considered options

- **Plugin only.** Rejected for the author: every skill edit during a checkpoint run would need an update.
- **Project-level `.claude/skills/`.** Rejected: the skills must work in other projects, and this repo tracks nothing under `.claude/skills/`.
- **Publishing the CLI to npm.** Deferred: `npm link` from a clone serves a rarely used tool. Revisit if people install Explainer without cloning it.
