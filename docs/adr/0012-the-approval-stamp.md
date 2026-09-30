---
status: accepted
---

# The approval stamp is `approval.json`, hashing the script's raw bytes

The spec ([#12](https://github.com/dempseydata/explainer/issues/12)) says `/explainer-script` records an approval stamp in `local-data` at Emit, holding the approved pack and a hash of the script's content, and that `/explainer-render` compares a render against it. It fixes neither the file nor what the hash covers.

The stamp is `<root>/local-data/<slug>/approval.json`:

```json
{"pack": "standard", "sha256": "<hex>"}
```

`sha256` is the SHA-256 of the raw bytes of `explainers/<slug>/script.yaml` as Emit wrote it, computed by `shasum -a 256` or Node's `crypto`, never by the model. Emit overwrites the stamp on every approval.

## Consequences

- **Any byte change counts as a change**, a comment or a reformat included, and re-runs the look. The look is advisory and cheap, so an extra run is better than a missed one.
- **Extracts and packs are not covered.** A pack edited since approval does not re-run the look on its own.
- **No stamp means not approved:** `/explainer-render` runs the look.

## Considered options

- **A hash of the parsed, re-serialised YAML**, so formatting edits don't count. Rejected: shell cannot normalise YAML, so the CLI would need a new report field, and a missed change is worse than a spurious look.
- **A field in the script.** Already rejected by the spec: it would bump the schema to carry state that isn't content.
