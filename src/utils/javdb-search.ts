export function normalizeMovieCode(raw: string): string {
  const slug = decodeURIComponent(raw).trim();
  if (!slug) return '';

  const fc2 = slug.match(/fc2[-_]?ppv[-_]?\d+/i);
  if (fc2) return fc2[0].toUpperCase().replace(/_/g, '-');

  const standard = slug.match(/[a-z]{2,10}-\d{2,7}/i);
  if (standard) return standard[0].toUpperCase();

  return slug.replace(/[_/]+/g, '-').toUpperCase();
}

export function extractJableCodeFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\/videos\/([^/]+)/i);
    if (!match) return '';
    return normalizeMovieCode(match[1]);
  } catch {
    return '';
  }
}

export function isJableHost(hostname: string): boolean {
  return /(^|\.)jable\.tv$/i.test(hostname);
}

export function getJavdbSearchUrl(code: string): string {
  return `https://javdb.com/search?q=${encodeURIComponent(code)}&f=all`;
}
