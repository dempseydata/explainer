---
status: accepted
---

# The skills find the CLI with `cd -P` and bootstrap it with `cli/setup.sh`

*Amends ADR-0011.*

ADR-0011 has the skills run the CLI at `<skill-dir>/../../cli/cli.js` and install its dependencies and Chromium "into the plugin copy" on first use. Two things break as written:

- On the symlink route, `<skill-dir>` is `~/.claude/skills/<name>`, and Node resolves `..` lexically, so the path does not reach the repo.
- With no `node_modules`, `cli.js` exits 1 and writes no report. The skills read exit 1 as a validation or fetch failure, and after a fetch that licenses offering other fetch tools.

**Finding the CLI.** A skill resolves the folder physically: `CLI="$(cd -P "<skill-dir>/../../cli" && pwd)"`, then runs `node "$CLI/cli.js" …`. This works on both routes.

**Bootstrapping.** `cli/setup.sh` has no dependencies. It runs `npm ci` when `node_modules` is missing, and installs Playwright's Chromium when the browser is missing. When it installs anything, it prints one line saying so. It exits non-zero on failure. Every skill runs it before its first CLI call in a session, and stops on a failure rather than reading it as a CLI exit code.

**Chromium lives in Playwright's shared cache** (`~/Library/Caches/ms-playwright` on macOS), not in the plugin copy. The cache survives plugin updates, and no CLI call needs an environment variable.

## Consequences

- ADR-0011's first-use sentence stands for `node_modules`, which does go into the plugin copy (`cli/node_modules`, gitignored). Chromium does not.
- A plugin update still reinstalls `node_modules`; Chromium is reused.

## Considered options

- **The same few lines inline in each skill.** Rejected: they drift between skills.
- **Lazy requires plus an `explainer setup` command.** Rejected: it changes the CLI's contract for a problem the skills can solve before calling it.
- **`PLAYWRIGHT_BROWSERS_PATH=0`**, so Chromium sits in the copy as ADR-0011 said. Rejected: every call would need the variable, and every update would re-download about 150 MB.
