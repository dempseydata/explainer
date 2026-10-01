// Layout (#19, ADR-0003, ADR-0007), tested by property through the files render writes: layout.json and explainer.html.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');
const { main } = require('../cli.js');
const { lanes, writeScript } = require('./scripts.js');

// Layout is judged by its properties whatever the check pass finds (check.test.js tests that), so findings are accepted:
// four chained lanes cannot wrap, and their labels sit under the x-height floor. Nothing here needs the MP4, so the render
// stops before capture (ADR-0015), and tests that lay out the same script share its render.
const renders = new Map();
function render(yaml) {
  if (!renders.has(yaml)) renders.set(yaml, (async () => {
    const file = writeScript(yaml);
    const { code, report } = await main(['render', file, '--pack', 'standard', '--accept-findings'], { capture: false });
    assert.equal(code, 0, JSON.stringify(report.errors));
    return { script: parse(yaml), lay: JSON.parse(fs.readFileSync(report.written.find(p => p.endsWith('layout.json')), 'utf8')) };
  })());
  return renders.get(yaml);
}

// Each edge whose ends sit under different siblings of one packed parent, with those siblings in different rows.
function crossings(script, lay) {
  const parent = Object.fromEntries([...script.graph.groups.map(g => [g.id, g.parent]), ...script.graph.nodes.map(n => [n.id, n.group])]);
  return Object.values(lay.packing).flatMap(rows => {
    const row = Object.fromEntries(rows.flatMap((r, i) => r.map(id => [id, i])));
    const sibling = id => { for (let x = id; x !== undefined; x = parent[x]) if (x in row) return x; };
    return script.graph.edges.filter(e => {
      const [a, b] = [sibling(e.from), sibling(e.to)];
      return a !== undefined && b !== undefined && row[a] !== row[b];
    }).map(e => e.id);
  });
}
// The siblings in reading order: by row top, then left to right.
const readingOrder = (lay, ids) => [...ids].sort((a, b) => lay.groups[a].y - lay.groups[b].y || lay.groups[a].x - lay.groups[b].x);
const lanesOf = n => [...Array(n).keys()].map(i => `lane${i}`);

test('sibling groups appear in first-reveal order, whatever order they are declared in', async () => {
  const { lay } = await render(lanes(4, { declared: [2, 0, 3, 1] }));
  assert.deepEqual(lay.packing.board.flat(), lanesOf(4));
  assert.deepEqual(readingOrder(lay, lanesOf(4)), lanesOf(4));
});

test('unconnected siblings wrap; a script whose siblings are all connected stays in one row', async () => {
  const free = await render(lanes(4));
  assert.ok(free.lay.packing.board.length > 1, JSON.stringify(free.lay.packing));
  const chained = await render(lanes(4, { declared: [3, 1, 0, 2], links: [[0, 1], [1, 2], [2, 3]] }));
  assert.deepEqual(chained.lay.packing.board, [lanesOf(4)]);
  assert.deepEqual(crossings(chained.script, chained.lay), []);
});

test('no row break is crossed by an edge, even where breaking there would give larger labels', async () => {
  const free = await render(lanes(4));
  const linked = await render(lanes(4, { links: [[1, 2]] }));
  assert.ok(linked.lay.packing.board.length > 1, 'it still wraps');
  assert.deepEqual(crossings(linked.script, linked.lay), []);
  assert.ok(linked.lay.F <= free.lay.F);
  // The link is drawn: its route runs from lane 1's last card to lane 2's first.
  assert.ok(linked.lay.edges.l12.points.length >= 2);
});

test('the chosen packing is the one with the largest label x-height, and each packing tried is recorded', async () => {
  const { lay } = await render(lanes(4));
  assert.ok(lay.packings.length > 1);
  assert.equal(lay.F, Math.max(...lay.packings.map(p => p.F)));
  assert.deepEqual(lay.packings.find(p => p.F === lay.F).packing, lay.packing);
  for (const p of lay.packings) assert.deepEqual(p.packing.board.flat(), lanesOf(4), 'every packing keeps reading order');
});

test('the packing search is bounded: ten siblings lay out in seconds, one packing tried per row count', async () => {
  const started = Date.now();
  const { lay } = await render(lanes(10));
  const seconds = (Date.now() - started) / 1000;
  assert.ok(seconds < 20, `${seconds} s`);
  assert.ok(lay.packings.length <= 10, `${lay.packings.length} packings tried`);
  assert.deepEqual(new Set(lay.packings.map(p => p.packing.board.length)).size, lay.packings.length, 'one per row count');
});

test('siblings of one type share a height, and share a top within a row', async () => {
  const { lay } = await render(lanes(4, { links: [[1, 2]] }));
  const heights = new Set(lanesOf(4).map(id => lay.groups[id].height));
  assert.equal(heights.size, 1);
  for (const row of lay.packing.board) assert.equal(new Set(row.map(id => lay.groups[id].y)).size, 1, `row ${row} shares a top`);
});

test('a small script\'s labels stop at the x-height ceiling, and nothing is laid out in the caption band', async () => {
  const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/standard/pack.json'), 'utf8'));
  assert.equal((await render(lanes(2))).lay.F, 32);
  for (const yaml of [lanes(2), lanes(4), lanes(4, { links: [[1, 2]] })]) {
    const { lay } = await render(yaml);
    assert.ok(lay.F >= 16 && lay.F <= 32, `F ${lay.F}`);
    const boxes = [...Object.values(lay.groups), ...Object.values(lay.nodes), ...Object.values(lay.annotations)];
    for (const b of boxes) assert.ok(b.y + b.height <= lay.frame.height - pack.caption.band_px, JSON.stringify(b));
    for (const e of Object.values(lay.edges)) for (const [, y] of e.points) assert.ok(y <= lay.frame.height - pack.caption.band_px);
  }
});

test('render never reads layout.json back: a stale or corrupt one changes nothing', async () => {
  const file = writeScript(lanes(3));
  const first = await main(['render', file, '--pack', 'standard']);
  const read = () => first.report.written.map(p => fs.readFileSync(p, 'utf8'));
  const fresh = read();
  const layoutFile = first.report.written.find(p => p.endsWith('layout.json'));
  for (const junk of ['not json', JSON.stringify({ F: 99, packing: { board: [['lane2'], ['lane0', 'lane1']] }, groups: {}, nodes: {} })]) {
    fs.writeFileSync(layoutFile, junk);
    const again = await main(['render', file, '--pack', 'standard']);
    assert.equal(again.code, 0);
    assert.deepEqual(read(), fresh);
  }
});
