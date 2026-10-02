import { openCuratedMovie, openCuratedPlayback, showImportGuide } from '@/content/actions';
import { ensureStyles, showToast } from '@/content/styles';
import type { LibraryMatch, LibraryStatus } from '@/types/movie';
import { sendMessage } from '@/utils/messaging';

const BANNER_ID = 'curated-detail-banner';

export function isDetailPage(): boolean {
  return /^\/v\/[A-Za-z0-9]+/.test(window.location.pathname);
}

export function extractDetailCode(): string {
  const selectors = [
    'h2.title strong',
    'h2 strong',
    '.movie-panel-info .value:first-child',
    '.video-title strong',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text && /[A-Za-z0-9]/.test(text)) {
      return text;
    }
  }

  const titleMatch = document.title.match(/^([A-Za-z0-9]+-[A-Za-z0-9]+)/);
  return titleMatch?.[1] ?? '';
}

interface BannerState {
  code: string;
  status: LibraryStatus;
  match?: LibraryMatch | null;
}

function createBannerButton(
  label: string,
  variant: 'primary' | 'secondary',
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    variant === 'secondary' ? 'curated-banner-btn secondary' : 'curated-banner-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function createBanner(state: BannerState): HTMLElement {
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'curated-detail-banner';

  const labels: Record<LibraryStatus, string> = {
    pending: '查询中',
    in: '已入库',
    out: '未入库',
    error: '查询失败',
  };

  const statusEl = document.createElement('span');
  statusEl.className = `curated-banner-status ${state.status}`;
  statusEl.textContent = labels[state.status];

  const codeEl = document.createElement('span');
  codeEl.className = 'curated-banner-code';
  codeEl.textContent = state.code;

  const spacer = document.createElement('span');
  spacer.className = 'curated-banner-spacer';

  banner.append(statusEl, codeEl, spacer);

  if (state.status === 'in' && state.match?.movieId) {
    const movieId = state.match.movieId;
    banner.append(
      createBannerButton('在 Curated 中查看', 'secondary', () => {
        openCuratedMovie(state.code, movieId).catch((err) =>
          showToast(`打开失败: ${(err as Error).message}`)
        );
      }),
      createBannerButton('播放', 'primary', () => {
        openCuratedPlayback(movieId).catch((err) =>
          showToast(`播放失败: ${(err as Error).message}`)
        );
      })
    );
  } else if (state.status === 'out') {
    banner.append(
      createBannerButton('导入引导', 'primary', () => {
        showImportGuide(state.code);
      }),
      createBannerButton('在 Curated 搜索', 'secondary', () => {
        openCuratedMovie(state.code).catch((err) =>
          showToast(`打开失败: ${(err as Error).message}`)
        );
      })
    );
  }

  return banner;
}

function findBannerMountPoint(): Element | null {
  return (
    document.querySelector('section .container') ??
    document.querySelector('section.section .container') ??
    document.querySelector('.movie-panel') ??
    document.querySelector('section')
  );
}

function replaceBanner(current: HTMLElement, next: HTMLElement): HTMLElement {
  current.replaceWith(next);
  return next;
}

export async function initDetailPage(options?: {
  skipCache?: boolean;
}): Promise<void> {
  if (!isDetailPage()) return;

  ensureStyles();
  const code = extractDetailCode();
  if (!code) return;

  const mount = findBannerMountPoint();
  if (!mount) return;

  let banner = document.getElementById(BANNER_ID);
  const pending = createBanner({ code, status: 'pending' });
  if (!banner) {
    mount.prepend(pending);
    banner = pending;
  } else {
    banner = replaceBanner(banner, pending);
  }

  try {
    const { matchMap } = await sendMessage<{
      matchMap: Record<string, LibraryMatch>;
    }>({
      type: 'CHECK_MOVIE_CODES',
      payload: { codes: [code], skipCache: options?.skipCache },
    });

    const match = matchMap[code];
    if (!match) {
      replaceBanner(banner, createBanner({ code, status: 'error' }));
      return;
    }

    replaceBanner(
      banner,
      createBanner({
        code,
        status: match.inLibrary ? 'in' : 'out',
        match,
      })
    );
  } catch (err) {
    replaceBanner(banner, createBanner({ code, status: 'error' }));
    showToast((err as Error).message);
  }
}
