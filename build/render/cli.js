#!/usr/bin/env node
// The explainer CLI. Commands: validate <script>, render <script> --pack <name>, fetch <url> <extract-path> [--overwrite].
// The machine-readable report goes to stdout as JSON; human-readable lines go to stderr.
// validate --pack <name> also checks the pack maps the script and that no step overruns in it; render always does.
// Exit codes: 0 success, 1 validation or fetch failure, 2 usage error, 70 internal error.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { parseDocument, LineCounter } = require('yaml');
const ELK = require('elkjs');
const Ajv = require('ajv');

const checkSchema = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(require('./schema.json'));

const FRAME = { width: 1920, height: 1080 };

// Before matching, quotes and extracts fold whitespace, case, Markdown emphasis and code marks,
// and typographic punctuation (ADR-0002).
const normalise = text => text.replace(/[*_`]/g, '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

// A script lives at <root>/explainers/<slug>/script.yaml; its extracts and renders under <root>/local-data/<slug>/ (#8).
const rootOf = file => path.resolve(path.dirname(file), '../..');

// Checks every rule of schema v0.1 (ADR-0002) plus reveal coverage (ADR-0005); with a pack, its coverage and overrun.
// With draft, steps may be absent and the draft: block is ignored.
function validate(file, { draft = false, pack } = {}) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(fs.readFileSync(file, 'utf8'), { lineCounter });
  if (doc.errors.length) {
    return { errors: doc.errors.map(e => ({ message: e.message, at: '', line: e.linePos?.[0]?.line })), warnings: [] };
  }
  const script = doc.toJS() ?? {};
  if (draft) delete script.draft;
  const errors = [];
  const warnings = [];
  // Locates an error at a path into the script; the line is that of the deepest part that exists.
  const located = (at, message) => {
    let node;
    for (let n = at.length; n >= 0 && !node?.range; n--) node = doc.getIn(at.slice(0, n), true);
    return {
      message,
      at: at.map(p => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').slice(1),
      line: node?.range ? lineCounter.linePos(node.range[0]).line : undefined,
    };
  };

  if (!checkSchema(draft ? { steps: [], ...script } : script)) {
    for (const e of checkSchema.errors) {
      if (e.keyword === 'if') continue;
      const at = e.instancePath.split('/').slice(1).map(p => (/^\d+$/.test(p) ? Number(p) : p));
      const extra = e.params.missingProperty ?? e.params.additionalProperty;
      if (extra) at.push(extra);
      const message = e.params.additionalProperty ? `'${extra}' is not part of schema v0.1`
        : `${e.message}${'allowedValue' in e.params ? ` ${e.params.allowedValue}` : ''}`;
      errors.push(located(at, message));
    }
    return { errors, warnings, script };
  }

  const graph = script.graph;
  const sections = { groups: graph.groups ?? [], nodes: graph.nodes, edges: graph.edges ?? [] };
  const vocab = { groups: ['type', 'group_types'], nodes: ['type', 'node_types'], edges: ['kind', 'edge_kinds'] };
  const ids = new Map(); // one namespace: id -> section
  for (const [section, list] of Object.entries(sections)) {
    list.forEach((el, i) => {
      if (ids.has(el.id)) errors.push(located(['graph', section, i, 'id'], `id '${el.id}' is already declared`));
      else ids.set(el.id, section);
      const [field, declared] = vocab[section];
      if (!(graph[declared] ?? []).includes(el[field])) {
        errors.push(located(['graph', section, i, field], `${field} '${el[field]}' is not declared in graph.${declared}`));
      }
    });
  }
  const refs = [['groups', 'parent', ['groups']], ['nodes', 'group', ['groups']], ['edges', 'from', ['nodes', 'groups']], ['edges', 'to', ['nodes', 'groups']]];
  for (const [section, field, allowed] of refs) {
    sections[section].forEach((el, i) => {
      if (field in el && !allowed.includes(ids.get(el[field]))) {
        const kinds = allowed.map(a => a.slice(0, -1)).join(' or ');
        errors.push(located(['graph', section, i, field], `${section.slice(0, -1)} ${el.id}: ${field} '${el[field]}' is not a declared ${kinds}`));
      }
    });
  }
  const parentOf = new Map(sections.groups.map(g => [g.id, g.parent]));
  sections.groups.forEach((group, i) => {
    const seen = new Set();
    for (let p = group.parent; p !== undefined && !seen.has(p); p = parentOf.get(p)) {
      if (p === group.id) { errors.push(located(['graph', 'groups', i, 'parent'], `group ${group.id} is nested inside itself`)); break; }
      seen.add(p);
    }
  });

  const revealed = new Set();
  (script.steps ?? []).forEach((step, s) => step.actions.forEach((action, a) => {
    const [verb, arg] = Object.entries(action)[0];
    const at = ['steps', s, 'actions', a, verb];
    const withArgs = verb === 'set_state' || verb === 'annotate';
    const target = withArgs ? arg.target : arg;
    const targetAt = withArgs ? [...at, 'target'] : at;
    [].concat(target).forEach((id, k) => {
      if (!ids.has(id)) errors.push(located(Array.isArray(target) ? [...targetAt, k] : targetAt, `${verb} targets '${id}', which is not a declared group, node or edge`));
      if (verb === 'reveal') revealed.add(id);
    });
    if (verb === 'set_state' && !(graph.states ?? []).includes(arg.state)) {
      errors.push(located([...at, 'state'], `state '${arg.state}' is not declared in graph.states`));
    }
  }));
  if (script.steps) {
    for (const [section, list] of Object.entries(sections)) {
      list.forEach((el, i) => {
        if (!revealed.has(el.id)) errors.push(located(['graph', section, i], `${section.slice(0, -1)} ${el.id} is declared but never revealed`));
      });
    }
  }

  if (pack) {
    const nouns = { group_types: 'group type', node_types: 'node type', edge_kinds: 'edge kind', states: 'state' };
    for (const [declared, noun] of Object.entries(nouns)) {
      (graph[declared] ?? []).forEach((entry, i) => {
        if (!Object.hasOwn(pack[declared] ?? {}, entry)) errors.push(located(['graph', declared, i], `${noun} '${entry}' is not mapped by pack ${pack.name}`));
      });
    }
    // Overrun (ADR-0004, ADR-0006): the actions play in order, so a step's animation time is the sum of its verbs'
    // durations; its narration needs characters / 15 s to read. The suggestion covers both, up to the next 0.5 s.
    (script.steps ?? []).forEach((step, s) => {
      const verbs = step.actions.map(action => Object.keys(action)[0]);
      verbs.forEach((verb, a) => {
        if (!pack.verbs[verb]) errors.push(located(['steps', s, 'actions', a, verb], `verb '${verb}' is not mapped by pack ${pack.name}`));
      });
      if (!verbs.every(verb => pack.verbs[verb])) return;
      const animation = Math.round(verbs.reduce((sum, verb) => sum + pack.verbs[verb].duration_s, 0) * 1000) / 1000;
      const reading = [...step.narration].length / 15;
      const needed = Math.max(animation, reading);
      if (needed <= step.duration_s) return;
      const suggested = Math.ceil(needed * 2) / 2;
      const over = animation > step.duration_s ? (reading > step.duration_s ? 'animation and narration run' : 'animation runs') : 'narration runs';
      errors.push({
        ...located(['steps', s, 'duration_s'], `step ${s + 1} in pack ${pack.name}: the ${over} over its ${step.duration_s} s (animation ${animation} s, narration ${reading.toFixed(1)} s to read at 15 characters/s); suggested duration_s ${suggested}`),
        suggested_duration_s: suggested,
        animation_s: animation,
        pack: pack.name,
      });
    });
  }

  // An extract's path is relative to the root. An absent extract is a warning: its quotes go unchecked.
  const extracts = new Map();
  script.sources.forEach((src, i) => {
    if (extracts.has(src.id)) errors.push(located(['sources', i, 'id'], `source id '${src.id}' is already declared`));
    const escapes = src.path && (path.isAbsolute(src.path) || src.path.split(/[\\/]/).includes('..'));
    if (escapes) errors.push(located(['sources', i, 'path'], `source ${src.id}: path ${src.path} leaves the root; it must be relative to it, with no '..'`));
    const extract = src.path && !escapes && path.resolve(rootOf(file), src.path);
    const present = extract && fs.existsSync(extract);
    if (!present && !escapes) warnings.push(located(['sources', i, 'path'], `source ${src.id}: extract ${src.path ? `${src.path} is absent` : 'has no path'}; its quotes were not checked`));
    extracts.set(src.id, present ? normalise(fs.readFileSync(extract, 'utf8')) : null);
  });
  const cites = [
    ...Object.entries(sections).flatMap(([section, list]) => list.map((el, i) => [['graph', section, i, 'cite'], el.cite])),
    ...(script.steps ?? []).map((step, i) => [['steps', i, 'cite'], step.cite]),
  ];
  for (const [at, cite] of cites) {
    [].concat(cite).forEach((c, k) => {
      const citeAt = Array.isArray(cite) ? [...at, k] : at;
      if (!extracts.has(c.src)) errors.push(located([...citeAt, 'src'], `cite names source '${c.src}', which is not declared`));
      else if (!normalise(c.quote)) errors.push(located([...citeAt, 'quote'], `quote is empty once whitespace and Markdown marks are folded: "${c.quote}"`));
      else if (extracts.get(c.src) !== null && !extracts.get(c.src).includes(normalise(c.quote))) {
        errors.push(located([...citeAt, 'quote'], `quote not found in the extract of ${c.src}: "${c.quote}"`));
      }
    });
  }
  return { errors, warnings, script };
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

// Writes a source's text straight to disk with no model in the path (ADR-0005, ADR-0009):
// HTTP plus pandoc's plain text first, then headless Chromium's innerText; under 100 words either way, it fails.
async function fetchExtract(url, file, report, overwrite) {
  const failed = message => ({ code: 1, report: { ...report, errors: [{ message }] } });
  let html;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return failed(`fetch ${url}: HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return failed(`fetch ${url}: ${e.cause?.message ?? e.message}`);
  }
  const pandoc = spawnSync('pandoc', ['-f', 'html', '-t', 'plain', '--wrap=none'], { input: html, encoding: 'utf8' });
  if (pandoc.status !== 0) throw new Error(`pandoc: ${pandoc.error?.message ?? pandoc.stderr}`);
  const wordsIn = t => t.split(/\s+/).filter(Boolean).length;
  let text = pandoc.stdout;
  if (wordsIn(text) < 100) {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'commit' });
      // A page that polls never goes network-idle: after 5 s, read what has rendered and let the floor decide.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      text = `${await page.evaluate(() => document.body.innerText)}\n`;
    } catch (e) {
      return failed(`fetch ${url}: Chromium: ${e.message.split('\n')[0]}`);
    } finally {
      await browser.close();
    }
  }
  const count = wordsIn(text);
  if (count < 100) return failed(`fetch ${url}: ${count} words after pandoc and Chromium, under the 100-word floor; nothing written`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A symlinked directory on the way would carry the write out of local-data.
  const sources = path.join(fs.realpathSync(path.resolve(file, '../../../..')), 'local-data', path.basename(path.resolve(file, '../..')), 'sources');
  if (fs.realpathSync(path.dirname(file)) !== sources) {
    return { code: 2, report: { ...report, errors: [{ message: `extract ${file} resolves outside ${sources} through a symlink; refusing to write through it` }] } };
  }
  fs.writeFileSync(file, text, { flag: overwrite ? 'w' : 'wx' });
  report.written.push(file);
  return { code: 0, report: { ...report, words: count } };
}

async function main(argv) {
  const report = { errors: [], warnings: [], written: [] };
  try {
    return await run(argv, report);
  } catch (e) {
    return { code: 70, report: { ...report, errors: [{ message: String(e) }] } };
  }
}

async function run(argv, report) {
  const draft = argv.includes('--draft');
  const packAt = argv.indexOf('--pack');
  const [command, file, ...rest] = argv.filter((a, i) => a !== '--draft' && a !== '--overwrite' && (packAt < 0 || (i !== packAt && i !== packAt + 1)));
  const usage = message => ({ code: 2, report: { ...report, errors: [{ message }] } });
  if (command === 'fetch' && file && rest[0]) {
    // Fetched third-party text lives only in gitignored <root>/local-data/<slug>/sources/ (#8, ADR-0009).
    const extract = path.resolve(rest[0]);
    if (path.basename(path.dirname(extract)) !== 'sources' || path.basename(path.resolve(extract, '../../..')) !== 'local-data') {
      return usage(`an extract must be at <root>/local-data/<slug>/sources/<file>: ${rest[0]}`);
    }
    if (fs.lstatSync(extract, { throwIfNoEntry: false })?.isSymbolicLink()) return usage(`extract ${rest[0]} is a symlink; refusing to write through it`);
    const overwrite = argv.includes('--overwrite');
    if (fs.existsSync(extract) && !overwrite) return usage(`extract ${rest[0]} exists; pass --overwrite to replace it`);
    return fetchExtract(file, extract, report, overwrite);
  }
  if (!['validate', 'render'].includes(command) || !file) return usage('usage: explainer validate <script> [--pack <name>] | explainer render <script> --pack <name> | explainer fetch <url> <extract-path> [--overwrite]');
  if (!fs.existsSync(file)) return usage(`no such script: ${file}`);
  if (!['explainers', 'local-data'].includes(path.basename(path.resolve(file, '../..')))) {
    return usage(`a script must be at <root>/explainers/<slug>/script.yaml, or a draft at <root>/local-data/<slug>/script.draft.yaml: ${file}`);
  }

  const packFile = path.join(__dirname, 'packs', String(argv[packAt + 1]), 'pack.json');
  if ((command === 'render' || packAt >= 0) && (packAt < 0 || !fs.existsSync(packFile))) {
    return usage(`${command} ${command === 'render' ? 'needs' : 'takes'} --pack <name>, one of: ${fs.readdirSync(path.join(__dirname, 'packs')).join(', ')}`);
  }
  const pack = packAt >= 0 ? JSON.parse(fs.readFileSync(packFile, 'utf8')) : undefined;

  const { errors, warnings, script } = validate(file, { draft: command === 'validate' && draft, pack });
  report.warnings = warnings;
  if (errors.length) return { code: 1, report: { ...report, errors } };
  if (command === 'validate') return { code: 0, report };

  const out = path.join(rootOf(file), 'local-data', path.basename(path.dirname(path.resolve(file))), 'render', pack.name);
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
    const line = (kind, e) => console.error(`${kind}: ${e.at ? `${e.at}${e.line ? ` (line ${e.line})` : ''}: ` : ''}${e.message}`);
    for (const e of report.errors) line('error', e);
    for (const w of report.warnings) line('warning', w);
    for (const w of report.written) console.error(`wrote ${w}`);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = code;
  });
}
