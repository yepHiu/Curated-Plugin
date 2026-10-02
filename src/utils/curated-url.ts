import { normalizeServerUrl } from '@/utils/settings';

export function getServerOrigin(serverUrl: string): string {
  return normalizeServerUrl(serverUrl).replace(/\/api\/?$/, '');
}

export function getMovieDetailUrl(serverUrl: string, code: string): string {
  const origin = getServerOrigin(serverUrl);
  const normalizedCode = code.trim().toLowerCase();
  return `${origin}/#/detail/${encodeURIComponent(normalizedCode)}?back=home`;
}

export function getMovieSearchUrl(serverUrl: string, code: string): string {
  return getMovieDetailUrl(serverUrl, code);
}

export function resolveApiUrl(serverUrl: string, path: string): string {
  const base = normalizeServerUrl(serverUrl);
  if (path.startsWith('http')) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
