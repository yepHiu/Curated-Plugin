import { initWishlistButtons, refreshWishlistButtons } from '@/content/wishlist';
import '@/ui/tokens.css';
import '@/ui/injected.css';
import { initDetailPage, isDetailPage } from '@/content/detail';
import { extractAllCards } from '@/content/extract';
import { initJablePage, isJablePage, getJableScanStats } from '@/content/jable';
import { initMissavPage, isMissavPage, getMissavScanStats } from '@/content/missav';
import { showToast } from '@/content/styles';
import {
  collectScanStats,
  observeNewCards,
  tagAllCards,
} from '@/content/tagging';
import {
  batchDeleteTaggedCards,
  countTaggedInLibrary,
} from '@/content/want-list';
import type { TaggingResult } from '@/types/movie';
import { saveDeleteTask, type DeleteTask } from '@/utils/delete-task';

const JAVDB_HOST = 'javdb.com';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isTagging = false;
let isDeleting = false;

function isJavdbPage(): boolean {
  return window.location.hostname.includes(JAVDB_HOST);
}

function isListPage(): boolean {
  return !!document.querySelector('#videos .item');
}

async function runTagging(skipCache = false): Promise<TaggingResult> {
  if (isTagging) {
    return {
      total: 0,
      tagged: 0,
      inLibrary: 0,
      outLibrary: 0,
      skipped: 0,
      errors: 0,
    };
  }
  isTagging = true;
  try {
    const result = await tagAllCards({ skipCache });
    console.log('[Curated Plugin] Tagging complete:', result);
    return result;
  } finally {
    isTagging = false;
  }
}

function scheduleTagging(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runTagging();
  }, 500);
}

async function init(): Promise<void> {
  if (isMissavPage()) {
    await initMissavPage();
    return;
  }
  if (isJablePage()) {
    console.log('[Curated Plugin] Content script active on', window.location.href);
    await initJablePage();
    return;
  }

  if (!isJavdbPage()) return;

  console.log('[Curated Plugin] Content script active on', window.location.href);

  if (isDetailPage()) {
    await initDetailPage();
  }

  if (isListPage()) {
    await runTagging();
    observeNewCards(scheduleTagging);
  }
}

async function runBatchDeleteAsync(task: DeleteTask): Promise<void> {
  try {
    const result = await batchDeleteTaggedCards();
    await saveDeleteTask(task, {
      id: task.id, status: 'completed', result,
    });

    if (result.failed > 0) {
      showToast(`已删除 ${result.deleted} 部，删除失败 ${result.failed} 部`);
    } else if (result.deleted > 0) {
      showToast(`已删除 ${result.deleted} 部已入库影片`);
    } else {
      showToast('本页无已入库影片，请先扫描');
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      await saveDeleteTask(task, { id: task.id, status: 'failed', error });
    } catch (storageError) {
      console.warn('[Curated Plugin] 无法保存删除结果:', storageError);
    }
    showToast(`删除结果异常: ${error}`);
  } finally {
    isDeleting = false;
  }
}

async function startBatchDelete(task: DeleteTask): Promise<{ started: boolean; total: number }> {
  if (!task || typeof task.id !== 'string' || !task.id || !Number.isInteger(task.tabId) || task.tabId < 0) {
    throw new Error('插件已更新，请刷新网页后重试');
  }
  if (isDeleting) throw new Error('删除任务进行中，请稍候');
  const total = countTaggedInLibrary();
  if (total === 0) return { started: false, total };
  isDeleting = true;
  try {
    // Initialize before acknowledging; no stale result or unhandled storage failure.
    await saveDeleteTask(task, { id: task.id, status: 'pending' });
  } catch (err) {
    isDeleting = false;
    throw err;
  }
  void runBatchDeleteAsync(task).catch((err) => console.warn('[Curated Plugin] 删除任务异常:', err));
  return { started: true, total };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RESCAN') {
    if (isMissavPage()) {
      initMissavPage({ skipCache: true })
        .then(async () => { await refreshWishlistButtons(); sendResponse({ ok: true, stats: getMissavScanStats() }); })
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;
    }
    if (isJablePage()) {
      initJablePage({ skipCache: true })
        .then(async () => { await refreshWishlistButtons(); sendResponse({ ok: true, stats: getJableScanStats() }); })
        .catch((err: Error) => sendResponse({ error: err.message }));
      return true;
    }
    const tasks: Promise<unknown>[] = [];
    if (isListPage()) tasks.push(runTagging(true));
    if (isDetailPage()) tasks.push(initDetailPage({ skipCache: true }));
    Promise.all(tasks)
      .then(async () => { await refreshWishlistButtons(); sendResponse({ ok: true, stats: collectScanStats() }); })
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'BATCH_DELETE_WANT_LIST') {
    startBatchDelete(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
    return true;
  }
  if (message.type === 'GET_MOVIES') {
    sendResponse({ movies: extractAllCards() });
    return true;
  }
  if (message.type === 'GET_SCAN_STATS') {
    sendResponse(isMissavPage() ? getMissavScanStats() : isJablePage() ? getJableScanStats() : collectScanStats());
    return true;
  }
  return false;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 内容脚本在 document_idle 运行，挂载各站点愿望入口。
initWishlistButtons();
