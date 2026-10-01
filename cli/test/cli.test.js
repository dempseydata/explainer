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

test('render writes explainer.html and layout.json, with the check, capture and narration outputs, in the standard pack', async () => {
  const script = writeScript(TWO_NODE);
  const { code, report } = await main(['render', script, '--pack', 'standard']);
  assert.equal(code, 0);
  const out = path.join(path.dirname(script), '../../local-data/two-node/render/standard');
  assert.deepEqual(report.written.sort(), ['captions.srt', 'explainer.html', 'explainer.mp4', 'keyframes/step-01.png', 'keyframes/step-02.png',
    'layout.json', 'narration.md', 'review.md'].map(f => path.join(out, f)));
  const layout = JSON.parse(fs.readFileSync(path.join(out, 'layout.json'), 'utf8'));
  assert.deepEqual(Object.keys(layout.nodes).sort(), ['review', 'write']);
  assert.deepEqual(Object.keys(layout.edges), ['write-review']);
});

// ADR-0015: the test-only option stops the render where capture would begin.
test('main with {capture: false} writes the render\'s files up to review.md, and stops before capture', async () => {
  const script = writeScript(TWO_NODE);
  const { code, report } = await main(['render', script, '--pack', 'standard'], { capture: false });
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.equal(report.capture, undefined);
  const out = path.join(path.dirname(script), '../../local-data/two-node/render/standard');
  assert.deepEqual(report.written.sort(), ['explainer.html', 'keyframes/step-01.png', 'keyframes/step-02.png', 'layout.json', 'review.md']
    .map(f => path.join(out, f)));
  assert.deepEqual(fs.readdirSync(out).sort(), ['explainer.html', 'keyframes', 'layout.json', 'review.md'], 'no MP4, captions or narration');
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

// Pack coverage (#17): a pack that does not map the script is a validation failure, located, and nothing is written.
test('a node type the pack does not map fails render with a located error, through the real binary', () => {
  const bin = path.join(__dirname, '../cli.js');
  const r = spawnSync(process.execPath, [bin, 'render', writeScript(TWO_NODE.replace('{id: review, type: ticket.task', '{id: review, type: ticket.story').replace('[ticket.task]', '[ticket.task, ticket.story]')), '--pack', 'standard'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.errors.map(e => e.at), ['graph.node_types[1]']);
  assert.match(report.errors[0].message, /ticket\.story.*standard/);
  assert.deepEqual(report.written, []);
});

test('a verb or an edge kind the pack does not map fails render and leaves no render behind', async () => {
  const cases = [
    [TWO_NODE.replace('- {reveal: write-review}', '- {reveal: write-review}\n      - {focus: write-review}'), 'steps[1].actions[2].focus', /focus.*standard/],
    [TWO_NODE.replace('[blocks]', '[feeds]').replace('kind: blocks', 'kind: feeds'), 'graph.edge_kinds[0]', /feeds.*standard/],
  ];
  for (const [yaml, at, pattern] of cases) {
    const script = writeScript(yaml);
    const { code, report } = await main(['render', script, '--pack', 'standard']);
    assert.deepEqual(report.errors.map(e => e.at), [at]);
    assert.match(report.errors[0].message, pattern);
    assert.equal(code, 1);
    assert.deepEqual(report.written, []);
    assert.equal(fs.existsSync(path.join(path.dirname(script), '../../local-data/two-node/render')), false);
  }
});

test('validate --pack fails a state or group type the pack does not map, naming the entry and the pack', async () => {
  // toString is on every object's prototype chain, not in the pack.
  const yaml = TWO_NODE.replace('states: []', 'states: [done]').replace('group_types: []', 'group_types: [lane]').replace('node_types: [ticket.task]', 'node_types: [ticket.task, toString]');
  const { code, report } = await main(['validate', writeScript(yaml), '--pack', 'standard']);
  assert.deepEqual(report.errors.map(e => e.at).sort(), ['graph.group_types[0]', 'graph.node_types[1]', 'graph.states[0]']);
  for (const e of report.errors) {
    assert.match(e.message, /'(done|lane|toString)'.*standard/);
    assert.equal(typeof e.line, 'number');
  }
  assert.equal(code, 1);
  const unpacked = await main(['validate', writeScript(yaml)]);
  assert.equal(unpacked.code, 0, 'without --pack, coverage is not checked');
});

test('validate --pack with no such pack is a usage error', async () => {
  const { code } = await main(['validate', writeScript(TWO_NODE), '--pack', 'nosuch']);
  assert.equal(code, 2);
});

test('an argument a command does not take, such as a mistyped flag, is a usage error, and nothing is written', async () => {
  for (const args of [['validate', writeScript(TWO_NODE), 'extra'], ['render', writeScript(TWO_NODE), '--pack', 'standard', '--accept-finding']]) {
    const { code, report } = await main(args);
    assert.equal(code, 2, args.join(' '));
    assert.match(report.errors[0].message, /extra|--accept-finding/);
    assert.deepEqual(report.written, []);
  }
});

// #32: --pack names an installed pack; a path to a pack.json anywhere else is not loaded.
test('--pack that is not exactly an installed pack name is a usage error naming the installed packs', async t => {
  const packs = path.join(__dirname, '../packs');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-pack-'));
  t.after(() => fs.rmSync(outside, { recursive: true }));
  fs.copyFileSync(path.join(packs, 'standard/pack.json'), path.join(outside, 'pack.json'));
  const script = writeScript(TWO_NODE);
  for (const name of [path.relative(packs, outside), outside, 'standard/', 'standard/../standard', '.', '']) {
    for (const command of ['validate', 'render']) {
      const { code, report } = await main([command, script, '--pack', name]);
      assert.equal(code, 2, `${command} --pack ${name}`);
      assert.match(report.errors[0].message, /one of: pencil, standard$/);
      assert.deepEqual(report.written, []);
    }
  }
});

// Overrun (#17, ADR-0004, ADR-0006): the suggestion is max(animation time, narration characters / 15), up to the next 0.5 s.
// In the standard pack a reveal takes 0.4 s (#6).
const withStep2 = (narration, d) => TWO_NODE.replace('narration: Then review it.\n    duration_s: 3', `narration: ${narration}\n    duration_s: ${d}`);
const LONG = 'Write it. '.repeat(8).trim(); // 79 characters: 5.27 s at 15 cps
const withStep1 = d => TWO_NODE.replace('narration: First, write it.\n    duration_s: 2', `narration: ${LONG}\n    duration_s: ${d}`);

async function overrun(yaml) {
  const { code, report } = await main(['validate', writeScript(yaml), '--pack', 'standard']);
  return { code, errors: report.errors };
}

test('a seeded overrun is rejected, naming the step, the pack and the animation time, with the suggested duration_s', async () => {
  const { code, errors } = await overrun(withStep2('Then review.', 0.5)); // two reveals: 0.8 s; 12 characters: 0.8 s
  assert.equal(code, 1);
  assert.deepEqual(errors.map(e => e.at), ['steps[1].duration_s']);
  assert.match(errors[0].message, /step 2/);
  assert.match(errors[0].message, /standard/);
  assert.match(errors[0].message, /animation 0.8 s/);
  assert.equal(errors[0].suggested_duration_s, 1);
  assert.equal(errors[0].animation_s, 0.8);
  assert.equal(errors[0].pack, 'standard');
  assert.match(errors[0].message, /animation (and narration )?runs? over/);
  assert.equal(typeof errors[0].line, 'number');
});

test('over-long narration over a short animation is rejected, with a suggestion read at 15 characters per second', async () => {
  const { code, errors } = await overrun(withStep1(2)); // one reveal: 0.4 s
  assert.equal(code, 1);
  assert.deepEqual(errors.map(e => e.at), ['steps[0].duration_s']);
  assert.match(errors[0].message, /animation 0.4 s/);
  assert.match(errors[0].message, /narration runs over/);
  assert.doesNotMatch(errors[0].message, /animation (and narration )?runs? over|overruns/);
  assert.equal(errors[0].suggested_duration_s, 5.5);
  assert.equal(errors[0].animation_s, 0.4);
});

test('raising a step to its suggestion clears the rejection, and the check is monotone', async () => {
  for (const d of [5.5, 6, 30]) assert.equal((await overrun(withStep1(d))).code, 0, `duration_s ${d}`);
  for (const d of [5, 0.5]) assert.deepEqual((await overrun(withStep1(d))).errors.map(e => e.suggested_duration_s), [5.5], `duration_s ${d}`);
  for (const d of [1, 1.5, 10]) assert.equal((await overrun(withStep2('Then review.', d))).code, 0, `duration_s ${d}`);
});

test('validation never writes the script, even when it rejects an overrun', async () => {
  const script = writeScript(withStep1(2));
  const before = fs.readFileSync(script);
  const { code } = await main(['validate', script, '--pack', 'standard']);
  assert.equal(code, 1);
  assert.deepEqual(fs.readFileSync(script), before);
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

// ADR-0018: a draft sits at <root>/local-data/<slug>/script.draft.yaml, and its extracts resolve from the same root.
test('a draft where the skill writes it validates, with its quotes checked', async () => {
  const draft = path.join(path.dirname(writeScript(TWO_NODE)), '../../local-data/two-node/script.draft.yaml');
  fs.writeFileSync(draft, DRAFT);
  const { code, report } = await main(['validate', '--draft', draft]);
  assert.deepEqual([report.errors, report.warnings], [[], []]);
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
const EXAMPLE = path.join(__dirname, '../../explainers/wayfinder');
const cloneExample = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-clone-'));
  fs.cpSync(EXAMPLE, path.join(root, 'explainers', 'wayfinder'), { recursive: true });
  return path.join(root, 'explainers', 'wayfinder', 'script.yaml');
};

test('the Wayfinder example validates in a fresh clone, warning only for the absent article extracts', async () => {
  const { code, report } = await main(['validate', cloneExample()]);
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

// The standard pack (#18): Look A, from the resolution of #6.

// The pencil pack (#23) maps the identical script: no edits.
for (const pack of ['standard', 'pencil']) {
  test(`validate --pack ${pack} passes the Wayfinder example`, async () => {
    const { code, report } = await main(['validate', cloneExample(), '--pack', pack]);
    assert.deepEqual(report.errors, []);
    assert.equal(code, 0);
  });
}

test('the standard pack lists exactly Inter (OFL) and Lucide (ISC and MIT), and explainer.html carries both notices', async () => {
  const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/standard/pack.json'), 'utf8'));
  assert.deepEqual(pack.licences.map(l => [l.assets, l.licence]), [['Inter', 'OFL-1.1'], ['Lucide', 'ISC AND MIT']]);
  const { code, report } = await main(['render', writeScript(TWO_NODE), '--pack', 'standard'], { capture: false });
  assert.equal(code, 0);
  const html = fs.readFileSync(report.written.find(p => p.endsWith('explainer.html')), 'utf8');
  assert.deepEqual([...html.matchAll(/<!-- (.+) — (.+)\n/g)].map(m => [m[1], m[2]]), [['Inter', 'OFL-1.1'], ['Lucide', 'ISC AND MIT']]);
  assert.match(html, /Copyright 2016 The Inter Project Authors[\s\S]*SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(html, /ISC License[\s\S]*Lucide Icons and Contributors[\s\S]*The MIT License[\s\S]*Cole Bemis/);
});

test('the pencil pack lists exactly Kalam (OFL) and rough.js (MIT), and explainer.html carries both notices and rough.js inlined', async () => {
  const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/pencil/pack.json'), 'utf8'));
  assert.deepEqual(pack.licences.map(l => [l.assets, l.licence]), [['Kalam', 'OFL-1.1'], ['rough.js', 'MIT']]);
  const { code, report } = await main(['render', writeScript(TWO_NODE), '--pack', 'pencil'], { capture: false });
  assert.equal(code, 0, JSON.stringify(report));
  const html = fs.readFileSync(report.written.find(p => p.endsWith('explainer.html')), 'utf8');
  assert.deepEqual([...html.matchAll(/<!-- (.+) — (.+)\n/g)].map(m => [m[1], m[2]]), [['Kalam', 'OFL-1.1'], ['rough.js', 'MIT']]);
  assert.match(html, /Copyright \(c\) 2014,? Indian Type Foundry[\s\S]*SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(html, /MIT License[\s\S]*Copyright \(c\) 2019 Preet Shihn/);
  assert.match(html, /<script>[^<]*var rough=/, 'rough.js is inlined, not fetched');
  assert.doesNotMatch(JSON.stringify(pack), /dots/, 'no rough.js dots fill (ADR-0001)');
});
