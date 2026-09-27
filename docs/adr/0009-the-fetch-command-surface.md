---
status: accepted
---

# `explainer fetch` takes a URL and an extract path

The MVP spec ([#12](https://github.com/dempseydata/explainer/issues/12)), [#8](https://github.com/dempseydata/explainer/issues/8) and ADR-0005 name a `fetch` command and say what it does: HTTP and pandoc, then headless Chromium, with a 100-word floor. None of them gives its arguments. It reads `explainer fetch <url> <extract-path>`, with `--overwrite` to replace an existing extract.

## Consequences

- **It takes a URL, not a script.** Fetching happens during Grounding, before Checkpoint 1, and the draft is saved only at a checkpoint (#8). There is no script yet to name a source in.
- **The extract path must be `<root>/local-data/<slug>/sources/<file>`:** its parent directory is named `sources` and that directory's grandparent `local-data`, or the command exits 2 with the reason in the report. It must not be a symlink, with or without `--overwrite`. Nor may a symlinked directory carry it out of `local-data/`: before writing, the real path of its parent must be `<real root>/local-data/<slug>/sources`, or the command exits 2 and writes no extract. The CLI checks only those names; that `local-data/` is gitignored is the repo's `.gitignore`, not the CLI. The skill records the path, root-relative, on the source.
- **An existing extract is never overwritten without `--overwrite`.** Without it, the command exits 2 and writes nothing.
- **The report adds `words` beside `written`:** the extract's word count. Under 100 words after both attempts, an HTTP error or a network error (including no response within 30 s, over HTTP or to Chromium) each exits 1 with a reason in the report, and nothing is written. Chromium waits at most 5 s for the network to go idle, then reads what has rendered; if it cannot read the page, that too is a network error.
- **Playwright is a runtime dependency,** not a test-only one. `fetch` launches its Chromium.

## Considered options

- **`explainer fetch <script> <source-id>`**, reading the URL and path from the source entry. Rejected: no script or draft exists when sources are fetched.
