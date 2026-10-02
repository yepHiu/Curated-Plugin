export interface MovieCard {
  id: string;
  link: string;
  cover: string;
  code: string;
  title: string;
  score: number;
  rating_count: number;
  date: string;
  tags: string[];
  playable: boolean;
  cn_sub?: boolean;
}

export interface MoviesPageDTO {
  items: Array<{ id: string; code: string; title: string }>;
  total: number;
  limit: number;
  offset: number;
}

export interface HealthDTO {
  name: string;
  version: string;
  channel: string;
}

export interface LibraryMatch {
  inLibrary: boolean;
  movieId?: string;
  title?: string;
}

export interface PlaybackDescriptorDTO {
  movieId: string;
  mode: string;
  url: string;
  mimeType?: string;
  canDirectPlay?: boolean;
}

export type LibraryStatus = 'in' | 'out' | 'pending' | 'error';

export interface TaggingResult {
  total: number;
  tagged: number;
  inLibrary: number;
  outLibrary: number;
  skipped: number;
  errors: number;
  deleted?: number;
  deleteFailed?: number;
}

export interface DeleteResult {
  deleted: number;
  failed: number;
  skipped: number;
}

export interface ScanStats {
  page: 'list' | 'detail' | 'jable' | 'missav' | 'other';
  total: number;
  withCode: number;
  inLibrary: number;
  outLibrary: number;
  pending: number;
  errors: number;
  detailStatus?: LibraryStatus;
}

export interface CheckMovieCodesPayload {
  codes: string[];
  skipCache?: boolean;
}
