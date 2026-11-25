import {
  getOsuGenres,
  getOsuLanguages,
  getSortFields,
  getStatusOptions,
} from '../constants';
import { getCurrentLang, tx, type UiLanguage } from '../i18n';
import { SearchFilters } from '../types';
import {
  extractPpScenarioFromFilters,
  formatPpScenarioShort,
  isDefaultPpScenario,
} from './pp';

export interface ArchiveSummaryTag {
  label: string;
  tone?: 'default' | 'osu' | 'lazer' | 'stable' | 'warn';
}

export function sanitizeFiltersForArchive(filters: SearchFilters): SearchFilters {
  const next: SearchFilters = {};
  if (typeof filters.q === 'string') {
    const trimmed = filters.q.trim();
    if (trimmed) next.q = trimmed.slice(0, 200);
  }
  if (filters.mode) next.mode = filters.mode;
  if (filters.keys) next.keys = filters.keys;
  if (filters.status) next.status = filters.status;
  if (filters.sort) next.sort = filters.sort;
  if (filters.genre && filters.genre > 0) next.genre = filters.genre;
  if (filters.language && filters.language > 0) next.language = filters.language;
  if (filters.video) next.video = true;
  if (filters.storyboard) next.storyboard = true;
  if (filters.spotlight) next.spotlight = true;
  if (filters.featured) next.featured = true;
  if (filters.nsfw) next.nsfw = true;
  if (filters.includeConverts) next.includeConverts = true;

  const numKeys = [
    'minStars',
    'maxStars',
    'minBpm',
    'maxBpm',
    'minLength',
    'maxLength',
    'minOd',
    'maxOd',
    'minHp',
    'maxHp',
    'minAr',
    'maxAr',
    'minLn',
    'maxLn',
    'minPp',
    'maxPp',
    'ppAccuracy',
    'ppRate',
    'ppMisses',
    'ppMaRatio',
  ] as const;
  for (const k of numKeys) {
    const v = filters[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      next[k] = v;
    }
  }

  if (filters.ppClassic) next.ppClassic = true;
  if (filters.ppEz) next.ppEz = true;
  if (filters.ppNf) next.ppNf = true;
  if (filters.ppIncludeUnranked) next.ppIncludeUnranked = true;
  if (filters.creator?.trim()) next.creator = filters.creator.trim().slice(0, 64);
  if (filters.installedFilter && filters.installedFilter !== 'all') {
    next.installedFilter = filters.installedFilter;
  }
  if (filters.source && filters.source !== 'auto') {
    next.source = filters.source;
  }
  return next;
}

function formatModeBadge(filters: SearchFilters, lang: UiLanguage): string {
  const isEn = lang === 'en';
  if (filters.mode === '0') return 'Standard';
  if (filters.mode === '1') return 'Taiko';
  if (filters.mode === '2') return 'Catch';
  if (filters.mode === 'any') return isEn ? 'All Modes' : '全模式';
  const k =
    filters.keys && filters.keys !== 'any'
      ? filters.keys === 'other'
        ? isEn
          ? 'Other Keys'
          : '其他键'
        : `${filters.keys}K`
      : isEn
        ? 'All Keys'
        : '全键数';
  return `Mania ${k}`;
}

export function buildAutoArchiveName(
  filters: SearchFilters,
  lang: UiLanguage = getCurrentLang(),
): string {
  const isEn = lang === 'en';
  const parts: string[] = [];
  const q = filters.q?.trim();
  if (q) {
    parts.push(q.length > 16 ? `${q.slice(0, 15)}…` : q);
  }

  if (filters.mode === '3' || !filters.mode) {
    const k =
      filters.keys && filters.keys !== 'any'
        ? filters.keys === 'other'
          ? isEn
            ? 'Other Keys'
            : '其他键'
          : `${filters.keys}K`
        : 'Mania';
    parts.push(k);
  } else {
    parts.push(formatModeBadge(filters, lang));
  }

  if (filters.minStars != null || filters.maxStars != null) {
    parts.push(`${filters.minStars ?? 0}–${filters.maxStars ?? '∞'}★`);
  }

  const ppScenario = extractPpScenarioFromFilters(filters);
  if (filters.minPp != null || filters.maxPp != null) {
    parts.push(`${filters.minPp ?? 0}–${filters.maxPp ?? '∞'}pp`);
  } else if (!isDefaultPpScenario(ppScenario)) {
    parts.push(formatPpScenarioShort(ppScenario, lang));
  }

  if (filters.minLn == null && filters.maxLn === 15) {
    parts.push('Rice');
  } else if (filters.minLn === 16 && filters.maxLn === 44) {
    parts.push('Hybrid');
  } else if (filters.minLn === 45 && filters.maxLn == null) {
    parts.push('LN≥45%');
  } else if (filters.minLn != null || filters.maxLn != null) {
    parts.push(`LN ${filters.minLn ?? 0}–${filters.maxLn ?? 100}%`);
  }

  if (filters.status && filters.status !== 'leaderboard') {
    const rawLabel =
      getStatusOptions(lang).find((s) => s.value === filters.status)?.label ?? filters.status;
    const statusLabel = isEn ? rawLabel : rawLabel.split(' ')[0];
    parts.push(statusLabel);
  }

  const joined = parts.join(' · ').trim();
  if (!joined) return tx('4K 默认筛选', '4K Default', lang);
  return joined.length > 40 ? `${joined.slice(0, 39)}…` : joined;
}

export function summarizeFilterArchive(
  filters: SearchFilters,
  lang: UiLanguage = getCurrentLang(),
): {
  query: string;
  tags: ArchiveSummaryTag[];
} {
  const isEn = lang === 'en';
  const query = (filters.q || '').trim();
  const tags: ArchiveSummaryTag[] = [];

  tags.push({ label: formatModeBadge(filters, lang), tone: 'default' });

  const statusVal = filters.status || 'leaderboard';
  const rawStatusLabel =
    getStatusOptions(lang).find((s) => s.value === statusVal)?.label ?? statusVal;
  const statusLabel = isEn ? rawStatusLabel : rawStatusLabel.split(' ')[0];
  tags.push({ label: statusLabel, tone: statusVal === 'any' ? 'warn' : 'default' });

  if (filters.minStars != null || filters.maxStars != null) {
    tags.push({
      label: `${filters.minStars ?? 0}–${filters.maxStars ?? '∞'}★`,
      tone: 'osu',
    });
  }

  const ppScenario = extractPpScenarioFromFilters(filters);
  const ppCustomized = !isDefaultPpScenario(ppScenario) || Boolean(filters.ppIncludeUnranked);
  if (filters.minPp != null || filters.maxPp != null) {
    tags.push({
      label: `~${filters.minPp ?? 0}–${filters.maxPp ?? '∞'}pp · ${formatPpScenarioShort(ppScenario, lang)}`,
      tone: 'lazer',
    });
  } else if (ppCustomized) {
    tags.push({
      label: isEn ? `PP ${formatPpScenarioShort(ppScenario, lang)}` : `情景 ${formatPpScenarioShort(ppScenario, lang)}`,
      tone: 'lazer',
    });
  }

  if (filters.minLn == null && filters.maxLn === 15) {
    tags.push({ label: 'Rice ≤15%', tone: 'stable' });
  } else if (filters.minLn === 16 && filters.maxLn === 44) {
    tags.push({ label: 'Hybrid 16–44%', tone: 'stable' });
  } else if (filters.minLn === 45 && filters.maxLn == null) {
    tags.push({ label: 'LN ≥45%', tone: 'stable' });
  } else if (filters.minLn != null || filters.maxLn != null) {
    tags.push({ label: `LN ${filters.minLn ?? 0}–${filters.maxLn ?? 100}%`, tone: 'stable' });
  }

  const sortVal = filters.sort || 'ranked_date:desc';
  if (sortVal !== 'ranked_date:desc') {
    const [field, dir] = sortVal.split(':');
    const sortName = getSortFields(lang).find((s) => s.value === field)?.label ?? field;
    tags.push({ label: `${sortName} ${dir === 'asc' ? '↑' : '↓'}`, tone: 'default' });
  }

  if (filters.installedFilter && filters.installedFilter !== 'all') {
    const map: Record<string, string> = isEn
      ? {
          hide_lazer: 'Hide In Lazer',
          hide_stable: 'Hide In Stable',
          hide_any: 'Not Installed',
          only_missing_lazer: 'Missing Lazer',
          only_missing_stable: 'Missing Stable',
        }
      : {
          hide_lazer: '隐藏 Lazer 已有',
          hide_stable: '隐藏 Stable 已有',
          hide_any: '仅看双端未装',
          only_missing_lazer: '仅缺 Lazer',
          only_missing_stable: '仅缺 Stable',
        };
    tags.push({ label: map[filters.installedFilter] ?? filters.installedFilter, tone: 'warn' });
  }

  if (filters.source && filters.source !== 'auto') {
    tags.push({
      label: filters.source === 'osudirect' ? 'osu.direct' : isEn ? 'Sayobot' : '小夜镜像',
      tone: 'default',
    });
  }

  if (filters.minBpm != null || filters.maxBpm != null) {
    tags.push({ label: `BPM ${filters.minBpm ?? 0}–${filters.maxBpm ?? '∞'}` });
  }
  if (filters.minLength != null || filters.maxLength != null) {
    tags.push({
      label: isEn
        ? `Len ${filters.minLength ?? 0}–${filters.maxLength ?? '∞'}s`
        : `时长 ${filters.minLength ?? 0}–${filters.maxLength ?? '∞'}s`,
    });
  }
  if (filters.minOd != null || filters.maxOd != null) {
    tags.push({ label: `OD ${filters.minOd ?? 0}–${filters.maxOd ?? 10}` });
  }
  if (filters.minHp != null || filters.maxHp != null) {
    tags.push({ label: `HP ${filters.minHp ?? 0}–${filters.maxHp ?? 10}` });
  }
  if (filters.minAr != null || filters.maxAr != null) {
    tags.push({ label: `AR ${filters.minAr ?? 0}–${filters.maxAr ?? 10}` });
  }
  if (filters.genre && filters.genre > 0) {
    const gRaw = getOsuGenres(lang).find((item) => item.id === filters.genre)?.label;
    const g = gRaw ? (isEn ? gRaw : gRaw.split(' ')[0]) : '';
    if (g) tags.push({ label: `${isEn ? 'Genre' : '曲风'}:${g}` });
  }
  if (filters.language && filters.language > 0) {
    const lRaw = getOsuLanguages(lang).find((item) => item.id === filters.language)?.label;
    const l = lRaw ? (isEn ? lRaw : lRaw.split(' ')[0]) : '';
    if (l) tags.push({ label: `${isEn ? 'Lang' : '语言'}:${l}` });
  }
  if (filters.creator?.trim()) {
    tags.push({ label: `${isEn ? 'Mapper' : '谱师'}:${filters.creator.trim()}` });
  }
  if (filters.video) tags.push({ label: isEn ? 'Video' : '含视频' });
  if (filters.storyboard) tags.push({ label: isEn ? 'Storyboard' : '故事板' });
  if (filters.featured) tags.push({ label: isEn ? 'Featured' : '精选艺术家' });
  if (filters.spotlight) tags.push({ label: 'Spotlight' });
  if (filters.includeConverts) tags.push({ label: isEn ? 'Converts' : '含转谱' });
  if (filters.nsfw) tags.push({ label: 'NSFW' });
  if (filters.ppIncludeUnranked) tags.push({ label: isEn ? 'Incl. Unranked PP' : '含未上架PP', tone: 'lazer' });

  return { query, tags };
}

export function formatArchiveTime(ts: number): { short: string; full: string } {
  const d = new Date(Number.isFinite(ts) ? ts : Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  const sameYear = year === new Date().getFullYear();
  return {
    short: sameYear ? `${month}-${day} ${hours}:${mins}` : `${year}-${month}-${day} ${hours}:${mins}`,
    full: `${year}-${month}-${day} ${hours}:${mins}:${secs}`,
  };
}
