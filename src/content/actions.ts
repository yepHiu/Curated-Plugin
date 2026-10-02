import { ensureStyles, showToast } from '@/content/styles';
import { sendMessage } from '@/utils/messaging';

interface TagClickData {
  code: string;
  movieId?: string;
  status: 'in' | 'out';
}

export function showImportGuide(code: string): void {
  ensureStyles();

  const previousFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'curated-guide-overlay';

  const modal = document.createElement('div');
  modal.className = 'curated-guide-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'curated-guide-title');
  modal.setAttribute('aria-describedby', 'curated-guide-desc');

  const title = document.createElement('h3');
  title.id = 'curated-guide-title';
  title.textContent = `${code} 未入库`;

  const desc = document.createElement('p');
  desc.id = 'curated-guide-desc';
  desc.textContent =
    '该番号尚未在 Curated 媒体库中找到。你可以复制番号后在 Curated 中搜索，或导入视频文件后由服务端自动刮削元数据。';

  const actions = document.createElement('div');
  actions.className = 'curated-guide-actions';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'curated-banner-btn';
  copyBtn.dataset.action = 'copy';
  copyBtn.textContent = '复制番号';

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'curated-banner-btn';
  searchBtn.dataset.action = 'search';
  searchBtn.textContent = '在 Curated 中搜索';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'curated-banner-btn secondary';
  closeBtn.dataset.action = 'close';
  closeBtn.textContent = '关闭';

  actions.append(copyBtn, searchBtn, closeBtn);
  modal.append(title, desc, actions);
  overlay.append(modal);

  const focusables = () =>
    Array.from(
      modal.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
    );

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    previousFocus?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  overlay.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target === overlay) {
      close();
      return;
    }
    const action = target.closest('[data-action]') as HTMLElement | null;
    if (!action) return;

    switch (action.dataset.action) {
      case 'copy':
        await navigator.clipboard.writeText(code);
        showToast('番号已复制');
        break;
      case 'search':
        await sendMessage({ type: 'OPEN_CURATED_MOVIE', payload: { code } });
        close();
        break;
      case 'close':
        close();
        break;
    }
  });

  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  copyBtn.focus();
}

export function bindTagClick(tagEl: HTMLElement, data: TagClickData): void {
  const hint =
    data.status === 'in' ? '点击在 Curated 中查看' : '点击查看导入引导';
  tagEl.title = hint;

  const activate = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (data.status === 'in' && data.movieId) {
        await sendMessage({
          type: 'OPEN_CURATED_MOVIE',
          payload: { code: data.code, movieId: data.movieId },
        });
      } else if (data.status === 'out') {
        showImportGuide(data.code);
      }
    } catch (err) {
      showToast(`操作失败: ${(err as Error).message}`);
    }
  };

  tagEl.addEventListener('click', activate);
  tagEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      activate(e);
    }
  });
}

export async function openCuratedPlayback(movieId: string): Promise<void> {
  try {
    const { url } = await sendMessage<{ url: string }>({
      type: 'GET_PLAYBACK_URL',
      payload: { movieId },
    });
    window.open(url, '_blank');
  } catch (err) {
    showToast(`播放失败: ${(err as Error).message}`);
  }
}

export async function openCuratedMovie(
  code: string,
  movieId?: string
): Promise<void> {
  await sendMessage({
    type: 'OPEN_CURATED_MOVIE',
    payload: { code, movieId },
  });
}
