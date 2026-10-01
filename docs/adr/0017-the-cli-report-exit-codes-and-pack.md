---
status: accepted
---

# The CLI reports JSON on stdout, exits 0, 1, 2, 3 or 70, and takes `--pack` by name

The spec ([#12](https://github.com/dempseydata/explainer/issues/12)) asks for a machine-readable report beside the human-readable output, and for exit codes that tell success, a validation failure and a findings stop apart. Its comment fixes the codes. Neither names the report's fields. The build settled them in [#13](https://github.com/dempseydata/explainer/issues/13), [#14](https://github.com/dempseydata/explainer/issues/14), [#17](https://github.com/dempseydata/explainer/issues/17), [#21](https://github.com/dempseydata/explainer/issues/21) and [#22](https://github.com/dempseydata/explainer/issues/22), and [#32](https://github.com/dempseydata/explainer/issues/32) confined `--pack`.

**The report** is one JSON object on stdout. The human-readable lines go to stderr. Every command's report has:

| Field | Holds |
| --- | --- |
| `errors` | `{message, at, line}` each. `at` is a path into the script, such as `steps[3].duration_s`, and `line` is its YAML line where known. A usage, fetch or internal error carries `message` only. An overrun also carries `suggested_duration_s`, `animation_s` and `pack` (ADR-0004, ADR-0006). |
| `warnings` | The same shape as `errors`. An absent extract is a warning, because its quotes went unchecked. |
| `written` | The absolute path of each file written, in order. |

Some commands add a field:

| Field | When | Holds |
| --- | --- | --- |
| `words` | `fetch`, on success | The extract's word count (ADR-0009). |
| `findings` | `render`, once the check pass has run | `{step, check, message}` each, plus `accepted: true` under `--accept-findings`. `step` counts from 1, or is `graph`. `check` is one of ADR-0016's four kinds. |
| `capture` | `render`, when it captured | `{frames, screenshots, workers}`. |

**Exit codes:**

| Code | Means |
| --- | --- |
| 0 | Success. `render --frame` exits 0 whatever it finds. |
| 1 | A validation failure (YAML parse, schema, cross-references, quotes, reveal coverage, pack coverage or overrun), or a fetch failure (an HTTP or network error, a refused redirect, or under 100 words). |
| 2 | A usage error or a refusal. That covers the arguments, an unknown or missing `--pack`, a script that does not exist or does not sit where ADR-0018 says, a bad `--frame`, and an extract path ADR-0009 refuses. |
| 3 | Findings stopped capture. |
| 70 | An internal error: anything thrown, such as pandoc or ffmpeg missing, or Chromium failing to launch. The report still prints, carrying the error's message. |

**`--pack` takes an installed pack's name, never a path.** The name is that of a folder under `cli/packs/` holding a `pack.json` (ADR-0020). Anything else exits 2, and the error lists the installed packs. `render` needs `--pack`. `validate` takes it optionally, and with it also checks pack coverage and overrun.

## Consequences

- **The skills read the report, not stderr.** The stderr lines are for a person, and their wording may change.
- **A finding is not an error.** It sits in `findings`, never in `errors`, and only `render` without `--frame` stops on one.
- **A page inlines only what the CLI ships.** A pack's fonts, icons and licences come from its own folder under `cli/packs/`. Its libraries are npm modules, resolved from `cli/node_modules`. The player and the controls come from `cli/`.
- **70 is never a reason to try something else.** The skills stop and report it. After `fetch`, it does not license another fetch tool.
- **`--draft` belongs to `validate` alone.** `render --frame` reads a draft without it (ADR-0018).

## Considered options

- **A top-level `overruns` array.** Rejected in #17: the spec says the rejection carries the suggestion, so the suggestion is a field on the error that rejects.
- **`--pack` as a path to any pack folder.** Rejected in #32: a pack is inlined into a page that gets shared, so only installed packs are loaded.
