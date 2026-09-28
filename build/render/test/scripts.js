// Synthetic test scripts. Written to a temp root as <root>/explainers/<slug>/script.yaml,
// with their extract at <root>/local-data/<slug>/sources/notes.md (#8).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

// A board of n sibling lanes, each a chain of two cards. The lanes are declared in `declared` order and revealed
// in index order, one step each; every [i, j] in `links` is an edge from lane i's second card to lane j's first.
function lanes(n, { declared = [...Array(n).keys()], links = [] } = {}) {
  const cite = '{src: notes, quote: "write it"}';
  const edges = [...Array(n).keys()].map(i => `    - {id: e${i}, from: c${i}a, to: c${i}b, kind: blocks, cite: ${cite}}`)
    .concat(links.map(([i, j]) => `    - {id: l${i}${j}, from: c${i}b, to: c${j}a, kind: blocks, cite: ${cite}}`));
  const step = reveals => `  - actions:\n${reveals.map(r => `      - {reveal: [${r}]}`).join('\n')}\n    narration: Write it.\n    duration_s: 2\n    cite: ${cite}`;
  return `meta:
  schema: 0.1
  title: Lanes
  audience: Test readers
  outcome: Viewer sees lanes laid out in reading order

sources:
  - {id: notes, title: Synthetic notes, path: local-data/two-node/sources/notes.md}

graph:
  group_types: [map, fog]
  node_types: [ticket.task]
  edge_kinds: [blocks]
  states: []
  groups:
    - {id: board, type: map, label: Board, cite: ${cite}}
${declared.map(i => `    - {id: lane${i}, type: fog, parent: board, cite: ${cite}}`).join('\n')}
  nodes:
${[...Array(n).keys()].flatMap(i => [`    - {id: c${i}a, type: ticket.task, group: lane${i}, label: Write, cite: ${cite}}`, `    - {id: c${i}b, type: ticket.task, group: lane${i}, label: Review, cite: ${cite}}`]).join('\n')}
  edges:
${edges.join('\n')}

steps:
${[step(['board']), ...[...Array(n).keys()].map(i => step([`lane${i}`, `c${i}a, c${i}b, e${i}`])), ...(links.length ? [step([links.map(([i, j]) => `l${i}${j}`).join(', ')])] : [])].join('\n')}
`;
}

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

// A 1920×1080 page at url with its fonts loaded, and every request it makes.
async function open(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const requests = [];
  page.on('request', r => requests.push(r.url()));
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  return { page, requests };
}

// PSNR in dB between two image files; Infinity when identical.
function psnr(a, b) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-']).stderr.toString();
  return Number(/average:(\S+)/.exec(log)[1].replace('inf', 'Infinity'));
}

module.exports = { TWO_NODE, BOARD, lanes, writeScript, open, psnr };
