import './index.css';
import type { WishlistReceipt } from '@/api/wishlist';
import type { ScanStats } from '@/types/movie';
import { waitForDeleteResult, type DeleteTask } from '@/utils/delete-task';
import { setButtonBusy } from '@/ui/button-state';
import {
  extractJableCodeFromUrl,
  getJavdbSearchUrl,
  isJableHost,
} from '@/utils/javdb-search';
import {
  sendMessage,
  sendTabMessage,
  type TabInfo,
} from '@/utils/messaging';

const serverStatusEl = document.getElementById('server-status')!;
const pageStatusEl = document.getElementById('page-status')!;
const statusEl = document.getElementById('status')!;
const scanStatsEl = document.getElementById('scan-stats')!;
const statInEl = document.getElementById('stat-in')!;
const statOutEl = document.getElementById('stat-out')!;
const statErrorEl = document.getElementById('stat-error')!;
const rescanBtn = document.getElementById('rescan-btn') as HTMLButtonElement;
const deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement;
const deleteSlot = document.getElementById('delete-slot')!;
const optionsBtn = document.getElementById('options-btn')!;
const confirmOverlay = document.getElementById('confirm-overlay')!;
const confirmBody = document.getElementById('confirm-body')!;
const confirmCancel = document.getElementById(
  'confirm-cancel'
) as HTMLButtonElement;
const confirmOk = document.getElementById('confirm-ok') as HTMLButtonElement;

function setStatus(text: string, type: 'success' | 'error' | '' = ''): void {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function renderInfoCard(
  el: HTMLElement,
  label: string,
  value: string,
  detail?: string,
  tone?: 'success' | 'danger'
): void {
  el.replaceChildren();

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'value';
  if (tone) {
    const dot = document.createElement('span');
    dot.className = `status-dot ${tone}`;
    dot.setAttribute('aria-hidden', 'true');
    valueEl.append(dot);
  }
  valueEl.append(document.createTextNode(value));

  el.append(labelEl, valueEl);

  if (detail) {
    const detailEl = document.createElement('div');
    detailEl.className = 'detail';
    detailEl.textContent = detail;
    el.append(detailEl);
  }
}

function isWantWatchPage(url?: string): boolean {
  return !!url?.includes('/users/want_watch_videos');
}

function renderScanStats(stats: ScanStats | null): void {
  if (!stats || stats.page !== 'list' || stats.total === 0) {
    scanStatsEl.hidden = true;
    return;
  }

  statInEl.textContent = String(stats.inLibrary);
  statOutEl.textContent = String(stats.outLibrary);
  statErrorEl.textContent = String(stats.errors);
  scanStatsEl.hidden = false;
}

async function loadServerStatus(): Promise<void> {
  try {
    const result = await sendMessage<{
      ok: boolean;
      health: { name: string; version: string };
    }>({ type: 'CHECK_HEALTH' });
    renderInfoCard(
      serverStatusEl,
      '服务端',
      '已连接',
      `${result.health.name} · ${result.health.version}`,
      'success'
    );
  } catch (err) {
    renderInfoCard(
      serverStatusEl,
      '服务端',
      '未连接',
      (err as Error).message,
      'danger'
    );
  }
}

function getHostname(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function setPrimaryMode(mode: 'rescan' | 'javdb-search'): void {
  rescanBtn.dataset.mode = mode;
  rescanBtn.textContent = mode === 'javdb-search' ? '在 JavDB 搜索' : '重新扫描';
}

async function loadPageStatus(tab: TabInfo): Promise<void> {
  const hostname = getHostname(tab.url);
  const isJable = isJableHost(hostname);
  const isJavdb = hostname.includes('javdb.com');
  const isList = isJavdb && !tab.url?.match(/\/v\/[A-Za-z0-9]+/);
  const isWantWatch = isWantWatchPage(tab.url);

  deleteSlot.hidden = !isWantWatch;
  deleteBtn.disabled = true;
  renderScanStats(null);
  setPrimaryMode('rescan');

  if (isJable) {
    const code = tab.url ? extractJableCodeFromUrl(tab.url) : '';
    if (!code) {
      renderInfoCard(pageStatusEl, '当前页面', 'Jable', '请打开影片详情页');
      rescanBtn.disabled = true;
      return;
    }

    let detail = `${code} · 可跳转 JavDB 搜索`;
    if (tab.id) {
      try {
        const stats = await sendTabMessage<ScanStats>(tab.id, {
          type: 'GET_SCAN_STATS',
        });
        if (stats.detailStatus === 'in') detail = `${code} · 已入库`;
        else if (stats.detailStatus === 'out') detail = `${code} · 未入库`;
        else if (stats.detailStatus === 'error') detail = `${code} · 查询失败`;
        else if (stats.detailStatus === 'pending') detail = `${code} · 查询中`;
      } catch {
        /* keep default copy */
      }
    }

    renderInfoCard(pageStatusEl, '当前页面', 'Jable 影片页', detail);
    setPrimaryMode('javdb-search');
    rescanBtn.disabled = false;
    return;
  }

  if (!isJavdb || !tab.id) {
    renderInfoCard(
      pageStatusEl,
      '当前页面',
      '非目标页面',
      '请打开 JavDB 或 Jable 影片页'
    );
    rescanBtn.disabled = true;
    return;
  }

  if (!isList) {
    let detail = '顶部横幅显示入库状态';
    try {
      const stats = await sendTabMessage<ScanStats>(tab.id, {
        type: 'GET_SCAN_STATS',
      });
      if (stats.detailStatus === 'in') detail = '已入库，可从横幅打开或播放';
      else if (stats.detailStatus === 'out') detail = '未入库，可从横幅导入';
      else if (stats.detailStatus === 'error') detail = '查询失败，请重新扫描';
      else if (stats.detailStatus === 'pending') detail = '正在查询入库状态';
    } catch {
      /* keep default copy */
    }
    renderInfoCard(pageStatusEl, '当前页面', '影片详情页', detail);
    rescanBtn.disabled = false;
    return;
  }

  try {
    const stats = await sendTabMessage<ScanStats>(tab.id, {
      type: 'GET_SCAN_STATS',
    });
    renderScanStats(stats);
    renderInfoCard(
      pageStatusEl,
      '当前页面',
      isWantWatch ? '想看列表' : '影片列表',
      `${stats.total} 张卡片 · ${stats.withCode} 个含番号`
    );
    rescanBtn.disabled = false;
    deleteBtn.disabled = !isWantWatch || stats.inLibrary === 0;
  } catch {
    renderInfoCard(
      pageStatusEl,
      '当前页面',
      '无法读取',
      '请刷新页面后重试'
    );
    rescanBtn.disabled = true;
  }
}

rescanBtn.addEventListener('click', async () => {
  if (rescanBtn.dataset.mode === 'javdb-search') {
    const tab = await sendMessage<TabInfo>({ type: 'GET_TAB_INFO' });
    const code = tab.url ? extractJableCodeFromUrl(tab.url) : '';
    if (!code) {
      setStatus('无法识别番号', 'error');
      return;
    }
    await chrome.tabs.create({ url: getJavdbSearchUrl(code) });
    return;
  }

  setStatus('扫描中...');
  setButtonBusy(rescanBtn, true, '扫描中...');
  try {
    const tab = await sendMessage<TabInfo>({ type: 'GET_TAB_INFO' });
    if (!tab.id) throw new Error('无法获取当前标签页');

    await sendTabMessage(tab.id, { type: 'RESCAN' });
    setStatus('扫描完成', 'success');
    setButtonBusy(rescanBtn, false);
    await loadPageStatus(tab);
  } catch (err) {
    setButtonBusy(rescanBtn, false);
    setStatus(`扫描失败: ${(err as Error).message}`, 'error');
  }
});

function closeConfirm(): void {
  confirmOverlay.hidden = true;
  deleteBtn.focus();
}

function openConfirm(count: number): Promise<boolean> {
  confirmBody.textContent = `确定删除本页 ${count} 部已入库影片？此操作不可撤销。`;
  confirmOverlay.hidden = false;
  confirmOk.focus();

  return new Promise((resolve) => {
    const cleanup = () => {
      confirmCancel.removeEventListener('click', onCancel);
      confirmOk.removeEventListener('click', onOk);
      confirmOverlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
    };
    const onCancel = () => {
      cleanup();
      closeConfirm();
      resolve(false);
    };
    const onOk = () => {
      cleanup();
      closeConfirm();
      resolve(true);
    };
    const onOverlay = (e: MouseEvent) => {
      if (e.target === confirmOverlay) onCancel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (e.key !== 'Tab') return;
      const items = [confirmCancel, confirmOk];
      const first = items[0];
      const last = items[1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    confirmCancel.addEventListener('click', onCancel);
    confirmOk.addEventListener('click', onOk);
    confirmOverlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
  });
}

deleteBtn.addEventListener('click', async () => {
  const tab = await sendMessage<TabInfo>({ type: 'GET_TAB_INFO' });
  if (!tab.id) {
    setStatus('无法获取当前标签页', 'error');
    return;
  }

  let count = 0;
  try {
    const stats = await sendTabMessage<ScanStats>(tab.id, {
      type: 'GET_SCAN_STATS',
    });
    count = stats.inLibrary;
  } catch {
    setStatus('无法读取页面状态，请刷新后重试', 'error');
    return;
  }

  if (count === 0) {
    setStatus('本页无已入库影片，请先扫描', 'error');
    return;
  }

  const confirmed = await openConfirm(count);
  if (!confirmed) return;

  setStatus('启动删除...');
  setButtonBusy(deleteBtn, true, '删除中...');
  try {
    const task: DeleteTask = { id: crypto.randomUUID(), tabId: tab.id };
    const { started, total } = await sendTabMessage<{
      started: boolean;
      total: number;
    }>(tab.id, { type: 'BATCH_DELETE_WANT_LIST', payload: task });

    if (total === 0) {
      setStatus('本页无已入库影片，请先扫描', 'error');
      return;
    }

    if (!started) {
      setStatus('无法启动删除', 'error');
      return;
    }

    setStatus(`正在删除 ${total} 部，请保持页面打开...`, '');

    const result = await waitForDeleteResult(task);
    if (result.failed > 0) {
      setStatus(`已删除 ${result.deleted} 部，删除失败 ${result.failed} 部`, 'error');
    } else if (result.deleted > 0) {
      setStatus(`已删除 ${result.deleted} 部`, 'success');
    } else {
      setStatus('未删除任何影片', '');
    }
  } catch (err) {
    const message = (err as Error).message;
    const disconnected = /message channel closed|message port closed|Receiving end does not exist|Extension context invalidated/i.test(message);
    setStatus(disconnected
      ? '与网页的连接已断开，删除结果未确认。请刷新网页并检查想看列表后再操作'
      : `删除未完成: ${message}`, 'error');
  } finally {
    setButtonBusy(deleteBtn, false);
    await loadPageStatus(tab);
  }
});

optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function init(): Promise<void> {
  const tab = await sendMessage<TabInfo>({ type: 'GET_TAB_INFO' });
  await Promise.all([loadServerStatus(), loadPageStatus(tab)]);
}

document.getElementById('wishlist-form')!.addEventListener('submit', async (event) => { /* 手动入口与站点按钮共用严格番号协议。 */
  event.preventDefault();
  const input = document.getElementById('wishlist-code') as HTMLInputElement;
  const button = document.getElementById('wishlist-submit') as HTMLButtonElement;
  const code = input.value.trim();
  if (button.disabled || !code) return;
  button.disabled = true;
  try {
    const result = await sendMessage<WishlistReceipt>({ type: 'ADD_TO_WISHLIST', payload: { code } });
    setStatus(result.result === 'in_library' ? '已在资料库中' : result.result === 'existing' ? '已在愿望单中' : '已加入愿望单', 'success');
  } catch (error) { setStatus((error as Error).message, 'error'); }
  finally { button.disabled = false; }
});

init();
