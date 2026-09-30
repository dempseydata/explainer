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

**1. The CLI.** Clone the repo, then:

```bash
cd explainer/build/render
npm install
npx playwright install chromium
npm link        # puts `explainer` on your PATH, pointing at this clone
```

**2. The skill.** Pick one route per machine (see
[ADR-0010](docs/adr/0010-the-skills-install-by-symlink-or-plugin.md)):

- **Plugin** — to use Explainer:

  ```bash
  claude plugin marketplace add dempseydata/explainer
  claude plugin install explainer@explainer
  ```

  Invoke `/explainer:explainer-script`. Update with `claude plugin update explainer@explainer`.

- **Symlink** — to work on the skill. From the repo root:

  ```bash
  ln -s "$PWD/build/skill/explainer-script" ~/.claude/skills/explainer-script
  ```

  Invoke `/explainer-script`. Edits take effect in the next session.

Run the skill in the project whose process you want to explain.

## License

[MIT](LICENSE).
