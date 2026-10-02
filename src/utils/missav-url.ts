/** 只适配已核对的 MissAV 域名及其子域名。 */
export function isMissavHost(hostname: string): boolean {
  return /(^|\.)missav\.ws$/i.test(hostname);
}

/** 从影片 slug 提取番号，排除搜索、演员、分类等页面。 */
export function extractMissavCodeFromUrl(input: string): string {
  try {
    const url = new URL(input);
    if (!isMissavHost(url.hostname) || url.protocol !== 'https:') return '';
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const slug = segments.pop();
    if (!slug || segments.length > 2) return '';
    if (segments[0] && /^(?:en|ja|cn|zh(?:-tw|-cn)?)$/i.test(segments[0])) segments.shift();
    if (segments.length && !(segments.length === 1 && /^dm\d+$/i.test(segments[0]))) return '';
    const match = slug.match(/^((?:fc2[-_]?ppv[-_]?\d{2,10}|\d{0,3}[a-z]{2,12}[-_]\d{2,8}|\d{6}[-_]\d{2,3}))(?:-(?:uncensored(?:-leak)?|(?:english|chinese)-subtitles?))?$/i);
    return match?.[1].toUpperCase().replace(/_/g, '-').replace(/^FC2-?PPV-?(\d+)$/, 'FC2-PPV-$1') ?? '';
  } catch {
    return '';
  }
}
