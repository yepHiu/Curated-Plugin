const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function runtime(data = {}, tabId = 11) {
  let listener, backgroundListener, now = 0, failWrite = false, calls = 0;
  let deletion = deferred();
  const chrome = {
    runtime: {
      id: 'curated-test',
      getURL: (path) => `chrome-extension://curated-test/${path}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener(fn) { backgroundListener = fn; } },
    },
    storage: { local: {
      async get(key) { return { [key]: data[key] }; },
      async set(value) {
        if (failWrite) throw new Error('storage unavailable');
        Object.assign(data, value);
      },
    } },
  };
  const pageSender = {
    id: chrome.runtime.id, tab: { id: tabId }, frameId: 0,
    url: 'https://javdb.com/users/want_watch_videos',
  };
  function clientChrome(sender) {
    return {
      runtime: {
        onMessage: { addListener(fn) { listener = fn; } },
        sendMessage(message, callback) {
          assert.equal(backgroundListener(message, sender, callback), true);
        },
      },
      get storage() { throw new Error('Access to storage is not allowed from this context.'); },
    };
  }
  const contentChrome = clientChrome(pageSender);
  const popupChrome = clientChrome({ id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') });
  function load(file, dependencies = {}, contextChrome = chrome) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, chrome: contextChrome, Error, console,
      Date: { now: () => now },
      setTimeout(fn, ms) { now += ms; queueMicrotask(fn); },
      clearTimeout() {},
      document: { readyState: 'loading', addEventListener() {} },
      require: (name) => dependencies[name] || {},
    });
    return exports;
  }
  function taskClient(contextChrome) {
    const messaging = load('src/utils/messaging.ts', {}, contextChrome);
    return load('src/utils/delete-task.ts', { '@/utils/messaging': messaging }, contextChrome);
  }
  const tasks = taskClient(popupChrome);
  const contentTasks = taskClient(contentChrome);
  const backgroundTasks = load('src/background/delete-task.ts', { '@/utils/delete-task': tasks });
  load('src/background/index.ts', {
    '@/background/delete-task': backgroundTasks,
    '@/utils/messaging': load('src/utils/messaging.ts'),
  });
  load('src/content/index.ts', {
    '@/utils/delete-task': contentTasks,
    '@/content/wishlist': { initWishlistButtons() {} },
    '@/content/styles': { showToast() {} },
    '@/content/want-list': {
      countTaggedInLibrary: () => 2,
      batchDeleteTaggedCards() { calls++; return deletion.promise; },
    },
  }, contentChrome);
  return {
    tasks, data,
    get calls() { return calls; },
    get deletion() { return deletion; },
    setFailWrite(value) { failWrite = value; },
    resetDeletion() { deletion = deferred(); },
    sendAs(message, sender) {
      return new Promise((resolve) => backgroundListener(message, sender, resolve));
    },
    pageSender,
    start(task) {
      return new Promise((resolve) => {
        assert.equal(listener({ type: 'BATCH_DELETE_WANT_LIST', payload: task }, {}, resolve), true);
      });
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const app = runtime();
  const task = { id: 'first', tabId: 11 };
  const key = app.tasks.deleteTaskKey(task);
  const ack = await app.start(task);
  assert.equal(ack.started, true);
  assert.equal(app.data[key].status, 'pending');
  assert.equal(app.calls, 1);

  // Repeated clicks must not acknowledge a second destructive operation.
  assert.match((await app.start({ ...task, id: 'duplicate' })).error, /进行中/);
  assert.equal(app.calls, 1);
  app.deletion.resolve({ deleted: 1, failed: 1, skipped: 0 });
  await flush();
  // The waiter has no tabs API: completed results need no live page channel.
  assert.equal((await app.tasks.waitForDeleteResult(task)).failed, 1);

  // A page-side exception must reach the popup as a terminal failure.
  app.resetDeletion();
  const failedTask = { ...task, id: 'failure' };
  await app.start(failedTask);
  app.deletion.reject(new Error('delete request failed'));
  await flush();
  await assert.rejects(app.tasks.waitForDeleteResult(failedTask), /delete request failed/);

  // Storage initialization failures respond, release the lock and never delete.
  app.setFailWrite(true);
  assert.match((await app.start({ ...task, id: 'storage-failure' })).error, /storage unavailable/);
  assert.equal(app.calls, 2);
  app.setFailWrite(false);
  app.resetDeletion();
  assert.equal((await app.start({ ...task, id: 'retry' })).started, true);
  app.deletion.resolve({ deleted: 2, failed: 0, skipped: 0 });
  await flush();

  // Neither a previous run nor a second tab can supply this task's result.
  await assert.rejects(app.tasks.waitForDeleteResult(task, 1000), /未能确认删除结果/);
  const other = runtime(app.data, 22);
  const otherTask = { id: 'other-tab', tabId: 22 };
  await other.start(otherTask);
  other.deletion.resolve({ deleted: 9, failed: 0, skipped: 0 });
  await flush();
  assert.equal((await other.tasks.waitForDeleteResult(otherTask)).deleted, 9);
  assert.equal((await app.tasks.waitForDeleteResult({ ...task, id: 'retry' })).deleted, 2);

  // Background derives write authority from the actual sender, not the payload.
  const save = { type: 'SAVE_DELETE_TASK', payload: { task, state: { id: task.id, status: 'pending' } } };
  assert.match((await app.sendAs(save, { ...app.pageSender, tab: { id: 22 } })).error, /Invalid delete task writer/);
  assert.match((await app.sendAs(save, { ...app.pageSender, id: 'another-extension' })).error, /Invalid delete task sender/);
  assert.match((await app.sendAs({ type: 'READ_DELETE_TASK', payload: task }, app.pageSender)).error, /Invalid delete task reader/);
  assert.match((await app.sendAs({ ...save, payload: { task, state: { id: 'wrong', status: 'pending' } } }, app.pageSender)).error, /Invalid delete task state/);
  assert.match((await app.sendAs({ ...save, payload: { task, state: { id: task.id, status: 'completed', result: { deleted: 1, failed: 0, skipped: 0 } } } }, app.pageSender)).error, /已失效/);
  assert.equal(app.data[key].id, 'retry');

  // Navigation during deletion leaves an uncertain result, never false success.
  app.resetDeletion();
  const interrupted = { ...task, id: 'interrupted' };
  await app.start(interrupted);
  await assert.rejects(app.tasks.waitForDeleteResult(interrupted, 1000), /页面可能已关闭或刷新/);
  assert.match((await runtime().start(undefined)).error, /刷新网页/);
  console.log('Delete task lifecycle with storage-denied clients and real background routing: passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
