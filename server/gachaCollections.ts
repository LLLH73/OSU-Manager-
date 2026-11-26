import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { st } from './i18n.js';
import {
  GachaCollectionsState,
  GachaFavoriteEntry,
  GachaFavoriteGroup,
  NormalizedBeatmapset,
} from './types.js';

export const DEFAULT_GACHA_GROUP_ID = 'default';
const MAX_GROUPS = 60;
const MAX_ENTRIES = 2000;

function getCollectionsFilePath(): string {
  return path.join(DATA_DIR, 'gacha-collections.json');
}

function sanitizeGroupName(raw: unknown, isDefault = false): string {
  const fallback = isDefault ? st('默认心动', 'Default Likes') : st('自定义分组', 'Custom Group');
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, 48);
  return trimmed || fallback;
}

function ensureDefaultGroup(groups: GachaFavoriteGroup[], now = Date.now()): GachaFavoriteGroup[] {
  const seen = new Set<string>();
  const out: GachaFavoriteGroup[] = [];
  let defaultGroup: GachaFavoriteGroup | null = null;

  for (const g of groups) {
    if (!g || typeof g.id !== 'string' || !g.id.trim() || seen.has(g.id)) continue;
    seen.add(g.id);
    if (g.id === DEFAULT_GACHA_GROUP_ID) {
      defaultGroup = {
        id: DEFAULT_GACHA_GROUP_ID,
        name: sanitizeGroupName(g.name, true),
        isDefault: true,
        createdAt: Number.isFinite(g.createdAt) ? g.createdAt : now,
        updatedAt: Number.isFinite(g.updatedAt) ? g.updatedAt : now,
      };
    } else {
      out.push({
        id: g.id.trim().slice(0, 64),
        name: sanitizeGroupName(g.name, false),
        createdAt: Number.isFinite(g.createdAt) ? g.createdAt : now,
        updatedAt: Number.isFinite(g.updatedAt) ? g.updatedAt : now,
      });
    }
    if (out.length >= MAX_GROUPS - 1) break;
  }

  if (!defaultGroup) {
    defaultGroup = {
      id: DEFAULT_GACHA_GROUP_ID,
      name: sanitizeGroupName(undefined, true),
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  return [defaultGroup, ...out];
}

function sanitizeGroupIds(rawIds: unknown, validGroupIds: Set<string>, fallbackToDefault = false): string[] {
  const list = Array.isArray(rawIds) ? rawIds : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of list) {
    if (typeof id !== 'string') continue;
    const clean = id.trim();
    if (!clean || !validGroupIds.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  if (out.length === 0 && fallbackToDefault) {
    return [DEFAULT_GACHA_GROUP_ID];
  }
  return out;
}

function readCollectionsRaw(): GachaCollectionsState {
  const now = Date.now();
  const filePath = getCollectionsFilePath();
  if (!fs.existsSync(filePath)) {
    return { groups: ensureDefaultGroup([], now), entries: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GachaCollectionsState> | null;
    const groups = ensureDefaultGroup(Array.isArray(parsed?.groups) ? parsed.groups : [], now);
    const validGroupIds = new Set(groups.map((g) => g.id));

    const entries: GachaFavoriteEntry[] = [];
    const seenSetIds = new Set<number>();
    const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    for (const item of rawEntries) {
      if (!item || typeof item !== 'object' || !item.beatmapset) continue;
      const setId = Number(item.beatmapset.id);
      if (!Number.isFinite(setId) || setId <= 0 || seenSetIds.has(setId)) continue;
      seenSetIds.add(setId);
      const groupIds = sanitizeGroupIds(item.groupIds, validGroupIds, true);
      entries.push({
        beatmapset: item.beatmapset,
        groupIds,
        addedAt: Number.isFinite(Number(item.addedAt)) ? Number(item.addedAt) : now,
      });
      if (entries.length >= MAX_ENTRIES) break;
    }

    return { groups, entries };
  } catch {
    return { groups: ensureDefaultGroup([], now), entries: [] };
  }
}

function writeCollections(state: GachaCollectionsState): GachaCollectionsState {
  const filePath = getCollectionsFilePath();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const groups = ensureDefaultGroup(state.groups);
  const validGroupIds = new Set(groups.map((g) => g.id));
  const entries = state.entries
    .slice(0, MAX_ENTRIES)
    .map((entry) => ({
      ...entry,
      groupIds: sanitizeGroupIds(entry.groupIds, validGroupIds, true),
    }));

  const normalized: GachaCollectionsState = { groups, entries };
  const payload = JSON.stringify(normalized, null, 2);
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
  return normalized;
}

export function getGachaCollections(): GachaCollectionsState {
  return readCollectionsRaw();
}

export function createGachaGroup(nameRaw: string): {
  state: GachaCollectionsState;
  group: GachaFavoriteGroup;
} {
  const current = readCollectionsRaw();
  const now = Date.now();
  const group: GachaFavoriteGroup = {
    id: `grp-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: sanitizeGroupName(nameRaw, false),
    createdAt: now,
    updatedAt: now,
  };
  const nextGroups = current.groups.length >= MAX_GROUPS ? current.groups : [...current.groups, group];
  const state = writeCollections({ groups: nextGroups, entries: current.entries });
  return { state, group };
}

export function renameGachaGroup(id: string, nameRaw: string): GachaCollectionsState | null {
  const current = readCollectionsRaw();
  const idx = current.groups.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  const now = Date.now();
  const isDefault = id === DEFAULT_GACHA_GROUP_ID;
  const groups = current.groups.map((g) =>
    g.id === id ? { ...g, name: sanitizeGroupName(nameRaw, isDefault), updatedAt: now } : g,
  );
  return writeCollections({ groups, entries: current.entries });
}

export function deleteGachaGroup(id: string): GachaCollectionsState | null {
  if (id === DEFAULT_GACHA_GROUP_ID) return null;
  const current = readCollectionsRaw();
  if (!current.groups.some((g) => g.id === id)) return null;
  const groups = current.groups.filter((g) => g.id !== id);
  const entries = current.entries.map((entry) => {
    const filtered = entry.groupIds.filter((gid) => gid !== id);
    return {
      ...entry,
      groupIds: filtered.length > 0 ? filtered : [DEFAULT_GACHA_GROUP_ID],
    };
  });
  return writeCollections({ groups, entries });
}

export function upsertGachaFavorite(
  beatmapset: NormalizedBeatmapset,
  groupIds?: string[],
): GachaCollectionsState {
  const current = readCollectionsRaw();
  const validIds = new Set(current.groups.map((g) => g.id));
  const requested = sanitizeGroupIds(groupIds, validIds, true);
  const setId = Number(beatmapset.id);
  const idx = current.entries.findIndex((e) => e.beatmapset.id === setId);

  let entries: GachaFavoriteEntry[];
  if (idx >= 0) {
    const existing = current.entries[idx];
    const merged = Array.from(new Set([...existing.groupIds, ...requested]));
    const updated: GachaFavoriteEntry = {
      beatmapset,
      groupIds: merged,
      addedAt: existing.addedAt,
    };
    entries = [updated, ...current.entries.filter((_, i) => i !== idx)];
  } else {
    entries = [
      {
        beatmapset,
        groupIds: requested,
        addedAt: Date.now(),
      },
      ...current.entries,
    ];
  }
  return writeCollections({ groups: current.groups, entries });
}

export function setGachaFavoriteGroups(setId: number, groupIds: string[]): GachaCollectionsState {
  const current = readCollectionsRaw();
  const validIds = new Set(current.groups.map((g) => g.id));
  const cleanIds = sanitizeGroupIds(groupIds, validIds, false);

  const entries =
    cleanIds.length === 0
      ? current.entries.filter((e) => e.beatmapset.id !== setId)
      : current.entries.map((e) =>
          e.beatmapset.id === setId ? { ...e, groupIds: cleanIds } : e,
        );
  return writeCollections({ groups: current.groups, entries });
}

export function removeGachaFavorite(setId: number, groupId?: string): GachaCollectionsState {
  const current = readCollectionsRaw();
  let entries: GachaFavoriteEntry[];
  if (groupId && groupId !== 'all') {
    entries = current.entries
      .map((entry) =>
        entry.beatmapset.id === setId
          ? { ...entry, groupIds: entry.groupIds.filter((gid) => gid !== groupId) }
          : entry,
      )
      .filter((entry) => entry.groupIds.length > 0);
  } else {
    entries = current.entries.filter((entry) => entry.beatmapset.id !== setId);
  }
  return writeCollections({ groups: current.groups, entries });
}

export function clearGachaGroupEntries(groupId: string): GachaCollectionsState {
  const current = readCollectionsRaw();
  if (groupId === 'all') {
    return writeCollections({ groups: current.groups, entries: [] });
  }
  const entries = current.entries
    .map((entry) => ({
      ...entry,
      groupIds: entry.groupIds.filter((gid) => gid !== groupId),
    }))
    .filter((entry) => entry.groupIds.length > 0);
  return writeCollections({ groups: current.groups, entries });
}
