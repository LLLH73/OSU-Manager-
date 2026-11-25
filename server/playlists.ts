import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { st } from './i18n.js';
import { MusicPlaylist } from './types.js';

const MAX_PLAYLISTS = 100;
const MAX_PLAYLIST_TRACKS = 5000;

function getPlaylistsFilePath(): string {
  return path.join(DATA_DIR, 'playlists.json');
}

function sortPlaylists(list: MusicPlaylist[]): MusicPlaylist[] {
  return [...list].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff !== 0) return pinDiff;
    return b.updatedAt - a.updatedAt;
  });
}

function sanitizeBookKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const key = item.trim().slice(0, 160);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_PLAYLIST_TRACKS) break;
  }
  return out;
}

function sanitizeName(raw: unknown): string {
  const fallback = st('未命名歌单', 'Untitled Playlist');
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, 80);
  return trimmed || fallback;
}

function sanitizeDescription(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 240);
}

function sanitizeCoverBookKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 160);
  return trimmed || null;
}

function readPlaylistsRaw(): MusicPlaylist[] {
  const filePath = getPlaylistsFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list: MusicPlaylist[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== 'string' || !obj.id.trim()) continue;
      const createdAt = Number.isFinite(Number(obj.createdAt)) ? Number(obj.createdAt) : Date.now();
      const updatedAt = Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : createdAt;
      list.push({
        id: obj.id.trim(),
        name: sanitizeName(obj.name),
        description: sanitizeDescription(obj.description),
        coverBookKey: sanitizeCoverBookKey(obj.coverBookKey),
        bookKeys: sanitizeBookKeys(obj.bookKeys),
        pinned: Boolean(obj.pinned),
        createdAt,
        updatedAt,
      });
    }
    return sortPlaylists(list);
  } catch {
    return [];
  }
}

function writePlaylists(list: MusicPlaylist[]): MusicPlaylist[] {
  const filePath = getPlaylistsFilePath();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sorted = sortPlaylists(list);
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

function capPlaylists(list: MusicPlaylist[]): MusicPlaylist[] {
  if (list.length <= MAX_PLAYLISTS) return list;
  const pinned = list.filter((p) => p.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const unpinned = list.filter((p) => !p.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const remaining = Math.max(0, MAX_PLAYLISTS - pinned.length);
  return sortPlaylists([...pinned.slice(0, MAX_PLAYLISTS), ...unpinned.slice(0, remaining)]);
}

export function listPlaylists(): MusicPlaylist[] {
  return readPlaylistsRaw();
}

export function createPlaylist(input: {
  name?: string;
  description?: string;
  coverBookKey?: string | null;
  bookKeys?: string[];
  pinned?: boolean;
}): MusicPlaylist {
  const existing = readPlaylistsRaw();
  const now = Date.now();
  const bookKeys = sanitizeBookKeys(input.bookKeys);
  const coverBookKey = sanitizeCoverBookKey(input.coverBookKey) ?? (bookKeys[0] ?? null);
  const entry: MusicPlaylist = {
    id: `pl-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: sanitizeName(input.name),
    description: sanitizeDescription(input.description),
    coverBookKey,
    bookKeys,
    pinned: Boolean(input.pinned),
    createdAt: now,
    updatedAt: now,
  };
  const next = capPlaylists([entry, ...existing]);
  writePlaylists(next);
  return entry;
}

export function updatePlaylist(
  id: string,
  patch: {
    name?: string;
    description?: string;
    coverBookKey?: string | null;
    bookKeys?: string[];
    pinned?: boolean;
  },
): MusicPlaylist | null {
  const existing = readPlaylistsRaw();
  const idx = existing.findIndex((item) => item.id === id);
  if (idx < 0) return null;

  const current = existing[idx];
  const nextBookKeys =
    patch.bookKeys !== undefined ? sanitizeBookKeys(patch.bookKeys) : current.bookKeys;
  const nextCover =
    patch.coverBookKey !== undefined
      ? sanitizeCoverBookKey(patch.coverBookKey)
      : current.coverBookKey && nextBookKeys.includes(current.coverBookKey)
        ? current.coverBookKey
        : nextBookKeys[0] ?? null;

  const updated: MusicPlaylist = {
    ...current,
    name: patch.name !== undefined ? sanitizeName(patch.name) : current.name,
    description:
      patch.description !== undefined ? sanitizeDescription(patch.description) : current.description,
    coverBookKey: nextCover,
    bookKeys: nextBookKeys,
    pinned: patch.pinned !== undefined ? Boolean(patch.pinned) : current.pinned,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  };

  const next = existing.map((item, i) => (i === idx ? updated : item));
  writePlaylists(next);
  return updated;
}

export function deletePlaylist(id: string): boolean {
  const existing = readPlaylistsRaw();
  const next = existing.filter((item) => item.id !== id);
  if (next.length === existing.length) return false;
  writePlaylists(next);
  return true;
}
