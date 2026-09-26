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
