import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { DATA_DIR, getConfig, loadConfig, saveConfig } from './config.js';
import {
  cancelDownload,
  clearFinishedDownloads,
  downloadEvents,
  enqueueDownload,
  listDownloads,
  retryDownload,
} from './downloader.js';
import { detectLocalEnvironment } from './envDetect.js';
import {
  clearFastBatch,
  fastBatchEvents,
  getFastBatchSnapshot,
  pauseFastBatch,
  resumeFastBatch,
  startFastBatch,
  stopFastBatch,
  stopFastBatchOnShutdown,
} from './fastBatch.js';
import {
  createFilterArchive,
  deleteFilterArchive,
  listFilterArchives,
  updateFilterArchive,
} from './filterArchives.js';
import {
  clearLazerPendingFiles,
  launchGameClient,
  launchLazerBatchImport,
  loadBeatmapIntoRunningGame,
  openFolderInExplorer,
  syncStableToLazer,
} from './installer.js';
import {
  detectRunningClients,
  getLibraryDiff,
  getLibraryStatus,
  libraryEvents,
  rescanLibrary,
} from './library.js';
import {
  getBookDetail,
  getBookRhythm,
  getBooksLibrary,
  invalidateBooksCache,
  serveBookAudio,
  serveBookCover,
} from './localLibrary.js';
import {
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  updatePlaylist,
} from './playlists.js';
import { getLogFilePath, logError, logInfo, readRecentLogs } from './logger.js';
import { serveCover, servePreview } from './media.js';
import { benchmarkMirrors, getNetworkStatus, networkEvents, resetProxyCache } from './network.js';
import {
  getParsedManiaChart,
  getPreviewBeatmapset,
  servePreviewAudio,
  servePreviewBackground,
} from './preview.js';
import { getBeatmapsetDetail, searchBeatmaps } from './search.js';
import { listSkins, resolveManiaSkin, serveSkinAsset } from './skins.js';
import { AppConfig, InstalledFilter, SearchFilters, SearchMode, SearchSource, SearchStatus } from './types.js';

const app = express();

libraryEvents.on('update', () => {
  invalidateBooksCache();
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const CUSTOM_BG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'] as const;
const CUSTOM_BG_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

function findCustomBgFile(): string | null {
  for (const ext of CUSTOM_BG_EXTS) {
    const candidate = path.join(DATA_DIR, `custom-bg${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function removeCustomBgFiles(): void {
  for (const ext of CUSTOM_BG_EXTS) {
    const candidate = path.join(DATA_DIR, `custom-bg${ext}`);
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
      } catch {
        // Ignore cleanup failure
      }
    }
  }
}

function parseOptNum(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptBool(val: unknown): boolean | undefined {
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return undefined;
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/logs', (req: Request, res: Response) => {
  const requested = parseOptNum(req.query.lines) ?? 120;
  const clamped = Math.min(500, Math.max(1, Math.floor(requested)));
  const lines = readRecentLogs(clamped);
  res.json({
    logFile: getLogFilePath(),
    count: lines.length,
    lines,
  });
});

// Config
app.get('/api/config', (_req: Request, res: Response) => {
  res.json(getConfig());
});

app.get('/api/config/detect-env', async (_req: Request, res: Response) => {
  res.json(await detectLocalEnvironment());
});

app.post('/api/config/detect-env', async (req: Request, res: Response) => {
  const probe = (req.body || {}) as Partial<
    Pick<
      AppConfig,
      'stablePath' | 'lazerDataPath' | 'lazerExePath' | 'lazerImportDir' | 'proxyHost' | 'proxyPort'
    >
  >;
  res.json(await detectLocalEnvironment(probe));
});

app.put('/api/config', async (req: Request, res: Response) => {
  const body = (req.body || {}) as Partial<AppConfig>;
  const updated = saveConfig(body);
  logInfo('config', 'Updated config', { keys: Object.keys(body) });
  resetProxyCache();
  invalidateBooksCache();
  await rescanLibrary(false);
  res.json(updated);
});

app.get('/api/media/custom-bg', (_req: Request, res: Response) => {
  const filePath = findCustomBgFile();
  if (!filePath) {
    res.status(404).end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Cache-Control', 'no-cache');
  res.type(CUSTOM_BG_MIME[ext] || 'image/png').sendFile(filePath);
});

app.post('/api/config/background', (req: Request, res: Response) => {
  const body = (req.body || {}) as { filePath?: string; dataUrl?: string; url?: string };
  const maxBytes = 20 * 1024 * 1024;

  if (typeof body.filePath === 'string' && body.filePath.trim()) {
    const resolved = path.resolve(body.filePath.trim());
    const ext = path.extname(resolved).toLowerCase();
    if (!CUSTOM_BG_EXTS.includes(ext as (typeof CUSTOM_BG_EXTS)[number])) {
      res.status(400).json({ error: '仅支持 PNG / JPG / WEBP / GIF / AVIF 图片格式' });
      return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.status(400).json({ error: '选择的图片文件不存在' });
      return;
    }
    if (fs.statSync(resolved).size > maxBytes) {
      res.status(400).json({ error: '背景图片不能超过 20 MB' });
      return;
    }
    removeCustomBgFiles();
    const targetPath = path.join(DATA_DIR, `custom-bg${ext}`);
    fs.copyFileSync(resolved, targetPath);
    const updated = saveConfig({ customBgImage: `/api/media/custom-bg?v=${Date.now()}` });
    res.json(updated);
    return;
  }

  if (typeof body.dataUrl === 'string' && body.dataUrl.trim()) {
    const match = body.dataUrl
      .trim()
      .match(/^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      res.status(400).json({ error: '无效的图片 DataURL 格式' });
      return;
    }
    const rawSubtype = match[1].toLowerCase();
    const ext = rawSubtype === 'jpeg' ? '.jpg' : `.${rawSubtype}`;
    const buf = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (buf.length === 0 || buf.length > maxBytes) {
      res.status(400).json({ error: '背景图片为空或超过 20 MB 限制' });
      return;
    }
    removeCustomBgFiles();
    const targetPath = path.join(DATA_DIR, `custom-bg${ext}`);
    fs.writeFileSync(targetPath, buf);
    const updated = saveConfig({ customBgImage: `/api/media/custom-bg?v=${Date.now()}` });
    res.json(updated);
    return;
  }

  if (typeof body.url === 'string' && /^https?:\/\//i.test(body.url.trim())) {
    removeCustomBgFiles();
    const updated = saveConfig({ customBgImage: body.url.trim() });
    res.json(updated);
    return;
  }

  res.status(400).json({ error: '请提供有效的本地图片路径、图片数据或 HTTP(S) 图片链接' });
});

app.delete('/api/config/background', (_req: Request, res: Response) => {
  removeCustomBgFiles();
  const updated = saveConfig({ customBgImage: '' });
  res.json(updated);
});

// Network & Mirrors
app.get('/api/network/status', async (req: Request, res: Response) => {
  const refresh = req.query.refresh === 'true';
  const status = await getNetworkStatus(refresh);
  res.json(status);
});

app.post('/api/network/benchmark', async (_req: Request, res: Response) => {
  const status = await benchmarkMirrors(true);
  res.json(status);
});

// Search
app.get('/api/search', async (req: Request, res: Response) => {
  try {
    const q = req.query;
    const filters: SearchFilters = {
      q: typeof q.q === 'string' ? q.q : undefined,
      mode: (typeof q.mode === 'string' ? q.mode : '3') as SearchMode,
      keys: typeof q.keys === 'string' ? q.keys : undefined,
      status: (typeof q.status === 'string' ? q.status : 'leaderboard') as SearchStatus,
      sort: typeof q.sort === 'string' ? q.sort : 'ranked_date:desc',
      genre: parseOptNum(q.genre),
      language: parseOptNum(q.language),
      video: parseOptBool(q.video),
      storyboard: parseOptBool(q.storyboard),
      spotlight: parseOptBool(q.spotlight),
      featured: parseOptBool(q.featured),
      nsfw: parseOptBool(q.nsfw),
      includeConverts: parseOptBool(q.includeConverts),
      minStars: parseOptNum(q.minStars),
      maxStars: parseOptNum(q.maxStars),
      minBpm: parseOptNum(q.minBpm),
      maxBpm: parseOptNum(q.maxBpm),
      minLength: parseOptNum(q.minLength),
      maxLength: parseOptNum(q.maxLength),
      minOd: parseOptNum(q.minOd),
      maxOd: parseOptNum(q.maxOd),
      minHp: parseOptNum(q.minHp),
      maxHp: parseOptNum(q.maxHp),
      minAr: parseOptNum(q.minAr),
      maxAr: parseOptNum(q.maxAr),
      minLn: parseOptNum(q.minLn),
      maxLn: parseOptNum(q.maxLn),
      minPp: parseOptNum(q.minPp),
      maxPp: parseOptNum(q.maxPp),
      ppAccuracy: parseOptNum(q.ppAccuracy),
      ppRate: parseOptNum(q.ppRate),
      ppMisses: parseOptNum(q.ppMisses),
      ppMaRatio: parseOptNum(q.ppMaRatio),
      ppClassic: parseOptBool(q.ppClassic),
      ppEz: parseOptBool(q.ppEz),
      ppNf: parseOptBool(q.ppNf),
      ppIncludeUnranked: parseOptBool(q.ppIncludeUnranked),
      creator: typeof q.creator === 'string' ? q.creator : undefined,
      installedFilter: (typeof q.installedFilter === 'string'
        ? q.installedFilter
        : 'all') as InstalledFilter,
      source: (typeof q.source === 'string' ? q.source : 'auto') as SearchSource,
      offset: parseOptNum(q.offset) ?? 0,
      limit: parseOptNum(q.limit) ?? 24,
    };

    const result = await searchBeatmaps(filters);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '搜索请求失败';
    logError('search', 'Search failed', { q: req.query.q, error: msg });
    res.status(502).json({
      error: msg,
    });
  }
});

app.get('/api/beatmapset/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid beatmapset ID' });
    return;
  }
  const detail = await getBeatmapsetDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'Beatmapset not found' });
    return;
  }
  res.json(detail);
});

// Media proxy + cache
app.get('/api/media/cover/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).end();
    return;
  }
  await serveCover(id, res);
});

app.get('/api/media/preview/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).end();
    return;
  }
  await servePreview(id, req, res);
});

// Beatmap Mania Preview & Skins
app.get('/api/preview/beatmapset/:setId', (req: Request, res: Response) => {
  const setId = Number(req.params.setId);
  if (!Number.isFinite(setId) || setId <= 0) {
    res.status(400).json({ error: '无效的 beatmapsetId' });
    return;
  }
  const info = getPreviewBeatmapset(setId);
  if (!info) {
    res.status(404).json({ error: '未找到本地 Mania 谱面文件（请先下载或确认曲库目录）' });
    return;
  }
  res.json(info);
});

app.get('/api/preview/beatmapset/:setId/chart/:index', (req: Request, res: Response) => {
  const setId = Number(req.params.setId);
  const index = Number(req.params.index);
  if (!Number.isFinite(setId) || setId <= 0 || !Number.isFinite(index) || index < 0) {
    res.status(400).json({ error: '参数无效' });
    return;
  }
  const chart = getParsedManiaChart(setId, Math.floor(index));
  if (!chart) {
    res.status(404).json({ error: '未找到对应 Mania 难度谱面' });
    return;
  }
  res.json(chart);
});

app.get('/api/preview/beatmapset/:setId/audio/:index', async (req: Request, res: Response) => {
  const setId = Number(req.params.setId);
  const index = Number(req.params.index);
  if (!Number.isFinite(setId) || setId <= 0 || !Number.isFinite(index) || index < 0) {
    res.status(400).end();
    return;
  }
  await servePreviewAudio(setId, Math.floor(index), req, res);
});

app.get('/api/preview/beatmapset/:setId/bg/:index', async (req: Request, res: Response) => {
  const setId = Number(req.params.setId);
  const index = Number(req.params.index);
  if (!Number.isFinite(setId) || setId <= 0 || !Number.isFinite(index) || index < 0) {
    res.status(400).end();
    return;
  }
  await servePreviewBackground(setId, Math.floor(index), res);
});

app.get('/api/skins', (_req: Request, res: Response) => {
  res.json(listSkins());
});

app.get('/api/skins/:skinId/mania', (req: Request, res: Response) => {
  const skinId = String(req.params.skinId || '');
  const keys = parseOptNum(req.query.keys) ?? 4;
  res.json(resolveManiaSkin(skinId, keys));
});

app.get('/api/skins/:skinId/asset', (req: Request, res: Response) => {
  const skinId = String(req.params.skinId || '');
  const relFile = typeof req.query.file === 'string' ? req.query.file : '';
  serveSkinAsset(skinId, relFile, res);
});

app.post('/api/game/load', async (req: Request, res: Response) => {
  const setId = Number(req.body?.beatmapsetId);
  if (!Number.isFinite(setId) || setId <= 0) {
    res.status(400).json({ ok: false, client: null, message: '无效的 beatmapsetId' });
    return;
  }
  const client =
    req.body?.client === 'lazer' || req.body?.client === 'stable' ? req.body.client : 'auto';
  const cfg = getConfig();
  const result = await loadBeatmapIntoRunningGame(setId, client, cfg);
  logInfo('game', 'Load beatmap into running game requested', {
    setId,
    requestedClient: client,
    ok: result.ok,
    actualClient: result.client,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/game/launch', async (req: Request, res: Response) => {
  const client = req.body?.client;
  if (client !== 'stable' && client !== 'lazer') {
    res.status(400).json({ ok: false, client: null, message: '无效的客户端类型 (stable / lazer)' });
    return;
  }
  const result = await launchGameClient(client, getConfig());
  logInfo('game', 'Launch game client requested', {
    client,
    ok: result.ok,
    alreadyRunning: Boolean(result.alreadyRunning),
  });
  res.json(result);
});

// Local dual-client library & sync
app.get('/api/library/status', async (req: Request, res: Response) => {
  const refresh = req.query.refresh === 'true';
  const status = await getLibraryStatus(refresh);
  res.json(status);
});

app.post('/api/library/rescan', async (_req: Request, res: Response) => {
  invalidateBooksCache();
  const status = await rescanLibrary(true);
  res.json(status);
});

app.get('/api/library/diff', async (_req: Request, res: Response) => {
  await getLibraryStatus(false);
  res.json(getLibraryDiff());
});

// Local Books (Book Mode — unified Stable + Lazer local library, scores & media)
app.get('/api/books', (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === 'true';
    res.json(getBooksLibrary(refresh));
  } catch (err) {
    const msg = err instanceof Error ? err.message : '读取本地曲库失败';
    logError('books', 'Failed to read local books library', { error: msg });
    res.status(500).json({ error: msg });
  }
});

app.get('/api/books/:bookKey', (req: Request, res: Response) => {
  const bookKey = decodeURIComponent(String(req.params.bookKey || '')).trim();
  if (!bookKey) {
    res.status(400).json({ error: 'Invalid bookKey' });
    return;
  }
  const detail = getBookDetail(bookKey);
  if (!detail) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  res.json(detail);
});

app.get('/api/books/:bookKey/cover', async (req: Request, res: Response) => {
  const bookKey = decodeURIComponent(String(req.params.bookKey || '')).trim();
  if (!bookKey) {
    res.status(400).end();
    return;
  }
  await serveBookCover(bookKey, res);
});

app.get('/api/books/:bookKey/audio', async (req: Request, res: Response) => {
  const bookKey = decodeURIComponent(String(req.params.bookKey || '')).trim();
  if (!bookKey) {
    res.status(400).end();
    return;
  }
  await serveBookAudio(bookKey, req, res);
});

app.get('/api/books/:bookKey/rhythm', (req: Request, res: Response) => {
  const bookKey = decodeURIComponent(String(req.params.bookKey || '')).trim();
  if (!bookKey) {
    res.status(400).json({ error: 'Invalid bookKey' });
    return;
  }
  const rhythm = getBookRhythm(bookKey);
  if (!rhythm) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  res.json(rhythm);
});

app.post('/api/library/sync-to-lazer', async (req: Request, res: Response) => {
  const setIds = Array.isArray(req.body?.setIds)
    ? req.body.setIds.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0)
    : [];
  if (setIds.length === 0) {
    res.status(400).json({ error: '请选择至少一个谱面' });
    return;
  }
  const cfg = getConfig();
  const result = await syncStableToLazer(setIds, cfg);
  res.json(result);
});

app.post('/api/library/open-folder', (req: Request, res: Response) => {
  const cfg = getConfig();
  const which = String(req.body?.which || 'lazerImport');
  const songsRoot = path.resolve(cfg.stablePath, 'Songs');
  const map: Record<string, string> = {
    stableSongs: songsRoot,
    stableRoot: cfg.stablePath,
    lazerData: cfg.lazerDataPath,
    lazerImport: cfg.lazerImportDir,
  };
  let targetDir = map[which] || cfg.lazerImportDir;
  if (which === 'stableSongs' && typeof req.body?.subFolder === 'string' && req.body.subFolder.trim()) {
    const candidate = path.resolve(songsRoot, req.body.subFolder.trim());
    if (candidate.startsWith(songsRoot + path.sep) && fs.existsSync(candidate)) {
      targetDir = candidate;
    }
  }
  openFolderInExplorer(targetDir);
  res.json({ ok: true, path: targetDir });
});

// Lazer pending import queue
app.get('/api/lazer/pending', async (_req: Request, res: Response) => {
  const status = await getLibraryStatus(true);
  res.json({
    lazerRunning: status.lazerRunning,
    lazerExeExists: status.lazerExeExists,
    importDir: status.lazerImportDir,
    files: status.lazerPendingFiles,
  });
});

app.post('/api/lazer/import-pending', async (req: Request, res: Response) => {
  const cfg = getConfig();
  const filenames = Array.isArray(req.body?.filenames)
    ? req.body.filenames.map((x: unknown) => String(x))
    : undefined;
  const result = await launchLazerBatchImport(cfg, filenames);
  logInfo('lazer', 'Batch import triggered', {
    launched: result.launched,
    count: result.count,
  });
  res.json(result);
});

app.delete('/api/lazer/pending', async (req: Request, res: Response) => {
  const cfg = getConfig();
  const filenames = Array.isArray(req.body?.filenames)
    ? req.body.filenames.map((x: unknown) => String(x))
    : undefined;
  const result = await clearLazerPendingFiles(cfg, filenames);
  res.json(result);
});

// Downloads
app.get('/api/downloads', (_req: Request, res: Response) => {
  res.json(listDownloads());
});

app.post('/api/downloads', (req: Request, res: Response) => {
  const body = req.body || {};
  const setId = Number(body.beatmapsetId);
  if (!Number.isFinite(setId) || setId <= 0) {
    res.status(400).json({ error: '无效的 beatmapsetId' });
    return;
  }
  const task = enqueueDownload({
    beatmapsetId: setId,
    title: body.title,
    artist: body.artist,
    creator: body.creator,
    target: body.target,
    variant: body.variant,
    preferredMirror: body.preferredMirror,
  });
  res.json(task);
});

app.post('/api/downloads/batch', (req: Request, res: Response) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: '批量列表为空' });
    return;
  }
  const created = items
    .filter((item: any) => Number.isFinite(Number(item?.beatmapsetId)) && Number(item.beatmapsetId) > 0)
    .map((item: any) =>
      enqueueDownload({
        beatmapsetId: Number(item.beatmapsetId),
        title: item.title,
        artist: item.artist,
        creator: item.creator,
        target: item.target || req.body?.target,
        variant: item.variant || req.body?.variant,
        preferredMirror: item.preferredMirror || req.body?.preferredMirror,
      }),
    );
  res.json({ count: created.length, tasks: created });
});

app.post('/api/downloads/:id/cancel', (req: Request, res: Response) => {
  const task = cancelDownload(String(req.params.id));
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

app.post('/api/downloads/:id/retry', (req: Request, res: Response) => {
  const task = retryDownload(String(req.params.id));
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

app.delete('/api/downloads/completed', (_req: Request, res: Response) => {
  const removed = clearFinishedDownloads();
  res.json({ removed });
});

// Fast Batch Bulk Download
app.get('/api/fast-batch/status', (_req: Request, res: Response) => {
  res.json(getFastBatchSnapshot());
});

app.post('/api/fast-batch/start', async (req: Request, res: Response) => {
  try {
    const snapshot = await startFastBatch(req.body || {});
    res.json(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '启动快速批量下载失败';
    res.status(409).json({ error: msg });
  }
});

app.post('/api/fast-batch/pause', async (_req: Request, res: Response) => {
  res.json(await pauseFastBatch());
});

app.post('/api/fast-batch/resume', (_req: Request, res: Response) => {
  res.json(resumeFastBatch());
});

app.post('/api/fast-batch/stop', async (_req: Request, res: Response) => {
  res.json(await stopFastBatch());
});

app.post('/api/fast-batch/clear', (_req: Request, res: Response) => {
  try {
    res.json(clearFastBatch());
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : '无法清空任务' });
  }
});

// Filter Archives (saved search states + optional browse positions)
app.get('/api/filter-archives', (_req: Request, res: Response) => {
  res.json(listFilterArchives());
});

app.post('/api/filter-archives', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    name?: string;
    filters?: SearchFilters;
    browsePosition?: unknown;
    pinned?: boolean;
  };
  if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters)) {
    res.status(400).json({ error: '缺少有效的筛选条件 filters 对象' });
    return;
  }
  const created = createFilterArchive({
    name: body.name,
    filters: body.filters,
    browsePosition: body.browsePosition as any,
    pinned: body.pinned,
  });
  res.status(201).json(created);
});

app.put('/api/filter-archives/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Invalid archive ID' });
    return;
  }
  const body = (req.body || {}) as {
    name?: string;
    filters?: SearchFilters;
    browsePosition?: unknown;
    pinned?: boolean;
  };
  const updated = updateFilterArchive(id, {
    name: body.name,
    filters: body.filters,
    browsePosition: body.browsePosition as any,
    pinned: body.pinned,
  });
  if (!updated) {
    res.status(404).json({ error: 'Filter 存档不存在' });
    return;
  }
  res.json(updated);
});

app.delete('/api/filter-archives/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Invalid archive ID' });
    return;
  }
  const deleted = deleteFilterArchive(id);
  if (!deleted) {
    res.status(404).json({ error: 'Filter 存档不存在' });
    return;
  }
  res.json({ ok: true, id });
});

// Music Player Playlists (persistent user playlists in data/playlists.json)
app.get('/api/playlists', (_req: Request, res: Response) => {
  res.json(listPlaylists());
});

app.post('/api/playlists', (req: Request, res: Response) => {
  const body = (req.body || {}) as {
    name?: string;
    description?: string;
    coverBookKey?: string | null;
    bookKeys?: string[];
    pinned?: boolean;
  };
  const created = createPlaylist({
    name: body.name,
    description: body.description,
    coverBookKey: body.coverBookKey,
    bookKeys: body.bookKeys,
    pinned: body.pinned,
  });
  res.status(201).json(created);
});

app.put('/api/playlists/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Invalid playlist ID' });
    return;
  }
  const body = (req.body || {}) as {
    name?: string;
    description?: string;
    coverBookKey?: string | null;
    bookKeys?: string[];
    pinned?: boolean;
  };
  const updated = updatePlaylist(id, {
    name: body.name,
    description: body.description,
    coverBookKey: body.coverBookKey,
    bookKeys: body.bookKeys,
    pinned: body.pinned,
  });
  if (!updated) {
    res.status(404).json({ error: '歌单不存在' });
    return;
  }
  res.json(updated);
});

app.delete('/api/playlists/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Invalid playlist ID' });
    return;
  }
  const deleted = deletePlaylist(id);
  if (!deleted) {
    res.status(404).json({ error: '歌单不存在' });
    return;
  }
  res.json({ ok: true, id });
});

// SSE realtime events + lightweight running-game watcher
let sseClientCount = 0;
let lastKnownRunning: { stable: boolean; lazer: boolean } | null = null;
let processWatchTimer: ReturnType<typeof setInterval> | null = null;

function ensureProcessWatcher(): void {
  if (processWatchTimer || sseClientCount <= 0) return;
  processWatchTimer = setInterval(() => {
    void (async () => {
      if (sseClientCount <= 0) return;
      const cur = await detectRunningClients(true);
      if (
        !lastKnownRunning ||
        lastKnownRunning.stable !== cur.stableRunning ||
        lastKnownRunning.lazer !== cur.lazerRunning
      ) {
        lastKnownRunning = { stable: cur.stableRunning, lazer: cur.lazerRunning };
        libraryEvents.emit('update', await getLibraryStatus(false));
      }
    })();
  }, 6000);
}

function stopProcessWatcherIfIdle(): void {
  if (sseClientCount <= 0 && processWatchTimer) {
    clearInterval(processWatchTimer);
    processWatchTimer = null;
  }
}

app.get('/api/events', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClientCount += 1;
  ensureProcessWatcher();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const initialLib = await getLibraryStatus(false);
  lastKnownRunning = { stable: initialLib.stableRunning, lazer: initialLib.lazerRunning };

  sendEvent('downloads', listDownloads());
  sendEvent('network', await getNetworkStatus(false));
  sendEvent('library', initialLib);
  sendEvent('fast-batch', getFastBatchSnapshot());

  const onDownloads = (data: unknown) => sendEvent('downloads', data);
  const onNetwork = (data: unknown) => sendEvent('network', data);
  const onLibrary = (data: unknown) => sendEvent('library', data);
  const onFastBatch = (data: unknown) => sendEvent('fast-batch', data);

  downloadEvents.on('update', onDownloads);
  networkEvents.on('update', onNetwork);
  libraryEvents.on('update', onLibrary);
  fastBatchEvents.on('update', onFastBatch);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    downloadEvents.off('update', onDownloads);
    networkEvents.off('update', onNetwork);
    libraryEvents.off('update', onLibrary);
    fastBatchEvents.off('update', onFastBatch);
    sseClientCount = Math.max(0, sseClientCount - 1);
    stopProcessWatcherIfIdle();
  });
});

// Serve built frontend in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

function listenOnPort(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const srv = app.listen(port, '127.0.0.1', () => resolve(srv));
    srv.once('error', (err) => reject(err));
  });
}

export async function startServer(
  preferredPort = Number(process.env.PORT || 3721),
): Promise<{ server: http.Server; port: number; close: () => Promise<void> }> {
  loadConfig();

  let server: http.Server;
  try {
    server = await listenOnPort(preferredPort);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EADDRINUSE' && preferredPort !== 0) {
      server = await listenOnPort(0);
    } else {
      throw err;
    }
  }

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : preferredPort;
  logInfo('server', `Server listening on http://127.0.0.1:${port}`, { port, dataDir: DATA_DIR });
  void rescanLibrary(true);
  void benchmarkMirrors(true);

  const close = () =>
    new Promise<void>((resolve) => {
      logInfo('server', 'Server shutting down', { port });
      stopFastBatchOnShutdown();
      if (processWatchTimer) {
        clearInterval(processWatchTimer);
        processWatchTimer = null;
      }
      server.closeAllConnections?.();
      server.close(() => resolve());
    });

  return { server, port, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void startServer();
}
