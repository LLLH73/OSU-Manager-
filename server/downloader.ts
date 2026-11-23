import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, PREVIEW_OSZ_CACHE_DIR, TMP_DIR } from './config.js';
import { installToLazer, installToStable, verifyOszFile } from './installer.js';
import { getLibraryStatus, libraryEvents } from './library.js';
import { logError, logInfo, logWarn } from './logger.js';
import { fetchWithRoute, getRankedMirrors, resolveRoutes } from './network.js';
import {
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  MirrorDefinition,
  PreferredMirror,
} from './types.js';

export const downloadEvents = new EventEmitter();

const tasks = new Map<string, DownloadTask>();
const taskOrder: string[] = [];
const abortControllers = new Map<string, AbortController>();
let activeWorkers = 0;

export interface EnqueueDownloadInput {
  beatmapsetId: number;
  title?: string;
  artist?: string;
  creator?: string;
  target?: DownloadTarget;
  variant?: DownloadVariant;
  preferredMirror?: PreferredMirror;
}

export function listDownloads(): DownloadTask[] {
  return taskOrder.map((id) => tasks.get(id)!).filter(Boolean).reverse();
}

function emitTasks(): void {
  downloadEvents.emit('update', listDownloads());
}

function updateTask(id: string, patch: Partial<DownloadTask>): DownloadTask | null {
  const t = tasks.get(id);
  if (!t) return null;
  Object.assign(t, patch, { updatedAt: new Date().toISOString() });
  emitTasks();
  return t;
}

function prunePreviewOszCache(): void {
  try {
    if (!fs.existsSync(PREVIEW_OSZ_CACHE_DIR)) return;
    const entries = fs
      .readdirSync(PREVIEW_OSZ_CACHE_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.osz'))
      .map((e) => {
        const fullPath = path.join(PREVIEW_OSZ_CACHE_DIR, e.name);
        const st = fs.statSync(fullPath);
        return { fullPath, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);

    let totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
    let count = entries.length;
    const maxCount = 40;
    const maxBytes = 500 * 1024 * 1024;

    for (const item of entries) {
      if (count <= maxCount && totalBytes <= maxBytes) break;
      try {
        fs.unlinkSync(item.fullPath);
        count -= 1;
        totalBytes -= item.size;
      } catch {
        // Ignore locked cache file
      }
    }
  } catch {
    // Ignore preview cache cleanup failure
  }
}

function cacheOszForPreview(partPath: string, beatmapsetId: number): void {
  try {
    const st = fs.statSync(partPath);
    if (st.size > 120 * 1024 * 1024) return;
    fs.mkdirSync(PREVIEW_OSZ_CACHE_DIR, { recursive: true });
    const target = path.join(PREVIEW_OSZ_CACHE_DIR, `${beatmapsetId}.osz`);
    const tmp = `${target}.part`;
    fs.copyFileSync(partPath, tmp);
    fs.renameSync(tmp, target);
    setTimeout(prunePreviewOszCache, 50);
  } catch {
    // Non-fatal: preview cache is best-effort
  }
}

async function downloadFromMirror(
  task: DownloadTask,
  mirror: MirrorDefinition,
  partPath: string,
  controller: AbortController,
): Promise<{ routeUsed: 'direct' | 'proxy' }> {
  const cfg = getConfig();
  const url = mirror.buildDownloadUrl(task.beatmapsetId, task.variant);
  const routes = await resolveRoutes(mirror.routePolicy);

  let lastErr: unknown = null;
  for (const route of routes) {
    if (controller.signal.aborted) {
      throw new Error('已取消');
    }
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
        signal: controller.signal,
        headers,
      });

      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`HTTP ${response.status}`);
      }

      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/json')) {
        await response.body.cancel().catch(() => {});
        throw new Error(`镜像返回非谱面类型 (${ct})`);
      }

      const totalHeader = response.headers.get('content-length');
      const totalBytes = totalHeader ? Number(totalHeader) : null;

      updateTask(task.id, {
        activeMirror: mirror.id,
        routeUsed: route,
        totalBytes: totalBytes && totalBytes > 0 ? totalBytes : null,
        downloadedBytes: 0,
        progress: 0,
        message: `正在通过 ${mirror.shortName} (${route === 'proxy' ? '代理' : '直连'}) 下载...`,
      });

      const writeStream = fs.createWriteStream(partPath);
      const reader = response.body.getReader();
      let downloaded = 0;
      let checkedMagic = false;
      let lastSpeedTick = Date.now();
      let bytesSinceTick = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;

          if (!checkedMagic) {
            if (value.length >= 4) {
              checkedMagic = true;
              if (value[0] !== 0x50 || value[1] !== 0x4b || value[2] !== 0x03 || value[3] !== 0x04) {
                throw new Error('下载流首字节非 ZIP/.osz 格式，切换备用镜像');
              }
            }
          }

          writeStream.write(value);
          downloaded += value.length;
          bytesSinceTick += value.length;

          const now = Date.now();
          if (now - lastSpeedTick >= 220) {
            const elapsedSec = (now - lastSpeedTick) / 1000;
            const speedBps = Math.round(bytesSinceTick / Math.max(0.05, elapsedSec));
            const progress = totalBytes ? Math.min(99, Math.round((downloaded / totalBytes) * 100)) : 50;
            updateTask(task.id, {
              downloadedBytes: downloaded,
              speedBps,
              progress,
            });
            lastSpeedTick = now;
            bytesSinceTick = 0;
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        await new Promise<void>((resolve) => writeStream.end(() => resolve()));
      }

      updateTask(task.id, {
        downloadedBytes: downloaded,
        totalBytes: totalBytes || downloaded,
        progress: 100,
        speedBps: 0,
      });

      return { routeUsed: route };
    } catch (err) {
      lastErr = err;
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      } catch {
        // Ignore temp file cleanup
      }
      if (controller.signal.aborted) throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || '下载失败'));
}

async function processTask(taskId: string): Promise<void> {
  const task = tasks.get(taskId);
  if (!task || task.status === 'cancelled') return;

  const cfg = getConfig();
  const controller = new AbortController();
  abortControllers.set(taskId, controller);

  const partPath = path.join(TMP_DIR, `${taskId}.osz.part`);
  const mirrors = getRankedMirrors(task.preferredMirror);

  try {
    updateTask(taskId, {
      status: 'downloading',
      error: null,
      triedMirrors: [],
      message: '正在匹配最快可用镜像源...',
    });

    let downloaded = false;
    let lastError = '所有镜像均下载失败';

    for (const mirror of mirrors) {
      if (controller.signal.aborted) {
        throw new Error('任务已取消');
      }
      task.triedMirrors.push(mirror.id);
      try {
        await downloadFromMirror(task, mirror, partPath, controller);

        updateTask(taskId, {
          status: 'verifying',
          message: `正在校验 .osz 压缩包完整性 (${mirror.shortName})...`,
        });

        const check = verifyOszFile(partPath);
        if (!check.valid) {
          throw new Error(check.reason || '.osz 校验失败');
        }
        cacheOszForPreview(partPath, task.beatmapsetId);
        downloaded = true;
        break;
      } catch (err) {
        lastError = `${mirror.shortName}: ${err instanceof Error ? err.message : String(err)}`;
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        } catch {
          // Ignore
        }
        if (controller.signal.aborted) {
          throw new Error('任务已取消');
        }
      }
    }

    if (!downloaded) {
      throw new Error(lastError);
    }

    updateTask(taskId, {
      status: 'installing',
      message:
        task.target === 'both'
          ? '正在同步安装至 Stable 与 Lazer...'
          : task.target === 'stable'
            ? '正在解压安装至 osu!stable Songs 目录...'
            : '正在投递至 osu!lazer 导入队列...',
    });

    const meta = {
      beatmapsetId: task.beatmapsetId,
      artist: task.artist,
      title: task.title,
    };

    let stableResultPath: string | undefined;
    let lazerResultPath: string | undefined;
    let lazerQueuedOnly = false;
    let stableTriggeredIpc = false;
    let lazerTriggeredIpc = false;

    if (task.target === 'stable' || task.target === 'both') {
      const sRes = await installToStable(partPath, meta, cfg);
      stableResultPath = sRes.installedPath;
      stableTriggeredIpc = sRes.triggeredIpc;
    }

    if (task.target === 'lazer' || task.target === 'both') {
      const lRes = await installToLazer(partPath, meta, cfg);
      lazerResultPath = lRes.oszDestPath;
      lazerQueuedOnly = !lRes.triggeredIpc;
      lazerTriggeredIpc = lRes.triggeredIpc;
    }

    const autoLoadedInGame = stableTriggeredIpc || lazerTriggeredIpc;
    const loadTargetClient: DownloadTask['loadTargetClient'] =
      stableTriggeredIpc && lazerTriggeredIpc
        ? 'both'
        : stableTriggeredIpc
          ? 'stable'
          : lazerTriggeredIpc
            ? 'lazer'
            : null;

    const finalStatus =
      task.target === 'lazer' && lazerQueuedOnly ? 'queued_lazer' : 'completed';

    const finalMsg =
      task.target === 'both'
        ? stableTriggeredIpc && lazerTriggeredIpc
          ? '已自动导入并在运行中的 Stable 与 Lazer 加载'
          : stableTriggeredIpc
            ? lazerQueuedOnly
              ? '已自动在运行中的 Stable 加载；Lazer 已放入待导入队列'
              : '已在运行中的 Stable 加载，并直接导入运行中的 Lazer'
            : lazerQueuedOnly
              ? 'Stable 已解压安装；Lazer 已放入待导入队列（启动后可一键导入）'
              : '已成功安装到 Stable 并直接导入运行中的 Lazer'
        : task.target === 'stable'
          ? stableTriggeredIpc
            ? '已自动导入并在运行中的 osu!stable 加载'
            : `${cfg.stableInstallMode === 'drop_osz' ? '已保存 .osz 到' : '已解压安装到'} ${path.join(cfg.stablePath, 'Songs')}`
          : lazerQueuedOnly
            ? '已保存至 Lazer 待导入队列（可随时一键批量导入）'
            : '已直接导入正在运行的 osu!lazer 并在游戏中加载';

    updateTask(taskId, {
      status: finalStatus,
      progress: 100,
      speedBps: 0,
      stableResultPath,
      lazerResultPath,
      autoLoadedInGame,
      loadTargetClient,
      message: finalMsg,
    });

    logInfo('download', `Task ${finalStatus}`, {
      taskId,
      setId: task.beatmapsetId,
      target: task.target,
      mirror: task.activeMirror,
      route: task.routeUsed,
    });

    libraryEvents.emit('update', await getLibraryStatus(true));
  } catch (err) {
    const isCancelled = controller.signal.aborted;
    const errMsg = isCancelled ? '已手动取消' : err instanceof Error ? err.message : String(err);
    updateTask(taskId, {
      status: isCancelled ? 'cancelled' : 'failed',
      speedBps: 0,
      error: errMsg,
      message: isCancelled ? '已取消' : '下载或安装失败',
    });
    if (isCancelled) {
      logWarn('download', 'Task cancelled', { taskId, setId: task.beatmapsetId });
    } else {
      logError('download', 'Task failed', { taskId, setId: task.beatmapsetId, error: errMsg });
    }
  } finally {
    abortControllers.delete(taskId);
    try {
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
    } catch {
      // Ignore cleanup
    }
  }
}

function pumpQueue(): void {
  const cfg = getConfig();
  while (activeWorkers < cfg.concurrency) {
    const nextId = taskOrder.find((id) => tasks.get(id)?.status === 'queued');
    if (!nextId) break;
    activeWorkers++;
    void processTask(nextId).finally(() => {
      activeWorkers--;
      pumpQueue();
    });
  }
}

export function enqueueDownload(input: EnqueueDownloadInput): DownloadTask {
  const cfg = getConfig();
  // Avoid duplicating an already active task with the exact same beatmapsetId and target
  for (const id of taskOrder) {
    const existing = tasks.get(id);
    if (
      existing &&
      existing.beatmapsetId === input.beatmapsetId &&
      existing.target === (input.target || cfg.defaultTarget) &&
      (existing.status === 'queued' ||
        existing.status === 'downloading' ||
        existing.status === 'verifying' ||
        existing.status === 'installing')
    ) {
      return existing;
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID().slice(0, 8);
  const task: DownloadTask = {
    id,
    beatmapsetId: Number(input.beatmapsetId),
    title: input.title || `Beatmapset #${input.beatmapsetId}`,
    artist: input.artist || 'Unknown Artist',
    creator: input.creator || '',
    target: input.target || cfg.defaultTarget,
    variant: input.variant || cfg.defaultVariant,
    preferredMirror: input.preferredMirror || cfg.preferredDownloadSource,
    activeMirror: null,
    triedMirrors: [],
    routeUsed: null,
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    speedBps: 0,
    message: '排队等待下载...',
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  tasks.set(id, task);
  taskOrder.push(id);
  logInfo('download', 'Task enqueued', {
    taskId: id,
    setId: task.beatmapsetId,
    target: task.target,
    variant: task.variant,
  });
  emitTasks();
  pumpQueue();
  return task;
}

export function cancelDownload(taskId: string): DownloadTask | null {
  const t = tasks.get(taskId);
  if (!t) return null;
  if (t.status === 'queued') {
    return updateTask(taskId, { status: 'cancelled', message: '已取消排队' });
  }
  const ctrl = abortControllers.get(taskId);
  if (ctrl) {
    ctrl.abort();
  }
  return t;
}

export function retryDownload(taskId: string): DownloadTask | null {
  const t = tasks.get(taskId);
  if (!t) return null;
  if (t.status !== 'failed' && t.status !== 'cancelled') return t;
  updateTask(taskId, {
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    speedBps: 0,
    error: null,
    triedMirrors: [],
    activeMirror: null,
    message: '已重新加入下载队列...',
  });
  pumpQueue();
  return t;
}

export function clearFinishedDownloads(): number {
  let removed = 0;
  for (let i = taskOrder.length - 1; i >= 0; i--) {
    const id = taskOrder[i];
    const t = tasks.get(id);
    if (
      t &&
      (t.status === 'completed' ||
        t.status === 'queued_lazer' ||
        t.status === 'failed' ||
        t.status === 'cancelled')
    ) {
      tasks.delete(id);
      taskOrder.splice(i, 1);
      removed++;
    }
  }
  emitTasks();
  return removed;
}
