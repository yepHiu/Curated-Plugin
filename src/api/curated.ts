import type {
  HealthDTO,
  LibraryMatch,
  MoviesPageDTO,
  PlaybackDescriptorDTO,
} from '@/types/movie';
import { resolveApiUrl } from '@/utils/curated-url';
import { normalizeServerUrl } from '@/utils/settings';

export const CLIENT_NAME = 'Curated-Plugin';
export const CLIENT_VERSION = '1.0.0';

const DEFAULT_CONCURRENCY = 5;

function curatedHeaders(): Record<string, string> {
  return {
    'X-Curated-Client': CLIENT_NAME,
    'X-Curated-Client-Version': CLIENT_VERSION,
  };
}

async function throwIfNotOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  if (res.status === 403) {
    const error = await res.json().catch(() => null) as { code?: string } | null;
    if (error?.code === 'BROWSER_PLUGIN_DISABLED') throw new Error('请在 Curated 设置 → 网络中开启浏览器插件联动');
  }
  if (res.status === 423) {
    throw new Error('Curated 已锁定，请先在应用中解锁 PIN');
  }
  throw new Error(`${fallback} (${res.status})`);
}

export async function checkHealth(serverUrl: string): Promise<HealthDTO> {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(`${base}/health`, { headers: curatedHeaders() });
  await throwIfNotOk(res, '服务端响应异常');
  return res.json() as Promise<HealthDTO>;
}

export async function findMovieByCode(
  serverUrl: string,
  code: string
): Promise<LibraryMatch> {
  const base = normalizeServerUrl(serverUrl);
  const url = `${base}/library/movies?q=${encodeURIComponent(code)}&limit=10`;
  const res = await fetch(url, { headers: curatedHeaders() });
  await throwIfNotOk(res, '查询失败');
  const data = (await res.json()) as MoviesPageDTO;
  const normalized = code.toLowerCase();
  const match = data.items.find(
    (item) => item.code.toLowerCase() === normalized
  );
  if (!match) {
    return { inLibrary: false };
  }
  return {
    inLibrary: true,
    movieId: match.id,
    title: match.title,
  };
}

export async function checkMoviesInLibrary(
  serverUrl: string,
  codes: string[]
): Promise<Record<string, LibraryMatch>> {
  const unique = [...new Set(codes.filter(Boolean))];
  const result: Record<string, LibraryMatch> = {};

  for (let i = 0; i < unique.length; i += DEFAULT_CONCURRENCY) {
    const batch = unique.slice(i, i + DEFAULT_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (code) => {
        try {
          const match = await findMovieByCode(serverUrl, code);
          return { code, match, error: false as const };
        } catch {
          return { code, match: null, error: true as const };
        }
      })
    );

    for (const item of batchResults) {
      if (!item.error && item.match) {
        result[item.code] = item.match;
      }
    }
  }

  return result;
}

export async function getPlaybackUrl(
  serverUrl: string,
  movieId: string
): Promise<string> {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(`${base}/library/movies/${encodeURIComponent(movieId)}/playback`, {
    headers: curatedHeaders(),
  });
  await throwIfNotOk(res, '获取播放信息失败');
  const data = (await res.json()) as PlaybackDescriptorDTO;
  return resolveApiUrl(serverUrl, data.url);
}

export async function triggerNativePlay(
  serverUrl: string,
  movieId: string
): Promise<void> {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(
    `${base}/library/movies/${encodeURIComponent(movieId)}/native-play`,
    { method: 'POST', headers: curatedHeaders() }
  );
  if (!res.ok && res.status !== 204) {
    if (res.status === 403) {
    const error = await res.json().catch(() => null) as { code?: string } | null;
    if (error?.code === 'BROWSER_PLUGIN_DISABLED') throw new Error('请在 Curated 设置 → 网络中开启浏览器插件联动');
  }
  if (res.status === 423) {
      throw new Error('Curated 已锁定，请先在应用中解锁 PIN');
    }
    throw new Error(`启动播放失败 (${res.status})`);
  }
}

export async function triggerMovieScrape(
  serverUrl: string,
  movieId: string
): Promise<void> {
  const base = normalizeServerUrl(serverUrl);
  const res = await fetch(
    `${base}/library/movies/${encodeURIComponent(movieId)}/scrape`,
    { method: 'POST', headers: curatedHeaders() }
  );
  if (!res.ok && res.status !== 202) {
    if (res.status === 403) {
    const error = await res.json().catch(() => null) as { code?: string } | null;
    if (error?.code === 'BROWSER_PLUGIN_DISABLED') throw new Error('请在 Curated 设置 → 网络中开启浏览器插件联动');
  }
  if (res.status === 423) {
      throw new Error('Curated 已锁定，请先在应用中解锁 PIN');
    }
    throw new Error(`刮削请求失败 (${res.status})`);
  }
}
