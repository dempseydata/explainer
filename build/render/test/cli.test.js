// Seam 1: the explainer CLI's commands — exit code, machine-readable report, files written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { main } = require('../cli.js');
const { writeScript, TWO_NODE, BOARD } = require('./scripts.js');

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
  const out = path.join(path.dirname(script), '../../local-data/two-node/render/standard');
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
  assert.equal(fs.existsSync(path.join(path.dirname(script), '../../local-data/two-node/render')), false);
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
  const r = spawnSync(process.execPath, [bin, 'render', writeScript(TWO_NODE.replace('{id: review, type: ticket.task', '{id: review, type: ticket.story').replace('[ticket.task]', '[ticket.task, ticket.story]')), '--pack', 'standard'], { encoding: 'utf8' });
  assert.equal(r.status, 70);
  const report = JSON.parse(r.stdout);
  assert.equal(report.errors.length, 1);
  assert.deepEqual(report.written, []);
});

test('a verb the pack does not map leaves no half-written render', async () => {
  const script = writeScript(TWO_NODE.replace('- {reveal: write-review}', '- {reveal: write-review}\n      - {highlight: write-review}'));
  const { code, report } = await main(['render', script, '--pack', 'standard']);
  assert.equal(code, 70);
  assert.deepEqual(report.written, []);
  assert.equal(fs.existsSync(path.join(path.dirname(script), '../../local-data/two-node/render')), false);
});

// Schema v0.1 (ADR-0002, ADR-0005). Each broken script fails with one located error.
async function fails(yaml, at, pattern, args = []) {
  const { code, report } = await main(['validate', ...args, writeScript(yaml)]);
  assert.deepEqual(report.errors.map(e => e.at), [at], JSON.stringify(report.errors));
  assert.equal(code, 1);
  assert.match(report.errors[0].message, pattern);
  assert.equal(typeof report.errors[0].line, 'number');
}

test('validate passes the valid script, which uses every part of schema v0.1', async () => {
  const { code, report } = await main(['validate', writeScript(BOARD)]);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(code, 0);
});

test('an uncited edge fails', () =>
  fails(BOARD.replace('kind: blocks, cite: {src: notes, quote: "done cards are archived"}', 'kind: blocks'), 'graph.edges[0].cite', /cite/));

test('an undeclared state in set_state fails', () =>
  fails(BOARD.replace('state: active}', 'state: activ}'), 'steps[0].actions[2].set_state.state', /activ/));

test('a quote not found in its extract fails', () =>
  fails(BOARD.replace('quote: "drafts first"}', 'quote: "drafts last"}'), 'graph.nodes[0].cite.quote', /drafts last/));

test('a quote that is only whitespace or Markdown marks fails, with or without its extract', async () => {
  const edgeCite = 'kind: blocks, cite: {src: notes, quote: "done cards are archived"}';
  await fails(BOARD.replace(edgeCite, 'kind: blocks, cite: {src: notes, quote: "   "}'), 'graph.edges[0].cite.quote', /empty/);
  await fails(BOARD.replace(edgeCite, 'kind: blocks, cite: {src: notes, quote: "**"}'), 'graph.edges[0].cite.quote', /empty/);
  await fails(BOARD.replace(edgeCite, 'kind: blocks, cite: {src: notes, quote: "**"}').replace('sources/notes.md', 'sources/missing.md'), 'graph.edges[0].cite.quote', /empty/);
});

test('a four-action step fails', () =>
  fails(BOARD.replace('      - {focus: board}', '      - {focus: board}\n      - {highlight: board}'), 'steps[2].actions', /3/));

test('an unresolved parent fails', () =>
  fails(BOARD.replace('parent: board', 'parent: bored'), 'graph.groups[1].parent', /bored/));

test('an element declared but never revealed fails', () =>
  fails(BOARD.replace('{reveal: [archive, lane-archive]}', '{reveal: archive}'), 'graph.edges[0]', /lane-archive.*never revealed/));

test('a node label or annotation over 30 characters fails; a group label may be longer', async () => {
  const { code } = await main(['validate', writeScript(BOARD.replace('label: Board', 'label: The whole team board and every lane'))]);
  assert.equal(code, 0);
  await fails(BOARD.replace('label: Draft', 'label: A draft card with a far longer name'), 'graph.nodes[0].label', /30/);
  await fails(BOARD.replace('text: Archived', 'text: Archived when all the work is done'), 'steps[1].actions[2].annotate.text', /30/);
});

test('groups, nodes and edges share one id namespace', () =>
  fails(BOARD.replaceAll('lane-archive', 'card1'), 'graph.edges[0].id', /card1/));

test('an action target, a node group and a cite source must each resolve', async () => {
  await fails(BOARD.replace('{highlight: archive}', '{highlight: archiv}'), 'steps[1].actions[1].highlight', /archiv/);
  await fails(BOARD.replace('group: lane', 'group: card1'), 'graph.nodes[0].group', /card1/);
  await fails(BOARD.replace('- {src: notes, quote: "Done cards"}', '- {src: memo, quote: "Done cards"}'), 'steps[1].cite[0].src', /memo/);
});

test('a type, kind or verb outside the declared vocabulary fails', async () => {
  await fails(BOARD.replace('{id: archive, type: card', '{id: archive, type: cart'), 'graph.nodes[1].type', /cart/);
  await fails(BOARD.replace('{focus: board}', '{zoom: board}'), 'steps[2].actions[0].zoom', /zoom/);
});

test('a quote typed with a straight apostrophe matches a curly one, and a hyphen matches an en dash', async () => {
  // The extract reads "The team’s board holds every card – drafts first"; step 1 cites it typed plainly,
  // and the valid-script test above passes it.
  await fails(BOARD.replace('every card - drafts first"}\n', 'every card -- drafts first"}\n'), 'steps[0].cite.quote', /--/);
});

test('an absent extract is a warning, not an error, and not a pass', async () => {
  const { code, report } = await main(['validate', writeScript(BOARD.replace('local-data/two-node/sources/notes.md', 'local-data/two-node/sources/missing.md'))]);
  assert.equal(code, 0);
  assert.deepEqual(report.errors, []);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].at, 'sources[0].path');
  assert.equal(report.warnings[0].line, 8);
  assert.match(report.warnings[0].message, /absent/);
});

const DRAFT = BOARD.slice(0, BOARD.indexOf('steps:')) + 'draft:\n  checkpoint: 1\n  pack: standard\n  target_s: 75\n  gaps: []\n  root: .\n';

test('validate --draft passes a draft with no steps and a draft block', async () => {
  const { code, report } = await main(['validate', '--draft', writeScript(DRAFT)]);
  assert.deepEqual(report.errors, []);
  assert.equal(code, 0);
});

test('validate --draft still checks the graph quotes', () =>
  fails(DRAFT.replace('quote: "drafts first"}', 'quote: "drafts last"}'), 'graph.nodes[0].cite.quote', /drafts last/, ['--draft']));

test('without --draft, a draft fails: steps are missing and the draft block is not schema', async () => {
  const { code, report } = await main(['validate', writeScript(DRAFT)]);
  assert.equal(code, 1);
  assert.deepEqual(report.errors.map(e => e.at).sort(), ['draft', 'steps']);
});

test('a group nested inside itself fails', () =>
  fails(BOARD.replace('parent: board', 'parent: lane'), 'graph.groups[1].parent', /inside itself/));

test('a script outside <root>/explainers/<slug>/ is a usage error, and nothing is written', async () => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-flat-'));
  const script = path.join(top, 'flat', 'script.yaml');
  fs.mkdirSync(path.dirname(script));
  fs.copyFileSync(writeScript(TWO_NODE), script);
  for (const args of [['validate', script], ['render', script, '--pack', 'standard']]) {
    const { code, report } = await main(args);
    assert.equal(code, 2);
    assert.match(report.errors[0].message, /explainers\/<slug>\/script\.yaml/);
    assert.deepEqual(report.written, []);
  }
  assert.deepEqual(fs.readdirSync(top), ['flat']);
});

test('a source path that is absolute or climbs with .. leaves the root and fails', async () => {
  await fails(BOARD.replace('path: local-data/two-node/sources/notes.md', 'path: /elsewhere/notes.md'), 'sources[0].path', /root/);
  await fails(BOARD.replace('path: local-data/two-node/sources/notes.md', 'path: local-data/../../notes.md'), 'sources[0].path', /root/);
});

// The Wayfinder example (#15): its SKILL.md is vendored beside it; the article extracts are gitignored.
const EXAMPLE = path.join(__dirname, '../../../explainers/wayfinder');

test('the Wayfinder example validates in a fresh clone, warning only for the absent article extracts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-clone-'));
  fs.cpSync(EXAMPLE, path.join(root, 'explainers', 'wayfinder'), { recursive: true });
  const { code, report } = await main(['validate', path.join(root, 'explainers', 'wayfinder', 'script.yaml')]);
  assert.deepEqual(report.errors, []);
  assert.equal(code, 0);
  assert.deepEqual(report.warnings.map(w => w.message.split(':')[0]), ['source aihero', 'source latent']);
});

const ARTICLES = ['aihero.txt', 'latent.txt'].map(f => path.join(EXAMPLE, '../../local-data/wayfinder/sources', f));

test('with the article extracts present locally, every quote in the Wayfinder example is found',
  { skip: !ARTICLES.every(f => fs.existsSync(f)) && 'article extracts absent (gitignored)' }, async () => {
    const { code, report } = await main(['validate', path.join(EXAMPLE, 'script.yaml')]);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(code, 0);
  });
