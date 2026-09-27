// PROTOTYPE — standard-pack look (#6). Lays out every element ever revealed with ELK, writes model.json for the player.
// Usage: node layout.mjs [--order]   (--order adds layout-only edges that put fog patches in the order they clear)
import ELK from 'elkjs/lib/elk.bundled.js';
import { parse } from 'yaml';
import { readFile, writeFile } from 'node:fs/promises';

const S = parse(await readFile('script.yaml', 'utf8'));
const ORDER = process.argv.includes('--order');
const DIR = process.argv.find(a => a.startsWith('--dir='))?.slice(6) || 'RIGHT';
// Card widths are an input: label width depends on font size, which depends on the scale ELK's width forces (a fixed point).
const arg = (k, d) => +(process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const TICKET = { width: arg('ticket', 244), height: 92 }, SMALL = { width: arg('small', 210), height: 92 }, GOAL = { width: 240, height: 180 };
const size = n => n.type === 'goal' ? GOAL : n.type.startsWith('ticket.') ? TICKET : SMALL;

const ids = arr => [].concat(arr);
const box = {};                                     // id -> elk node
const mk = (id, extra) => (box[id] = { id, children: [], ...extra });
const groupPad = g => g.type === 'map' ? '[top=78,left=24,bottom=24,right=24]' : '[top=24,left=24,bottom=24,right=24]';
const SPACING = { 'elk.spacing.nodeNode': '32', 'elk.layered.spacing.nodeNodeBetweenLayers': '56', 'elk.spacing.edgeNode': '24' };
// ELK reads spacing from each node's own parent, so compound groups need it too.
for (const g of S.graph.groups) mk(g.id, { layoutOptions: { 'elk.padding': groupPad(g), ...SPACING } });
for (const n of S.graph.nodes) mk(n.id, size(n));
const root = { id: 'root', layoutOptions: {
  'elk.algorithm': 'layered', 'elk.direction': DIR, 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL', ...SPACING, 'elk.json.shapeCoords': 'ROOT', 'elk.json.edgeCoords': 'ROOT',
}, children: [], edges: [] };
for (const x of [...S.graph.groups, ...S.graph.nodes]) (x.parent || x.group ? box[x.parent || x.group].children : root.children).push(box[x.id]);
for (const e of S.graph.edges) root.edges.push({ id: e.id, sources: [e.from], targets: [e.to] });

// First step at which each group clears; used only by --order.
const clearsAt = {};
S.steps.forEach((s, i) => s.actions.forEach(a => a.set_state?.state === 'clear' && ids(a.set_state.target).forEach(t => clearsAt[t] ??= i)));
if (ORDER) {
  const patches = S.graph.groups.filter(g => g.type === 'fog').sort((a, b) => clearsAt[a.id] - clearsAt[b.id]);
  patches.slice(1).forEach((g, i) => root.edges.push({ id: `order${i}`, sources: [patches[i].id], targets: [g.id], layoutOnly: true }));
}

const out = await new ELK().layout(root);
const flat = {};
(function walk(n) { for (const c of n.children || []) { flat[c.id] = { x: c.x, y: c.y, w: c.width, h: c.height }; walk(c); } })(out);
const route = {};
for (const e of out.edges) if (!e.layoutOnly) route[e.id] = e.sections.flatMap((s, i) => [...(i ? [] : [[s.startPoint.x, s.startPoint.y]]), ...(s.bendPoints || []).map(p => [p.x, p.y]), [s.endPoint.x, s.endPoint.y]]);

// Sibling groups of one type share a top and bottom, so empty fog patches read as a row of equal slots, not their children's shapes.
const byParent = {};
for (const g of S.graph.groups) (byParent[`${g.parent}:${g.type}`] ||= []).push(flat[g.id]);
for (const sibs of Object.values(byParent)) if (sibs.length > 1) {
  const top = Math.min(...sibs.map(b => b.y)), bot = Math.max(...sibs.map(b => b.y + b.h));
  for (const b of sibs) { b.y = top; b.h = bot - top; }
}
const model = {
  size: { w: out.width, h: out.height },
  groups: S.graph.groups.map(g => ({ ...g, ...flat[g.id], cite: undefined })),
  nodes: S.graph.nodes.map(n => ({ ...n, ...flat[n.id], cite: undefined })),
  edges: S.graph.edges.map(e => ({ ...e, pts: route[e.id], cite: undefined })),
  steps: S.steps.map(s => ({ d: s.duration_s, a: s.actions, narration: s.narration })),
};
await writeFile('model.json', JSON.stringify(model, null, 1));
console.log(`layout ${DIR} ${Math.round(out.width)}×${Math.round(out.height)}${ORDER ? ' (patches ordered)' : ''}, fits 1920×1080 at ×${Math.min(1840 / out.width, 1000 / out.height).toFixed(2)}`);
for (const g of model.groups) console.log(` ${g.id.padEnd(4)} x=${Math.round(g.x)} y=${Math.round(g.y)} ${Math.round(g.w)}×${Math.round(g.h)}`);
for (const n of model.nodes) console.log(` ${n.id.padEnd(4)} x=${Math.round(n.x)} y=${Math.round(n.y)}`);
