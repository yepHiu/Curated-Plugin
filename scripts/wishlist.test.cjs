/** 番号提交契约测试：使用现有 TypeScript 编译器，不新增测试依赖。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let call;
let status = 201;
let statusPayload;
const calls = [];
/** 载入真实 API 模块，同时隔离 fetch 与设置地址规范化。 */
function load() {
  const js = ts.transpileModule(fs.readFileSync('src/api/wishlist.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { exports: module.exports, require: () => { /* 仅隔离地址工具。 */ return { normalizeServerUrl: (value) => { /* 基址与正式设置一致。 */ return value.replace(/\/$/, '') + '/api'; } }; }, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => {
    call = { url, options }; calls.push(call);
    return { ok: status < 400, status, json: async () => status === 403 ? { code: 'BROWSER_PLUGIN_DISABLED' }
      : url.endsWith('/status') ? statusPayload ?? { statusMap: Object.fromEntries(JSON.parse(options.body).codes.map((code) => [code, { added: code === 'SSIS-001' }])) }
      : { id: 'one', result: 'created' } };
  } });
  return module.exports;
}
/** 验证无需凭证只发送番号，以及联动关闭时提示开启。 */
async function main() {
  const api = load();
  for (const code of ['SSIS-001', 'FC2-PPV-123456', 'ABC-002']) {
    const result = await api.addWishlistCode('http://127.0.0.1:8081', code);
    assert.equal(result.id, 'one'); assert.equal(call.url, 'http://127.0.0.1:8081/api/integrations/wishlist/items');
    assert.deepEqual(JSON.parse(call.options.body), { code }); assert.equal(call.options.headers.Authorization, undefined); assert.equal(call.options.redirect, 'error');
  }
  await api.addWishlistCode('http://127.0.0.1:8081', 'SSIS-001', 'https://javdb.com/v/test');
  assert.deepEqual(JSON.parse(call.options.body), { code: 'SSIS-001', sourceUrl: 'https://javdb.com/v/test' });
  status = 403; await assert.rejects(api.addWishlistCode('http://127.0.0.1:8081', 'SSIS-001'), /开启浏览器插件联动/);
  await assert.rejects(api.checkWishlistCodes('http://127.0.0.1:8081', ['SSIS-001']), /开启浏览器插件联动/);
  status = 200;
  const codes = ['SSIS-001', ...Array.from({ length: 100 }, (_, i) => `TEST-${i + 100}`)];
  calls.length = 0;
  const membership = await api.checkWishlistCodes('http://127.0.0.1:8081', [...codes, 'SSIS-001']);
  assert.equal(calls.length, 2); assert.equal(JSON.parse(calls[0].options.body).codes.length, 100);
  assert.equal(JSON.parse(calls[1].options.body).codes.length, 1);
  assert.equal(membership.statusMap['SSIS-001'].added, true);
  assert.equal(membership.statusMap['TEST-100'].added, false);
  assert.equal(calls[0].url, 'http://127.0.0.1:8081/api/integrations/wishlist/status');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers['X-Curated-Client'], 'Curated-Plugin');
  for (const malformed of [{}, { statusMap: {} }, { statusMap: { 'SSIS-001': { added: 'true' } } }]) {
    statusPayload = malformed;
    await assert.rejects(api.checkWishlistCodes('http://127.0.0.1:8081', ['SSIS-001']), /响应不完整/);
  }
  status = 404; await assert.rejects(api.checkWishlistCodes('http://127.0.0.1:8081', ['SSIS-001']), /升级后端/);
  // 真实后台路由校验消息来源，并始终使用当前服务地址。
  let listener, serverUrl = 'http://127.0.0.1:8081';
  const chrome = { runtime: { id: 'test-plugin', getURL: (name) => `chrome-extension://test-plugin/${name}`, onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } } };
  function module(file, dependencies) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, chrome, URL, Error, console, require: (name) => dependencies[name] || {} });
    return exports;
  }
  const messaging = module('src/utils/messaging.ts', {});
  module('src/background/index.ts', {
    '@/utils/messaging': messaging,
    '@/api/wishlist': api,
    '@/utils/settings': { async getSettings() { return { serverUrl }; } },
  });
  const query = { type: 'CHECK_WISHLIST_CODES', payload: { codes: ['SSIS-001'] } };
  const page = { id: chrome.runtime.id, tab: { id: 3 }, url: 'https://missav.ws/dm26/ssis-001' };
  const send = (message, sender) => new Promise((resolve) => listener(message, sender, resolve));
  status = 200; statusPayload = undefined;
  assert.equal((await send(query, page)).statusMap['SSIS-001'].added, true);
  serverUrl = 'http://localhost:8080';
  await send(query, { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') });
  assert.equal(call.url, 'http://localhost:8080/api/integrations/wishlist/status');
  for (const sender of [{ ...page, id: 'other' }, { ...page, url: 'http://missav.ws' }, { id: chrome.runtime.id, url: chrome.runtime.getURL('options.html') }]) {
    assert.match((await send(query, sender)).error, /Invalid wishlist sender/);
  }
  for (const payload of [{ codes: [] }, { codes: [5] }, { codes: ['SSIS-001'], sourceUrl: 'https://missav.ws' }, { codes: Array(501).fill('SSIS-001') }]) {
    assert.match((await send({ ...query, payload }, page)).error, /无效/);
  }
  console.log('Wishlist API contract: passed');
}
main().catch((error) => { /* CI 正确返回失败状态。 */ console.error(error); process.exitCode = 1; });
