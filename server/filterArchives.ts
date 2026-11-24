import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import {
  FilterArchive,
  FilterArchiveBrowsePosition,
  NormalizedBeatmapset,
  SearchFilters,
  SongViewMode,
} from './types.js';

const MAX_ARCHIVES = 100;

function getArchivesFilePath(): string {
  return path.join(DATA_DIR, 'filter-archives.json');
}

function sortArchives(list: FilterArchive[]): FilterArchive[] {
  return [...list].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff !== 0) return pinDiff;
    return b.createdAt - a.createdAt;
  });
}

function sanitizeFilters(raw: unknown): SearchFilters {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const next: SearchFilters = {};

  const strFields = ['q', 'mode', 'keys', 'status', 'sort', 'creator', 'installedFilter', 'source'] as const;
  for (const key of strFields) {
    const val = src[key];
    if (typeof val === 'string') {
      const trimmed = key === 'q' ? val.trim().slice(0, 200) : val.trim().slice(0, 64);
      if (trimmed || key === 'q') {
        (next as Record<string, unknown>)[key] = trimmed;
      }
    }
  }

  const numFields = [
    'genre',
    'language',
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
  for (const key of numFields) {
    const val = src[key];
    if (val === undefined || val === null || val === '') continue;
    const n = Number(val);
    if (Number.isFinite(n)) {
      (next as Record<string, unknown>)[key] = n;
    }
  }

  const boolFields = [
    'video',
    'storyboard',
    'spotlight',
    'featured',
    'nsfw',
    'includeConverts',
    'ppClassic',
    'ppEz',
    'ppNf',
    'ppIncludeUnranked',
  ] as const;
  for (const key of boolFields) {
    if (typeof src[key] === 'boolean') {
      (next as Record<string, unknown>)[key] = src[key];
    }
  }

  return next;
}

function normalizeViewMode(val: unknown): SongViewMode {
  return val === 'grid' || val === 'list' || val === 'lazer' ? val : 'lazer';
}

function sanitizeBrowsePosition(raw: unknown): FilterArchiveBrowsePosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const anchorId = Math.round(Number(obj.anchorBeatmapsetId));
  if (!Number.isFinite(anchorId) || anchorId <= 0) return null;

  const beatmapIdRaw =
    obj.anchorBeatmapId !== undefined && obj.anchorBeatmapId !== null
      ? Math.round(Number(obj.anchorBeatmapId))
      : null;
  const anchorBeatmapId =
    beatmapIdRaw !== null && Number.isFinite(beatmapIdRaw) && beatmapIdRaw > 0
      ? beatmapIdRaw
      : null;

  const contextBeatmapsetIds: number[] = [];
  if (Array.isArray(obj.contextBeatmapsetIds)) {
    const seen = new Set<number>();
    for (const item of obj.contextBeatmapsetIds) {
      const id = Math.round(Number(item));
      if (Number.isFinite(id) && id > 0 && id !== anchorId && !seen.has(id)) {
        seen.add(id);
        contextBeatmapsetIds.push(id);
        if (contextBeatmapsetIds.length >= 12) break;
      }
    }
  }

  let contextSnapshot: NormalizedBeatmapset[] | undefined;
  if (Array.isArray(obj.contextSnapshot)) {
    const validSnaps: NormalizedBeatmapset[] = [];
    for (const item of obj.contextSnapshot) {
      if (item && typeof item === 'object' && Number((item as NormalizedBeatmapset).id) > 0) {
        validSnaps.push(item as NormalizedBeatmapset);
        if (validSnaps.length >= 13) break;
      }
    }
    if (validSnaps.length > 0) {
      contextSnapshot = validSnaps;
    }
  }

  const scrollRaw = Number(obj.scrollTop);
  const provider =
    obj.provider === 'osudirect' || obj.provider === 'sayobot' ? obj.provider : undefined;

  return {
    anchorBeatmapsetId: anchorId,
    anchorBeatmapId,
    anchorTitle: typeof obj.anchorTitle === 'string' ? obj.anchorTitle.slice(0, 160) : `#${anchorId}`,
    anchorArtist: typeof obj.anchorArtist === 'string' ? obj.anchorArtist.slice(0, 160) : '',
    anchorCreator:
      typeof obj.anchorCreator === 'string' && obj.anchorCreator
        ? obj.anchorCreator.slice(0, 100)
        : undefined,
    anchorCoverUrl:
      typeof obj.anchorCoverUrl === 'string' && obj.anchorCoverUrl
        ? obj.anchorCoverUrl.slice(0, 300)
        : undefined,
    anchorIndex: Math.max(0, Math.round(Number(obj.anchorIndex) || 0)),
    loadedCount: Math.max(1, Math.round(Number(obj.loadedCount) || 1)),
    batchUpstreamOffset: Math.max(0, Math.round(Number(obj.batchUpstreamOffset) || 0)),
    nextUpstreamOffset: Math.max(0, Math.round(Number(obj.nextUpstreamOffset) || 0)),
    provider,
    viewMode: normalizeViewMode(obj.viewMode),
    scrollTop: Number.isFinite(scrollRaw) && scrollRaw >= 0 ? Math.round(scrollRaw) : undefined,
    contextBeatmapsetIds,
    contextSnapshot,
  };
}

function readArchivesRaw(): FilterArchive[] {
  const filePath = getArchivesFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: FilterArchive[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== 'string' || !obj.id.trim()) continue;
      const createdAt = Number.isFinite(Number(obj.createdAt)) ? Number(obj.createdAt) : Date.now();
      const updatedAt = Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : createdAt;
      const name =
        typeof obj.name === 'string' && obj.name.trim()
          ? obj.name.trim().slice(0, 80)
          : '未命名存档';
      list.push({
        id: obj.id.trim(),
        name,
        createdAt,
        updatedAt,
        filters: sanitizeFilters(obj.filters),
        browsePosition: sanitizeBrowsePosition(obj.browsePosition),
        pinned: Boolean(obj.pinned),
      });
    }
    return sortArchives(list);
  } catch {
    return [];
  }
}

function writeArchives(list: FilterArchive[]): FilterArchive[] {
  const filePath = getArchivesFilePath();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sorted = sortArchives(list);
  const payload = JSON.stringify(sorted, null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    fs.writeFileSync(filePath, payload, 'utf8');
  }
  return sorted;
}

function capArchives(list: FilterArchive[]): FilterArchive[] {
  if (list.length <= MAX_ARCHIVES) return list;
  const pinned = list.filter((a) => a.pinned).sort((a, b) => b.createdAt - a.createdAt);
  const unpinned = list.filter((a) => !a.pinned).sort((a, b) => b.createdAt - a.createdAt);
  const remainingSlots = Math.max(0, MAX_ARCHIVES - pinned.length);
  return sortArchives([...pinned.slice(0, MAX_ARCHIVES), ...unpinned.slice(0, remainingSlots)]);
}

export function listFilterArchives(): FilterArchive[] {
  return readArchivesRaw();
}

export function createFilterArchive(input: {
  name?: string;
  filters: SearchFilters;
  browsePosition?: FilterArchiveBrowsePosition | null;
  pinned?: boolean;
}): FilterArchive {
  const existing = readArchivesRaw();
  const now = Date.now();
  const cleanName =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim().slice(0, 80)
      : '未命名存档';
  const entry: FilterArchive = {
    id: `fa-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    createdAt: now,
    updatedAt: now,
    filters: sanitizeFilters(input.filters),
    browsePosition: sanitizeBrowsePosition(input.browsePosition),
    pinned: Boolean(input.pinned),
  };
  const next = capArchives([entry, ...existing]);
  writeArchives(next);
  return entry;
}

export function updateFilterArchive(
  id: string,
  patch: {
    name?: string;
    filters?: SearchFilters;
    browsePosition?: FilterArchiveBrowsePosition | null;
    pinned?: boolean;
  },
): FilterArchive | null {
  const existing = readArchivesRaw();
  const idx = existing.findIndex((item) => item.id === id);
  if (idx < 0) return null;

  const current = existing[idx];
  const updated: FilterArchive = {
    ...current,
    name:
      typeof patch.name === 'string' && patch.name.trim()
        ? patch.name.trim().slice(0, 80)
        : current.name,
    filters: patch.filters !== undefined ? sanitizeFilters(patch.filters) : current.filters,
    browsePosition:
      patch.browsePosition === undefined
        ? current.browsePosition
        : sanitizeBrowsePosition(patch.browsePosition),
    pinned: patch.pinned !== undefined ? Boolean(patch.pinned) : current.pinned,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  };

  const next = existing.map((item, i) => (i === idx ? updated : item));
  writeArchives(next);
  return updated;
}

export function deleteFilterArchive(id: string): boolean {
  const existing = readArchivesRaw();
  const next = existing.filter((item) => item.id !== id);
  if (next.length === existing.length) return false;
  writeArchives(next);
  return true;
}
