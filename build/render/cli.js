#!/usr/bin/env node
// The render CLI. Commands: validate <script>, render <script> --pack <name>.
// The machine-readable report goes to stdout as JSON; human-readable lines go to stderr.
// Exit codes: 0 success, 1 validation failure, 2 usage error, 70 internal error (e.g. a pack that does not map the script).
const fs = require('node:fs');
const path = require('node:path');
const { parseDocument, LineCounter } = require('yaml');
const ELK = require('elkjs');

const FRAME = { width: 1920, height: 1080 };

function validate(file) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(fs.readFileSync(file, 'utf8'), { lineCounter });
  if (doc.errors.length) {
    return { errors: doc.errors.map(e => ({ message: e.message, at: '', line: e.linePos?.[0]?.line })) };
  }
  const script = doc.toJS();
  const graph = script.graph ?? {};
  const located = (at, message) => {
    const node = doc.getIn(at, true);
    return {
      message,
      at: at.map(p => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').slice(1),
      line: node?.range ? lineCounter.linePos(node.range[0]).line : undefined,
    };
  };

  const ends = new Set([...(graph.groups ?? []), ...(graph.nodes ?? [])].map(e => e.id));
  const errors = [];
  (graph.edges ?? []).forEach((edge, i) => {
    for (const end of ['from', 'to']) {
      if (!ends.has(edge[end])) {
        errors.push(located(['graph', 'edges', i, end], `edge ${edge.id}: ${end} '${edge[end]}' is not a declared node or group`));
      }
    }
  });
  return { errors, script };
}

async function layout(script, pack) {
  const graph = await new ELK().layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.layered.spacing.nodeNodeBetweenLayers': '120' },
    children: script.graph.nodes.map(n => ({ id: n.id, ...pack.node_types[n.type].size })),
    edges: script.graph.edges.map(e => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  });
  // ponytail: centred at pack size, no scaling; maximising label x-height is #19.
  const dx = (FRAME.width - graph.width) / 2;
  const dy = (FRAME.height - graph.height) / 2;
  const nodes = Object.fromEntries(graph.children.map(n => [n.id, { x: n.x + dx, y: n.y + dy, width: n.width, height: n.height }]));
  const edges = Object.fromEntries(graph.edges.map(e => {
    const s = e.sections[0];
    const points = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(p => [p.x + dx, p.y + dy]);
    return [e.id, { points }];
  }));
  return { pack: pack.name, frame: FRAME, nodes, edges };
}

// A step's actions play in order, each starting when the previous one's animation ends;
// the step then holds until duration_s. Returns each element's reveal window.
function timeline(script, pack) {
  const reveal = {};
  let stepStart = 0;
  for (const step of script.steps) {
    let t = stepStart;
    for (const action of step.actions) {
      const [verb, target] = Object.entries(action)[0];
      const d = pack.verbs[verb].duration_s;
      for (const id of [].concat(target)) reveal[id] = [t, t + d];
      t += d;
    }
    stepStart += step.duration_s;
  }
  return { reveal, duration_s: stepStart };
}

function playerHtml(script, pack, lay) {
  const data = {
    title: script.meta.title,
    frame: FRAME,
    pack,
    nodes: script.graph.nodes.map(n => ({ ...lay.nodes[n.id], id: n.id, type: n.type, label: n.label })),
    edges: script.graph.edges.map(e => ({ ...lay.edges[e.id], id: e.id, kind: e.kind })),
    ...timeline(script, pack),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const tokens = Object.entries(pack.tokens).map(([k, v]) => `--${k}:${v}`).join(';');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title></title>
<style>:root{${tokens}}html,body{margin:0;background:var(--${pack.ground})}svg{display:block;width:100%;height:auto}</style>
</head><body>
<svg id="frame" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME.width} ${FRAME.height}"></svg>
<script>const DATA=${json};
${fs.readFileSync(path.join(__dirname, 'player.js'), 'utf8')}</script>
</body></html>
`;
}

async function main(argv) {
  const report = { errors: [], written: [] };
  try {
    return await run(argv, report);
  } catch (e) {
    return { code: 70, report: { ...report, errors: [{ message: String(e) }] } };
  }
}

async function run(argv, report) {
  const [command, file, ...rest] = argv;
  const usage = message => ({ code: 2, report: { ...report, errors: [{ message }] } });
  if (!['validate', 'render'].includes(command) || !file) return usage('usage: render validate <script> | render render <script> --pack <name>');
  if (!fs.existsSync(file)) return usage(`no such script: ${file}`);

  const { errors, script } = validate(file);
  if (errors.length) return { code: 1, report: { ...report, errors } };
  if (command === 'validate') return { code: 0, report };

  const packName = rest[rest.indexOf('--pack') + 1];
  const packFile = path.join(__dirname, 'packs', String(packName), 'pack.json');
  if (!rest.includes('--pack') || !fs.existsSync(packFile)) return usage(`render needs --pack <name>, one of: ${fs.readdirSync(path.join(__dirname, 'packs')).join(', ')}`);
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));

  // Renders go to <root>/local-data/<slug>/<pack>/ for a script at <root>/explainers/<slug>/.
  const scriptDir = path.dirname(path.resolve(file));
  const out = path.resolve(scriptDir, '../../local-data', path.basename(scriptDir), pack.name);
  // Build every output before writing any, so a failure leaves no half-written render.
  const lay = await layout(script, pack);
  const outputs = { 'layout.json': JSON.stringify(lay, null, 2) + '\n', 'explainer.html': playerHtml(script, pack, lay) };
  fs.mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(out, name), content);
    report.written.push(path.join(out, name));
  }
  return { code: 0, report };
}

module.exports = { main };

if (require.main === module) {
  main(process.argv.slice(2)).then(({ code, report }) => {
    for (const e of report.errors) console.error(`error: ${e.at ? `${e.at}${e.line ? ` (line ${e.line})` : ''}: ` : ''}${e.message}`);
    for (const w of report.written) console.error(`wrote ${w}`);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = code;
  });
}
