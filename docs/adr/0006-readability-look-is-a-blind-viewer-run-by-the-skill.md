---
status: accepted
---

# The readability look is a blind viewer run by the skill, and pacing is a validation rule

The brief put the readability look at the end of the CLI's pipeline: a model views one keyframe per step and notes what the geometry cannot see. Two things are wrong with that. The CLI is a child process of a Claude Code session and has no model of its own. And "pacing against narration", the first thing the look was to check, is arithmetic that a still image cannot show. The full resolution is in [What does the readability look check, and what does its review.md report?](https://github.com/dempseydata/explainer/issues/10).

**The skill runs the look, not the CLI.** The model is the host session that is already running the skill. The CLI writes the keyframes (ADR-0004), and the skill reads them, while capture runs in the background. This amends the last stage of ADR-0004's pipeline.

**The look is judged by a viewer who has not read the script.** A model told what a step meant to do will see it done. So the look has two parts. A viewer subagent sees only what a viewer sees: each keyframe once, in step order, and each step's narration. For each step it reports what changed, where the eye goes, what the emphasis points at, which connections and containments it reads, and whether the narration describes something visible. The skill, which holds the script, compares that report with the actions and raises a **look** only where the two disagree. Stills are harsher than motion, and that bias is useful: a change that reads in stills reads in motion.

**Pacing is a validation rule.** Narration must be readable in the time it is on screen: at most 15 characters per second, below the 17–20 of subtitle practice, because the viewer is also watching the diagram. It folds into ADR-0004's overrun suggestion. The suggested `duration_s` becomes the larger of the pack's animation time and narration length ÷ 15, rounded up to the next 0.5 s. It is monotone, it is the same in every pack, and `/explainer-script` puts it to the author in the same turn.

## Consequences

- **The look checks four things, and nothing else.** *Change*: could a viewer tell what this step changed? *Narration*: is what it names visible, and is the visible change what it names? *Emphasis*: do highlight, focus and annotation land on their target? *Arrangement*: does an edge or group outline suggest a connection or containment that is not there? The prompt names what it must not report: x-height, overlap, overrun, reading rate, grounding, the pack's look, and whether a step should exist.
- **Where it runs.** At Checkpoint 3 it runs over every step in the chosen pack, beside the check pass. The covering frames show the author only a few steps, and a fix there costs one edit. In `/explainer-render` it runs only for a pack not approved at Checkpoint 3, or for a script changed since approval. Otherwise it is skipped, and it says so.
- **`review.md` has two writers, in turn.** The CLI writes it once, before capture, and never again; `--accept-findings` is known at the start. The skill appends `## Look` after `## Findings`: a table of *Step · Check · Viewer saw · Script intends*, with no suggested fix. An empty look reads "Nothing to report."; a skipped one gives its reason in one line. A look never stops capture. At Checkpoint 3 the skill may propose an edit in conversation.
- **The viewer runs on Sonnet.** Its job is perception. Haiku 4.5 downscales a 1080p keyframe to 1568 px, and a viewer that misreads the picture raises looks that are not real. For Wayfinder's 12 steps that is about 32k image tokens, charged to the subscription. In a render it runs alongside capture; at Checkpoint 3 the author waits for it.
- **M5's done-when gains three seeded cases:** a reveal made hard to see and a highlight moved onto the wrong target are each raised, and a clean script reports "Nothing to report." That set is the bar a cheaper viewer model would have to clear.

## Considered options

- **The look inside the CLI**, calling a model through `claude -p`. Rejected: the CLI would depend on Claude Code, and a non-deterministic step would sit inside code built under `tdd`.
- **One pass, with the script in the prompt.** Rejected: it marks its own homework, for the same reason the model never writes an extract (ADR-0005).
- **Pacing judged by the look.** Rejected: a still cannot show time, and reading rate is a division.
- **The look on every render.** Rejected: re-reporting what the author approved minutes earlier teaches them to skim `review.md`.
- **Haiku as the viewer.** Deferred, not rejected: it takes the job if it clears the seeded cases.
