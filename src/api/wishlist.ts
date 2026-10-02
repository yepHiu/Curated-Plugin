import { normalizeServerUrl } from '@/utils/settings';
export interface WishlistReceipt { id: string; result: 'created' | 'existing' | 'in_library' }
/** 保存番号与可选来源页面，无需提供图片或刮削资料。 */
export async function addWishlistCode(serverUrl: string, code: string, sourceUrl?: string): Promise<WishlistReceipt> {
  const controller = new AbortController();
  const timer = setTimeout(() => { /* 请求超时不意味着服务端未保存；重试仍幂等。 */ controller.abort(); }, 15000);
  try {
    const response = await fetch(`${normalizeServerUrl(serverUrl)}/integrations/wishlist/items`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Curated-Client': 'Curated-Plugin' },
      body: JSON.stringify({ code, ...(sourceUrl ? { sourceUrl } : {}) }),
    });
    if (response.status === 404) throw new Error('Curated 版本尚不支持愿望单，请升级后端');
    if (response.status === 403) {
      const error = await response.json().catch(() => null) as { code?: string } | null;
      if (error?.code === 'BROWSER_PLUGIN_DISABLED') throw new Error('请在 Curated 设置 → 网络中开启浏览器插件联动');
    }
    if (!response.ok) throw new Error(`加入失败 (${response.status})`);
    return await response.json() as WishlistReceipt;
  } finally { clearTimeout(timer); }
}
