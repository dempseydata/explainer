# Explainer

Explainer turns a conversation about a process into a short animated flowchart. A scripting
skill works with you to decide what to show and writes a versioned, source-cited script; a
renderer plays that script through a style pack (pencil sketch or standard flowchart icons)
into a step-through HTML page, an MP4 and captions. The same script re-renders in another
style, or after an edit, without regenerating anything. Pre-build: the brief is
[docs/ideation/brief.md](docs/ideation/brief.md), and the story of how it was
built lives in [docs/why.md](docs/why.md).

<!-- Screenshots of the real thing, taken from a filtered or synthetic view. -->

## Run it

Requires Node 20+, [pandoc](https://pandoc.org), [ffmpeg](https://ffmpeg.org) and
[Claude Code](https://claude.com/claude-code). Built and tested on macOS with pandoc and
ffmpeg from Homebrew.

Install the plugin; the repo is its own marketplace:

```bash
claude plugin marketplace add dempseydata/explainer
claude plugin install explainer@explainer
```

Invoke `/explainer:explainer-script`. On first use the skill installs the CLI's dependencies
and Playwright's Chromium, saying so in one line; after `claude plugin update
explainer@explainer` it reinstalls the dependencies only.

**To work on Explainer**, clone the repo and use these routes instead of the plugin, never
both on one machine (see [ADR-0010](docs/adr/0010-the-skills-install-by-symlink-or-plugin.md)
and [ADR-0011](docs/adr/0011-the-repo-is-a-claude-code-plugin.md)). From the repo root:

```bash
ln -s "$PWD/skills/explainer-script" ~/.claude/skills/explainer-script
cd cli && ./setup.sh && npm link    # optional: `explainer` on your PATH, to run the CLI by hand
```

Invoke `/explainer-script`; edits take effect in the next session. The linked skill runs the
CLI in the clone, not the one on PATH. The tests run with `npm test` in `cli/`.

Run the skill in the project whose process you want to explain.

## License

[MIT](LICENSE).
