# Explainer

A set of skills that turn a conversation about a process into a short, source-grounded animated flowchart. Built for one author, in public.

## Language

**Explainer**:
One rendered animated flowchart about one process — the thing a viewer watches. The product shares the name; in prose, "an explainer" is always the output.
_Avoid_: video, animation, diagram

**Script**:
The versioned, source-cited description of an explainer: what each thing is and the order it is revealed. The source of truth; everything rendered from it is disposable.
_Avoid_: storyboard, scene file

**Style pack**:
The visual treatment an explainer is rendered through — how the script's things look and move. Styles the output, never the product's own interface.
_Avoid_: theme, skin, style (bare)

**Step**:
One beat of a script: up to three actions, a narration line, a duration, and the quotes that ground it. Steps change what is on screen; they are diffs, not scenes.
_Avoid_: scene, slide, frame

**Action**:
One change a step makes. **Persistent** actions (reveal, hide, set state) hold until changed; **transient** actions (highlight, annotate, focus) last only for their step.
_Avoid_: event, animation

**Group**:
A declared region of the script's graph that holds nodes or other groups and is laid out around them. An action aimed at a group acts on the group itself, never on its members.
_Avoid_: region, cluster, tag

**Citation**:
A source id and a verbatim quote, checked against that source's stored extract. The quote is the proof; a source id alone proves only that a source was named.
_Avoid_: reference, footnote

**Extract**:
The stored text of a source that citations are checked against. Written by a deterministic fetch, never by the model; one transcribed from another tool's output is marked as such.
_Avoid_: snapshot, copy, cache

**Checkpoint**:
One of the three points where the author approves the script so far: the graph and its grounding, the look, then the steps. The draft is saved only at a checkpoint.
_Avoid_: gate, review, milestone

**Gap**:
A claim the author wants that no source supports, held as an open question in the draft rather than written into the script.
_Avoid_: TODO, missing citation

**Finding**:
Something the pre-capture checks report against one render: a label under the x-height floor, or an overlap. A finding stops capture unless the author accepts it; it is never fixed by the renderer.
_Avoid_: warning, error, issue

**Look**:
Something the readability look raises: a step where a viewer who has not read the script sees something other than what the script intends. Advisory; a look never stops capture.
_Avoid_: finding, review, warning
