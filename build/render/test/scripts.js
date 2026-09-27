// Synthetic test scripts. Written to a temp root as <root>/explainers/<slug>/script.yaml.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TWO_NODE = `meta:
  schema: 0.1
  title: Two steps
  audience: Test readers
  outcome: Viewer sees that writing comes before review

sources:
  - {id: notes, title: Synthetic notes, path: notes.md}

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

function writeScript(yaml) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-')), 'explainers', 'two-node');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.md'), 'You write it. You review it. You write before review.\n');
  fs.writeFileSync(path.join(dir, 'script.yaml'), yaml);
  return path.join(dir, 'script.yaml');
}

module.exports = { TWO_NODE, writeScript };
