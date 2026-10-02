import { bindTagClick } from '@/content/actions';
import { ensureStyles } from '@/content/styles';
import {
  applyRemoveHints,
  autoRemoveIfEnabled,
} from '@/content/want-list';
import type {
  CheckMovieCodesPayload,
  LibraryMatch,
  LibraryStatus,
  ScanStats,
  TaggingResult,
} from '@/types/movie';
import { extractAllCards, getCardElement } from '@/content/extract';
import { sendMessage } from '@/utils/messaging';
import { STORAGE_KEY, type PluginSettings } from '@/utils/settings';

const TAG_CLASS = 'curated-tag';

function getOrCreateTagsContainer(card: Element): Element {
  let tagsEl = card.querySelector('.tags');
  if (!tagsEl) {
    tagsEl = document.createElement('div');
    tagsEl.className = 'tags';
    const box = card.querySelector('.box');
    if (box) {
      box.appendChild(tagsEl);
    } else {
      card.appendChild(tagsEl);
    }
  }
  return tagsEl;
}

function getExistingTag(card: Element): HTMLElement | null {
  return card.querySelector(`.${TAG_CLASS}`) as HTMLElement | null;
}

function applyTag(
  card: Element,
  status: LibraryStatus,
  code: string,
  match?: LibraryMatch
): void {
  const labels: Record<LibraryStatus, string> = {
    in: '已入库',
    out: '未入库',
    pending: '查询中',
    error: '查询失败',
  };
  const hints: Record<LibraryStatus, string> = {
    in: '已入库，点击在 Curated 中查看',
    out: '未入库，点击查看导入引导',
    pending: '正在查询入库状态',
    error: '查询失败，请稍后重试',
  };

  const tagsEl = getOrCreateTagsContainer(card);
  const existing = getExistingTag(card);
  existing?.remove();

  const tagEl = document.createElement('span');
  tagEl.textContent = labels[status];
  tagEl.className = `tag ${TAG_CLASS} curated-tag-${status}`;
  tagEl.setAttribute('role', 'button');
  tagEl.tabIndex = status === 'in' || status === 'out' ? 0 : -1;
  tagEl.setAttribute('aria-label', hints[status]);
  tagsEl.prepend(tagEl);

  if (status === 'in' || status === 'out') {
    bindTagClick(tagEl, {
      code,
      movieId: match?.movieId,
      status,
    });
  }
}

export async function tagAllCards(options?: {
  skipCache?: boolean;
}): Promise<TaggingResult> {
  ensureStyles();

  const movies = extractAllCards();
  const result: TaggingResult = {
    total: movies.length,
    tagged: 0,
    inLibrary: 0,
    outLibrary: 0,
    skipped: 0,
    errors: 0,
  };

  const withCode = movies.filter((m) => m.code);
  result.skipped = movies.length - withCode.length;

  for (const movie of withCode) {
    const card = getCardElement(movie.id);
    if (card) applyTag(card, 'pending', movie.code);
  }

  const codes = withCode.map((m) => m.code);
  const codeToCardId = new Map(withCode.map((m) => [m.code, m.id]));

  try {
    const payload: CheckMovieCodesPayload = {
      codes,
      skipCache: options?.skipCache,
    };
    const { matchMap } = await sendMessage<{
      matchMap: Record<string, LibraryMatch>;
    }>({
      type: 'CHECK_MOVIE_CODES',
      payload,
    });

    for (const movie of withCode) {
      const card = getCardElement(movie.id);
      if (!card) continue;

      const match = matchMap[movie.code];
      if (!match) {
        applyTag(card, 'error', movie.code);
        result.errors++;
        continue;
      }

      const status = match.inLibrary ? 'in' : 'out';
      applyTag(card, status, movie.code, match);
      result.tagged++;
      if (match.inLibrary) result.inLibrary++;
      else result.outLibrary++;
    }

    const settings = await sendMessage<PluginSettings>({
      type: 'STORAGE_GET',
      payload: STORAGE_KEY,
    });
    const autoRemove = settings?.autoRemoveFromWantList ?? false;

    applyRemoveHints(matchMap, codeToCardId, autoRemove);

    const deleteResult = await autoRemoveIfEnabled(
      matchMap,
      codeToCardId,
      autoRemove
    );
    if (deleteResult) {
      result.deleted = deleteResult.deleted;
      result.deleteFailed = deleteResult.failed;
    }
  } catch {
    for (const movie of withCode) {
      const card = getCardElement(movie.id);
      if (card) {
        applyTag(card, 'error', movie.code);
        result.errors++;
      }
    }
  }

  return result;
}

export function collectScanStats(): ScanStats {
  const isDetail = /^\/v\/[A-Za-z0-9]+/.test(window.location.pathname);
  if (isDetail) {
    const statusEl = document.querySelector(
      '#curated-detail-banner .curated-banner-status'
    );
    let detailStatus: LibraryStatus | undefined;
    if (statusEl?.classList.contains('in')) detailStatus = 'in';
    else if (statusEl?.classList.contains('out')) detailStatus = 'out';
    else if (statusEl?.classList.contains('pending')) detailStatus = 'pending';
    else if (statusEl?.classList.contains('error')) detailStatus = 'error';

    return {
      page: 'detail',
      total: 1,
      withCode: 1,
      inLibrary: detailStatus === 'in' ? 1 : 0,
      outLibrary: detailStatus === 'out' ? 1 : 0,
      pending: detailStatus === 'pending' ? 1 : 0,
      errors: detailStatus === 'error' ? 1 : 0,
      detailStatus,
    };
  }

  const movies = extractAllCards();
  if (movies.length > 0 || document.querySelector('#videos')) {
    return {
      page: 'list',
      total: movies.length,
      withCode: movies.filter((m) => m.code).length,
      inLibrary: document.querySelectorAll('#videos .item .curated-tag-in')
        .length,
      outLibrary: document.querySelectorAll('#videos .item .curated-tag-out')
        .length,
      pending: document.querySelectorAll('#videos .item .curated-tag-pending')
        .length,
      errors: document.querySelectorAll('#videos .item .curated-tag-error')
        .length,
    };
  }

  return {
    page: 'other',
    total: 0,
    withCode: 0,
    inLibrary: 0,
    outLibrary: 0,
    pending: 0,
    errors: 0,
  };
}

export function observeNewCards(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    const hasNewCards = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) =>
          node instanceof Element &&
          (node.classList?.contains('item') || node.querySelector?.('.item'))
      )
    );
    if (hasNewCards) callback();
  });

  const container = document.querySelector('#videos') ?? document.body;
  observer.observe(container, { childList: true, subtree: true });
  return observer;
}
