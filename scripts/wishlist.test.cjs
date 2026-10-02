/** 番号提交契约测试：使用现有 TypeScript 编译器，不新增测试依赖。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let call;
let status = 201;
/** 载入真实 API 模块，同时隔离 fetch 与设置地址规范化。 */
function load() {
  const js = ts.transpileModule(fs.readFileSync('src/api/wishlist.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { exports: module.exports, require: () => { /* 仅隔离地址工具。 */ return { normalizeServerUrl: (value) => { /* 基址与正式设置一致。 */ return value.replace(/\/$/, '') + '/api'; } }; }, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => { /* 捕获真实函数发出的协议。 */ call = { url, options }; return { ok: status < 400, status, json: async () => { /* 服务端已接收回执。 */ return status === 403 ? { code: 'BROWSER_PLUGIN_DISABLED', message: 'browser plugin integration is disabled', retryable: false } : { id: 'one', result: 'created' }; } }; } });
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
  console.log('Wishlist API contract: passed');
}
main().catch((error) => { /* CI 正确返回失败状态。 */ console.error(error); process.exitCode = 1; });
