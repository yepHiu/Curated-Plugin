import { openCuratedMovie } from '@/content/actions';
import { ensureStyles, showToast } from '@/content/styles';
import type { LibraryMatch, LibraryStatus, ScanStats } from '@/types/movie';
import { getJavdbSearchUrl } from '@/utils/javdb-search';
import { extractMissavCodeFromUrl, isMissavHost } from '@/utils/missav-url';
import { sendMessage } from '@/utils/messaging';

const BAR_ID = 'curated-missav-titlebar';
const LABELS: Record<LibraryStatus, string> = {
  pending: '查询中', in: '已入库', out: '未入库', error: '查询失败',
};
let observersBound = false;
let querySeq = 0;

export function isMissavPage(): boolean {
  return isMissavHost(location.hostname);
}

export function extractMissavCode(): string {
  return extractMissavCodeFromUrl(location.href);
}

export function isMissavVideoPage(): boolean {
  return !!extractMissavCode();
}

/** 实际页面的影片标题为 h1；只挂到与当前网址番号一致的标题。 */
function findTitle(code: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('h1')).find((el) => {
    const text = (el.textContent ?? '').trim().toUpperCase().replace(/_/g, '-');
    return text === code || text.startsWith(`${code} `) || text.startsWith(`${code}\u3000`);
  });
}

export function getMissavScanStats(): ScanStats {
  const code = extractMissavCode();
  const bar = document.getElementById(BAR_ID);
  const status = bar?.dataset.code === code ? bar.dataset.status as LibraryStatus : undefined;
  return {
    page: 'missav', total: code ? 1 : 0, withCode: code ? 1 : 0,
    inLibrary: status === 'in' ? 1 : 0, outLibrary: status === 'out' ? 1 : 0,
    pending: status === 'pending' ? 1 : 0, errors: status === 'error' ? 1 : 0,
    detailStatus: code ? status : undefined,
  };
}

function createTitlebar(code: string, status: LibraryStatus, match?: LibraryMatch): HTMLElement {
  const bar = document.createElement('div');
  bar.id = BAR_ID;
  // 复用已有流媒体详情页的深色状态条样式。
  bar.className = 'curated-jable-titlebar curated-host-dark';
  bar.dataset.code = code;
  bar.dataset.status = status;

  const chip = document.createElement('span');
  chip.className = `curated-jable-chip curated-jable-status ${status}`;
  chip.textContent = LABELS[status];
  chip.setAttribute('aria-label', `入库状态：${LABELS[status]}`);
  chip.setAttribute('role', 'status');
  if (status === 'in' && match?.movieId) {
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    chip.title = '在 Curated 中查看';
    const open = (event: Event) => {
      event.preventDefault();
      void openCuratedMovie(code, match.movieId).catch((err: Error) => showToast(`打开失败: ${err.message}`));
    };
    chip.addEventListener('click', open);
    chip.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  }
  const link = document.createElement('a');
  link.className = 'curated-jable-chip curated-jable-link';
  link.href = getJavdbSearchUrl(code);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'JavDB';
  link.title = `在 JavDB 搜索 ${code}`;
  bar.append(chip, link);
  return bar;
}

async function queryAndRender(options?: { skipCache?: boolean }): Promise<void> {
  const code = extractMissavCode();
  const title = code ? findTitle(code) : undefined;
  const existing = document.getElementById(BAR_ID);
  if (!title) {
    ++querySeq;
    existing?.remove();
    return;
  }
  if (existing?.dataset.code === code && !options?.skipCache) return;

  ensureStyles();
  const bar = createTitlebar(code, 'pending');
  existing?.remove();
  title.insertAdjacentElement('afterend', bar);
  const seq = ++querySeq;
  try {
    const { matchMap } = await sendMessage<{ matchMap: Record<string, LibraryMatch> }>({
      type: 'CHECK_MOVIE_CODES', payload: { codes: [code], skipCache: options?.skipCache },
    });
    if (seq !== querySeq || extractMissavCode() !== code || !bar.isConnected) return;
    const match = matchMap[code];
    bar.replaceWith(createTitlebar(code, match?.inLibrary ? 'in' : match ? 'out' : 'error', match));
  } catch (err) {
    if (seq !== querySeq || extractMissavCode() !== code || !bar.isConnected) return;
    bar.replaceWith(createTitlebar(code, 'error'));
    showToast(err instanceof Error ? err.message : String(err));
  }
}

export async function initMissavPage(options?: { skipCache?: boolean }): Promise<void> {
  if (!isMissavPage()) return;
  // 在首次请求完成前观察标题变化，避免动态页面丢失一次更新。
  if (!observersBound) {
    observersBound = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { void queryAndRender(); };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('popstate', refresh);
    window.addEventListener('pagehide', () => {
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener('popstate', refresh);
      ++querySeq;
    }, { once: true });
  }
  await queryAndRender(options);
}
