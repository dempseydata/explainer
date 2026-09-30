---
status: accepted
---

# The CLI is named `explainer`

The MVP spec ([#12](https://github.com/dempseydata/explainer/issues/12)) calls the Node tool "the `render` CLI" and also gives it a `render` command, so a render reads `render render <script> --pack <name>`. The binary is named `explainer` instead. The commands read `explainer validate`, `explainer fetch` and `explainer render`, with their flags unchanged.

## Consequences

- **The commands match the skills.** `/explainer-script` and `/explainer-render` drive `explainer`, so the product has one name everywhere it is typed.
- **Nothing generic lands on PATH.** A binary called `render` would collide with, or be shadowed by, any other tool of that name.
- **The source folder stays `build/render/`.** It is internal, and the package name is private; neither is typed by the author.
  *Amended by ADR-0011:* the source folder is `cli/`, at the root of the plugin.
- **Reading the spec.** Where #12 says "the `render` CLI", read "the `explainer` CLI".

## Considered options

- **Keep `render`.** Rejected: `render render` stutters, and the name says nothing about the product.
- **Rename the source folder to match.** Rejected: churn with no reader. Nobody invokes the folder.
