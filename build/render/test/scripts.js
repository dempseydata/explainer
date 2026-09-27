// Synthetic test scripts. Written to a temp root as <root>/explainers/<slug>/script.yaml,
// with their extract at <root>/local-data/<slug>/sources/notes.md (#8).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TWO_NODE = `meta:
  schema: 0.1
  title: Two steps
  audience: Test readers
  outcome: Viewer sees that writing comes before review

sources:
  - {id: notes, title: Synthetic notes, path: local-data/two-node/sources/notes.md}

graph:
  group_types: []
  node_types: [ticket.task]
  edge_kinds: [blocks]
  states: []
  nodes:
    - {id: write, type: ticket.task, label: Write, cite: {src: notes, quote: "write it"}}
    - {id: review, type: ticket.task, label: Review, cite: {src: notes, quote: "review it"}}
  edges:
    - id: write-review
      from: write
      to: review
      kind: blocks
      cite: {src: notes, quote: "write before review"}

steps:
  - actions:
      - {reveal: write}
    narration: First, write it.
    duration_s: 2
    cite: {src: notes, quote: "write it"}
  - actions:
      - {reveal: review}
      - {reveal: write-review}
    narration: Then review it.
    duration_s: 3
    cite: {src: notes, quote: "write before review"}
`;

// Every schema v0.1 feature: nested groups, a group as an edge end, states, all six verbs,
// cite lists, and quotes that match their extract only after normalisation.
const BOARD = `meta:
  schema: 0.1
  title: A board of cards
  audience: Test readers
  outcome: Viewer sees a card move across a board

sources:
  - {id: notes, title: Synthetic notes, path: local-data/two-node/sources/notes.md}

graph:
  group_types: [board, lane]
  node_types: [card]
  edge_kinds: [blocks]
  states: [active, done]
  groups:
    - {id: board, type: board, label: Board, cite: {src: notes, quote: "The team's board holds every card"}}
    - {id: lane, type: lane, parent: board, cite: {src: notes, quote: "every card - drafts first"}}
  nodes:
    - {id: card1, type: card, group: lane, label: Draft, cite: {src: notes, quote: "drafts first"}}
    - {id: archive, type: card, label: Archive, cite: {src: notes, quote: "done cards are archived"}}
  edges:
    - {id: lane-archive, from: lane, to: archive, kind: blocks, cite: {src: notes, quote: "done cards are archived"}}

steps:
  - actions:
      - {reveal: [board, lane]}
      - {reveal: card1}
      - {set_state: {target: [card1], state: active}}
    narration: The board holds every card, drafts first.
    duration_s: 4
    cite: {src: notes, quote: "The team's board holds every card - drafts first"}
  - actions:
      - {reveal: [archive, lane-archive]}
      - {highlight: archive}
      - {annotate: {target: archive, text: Archived}}
    narration: Done cards are archived.
    duration_s: 4
    cite:
      - {src: notes, quote: "Done cards"}
      - {src: notes, quote: "are archived"}
  - actions:
      - {focus: board}
      - {hide: lane-archive}
      - {set_state: {target: card1, state: done}}
    narration: The draft is done.
    duration_s: 3
    cite: {src: notes, quote: "*Done* cards"}
`;

const NOTES = 'You write it. You review it. You write before review.\nThe team\u2019s board holds every card \u2013 drafts first.\n*Done* cards   are\narchived.\n';

function writeScript(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-'));
  const dir = path.join(root, 'explainers', 'two-node');
  const sources = path.join(root, 'local-data', 'two-node', 'sources');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(sources, { recursive: true });
  fs.writeFileSync(path.join(sources, 'notes.md'), NOTES);
  fs.writeFileSync(path.join(dir, 'script.yaml'), yaml);
  return path.join(dir, 'script.yaml');
}

module.exports = { TWO_NODE, BOARD, writeScript };
