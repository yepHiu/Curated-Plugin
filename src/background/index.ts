import { addWishlistCode } from '@/api/wishlist';
import {
  checkHealth,
  checkMoviesInLibrary,
  getPlaybackUrl,
} from '@/api/curated';
import type { CheckMovieCodesPayload, LibraryMatch } from '@/types/movie';
import { getMovieDetailUrl } from '@/utils/curated-url';
import { onMessage, type ExtensionMessage, type TabInfo } from '@/utils/messaging';
import { getSettings } from '@/utils/settings';
import { handleDeleteTaskMessage } from '@/background/delete-task';

const CACHE_TTL_MS = 5 * 60 * 1000;
const movieMatchCache = new Map<string, { match: LibraryMatch; expires: number }>();

function cacheKey(serverUrl: string, code: string): string {
  return `${serverUrl}::${code.toLowerCase()}`;
}

function readCachedMatch(serverUrl: string, code: string): LibraryMatch | null {
  const entry = movieMatchCache.get(cacheKey(serverUrl, code));
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    movieMatchCache.delete(cacheKey(serverUrl, code));
    return null;
  }
  return entry.match;
}

function writeCachedMatch(
  serverUrl: string,
  code: string,
  match: LibraryMatch
): void {
  movieMatchCache.set(cacheKey(serverUrl, code), {
    match,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Curated Plugin] Extension installed');
});

onMessage(async (message: ExtensionMessage, sender) => {
    // 接受本扩展注入的站点内容脚本和固定 popup 手动输入入口。
    if (message.type === 'ADD_TO_WISHLIST') {
      const fromPage = !!sender.tab && !!sender.url && /^https:\/\//.test(sender.url);
      const fromPopup = sender.url === chrome.runtime.getURL('popup.html');
      if (sender.id !== chrome.runtime.id || (!fromPage && !fromPopup)) throw new Error('Invalid wishlist sender');
    const value = message.payload as { code?: unknown; sourceUrl?: unknown };
    if (!value || Object.keys(value).some((key) => { /* 仅接受番号和来源网页。 */ return key !== 'code' && key !== 'sourceUrl'; }) || typeof value.code !== 'string' || !/^[A-Za-z0-9_-]{3,80}$/.test(value.code)) throw new Error('未识别出有效番号');
    const { serverUrl } = await getSettings();
    let sourceUrl: string | undefined;
    if (value.sourceUrl !== undefined) {
      if (typeof value.sourceUrl !== 'string' || value.sourceUrl.length > 4096) throw new Error('来源网址无效');
      const url = new URL(value.sourceUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('来源网址无效');
      if (fromPage && url.origin !== new URL(sender.url!).origin) throw new Error('来源网址必须属于当前站点');
      sourceUrl = url.href;
    }
    return addWishlistCode(serverUrl, value.code, sourceUrl);
  }
  switch (message.type) {
    case 'SAVE_DELETE_TASK':
    case 'READ_DELETE_TASK':
      return handleDeleteTaskMessage(message, sender);

    case 'PING':
      return { pong: true, timestamp: Date.now() };

    case 'GET_TAB_INFO': {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tabInfo: TabInfo = {
        id: tab?.id,
        title: tab?.title,
        url: tab?.url,
      };
      return tabInfo;
    }

    case 'STORAGE_GET': {
      const key = message.payload as string;
      const result = await chrome.storage.sync.get(key);
      return result[key];
    }

    case 'STORAGE_SET': {
      const { key, value } = message.payload as {
        key: string;
        value: unknown;
      };
      await chrome.storage.sync.set({ [key]: value });
      return { success: true };
    }

    case 'CHECK_HEALTH': {
      const serverUrl =
        (message.payload as string | undefined) ??
        (await getSettings()).serverUrl;
      const health = await checkHealth(serverUrl);
      return { ok: true, health };
    }

    case 'CHECK_MOVIE_CODES': {
      const { codes, skipCache } = message.payload as CheckMovieCodesPayload;
      const { serverUrl } = await getSettings();
      const matchMap: Record<string, LibraryMatch> = {};
      const missing: string[] = [];

      for (const code of codes) {
        if (!skipCache) {
          const cached = readCachedMatch(serverUrl, code);
          if (cached) {
            matchMap[code] = cached;
            continue;
          }
        }
        missing.push(code);
      }

      if (missing.length > 0) {
        const fetched = await checkMoviesInLibrary(serverUrl, missing);
        for (const code of missing) {
          const match = fetched[code];
          if (!match) continue;
          matchMap[code] = match;
          writeCachedMatch(serverUrl, code, match);
        }
      }

      return { matchMap };
    }

    case 'OPEN_CURATED_MOVIE': {
      const { code } = message.payload as {
        code: string;
        movieId?: string;
      };
      const { serverUrl } = await getSettings();
      const url = getMovieDetailUrl(serverUrl, code);
      await chrome.tabs.create({ url });
      return { ok: true, url };
    }

    case 'GET_PLAYBACK_URL': {
      const { movieId } = message.payload as { movieId: string };
      const { serverUrl } = await getSettings();
      const url = await getPlaybackUrl(serverUrl, movieId);
      return { url };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
});
