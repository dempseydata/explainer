---
status: accepted
---

# A state mark's collision is an `overlap`; an edge through a card is a `crossing`

The check pass reports findings with a `check` of `x-height`, `overlap` or `caption` (ledger, #22). [#33](https://github.com/dempseydata/explainer/issues/33) extends it to state marks and to edges drawn through a card, and neither source names their kinds.

- A **state mark** that overlaps another element is an `overlap`, and its message names the mark.
- An **edge** that passes through a card other than its two ends is a new kind, `crossing`.
  *Amended by ADR-0019:* any node counts, a goal circle included, measured by its outline's bounding box.

## Consequences

- Code that reads `check` must handle four values: `x-height`, `overlap`, `caption` and `crossing`.

## Considered options

- **New `state-mark` and `edge` kinds.** Rejected: a state-mark collision is an overlap. The kind names what went wrong, not which element caused it.
