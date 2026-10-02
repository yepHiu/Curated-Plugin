import type { MovieCard } from '@/types/movie';

function parseScoreText(text: string): { score: number; ratingCount: number } {
  const scoreMatch = text.match(/(\d+)分/);
  const countMatch = text.match(/(\d+)人評價/);
  return {
    score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
    ratingCount: countMatch ? parseInt(countMatch[1], 10) : 0,
  };
}

export function extractCard(card: Element): MovieCard | null {
  const id = card.id.replace('video-', '');
  if (!id) return null;

  const linkEl = card.querySelector('.box > a') as HTMLAnchorElement | null;
  const link = linkEl?.href ?? '';

  const coverEl = card.querySelector('.cover img') as HTMLImageElement | null;
  const cover = coverEl?.src ?? '';

  const titleDiv = card.querySelector('.video-title');
  let code = '';
  let title = '';
  if (titleDiv) {
    const strong = titleDiv.querySelector('strong');
    if (strong) {
      code = strong.textContent?.trim() ?? '';
      const fullText = titleDiv.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      title = fullText.replace(code, '').trim();
    } else {
      title = titleDiv.textContent?.trim() ?? '';
    }
  }

  const valueEl = card.querySelector('.score .value');
  const { score, ratingCount } = valueEl
    ? parseScoreText(valueEl.textContent ?? '')
    : { score: 0, ratingCount: 0 };

  const metaEl = card.querySelector('.meta');
  const date = metaEl?.textContent?.trim() ?? '';

  const tagEls = card.querySelectorAll('.tags .tag:not(.curated-tag):not(.curated-wishlist-button)');
  const tags = Array.from(tagEls).map((tag) => tag.textContent?.trim() ?? '');

  const playableTag = card.querySelector('.tag-can-play');
  const playable = !!playableTag;
  let cnSub = false;
  if (playableTag) {
    cnSub =
      playableTag.classList.contains('cnsub') ||
      (playableTag.textContent?.includes('中字') ?? false);
  }

  return {
    id,
    link,
    cover,
    code,
    title,
    score,
    rating_count: ratingCount,
    date,
    tags,
    playable,
    cn_sub: cnSub || undefined,
  };
}

export function extractAllCards(): MovieCard[] {
  const cards = document.querySelectorAll('#videos .item');
  return Array.from(cards)
    .map(extractCard)
    .filter((card): card is MovieCard => card !== null);
}

export function getCardElement(id: string): Element | null {
  return document.getElementById(`video-${id}`);
}
