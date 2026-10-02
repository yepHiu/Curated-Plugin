import { showToast } from '@/content/styles';
import type { DeleteResult, LibraryMatch } from '@/types/movie';

const HINT_CLASS = 'curated-remove-hint';
const DELETE_DELAY_MS = 400;

export function isWantWatchPage(): boolean {
  return window.location.pathname.includes('/users/want_watch_videos');
}

function getCsrfToken(): string {
  return (
    document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute('content') ?? ''
  );
}

function getDeleteUrl(card: Element): string | null {
  const link = card.querySelector(
    '.meta-buttons a[data-method="delete"]'
  ) as HTMLAnchorElement | null;
  return link?.href ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeCardFromDom(card: Element): void {
  const el = card as HTMLElement;
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  if (reduceMotion) {
    el.remove();
    return;
  }
  el.style.transition = 'opacity 0.3s, transform 0.3s';
  el.style.opacity = '0';
  el.style.transform = 'scale(0.95)';
  setTimeout(() => el.remove(), 300);
}

export async function deleteWantListItem(deleteUrl: string): Promise<void> {
  const token = getCsrfToken();
  if (!token) {
    throw new Error('未找到 CSRF Token，请确认已登录 JavDB');
  }

  const headers: Record<string, string> = {
    'X-CSRF-Token': token,
    'X-Requested-With': 'XMLHttpRequest',
    Accept:
      'text/javascript, application/javascript, application/signed-exchange;v=b3;q=0.7,*/*;q=0.8',
  };

  let res = await fetch(deleteUrl, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const body = new URLSearchParams();
    body.set('_method', 'delete');
    body.set('authenticity_token', token);
    res = await fetch(deleteUrl.split('?')[0], {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  }

  if (!res.ok) {
    throw new Error(`删除失败 (${res.status})`);
  }
}

export async function batchDeleteInLibrary(
  matches: Record<string, LibraryMatch>,
  codeToCardId: Map<string, string>
): Promise<DeleteResult> {
  if (!isWantWatchPage()) {
    return { deleted: 0, failed: 0, skipped: 0 };
  }

  const toDelete: Array<{ code: string; cardId: string }> = [];
  for (const [code, match] of Object.entries(matches)) {
    if (!match.inLibrary) continue;
    const cardId = codeToCardId.get(code);
    if (cardId) toDelete.push({ code, cardId });
  }

  return batchDeleteCards(toDelete);
}

export async function batchDeleteTaggedCards(): Promise<DeleteResult> {
  if (!isWantWatchPage()) {
    return { deleted: 0, failed: 0, skipped: 0 };
  }

  const cards = document.querySelectorAll('#videos .item');
  const toDelete: Array<{ code: string; cardId: string }> = [];

  for (const card of Array.from(cards)) {
    const tag = card.querySelector('.curated-tag-in');
    if (!tag) continue;
    const cardId = card.id.replace('video-', '');
    const code =
      card.querySelector('.video-title strong')?.textContent?.trim() ?? cardId;
    toDelete.push({ code, cardId });
  }

  return batchDeleteCards(toDelete);
}

export function countTaggedInLibrary(): number {
  return document.querySelectorAll('#videos .item .curated-tag-in').length;
}

async function batchDeleteCards(
  items: Array<{ code: string; cardId: string }>
): Promise<DeleteResult> {
  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    const card = document.getElementById(`video-${item.cardId}`);
    if (!card) {
      skipped++;
      continue;
    }

    const deleteUrl = getDeleteUrl(card);
    if (!deleteUrl) {
      failed++;
      continue;
    }

    try {
      await deleteWantListItem(deleteUrl);
      removeCardFromDom(card);
      deleted++;
      if (deleted < items.length) {
        await sleep(DELETE_DELAY_MS);
      }
    } catch (err) {
      console.warn(`[Curated Plugin] 删除 ${item.code} 失败:`, err);
      failed++;
    }
  }

  return { deleted, failed, skipped };
}

export function applyRemoveHint(
  card: Element,
  code: string,
  match: LibraryMatch
): void {
  if (!match.inLibrary) return;

  const metaButtons = card.querySelector('.meta-buttons');
  if (!metaButtons) return;

  let hint = metaButtons.querySelector(`.${HINT_CLASS}`);
  if (!hint) {
    hint = document.createElement('div');
    hint.className = HINT_CLASS;
    metaButtons.prepend(hint);
  }

  hint.textContent = `《${code}》已在库中，可点击「刪除」从想看列表移除`;
}

export function clearRemoveHints(): void {
  document.querySelectorAll(`.${HINT_CLASS}`).forEach((el) => el.remove());
}

export function applyRemoveHints(
  matches: Record<string, LibraryMatch>,
  codeToCardId: Map<string, string>,
  autoRemoveEnabled: boolean
): void {
  if (!isWantWatchPage() || autoRemoveEnabled) {
    clearRemoveHints();
    return;
  }

  clearRemoveHints();

  for (const [code, match] of Object.entries(matches)) {
    if (!match.inLibrary) continue;
    const cardId = codeToCardId.get(code);
    if (!cardId) continue;
    const card = document.getElementById(`video-${cardId}`);
    if (card) applyRemoveHint(card, code, match);
  }
}

export async function autoRemoveIfEnabled(
  matches: Record<string, LibraryMatch>,
  codeToCardId: Map<string, string>,
  autoRemoveEnabled: boolean
): Promise<DeleteResult | null> {
  if (!autoRemoveEnabled || !isWantWatchPage()) return null;

  const inLibraryCount = Object.values(matches).filter((m) => m.inLibrary).length;
  if (inLibraryCount === 0) return null;

  const result = await batchDeleteInLibrary(matches, codeToCardId);

  if (result.deleted > 0) {
    showToast(`已自动移除 ${result.deleted} 部已入库影片`);
  }
  if (result.failed > 0) {
    showToast(`${result.failed} 部影片删除失败`);
  }

  return result;
}
