// Seam 1: the render CLI's commands — exit code, machine-readable report, files written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { main } = require('../cli.js');
const { writeScript, TWO_NODE } = require('./scripts.js');

test('validate passes the two-node script and exits zero', async () => {
  const { code, report } = await main(['validate', writeScript(TWO_NODE)]);
  assert.equal(code, 0);
  assert.deepEqual(report.errors, []);
});

test('validate fails an unresolved edge end with a located error', async () => {
  const broken = TWO_NODE.replace('to: review', 'to: reveiw');
  const { code, report } = await main(['validate', writeScript(broken)]);
  assert.equal(code, 1);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].at, 'graph.edges[0].to');
  assert.equal(report.errors[0].line, 21);
  assert.match(report.errors[0].message, /reveiw/);
});

test('render writes explainer.html and layout.json in the standard pack', async () => {
  const script = writeScript(TWO_NODE);
  const { code, report } = await main(['render', script, '--pack', 'standard']);
  assert.equal(code, 0);
  const out = path.join(path.dirname(script), '../../local-data/two-node/standard');
  assert.deepEqual(report.written.sort(), [path.join(out, 'explainer.html'), path.join(out, 'layout.json')]);
  const layout = JSON.parse(fs.readFileSync(path.join(out, 'layout.json'), 'utf8'));
  assert.deepEqual(Object.keys(layout.nodes).sort(), ['review', 'write']);
  assert.deepEqual(Object.keys(layout.edges), ['write-review']);
});

test('render refuses an invalid script and writes nothing', async () => {
  const script = writeScript(TWO_NODE.replace('from: write', 'from: nowhere'));
  const { code, report } = await main(['render', script, '--pack', 'standard']);
  assert.equal(code, 1);
  assert.deepEqual(report.written, []);
  assert.equal(fs.existsSync(path.join(path.dirname(script), '../../local-data')), false);
});

test('the real binary prints the report as JSON on stdout and exits with its code', () => {
  const bin = path.join(__dirname, '../cli.js');
  const ok = spawnSync(process.execPath, [bin, 'validate', writeScript(TWO_NODE)], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.deepEqual(JSON.parse(ok.stdout).errors, []);

  const bad = spawnSync(process.execPath, [bin, 'validate', writeScript(TWO_NODE.replace('to: review', 'to: x'))], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).errors[0].at, 'graph.edges[0].to');
  assert.match(bad.stderr, /line 21/);

  const usage = spawnSync(process.execPath, [bin, 'render', writeScript(TWO_NODE)], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
});

test('a node type the pack does not map still prints a report, with its own exit code', () => {
  const bin = path.join(__dirname, '../cli.js');
  const r = spawnSync(process.execPath, [bin, 'render', writeScript(TWO_NODE.replace('{id: review, type: ticket.task', '{id: review, type: ticket.story')), '--pack', 'standard'], { encoding: 'utf8' });
  assert.equal(r.status, 70);
  const report = JSON.parse(r.stdout);
  assert.equal(report.errors.length, 1);
  assert.deepEqual(report.written, []);
});

test('a verb the pack does not map leaves no half-written render', async () => {
  const script = writeScript(TWO_NODE.replace('{reveal: write-review}', '{highlight: write-review}'));
  const { code, report } = await main(['render', script, '--pack', 'standard']);
  assert.equal(code, 70);
  assert.deepEqual(report.written, []);
  assert.equal(fs.existsSync(path.join(path.dirname(script), '../../local-data')), false);
});
