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
import {
  clearLazerPendingFiles,
  launchLazerBatchImport,
  openFolderInExplorer,
  syncStableToLazer,
} from './installer.js';
import { getLibraryDiff, getLibraryStatus, libraryEvents, rescanLibrary } from './library.js';
import { getLogFilePath, logError, logInfo, readRecentLogs } from './logger.js';
import { serveCover, servePreview } from './media.js';
import { benchmarkMirrors, getNetworkStatus, networkEvents, resetProxyCache } from './network.js';
import { getBeatmapsetDetail, searchBeatmaps } from './search.js';
import { AppConfig, InstalledFilter, SearchFilters, SearchMode, SearchSource, SearchStatus } from './types.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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

app.put('/api/config', async (req: Request, res: Response) => {
  const body = (req.body || {}) as Partial<AppConfig>;
  const updated = saveConfig(body);
  logInfo('config', 'Updated config', { keys: Object.keys(body) });
  resetProxyCache();
  await rescanLibrary(false);
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

// Local dual-client library & sync
app.get('/api/library/status', async (req: Request, res: Response) => {
  const refresh = req.query.refresh === 'true';
  const status = await getLibraryStatus(refresh);
  res.json(status);
});

app.post('/api/library/rescan', async (_req: Request, res: Response) => {
  const status = await rescanLibrary(true);
  res.json(status);
});

app.get('/api/library/diff', async (_req: Request, res: Response) => {
  await getLibraryStatus(false);
  res.json(getLibraryDiff());
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
  const map: Record<string, string> = {
    stableSongs: path.join(cfg.stablePath, 'Songs'),
    stableRoot: cfg.stablePath,
    lazerData: cfg.lazerDataPath,
    lazerImport: cfg.lazerImportDir,
  };
  const targetDir = map[which] || cfg.lazerImportDir;
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

// SSE realtime events
app.get('/api/events', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('downloads', listDownloads());
  sendEvent('network', await getNetworkStatus(false));
  sendEvent('library', await getLibraryStatus(false));

  const onDownloads = (data: unknown) => sendEvent('downloads', data);
  const onNetwork = (data: unknown) => sendEvent('network', data);
  const onLibrary = (data: unknown) => sendEvent('library', data);

  downloadEvents.on('update', onDownloads);
  networkEvents.on('update', onNetwork);
  libraryEvents.on('update', onLibrary);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    downloadEvents.off('update', onDownloads);
    networkEvents.off('update', onNetwork);
    libraryEvents.off('update', onLibrary);
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
      server.closeAllConnections?.();
      server.close(() => resolve());
    });

  return { server, port, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void startServer();
}
