// The player: seek(t) draws exactly the frame at t; frameKey(t) changes exactly when its pixels do.
// Inlined into explainer.html after the pack's libraries and `const DATA = {...}`. Every colour is a pack token, painted
// as var(--token); every size is a rendered pixel (_px) or a multiple of the label x-height F (_F). Each element's group
// carries data-id, and its outline data-outline; each state mark's group carries data-mark, its state; an edge's line
// carries data-line and its head data-head; each annotation's group carries data-note. A pack with a `rough` block
// (pencil) strokes everything through rough.js from an ideal outline, which is what its data-outline marks, and redraws
// the strokes at each boil tick.
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('frame');
const pack = DATA.pack;
const R = pack.rough;
const { F, font_px: FONT } = DATA;
const L = pack.layout;
const paint = token => `var(--${token})`;
const make = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const add = (tag, attrs, parent = svg) => parent.appendChild(make(tag, attrs));
document.title = DATA.title;

const defs = add('defs', {});
if (pack.verbs.highlight?.glow_px) add('feGaussianBlur', { stdDeviation: pack.verbs.highlight.glow_px }, add('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs));
const layers = Object.fromEntries(['groups', 'edges', 'nodes', 'notes'].map(k => [k, add('g', {})]));

const icon = (name, cx, cy, size, colour, parent) => {
  const e = add('svg', {
    x: cx - size / 2, y: cy - size / 2, width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: paint(colour), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, parent);
  e.innerHTML = DATA.icons[name];
  return e;
};
// Lettering, over a halo of the ground where the pack has one, so it reads over hachure and lines.
const text = (x, y, content, weight, parent, anchor = 'start', colour = pack.face.text) => {
  const e = add('text', {
    x, y, 'text-anchor': anchor, 'dominant-baseline': 'central', 'font-family': pack.face.family,
    'font-size': FONT, 'font-weight': weight, fill: paint(colour),
    ...(pack.face.halo && { stroke: paint(pack.face.halo), 'stroke-width': pack.face.halo_px, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }),
  }, parent);
  e.textContent = content;
  return e;
};
// A shape's outline, grown outwards by `grow` rendered pixels.
const outline = (shape, grow, attrs, parent) => (shape.r !== undefined
  ? add('circle', { cx: shape.cx, cy: shape.cy, r: shape.r + grow, ...attrs }, parent)
  : add('rect', { x: shape.x - grow, y: shape.y - grow, width: shape.width + 2 * grow, height: shape.height + 2 * grow, rx: (shape.rx ?? 0) + grow, ...attrs }, parent));
const stroked = look => ({
  stroke: paint(look.stroke), 'stroke-width': look.stroke_px, ...(look.dash_px && { 'stroke-dasharray': look.dash_px.join(' ') }),
});
const nodeShape = (n, look) => (look.shape === 'circle'
  ? { cx: n.x + n.width / 2, cy: n.y + look.radius_F * F, r: look.radius_F * F }
  : { x: n.x, y: n.y, width: n.width, height: n.height, rx: look.corner_px });
// A node's label, below a circle or right of a card's icon; returns where its icon sits and its size.
function nodeLabel(n, look, shape, g) {
  if (shape.r !== undefined) {
    text(shape.cx, shape.cy + shape.r + L.label_gap_F * F + FONT * 0.6, n.label, look.label_weight ?? 400, g, 'middle');
    return [shape.cx, shape.cy, (look.icon_F ?? look.glyph_F) * F];
  }
  const size = L.icon_F * F;
  const x = n.x + L.card_pad_F * F;
  text(x + size + L.icon_gap_F * F, n.y + n.height / 2, n.label, look.label_weight ?? 400, g);
  return [x + size / 2, n.y + n.height / 2, size];
}

const elements = {};
const element = (id, layer, centre) => (elements[id] = { g: add('g', { 'data-id': id }, layers[layer]), events: [], centre });
const notes = {};

// ---- The standard pack: plain SVG, drawn once ----

// State marks: a slot fills the outline under the body; a ring surrounds it; a badge sits inside at its right end.
function marks(shape, parent, under) {
  const out = {};
  for (const [state, look] of Object.entries(pack.states)) {
    if (look.mark === 'none' || (look.mark === 'slot') !== under) continue;
    const g = out[state] = add('g', { opacity: 0, 'data-mark': state }, parent);
    const cx = shape.cx ?? shape.x + shape.width / 2;
    const cy = shape.cy ?? shape.y + shape.height / 2;
    if (look.mark === 'slot') {
      outline(shape, 0, { fill: paint(look.fill), stroke: 'none' }, g);
      icon(look.icon, cx, cy, look.icon_px, look.icon_colour, g);
    } else if (look.mark === 'ring') {
      outline(shape, look.offset_px, { fill: 'none', ...stroked(look) }, g);
    } else if (look.mark === 'badge') {
      const d = L.badge_F * F;
      const bx = shape.r !== undefined ? cx : shape.x + shape.width - L.card_pad_F * F - d / 2;
      add('circle', { cx: bx, cy, r: d / 2, fill: paint(look.fill) }, g);
      icon(look.icon, bx, cy, d * 0.65, look.icon_colour, g);
    }
  }
  return out;
}
// The highlight: an accent ring and a glow, drawn over the element.
function highlight(shape, parent) {
  const look = pack.verbs.highlight;
  if (!look) return null;
  const g = add('g', { opacity: 0 }, parent);
  const attrs = { fill: 'none', stroke: paint(look.stroke) };
  const glow = shape.points
    ? add('polyline', { points: shape.points.join(' '), ...attrs, 'stroke-width': look.stroke_px * 3, filter: 'url(#glow)' }, g)
    : outline(shape, look.offset_px, { ...attrs, 'stroke-width': look.stroke_px * 2.5, filter: 'url(#glow)' }, g);
  if (shape.points) add('polyline', { points: shape.points.join(' '), ...attrs, 'stroke-width': look.stroke_px }, g);
  else outline(shape, look.offset_px, { ...attrs, 'stroke-width': look.stroke_px }, g);
  return { g, glow };
}

// An arrowhead at the last of `points`: its tip, the base its line stops at under a filled head, and a wing either side.
function arrowhead(points, [hl, hw]) {
  const [a, tip] = points.slice(-2);
  const len = Math.hypot(tip[0] - a[0], tip[1] - a[1]);
  const [ux, uy] = [(tip[0] - a[0]) / len, (tip[1] - a[1]) / len];
  const base = [tip[0] - ux * hl, tip[1] - uy * hl];
  return { tip, base, side: s => [base[0] - uy * s * hw / 2, base[1] + ux * s * hw / 2] };
}

function drawStandard() {
  for (const grp of DATA.groups) {
    const look = pack.group_types[grp.type];
    const shape = { ...grp, rx: look.corner_px };
    const el = element(grp.id, 'groups');
    el.marksUnder = marks(shape, el.g, true);
    outline(shape, 0, { fill: 'none', ...stroked(look), 'data-outline': '' }, el.g);
    if (grp.label) text(grp.x + L.group_pad_F * F, grp.y + L.group_pad_F * F + FONT * 0.6, grp.label, look.label_weight ?? 400, el.g);
    el.marks = { ...el.marksUnder, ...marks(shape, el.g, false) };
    el.hl = highlight(shape, el.g);
  }

  for (const e of DATA.edges) {
    const look = pack.edge_kinds[e.kind];
    const el = element(e.id, 'edges');
    const pts = e.points.map(p => [...p]);
    const { tip, base, side } = arrowhead(pts, look.head_px);
    if (look.head === 'filled') pts[pts.length - 1] = base; // the line stops under the head, so its end never shows past the tip
    add('polyline', { points: pts.join(' '), fill: 'none', 'stroke-linejoin': 'round', ...stroked(look), 'data-outline': '', 'data-line': '' }, el.g);
    add('path', look.head === 'filled'
      ? { d: `M${tip} L${side(1)} L${side(-1)} Z`, fill: paint(look.stroke), 'data-head': '' }
      : { d: `M${tip} L${side(1)} M${tip} L${side(-1)}`, fill: 'none', stroke: paint(look.stroke), 'stroke-width': look.stroke_px, 'stroke-linecap': 'round', 'data-head': '' }, el.g);
    el.marks = {};
    el.hl = highlight({ points: e.points }, el.g);
  }

  for (const n of DATA.nodes) {
    const look = pack.node_types[n.type];
    const shape = nodeShape(n, look);
    const el = element(n.id, 'nodes', shape.r !== undefined ? [shape.cx, shape.cy] : [n.x + n.width / 2, n.y + n.height / 2]);
    const under = marks(shape, el.g, true);
    outline(shape, 0, { fill: paint(look.fill), ...(look.fill_opacity && { 'fill-opacity': look.fill_opacity }), ...stroked(look), 'data-outline': '' }, el.g);
    const [cx, cy, size] = nodeLabel(n, look, shape, el.g);
    icon(look.icon, cx, cy, size, look.icon_colour, el.g);
    el.marks = { ...under, ...marks(shape, el.g, false) };
    el.hl = highlight(shape, el.g);
  }

  for (const [key, a] of Object.entries(DATA.annotations)) {
    const look = pack.verbs.annotate;
    const g = notes[key] = add('g', { opacity: 0, 'data-note': '' }, layers.notes);
    add('line', { x1: a.leader[0][0], y1: a.leader[0][1], x2: a.leader[1][0], y2: a.leader[1][1], fill: 'none', stroke: paint(look.stroke), 'stroke-width': look.stroke_px }, g);
    add('rect', { x: a.x, y: a.y, width: a.width, height: a.height, rx: look.corner_px, fill: paint(look.fill), stroke: paint(look.stroke), 'stroke-width': look.stroke_px }, g);
    text(a.x + L.annotation_pad_F * F, a.y + a.height / 2, a.text, 400, g);
  }
}

// Persistent verbs fade and scale in; set_state crossfades from the previous state's marks; the highlight's glow pulses.
function showStandard(el, { shown, drawn, now, before, v, hl }) {
  const from = pack.verbs.reveal?.scale_from ?? 1;
  el.g.setAttribute('opacity', shown);
  if (el.centre) {
    const [cx, cy] = el.centre;
    const scale = drawn ? from + (1 - from) * drawn : 1; // no transform while invisible, so the key holds
    el.g.setAttribute('transform', `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
  }
  for (const [state, g] of Object.entries(el.marks)) {
    g.setAttribute('opacity', Math.min(1, (state === now ? v : 0) + (state === before ? 1 - v : 0)));
  }
  // The highlight's glow pulses once: it peaks mid-animation and holds at half.
  if (el.hl) {
    el.hl.g.setAttribute('opacity', hl ? Math.min(1, hl * 2) : 0);
    el.hl.glow.setAttribute('opacity', hl ? (hl < 0.5 ? hl * 2 : 1.5 - hl) : 0);
  }
}

// ---- The pencil pack: rough.js strokes over ideal outlines, redrawn at each boil tick (#5) ----

// A sketch is a layer of strokes redrawn at every boil tick, each seeded from its element, its layer and the tick, never
// 0, which rough.js reads as Math.random. Its strokes draw on by their length, together; a dashed sketch is wiped on
// through a clip instead, since a dash-array draw-on would overwrite its dash. Fills fade in over the second half.
const rc = R && rough.svg(svg);
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000003; return h; };
const sketches = [];
function sketch(parent, key, draw, wipe) {
  const s = { g: add('g', {}, parent), key, draw };
  if (wipe) {
    const id = `wipe-${sketches.length}`;
    s.wipe = { id, rect: add('rect', { fill: 'none' }, add('clipPath', { id }, defs)), ...wipe };
  }
  sketches.push(s);
  return s;
}
let boiled;
function boil(tick) {
  if (tick === boiled) return;
  boiled = tick;
  for (const s of sketches) {
    s.g.replaceChildren(...[].concat(s.draw(n => 1 + (hash(`${s.key}:${n}`) * 101 + tick * 7919) % 2 ** 31)));
    if (s.wipe) continue;
    // A dash pattern restarts at each subpath, so each stroke (rough.js draws two per line, and a line per hachure)
    // becomes a path of its own, drawn on by its own length.
    for (const p of s.g.querySelectorAll('path:not([stroke="none"])')) {
      p.replaceWith(...p.getAttribute('d').split(/(?=M)/).map(d => {
        const c = p.cloneNode();
        c.setAttribute('d', d);
        return c;
      }));
    }
    s.paths = [...s.g.querySelectorAll('path')].map(p => [p, p.getAttribute('stroke') === 'none' ? -1 : p.getTotalLength()]);
  }
}
const fade = p => Math.max(0, 2 * p - 1);
function drawOn(s, p) {
  if (s.wipe) {
    // The clip grows across the sketch's box from where it starts: its left, or an edge's tail.
    const { rect, box, dir } = s.wipe;
    const vertical = dir.endsWith('y');
    const [x, w] = vertical ? [box.x, box.width] : [dir === '-x' ? box.x + box.width * (1 - p) : box.x, box.width * p];
    const [y, h] = vertical ? [dir === '-y' ? box.y + box.height * (1 - p) : box.y, box.height * p] : [box.y, box.height];
    Object.entries({ x, y, width: w, height: h }).forEach(([k, val]) => rect.setAttribute(k, val));
    if (p < 1) s.g.setAttribute('clip-path', `url(#${s.wipe.id})`);
    else s.g.removeAttribute('clip-path');
    return;
  }
  for (const [path, len] of s.paths) {
    if (len < 0) path.style.opacity = p < 1 ? fade(p) : '';
    else {
      path.style.strokeDasharray = p < 1 ? `${len} ${len}` : '';
      path.style.strokeDashoffset = p < 1 ? len * (1 - p) : '';
    }
  }
}

const roughly = (look, seed, more) => ({
  seed, stroke: paint(look.stroke), strokeWidth: look.stroke_px, roughness: look.roughness ?? R.roughness,
  ...(look.dash_px && { strokeLineDash: look.dash_px }), ...more,
});
// A shape's rough outline, grown outwards by `grow` rendered pixels.
const roughOutline = (shape, grow, o) => (shape.r !== undefined
  ? rc.ellipse(shape.cx, shape.cy, 2 * (shape.r + grow), 2 * (shape.r + grow), o)
  : rc.rectangle(shape.x - grow, shape.y - grow, shape.width + 2 * grow, shape.height + 2 * grow, o));
const boxOf = shape => (shape.r !== undefined ? { x: shape.cx - shape.r, y: shape.cy - shape.r, width: 2 * shape.r, height: 2 * shape.r } : shape);
const grown = (b, d) => ({ x: b.x - d, y: b.y - d, width: b.width + 2 * d, height: b.height + 2 * d });
// A glyph, our own geometry in a 48-unit box, stroked in graphite at the pack's glyph weight.
function glyph(name, cx, cy, size, seed, stroke = pack.face.text) {
  const k = size / 48;
  const g = make('g', { transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${k})` });
  pack.glyphs[name].forEach((part, i) => g.appendChild(rc.path(part.d, {
    seed: seed(i), stroke: paint(stroke), strokeWidth: R.glyph_px / k, roughness: R.roughness,
    ...(part.fill && { fill: paint(part.fill), fillStyle: 'hachure', hachureGap: R.glyph_hachure_gap_u, fillWeight: R.glyph_hachure_u }),
  })));
  return g;
}
// A rough line through points, ending in a head at the last one. Its vertices are kept, so its ends never boil.
function arrow(points, look, seed) {
  const o = roughly(look, seed(0), { preserveVertices: true });
  const pts = points.map(p => [...p]);
  const { tip, base, side } = arrowhead(pts, look.head_px);
  if (look.head === 'filled') pts[pts.length - 1] = base;
  const line = rc.linearPath(pts, o);
  line.firstChild.setAttribute('data-line', '');
  const bare = { ...o, strokeLineDash: undefined };
  const head = look.head === 'filled'
    ? [make('path', { d: `M${tip} L${side(1)} L${side(-1)} Z`, fill: paint(look.stroke), stroke: 'none' }), rc.polygon([tip, side(1), side(-1)], { ...bare, seed: seed(1) })]
    : [rc.linearPath([tip, side(1)], { ...bare, seed: seed(1) }), rc.linearPath([tip, side(-1)], { ...bare, seed: seed(2) })];
  (head[0].tagName === 'path' ? head[0] : head[0].firstChild).setAttribute('data-head', '');
  return [line, ...head];
}

function drawPencil() {
  const ideal = (look, attrs) => ({ fill: 'none', stroke: 'none', 'stroke-width': look.stroke_px, 'data-outline': '', ...attrs });
  // The state marks: a graphite re-trace around the outline, a glyph in a circle at its top-right corner, or a glyph in
  // the badge slot at its right end.
  const sketchMarks = (el, shape, inset) => {
    el.marks = {};
    for (const [state, look] of Object.entries(pack.states)) {
      if (look.mark === 'none') continue;
      const m = el.marks[state] = { g: add('g', { opacity: 0, 'data-mark': state }, el.g) };
      const key = `${el.g.dataset.id}:${state}`;
      if (look.mark === 'ring') m.part = sketch(m.g, key, seed => roughOutline(shape, look.offset_px, roughly(look, seed(0))));
      else if (look.mark === 'corner') {
        // On a card it is inset by its radius, to sit over the right end of the top edge, clear of the edges that bend
        // beside the card (#33); on a group it centres on the corner, clear of the member card inside it.
        const d = look.size_F * F;
        const [cx, cy] = shape.r !== undefined ? [shape.cx + shape.r * Math.SQRT1_2, shape.cy - shape.r * Math.SQRT1_2] : [shape.x + shape.width - inset * d, shape.y];
        m.part = sketch(m.g, key, seed => [rc.circle(cx, cy, d, roughly(look, seed(0), { fill: paint(look.fill), fillStyle: 'solid' })), glyph(look.glyph, cx, cy, look.glyph_F * F, n => seed(n + 1), look.stroke)]);
      } else if (look.mark === 'badge') {
        const d = L.badge_F * F;
        const [bx, by] = shape.r !== undefined ? [shape.cx, shape.cy] : [shape.x + shape.width - L.card_pad_F * F - d / 2, shape.y + shape.height / 2];
        m.part = sketch(m.g, key, seed => glyph(look.glyph, bx, by, d, seed, look.stroke));
      }
    }
  };
  const hlLook = pack.verbs.highlight;
  const sketchHighlight = (el, draw) => {
    const g = add('g', { opacity: 0 }, el.g);
    el.hl = { g, part: sketch(g, `${el.g.dataset.id}:hl`, seed => draw(roughly(hlLook, seed(0)))) };
  };

  for (const grp of DATA.groups) {
    const look = pack.group_types[grp.type];
    const el = element(grp.id, 'groups');
    outline(grp, 0, ideal(look), el.g);
    const d = look.double_px;
    el.body = [sketch(el.g, `${grp.id}:body`, seed => [
      rc.rectangle(grp.x, grp.y, grp.width, grp.height, roughly(look, seed(0))),
      ...(d ? [rc.rectangle(grp.x + d, grp.y + d, grp.width - 2 * d, grp.height - 2 * d, roughly(look, seed(1), { strokeWidth: look.stroke_px / 2 }))] : []),
    ], look.dash_px && { box: grown(grp, R.wipe_pad_px), dir: 'x' })];
    el.fades = grp.label ? [text(grp.x + L.group_pad_F * F, grp.y + L.group_pad_F * F + FONT * 0.6, grp.label, look.label_weight ?? 400, el.g)] : [];
    sketchMarks(el, grp, 0);
    // A group's highlight re-traces its frame.
    sketchHighlight(el, o => roughOutline(grp, hlLook.offset_px, o));
  }

  for (const e of DATA.edges) {
    const look = pack.edge_kinds[e.kind];
    const el = element(e.id, 'edges');
    add('polyline', ideal(look, { points: e.points.join(' ') }), el.g);
    const [first, last] = [e.points[0], e.points.at(-1)];
    const [dx, dy] = [last[0] - first[0], last[1] - first[1]];
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? '-x' : 'x') : (dy < 0 ? '-y' : 'y');
    const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    el.body = [sketch(el.g, `${e.id}:body`, seed => arrow(e.points, look, seed), look.dash_px && { box: grown(box, R.wipe_pad_px), dir })];
    el.fades = [];
    el.marks = {};
    sketchHighlight(el, o => rc.linearPath(e.points, o));
  }

  for (const n of DATA.nodes) {
    const look = pack.node_types[n.type];
    const shape = nodeShape(n, look);
    const el = element(n.id, 'nodes');
    outline(shape, 0, ideal(look), el.g);
    const fill = look.hachure && { fill: paint(look.hachure), fillStyle: 'hachure', hachureGap: R.hachure_gap_px, fillWeight: R.hachure_px };
    el.body = [sketch(el.g, `${n.id}:body`, seed => roughOutline(shape, 0, roughly(look, seed(0), fill)), look.dash_px && { box: grown(boxOf(shape), R.wipe_pad_px), dir: 'x' })];
    const glyphAt = add('g', {}, el.g);
    const [cx, cy, size] = nodeLabel(n, look, shape, el.g);
    sketch(glyphAt, `${n.id}:glyph`, seed => glyph(look.glyph, cx, cy, size, seed));
    el.fades = [glyphAt, el.g.lastChild];
    sketchMarks(el, shape, 1 / 2);
    // A node's highlight is a scribbled ellipse around it, clear of a circle's label.
    const b = boxOf(shape);
    const off = hlLook.offset_px;
    const [kw, kh] = shape.r !== undefined ? hlLook.ellipse_circle_box : hlLook.ellipse_box;
    const [w, h] = [b.width * kw, b.height * kh];
    sketchHighlight(el, o => rc.ellipse(b.x + b.width / 2, b.y + b.height / 2, w + 2 * off, h + 2 * off, o));
  }

  // An annotation is accent lettering on a patch of paper, with a hand-drawn arrow to its target.
  for (const [key, a] of Object.entries(DATA.annotations)) {
    const look = pack.verbs.annotate;
    const g = add('g', { opacity: 0, 'data-note': '' }, layers.notes);
    add('rect', { x: a.x, y: a.y, width: a.width, height: a.height, fill: paint(pack.ground), stroke: 'none' }, g);
    const label = text(a.x + L.annotation_pad_F * F, a.y + a.height / 2, a.text, 400, g, 'start', look.text);
    notes[key] = { g, label, arrow: sketch(g, `${key}:note`, seed => arrow(a.leader, { ...look, head: 'open' }, seed)) };
  }
}

// Strokes draw on and lettering fades in over the second half of a reveal; a hide fades out; a new state's mark draws
// on while the previous one fades; a highlight draws on.
function showPencil(el, { shown, drawn, now, before, v, hl }) {
  el.g.setAttribute('opacity', drawn < 1 ? Math.ceil(drawn) : shown);
  el.body.forEach(s => drawOn(s, drawn));
  el.fades.forEach(e => e.setAttribute('opacity', fade(drawn)));
  for (const [state, m] of Object.entries(el.marks)) {
    m.g.setAttribute('opacity', state === now ? Math.ceil(v) : state === before ? 1 - v : 0);
    drawOn(m.part, state === now ? v : 1);
  }
  el.hl.g.setAttribute('opacity', hl ? 1 : 0);
  drawOn(el.hl.part, hl ?? 0);
}

if (R) drawPencil();
else drawStandard();

DATA.events.forEach((e, i) => elements[e.id].events.push(i));

// The caption band (ADR-0007): the current step's narration, centred in the band at the frame's foot, in the pack's
// face. Wrapped greedily to the frame's width less its margins, measured in the face; the check pass reports a third line.
const C = pack.caption;
const caption = add('text', {
  'data-caption': '', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': pack.face.family,
  'font-size': C.font_px, 'font-weight': C.weight, fill: paint(pack.face.text),
});
function setCaption(words) {
  caption.textContent = '';
  const probe = add('tspan', {}, caption);
  const lines = [''];
  for (const w of words.split(' ')) {
    const line = lines.at(-1) ? `${lines.at(-1)} ${w}` : w;
    probe.textContent = line;
    if (lines.at(-1) && probe.getComputedTextLength() > DATA.frame.width - 2 * L.margin_px) lines.push(w);
    else lines[lines.length - 1] = line;
  }
  caption.textContent = '';
  const top = DATA.frame.height - C.band_px / 2 - (lines.length - 1) * C.line_px / 2;
  lines.forEach((line, k) => { add('tspan', { x: DATA.frame.width / 2, y: top + k * C.line_px }, caption).textContent = line; });
}

// Each event's drawn value at t, quantised so the key and the drawing agree. Persistent verbs ease out and hold;
// transient ones (highlight, annotate) hold only through their own step.
const ease = p => 1 - (1 - p) ** 3;
const q = v => Math.round(v * 100) / 100;
const stepAt = t => {
  const s = DATA.steps.findIndex(([, end]) => t < end);
  return s < 0 ? DATA.steps.length - 1 : s;
};
function values(t) {
  const step = stepAt(t);
  return DATA.events.map(e => {
    const p = Math.min(1, Math.max(0, (t - e.t0) / e.d));
    if (e.verb === 'highlight') return e.step === step ? q(p) : 0;
    if (e.verb === 'annotate') return e.step === step ? q(ease(p)) : 0;
    return q(ease(p));
  });
}
// An element at t: how far shown and how far drawn (a reveal's progress; 1 once hidden), its state now and before, the
// progress into that state, and its highlight.
function stateOf(el, t, v) {
  let shown = 0, drawn = 1, cur, prev, hl;
  for (const i of el.events) {
    const e = DATA.events[i];
    if (e.t0 > t) break;
    if (e.verb === 'reveal') [shown, drawn] = [v[i], v[i]];
    else if (e.verb === 'hide') [shown, drawn] = [1 - v[i], 1];
    else if (e.verb === 'set_state') [prev, cur] = [cur, i];
    else if (e.verb === 'highlight' && v[i] > 0) hl = v[i];
  }
  return { shown, drawn, now: DATA.events[cur]?.state, before: DATA.events[prev]?.state, v: v[cur] ?? 0, hl };
}
// The boil tick; a hair over, so a tick that starts on a frame is not lost to rounding.
const tickAt = t => Math.floor(t * R.boil_fps + 1e-6);

// The caption changes only at a step boundary, so the step term covers it. In a pack that boils, the tick changes the
// pixels whenever anything is shown.
function frameKey(t) {
  const v = values(t);
  const key = `${stepAt(t)}|${v.join(',')}`;
  if (!R) return key;
  const boiling = Object.values(elements).some(el => stateOf(el, t, v).shown > 0) || DATA.events.some((e, i) => e.verb === 'annotate' && v[i] > 0);
  return boiling ? `${key}|${tickAt(t)}` : key;
}

function seek(t) {
  const v = values(t);
  setCaption(DATA.narration[stepAt(t)]);
  if (R) boil(tickAt(t));
  for (const el of Object.values(elements)) (R ? showPencil : showStandard)(el, stateOf(el, t, v));
  DATA.events.forEach((e, i) => {
    if (e.verb !== 'annotate') return;
    if (!R) return notes[e.note].setAttribute('opacity', v[i]);
    const n = notes[e.note];
    n.g.setAttribute('opacity', Math.ceil(v[i]));
    n.label.setAttribute('opacity', Math.min(1, 2 * v[i]));
    drawOn(n.arrow, v[i]);
  });
}

seek(0);
