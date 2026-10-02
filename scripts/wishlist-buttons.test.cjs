/** 合成 DOM 验证各卡片番号绑定、重复挂载、错误重试和站点协议一致性。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
/** 最小元素替身只模拟公共按钮模块使用的 DOM 接口。 */
class Element {
  /** 创建可观察的卡片或按钮。 */
  constructor(code = '') { this.code = code; this.dataset = {}; this.children = []; this.disabled = false; }
  /** 查询已经挂载的公共按钮。 */
  querySelector(selector) {
    if (selector === '.curated-tag' || selector === '.curated-banner-status') return this.tag;
    if (selector === ':scope > .curated-wishlist-button') return this.children.find((child) => child.className?.includes('curated-wishlist-button'));
  }
  /** 添加按钮并维护父引用。 */
  append(child) { this.children.push(child); child.parent = this; child.parentElement = this; }
  /** 插入到入库状态标记之后。 */
  after(child) { const siblings = this.parent.children; siblings.splice(siblings.indexOf(this) + 1, 0, child); child.parent = this.parent; child.parentElement = this.parent; }
  /** 从宿主中移除旧番号按钮。 */
  remove() { this.parent.children = this.parent.children.filter((child) => { /* 保留其他按钮。 */ return child !== this; }); }
  /** 保存真实事件回调供测试点击。 */
  addEventListener(name, handler) { this[name] = handler; }
}
/** 在隔离页面中运行真实公共站点按钮模块。 */
async function check(hostname, codes, detail = false) {
  const hosts = codes.map((code) => { /* 每张卡片有独立番号。 */ return new Element(code); });
  if (hostname === 'javdb.com') for (const host of hosts) {
    const tags = detail ? host : new Element();
    const tag = new Element();
    tags.append(tag);
    host.tag = tag;
    if (!detail) host.append(tags);
  }
  const buttonHost = (host) => hostname === 'javdb.com' && !detail ? host.children[0] : host;
  const buttonOf = (host) => buttonHost(host).querySelector(':scope > .curated-wishlist-button');
  const calls = []; let observer; let fail = true;
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync('src/content/wishlist.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, {
    exports, location: { hostname, href: `https://${hostname}/videos/${codes[0]}/` },
    require(name) { /* 隔离现有提取器和 Chrome 消息边界。 */
      if (name.endsWith('/extract')) return { extractCard: (host) => { /* 返回卡片绑定值。 */ return { code: host.code, link: `https://${hostname}/v/${host.code}` }; } };
      if (name.endsWith('/detail')) return { isDetailPage: () => { /* 列表页面。 */ return detail; }, extractDetailCode: () => hosts[0].code };
      if (name.endsWith('/jable')) return { isJableVideoPage: () => { /* jable 详情页。 */ return true; }, extractJableCode: () => { /* 从当前详情提取。 */ return hosts[0].code; } };
      if (name.endsWith('/messaging')) return { sendMessage: async (message) => { /* 捕获实际按钮发出的 payload。 */ calls.push(JSON.parse(JSON.stringify(message))); if (fail) { fail = false; throw new Error('offline'); } return { result: 'created' }; } };
      return { showToast() { /* 无可视弹窗依赖。 */ } };
    },
    document: { body: {}, querySelectorAll() { /* JAVDB 卡片集合。 */ return hosts; }, querySelector() { /* jable 详情容器。 */ return hosts[0]; }, createElement() { /* 创建独立按钮。 */ return new Element(); } },
    MutationObserver: class { /** 捕获重新扫描入口。 */ constructor(callback) { observer = callback; } /** 无异步 DOM 实现。 */ observe() {} /** 模拟退出。 */ disconnect() {} },
    setTimeout(callback) { /* 立即执行合成页面变更。 */ callback(); }, clearTimeout() { /* 无挂起定时器。 */ },
    window: { addEventListener() { /* 测试上下文自动释放。 */ } },
  });
  exports.initWishlistButtons(); observer();
  for (const host of hosts) {
    assert.equal(buttonHost(host).children.length, hostname === 'javdb.com' ? 2 : 1);
    if (hostname === 'javdb.com') assert.equal(buttonHost(host).children[1], buttonOf(host));
  }
  const event = { preventDefault() { /* 阻止导航。 */ }, stopPropagation() { /* 阻止卡片事件。 */ } };
  const first = buttonOf(hosts[0]);
  await first.click(event); assert.equal(first.disabled, false);
  await first.click(event); await first.click(event); assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { type: 'ADD_TO_WISHLIST', payload: { code: codes[0], sourceUrl: hostname === 'javdb.com' && !detail ? `https://${hostname}/v/${codes[0]}` : `https://${hostname}/videos/${codes[0]}/` } });
  for (const host of hosts.slice(1)) { await buttonOf(host).click(event); assert.equal(calls.at(-1).payload.code, host.code); assert.equal(calls.at(-1).payload.sourceUrl, `https://${hostname}/v/${host.code}`); }
  hosts[0].code = 'TEST-999'; observer(); assert.equal(buttonHost(hosts[0]).children.length, hostname === 'javdb.com' ? 2 : 1); assert.equal(buttonOf(hosts[0]).dataset.code, 'TEST-999');
}
/** 两站使用相同公共提交协议。 */
async function main() { await check('javdb.com', ['TEST-001', 'TEST-002']); await check('jable.tv', ['TEST-003']); await check('javdb.com', ['TEST-004'], true); console.log('Wishlist buttons: passed'); }
main().catch((error) => { /* 测试失败使 CI 非零退出。 */ console.error(error); process.exitCode = 1; });
