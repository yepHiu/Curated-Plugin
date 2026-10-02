import { extractCard } from '@/content/extract';
import { extractDetailCode, isDetailPage } from '@/content/detail';
import { extractJableCode, isJableVideoPage } from '@/content/jable';
import { extractMissavCode, isMissavVideoPage } from '@/content/missav';
import { sendMessage } from '@/utils/messaging';
import { showToast } from '@/content/styles';
import type { WishlistReceipt } from '@/api/wishlist';
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
/** 公共按钮发送番号与影片来源页，站点适配器不直接发起网络请求。 */
function mount(target: WishlistTarget): void {
  if (!target.code.trim()) return;
  const existing = target.host.querySelector<HTMLButtonElement>(':scope > .curated-wishlist-button');
  if (existing?.dataset.code === target.code && existing?.dataset.sourceUrl === (target.sourceUrl ?? '')) return;
  existing?.remove();
  const button = document.createElement('button');
  button.type = 'button'; button.className = target.compact ? 'curated-wishlist-button tag' : 'curated-wishlist-button curated-banner-btn secondary'; button.dataset.code = target.code; button.dataset.sourceUrl = target.sourceUrl ?? '';
  button.textContent = '加入愿望单'; button.title = `将 ${target.code} 加入 Curated 愿望单`;
  button.addEventListener('click', async (event) => { /* 阻止触发网站卡片导航，并合并重复点击。 */
    event.preventDefault(); event.stopPropagation(); if (button.disabled) return; button.disabled = true; button.textContent = '正在加入…';
    try { const receipt = await sendMessage<WishlistReceipt>({ type: 'ADD_TO_WISHLIST', payload: { code: target.code, ...(target.sourceUrl ? { sourceUrl: target.sourceUrl } : {}) } }); const message = receipt.result === 'in_library' ? '已在资料库中' : receipt.result === 'existing' ? '已在愿望单中' : '已加入愿望单'; button.textContent = message; showToast(message); }
    catch (error) { button.textContent = '重试加入愿望单'; button.disabled = false; showToast((error as Error).message); }
  });
  if (target.anchor) target.anchor.after(button);
  else target.host.append(button);
}
/** 动态页面中仅观察 DOM，不依赖具体网站提供额外数据。 */
export function initWishlistButtons(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** 按当前页面重新计算挂载点，避免沿用上一作品番号。 */
  function render() { for (const adapter of adapters) if (adapter.matches()) for (const target of adapter.targets()) mount(target); }
  const observer = new MutationObserver(() => { /* DOM 批量更新后只扫描一次。 */ clearTimeout(timer); timer = setTimeout(render, 200); });
  render(); observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => { /* 页面退出释放观察器。 */ observer.disconnect(); clearTimeout(timer); }, { once: true });
}
