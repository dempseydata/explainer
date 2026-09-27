// The player: seek(t) draws exactly the frame at t; frameKey(t) changes exactly when its pixels do.
// Inlined into explainer.html after `const DATA = {...}`. Every colour is a pack token, painted as var(--token);
// every size is a rendered pixel (_px) or a multiple of the label x-height F (_F). Each element's group carries
// data-id, and its drawn outline data-outline.
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('frame');
const pack = DATA.pack;
const { F, font_px: FONT } = DATA;
const L = pack.layout;
const paint = token => `var(--${token})`;
const add = (tag, attrs, parent = svg) => {
  const e = parent.appendChild(document.createElementNS(NS, tag));
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
document.title = DATA.title;

const defs = add('defs', {});
add('feGaussianBlur', { stdDeviation: pack.verbs.highlight?.glow_px ?? 0 }, add('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs));
const layers = Object.fromEntries(['groups', 'edges', 'nodes', 'notes'].map(k => [k, add('g', {})]));

const icon = (name, cx, cy, size, colour, parent) => {
  const e = add('svg', {
    x: cx - size / 2, y: cy - size / 2, width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: paint(colour), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, parent);
  e.innerHTML = DATA.icons[name];
  return e;
};
const text = (x, y, content, weight, parent, anchor = 'start') => {
  const e = add('text', {
    x, y, 'text-anchor': anchor, 'dominant-baseline': 'central', 'font-family': pack.face.family,
    'font-size': FONT, 'font-weight': weight, fill: paint(pack.face.text),
  }, parent);
  e.textContent = content;
  return e;
};
// A shape's outline, grown outwards by `grow` rendered pixels.
const outline = (shape, grow, attrs, parent) => (shape.r !== undefined
  ? add('circle', { cx: shape.cx, cy: shape.cy, r: shape.r + grow, ...attrs }, parent)
  : add('rect', { x: shape.x - grow, y: shape.y - grow, width: shape.width + 2 * grow, height: shape.height + 2 * grow, rx: shape.rx + grow, ...attrs }, parent));
const stroked = look => ({
  stroke: paint(look.stroke), 'stroke-width': look.stroke_px, ...(look.dash_px && { 'stroke-dasharray': look.dash_px.join(' ') }),
});

// State marks: a slot fills the outline under the body; a ring surrounds it; a badge sits inside at its right end.
function marks(shape, parent, under) {
  const out = {};
  for (const [state, look] of Object.entries(pack.states)) {
    if (look.mark === 'none' || (look.mark === 'slot') !== under) continue;
    const g = out[state] = add('g', { opacity: 0 }, parent);
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

const elements = {};
const element = (id, layer, centre) => (elements[id] = { g: add('g', { 'data-id': id }, layers[layer]), events: [], centre });

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
  const [a, tip] = pts.slice(-2);
  const len = Math.hypot(tip[0] - a[0], tip[1] - a[1]);
  const [ux, uy] = [(tip[0] - a[0]) / len, (tip[1] - a[1]) / len];
  const [hl, hw] = look.head_px;
  const base = [tip[0] - ux * hl, tip[1] - uy * hl];
  const side = s => `${base[0] - uy * s * hw / 2},${base[1] + ux * s * hw / 2}`;
  if (look.head === 'filled') pts[pts.length - 1] = base; // the line stops under the head, so its end never shows past the tip
  add('polyline', { points: pts.join(' '), fill: 'none', 'stroke-linejoin': 'round', ...stroked(look), 'data-outline': '' }, el.g);
  add('path', look.head === 'filled'
    ? { d: `M${tip} L${side(1)} L${side(-1)} Z`, fill: paint(look.stroke), 'data-head': '' }
    : { d: `M${tip} L${side(1)} M${tip} L${side(-1)}`, fill: 'none', stroke: paint(look.stroke), 'stroke-width': look.stroke_px, 'stroke-linecap': 'round', 'data-head': '' }, el.g);
  el.marks = {};
  el.hl = highlight({ points: e.points }, el.g);
}

for (const n of DATA.nodes) {
  const look = pack.node_types[n.type];
  const circle = look.shape === 'circle';
  const shape = circle
    ? { cx: n.x + n.width / 2, cy: n.y + look.radius_F * F, r: look.radius_F * F }
    : { x: n.x, y: n.y, width: n.width, height: n.height, rx: look.corner_px };
  const el = element(n.id, 'nodes', circle ? [shape.cx, shape.cy] : [n.x + n.width / 2, n.y + n.height / 2]);
  const under = marks(shape, el.g, true);
  outline(shape, 0, { fill: paint(look.fill), ...(look.fill_opacity && { 'fill-opacity': look.fill_opacity }), ...stroked(look), 'data-outline': '' }, el.g);
  if (circle) {
    icon(look.icon, shape.cx, shape.cy, look.icon_F * F, look.icon_colour, el.g);
    text(shape.cx, shape.cy + shape.r + L.label_gap_F * F + FONT * 0.6, n.label, look.label_weight ?? 400, el.g, 'middle');
  } else {
    const iconSize = L.icon_F * F;
    const x = n.x + L.card_pad_F * F;
    icon(look.icon, x + iconSize / 2, n.y + n.height / 2, iconSize, look.icon_colour, el.g);
    text(x + iconSize + L.icon_gap_F * F, n.y + n.height / 2, n.label, look.label_weight ?? 400, el.g);
  }
  el.marks = { ...under, ...marks(shape, el.g, false) };
  el.hl = highlight(shape, el.g);
}

const notes = {};
for (const [key, a] of Object.entries(DATA.annotations)) {
  const look = pack.verbs.annotate;
  const g = notes[key] = add('g', { opacity: 0 }, layers.notes);
  add('line', { x1: a.leader[0][0], y1: a.leader[0][1], x2: a.leader[1][0], y2: a.leader[1][1], fill: 'none', stroke: paint(look.stroke), 'stroke-width': look.stroke_px }, g);
  add('rect', { x: a.x, y: a.y, width: a.width, height: a.height, rx: look.corner_px, fill: paint(look.fill), stroke: paint(look.stroke), 'stroke-width': look.stroke_px }, g);
  text(a.x + L.annotation_pad_F * F, a.y + a.height / 2, a.text, 400, g);
}

DATA.events.forEach((e, i) => elements[e.id].events.push(i));

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

function frameKey(t) {
  return values(t).join(',');
}

function seek(t) {
  const v = values(t);
  const from = pack.verbs.reveal?.scale_from ?? 1;
  for (const el of Object.values(elements)) {
    let opacity = 0, scale = 1, cur, prev, hl;
    for (const i of el.events) {
      const e = DATA.events[i];
      if (e.t0 > t) break;
      if (e.verb === 'reveal') [opacity, scale] = [v[i], v[i] ? from + (1 - from) * v[i] : 1]; // no transform while invisible, so the key holds
      else if (e.verb === 'hide') [opacity, scale] = [1 - v[i], 1];
      else if (e.verb === 'set_state') [prev, cur] = [cur, i];
      else if (e.verb === 'highlight' && v[i] > 0) hl = v[i];
    }
    el.g.setAttribute('opacity', opacity);
    if (el.centre) {
      const [cx, cy] = el.centre;
      el.g.setAttribute('transform', `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
    }
    // set_state crossfades from the previous state's marks to the new one's.
    const now = DATA.events[cur]?.state;
    const before = DATA.events[prev]?.state;
    for (const [state, g] of Object.entries(el.marks)) {
      g.setAttribute('opacity', Math.min(1, (state === now ? v[cur] : 0) + (state === before ? 1 - v[cur] : 0)));
    }
    // The highlight's glow pulses once: it peaks mid-animation and holds at half.
    if (el.hl) {
      el.hl.g.setAttribute('opacity', hl ? Math.min(1, hl * 2) : 0);
      el.hl.glow.setAttribute('opacity', hl ? (hl < 0.5 ? hl * 2 : 1.5 - hl) : 0);
    }
  }
  DATA.events.forEach((e, i) => {
    if (e.verb === 'annotate') notes[e.note].setAttribute('opacity', v[i]);
  });
}

seek(0);
