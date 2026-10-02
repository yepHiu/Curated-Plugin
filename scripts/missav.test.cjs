/** 运行真实适配器，验证网址边界、状态查询、重扫与动态页面请求隔离。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, Error, console, ...globals, require: (name) => dependencies[name] || {} });
  return exports;
}
const urls = load('src/utils/missav-url.ts');

class Element {
  constructor(tagName) { this.tagName = tagName; this.dataset = {}; this.children = []; this.listeners = {}; }
  get isConnected() { return !!this.parent; }
  append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } }
  insertAdjacentElement(_position, child) { child.remove(); const index = this.parent.children.indexOf(this); this.parent.children.splice(index + 1, 0, child); child.parent = this.parent; }
  replaceWith(child) { const parent = this.parent; const index = parent.children.indexOf(this); parent.children.splice(index, 1, child); child.parent = parent; this.parent = undefined; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = undefined; } }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
}

function runtime() {
  const root = new Element('body'), title = new Element('h1');
  title.textContent = 'HBAD-643 Test movie';
  root.append(title);
  const location = { hostname: 'missav.ws', href: 'https://missav.ws/dm26/hbad-643' };
  const requests = [], toasts = [], opened = [];
  const windowListeners = new Map();
  let observer, timer, pageMessage;
  const document = {
    readyState: 'loading', documentElement: root,
    addEventListener() {}, querySelectorAll: () => [title],
    getElementById: (id) => root.children.find((child) => child.id === id),
    createElement: (name) => new Element(name),
  };
  const globals = {
    location, document,
    chrome: { runtime: { onMessage: { addListener(fn) { pageMessage = fn; } } } },
    window: { addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener(name) { windowListeners.delete(name); } },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = undefined; } },
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = undefined; },
  };
  const app = load('src/content/missav.ts', {
    '@/utils/missav-url': urls,
    '@/utils/javdb-search': load('src/utils/javdb-search.ts'),
    '@/content/styles': { ensureStyles() {}, showToast(text) { toasts.push(text); } },
    '@/content/actions': { async openCuratedMovie(...args) { opened.push(args); } },
    '@/utils/messaging': { sendMessage(message) { return new Promise((resolve, reject) => requests.push({ message, resolve, reject })); } },
  }, globals);
  load('src/content/index.ts', {
    '@/content/missav': app, '@/content/wishlist': { initWishlistButtons() {} },
  }, globals);
  return {
    app, root, title, location, requests, toasts, opened,
    bar: () => document.getElementById('curated-missav-titlebar'),
    mutate() { observer(); const fn = timer; timer = undefined; fn(); },
    message(type) { return new Promise((resolve) => assert.equal(pageMessage({ type }, {}, resolve), true)); },
    windowListeners,
  };
}

async function flush() { await new Promise((resolve) => setImmediate(resolve)); }

async function main() {
  for (const [url, code] of [
    ['https://missav.ws/dm26/hbad-643', 'HBAD-643'],
    ['https://www.missav.ws/en/dm99/hbad-643/?ref=home', 'HBAD-643'],
    ['https://missav.ws/ja/hbad-643-uncensored-leak', 'HBAD-643'],
    ['https://missav.ws/fc2-ppv-1234567', 'FC2-PPV-1234567'],
    ['https://missav.ws/fc2_ppv_1234567', 'FC2-PPV-1234567'],
    ['https://missav.ws/300mium-123', '300MIUM-123'],
    ['https://missav.ws/123456-789', '123456-789'],
  ]) assert.equal(urls.extractMissavCodeFromUrl(url), code);
  for (const path of ['', '/', '/dm26/', '/en', '/search/hbad-643', '/actors/hbad-643', '/genres/123', '/dm26/most-viewed', '/dm26/hbad-643/more', '/%E0%A4%A']) {
    assert.equal(urls.extractMissavCodeFromUrl(`https://missav.ws${path}`), '', path);
  }
  for (const url of ['https://missav.ws.evil.example/hbad-643', 'https://other.example/hbad-643', 'http://missav.ws/hbad-643', 'invalid']) {
    assert.equal(urls.extractMissavCodeFromUrl(url), '');
  }
  const manifest = JSON.parse(fs.readFileSync('src/manifest.json'));
  assert.ok(manifest.content_scripts[0].matches.includes('https://*.missav.ws/*'));

  const r = runtime();
  const initial = r.app.initMissavPage();
  assert.equal(r.bar().dataset.status, 'pending');
  assert.equal(r.root.children[1], r.bar());
  assert.equal(r.requests[0].message.payload.codes[0], 'HBAD-643');
  r.requests[0].resolve({ matchMap: { 'HBAD-643': { inLibrary: true, movieId: 'movie-1' } } });
  await initial;
  assert.equal((await r.message('GET_SCAN_STATS')).inLibrary, 1);
  const statusChip = r.bar().children[0];
  statusChip.listeners.keydown({ key: 'Enter', preventDefault() {} });
  await flush();
  assert.deepEqual(r.opened[0], ['HBAD-643', 'movie-1']);
  assert.equal(r.bar().children[1].href, 'https://javdb.com/search?q=HBAD-643&f=all');
  r.mutate(); await flush(); assert.equal(r.requests.length, 1, 'rendering must not query in a loop');

  const rescan = r.message('RESCAN');
  assert.equal(r.requests[1].message.payload.skipCache, true);
  r.requests[1].resolve({ matchMap: { 'HBAD-643': { inLibrary: false } } });
  assert.equal((await rescan).stats.outLibrary, 1);

  const offline = r.app.initMissavPage({ skipCache: true });
  r.requests[2].reject(new Error('offline')); await offline;
  assert.equal(r.app.getMissavScanStats().errors, 1);
  assert.equal(r.toasts.at(-1), 'offline');
  const retry = r.app.initMissavPage({ skipCache: true });
  r.requests[3].resolve({ matchMap: {} }); await retry;
  assert.equal(r.app.getMissavScanStats().detailStatus, 'error', 'missing matches must not mean out of library');

  const old = r.app.initMissavPage({ skipCache: true });
  r.location.href = 'https://missav.ws/dm26/test-002';
  r.title.textContent = 'TEST-002 Next movie';
  r.mutate();
  assert.equal(r.requests[5].message.payload.codes[0], 'TEST-002');
  r.requests[5].resolve({ matchMap: { 'TEST-002': { inLibrary: false } } }); await flush();
  r.requests[4].resolve({ matchMap: { 'HBAD-643': { inLibrary: true } } }); await old;
  assert.equal(r.bar().dataset.code, 'TEST-002');
  assert.equal(r.bar().dataset.status, 'out', 'old request must not overwrite new page status');
  r.location.href = 'https://missav.ws/search/hbad-643'; r.mutate(); await flush();
  assert.equal(r.bar(), undefined);
  assert.equal(r.app.getMissavScanStats().total, 0);
  assert.equal(r.requests.length, 6, 'category pages must not trigger movie lookups');

  const delayed = runtime(); delayed.title.textContent = 'Loading';
  await delayed.app.initMissavPage(); assert.equal(delayed.requests.length, 0);
  delayed.title.textContent = 'HBAD-643 Ready'; delayed.mutate();
  assert.equal(delayed.requests.length, 1, 'late headings should trigger a lookup');
  delayed.requests[0].resolve({ matchMap: { 'HBAD-643': { inLibrary: false } } }); await flush();
  assert.equal(delayed.bar().dataset.status, 'out');
  console.log('MissAV URL, rendering, popup messages, rescan, errors and stale responses: passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
