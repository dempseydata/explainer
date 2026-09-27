// The player: seek(t) draws exactly the frame at t; frameKey(t) changes exactly when its pixels do.
// Inlined into explainer.html after `const DATA = {...}`.
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('frame');
const pack = DATA.pack;
const add = (tag, attrs, parent = svg) => {
  const e = parent.appendChild(document.createElementNS(NS, tag));
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
document.title = DATA.title;

const defs = add('defs', {});
for (const [kind, v] of Object.entries(pack.edge_kinds)) {
  const m = add('marker', { id: `arrow-${kind}`, viewBox: '0 0 10 10', refX: 10, refY: 5, markerUnits: 'userSpaceOnUse', markerWidth: pack.arrow_px, markerHeight: pack.arrow_px, orient: 'auto' }, defs);
  add('path', { d: 'M0,0L10,5L0,10z', fill: `var(--${v.stroke})` }, m);
}

const elements = {};
for (const e of DATA.edges) {
  elements[e.id] = add('polyline', {
    points: e.points.join(' '), fill: 'none', stroke: `var(--${pack.edge_kinds[e.kind].stroke})`,
    'stroke-width': pack.stroke_px, 'marker-end': `url(#arrow-${e.kind})`,
  });
}
for (const n of DATA.nodes) {
  const look = pack.node_types[n.type];
  const g = elements[n.id] = add('g', {});
  add('rect', { x: n.x, y: n.y, width: n.width, height: n.height, rx: pack.corner_px, fill: `var(--${look.fill})`, stroke: `var(--${look.stroke})`, 'stroke-width': pack.stroke_px }, g);
  add('text', {
    x: n.x + n.width / 2, y: n.y + n.height / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-family': pack.face, 'font-size': pack.label_px, fill: `var(--${look.text})`,
  }, g).textContent = n.label;
}

// Each element's reveal progress at t, quantised so the key and the drawing agree.
const ids = Object.keys(elements);
const state = t => ids.map(id => {
  const r = DATA.reveal[id];
  if (!r) return 0;
  return Math.round(Math.min(1, Math.max(0, (t - r[0]) / (r[1] - r[0]))) * 1000) / 1000;
});

function frameKey(t) {
  return state(t).join(',');
}

function seek(t) {
  state(t).forEach((p, i) => elements[ids[i]].setAttribute('opacity', p));
}

seek(0);
