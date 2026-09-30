// Seam 1: `explainer fetch <url> <extract-path>` against a local HTTP fixture — exit code, report, files written.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { main } = require('../cli.js');

const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const PAGES = {
  '/plain': `<!doctype html><html><head><title>Plain</title></head><body><h1>Plain page</h1><p>${words(118)}</p></body></html>`,
  // The text exists only once the script has run, so pandoc sees none of it.
  '/scripted': '<!doctype html><html><body><div id="app"></div><script>document.getElementById("app").textContent = Array.from({length: 120}, () => "rendered").join(" ")</script></body></html>',
  // Renders its text, then polls forever, so the network never goes idle.
  '/polling': '<!doctype html><html><body><div id="app"></div><script>document.getElementById("app").textContent = Array.from({length: 120}, () => "polled").join(" "); setInterval(() => fetch("/poll"), 200)</script></body></html>',
  '/poll': '',
  '/thin': `<!doctype html><html><body><p>${words(40)}</p><script>document.body.append(" ${words(10)}")</script></body></html>`,
};
let server, base, inner, innerHits = 0;

before(async () => {
  // A second loopback server, the target of the redirects below: it must never be reached through one.
  inner = http.createServer((req, res) => { innerHits++; res.end(PAGES['/plain']); });
  await new Promise(resolve => inner.listen(0, '127.0.0.1', resolve));
  let dropped = 0, late = 0;
  server = http.createServer((req, res) => {
    // A thin page over HTTP; Chromium's own request, the second, gets no response at all.
    if (req.url === '/dropped' && dropped++) return req.socket.destroy();
    // /redirect?to=<url> redirects there; /late-redirect serves the thin page over HTTP, then redirects Chromium.
    const to = new URL(req.url, 'http://x').searchParams.get('to') ?? (req.url === '/late-redirect' && late++ ? `http://127.0.0.1:${inner.address().port}/plain` : null);
    if (to) return res.writeHead(302, { location: to }).end();
    if (req.url === '/late-redirect') req.url = '/thin';
    // Pages that leave for the inner server once Chromium runs them: by meta refresh, by script, or for an image only.
    const internal = `http://127.0.0.1:${inner.address().port}/plain`;
    const leaving = { '/meta-refresh': `<meta http-equiv="refresh" content="0;url=${internal}">${PAGES['/thin']}`,
      '/js-location': `<script>location.href = "${internal}"</script>${PAGES['/thin']}`,
      '/pixel': `${PAGES['/scripted']}<img src="/redirect?to=${encodeURIComponent(internal)}">` };
    const page = leaving[req.url] ?? PAGES[req.url === '/dropped' ? '/thin' : req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page ?? 'not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); inner.close(); });

// An extract path under a fresh root: <root>/local-data/<slug>/sources/<name>.
function extractPath(name = 'page.txt') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-fetch-'));
  return path.join(root, 'local-data', 'demo', 'sources', name);
}

test('a plain HTML page yields its text as an extract, with its path and word count in the report', async () => {
  const file = extractPath();
  const { code, report } = await main(['fetch', `${base}/plain`, file]);
  assert.deepEqual(report.errors, []);
  assert.equal(code, 0);
  assert.deepEqual(report.written, [file]);
  assert.equal(report.words, 120);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /Plain page/);
  assert.match(text, /word0 word1 word2/);
  assert.doesNotMatch(text, /<p>/);
});

test('a page that renders its content with JavaScript yields its text through the Chromium fallback', async () => {
  const file = extractPath();
  const { code, report } = await main(['fetch', `${base}/scripted`, file]);
  assert.deepEqual(report.errors, []);
  assert.equal(code, 0);
  assert.deepEqual(report.written, [file]);
  assert.equal(report.words, 120);
  assert.match(fs.readFileSync(file, 'utf8'), /^rendered rendered rendered/);
});

test('a page that never goes network-idle still yields its text through the Chromium fallback', async () => {
  const file = extractPath();
  const { code, report } = await main(['fetch', `${base}/polling`, file]);
  assert.deepEqual(report.errors, []);
  assert.equal(code, 0);
  assert.equal(report.words, 120);
  assert.match(fs.readFileSync(file, 'utf8'), /^polled polled polled/);
});

test('a page under 100 words after both attempts, an HTTP error or a network error fails with a reason, and writes nothing', async () => {
  const closed = http.createServer();
  await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
  const refused = `http://127.0.0.1:${closed.address().port}/`;
  closed.close();
  for (const [url, reason] of [[`${base}/thin`, /50 words.*100-word/], [`${base}/gone`, /HTTP 404/], [refused, /ECONNREFUSED/], [`${base}/dropped`, /ERR_EMPTY_RESPONSE/]]) {
    const file = extractPath();
    const { code, report } = await main(['fetch', url, file]);
    assert.equal(code, 1, url);
    assert.match(report.errors[0].message, reason);
    assert.deepEqual(report.written, []);
    assert.equal(fs.existsSync(path.dirname(file)), false);
  }
});

test('an extract path outside <root>/local-data/<slug>/sources/ is a usage error, and nothing is written', async () => {
  const root = path.dirname(path.dirname(path.dirname(path.dirname(extractPath()))));
  for (const file of [path.join(root, 'explainers', 'demo', 'sources', 'page.txt'), path.join(root, 'local-data', 'demo', 'page.txt')]) {
    const { code, report } = await main(['fetch', `${base}/plain`, file]);
    assert.equal(code, 2);
    assert.match(report.errors[0].message, /local-data\/<slug>\/sources/);
    assert.deepEqual(report.written, []);
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test('an existing extract is kept unless --overwrite is given', async () => {
  const file = extractPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'kept');
  const refused = await main(['fetch', `${base}/plain`, file]);
  assert.equal(refused.code, 2);
  assert.match(refused.report.errors[0].message, /--overwrite/);
  assert.deepEqual(refused.report.written, []);
  assert.equal(fs.readFileSync(file, 'utf8'), 'kept');

  const { code, report } = await main(['fetch', '--overwrite', `${base}/plain`, file]);
  assert.equal(code, 0);
  assert.deepEqual(report.written, [file]);
  assert.match(fs.readFileSync(file, 'utf8'), /Plain page/);
});

test('an extract path that is a symlink is refused, with or without --overwrite, and nothing is written through it', async () => {
  const file = extractPath();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-outside-')), 'target.txt');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.symlinkSync(outside, file);
  for (const args of [[], ['--overwrite']]) {
    const { code, report } = await main(['fetch', ...args, `${base}/plain`, file]);
    assert.equal(code, 2);
    assert.match(report.errors[0].message, /symlink/);
    assert.deepEqual(report.written, []);
    assert.equal(fs.existsSync(outside), false);
  }
});

test('an extract whose sources/ directory is a symlink out of local-data is refused, and nothing is written through it', async () => {
  const file = extractPath();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-outside-'));
  fs.mkdirSync(path.dirname(path.dirname(file)), { recursive: true });
  fs.symlinkSync(outside, path.dirname(file));
  const { code, report } = await main(['fetch', `${base}/plain`, file]);
  assert.equal(code, 2);
  assert.match(report.errors[0].message, /symlink|outside/);
  assert.deepEqual(report.written, []);
  assert.deepEqual(fs.readdirSync(outside), []);
});

// #32: a redirect may not carry fetch to a loopback, link-local, private or unspecified address; the URL given may.
test('a redirect to a loopback, link-local, private or unspecified address is refused with the reason, and nothing is written', async () => {
  const port = inner.address().port;
  const targets = [`http://127.0.0.1:${port}/plain`, `http://localhost:${port}/plain`, `http://[::1]:${port}/plain`, `http://[::ffff:127.0.0.1]:${port}/plain`,
    'http://10.1.2.3/', 'http://172.16.0.1/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/', 'http://[::]/',
    'http://[fe80::1]/', 'http://[fd00::1]/'];
  for (const to of targets) {
    const file = extractPath();
    const { code, report } = await main(['fetch', `${base}/redirect?to=${encodeURIComponent(to)}`, file]);
    assert.equal(code, 1, to);
    assert.match(report.errors[0].message, /refused a redirect to .*loopback, link-local, private or unspecified/, to);
    assert.deepEqual(report.written, []);
    assert.equal(fs.existsSync(path.dirname(file)), false);
  }
  assert.equal(innerHits, 0);
});

test('a redirect to a loopback address in Chromium\'s navigation is refused with the reason, and nothing is written', async () => {
  const file = extractPath();
  const { code, report } = await main(['fetch', `${base}/late-redirect`, file]);
  assert.equal(code, 1);
  assert.match(report.errors[0].message, /refused a redirect to http:\/\/127\.0\.0\.1:\d+\/plain/);
  assert.deepEqual(report.written, []);
  assert.equal(fs.existsSync(path.dirname(file)), false);
  assert.equal(innerHits, 0);
});

test('a meta refresh or a script that navigates the page to a loopback address is refused with the reason, and nothing is written', async () => {
  for (const page of ['/meta-refresh', '/js-location']) {
    const file = extractPath();
    const { code, report } = await main(['fetch', `${base}${page}`, file]);
    assert.equal(code, 1, page);
    assert.match(report.errors[0].message, /refused a redirect to http:\/\/127\.0\.0\.1:\d+\/plain/, page);
    assert.deepEqual(report.written, []);
    assert.equal(fs.existsSync(path.dirname(file)), false);
  }
  assert.equal(innerHits, 0);
});

test('a sub-resource redirected to a loopback address is blocked, and the page is still extracted', async () => {
  const file = extractPath();
  const { code, report } = await main(['fetch', `${base}/pixel`, file]);
  assert.deepEqual(report.errors, []);
  assert.equal(code, 0);
  assert.equal(report.words, 120);
  assert.equal(innerHits, 0);
});

test('a redirect loop is cut off after 20 hops with the reason, and nothing is written', async () => {
  // A loop through a loopback proxy, so no hop names an internal address; .invalid never resolves (RFC 2606).
  let hops = 0;
  const loop = http.createServer((req, res) => { hops++; res.writeHead(302, { location: 'http://loop.invalid/', connection: 'close' }).end(); });
  loop.on('connect', (req, socket) => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); loop.emit('connection', socket); });
  await new Promise(resolve => loop.listen(0, '127.0.0.1', resolve));
  const file = extractPath();
  const env = { ...process.env, HTTP_PROXY: `http://127.0.0.1:${loop.address().port}`, NODE_USE_ENV_PROXY: '1' };
  env.http_proxy = env.HTTP_PROXY; env.NO_PROXY = env.no_proxy = ''; // the machine's own proxy settings must not win
  const { code, stdout } = await new Promise(resolve => execFile(process.execPath, [path.join(__dirname, '../cli.js'), 'fetch', 'http://loop.invalid/', file], { env },
    (e, stdout) => resolve({ code: e?.code ?? 0, stdout })));
  loop.close();
  const report = JSON.parse(stdout);
  assert.equal(code, 1);
  assert.match(report.errors[0].message, /too many redirects/);
  assert.deepEqual(report.written, []);
  assert.equal(hops, 21);
});
