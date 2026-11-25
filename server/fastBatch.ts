import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, TMP_DIR } from './config.js';
import { getServerLang, st } from './i18n.js';
import {
  fastInstallToStable,
  fastStageToLazer,
  launchLazerBatchImport,
  verifyOszFileFast,
} from './installer.js';
import {
  detectRunningClients,
  getLibraryStatus,
  getLocalSetsSnapshot,
  libraryEvents,
  rescanLibrary,
} from './library.js';
import { logError, logInfo, logWarn } from './logger.js';
import {
  fetchWithRoute,
  getLastHostIpFamily,
  getRankedMirrors,
  resolveRoutes,
} from './network.js';
import { searchBeatmaps } from './search.js';
import { getLocalizedMirrorInfo } from './sources.js';
import {
  FastBatchItem,
  FastBatchJobState,
  FastBatchRouteStrategy,
  FastBatchSnapshot,
  FastBatchStartOptions,
  IpFamilyMode,
  MirrorDefinition,
  MirrorId,
  NormalizedBeatmapset,
  PreferredMirror,
} from './types.js';

export const fastBatchEvents = new EventEmitter();

interface FastBatchJob {
  jobId: string;
  state: FastBatchJobState;
  options: FastBatchStartOptions;
  items: FastBatchItem[];
  itemMap: Map<number, FastBatchItem>;
  candidateBuffer: FastBatchItem[];
  seenIds: Set<number>;
  queue: number[];
  inFlightIds: Set<number>;
  controllers: Map<number, AbortController>;
  pendingLazerFlush: Array<{ beatmapsetId: number; filename: string }>;
  lazerPendingCreated: string[];
  completedCount: number;
  failedCount: number;
  skippedInstalledCount: number;
  scannedPages: number;
  upstreamOffset: number;
  hasMore: boolean;
  consecutiveEmptyPages: number;
  totalBytesDownloaded: number;
  ipv6Hits: number;
  ipv4Hits: number;
  proxyHits: number;
  lazerBatchImportedCount: number;
  producing: boolean;
  pauseRequested: boolean;
  stopRequested: boolean;
  exhausted: boolean;
  flushingLazer: boolean;
  startedAt: string;
  finishedAt: string | null;
  message: string;
}

const VALID_IP_FAMILIES = new Set<IpFamilyMode>([
  'auto',
  'ipv6_first',
  'ipv4_first',
  'ipv6_only',
  'ipv4_only',
]);

const VALID_ROUTE_STRATEGIES = new Set<FastBatchRouteStrategy>([
  'auto',
  'direct_first',
  'direct_only',
  'proxy_only',
]);

const EMIT_INTERVAL_MS = 250;
const LAZER_BATCH_FLUSH_SIZE = 15;

let currentJob: FastBatchJob | null = null;
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let lastEmitAt = 0;

const mirrorInFlight = new Map<MirrorId, number>();
const mirrorCooldownUntil = new Map<MirrorId, number>();
const mirrorSpeedEwma = new Map<MirrorId, number>();

function clampTargetCount(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 20;
  return Math.min(500, Math.max(1, Math.floor(n)));
}

function clampConcurrency(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 6;
  return Math.min(12, Math.max(1, Math.floor(n)));
}

function normalizeOptions(raw: Partial<FastBatchStartOptions>): FastBatchStartOptions {
  const cfg = getConfig();
  const ipFamily: IpFamilyMode =
    raw.ipFamily && VALID_IP_FAMILIES.has(raw.ipFamily)
      ? raw.ipFamily
      : cfg.ipFamily || 'auto';
  const routeStrategy: FastBatchRouteStrategy =
    raw.routeStrategy && VALID_ROUTE_STRATEGIES.has(raw.routeStrategy)
      ? raw.routeStrategy
      : 'auto';

  return {
    filters: raw.filters ? { ...raw.filters } : { mode: '3', keys: '4', status: 'leaderboard' },
    targetCount: clampTargetCount(raw.targetCount),
    target:
      raw.target === 'lazer' || raw.target === 'stable' || raw.target === 'both'
        ? raw.target
        : cfg.defaultTarget,
    variant:
      raw.variant === 'novideo' || raw.variant === 'full' || raw.variant === 'mini'
        ? raw.variant
        : cfg.defaultVariant,
    preferredMirror: (raw.preferredMirror || cfg.preferredDownloadSource || 'auto') as PreferredMirror,
    concurrency: clampConcurrency(raw.concurrency),
    ipFamily,
    routeStrategy,
    skipInstalled: raw.skipInstalled !== false,
    stableDropOsz: raw.stableDropOsz !== false,
    lazerBatchImport: raw.lazerBatchImport !== false,
  };
}

function emptySnapshot(): FastBatchSnapshot {
  return {
    jobId: null,
    state: 'idle',
    options: null,
    targetCount: 0,
    completedCount: 0,
    failedCount: 0,
    skippedInstalledCount: 0,
    inFlightCount: 0,
    queuedCount: 0,
    scannedPages: 0,
    upstreamOffset: 0,
    hasMore: false,
    totalBytesDownloaded: 0,
    aggregateSpeedBps: 0,
    ipv6Hits: 0,
    ipv4Hits: 0,
    proxyHits: 0,
    lazerBatchImportedCount: 0,
    lazerPendingCreated: [],
    startedAt: null,
    finishedAt: null,
    message: st('尚未启动快速批量下载任务', 'No fast batch download task started yet'),
    items: [],
  };
}

export function getFastBatchSnapshot(): FastBatchSnapshot {
  const job = currentJob;
  if (!job) return emptySnapshot();

  let aggregateSpeedBps = 0;
  for (const id of job.inFlightIds) {
    const it = job.itemMap.get(id);
    if (it && it.state === 'downloading') {
      aggregateSpeedBps += it.speedBps;
    }
  }

  return {
    jobId: job.jobId,
    state: job.state,
    options: job.options,
    targetCount: job.options.targetCount,
    completedCount: job.completedCount,
    failedCount: job.failedCount,
    skippedInstalledCount: job.skippedInstalledCount,
    inFlightCount: job.inFlightIds.size,
    queuedCount: job.queue.length,
    scannedPages: job.scannedPages,
    upstreamOffset: job.upstreamOffset,
    hasMore: job.hasMore,
    totalBytesDownloaded: job.totalBytesDownloaded,
    aggregateSpeedBps,
    ipv6Hits: job.ipv6Hits,
    ipv4Hits: job.ipv4Hits,
    proxyHits: job.proxyHits,
    lazerBatchImportedCount: job.lazerBatchImportedCount,
    lazerPendingCreated: [...job.lazerPendingCreated],
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    message: job.message,
    items: job.items.map((item) => ({ ...item })),
  };
}

function emitNow(): void {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  lastEmitAt = Date.now();
  fastBatchEvents.emit('update', getFastBatchSnapshot());
}

function scheduleEmit(immediate = false): void {
  if (immediate) {
    emitNow();
    return;
  }
  const elapsed = Date.now() - lastEmitAt;
  if (elapsed >= EMIT_INTERVAL_MS && !emitTimer) {
    emitNow();
    return;
  }
  if (!emitTimer) {
    emitTimer = setTimeout(() => {
      emitNow();
    }, Math.max(40, EMIT_INTERVAL_MS - elapsed));
  }
}

function isAlreadyInstalledForTarget(
  setId: number,
  target: FastBatchStartOptions['target'],
  snapshot: ReturnType<typeof getLocalSetsSnapshot>,
): boolean {
  const inStable = snapshot.stableMap.has(setId);
  const inLazer = snapshot.lazerIds.has(setId) || snapshot.pendingIds.has(setId);
  if (target === 'lazer') return inLazer;
  if (target === 'stable') return inStable;
  return inStable && inLazer;
}

function toFastBatchItem(set: NormalizedBeatmapset): FastBatchItem {
  const matching = set.beatmaps.filter((b) => b.matchesFilter !== false);
  const pool = matching.length > 0 ? matching : set.beatmaps;
  const sorted = [...pool].sort((a, b) => a.difficultyRating - b.difficultyRating);
  const diffs = sorted.slice(0, 4).map((bm) => {
    const keyTag = bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
    return `${keyTag} ${bm.difficultyRating.toFixed(2)}★`;
  });

  return {
    beatmapsetId: set.id,
    title: set.title || `Beatmapset #${set.id}`,
    artist: set.artist || 'Unknown Artist',
    creator: set.creator || '',
    status: set.status,
    bpm: Math.round(set.bpm || 0),
    diffs,
    state: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    speedBps: 0,
    mirror: null,
    routeUsed: null,
    ipVersion: null,
    error: null,
  };
}

function pickFastBatchMirrors(preferred: PreferredMirror): MirrorDefinition[] {
  const baseRanked = getRankedMirrors(preferred);
  const now = Date.now();

  if (preferred !== 'auto') {
    const first = baseRanked[0];
    const firstCool = first ? (mirrorCooldownUntil.get(first.id) ?? 0) > now : false;
    if (!firstCool) return baseRanked;
  }

  return [...baseRanked].sort((a, b) => {
    const idxA = baseRanked.indexOf(a);
    const idxB = baseRanked.indexOf(b);
    const coolA = (mirrorCooldownUntil.get(a.id) ?? 0) > now ? 100_000 : 0;
    const coolB = (mirrorCooldownUntil.get(b.id) ?? 0) > now ? 100_000 : 0;
    const inflightA = mirrorInFlight.get(a.id) ?? 0;
    const inflightB = mirrorInFlight.get(b.id) ?? 0;
    const speedBonusA = Math.min(400, (mirrorSpeedEwma.get(a.id) ?? 0) / 25_000);
    const speedBonusB = Math.min(400, (mirrorSpeedEwma.get(b.id) ?? 0) / 25_000);

    const scoreA = coolA + idxA * 180 + inflightA * 450 - speedBonusA;
    const scoreB = coolB + idxB * 180 + inflightB * 450 - speedBonusB;
    return scoreA - scoreB;
  });
}

function noteMirrorSuccess(mirrorId: MirrorId, bytes: number, elapsedMs: number): void {
  const bps = bytes / Math.max(0.15, elapsedMs / 1000);
  const prev = mirrorSpeedEwma.get(mirrorId);
  mirrorSpeedEwma.set(mirrorId, prev != null ? prev * 0.65 + bps * 0.35 : bps);
  mirrorCooldownUntil.delete(mirrorId);
}

function noteMirrorFailure(mirrorId: MirrorId, statusCode?: number): void {
  const penaltyMs = statusCode === 429 ? 45_000 : 15_000;
  mirrorCooldownUntil.set(mirrorId, Date.now() + penaltyMs);
}

async function flushLazerBatch(job: FastBatchJob): Promise<void> {
  if (job.flushingLazer || job.pendingLazerFlush.length === 0) return;
  if (!job.options.lazerBatchImport) return;
  job.flushingLazer = true;

  try {
    const cfg = getConfig();
    const { lazerRunning } = await detectRunningClients(false);
    if (!lazerRunning || !cfg.autoImportWhenLazerRunning) return;

    const batch = job.pendingLazerFlush.splice(0, job.pendingLazerFlush.length);
    const filenames = batch.map((b) => b.filename);
    const res = await launchLazerBatchImport(cfg, filenames);
    if (res.launched) {
      job.lazerBatchImportedCount += res.count;
      for (const b of batch) {
        const it = job.itemMap.get(b.beatmapsetId);
        if (it && it.state === 'queued_lazer') {
          it.state = 'completed';
        }
      }
      scheduleEmit(true);
    } else {
      job.pendingLazerFlush.unshift(...batch);
    }
  } catch (err) {
    logWarn('fast-batch', 'Batched Lazer import flush failed', {
      jobId: job.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    job.flushingLazer = false;
  }
}

function drainCandidateBufferIntoQueue(job: FastBatchJob): void {
  while (
    job.candidateBuffer.length > 0 &&
    job.completedCount + job.inFlightIds.size + job.queue.length < job.options.targetCount
  ) {
    const next = job.candidateBuffer.shift()!;
    job.items.push(next);
    job.itemMap.set(next.beatmapsetId, next);
    job.queue.push(next.beatmapsetId);
  }
}

async function maybeFinalizeJob(job: FastBatchJob): Promise<void> {
  if (currentJob !== job) return;
  if (job.state !== 'running' && !job.stopRequested) return;
  if (job.inFlightIds.size > 0 || job.producing) return;

  if (job.stopRequested) {
    for (const qId of job.queue) {
      const it = job.itemMap.get(qId);
      if (it && it.state === 'queued') {
        it.state = 'cancelled';
        it.error = st('已停止', 'Stopped');
      }
    }
    job.queue.length = 0;
    job.candidateBuffer.length = 0;
    await flushLazerBatch(job);
    job.state = 'stopped';
    job.finishedAt = new Date().toISOString();
    job.message = st(
      `已停止：完成 ${job.completedCount}/${job.options.targetCount} 首（跳过已装 ${job.skippedInstalledCount} 首）`,
      `Stopped: completed ${job.completedCount}/${job.options.targetCount} maps (skipped ${job.skippedInstalledCount} installed)`,
    );
    scheduleEmit(true);
    try {
      libraryEvents.emit('update', await rescanLibrary(false));
    } catch {
      // Ignore rescan failure
    }
    return;
  }

  const reachedTarget = job.completedCount >= job.options.targetCount;
  const noMoreCandidates =
    job.queue.length === 0 &&
    job.candidateBuffer.length === 0 &&
    (job.exhausted || !job.hasMore || job.consecutiveEmptyPages >= 12 || job.upstreamOffset >= 10_000);

  if (!reachedTarget && !noMoreCandidates) return;

  job.queue.length = 0;
  await flushLazerBatch(job);
  job.state = reachedTarget ? 'completed' : job.completedCount > 0 ? 'completed' : 'error';
  job.finishedAt = new Date().toISOString();

  if (reachedTarget) {
    job.message = st(
      `已完成目标 ${job.completedCount}/${job.options.targetCount} 首（跳过已装 ${job.skippedInstalledCount}，失败 ${job.failedCount}）`,
      `Reached target ${job.completedCount}/${job.options.targetCount} maps (skipped ${job.skippedInstalledCount} installed, ${job.failedCount} failed)`,
    );
  } else if (job.completedCount > 0) {
    job.message = st(
      `已无更多匹配新谱面，共下载 ${job.completedCount} 首（跳过已装 ${job.skippedInstalledCount}）`,
      `No more matching new beatmaps; downloaded ${job.completedCount} (skipped ${job.skippedInstalledCount} installed)`,
    );
  } else {
    job.message = st(
      `当前筛选条件下没有可下载的新谱面（已跳过本地已装 ${job.skippedInstalledCount} 首）`,
      `No downloadable new beatmaps match the current filters (skipped ${job.skippedInstalledCount} installed)`,
    );
  }

  logInfo('fast-batch', `Job finished (${job.state})`, {
    jobId: job.jobId,
    completed: job.completedCount,
    failed: job.failedCount,
    skipped: job.skippedInstalledCount,
    ipv6Hits: job.ipv6Hits,
    ipv4Hits: job.ipv4Hits,
    proxyHits: job.proxyHits,
  });

  scheduleEmit(true);
  try {
    libraryEvents.emit('update', await rescanLibrary(false));
  } catch {
    // Ignore rescan failure
  }
}

async function downloadItemFromMirror(
  job: FastBatchJob,
  item: FastBatchItem,
  mirror: MirrorDefinition,
  partPath: string,
  controller: AbortController,
): Promise<void> {
  const cfg = getConfig();
  const url = mirror.buildDownloadUrl(item.beatmapsetId, job.options.variant);
  const routes = await resolveRoutes(mirror.routePolicy, job.options.routeStrategy);
  let lastErr: unknown = null;

  for (const route of routes) {
    if (controller.signal.aborted) {
      throw new Error(st('已暂停或取消', 'Paused or cancelled'));
    }
    const startedAt = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (mirror.id === 'official' && cfg.officialCookie.trim()) {
        const c = cfg.officialCookie.trim();
        headers.Cookie = c.includes('=') ? c : `osu_session=${c}`;
      }

      const response = await fetchWithRoute(url, route, {
        method: 'GET',
        redirect: 'follow',
        timeoutMs: 90_000,
        ipFamily: job.options.ipFamily,
        signal: controller.signal,
        headers,
      });

      if (!response.ok || !response.body) {
        const status = response.status;
        await response.body?.cancel().catch(() => {});
        noteMirrorFailure(mirror.id, status);
        throw new Error(`HTTP ${status}`);
      }

      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/json')) {
        await response.body.cancel().catch(() => {});
        noteMirrorFailure(mirror.id);
        throw new Error(st(`镜像返回非谱面内容 (${ct})`, `Mirror returned non-beatmap content (${ct})`));
      }

      const totalHeader = response.headers.get('content-length');
      const totalBytes = totalHeader ? Number(totalHeader) : null;
      const ipVersion =
        route === 'direct'
          ? getLastHostIpFamily(response.url || url) ?? getLastHostIpFamily(url)
          : null;

      item.mirror = mirror.id;
      item.routeUsed = route;
      item.ipVersion = ipVersion;
      item.totalBytes = totalBytes && totalBytes > 0 ? totalBytes : null;
      item.downloadedBytes = 0;
      item.progress = 0;
      scheduleEmit(false);

      const writeStream = fs.createWriteStream(partPath, { highWaterMark: 262_144 });
      const reader = response.body.getReader();
      let downloaded = 0;
      let checkedMagic = false;
      let lastTickAt = Date.now();
      let bytesSinceTick = 0;

      const onAbort = () => writeStream.destroy();
      controller.signal.addEventListener('abort', onAbort, { once: true });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          if (!checkedMagic && value.length >= 4) {
            checkedMagic = true;
            if (
              value[0] !== 0x50 ||
              value[1] !== 0x4b ||
              value[2] !== 0x03 ||
              value[3] !== 0x04
            ) {
              noteMirrorFailure(mirror.id);
              throw new Error(st('首字节非 ZIP/.osz 格式', 'Stream header is not a valid ZIP/.osz archive'));
            }
          }

          if (!writeStream.destroyed && !writeStream.write(value)) {
            await new Promise<void>((resolve) => {
              const finishDrain = () => {
                writeStream.off('drain', finishDrain);
                writeStream.off('close', finishDrain);
                writeStream.off('error', finishDrain);
                resolve();
              };
              writeStream.once('drain', finishDrain);
              writeStream.once('close', finishDrain);
              writeStream.once('error', finishDrain);
            });
          }

          downloaded += value.length;
          bytesSinceTick += value.length;

          const now = Date.now();
          if (now - lastTickAt >= 200) {
            const sec = (now - lastTickAt) / 1000;
            item.downloadedBytes = downloaded;
            item.speedBps = Math.round(bytesSinceTick / Math.max(0.05, sec));
            item.progress = totalBytes ? Math.min(99, Math.round((downloaded / totalBytes) * 100)) : 55;
            lastTickAt = now;
            bytesSinceTick = 0;
            scheduleEmit(false);
          }
        }
      } finally {
        controller.signal.removeEventListener('abort', onAbort);
        await reader.cancel().catch(() => {});
        if (!writeStream.destroyed) {
          await new Promise<void>((resolve) => writeStream.end(() => resolve()));
        }
      }

      if (controller.signal.aborted) {
        throw new Error(st('已暂停或取消', 'Paused or cancelled'));
      }

      item.downloadedBytes = downloaded;
      item.totalBytes = totalBytes || downloaded;
      item.progress = 100;
      item.speedBps = 0;
      noteMirrorSuccess(mirror.id, downloaded, Date.now() - startedAt);
      return;
    } catch (err) {
      lastErr = err;
      await fs.promises.unlink(partPath).catch(() => {});
      if (controller.signal.aborted) throw err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr || st('下载失败', 'Download failed')));
}

async function processFastBatchItem(job: FastBatchJob, beatmapsetId: number): Promise<void> {
  const item = job.itemMap.get(beatmapsetId);
  if (!item) return;

  const cfg = getConfig();
  const controller = new AbortController();
  job.controllers.set(beatmapsetId, controller);
  const partPath = path.join(TMP_DIR, `fast-${job.jobId}-${beatmapsetId}.osz.part`);
  await fs.promises.mkdir(TMP_DIR, { recursive: true });

  try {
    item.state = 'downloading';
    item.error = null;
    item.progress = 0;
    scheduleEmit(false);

    const mirrors = pickFastBatchMirrors(job.options.preferredMirror);
    let downloadedOk = false;
    let lastError = st('所有镜像均下载失败', 'All mirrors failed to download');

    for (const mirror of mirrors) {
      if (controller.signal.aborted || job.pauseRequested || job.stopRequested) {
        throw new Error(st('已暂停或停止', 'Paused or stopped'));
      }
      mirrorInFlight.set(mirror.id, (mirrorInFlight.get(mirror.id) ?? 0) + 1);
      const mirrorName = getLocalizedMirrorInfo(mirror, getServerLang()).shortName;
      try {
        await downloadItemFromMirror(job, item, mirror, partPath, controller);
        item.state = 'verifying';
        scheduleEmit(false);

        const check = await verifyOszFileFast(partPath);
        if (!check.valid) {
          noteMirrorFailure(mirror.id);
          throw new Error(check.reason || st('.osz 校验失败', '.osz verification failed'));
        }
        downloadedOk = true;
        break;
      } catch (err) {
        lastError = `${mirrorName}: ${err instanceof Error ? err.message : String(err)}`;
        await fs.promises.unlink(partPath).catch(() => {});
        if (controller.signal.aborted || job.pauseRequested || job.stopRequested) {
          throw new Error(st('已暂停或停止', 'Paused or stopped'));
        }
      } finally {
        mirrorInFlight.set(mirror.id, Math.max(0, (mirrorInFlight.get(mirror.id) ?? 1) - 1));
      }
    }

    if (!downloadedOk) {
      throw new Error(lastError);
    }

    item.state = 'installing';
    scheduleEmit(false);

    const meta = {
      beatmapsetId: item.beatmapsetId,
      artist: item.artist,
      title: item.title,
    };

    let lazerFilename: string | null = null;
    if (job.options.target === 'stable') {
      await fastInstallToStable(partPath, meta, cfg, {
        dropOsz: job.options.stableDropOsz,
        moveSource: true,
      });
    } else if (job.options.target === 'lazer') {
      const staged = await fastStageToLazer(partPath, meta, cfg, { moveSource: true });
      lazerFilename = staged.filename;
    } else {
      await fastInstallToStable(partPath, meta, cfg, {
        dropOsz: job.options.stableDropOsz,
        moveSource: false,
      });
      const staged = await fastStageToLazer(partPath, meta, cfg, { moveSource: true });
      lazerFilename = staged.filename;
    }

    job.completedCount += 1;
    job.totalBytesDownloaded += item.downloadedBytes;
    if (item.routeUsed === 'proxy') {
      job.proxyHits += 1;
    } else if (item.ipVersion === 6) {
      job.ipv6Hits += 1;
    } else if (item.ipVersion === 4) {
      job.ipv4Hits += 1;
    }

    if (lazerFilename) {
      job.lazerPendingCreated.push(lazerFilename);
      if (job.options.lazerBatchImport) {
        job.pendingLazerFlush.push({ beatmapsetId: item.beatmapsetId, filename: lazerFilename });
      }
    }

    item.state = job.options.target === 'lazer' ? 'queued_lazer' : 'completed';
    item.progress = 100;
    item.speedBps = 0;

    if (job.pendingLazerFlush.length >= LAZER_BATCH_FLUSH_SIZE) {
      void flushLazerBatch(job);
    }

    if (job.completedCount % 15 === 0) {
      void rescanLibrary(false).then((st) => libraryEvents.emit('update', st)).catch(() => {});
    }
    scheduleEmit(false);
  } catch (err) {
    await fs.promises.unlink(partPath).catch(() => {});
    if (job.pauseRequested) {
      item.state = 'queued';
      item.progress = 0;
      item.downloadedBytes = 0;
      item.speedBps = 0;
      item.error = null;
      if (!job.queue.includes(beatmapsetId)) {
        job.queue.unshift(beatmapsetId);
      }
    } else if (job.stopRequested || controller.signal.aborted) {
      item.state = 'cancelled';
      item.speedBps = 0;
      item.error = st('已停止', 'Stopped');
    } else {
      item.state = 'failed';
      item.speedBps = 0;
      item.error = err instanceof Error ? err.message : String(err);
      job.failedCount += 1;
      logWarn('fast-batch', 'Item failed in fast batch', {
        jobId: job.jobId,
        setId: beatmapsetId,
        error: item.error,
      });
    }
    scheduleEmit(false);
  } finally {
    job.controllers.delete(beatmapsetId);
    job.inFlightIds.delete(beatmapsetId);
    if (job.state === 'running' && !job.pauseRequested && !job.stopRequested) {
      drainCandidateBufferIntoQueue(job);
      pumpWorkers(job);
      void produceMoreCandidates(job);
    }
    void maybeFinalizeJob(job);
  }
}

function pumpWorkers(job: FastBatchJob): void {
  if (currentJob !== job || job.state !== 'running' || job.pauseRequested || job.stopRequested) {
    return;
  }

  while (
    job.inFlightIds.size < job.options.concurrency &&
    job.queue.length > 0 &&
    job.completedCount + job.inFlightIds.size < job.options.targetCount
  ) {
    const nextId = job.queue.shift()!;
    job.inFlightIds.add(nextId);
    void processFastBatchItem(job, nextId);
  }
}

async function produceMoreCandidates(job: FastBatchJob): Promise<void> {
  if (
    currentJob !== job ||
    job.producing ||
    job.state !== 'running' ||
    job.pauseRequested ||
    job.stopRequested
  ) {
    return;
  }

  job.producing = true;
  try {
    drainCandidateBufferIntoQueue(job);
    pumpWorkers(job);

    while (
      currentJob === job &&
      job.state === 'running' &&
      !job.pauseRequested &&
      !job.stopRequested &&
      job.queue.length < job.options.concurrency * 2 &&
      job.completedCount + job.inFlightIds.size + job.queue.length < job.options.targetCount &&
      job.hasMore &&
      !job.exhausted &&
      job.consecutiveEmptyPages < 12 &&
      job.upstreamOffset < 10_000
    ) {
      job.message = st(
        `正在扫描匹配谱面（第 ${job.scannedPages + 1} 页，已下载 ${job.completedCount}/${job.options.targetCount}）...`,
        `Scanning matching beatmaps (page ${job.scannedPages + 1}, downloaded ${job.completedCount}/${job.options.targetCount})...`,
      );
      scheduleEmit(false);

      const res = await searchBeatmaps({
        ...job.options.filters,
        offset: job.upstreamOffset,
        limit: 48,
      });

      if (currentJob !== job || job.state !== 'running' || job.pauseRequested || job.stopRequested) {
        break;
      }

      job.scannedPages += 1;
      job.upstreamOffset = res.nextUpstreamOffset;
      job.hasMore = res.hasMore;
      if (!res.hasMore) {
        job.exhausted = true;
      }

      const snapshot = getLocalSetsSnapshot();
      let matchedNewCount = 0;

      for (const set of res.beatmapsets) {
        if (job.seenIds.has(set.id)) continue;
        job.seenIds.add(set.id);

        if (
          job.options.skipInstalled &&
          isAlreadyInstalledForTarget(set.id, job.options.target, snapshot)
        ) {
          job.skippedInstalledCount += 1;
          continue;
        }

        matchedNewCount += 1;
        job.candidateBuffer.push(toFastBatchItem(set));
      }

      if (res.beatmapsets.length === 0) {
        job.exhausted = true;
      }
      if (matchedNewCount === 0) {
        job.consecutiveEmptyPages += 1;
      } else {
        job.consecutiveEmptyPages = 0;
      }

      drainCandidateBufferIntoQueue(job);
      pumpWorkers(job);
      job.message = st(
        `正在高速下载（${job.inFlightIds.size} 并发进行中 · ${job.completedCount}/${job.options.targetCount}）...`,
        `Downloading at high speed (${job.inFlightIds.size} active · ${job.completedCount}/${job.options.targetCount})...`,
      );
      scheduleEmit(false);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logError('fast-batch', 'Search pagination error in fast batch', {
      jobId: job.jobId,
      error: errMsg,
    });
    job.exhausted = true;
    job.hasMore = false;
    job.message = st(`搜索拉取中断：${errMsg}`, `Search pagination interrupted: ${errMsg}`);
    scheduleEmit(true);
  } finally {
    job.producing = false;
    await maybeFinalizeJob(job);
  }
}

export async function startFastBatch(
  rawOptions: Partial<FastBatchStartOptions>,
): Promise<FastBatchSnapshot> {
  if (currentJob && (currentJob.state === 'running' || currentJob.state === 'paused')) {
    throw new Error(
      st(
        '当前已有正在进行或已暂停的快速批量下载任务，请先停止或继续该任务',
        'A fast batch download task is already running or paused. Stop or resume it first.',
      ),
    );
  }

  await getLibraryStatus(false);
  const options = normalizeOptions(rawOptions);
  const job: FastBatchJob = {
    jobId: crypto.randomUUID().slice(0, 8),
    state: 'running',
    options,
    items: [],
    itemMap: new Map(),
    candidateBuffer: [],
    seenIds: new Set(),
    queue: [],
    inFlightIds: new Set(),
    controllers: new Map(),
    pendingLazerFlush: [],
    lazerPendingCreated: [],
    completedCount: 0,
    failedCount: 0,
    skippedInstalledCount: 0,
    scannedPages: 0,
    upstreamOffset: 0,
    hasMore: true,
    consecutiveEmptyPages: 0,
    totalBytesDownloaded: 0,
    ipv6Hits: 0,
    ipv4Hits: 0,
    proxyHits: 0,
    lazerBatchImportedCount: 0,
    producing: false,
    pauseRequested: false,
    stopRequested: false,
    exhausted: false,
    flushingLazer: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: st(
      `正在搜索首批匹配谱面（目标 ${options.targetCount} 首 · ${options.concurrency} 并发）...`,
      `Searching initial matching beatmaps (target ${options.targetCount} · ${options.concurrency} concurrent)...`,
    ),
  };

  currentJob = job;
  logInfo('fast-batch', 'Fast batch job started', {
    jobId: job.jobId,
    targetCount: options.targetCount,
    target: options.target,
    concurrency: options.concurrency,
    ipFamily: options.ipFamily,
    routeStrategy: options.routeStrategy,
  });

  scheduleEmit(true);
  void produceMoreCandidates(job);
  return getFastBatchSnapshot();
}

export async function pauseFastBatch(): Promise<FastBatchSnapshot> {
  const job = currentJob;
  if (!job || job.state !== 'running') {
    return getFastBatchSnapshot();
  }
  job.pauseRequested = true;
  job.state = 'paused';
  job.message = st(
    `已暂停（已完成 ${job.completedCount}/${job.options.targetCount} 首）`,
    `Paused (${job.completedCount}/${job.options.targetCount} completed)`,
  );
  for (const ctrl of job.controllers.values()) {
    ctrl.abort();
  }
  await flushLazerBatch(job);
  scheduleEmit(true);
  return getFastBatchSnapshot();
}

export function resumeFastBatch(): FastBatchSnapshot {
  const job = currentJob;
  if (!job || job.state !== 'paused') {
    return getFastBatchSnapshot();
  }
  job.pauseRequested = false;
  job.state = 'running';
  job.message = st(
    `正在继续高速下载（${job.completedCount}/${job.options.targetCount}）...`,
    `Resuming high-speed download (${job.completedCount}/${job.options.targetCount})...`,
  );
  scheduleEmit(true);
  drainCandidateBufferIntoQueue(job);
  pumpWorkers(job);
  void produceMoreCandidates(job);
  return getFastBatchSnapshot();
}

export async function stopFastBatch(): Promise<FastBatchSnapshot> {
  const job = currentJob;
  if (!job || (job.state !== 'running' && job.state !== 'paused')) {
    return getFastBatchSnapshot();
  }
  job.stopRequested = true;
  job.pauseRequested = false;
  job.message = st('正在停止并清理未完成传输...', 'Stopping and cleaning up unfinished transfers...');
  for (const ctrl of job.controllers.values()) {
    ctrl.abort();
  }
  if (job.inFlightIds.size === 0 && !job.producing) {
    await maybeFinalizeJob(job);
  } else {
    scheduleEmit(true);
  }
  return getFastBatchSnapshot();
}

export function clearFastBatch(): FastBatchSnapshot {
  if (currentJob && (currentJob.state === 'running' || currentJob.state === 'paused')) {
    throw new Error(
      st('请先停止正在进行的任务后再清空记录', 'Please stop the active task before clearing records'),
    );
  }
  currentJob = null;
  scheduleEmit(true);
  return getFastBatchSnapshot();
}

export function stopFastBatchOnShutdown(): void {
  const job = currentJob;
  if (!job) return;
  job.stopRequested = true;
  for (const ctrl of job.controllers.values()) {
    ctrl.abort();
  }
}
