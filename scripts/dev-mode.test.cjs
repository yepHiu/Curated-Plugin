/** 验证单一插件的运行时开发者开关、自定义地址。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const configure = require('../webpack.config');

/** 载入真实模块并以隔离存储模拟扩展重新打开。 */
function runtime(syncData, localData) {
  const cache = new Map();
  /** Chrome storage 替身遵循异步读写接口。 */
  function area(data) {
    return {
      async get(key) { /* 按键读取对应配置。 */ return { [key]: data[key] }; },
      async set(value) { /* 合并写入，不删除其他模式的值。 */ Object.assign(data, value); },
      async setAccessLevel() { /* 本测试只检查命名空间，权限由既有逻辑设置。 */ },
    };
  }
  /** 转译并加载相邻 TypeScript 模块，不替换设置业务逻辑。 */
  function load(filename) {
    const file = path.resolve(filename);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, {
      exports,
      chrome: { storage: { sync: area(syncData), local: area(localData) } },
      require(specifier) { /* 解析真实相对依赖。 */ return load(path.resolve(path.dirname(file), specifier + '.ts')); },
    });
    return exports;
  }
  return { settings: load('src/utils/settings.ts') };
}

/** 开关控制有效地址，保存和重新加载不丢自定义值，旧配置继续可用。 */
async function main() {
  const sync = {}, local = {};
  const app = runtime(sync, local);
  assert.equal((await app.settings.getSettings()).serverUrl, 'http://127.0.0.1:8081/api');
  assert.equal((await app.settings.getSettings()).developerMode, false);
  const draft = { developerMode: true, serverUrl: 'localhost:8080', autoRemoveFromWantList: false };
  await app.settings.saveSettings(draft);
  assert.equal((await runtime(sync, local).settings.getSettings()).serverUrl, 'http://localhost:8080/api');
  await app.settings.saveSettings({ ...draft, developerMode: false });
  assert.equal((await app.settings.getSettings()).serverUrl, 'http://127.0.0.1:8081/api');
  assert.equal(sync.settings.serverUrl, 'http://localhost:8080/api');
  await app.settings.saveSettings({ ...sync.settings, developerMode: true });
  assert.equal((await app.settings.getSettings()).serverUrl, 'http://localhost:8080/api');
  const legacy = runtime({ settings: { serverUrl: 'http://192.168.1.8:9000/api', autoRemoveFromWantList: true } }, {});
  assert.equal((await legacy.settings.getSettings()).developerMode, true);
  assert.equal((await legacy.settings.getSettings()).serverUrl, 'http://192.168.1.8:9000/api');
  const defaults = runtime({ settings: { serverUrl: 'http://127.0.0.1:8081/api' } }, {});
  assert.equal((await defaults.settings.getSettings()).developerMode, false);
  for (const mode of ['development', 'production']) {
    const config = configure({}, { mode });
    assert.equal(path.basename(config.output.path), 'dist');
    const copy = config.plugins.find((plugin) => { /* manifest 始终直接复制。 */ return plugin.patterns; });
    assert.equal(copy.patterns[0].transform, undefined);
    assert.equal(JSON.parse(fs.readFileSync(copy.patterns[0].from)).name, 'Curated Plugin');
  }
  console.log('Developer setting: toggle, address persistence, legacy settings passed');
}
main().catch((error) => { /* 测试失败返回非零退出码。 */ console.error(error); process.exitCode = 1; });
