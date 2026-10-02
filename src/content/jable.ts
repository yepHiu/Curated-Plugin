import { openCuratedMovie } from '@/content/actions';
import { ensureStyles, showToast } from '@/content/styles';
import type { LibraryMatch, LibraryStatus, ScanStats } from '@/types/movie';
import { sendMessage } from '@/utils/messaging';
import {
  extractJableCodeFromUrl,
  getJavdbSearchUrl,
  isJableHost,
  normalizeMovieCode,
} from '@/utils/javdb-search';

const BAR_ID = 'curated-jable-titlebar';

const TITLE_SELECTORS = [
  '.info-header .header-left h4',
  '.info-header .header-left h6',
  '.header-left h4',
  '.header-left h6',
  'h1.title',
  'h4',
  '.video-title',
  'h2.h3-md',
];

const STATUS_LABELS: Record<LibraryStatus, string> = {
  pending: '查询中',
  in: '已入库',
  out: '未入库',
  error: '查询失败',
};

let observersBound = false;
let querySeq = 0;
let lastCode = '';
let lastStatus: LibraryStatus = 'pending';
let lastMatch: LibraryMatch | null = null;

export function isJablePage(): boolean {
  return isJableHost(window.location.hostname);
}

export function isJableVideoPage(): boolean {
  return isJablePage() && /\/videos\/[^/]+/i.test(window.location.pathname);
}

export function extractJableCode(): string {
  const fromUrl = extractJableCodeFromUrl(window.location.href);
  if (fromUrl) return fromUrl;

  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content');
  if (ogTitle) {
    const fromOg = normalizeMovieCode(ogTitle.split(/\s+/)[0] ?? '');
    if (fromOg) return fromOg;
  }

  const heading = findTitleEl();
  const headingText = heading?.textContent?.trim() ?? '';
  return normalizeMovieCode(headingText.split(/\s+/)[0] ?? '');
}

export function getJableScanStats(): ScanStats {
  const code = extractJableCode();
  const bar = document.getElementById(BAR_ID);
  const status = (bar?.dataset.status as LibraryStatus | undefined) ?? lastStatus;

  return {
    page: 'jable',
    total: code ? 1 : 0,
    withCode: code ? 1 : 0,
    inLibrary: status === 'in' ? 1 : 0,
    outLibrary: status === 'out' ? 1 : 0,
    pending: status === 'pending' ? 1 : 0,
    errors: status === 'error' ? 1 : 0,
    detailStatus: code ? status : undefined,
  };
}

function findTitleEl(): HTMLElement | null {
  const code = extractJableCodeFromUrl(window.location.href).toLowerCase();

  for (const selector of TITLE_SELECTORS) {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) continue;
    if (!code || (el.textContent ?? '').toLowerCase().includes(code)) {
      return el;
    }
  }

  const headings = Array.from(
    document.querySelectorAll('h4, h6, h1, h2')
  ) as HTMLElement[];
  return (
    headings.find((el) =>
      (el.textContent ?? '').toLowerCase().includes(code)
    ) ?? null
  );
}

function createChip(
  text: string,
  className: string
): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.className = className;
  chip.textContent = text;
  return chip;
}

function createTitlebar(
  code: string,
  status: LibraryStatus,
  match?: LibraryMatch | null
): HTMLElement {
  const bar = document.createElement('div');
  bar.id = BAR_ID;
  bar.className = 'curated-jable-titlebar curated-host-dark';
  bar.dataset.code = code;
  bar.dataset.status = status;

  const statusChip = createChip(
    STATUS_LABELS[status],
    `curated-jable-chip curated-jable-status ${status}`
  );
  statusChip.setAttribute('aria-label', `入库状态：${STATUS_LABELS[status]}`);

  if (status === 'in' && match?.movieId) {
    statusChip.setAttribute('role', 'button');
    statusChip.tabIndex = 0;
    statusChip.title = '在 Curated 中查看';
    const openCurated = (e: Event) => {
      e.preventDefault();
      openCuratedMovie(code, match.movieId).catch((err) =>
        showToast(`打开失败: ${(err as Error).message}`)
      );
    };
    statusChip.addEventListener('click', openCurated);
    statusChip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openCurated(e);
    });
  }

  const javdbLink = document.createElement('a');
  javdbLink.className = 'curated-jable-chip curated-jable-link';
  javdbLink.href = getJavdbSearchUrl(code);
  javdbLink.target = '_blank';
  javdbLink.rel = 'noopener noreferrer';
  javdbLink.textContent = 'JavDB';
  javdbLink.title = `在 JavDB 搜索 ${code}`;

  bar.append(statusChip, javdbLink);
  return bar;
}

function mountTitlebar(bar: HTMLElement): void {
  const existing = document.getElementById(BAR_ID);
  if (existing) {
    existing.replaceWith(bar);
    return;
  }

  const title = findTitleEl();
  if (title) {
    title.insertAdjacentElement('afterend', bar);
    return;
  }

  const fallback =
    document.querySelector('.info-header .header-left') ??
    document.querySelector('.header-left') ??
    document.querySelector('.container');
  fallback?.prepend(bar);
}

async function queryAndRender(options?: { skipCache?: boolean }): Promise<void> {
  if (!isJableVideoPage()) {
    document.getElementById(BAR_ID)?.remove();
    lastCode = '';
    lastStatus = 'pending';
    lastMatch = null;
    return;
  }

  ensureStyles();
  const code = extractJableCode();
  if (!code) return;

  const existing = document.getElementById(BAR_ID);
  const sameCode = code === lastCode;

  if (sameCode && lastStatus !== 'pending' && !options?.skipCache) {
    if (!existing) {
      mountTitlebar(createTitlebar(code, lastStatus, lastMatch));
    }
    return;
  }

  lastCode = code;
  lastStatus = 'pending';
  lastMatch = null;
  mountTitlebar(createTitlebar(code, 'pending'));

  const seq = ++querySeq;
  try {
    const { matchMap } = await sendMessage<{
      matchMap: Record<string, LibraryMatch>;
    }>({
      type: 'CHECK_MOVIE_CODES',
      payload: { codes: [code], skipCache: options?.skipCache },
    });

    if (seq !== querySeq || extractJableCode() !== code) return;

    const match = matchMap[code];
    lastStatus = match?.inLibrary ? 'in' : match ? 'out' : 'error';
    lastMatch = match ?? null;
    mountTitlebar(createTitlebar(code, lastStatus, lastMatch));
  } catch (err) {
    if (seq !== querySeq) return;
    lastStatus = 'error';
    lastMatch = null;
    mountTitlebar(createTitlebar(code, 'error'));
    showToast((err as Error).message);
  }
}

export async function initJablePage(options?: {
  skipCache?: boolean;
}): Promise<void> {
  if (!isJablePage()) return;

  await queryAndRender(options);

  if (observersBound) return;
  observersBound = true;

  let lastPath = window.location.pathname;
  const refresh = () => {
    const pathChanged = window.location.pathname !== lastPath;
    lastPath = window.location.pathname;
    if (pathChanged) {
      lastCode = '';
      lastStatus = 'pending';
      lastMatch = null;
    }
    if (pathChanged || !document.getElementById(BAR_ID)) {
      void queryAndRender();
    }
  };

  window.addEventListener('popstate', refresh);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, 400);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
