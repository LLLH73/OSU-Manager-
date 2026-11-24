import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { DATA_DIR, getConfig } from './config.js';
import { LazerPendingFile, LibraryDiffResult, LocalBeatmapsetStatus, LocalLibraryStatus } from './types.js';

const execFileAsync = promisify(execFile);
const LAZER_CACHE_FILE = path.join(DATA_DIR, 'lazer-scan-cache.json');

export const libraryEvents = new EventEmitter();

interface LibraryState {
  stableMap: Map<number, string>; // setId -> folder or .osz name
  lazerIds: Set<number>;
  lazerDeepScanRunning: boolean;
  lastScanned: string | null;
}

const state: LibraryState = {
  stableMap: new Map(),
  lazerIds: new Set(),
  lazerDeepScanRunning: false,
  lastScanned: null,
};

let processCache: { stableRunning: boolean; lazerRunning: boolean; checkedAt: number } | null = null;

export async function detectRunningClients(force = false): Promise<{ stableRunning: boolean; lazerRunning: boolean }> {
  if (!force && processCache && Date.now() - processCache.checkedAt < 5000) {
    return { stableRunning: processCache.stableRunning, lazerRunning: processCache.lazerRunning };
  }

  let stableRunning = false;
  let lazerRunning = false;
  const cfg = getConfig();
  const normStable = path.resolve(cfg.stablePath).toLowerCase();
  const normLazerExe = path.resolve(cfg.lazerExePath).toLowerCase();

  try {
    const { stdout } = await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='osu!.exe'\" | Select-Object ExecutablePath | ConvertTo-Json -Compress",
      ],
      { timeout: 3500, windowsHide: true },
    );
    const trimmed = stdout.trim();
    if (trimmed) {
      const parsed = JSON.parse(trimmed);
      const list: Array<{ ExecutablePath?: string | null }> = Array.isArray(parsed) ? parsed : [parsed];
      for (const proc of list) {
        const exePath = (proc.ExecutablePath || '').toLowerCase();
        if (!exePath) continue;
        if (exePath.includes('osulazer') || exePath === normLazerExe) {
          lazerRunning = true;
        } else if (exePath.startsWith(normStable) || !exePath.includes('lazer')) {
          stableRunning = true;
        }
      }
    }
  } catch {
    // Ignore PowerShell errors (e.g. no running processes)
  }

  processCache = { stableRunning, lazerRunning, checkedAt: Date.now() };
  return { stableRunning, lazerRunning };
}

function readBeatmapSetIdFromFolder(folderPath: string): number | null {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.osu')) continue;
      const fd = fs.openSync(path.join(folderPath, entry.name), 'r');
      try {
        const buf = Buffer.allocUnsafe(2048);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        const head = buf.subarray(0, bytesRead).toString('utf8');
        const m = head.match(/BeatmapSetID\s*:\s*(\d+)/);
        if (m) {
          const id = Number(m[1]);
          if (id > 0) return id;
        }
      } finally {
        fs.closeSync(fd);
      }
      break;
    }
  } catch {
    // Ignore unreadable folders
  }
  return null;
}

export function scanStableLibrary(stablePath: string): Map<number, string> {
  const result = new Map<number, string>();
  const songsDir = path.join(stablePath, 'Songs');
  if (!fs.existsSync(songsDir)) return result;

  try {
    const entries = fs.readdirSync(songsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.tmp-')) continue;
      const numMatch = entry.name.match(/^(\d+)\b/);
      if (numMatch) {
        const id = Number(numMatch[1]);
        if (id > 0 && !result.has(id)) {
          result.set(id, entry.name);
        }
        continue;
      }
      if (entry.isDirectory()) {
        const parsedId = readBeatmapSetIdFromFolder(path.join(songsDir, entry.name));
        if (parsedId && !result.has(parsedId)) {
          result.set(parsedId, entry.name);
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return result;
}

function readBufferWithLockFallback(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    const tmpCopy = path.join(os.tmpdir(), `osu-realm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      fs.copyFileSync(filePath, tmpCopy);
      return fs.readFileSync(tmpCopy);
    } catch {
      return null;
    } finally {
      try {
        if (fs.existsSync(tmpCopy)) fs.unlinkSync(tmpCopy);
      } catch {
        // Ignore cleanup
      }
    }
  }
}

function openOnlineDb(onlineDbPath: string): { db: DatabaseSync; cleanup: () => void } | null {
  try {
    const db = new DatabaseSync(onlineDbPath, { readOnly: true });
    return { db, cleanup: () => db.close() };
  } catch {
    const tmpDb = path.join(os.tmpdir(), `osu-online-${Date.now()}.db`);
    try {
      fs.copyFileSync(onlineDbPath, tmpDb);
      const db = new DatabaseSync(tmpDb, { readOnly: true });
      return {
        db,
        cleanup: () => {
          db.close();
          try {
            if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
          } catch {
            // Ignore
          }
        },
      };
    } catch {
      return null;
    }
  }
}

function loadLazerDeepCache(): Record<string, number> {
  try {
    if (fs.existsSync(LAZER_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(LAZER_CACHE_FILE, 'utf8')) as Record<string, number>;
    }
  } catch {
    // Ignore corrupt cache
  }
  return {};
}

function saveLazerDeepCache(cache: Record<string, number>): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LAZER_CACHE_FILE, JSON.stringify(cache), 'utf8');
  } catch {
    // Ignore write failure
  }
}

function scanLazerFast(lazerDataPath: string): {
  ids: Set<number>;
  sha256List: string[];
} {
  const ids = new Set<number>();
  const realmPath = path.join(lazerDataPath, 'client.realm');
  const onlineDbPath = path.join(lazerDataPath, 'online.db');
  if (!fs.existsSync(realmPath)) {
    return { ids, sha256List: [] };
  }

  const realmBuf = readBufferWithLockFallback(realmPath);
  if (!realmBuf) {
    return { ids, sha256List: [] };
  }

  const realmAscii = realmBuf.toString('latin1');
  const md5Matches = realmAscii.match(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g) || [];
  const md5s = Array.from(new Set(md5Matches));

  const shaMatches = realmAscii.match(/[0-9a-f]{64}/g) || [];
  const sha256List = Array.from(new Set(shaMatches));

  // Merge already cached deep-scan IDs immediately
  const deepCache = loadLazerDeepCache();
  for (const h of sha256List) {
    const cachedId = deepCache[h];
    if (cachedId && cachedId > 0) {
      ids.add(cachedId);
    }
  }

  // Query online.db for instant coverage of ranked/known beatmaps
  if (fs.existsSync(onlineDbPath) && md5s.length > 0) {
    const handle = openOnlineDb(onlineDbPath);
    if (handle) {
      try {
        for (let i = 0; i < md5s.length; i += 800) {
          const chunk = md5s.slice(i, i + 800);
          const placeholders = chunk.map(() => '?').join(',');
          const stmt = handle.db.prepare(
            `SELECT DISTINCT beatmapset_id FROM osu_beatmaps WHERE checksum IN (${placeholders})`,
          );
          const rows = stmt.all(...chunk) as Array<{ beatmapset_id: number }>;
          for (const row of rows) {
            if (row.beatmapset_id > 0) ids.add(row.beatmapset_id);
          }
        }
      } catch {
        // Ignore query error
      } finally {
        handle.cleanup();
      }
    }
  }

  return { ids, sha256List };
}

let deepScanActive = false;

async function runLazerDeepScan(lazerDataPath: string, sha256List: string[]): Promise<void> {
  if (deepScanActive || sha256List.length === 0) return;
  const filesDir = path.join(lazerDataPath, 'files');
  if (!fs.existsSync(filesDir)) return;

  const cache = loadLazerDeepCache();
  const missing = sha256List.filter((h) => cache[h] === undefined);
  if (missing.length === 0) return;

  deepScanActive = true;
  state.lazerDeepScanRunning = true;

  try {
    let idx = 0;
    const newlyFoundIds = new Set<number>();
    const workerCount = 24;

    const worker = async () => {
      while (idx < missing.length) {
        const myIdx = idx++;
        const h = missing[myIdx];
        const filePath = path.join(filesDir, h[0], h.slice(0, 2), h);
        try {
          const st = await fs.promises.stat(filePath);
          if (!st.isFile() || st.size < 180 || st.size > 1_500_000) {
            cache[h] = 0;
            continue;
          }
          const fh = await fs.promises.open(filePath, 'r');
          try {
            const buf = Buffer.allocUnsafe(Math.min(2048, st.size));
            const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
            const head = buf.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '');
            if (!head.startsWith('osu file format v')) {
              cache[h] = 0;
              continue;
            }
            const m = head.match(/BeatmapSetID\s*:\s*(\d+)/);
            const sid = m ? Number(m[1]) : 0;
            cache[h] = sid > 0 ? sid : 0;
            if (sid > 0) newlyFoundIds.add(sid);
          } finally {
            await fh.close();
          }
        } catch {
          cache[h] = 0;
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    saveLazerDeepCache(cache);
    for (const sid of newlyFoundIds) {
      state.lazerIds.add(sid);
    }
  } finally {
    deepScanActive = false;
    state.lazerDeepScanRunning = false;
    libraryEvents.emit('update', await getLibraryStatus(false));
  }
}

export function scanLazerPendingFiles(importDir: string): LazerPendingFile[] {
  if (!importDir || !fs.existsSync(importDir)) return [];
  try {
    const entries = fs.readdirSync(importDir, { withFileTypes: true });
    const list: LazerPendingFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.osz')) continue;
      const fullPath = path.join(importDir, entry.name);
      const st = fs.statSync(fullPath);
      const m = entry.name.match(/^(\d+)\b/);
      list.push({
        filename: entry.name,
        fullPath,
        beatmapsetId: m ? Number(m[1]) : null,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    }
    list.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return list;
  } catch {
    return [];
  }
}

export async function rescanLibrary(triggerDeepScan = true): Promise<LocalLibraryStatus> {
  const cfg = getConfig();
  state.stableMap = scanStableLibrary(cfg.stablePath);
  const { ids, sha256List } = scanLazerFast(cfg.lazerDataPath);
  state.lazerIds = ids;
  state.lastScanned = new Date().toISOString();

  if (triggerDeepScan && sha256List.length > 0) {
    void runLazerDeepScan(cfg.lazerDataPath, sha256List);
  }

  const status = await getLibraryStatus(true);
  libraryEvents.emit('update', status);
  return status;
}

export async function getLibraryStatus(refreshProcesses = true): Promise<LocalLibraryStatus> {
  const cfg = getConfig();
  if (!state.lastScanned) {
    state.stableMap = scanStableLibrary(cfg.stablePath);
    const { ids, sha256List } = scanLazerFast(cfg.lazerDataPath);
    state.lazerIds = ids;
    state.lastScanned = new Date().toISOString();
    if (sha256List.length > 0) {
      void runLazerDeepScan(cfg.lazerDataPath, sha256List);
    }
  }

  const running = await detectRunningClients(refreshProcesses);
  const pendingFiles = scanLazerPendingFiles(cfg.lazerImportDir);

  return {
    stablePath: cfg.stablePath,
    stableExists: fs.existsSync(path.join(cfg.stablePath, 'Songs')),
    stableCount: state.stableMap.size,
    stableRunning: running.stableRunning,
    stableExeExists: Boolean(cfg.stablePath && fs.existsSync(path.join(cfg.stablePath, 'osu!.exe'))),
    lazerDataPath: cfg.lazerDataPath,
    lazerExists: fs.existsSync(path.join(cfg.lazerDataPath, 'client.realm')),
    lazerCount: state.lazerIds.size,
    lazerDeepScanRunning: state.lazerDeepScanRunning,
    lazerRunning: running.lazerRunning,
    lazerExeExists: Boolean(cfg.lazerExePath && fs.existsSync(cfg.lazerExePath)),
    lazerImportDir: cfg.lazerImportDir,
    lazerPendingCount: pendingFiles.length,
    lazerPendingFiles: pendingFiles,
    lastScanned: state.lastScanned,
  };
}

export function getBeatmapsetLocalStatus(setId: number): LocalBeatmapsetStatus {
  const cfg = getConfig();
  const pendingFiles = scanLazerPendingFiles(cfg.lazerImportDir);
  const inLazerPending = pendingFiles.some((f) => f.beatmapsetId === setId);
  const stableFolder = state.stableMap.get(setId);
  return {
    inStable: Boolean(stableFolder),
    inLazer: state.lazerIds.has(setId),
    inLazerPending,
    stableFolder,
  };
}

export function getLocalSetsSnapshot(): {
  stableMap: Map<number, string>;
  lazerIds: Set<number>;
  pendingIds: Set<number>;
} {
  const cfg = getConfig();
  const pending = scanLazerPendingFiles(cfg.lazerImportDir);
  const pendingIds = new Set<number>();
  for (const p of pending) {
    if (p.beatmapsetId) pendingIds.add(p.beatmapsetId);
  }
  return {
    stableMap: state.stableMap,
    lazerIds: state.lazerIds,
    pendingIds,
  };
}

export function markInstalledInMemory(setId: number, target: 'stable' | 'lazer', folderName?: string): void {
  if (target === 'stable') {
    state.stableMap.set(setId, folderName || String(setId));
  } else {
    state.lazerIds.add(setId);
  }
}

export function getLibraryDiff(): LibraryDiffResult {
  const stableOnly: LibraryDiffResult['stableOnly'] = [];
  const lazerOnly: LibraryDiffResult['lazerOnly'] = [];
  let inBothCount = 0;

  for (const [sid, folderName] of state.stableMap.entries()) {
    if (state.lazerIds.has(sid)) {
      inBothCount++;
    } else {
      stableOnly.push({
        beatmapsetId: sid,
        label: folderName,
        folderName,
      });
    }
  }

  for (const sid of state.lazerIds) {
    if (!state.stableMap.has(sid)) {
      lazerOnly.push({
        beatmapsetId: sid,
        label: `#${sid}`,
      });
    }
  }

  stableOnly.sort((a, b) => a.beatmapsetId - b.beatmapsetId);
  lazerOnly.sort((a, b) => b.beatmapsetId - a.beatmapsetId);

  return { stableOnly, lazerOnly, inBothCount };
}
