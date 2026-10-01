#!/usr/bin/env node
// The explainer CLI. Commands: validate <script>, render <script> --pack <name> [--accept-findings | --frame <graph|1,6,12>],
// fetch <url> <extract-path> [--overwrite].
// The machine-readable report goes to stdout as JSON; human-readable lines go to stderr.
// validate --pack <name> also checks the pack maps the script and that no step overruns in it; render always does.
// render writes to <root>/local-data/<slug>/render/<pack>/: layout.json, explainer.html, keyframes/step-NN.png and
// review.md, then, unless the check pass found something, explainer.mp4, captions.srt and narration.md. It reports its
// `findings` and, when it captured, `capture`. --accept-findings captures anyway. --frame writes only frames/*.png, a draft
// may be given, and it never captures.
// Exit codes: 0 success, 1 validation or fetch failure, 2 usage error, 3 findings stopped capture, 70 internal error.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const dns = require('node:dns');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseDocument, LineCounter } = require('yaml');
const ELK = require('elkjs');
const Ajv = require('ajv');

const checkSchema = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(require('./schema.json'));

const FRAME = { width: 1920, height: 1080 };
const FPS = 30;

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

// The label x-height F, in rendered pixels at 1080p (ADR-0003): the floor is a minimum, the ceiling stops small
// scripts rendering oversized labels. Layout runs at the floor, where one layout unit is one rendered pixel, then scales.
const X_HEIGHT = { floor: 16, ceiling: 32 };
const packFile = (pack, file) => path.join(__dirname, 'packs', pack.name, file);
const fontFaces = pack => Object.entries(pack.face.files).map(([weight, file]) =>
  `@font-face{font-family:'${pack.face.family}';font-weight:${weight};src:url(data:font/woff2;base64,${fs.readFileSync(packFile(pack, file)).toString('base64')}) format('woff2')}`).join('');

// Measures each text's width, and the face's x-height, per em in the pack's face in headless Chromium.
async function measure(pack, texts) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${fontFaces(pack)}</style>`);
    return await page.evaluate(async ({ family, texts }) => {
      const ctx = document.createElement('canvas').getContext('2d');
      const width = {};
      for (const [weight, text] of texts) {
        ctx.font = `${weight} 100px '${family}'`;
        if (!(await document.fonts.load(ctx.font, text)).length) throw new Error(`${family} ${weight} did not load`);
        width[`${weight} ${text}`] = ctx.measureText(text).width / 100;
      }
      ctx.font = `400 100px '${family}'`;
      return { width, xHeight: ctx.measureText('x').actualBoundingBoxAscent / 100 };
    }, { family: pack.face.family, texts });
  } finally {
    await browser.close();
  }
}

// Where a segment from a (outside) towards b first meets a circle of radius r about c.
function clipToCircle(a, b, c, r) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const [fx, fy] = [a[0] - c[0], a[1] - c[1]];
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
  const s = (-B - Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
  return [a[0] + s * dx, a[1] + s * dy];
}

const annotations = script => (script.steps ?? []).flatMap((step, s) => step.actions.flatMap((action, a) =>
  action.annotate ? [].concat(action.annotate.target).map(id => ({ key: `${s}.${a}.${id}`, id, text: action.annotate.text })) : []));

// Every element ever revealed is laid out once (ADR-0002), so nothing moves between steps. Layout runs in units of one
// rendered pixel at the x-height floor; every layout size is a multiple of F, so the result scales exactly to any F.
// Groups that share a parent are each laid out by ELK on their own, then packed into rows; ELK lays out the level
// above around the packed block as one fixed-size node (ADR-0003). Each row count is tried, with row breaks no edge
// crosses, and the one giving the largest F within the area above the caption band (ADR-0007) is kept.
async function layout(script, pack) {
  const { groups = [], nodes, edges = [] } = script.graph;
  const L = pack.layout;
  const typeOf = id => pack.node_types[nodes.find(n => n.id === id)?.type] ?? {};
  const weight = look => look.label_weight ?? 400;
  const texts = [
    ...nodes.map(n => [weight(pack.node_types[n.type]), n.label]),
    ...annotations(script).map(n => [400, n.text]),
  ];
  const { width, xHeight } = await measure(pack, texts);
  const textWidth = (w, text, font) => width[`${w} ${text}`] * font;
  const F0 = X_HEIGHT.floor;
  const font0 = F0 / xHeight;
  const line0 = font0 * 1.2;
  const u = v => v * F0;

  // Every card shares one width: the widest label plus its icon and a badge slot.
  const cards = nodes.filter(n => pack.node_types[n.type].shape === 'rect');
  const cardWidth = Math.max(0, ...cards.map(n => textWidth(weight(pack.node_types[n.type]), n.label, font0)))
    + u(2 * L.card_pad_F + L.icon_F + 2 * L.icon_gap_F + L.badge_F);
  // Unconnected parts of one level are spaced as nodes are, not at ELK's fixed default, so state marks that stand out
  // of a card (a pencil corner, a ring) clear the card beside it (#33).
  const spacing = {
    'elk.spacing.nodeNode': String(u(L.node_gap_F)), 'elk.spacing.componentComponent': String(u(L.node_gap_F)),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(u(L.layer_gap_F)),
    'elk.spacing.edgeNode': String(u(L.edge_gap_F)), 'elk.layered.spacing.edgeNodeBetweenLayers': String(u(L.edge_gap_F)),
  };
  const elkNode = n => {
    const look = pack.node_types[n.type];
    if (look.shape !== 'circle') return { id: n.id, width: cardWidth, height: u(L.card_height_F) };
    // The label sits below the circle; ports at the circle's centre height let edge ends be clipped to it.
    const r = u(look.radius_F);
    const w = Math.max(2 * r, textWidth(weight(look), n.label, font0));
    return {
      id: n.id, width: w, height: 2 * r + u(L.label_gap_F) + line0, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [{ id: `${n.id}:in`, x: 0, y: r, width: 0, height: 0 }, { id: `${n.id}:out`, x: w, y: r, width: 0, height: 0 }],
    };
  };
  const end = (id, port) => (typeOf(id).shape === 'circle' ? `${id}:${port}` : id);

  // Containers are group ids, and '' for the root. An edge belongs to the innermost container holding both its ends,
  // and there each end is represented by the child of that container it lies in: a node of its own, or a sibling group.
  const parentOf = Object.fromEntries([...groups.map(g => [g.id, g.parent ?? '']), ...nodes.map(n => [n.id, n.group ?? ''])]);
  const containers = id => (id === '' ? [] : [...containers(parentOf[id]), parentOf[id]]);
  const home = edges.map(e => {
    const [a, b] = [containers(e.from), containers(e.to)];
    let i = 0;
    while (a[i + 1] !== undefined && a[i + 1] === b[i + 1]) i++;
    return { e, at: a[i], from: a[i + 1] ?? e.from, to: b[i + 1] ?? e.to };
  });

  // Siblings are ordered by first reveal, then by the steps that set their state, then by declaration (ADR-0003).
  const stepsOf = (id, verb) => (script.steps ?? []).flatMap((step, s) =>
    (step.actions.some(a => a[verb] && [].concat(a[verb].target ?? a[verb]).includes(id)) ? [s] : []));
  const key = g => [stepsOf(g.id, 'reveal')[0], ...stepsOf(g.id, 'set_state'), Infinity];
  const lexically = (a, b) => { for (let i = 0; ; i++) if (a[i] !== b[i] || a[i] === Infinity) return (a[i] - b[i]) || 0; };
  const kids = Object.groupBy([...groups].sort((a, b) => lexically(key(a), key(b))), g => g.parent ?? '');
  const sibling = C => id => kids[C]?.some(g => g.id === id);

  const within = new Set(home.filter(h => sibling(h.at)(h.from) && sibling(h.at)(h.to)));

  // A row may break after sibling i only if no edge joins a sibling up to i to one after it. The row count is what is
  // searched (#9 rule 2): each count from one to one more than the breaks is tried, per sibling set.
  // ponytail: row counts are multiplied across sibling sets; search each set on its own if a script ever nests many.
  const breaksOf = {};
  let counts = [{}];
  for (const [C, sibs] of Object.entries(kids)) {
    const index = id => sibs.findIndex(g => g.id === id);
    const joined = home.filter(h => h.at === C && within.has(h)).map(h => [index(h.from), index(h.to)].sort((x, y) => x - y));
    breaksOf[C] = sibs.slice(0, -1).map((_, i) => i).filter(i => !joined.some(([lo, hi]) => lo <= i && i < hi));
    counts = counts.flatMap(p => breaksOf[C].concat(0).map((_, i) => ({ ...p, [C]: i + 1 })));
  }
  // For k rows, the one split whose widest row is narrowest: rows of one type share a height, so it gives the largest F.
  // ponytail: siblings of mixed types are split by width alone; weigh their row heights if a script mixes them.
  function rowsOf(C, k, widthOf, gap) {
    const sibs = kids[C], cuts = [-1, ...breaksOf[C], sibs.length - 1];
    const row = (a, b) => sibs.slice(cuts[a] + 1, cuts[b] + 1).map(g => g.id);
    const span = (a, b) => row(a, b).reduce((w, id) => w + widthOf(id) + gap, -gap);
    const memo = new Map();
    const best = (a, k) => {
      if (k === 1) return { w: span(a, cuts.length - 1), at: [] };
      if (!memo.has(`${a} ${k}`)) {
        let pick;
        for (let b = a + 1; b <= cuts.length - k; b++) {
          const rest = best(b, k - 1), w = Math.max(span(a, b), rest.w);
          if (!pick || w < pick.w) pick = { w, at: [b, ...rest.at] };
        }
        memo.set(`${a} ${k}`, pick);
      }
      return memo.get(`${a} ${k}`);
    };
    const at = [0, ...best(0, k).at, cuts.length - 1];
    return at.slice(1).map((b, i) => row(at[i], b));
  }

  const shift = (points, dx, dy) => points.map(([x, y]) => [x + dx, y + dy]);
  // Lays out container C for one choice of row counts, in coordinates relative to C's own box, recording its rows in
  // packing. A group with no sibling groups inside it lays out the same whatever the counts, so it is laid out once.
  const leaves = {};
  async function place(C, count, packing) {
    const boxes = {};
    const routes = {};
    const gap = { x: u(L.layer_gap_F), y: u(L.node_gap_F) };
    const inner = {};
    for (const g of kids[C] ?? []) inner[g.id] = await (kids[g.id] ? place(g.id, count, packing) : (leaves[g.id] ??= place(g.id, count, packing)));
    if (kids[C]) packing[C] = rowsOf(C, count[C], id => inner[id].width, gap.x);
    // Siblings of one type share a height, and share a top within a row; widths stay natural.
    const tall = {};
    for (const g of kids[C] ?? []) tall[g.type] = Math.max(tall[g.type] ?? 0, inner[g.id].height);
    const block = { width: 0, height: 0 };
    for (const row of packing[C] ?? []) {
      let x = 0;
      const y = block.height && block.height + gap.y;
      for (const id of row) {
        const type = groups.find(g => g.id === id).type;
        boxes[id] = { x, y, width: inner[id].width, height: tall[type] };
        for (const [k, b] of Object.entries(inner[id].boxes)) boxes[k] = { ...b, x: b.x + x, y: b.y + y };
        for (const [k, pts] of Object.entries(inner[id].routes)) routes[k] = shift(pts, x, y);
        x += inner[id].width + gap.x;
      }
      block.width = Math.max(block.width, x - gap.x);
      block.height = y + Math.max(...row.map(id => boxes[id].height));
    }
    // Where an edge meets an element inside the block: its circle's centre height, or its box's middle.
    const anchorY = id => boxes[id].y + (typeOf(id).shape === 'circle' ? u(typeOf(id).radius_F) : boxes[id].height / 2);
    // An edge between siblings (they share a row) is drawn through the gap beside its source's sibling.
    // ponytail: a three-segment dog-leg, level with each end, so it can cross a card in the way (Wayfinder has no such
    // edge); route it through an ELK run over the row if a real script draws one badly.
    for (const h of home.filter(h => h.at === C && within.has(h))) {
      const [a, b, S] = [boxes[h.e.from], boxes[h.e.to], boxes[h.from]];
      const ahead = S.x < boxes[h.to].x;
      const xm = ahead ? S.x + S.width + gap.x / 2 : S.x - gap.x / 2;
      routes[h.e.id] = [[ahead ? a.x + a.width : a.x, anchorY(h.e.from)], [xm, anchorY(h.e.from)], [xm, anchorY(h.e.to)], [ahead ? b.x : b.x + b.width, anchorY(h.e.to)]];
    }

    // ELK lays out this level: its own nodes, and the packed block as one fixed-size node whose ports sit level with
    // the elements inside it that edges reach.
    const pad = u(L.group_pad_F);
    const label = groups.find(g => g.id === C)?.label;
    const graph = {
      id: C || ':root', children: nodes.filter(n => parentOf[n.id] === C).map(elkNode), edges: [],
      layoutOptions: {
        'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL', ...spacing,
        ...(C && { 'elk.padding': `[top=${pad + (label ? line0 + pad / 2 : 0)},left=${pad},bottom=${pad},right=${pad}]` }),
      },
    };
    const outside = home.filter(h => h.at === C && !within.has(h));
    if (kids[C]) {
      const ports = outside.flatMap(h => [
        ...(sibling(C)(h.from) ? [{ id: `${h.e.id}:from`, x: block.width, y: anchorY(h.e.from), width: 0, height: 0 }] : []),
        ...(sibling(C)(h.to) ? [{ id: `${h.e.id}:to`, x: 0, y: anchorY(h.e.to), width: 0, height: 0 }] : []),
      ]);
      graph.children.push({ id: ':block', ...block, ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' } });
    }
    for (const h of outside) {
      graph.edges.push({ id: h.e.id, sources: [sibling(C)(h.from) ? `${h.e.id}:from` : end(h.e.from, 'out')], targets: [sibling(C)(h.to) ? `${h.e.id}:to` : end(h.e.to, 'in')] });
    }
    const out = await new ELK().layout(graph);
    const at = out.children.find(c => c.id === ':block');
    if (at) {
      for (const b of Object.values(boxes)) Object.assign(b, { x: b.x + at.x, y: b.y + at.y });
      for (const [k, pts] of Object.entries(routes)) routes[k] = shift(pts, at.x, at.y);
    }
    for (const c of out.children) if (c.id !== ':block') boxes[c.id] = { x: c.x, y: c.y, width: c.width, height: c.height };
    for (const e of out.edges) {
      const h = outside.find(o => o.e.id === e.id);
      const points = e.sections.flatMap((s, i) => [...(i ? [] : [s.startPoint]), ...(s.bendPoints ?? []), s.endPoint]).map(p => [p.x, p.y]);
      // A port on the block's side runs on, level, to the element it stands for.
      // ponytail: the run-on is straight, so it can cross a card between the port and its element; give the element a
      // port of its own in the inner ELK run if a real script draws one badly.
      if (sibling(C)(h.from)) points.unshift([boxes[h.e.from].x + boxes[h.e.from].width, points[0][1]]);
      if (sibling(C)(h.to)) points.push([boxes[h.e.to].x, points.at(-1)[1]]);
      routes[e.id] = points.filter((p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-6);
    }
    return { width: out.width, height: out.height, boxes, routes };
  }

  // The best packing has the largest F; then the fewest rows, so a compact story stays in one row; then the best fit.
  const m = L.margin_px;
  const area = { width: FRAME.width - 2 * m, height: FRAME.height - pack.caption.band_px - 2 * m };
  const tried = [];
  let best;
  for (const count of counts) {
    const packing = {};
    const placed = await place('', count, packing);
    const fit = Math.min(area.width / placed.width, area.height / placed.height);
    const k = Math.min(fit, X_HEIGHT.ceiling / F0);
    const rank = [k, -Object.values(packing).flat().length, fit];
    tried.push({ packing, F: F0 * k });
    const i = rank.findIndex((v, j) => v !== best?.rank[j]);
    if (!best || rank[i] > best.rank[i]) best = { placed, packing, k, rank };
  }

  const { k, placed } = best;
  const dx = (FRAME.width - placed.width * k) / 2;
  const dy = m + (area.height - placed.height * k) / 2;
  const boxes = Object.fromEntries(Object.entries(placed.boxes).map(([id, b]) => [id, { x: b.x * k + dx, y: b.y * k + dy, width: b.width * k, height: b.height * k }]));
  const routes = Object.fromEntries(Object.entries(placed.routes).map(([id, pts]) => [id, pts.map(([x, y]) => [x * k + dx, y * k + dy])]));
  const F = F0 * k;
  const font = font0 * k;
  // ELK ends an edge at a node's box; a circle's edge ends are clipped to its drawn outline, rim included.
  const circle = id => {
    const look = typeOf(id);
    if (look.shape !== 'circle') return null;
    const b = boxes[id];
    return { c: [b.x + b.width / 2, b.y + look.radius_F * F], r: look.radius_F * F + look.stroke_px / 2 };
  };
  for (const e of edges) {
    const points = routes[e.id];
    const [from, to] = [circle(e.from), circle(e.to)];
    if (to) points[points.length - 1] = clipToCircle(points.at(-2), points.at(-1), to.c, to.r);
    if (from) points[0] = clipToCircle(points[1], points[0], from.c, from.r);
  }

  // Annotations are placed outside ELK: the first clear candidate (below, above, right, left, kept inside the
  // margin, clear of every node), else the least-overlapping one.
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const edgeBox = pts => {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  const notes = {};
  for (const n of annotations(script)) {
    const t = boxes[n.id] ?? edgeBox(routes[n.id]);
    const w = textWidth(400, n.text, font) + 2 * L.annotation_pad_F * F;
    const h = L.annotation_height_F * F;
    const gap = L.annotation_gap_F * F;
    const [cx, cy] = [t.x + t.width / 2, t.y + t.height / 2];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const candidates = [
      [cx - w / 2, t.y + t.height + gap, [cx, t.y + t.height]], [cx - w / 2, t.y - h - gap, [cx, t.y]],
      [t.x + t.width + gap, cy - h / 2, [t.x + t.width, cy]], [t.x - w - gap, cy - h / 2, [t.x, cy]],
    ].map(([x, y, anchor]) => ({ x: clamp(x, m, FRAME.width - m - w), y: clamp(y, m, FRAME.height - pack.caption.band_px - m - h), width: w, height: h, anchor }));
    const cost = c => Object.entries(boxes).filter(([id]) => nodes.some(nd => nd.id === id)).reduce((sum, [, b]) => sum + overlap(c, b), 0);
    const best = candidates.find(c => cost(c) === 0) ?? candidates.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    const from = [clamp(best.anchor[0], best.x, best.x + w), clamp(best.anchor[1], best.y, best.y + h)];
    notes[n.key] = { x: best.x, y: best.y, width: w, height: h, text: n.text, leader: [from, best.anchor] };
  }

  const pick = list => Object.fromEntries(list.map(x => [x.id, boxes[x.id]]));
  return {
    pack: pack.name, frame: FRAME, F, font_px: font, packing: best.packing, packings: tried,
    groups: pick(groups), nodes: pick(nodes), edges: Object.fromEntries(edges.map(e => [e.id, { points: routes[e.id] }])), annotations: notes,
  };
}

// A step's actions play in order, each starting when the previous one's animation ends; the step then holds until
// duration_s. Returns one event per action target, and each step's [start, end).
function timeline(script, pack) {
  const events = [];
  const steps = [];
  let start = 0;
  script.steps.forEach((step, s) => {
    let t = start;
    step.actions.forEach((action, a) => {
      const [verb, arg] = Object.entries(action)[0];
      const d = pack.verbs[verb].duration_s;
      const withArgs = verb === 'set_state' || verb === 'annotate';
      for (const id of [].concat(withArgs ? arg.target : arg)) {
        events.push({ verb, id, t0: t, d, step: s, ...(verb === 'set_state' && { state: arg.state }), ...(verb === 'annotate' && { note: `${s}.${a}.${id}` }) });
      }
      t += d;
    });
    steps.push([start, start + step.duration_s]);
    start += step.duration_s;
  });
  return { events, steps, duration_s: start };
}

const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function playerHtml(script, pack, lay) {
  const used = new Set([...Object.values(pack.node_types), ...Object.values(pack.states)].map(look => look.icon).filter(Boolean));
  const icons = Object.fromEntries([...used].map(name =>
    [name, /<svg[^>]*>([\s\S]*)<\/svg>/.exec(fs.readFileSync(packFile(pack, `icons/${name}.svg`), 'utf8'))[1].trim()]));
  const { licences, libraries = [], ...look } = pack;
  const data = {
    title: script.meta.title, frame: FRAME, pack: look, F: lay.F, font_px: lay.font_px, icons,
    groups: (script.graph.groups ?? []).map(g => ({ ...lay.groups[g.id], id: g.id, type: g.type, label: g.label })),
    nodes: script.graph.nodes.map(n => ({ ...lay.nodes[n.id], id: n.id, type: n.type, label: n.label })),
    edges: (script.graph.edges ?? []).map(e => ({ ...lay.edges[e.id], id: e.id, kind: e.kind, from: e.from, to: e.to })),
    annotations: lay.annotations,
    narration: script.steps.map(s => s.narration),
    ...timeline(script, pack),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const tokens = Object.entries(pack.tokens).map(([k, v]) => `--${k}:${v}`).join(';');
  // The pack's bundled assets travel with their notices (#2, #6).
  const notices = licences.map(l => `<!-- ${l.assets} — ${l.licence}\n\n${fs.readFileSync(packFile(pack, l.file), 'utf8').replaceAll('-->', '- ->')}-->`).join('\n');
  // A pack's libraries are npm dependencies, inlined so the page makes no request (#1); their notices are above.
  const scripts = libraries.map(lib => `<script>${fs.readFileSync(require.resolve(lib), 'utf8')}</script>\n`).join('');
  // Procedural paper (#5): static fractal noise in the grain token over the ground, so it never boils.
  const P = pack.paper;
  const grain = P && rgbOf(pack.tokens[P.grain]).map(c => (c / 255).toFixed(4));
  const paper = P ? ` url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${FRAME.width}' height='${FRAME.height}'><filter id='p' x='0' y='0' width='1' height='1'><feTurbulence type='fractalNoise' baseFrequency='${P.frequency}' numOctaves='${P.octaves}' seed='${P.seed}'/><feColorMatrix values='0 0 0 0 ${grain[0]} 0 0 0 0 ${grain[1]} 0 0 0 0 ${grain[2]} 0 0 0 ${P.opacity} 0'/></filter><rect width='100%' height='100%' filter='url(#p)'/></svg>`)}") 0 0/100% 100%` : '';
  return `<!doctype html>
${notices}
<html lang="en"><head><meta charset="utf-8"><title></title>
<style>${fontFaces(pack)}:root{${tokens}}html,body{margin:0;background:var(--${pack.ground})}svg{display:block;width:100%;height:auto}#frame{background:var(--${pack.ground})${paper}}</style>
</head><body>
<svg id="frame" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME.width} ${FRAME.height}"></svg>
${scripts}<script>const DATA=${json};
${fs.readFileSync(path.join(__dirname, 'player.js'), 'utf8')}</script>
${fs.readFileSync(path.join(__dirname, 'controls.html'), 'utf8')}</body></html>
`;
}

// Hands `use` a way to open the player bare at 1920×1080, as capture loads it (ADR-0007), and a scratch directory.
async function withPlayer(html, use) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-player-'));
    fs.writeFileSync(path.join(dir, 'explainer.html'), html);
    return await use(async () => {
      const page = await browser.newPage({ viewport: FRAME });
      await page.goto(`${pathToFileURL(path.join(dir, 'explainer.html')).href}?bare`);
      await page.evaluate(() => document.fonts.ready);
      return page;
    }, dir);
  } finally {
    await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Run in the page: seeks to t and measures what the player draws there. It returns the labels whose x-height is under
// the floor; each pair of boxes that belong to different things and overlap (a node is its outline and label, a group
// its label, an annotation its box, a state mark its own box); each edge that passes through a node other than its two
// ends; and the caption's line count.
function measureFrame({ t, floor }) {
  seek(t);
  const shown = e => { for (; e.id !== 'frame'; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return false; return true; };
  const ctx = document.createElement('canvas').getContext('2d');
  const small = [];
  for (const e of document.querySelectorAll('#frame text:not([data-caption])')) {
    if (!shown(e)) continue;
    const cs = getComputedStyle(e);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const x = ctx.measureText('x').actualBoundingBoxAscent;
    if (x < floor - 0.01) small.push({ text: e.textContent, x });
  }
  const nodes = new Map(DATA.nodes.map(n => [n.id, n]));
  const nodeName = id => `node ${id} ("${nodes.get(id).label}")`;
  const box = (parts, grow = 0) => {
    const b = parts.map(p => p.getBBox());
    return { x: Math.min(...b.map(r => r.x)) - grow, y: Math.min(...b.map(r => r.y)) - grow,
      right: Math.max(...b.map(r => r.x + r.width)) + grow, bottom: Math.max(...b.map(r => r.y + r.height)) + grow };
  };
  const outlineOf = g => g.querySelector(':scope > [data-outline]');
  const boxes = [];
  for (const g of document.querySelectorAll('#frame [data-id], #frame [data-note]')) {
    const label = g.querySelector(':scope > text');
    const id = g.dataset.id;
    const [name, parts] = id === undefined ? [`the annotation "${label.textContent}"`, [g.querySelector(':scope > rect')]]
      : nodes.has(id) ? [nodeName(id), [outlineOf(g), label]]
        : [`group ${id}'s label ("${label?.textContent}")`, label ? [label] : []];
    if (!parts.length || !shown(g)) continue;
    boxes.push({ name, own: g, ...box(parts) });
  }
  // A state mark, its stroke included, against everything but its own element; a ring, which encircles its element by
  // design, is not measured against what lies inside it either (a group's members).
  // A slot fills its element's outline under the body: it is the element's own area, so it is not measured.
  const marks = [];
  for (const m of document.querySelectorAll('#frame [data-mark]')) {
    const look = DATA.pack.states[m.dataset.mark];
    if (!shown(m) || look.mark === 'slot') continue;
    const g = m.closest('[data-id]');
    const whose = nodes.has(g.dataset.id) ? nodeName(g.dataset.id) : `group ${g.dataset.id}`;
    const mark = { name: `${whose}'s ${m.dataset.mark} mark`, own: g, within: look.mark === 'ring' ? box([outlineOf(g)]) : undefined,
      ...box([m], (look.stroke_px ?? 0) / 2) };
    boxes.push(mark);
    if (look.mark !== 'ring') marks.push(mark);
  }
  const inside = (b, w) => w && b.x >= w.x && b.y >= w.y && b.right <= w.right && b.bottom <= w.bottom;
  const overlaps = [];
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => {
    if (a.own === b.own || inside(b, a.within) || inside(a, b.within)) return;
    if (Math.min(a.right, b.right) - Math.max(a.x, b.x) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 0.5) overlaps.push([a.name, b.name]);
  }));
  // Whether a segment enters a box shrunk by half a pixel (Liang–Barsky), so an edge along a border does not count.
  const enters = ([x0, y0], [x1, y1], r) => {
    let [lo, hi] = [0, 1];
    for (const [p, q] of [[x0 - x1, x0 - r.x - 0.5], [x1 - x0, r.right - 0.5 - x0], [y0 - y1, y0 - r.y - 0.5], [y1 - y0, r.bottom - 0.5 - y0]]) {
      if (p === 0) { if (q <= 0) return false; } else if (p < 0) lo = Math.max(lo, q / p); else hi = Math.min(hi, q / p);
    }
    return lo < hi;
  };
  const at = id => document.querySelector(`#frame [data-id="${CSS.escape(id)}"]`);
  const crossings = [];
  for (const e of DATA.edges) {
    if (!shown(at(e.id))) continue;
    const through = r => e.points.slice(1).some((p, k) => enters(e.points[k], p, r));
    // A mark on an edge, its own element's included; a ring meets its element's edges by design, so is not measured.
    for (const m of marks) if (through(m)) overlaps.push([m.name, `edge ${e.id}`]);
    for (const n of DATA.nodes) {
      if (n.id === e.from || n.id === e.to || !shown(at(n.id))) continue;
      if (through(box([outlineOf(at(n.id))]))) crossings.push([e.id, nodeName(n.id)]);
    }
  }
  return { small, overlaps, crossings, lines: document.querySelectorAll('#frame [data-caption] tspan').length };
}

// The check pass (ADR-0004, ADR-0007): at each frame's time, measures the bare player and shoots it as a PNG. A finding
// is reported once, at the first frame that shows it; findings are not ranked.
async function checkPass(html, frames) {
  return withPlayer(html, async open => {
    const page = await open();
    const shots = [];
    const findings = new Map();
    const find = (key, step, check, message) => findings.has(key) || findings.set(key, { step, check, message });
    for (const { step, t } of frames) {
      const m = await page.evaluate(measureFrame, { t, floor: X_HEIGHT.floor });
      shots.push(await page.screenshot({ type: 'png' }));
      for (const l of m.small) find(`x ${l.text}`, step, 'x-height', `"${l.text}" has an x-height of ${l.x.toFixed(1)} px, under the ${X_HEIGHT.floor} px floor`);
      for (const [a, b] of m.overlaps) find(`o ${a} ${b}`, step, 'overlap', `${a} overlaps ${b}`);
      for (const [e, n] of m.crossings) find(`x-ing ${e} ${n}`, step, 'crossing', `edge ${e} passes through ${n}`);
      if (m.lines > 2) find(`c ${step}`, step, 'caption', `the caption wraps to ${m.lines} lines in the pack's face; the band holds two`);
    }
    return { shots, findings: [...findings.values()] };
  });
}

// review.md (ADR-0006): the CLI writes its `## Findings` once, before capture; /explainer-render appends `## Look` after.
const reviewMd = (script, pack, findings) => `# Review: ${script.meta.title}, ${pack.name} pack\n\n## Findings\n\n${findings.length
  ? `| Step | Check | Finding | Status |\n| --- | --- | --- | --- |\n${findings.map(f =>
    `| ${f.step} | ${f.check} | ${f.message.replaceAll('|', '\\|')} | ${f.accepted ? 'accepted' : 'stopped capture'} |\n`).join('')}`
  : 'Nothing to report.\n'}`;

// Captures the player to an MP4 at 1920×1080 and 30 fps (ADR-0001), through the bare page (ADR-0007). The page says
// which frames differ: each distinct frameKey is screenshotted once, through CDP as JPEG q90, over up to `workers` pages
// on disjoint time slices, since seek(t) is pure. ffmpeg's concat demuxer holds each shot for its run, and -frames:v
// fixes the count, final hold included. Each shot is read at 30 fps, not image2's default 25, and the fps filter places
// it: both keep a run's first frame on its own frame number, where -r 30 alone moved step boundaries a frame early. Returns the MP4's bytes and what was captured.
async function capture(html, frames, workers) {
  return withPlayer(html, async (open, dir) => {
    const probe = await open();
    const keys = await probe.evaluate(({ frames, fps }) => Array.from({ length: frames }, (_, f) => frameKey(f / fps)), { frames, fps: FPS });
    await probe.close();
    const first = new Map(); // each distinct key, and the first frame that shows it
    keys.forEach((k, f) => first.has(k) || first.set(k, f));
    const shots = [...first.values()];
    const shot = new Map([...first.keys()].map((k, i) => [k, `${i}.jpg`]));
    const n = Math.min(workers, shots.length);
    const slice = Math.ceil(shots.length / n);
    await Promise.all(Array.from({ length: n }, async (_, w) => {
      const page = await open();
      const cdp = await page.context().newCDPSession(page);
      for (const f of shots.slice(w * slice, (w + 1) * slice)) {
        await page.evaluate(t => seek(t), f / FPS);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true });
        fs.writeFileSync(path.join(dir, shot.get(keys[f])), Buffer.from(data, 'base64'));
      }
    }));
    const runs = [];
    keys.forEach((k, f) => (f && k === keys[f - 1] ? runs.at(-1).count++ : runs.push({ k, count: 1 })));
    fs.writeFileSync(path.join(dir, 'list.txt'), runs.map(r => `file '${shot.get(r.k)}'\noption framerate ${FPS}\nduration ${r.count / FPS}\n`).join('')
      + `file '${shot.get(runs.at(-1).k)}'\noption framerate ${FPS}\n`);
    const ffmpeg = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', `fps=${FPS}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-frames:v', String(frames), 'explainer.mp4'], { cwd: dir, encoding: 'utf8' });
    if (ffmpeg.status !== 0) throw new Error(`ffmpeg: ${ffmpeg.error?.message ?? ffmpeg.stderr}`);
    return { mp4: fs.readFileSync(path.join(dir, 'explainer.mp4')), frames, screenshots: shots.length, workers: n };
  });
}

// h:mm:ss,mmm from seconds.
const stamp = s => new Date(Math.round(s * 1000)).toISOString().slice(11, 23).replace('.', ',');

// One cue per step, timed from step durations (#12); the MP4 burns the same text in (ADR-0007).
const captionsSrt = (script, steps) => steps.map(([from, to], i) => `${i + 1}\n${stamp(from)} --> ${stamp(to)}\n${script.steps[i].narration}\n`).join('\n');

// Every narration line with its citations: each quote and the source it is checked against.
function narrationMd(script, steps) {
  const source = Object.fromEntries(script.sources.map(s => [s.id, s]));
  const where = s => [s.url ?? s.path, s.version && `at ${s.version}`].filter(Boolean).join(' ');
  return `# ${script.meta.title}\n\n${script.steps.map((step, i) => `## Step ${i + 1} · ${+steps[i][0].toFixed(1)}–${+steps[i][1].toFixed(1)} s\n\n${step.narration}\n\n${
    [].concat(step.cite).map(c => `- "${c.quote}" — ${source[c.src].title}\n`).join('')}\n`).join('')}## Sources\n\n${
    script.sources.map(s => `- **${s.id}**: ${s.title}. ${where(s)}\n`).join('')}`;
}

// A redirect, over HTTP or in Chromium, may not lead fetch to a loopback, link-local, private or unspecified address
// (#32). The URL given may: the author typed it.
const INTERNAL = new net.BlockList();
for (const [at, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]]) INTERNAL.addSubnet(at, bits);
for (const [at, bits] of [['::', 128], ['::1', 128], ['fe80::', 10], ['fc00::', 7]]) INTERNAL.addSubnet(at, bits, 'ipv6'); // also covers ::ffff:<IPv4>
// The refusal's reason for a redirect to target, or undefined if every address its host resolves to is public.
// ponytail: checks the name, not the connection; DNS rebinding between this lookup and the connect gets through.
async function refuseRedirect(url, target) {
  const host = new URL(target).hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [host] : await dns.promises.lookup(host, { all: true }).then(all => all.map(a => a.address), () => []);
  const internal = addresses.find(a => INTERNAL.check(a, net.isIP(a) === 6 ? 'ipv6' : 'ipv4'));
  return internal && `fetch ${url}: refused a redirect to ${target} (${internal}), a loopback, link-local, private or unspecified address; nothing written`;
}

// Writes a source's text straight to disk with no model in the path (ADR-0005, ADR-0009):
// HTTP plus pandoc's plain text first, then headless Chromium's innerText; under 100 words either way, it fails.
async function fetchExtract(url, file, report, overwrite) {
  const failed = message => ({ code: 1, report: { ...report, errors: [{ message }] } });
  let html;
  try {
    const signal = AbortSignal.timeout(30000); // over every hop
    let res, at = url;
    for (let hops = 0; [301, 302, 303, 307, 308].includes((res = await fetch(at, { redirect: 'manual', signal })).status) && res.headers.has('location'); hops++) {
      if (hops === 20) return failed(`fetch ${url}: too many redirects, over 20; nothing written`);
      at = new URL(res.headers.get('location'), at).href;
      const refused = await refuseRedirect(url, at);
      if (refused) return failed(refused);
    }
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
    let refused;
    try {
      const page = await browser.newPage();
      // Playwright's routes never see a redirect's hops; Chromium's Fetch domain pauses each one.
      // Every main-frame navigation after the first (a redirect, meta refresh or script) to an internal address fails the fetch;
      // a sub-resource or frame redirected inward is only blocked.
      const cdp = await page.context().newCDPSession(page);
      const mainFrame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
      let navigations = 0;
      cdp.on('Fetch.requestPaused', async ({ requestId, request, redirectedRequestId, resourceType, frameId }) => {
        let reason;
        try {
          const navigation = resourceType === 'Document' && frameId === mainFrame;
          reason = (navigation ? navigations++ : redirectedRequestId) && await refuseRedirect(url, request.url);
          if (navigation && reason) refused ??= reason;
        } catch (e) {
          refused ??= reason = `fetch ${url}: Chromium: ${e.message}`;
        }
        cdp.send(reason ? 'Fetch.failRequest' : 'Fetch.continueRequest', { requestId, ...reason && { errorReason: 'AccessDenied' } }).catch(() => {});
      });
      await cdp.send('Fetch.enable');
      await page.goto(url, { waitUntil: 'commit' });
      // A page that polls never goes network-idle: after 5 s, read what has rendered and let the floor decide.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      text = `${await page.evaluate(() => document.body.innerText)}\n`;
      if (refused) return failed(refused);
    } catch (e) {
      return failed(refused ?? `fetch ${url}: Chromium: ${e.message.split('\n')[0]}`);
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

// workers: the most pages capture uses at once (ADR-0001's knee is four).
async function main(argv, { workers = 4 } = {}) {
  const report = { errors: [], warnings: [], written: [] };
  try {
    return await run(argv, report, workers);
  } catch (e) {
    return { code: 70, report: { ...report, errors: [{ message: String(e) }] } };
  }
}

async function run(argv, report, workers) {
  const draft = argv.includes('--draft');
  const packAt = argv.indexOf('--pack');
  const frameAt = argv.indexOf('--frame');
  const frame = frameAt < 0 ? undefined : String(argv[frameAt + 1]);
  const [command, file, ...rest] = argv.filter((a, i) => !['--draft', '--overwrite', '--accept-findings'].includes(a)
    && ![packAt, frameAt].some(at => at >= 0 && (i === at || i === at + 1)));
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
  if (frame !== undefined && (command !== 'render' || !/^(graph|\d+(,\d+)*)$/.test(frame))) {
    return usage(`render --frame takes graph or a list of steps, such as 1,6,12: --frame ${frame}`);
  }
  if (!fs.existsSync(file)) return usage(`no such script: ${file}`);
  if (!['explainers', 'local-data'].includes(path.basename(path.resolve(file, '../..')))) {
    return usage(`a script must be at <root>/explainers/<slug>/script.yaml, or a draft at <root>/local-data/<slug>/script.draft.yaml: ${file}`);
  }

  // --pack is an installed pack's name, never a path: nothing outside packs/ is loaded or inlined (#32).
  const installed = fs.readdirSync(path.join(__dirname, 'packs')).filter(name => fs.existsSync(packFile({ name }, 'pack.json')));
  if ((command === 'render' || packAt >= 0) && (packAt < 0 || !installed.includes(argv[packAt + 1]))) {
    return usage(`${command} ${command === 'render' ? 'needs' : 'takes'} --pack <name>, one of: ${installed.join(', ')}`);
  }
  const pack = packAt >= 0 ? JSON.parse(fs.readFileSync(packFile({ name: argv[packAt + 1] }, 'pack.json'), 'utf8')) : undefined;

  // --frame takes a draft: Checkpoint 2 renders the graph before any step exists (ADR-0005).
  const { errors, warnings, script } = validate(file, { draft: (command === 'validate' && draft) || frame !== undefined, pack });
  report.warnings = warnings;
  if (errors.length) return { code: 1, report: { ...report, errors } };
  if (command === 'validate') return { code: 0, report };

  const out = path.join(rootOf(file), 'local-data', path.basename(path.dirname(path.resolve(file))), 'render', pack.name);
  const write = (name, content) => {
    const to = path.join(out, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, content);
    report.written.push(to);
  };
  const restOf = ([, end]) => end - 1 / FPS; // a step's last frame (ADR-0004)
  const png = step => `${step === 'graph' ? step : `step-${String(step).padStart(2, '0')}`}.png`;
  const lay = await layout(script, pack);

  if (frame !== undefined) {
    const count = script.steps?.length ?? 0;
    const wanted = frame === 'graph' ? [] : frame.split(',').map(Number);
    const missing = wanted.find(n => n < 1 || n > count);
    if (missing !== undefined) return usage(`--frame ${frame}: the script has ${count} steps, so no step ${missing}`);
    // graph is one step that reveals every declared element at once: no states, no transients, no caption.
    const ids = ['groups', 'nodes', 'edges'].flatMap(k => (script.graph[k] ?? []).map(e => e.id));
    const shown = frame === 'graph' ? { ...script, steps: [{ actions: [{ reveal: ids }], narration: '', duration_s: pack.verbs.reveal.duration_s + 1 }] } : script;
    const spans = timeline(shown, pack).steps;
    const frames = frame === 'graph' ? [{ step: 'graph', t: restOf(spans[0]) }] : wanted.map(n => ({ step: n, t: restOf(spans[n - 1]) }));
    const { shots, findings } = await checkPass(playerHtml(shown, pack, lay), frames);
    report.findings = findings;
    fs.rmSync(path.join(out, 'frames'), { recursive: true, force: true }); // the last --frame run's PNGs, as below
    shots.forEach((shot, i) => write(`frames/${png(frames[i].step)}`, shot));
    return { code: 0, report };
  }

  const html = playerHtml(script, pack, lay);
  const { steps, duration_s } = timeline(script, pack);
  const { shots, findings } = await checkPass(html, steps.map((span, i) => ({ step: i + 1, t: restOf(span) })));
  const accept = argv.includes('--accept-findings');
  report.findings = accept ? findings.map(f => ({ ...f, accepted: true })) : findings;
  // Everything the check pass needs is built before anything is written. Its outputs are written before capture, so the
  // readability look can read the keyframes while capture runs, and review.md is written once (ADR-0004, ADR-0006).
  // The last render's files go first, so none of them sits stale beside this one's.
  for (const name of ['keyframes', 'review.md', 'explainer.mp4', 'captions.srt', 'narration.md']) fs.rmSync(path.join(out, name), { recursive: true, force: true });
  write('layout.json', JSON.stringify(lay, null, 2) + '\n');
  write('explainer.html', html);
  shots.forEach((shot, i) => write(`keyframes/${png(i + 1)}`, shot));
  write('review.md', reviewMd(script, pack, report.findings));
  if (findings.length && !accept) return { code: 3, report };

  const { mp4, ...captured } = await capture(html, Math.round(duration_s * FPS), workers);
  report.capture = captured;
  write('explainer.mp4', mp4);
  write('captions.srt', captionsSrt(script, steps));
  write('narration.md', narrationMd(script, steps));
  return { code: 0, report };
}

module.exports = { main };

if (require.main === module) {
  main(process.argv.slice(2)).then(({ code, report }) => {
    const line = (kind, e) => console.error(`${kind}: ${e.at ? `${e.at}${e.line ? ` (line ${e.line})` : ''}: ` : ''}${e.message}`);
    for (const e of report.errors) line('error', e);
    for (const w of report.warnings) line('warning', w);
    for (const f of report.findings ?? []) console.error(`${f.accepted ? 'accepted finding' : 'finding'}: ${f.step === 'graph' ? 'graph' : `step ${f.step}`}: ${f.check}: ${f.message}`);
    for (const w of report.written) console.error(`wrote ${w}`);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = code;
  });
}
