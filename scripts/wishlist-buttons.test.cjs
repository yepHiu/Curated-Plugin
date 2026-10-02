/** 运行真实公共按钮模块，覆盖同步、重建、重试和请求竞争。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
class Element {
  constructor(code = '') { this.code = code; this.dataset = {}; this.children = []; this.disabled = false; }
  querySelector(selector) {
    if (selector === '.curated-tag' || selector === '.curated-banner-status') return this.tag;
    if (selector === ':scope > .curated-wishlist-button') return this.children.find((child) => child.className?.includes('curated-wishlist-button'));
  }
  getAttribute(name) { return name === 'data-code' ? this.code : null; }
  append(child) { this.children.push(child); child.parent = this; child.parentElement = this; }
  after(child) { const siblings = this.parent.children; siblings.splice(siblings.indexOf(this) + 1, 0, child); child.parent = this.parent; child.parentElement = this.parent; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  addEventListener(name, handler) { this[name] = handler; }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await new Promise((resolve) => setImmediate(resolve)); }
const event = { preventDefault() {}, stopPropagation() {} };
function runtime(hostname, codes, detail = false) {
  const hosts = codes.map((code) => new Element(code));
  if (hostname === 'javdb.com') for (const host of hosts) {
    const tags = detail ? host : new Element(); const tag = new Element();
    tags.append(tag); host.tag = tag; if (!detail) host.append(tags);
  }
  const buttonHost = (host) => hostname === 'javdb.com' && !detail ? host.children[0] : host;
  const buttonOf = (host) => buttonHost(host).querySelector(':scope > .curated-wishlist-button');
  const calls = [], toasts = [], members = new Set();
  let observer, poll, timer, failAdd = false, failSync = false, pendingSync, pendingAdd;
  const sourceUrl = hostname.endsWith('missav.ws') ? `https://${hostname}/dm26/${codes[0].toLowerCase()}` : `https://${hostname}/videos/${codes[0]}/`;
  const location = { hostname, href: sourceUrl };
  const documentListeners = new Map(), windowListeners = new Map();
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync('src/content/wishlist.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, {
    exports, Error, location,
    require(name) {
      if (name.endsWith('/extract')) return { extractCard: (host) => ({ code: host.code, link: `https://${hostname}/v/${host.code}` }) };
      if (name.endsWith('/detail')) return { isDetailPage: () => detail, extractDetailCode: () => hosts[0].code };
      if (name.endsWith('/jable')) return { isJableVideoPage: () => true, extractJableCode: () => hosts[0].code };
      if (name.endsWith('/missav')) return { isMissavVideoPage: () => hostname.endsWith('missav.ws'), extractMissavCode: () => hosts[0].code };
      if (name.endsWith('/messaging')) return { async sendMessage(message) {
        calls.push(JSON.parse(JSON.stringify(message)));
        if (message.type === 'CHECK_WISHLIST_CODES') {
          if (pendingSync) { const pending = pendingSync; pendingSync = undefined; return pending.promise; }
          if (failSync) throw new Error('sync offline');
          return { statusMap: Object.fromEntries(message.payload.codes.map((code) => [code, { added: members.has(code) }])) };
        }
        if (pendingAdd) { const pending = pendingAdd; pendingAdd = undefined; return pending.promise; }
        if (failAdd) { failAdd = false; throw new Error('offline'); }
        members.add(message.payload.code); return { result: 'created' };
      } };
      return { showToast(text) { toasts.push(text); } };
    },
    document: { body: {}, visibilityState: 'visible', querySelectorAll: () => hosts, querySelector: () => hosts[0], createElement: () => new Element(), addEventListener(name, fn) { documentListeners.set(name, fn); }, removeEventListener(name) { documentListeners.delete(name); } },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() { observer = undefined; } },
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = undefined; },
    setInterval(fn) { poll = fn; return 1; }, clearInterval() { poll = undefined; },
    window: { addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener(name) { windowListeners.delete(name); } },
  });
  return {
    app: exports, hosts, members, calls, toasts, buttonHost, buttonOf, location,
    start() { exports.initWishlistButtons(); },
    mutate() { observer(); const fn = timer; timer = undefined; fn(); },
    poll() { poll(); },
    failNextAdd() { failAdd = true; }, failSync(value) { failSync = value; },
    deferSync() { pendingSync = deferred(); return pendingSync; },
    deferAdd() { pendingAdd = deferred(); return pendingAdd; },
    leave() { windowListeners.get('pagehide')(); },
  };
}
async function checkSite(hostname, codes, detail = false) {
  const r = runtime(hostname, codes, detail);
  r.start(); await flush(); r.mutate(); await flush();
  assert.equal(r.calls.filter((c) => c.type === 'CHECK_WISHLIST_CODES').length, 1, 'DOM render must not poll in a loop');
  for (const host of r.hosts) {
    assert.equal(r.buttonHost(host).children.length, hostname === 'javdb.com' ? 2 : 1);
    assert.equal(r.buttonOf(host).dataset.wishlistState, 'not-added');
    assert.equal(r.buttonOf(host).disabled, false);
  }
  const first = r.buttonOf(r.hosts[0]);
  r.failNextAdd(); await first.click(event); assert.equal(first.disabled, false);
  await first.click(event); await first.click(event);
  const adds = r.calls.filter((c) => c.type === 'ADD_TO_WISHLIST');
  assert.equal(adds.length, 2);
  assert.deepEqual(adds[1].payload, { code: codes[0], sourceUrl: hostname === 'javdb.com' && !detail ? `https://${hostname}/v/${codes[0]}` : r.location.href });
  assert.equal(first.dataset.wishlistState, 'added'); assert.equal(first.textContent, '已加入'); assert.equal(first.disabled, true);
  first.remove(); r.mutate(); await flush();
  assert.equal(r.buttonOf(r.hosts[0]).dataset.wishlistState, 'added', 'remount preserves confirmed state');
  for (const host of r.hosts.slice(1)) { await r.buttonOf(host).click(event); assert.equal(r.calls.at(-1).payload.code, host.code); }
  r.hosts[0].code = 'TEST-999'; r.mutate(); await flush();
  assert.equal(r.buttonOf(r.hosts[0]).dataset.code, 'TEST-999');
  assert.equal(r.buttonOf(r.hosts[0]).dataset.wishlistState, 'not-added');
  r.leave();
}
async function checkSyncAndRaces() {
  const r = runtime('missav.ws', ['HBAD-643']);
  r.members.add('HBAD-643'); r.start(); await flush();
  let button = r.buttonOf(r.hosts[0]);
  assert.equal(button.dataset.wishlistState, 'added', 'preexisting server wishlist is green');
  r.members.delete('HBAD-643'); r.poll(); await flush();
  assert.equal(button.dataset.wishlistState, 'not-added', 'server removal makes button gray and enabled');
  r.members.add('HBAD-643'); await r.app.refreshWishlistButtons();
  assert.equal(button.dataset.wishlistState, 'added', 'explicit rescan updates membership');
  r.failSync(true); await r.app.refreshWishlistButtons();
  assert.equal(button.dataset.wishlistState, 'unknown'); assert.match(button.title, /状态未确认/);
  r.failSync(false); r.members.clear(); await r.app.refreshWishlistButtons();
  const old = r.deferSync(); const sync = r.app.refreshWishlistButtons();
  await button.click(event);
  old.resolve({ statusMap: { 'HBAD-643': { added: false } } }); await sync;
  assert.equal(button.dataset.wishlistState, 'added', 'old negative must not overwrite successful add');
  r.members.clear(); await r.app.refreshWishlistButtons();
  const add = r.deferAdd(); const click = button.click(event);
  assert.equal(button.dataset.wishlistState, 'adding');
  r.poll(); await flush();
  r.hosts[0].code = 'TEST-222'; r.mutate(); await flush();
  add.resolve({ result: 'created' }); await click;
  button = r.buttonOf(r.hosts[0]);
  assert.equal(button.dataset.code, 'TEST-222'); assert.equal(button.dataset.wishlistState, 'not-added', 'previous page add cannot recolor current movie');
  r.leave();
}
async function main() {
  await checkSite('javdb.com', ['TEST-001', 'TEST-002']);
  await checkSite('jable.tv', ['TEST-003']);
  await checkSite('javdb.com', ['TEST-004'], true);
  await checkSite('missav.ws', ['HBAD-643']);
  await checkSite('www.missav.ws', ['TEST-005']);
  await checkSyncAndRaces();
  const duplicate = runtime('javdb.com', ['TEST-111', 'TEST-111']);
  duplicate.start(); await flush();
  assert.deepEqual(duplicate.calls[0].payload.codes, ['TEST-111']);
  await duplicate.buttonOf(duplicate.hosts[0]).click(event);
  assert.equal(duplicate.buttonOf(duplicate.hosts[1]).dataset.wishlistState, 'added');
  duplicate.leave();
  console.log('Wishlist buttons: site payloads, membership sync, removal, remount, retry and stale requests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
