import { getCurrentLang, tx, type UiLanguage } from '../../i18n';
import { BookSummary } from '../../types';

export type BookSourceFilter = 'all' | 'stable' | 'lazer' | 'both' | 'played' | 'unplayed';
export type BookModeFilter = 'all' | '3' | '0' | '1' | '2';
export type BookKeysFilter = 'any' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'other';
export type BookStatusFilter =
  | 'all'
  | 'leaderboard'
  | 'ranked'
  | 'loved'
  | 'qualified'
  | 'pending'
  | 'graveyard'
  | 'local';
export type BookGradeFilter = 'all' | 'ss' | 's' | 'a' | 'b_or_lower' | 'none';
export type BookSortField =
  | 'recent'
  | 'pp'
  | 'plays'
  | 'stars'
  | 'bpm'
  | 'length'
  | 'title'
  | 'added';
export type BookSortDir = 'desc' | 'asc';

export interface BookFilters {
  q: string;
  source: BookSourceFilter;
  mode: BookModeFilter;
  keys: BookKeysFilter;
  status: BookStatusFilter;
  grade: BookGradeFilter;
  sortBy: BookSortField;
  sortDir: BookSortDir;
  minStars?: number;
  maxStars?: number;
  minPp?: number;
  maxPp?: number;
  minBpm?: number;
  maxBpm?: number;
  minLength?: number;
  maxLength?: number;
  minLn?: number;
  maxLn?: number;
  creator: string;
  rankedPpOnly: boolean;
}

export const DEFAULT_BOOK_FILTERS: BookFilters = {
  q: '',
  source: 'all',
  mode: 'all',
  keys: 'any',
  status: 'all',
  grade: 'all',
  sortBy: 'recent',
  sortDir: 'desc',
  creator: '',
  rankedPpOnly: false,
};

export function countActiveAdvancedFilters(f: BookFilters): number {
  return [
    f.mode !== 'all',
    f.keys !== 'any',
    f.status !== 'all',
    f.grade !== 'all',
    f.minStars != null || f.maxStars != null,
    f.minPp != null || f.maxPp != null,
    f.rankedPpOnly,
    f.minBpm != null || f.maxBpm != null,
    f.minLength != null || f.maxLength != null,
    f.minLn != null || f.maxLn != null,
    Boolean(f.creator.trim()),
  ].filter(Boolean).length;
}

export interface BookSortOption {
  value: BookSortField;
  label: string;
}

export function getBookSortOptions(lang: UiLanguage = getCurrentLang()): BookSortOption[] {
  return [
    { value: 'recent', label: tx('最近游玩', 'Last Played', lang) },
    { value: 'pp', label: tx('最高 PP', 'Best PP', lang) },
    { value: 'plays', label: tx('游玩次数', 'Play Count', lang) },
    { value: 'stars', label: tx('最高星数', 'Max Stars', lang) },
    { value: 'bpm', label: tx('曲目 BPM', 'BPM', lang) },
    { value: 'length', label: tx('曲目时长', 'Length', lang) },
    { value: 'title', label: tx('曲名排序', 'Title', lang) },
    { value: 'added', label: tx('最近加入', 'Date Added', lang) },
  ];
}

export const BOOK_SORT_OPTIONS: BookSortOption[] = getBookSortOptions('zh');

export function getBookFilterTransitionLabel(
  f: BookFilters,
  lang: UiLanguage = getCurrentLang(),
): string {
  const srcLabel: Record<BookSourceFilter, string> = {
    all: tx('全部曲库', 'ALL BOOKS', lang),
    stable: 'OSU!STABLE',
    lazer: 'OSU!LAZER',
    both: tx('双端共有', 'STABLE+LAZER', lang),
    played: tx('已游玩', 'PLAYED', lang),
    unplayed: tx('未游玩', 'UNPLAYED', lang),
  };
  const modeLabel: Record<BookModeFilter, string> = {
    all: tx('全模式', 'ALL MODES', lang),
    '3': f.keys !== 'any' ? `MANIA ${f.keys === 'other' ? 'OTHER' : `${f.keys}K`}` : 'MANIA',
    '0': 'STD',
    '1': 'TAIKO',
    '2': 'CATCH',
  };
  const sortLabel: Record<BookSortField, string> = {
    recent: tx('最近游玩', 'Recent', lang),
    pp: tx('最高 PP', 'Best PP', lang),
    plays: tx('游玩次数', 'Plays', lang),
    stars: tx('星数', 'Stars', lang),
    bpm: 'BPM',
    length: tx('时长', 'Length', lang),
    title: tx('曲名', 'Title', lang),
    added: tx('加入时间', 'Added', lang),
  };
  const parts = [srcLabel[f.source], modeLabel[f.mode]];
  if (f.status !== 'all') parts.push(f.status.toUpperCase());
  if (f.minStars != null || f.maxStars != null) {
    parts.push(`${f.minStars ?? 0}–${f.maxStars ?? '∞'}★`);
  }
  if (f.minPp != null || f.maxPp != null) {
    parts.push(`${f.minPp ?? 0}–${f.maxPp ?? '∞'}pp`);
  }
  parts.push(`${sortLabel[f.sortBy]} ${f.sortDir === 'asc' ? '↑' : '↓'}`);
  return parts.join(' · ');
}

function compareNullableNum(
  a: number | null,
  b: number | null,
  dir: BookSortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

export function applyBookFilters(books: BookSummary[], f: BookFilters): BookSummary[] {
  const q = f.q.trim().toLowerCase();
  const creatorQ = f.creator.trim().toLowerCase();

  const list = books.filter((b) => {
    if (f.source === 'stable' && !b.inStable) return false;
    if (f.source === 'lazer' && !b.inLazer) return false;
    if (f.source === 'both' && !(b.inStable && b.inLazer)) return false;
    if (f.source === 'played' && b.playCount === 0) return false;
    if (f.source === 'unplayed' && b.playCount > 0) return false;

    if (f.mode !== 'all' && !b.modes.includes(Number(f.mode))) return false;

    if (f.keys !== 'any' && (f.mode === 'all' || f.mode === '3')) {
      if (f.keys === 'other') {
        if (!b.keyCounts.some((k) => k < 4 || k > 10)) return false;
      } else {
        const kNum = Number(f.keys);
        if (!b.keyCounts.includes(kNum)) return false;
      }
    }

    if (f.status !== 'all') {
      if (f.status === 'leaderboard') {
        if (!['ranked', 'approved', 'qualified', 'loved'].includes(b.status)) return false;
      } else if (f.status === 'ranked') {
        if (b.status !== 'ranked' && b.status !== 'approved') return false;
      } else if (f.status === 'pending') {
        if (b.status !== 'pending' && b.status !== 'wip') return false;
      } else if (b.status !== f.status) {
        return false;
      }
    }

    if (f.grade !== 'all') {
      if (f.grade === 'ss' && b.bestGrade !== 'XH' && b.bestGrade !== 'X') return false;
      if (f.grade === 's' && b.bestGrade !== 'SH' && b.bestGrade !== 'S') return false;
      if (f.grade === 'a' && b.bestGrade !== 'A') return false;
      if (
        f.grade === 'b_or_lower' &&
        b.bestGrade !== 'B' &&
        b.bestGrade !== 'C' &&
        b.bestGrade !== 'D' &&
        b.bestGrade !== 'F'
      ) {
        return false;
      }
      if (f.grade === 'none' && b.bestGrade !== null) return false;
    }

    if (f.minStars != null && b.maxStars < f.minStars) return false;
    if (f.maxStars != null && b.minStars > f.maxStars) return false;

    if (f.rankedPpOnly && (b.bestPp === null || !b.bestPpIsRanked)) return false;
    if (f.minPp != null && (b.bestPp === null || b.bestPp < f.minPp)) return false;
    if (f.maxPp != null && (b.bestPp === null || b.bestPp > f.maxPp)) return false;

    if (f.minBpm != null && b.bpm < f.minBpm) return false;
    if (f.maxBpm != null && b.bpm > f.maxBpm) return false;

    if (f.minLength != null && b.lengthSec < f.minLength) return false;
    if (f.maxLength != null && b.lengthSec > f.maxLength) return false;

    if (f.minLn != null && (b.lnRatioAvg === null || b.lnRatioAvg < f.minLn)) return false;
    if (f.maxLn != null && (b.lnRatioAvg === null || b.lnRatioAvg > f.maxLn)) return false;

    if (creatorQ && !b.creator.toLowerCase().includes(creatorQ)) return false;

    if (q) {
      const haystack = [
        b.title,
        b.titleUnicode,
        b.artist,
        b.artistUnicode,
        b.creator,
        b.source,
        b.beatmapsetId ? String(b.beatmapsetId) : '',
        b.stableFolder || '',
        ...b.tags,
      ]
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  list.sort((a, b) => {
    const dir = f.sortDir;
    if (f.sortBy === 'pp') {
      const cmp = compareNullableNum(a.bestPp, b.bestPp, dir);
      if (cmp !== 0) return cmp;
    } else if (f.sortBy === 'plays') {
      if (b.playCount !== a.playCount) {
        return dir === 'asc' ? a.playCount - b.playCount : b.playCount - a.playCount;
      }
    } else if (f.sortBy === 'stars') {
      if (b.maxStars !== a.maxStars) {
        return dir === 'asc' ? a.maxStars - b.maxStars : b.maxStars - a.maxStars;
      }
    } else if (f.sortBy === 'bpm') {
      if (b.bpm !== a.bpm) {
        return dir === 'asc' ? a.bpm - b.bpm : b.bpm - a.bpm;
      }
    } else if (f.sortBy === 'length') {
      if (b.lengthSec !== a.lengthSec) {
        return dir === 'asc' ? a.lengthSec - b.lengthSec : b.lengthSec - a.lengthSec;
      }
    } else if (f.sortBy === 'title') {
      const ta = a.titleUnicode || a.title;
      const tb = b.titleUnicode || b.title;
      const cmp = ta.localeCompare(tb);
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    } else if (f.sortBy === 'added') {
      const da = a.dateAdded ? Date.parse(a.dateAdded) : null;
      const db = b.dateAdded ? Date.parse(b.dateAdded) : null;
      const cmp = compareNullableNum(da, db, dir);
      if (cmp !== 0) return cmp;
    } else {
      // 'recent'
      const la = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : null;
      const lb = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : null;
      const cmp = compareNullableNum(la, lb, dir);
      if (cmp !== 0) return cmp;
    }

    // Tiebreaker: recent played -> best PP -> title
    const la = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : null;
    const lb = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : null;
    const tieRecent = compareNullableNum(la, lb, 'desc');
    if (tieRecent !== 0) return tieRecent;
    const tiePp = compareNullableNum(a.bestPp, b.bestPp, 'desc');
    if (tiePp !== 0) return tiePp;
    return (a.titleUnicode || a.title).localeCompare(b.titleUnicode || b.title);
  });

  return list;
}
