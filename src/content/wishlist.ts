import { extractCard } from '@/content/extract';
import { extractDetailCode, isDetailPage } from '@/content/detail';
import { extractJableCode, isJableVideoPage } from '@/content/jable';
import { extractMissavCode, isMissavVideoPage } from '@/content/missav';
import { sendMessage } from '@/utils/messaging';
import { showToast } from '@/content/styles';
import type { WishlistReceipt, WishlistStatus } from '@/api/wishlist';
interface WishlistTarget { code: string; host: Element; sourceUrl?: string; anchor?: Element; compact?: boolean }
interface WishlistSiteAdapter { matches(): boolean; targets(): WishlistTarget[] }
const adapters: WishlistSiteAdapter[] = [
  {
    matches() { return isMissavVideoPage(); },
    targets() {
      const host = document.querySelector('#curated-missav-titlebar');
      return host && host.getAttribute('data-code') === extractMissavCode()
        ? [{ host, code: extractMissavCode(), sourceUrl: location.href }] : [];
    },
  },
  {
    /** JAVDB 页面使用既有提取逻辑。 */
    matches() { return /(^|\.)javdb\.com$/i.test(location.hostname); },
    /** 列表按钮紧邻入库状态，详情按钮紧邻横幅状态。 */
    targets() {
      if (isDetailPage()) {
        const host = document.querySelector('#curated-detail-banner');
        const anchor = host?.querySelector('.curated-banner-status');
        return host ? [{ host, anchor: anchor ?? undefined, code: extractDetailCode(), sourceUrl: location.href }] : [];
      }
      return Array.from(document.querySelectorAll('#videos .item')).flatMap((item) => {
        const anchor = item.querySelector('.curated-tag');
        const host = anchor?.parentElement;
        if (!host) return [];
        const card = extractCard(item);
        return [{ host, anchor, compact: true, code: card?.code ?? '', sourceUrl: card?.link || undefined }];
      });
    },
  },
  {
    /** jable 只在影片详情显示操作。 */
    matches() { return /(^|\.)jable\.tv$/i.test(location.hostname) && isJableVideoPage(); },
    /** 优先使用现有标题状态条。 */
    targets() { const host = document.querySelector('#curated-jable-titlebar') ?? document.querySelector('.info-header'); return host ? [{ host, code: extractJableCode(), sourceUrl: location.href }] : []; },
  },
];
interface MembershipState {
  added?: boolean;
  adding: boolean;
  requested: boolean;
  revision: number;
  error?: string;
}
let refreshCurrentPage: (() => Promise<void>) | undefined;

/** 重新扫描与手动同步共用页面同步入口。 */
export async function refreshWishlistButtons(): Promise<void> {
  await refreshCurrentPage?.();
}

/** 各站点共享服务器成员状态；DOM 重建不会丢失同一番号的确认状态。 */
export function initWishlistButtons(): void {
  const states = new Map<string, MembershipState>();
  let bindings: Array<{ button: HTMLButtonElement; target: WishlistTarget }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function stateFor(code: string): MembershipState {
    let state = states.get(code);
    if (!state) {
      state = { adding: false, requested: false, revision: 0 };
      states.set(code, state);
    }
    return state;
  }

  function update(button: HTMLButtonElement, state: MembershipState): void {
    const status = state.adding ? 'adding' : state.added ? 'added' : state.added === false ? 'not-added' : 'unknown';
    const label = state.adding ? '正在加入…' : state.added ? '已加入' : '加入愿望单';
    if (button.dataset.wishlistState !== status) button.dataset.wishlistState = status;
    if (button.textContent !== label) button.textContent = label;
    button.disabled = state.adding || state.added === true;
    button.title = state.error ? `状态未确认：${state.error}；可重新扫描或重试加入`
      : state.added ? `${button.dataset.code} 已加入 Curated 愿望单`
      : state.added === false ? `将 ${button.dataset.code} 加入 Curated 愿望单`
      : '正在同步愿望单状态';
  }

  function updateAll(): void {
    for (const { button, target } of bindings) update(button, stateFor(target.code));
  }

  function mount(target: WishlistTarget): HTMLButtonElement | undefined {
    if (!target.code.trim()) return;
    target.code = target.code.trim().toUpperCase();
    const existing = target.host.querySelector<HTMLButtonElement>(':scope > .curated-wishlist-button');
    if (existing?.dataset.code === target.code && existing.dataset.sourceUrl === (target.sourceUrl ?? '')) {
      update(existing, stateFor(target.code));
      return existing;
    }
    existing?.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = target.compact ? 'curated-wishlist-button tag' : 'curated-wishlist-button curated-banner-btn secondary';
    button.dataset.code = target.code;
    button.dataset.sourceUrl = target.sourceUrl ?? '';
    update(button, stateFor(target.code));
    button.addEventListener('click', async (event) => {
      event.preventDefault(); event.stopPropagation();
      const state = stateFor(target.code);
      if (state.adding || state.added) return;
      state.adding = true;
      state.error = undefined;
      ++state.revision; // 添加开始后，之前的只读响应不能再覆盖当前意愿。
      updateAll();
      try {
        const receipt = await sendMessage<WishlistReceipt>({
          type: 'ADD_TO_WISHLIST',
          payload: { code: target.code, ...(target.sourceUrl ? { sourceUrl: target.sourceUrl } : {}) },
        });
        if (!['created', 'existing', 'in_library'].includes(receipt?.result)) throw new Error('愿望单添加结果未确认');
        state.added = true;
        state.requested = true;
        showToast(receipt.result === 'in_library' ? '已在资料库中，已加入愿望单' : '已加入愿望单');
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
        showToast(state.error);
      } finally {
        state.adding = false;
        ++state.revision;
        if (!stopped) updateAll();
      }
    });
    if (target.anchor) target.anchor.after(button);
    else target.host.append(button);
    return button;
  }

  async function synchronize(force: boolean): Promise<void> {
    const codes = [...new Set(bindings.map(({ target }) => target.code))].filter((code) => {
      const state = stateFor(code);
      return !state.adding && (force || !state.requested);
    });
    if (!codes.length || stopped) return;
    const revisions = new Map(codes.map((code) => {
      const state = stateFor(code);
      state.requested = true;
      return [code, ++state.revision];
    }));
    try {
      // 后台按 100 个番号拆分请求，页面无需读取任何 Chrome 存储。
      for (let i = 0; i < codes.length; i += 500) {
        const batch = codes.slice(i, i + 500);
        const { statusMap } = await sendMessage<WishlistStatus>({ type: 'CHECK_WISHLIST_CODES', payload: { codes: batch } });
        for (const code of batch) {
          const state = stateFor(code);
          if (state.revision !== revisions.get(code) || stopped) continue;
          if (typeof statusMap?.[code]?.added !== 'boolean') throw new Error('愿望单状态响应不完整');
          state.added = statusMap[code].added;
          state.error = undefined;
        }
      }
    } catch (error) {
      for (const code of codes) {
        const state = stateFor(code);
        if (state.revision !== revisions.get(code)) continue;
        state.added = undefined;
        state.error = error instanceof Error ? error.message : String(error);
      }
    }
    if (!stopped) updateAll();
  }

  async function render(force = false): Promise<void> {
    if (stopped) return;
    bindings = [];
    for (const adapter of adapters) {
      if (!adapter.matches()) continue;
      for (const target of adapter.targets()) {
        const button = mount(target);
        if (button) bindings.push({ button, target });
      }
    }
    await synchronize(force);
  }
  refreshCurrentPage = () => render(true);
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { void render(); }, 200);
  });
  void render();
  observer.observe(document.body, { childList: true, subtree: true });
  const refresh = () => { if (document.visibilityState !== 'hidden') void render(true); };
  const interval = setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', () => {
    stopped = true;
    observer.disconnect(); clearTimeout(timer); clearInterval(interval);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
    refreshCurrentPage = undefined;
  }, { once: true });
}
