import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { PREVIEW_OSZ_CACHE_DIR, TMP_DIR } from './config.js';
import {
  detectRunningClients,
  getLibraryStatus,
  libraryEvents,
  markInstalledInMemory,
  rescanLibrary,
  scanLazerPendingFiles,
  scanStableLibrary,
} from './library.js';
import { logWarn } from './logger.js';
import { AppConfig } from './types.js';

export function sanitizeWindowsName(input: string, maxLen = 110): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  const truncated = cleaned.slice(0, maxLen).replace(/[. ]+$/, '');
  return truncated || 'beatmap';
}

export function verifyOszFile(filePath: string): { valid: boolean; reason?: string; osuCount: number } {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 512) {
      return { valid: false, reason: `文件过小 (${stat.size}B)，不是有效的 .osz 包`, osuCount: 0 };
    }
    const fd = fs.openSync(filePath, 'r');
    const magic = Buffer.allocUnsafe(4);
    try {
      fs.readSync(fd, magic, 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) {
      return { valid: false, reason: '响应内容不是 ZIP/.osz 压缩包（可能镜像返回了错误页）', osuCount: 0 };
    }

    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const osuCount = entries.filter(
      (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.osu'),
    ).length;

    if (osuCount === 0) {
      return { valid: false, reason: '.osz 压缩包内未找到任何 .osu 谱面文件', osuCount: 0 };
    }
    return { valid: true, osuCount };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : '校验 .osz 压缩包失败',
      osuCount: 0,
    };
  }
}

export interface InstallMeta {
  beatmapsetId: number;
  artist: string;
  title: string;
}

export async function installToStable(
  oszPath: string,
  meta: InstallMeta,
  cfg: AppConfig,
): Promise<{ installedPath: string; folderName: string; triggeredIpc: boolean }> {
  const songsDir = path.join(cfg.stablePath, 'Songs');
  fs.mkdirSync(songsDir, { recursive: true });

  const baseName = sanitizeWindowsName(`${meta.beatmapsetId} ${meta.artist} - ${meta.title}`);

  const { stableRunning } = await detectRunningClients(true);
  if (stableRunning && cfg.autoLoadWhenStableRunning) {
    const stableExe = path.join(cfg.stablePath, 'osu!.exe');
    if (fs.existsSync(stableExe)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      const stagingPath = path.join(TMP_DIR, `stable-live-${meta.beatmapsetId}-${Date.now()}.osz`);
      try {
        fs.copyFileSync(oszPath, stagingPath);
        const child = spawn(stableExe, [stagingPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.unref();
        markInstalledInMemory(meta.beatmapsetId, 'stable', baseName);
        setTimeout(() => {
          void rescanLibrary(false);
        }, 2500);
        return {
          installedPath: path.join(songsDir, baseName),
          folderName: baseName,
          triggeredIpc: true,
        };
      } catch (err) {
        logWarn('installer', 'Failed to IPC load .osz into running osu!stable, falling back to disk install', {
          setId: meta.beatmapsetId,
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
        } catch {
          // Ignore cleanup
        }
      }
    }
  }

  if (cfg.stableInstallMode === 'drop_osz') {
    const oszName = `${baseName}.osz`;
    const dest = path.join(songsDir, oszName);
    fs.copyFileSync(oszPath, dest);
    markInstalledInMemory(meta.beatmapsetId, 'stable', oszName);
    return { installedPath: dest, folderName: oszName, triggeredIpc: false };
  }

  const targetDir = path.join(songsDir, baseName);
  const tmpDir = path.join(songsDir, `.tmp-${meta.beatmapsetId}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const zip = new AdmZip(oszPath);
    const resolvedTmp = path.resolve(tmpDir);

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const safeRel = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!safeRel || safeRel.includes('..')) continue;
      const destFile = path.resolve(resolvedTmp, safeRel);
      if (!destFile.startsWith(resolvedTmp + path.sep)) {
        throw new Error(`检测到不安全的压缩包路径: ${entry.entryName}`);
      }
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.writeFileSync(destFile, entry.getData());
    }

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.renameSync(tmpDir, targetDir);
  } catch (err) {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
    throw err;
  }

  markInstalledInMemory(meta.beatmapsetId, 'stable', baseName);
  return { installedPath: targetDir, folderName: baseName, triggeredIpc: false };
}

export async function installToLazer(
  oszPath: string,
  meta: InstallMeta,
  cfg: AppConfig,
): Promise<{ oszDestPath: string; triggeredIpc: boolean }> {
  fs.mkdirSync(cfg.lazerImportDir, { recursive: true });
  const fileName = `${sanitizeWindowsName(`${meta.beatmapsetId} ${meta.artist} - ${meta.title}`)}.osz`;
  const destPath = path.join(cfg.lazerImportDir, fileName);
  fs.copyFileSync(oszPath, destPath);

  const { lazerRunning } = await detectRunningClients(true);
  let triggeredIpc = false;

  if (lazerRunning && cfg.autoImportWhenLazerRunning && cfg.lazerExePath && fs.existsSync(cfg.lazerExePath)) {
    try {
      const child = spawn(cfg.lazerExePath, [destPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      triggeredIpc = true;
      markInstalledInMemory(meta.beatmapsetId, 'lazer');
    } catch {
      triggeredIpc = false;
    }
  }

  return { oszDestPath: destPath, triggeredIpc };
}

export async function launchLazerBatchImport(
  cfg: AppConfig,
  requestedFilenames?: string[],
): Promise<{ launched: boolean; count: number; files: string[]; message: string }> {
  if (!cfg.lazerExePath || !fs.existsSync(cfg.lazerExePath)) {
    return {
      launched: false,
      count: 0,
      files: [],
      message: `未找到 osu!lazer 可执行文件: ${cfg.lazerExePath}`,
    };
  }

  const pending = scanLazerPendingFiles(cfg.lazerImportDir);
  const targets = requestedFilenames?.length
    ? pending.filter((p) => requestedFilenames.includes(p.filename))
    : pending;

  if (targets.length === 0) {
    return {
      launched: false,
      count: 0,
      files: [],
      message: '待导入目录中没有 .osz 文件',
    };
  }

  // Pass files in batches of 15 so Windows command line stays well under length limit
  const batchSize = 15;
  for (let i = 0; i < targets.length; i += batchSize) {
    const args = targets.slice(i, i + batchSize).map((t) => t.fullPath);
    const child = spawn(cfg.lazerExePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    if (i === 0 && targets.length > batchSize) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  for (const t of targets) {
    if (t.beatmapsetId) {
      markInstalledInMemory(t.beatmapsetId, 'lazer');
    }
  }
  libraryEvents.emit('update', await getLibraryStatus(true));

  return {
    launched: true,
    count: targets.length,
    files: targets.map((t) => t.filename),
    message: `已向 osu!lazer 发送 ${targets.length} 个谱面导入请求`,
  };
}

export async function clearLazerPendingFiles(
  cfg: AppConfig,
  filenames?: string[],
): Promise<{ deletedCount: number }> {
  const pending = scanLazerPendingFiles(cfg.lazerImportDir);
  const targets = filenames?.length
    ? pending.filter((p) => filenames.includes(p.filename))
    : pending;
  let deletedCount = 0;
  for (const item of targets) {
    try {
      fs.unlinkSync(item.fullPath);
      deletedCount++;
    } catch {
      // Ignore locked files
    }
  }
  libraryEvents.emit('update', await getLibraryStatus(false));
  return { deletedCount };
}

function addDirectoryToZip(zip: AdmZip, baseDir: string, currentDir: string): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, baseDir, full);
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const relDir = path.posix.dirname(rel);
      zip.addLocalFile(full, relDir === '.' ? '' : relDir);
    }
  }
}

export async function syncStableToLazer(
  setIds: number[],
  cfg: AppConfig,
): Promise<{ syncedCount: number; failed: Array<{ setId: number; reason: string }>; triggeredIpc: boolean }> {
  const stableMap = scanStableLibrary(cfg.stablePath);
  const songsDir = path.join(cfg.stablePath, 'Songs');
  fs.mkdirSync(cfg.lazerImportDir, { recursive: true });

  const createdFiles: string[] = [];
  const failed: Array<{ setId: number; reason: string }> = [];

  for (const setId of setIds) {
    const folderName = stableMap.get(setId);
    if (!folderName) {
      failed.push({ setId, reason: 'Stable 库中未找到该谱面目录' });
      continue;
    }
    const srcPath = path.join(songsDir, folderName);
    if (!fs.existsSync(srcPath)) {
      failed.push({ setId, reason: `目录不存在: ${srcPath}` });
      continue;
    }

    try {
      const cleanName = folderName.toLowerCase().endsWith('.osz')
        ? sanitizeWindowsName(folderName.slice(0, -4)) + '.osz'
        : sanitizeWindowsName(folderName) + '.osz';
      const destOsz = path.join(cfg.lazerImportDir, cleanName);

      if (fs.statSync(srcPath).isFile() && srcPath.toLowerCase().endsWith('.osz')) {
        fs.copyFileSync(srcPath, destOsz);
      } else {
        const zip = new AdmZip();
        addDirectoryToZip(zip, srcPath, srcPath);
        zip.writeZip(destOsz);
      }
      createdFiles.push(path.basename(destOsz));
    } catch (err) {
      failed.push({ setId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  let triggeredIpc = false;
  const { lazerRunning } = await detectRunningClients(true);
  if (createdFiles.length > 0 && lazerRunning && cfg.autoImportWhenLazerRunning) {
    const res = await launchLazerBatchImport(cfg, createdFiles);
    triggeredIpc = res.launched;
  } else {
    libraryEvents.emit('update', await getLibraryStatus(false));
  }

  return { syncedCount: createdFiles.length, failed, triggeredIpc };
}

export function openFolderInExplorer(dirPath: string): void {
  const resolved = path.resolve(dirPath);
  fs.mkdirSync(resolved, { recursive: true });
  const child = spawn('explorer.exe', [resolved], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function findMatchingOszInDir(dirPath: string, setId: number): string | null {
  if (!dirPath || !fs.existsSync(dirPath)) return null;
  try {
    const re = new RegExp(`^${setId}\\b.*\\.osz$`, 'i');
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isFile() && re.test(entry.name)) {
        return path.join(dirPath, entry.name);
      }
    }
  } catch {
    // Ignore directory read error
  }
  return null;
}

function locateOrPackOszForGame(
  setId: number,
  cfg: AppConfig,
): { oszPath: string; isTemp: boolean; baseName: string } | null {
  const cachedOsz = path.join(PREVIEW_OSZ_CACHE_DIR, `${setId}.osz`);
  if (fs.existsSync(cachedOsz)) {
    return { oszPath: cachedOsz, isTemp: false, baseName: `${setId}` };
  }

  const lazerPending = findMatchingOszInDir(cfg.lazerImportDir, setId);
  if (lazerPending) {
    return {
      oszPath: lazerPending,
      isTemp: false,
      baseName: path.basename(lazerPending, '.osz'),
    };
  }

  const songsDir = path.join(cfg.stablePath, 'Songs');
  const stableOsz = findMatchingOszInDir(songsDir, setId);
  if (stableOsz) {
    return {
      oszPath: stableOsz,
      isTemp: false,
      baseName: path.basename(stableOsz, '.osz'),
    };
  }

  const stableMap = scanStableLibrary(cfg.stablePath);
  const folderName = stableMap.get(setId);
  if (folderName) {
    const srcPath = path.join(songsDir, folderName);
    if (fs.existsSync(srcPath)) {
      if (fs.statSync(srcPath).isFile() && srcPath.toLowerCase().endsWith('.osz')) {
        return { oszPath: srcPath, isTemp: false, baseName: path.basename(srcPath, '.osz') };
      }
      if (fs.statSync(srcPath).isDirectory()) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
        const cleanName = sanitizeWindowsName(folderName);
        const tmpOsz = path.join(TMP_DIR, `live-pack-${setId}-${Date.now()}.osz`);
        const zip = new AdmZip();
        addDirectoryToZip(zip, srcPath, srcPath);
        zip.writeZip(tmpOsz);
        return { oszPath: tmpOsz, isTemp: true, baseName: cleanName };
      }
    }
  }

  return null;
}

export async function loadBeatmapIntoRunningGame(
  beatmapsetId: number,
  requestedClient: 'auto' | 'lazer' | 'stable',
  cfg: AppConfig,
): Promise<{ ok: boolean; client: 'lazer' | 'stable' | null; message: string }> {
  const { stableRunning, lazerRunning } = await detectRunningClients(true);

  let targetClient: 'lazer' | 'stable' | null = null;
  if (requestedClient === 'lazer') {
    if (!lazerRunning) {
      return { ok: false, client: null, message: '未检测到运行中的 osu!lazer' };
    }
    targetClient = 'lazer';
  } else if (requestedClient === 'stable') {
    if (!stableRunning) {
      return { ok: false, client: null, message: '未检测到运行中的 osu!stable' };
    }
    targetClient = 'stable';
  } else {
    if (lazerRunning && stableRunning) {
      targetClient = cfg.defaultTarget === 'stable' ? 'stable' : 'lazer';
    } else if (lazerRunning) {
      targetClient = 'lazer';
    } else if (stableRunning) {
      targetClient = 'stable';
    }
  }

  if (!targetClient) {
    return {
      ok: false,
      client: null,
      message: '未检测到正在运行的 osu!lazer 或 osu!stable 客户端',
    };
  }

  const located = locateOrPackOszForGame(beatmapsetId, cfg);
  if (!located) {
    return {
      ok: false,
      client: targetClient,
      message: `未找到谱面 #${beatmapsetId} 的本地 .osz 文件或 Songs 目录，请先下载`,
    };
  }

  if (targetClient === 'lazer') {
    if (!cfg.lazerExePath || !fs.existsSync(cfg.lazerExePath)) {
      if (located.isTemp && fs.existsSync(located.oszPath)) fs.unlinkSync(located.oszPath);
      return {
        ok: false,
        client: 'lazer',
        message: `未找到 osu!lazer 可执行文件: ${cfg.lazerExePath}`,
      };
    }

    fs.mkdirSync(cfg.lazerImportDir, { recursive: true });
    let importPath = located.oszPath;
    const resolvedImportDir = path.resolve(cfg.lazerImportDir);
    if (!path.resolve(located.oszPath).startsWith(resolvedImportDir + path.sep)) {
      const destName = `${sanitizeWindowsName(located.baseName)}.osz`;
      importPath = path.join(cfg.lazerImportDir, destName);
      fs.copyFileSync(located.oszPath, importPath);
      if (located.isTemp && fs.existsSync(located.oszPath)) {
        try {
          fs.unlinkSync(located.oszPath);
        } catch {
          // Ignore cleanup
        }
      }
    }

    const child = spawn(cfg.lazerExePath, [importPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    markInstalledInMemory(beatmapsetId, 'lazer');
    setTimeout(() => {
      void rescanLibrary(false);
    }, 2500);
    return {
      ok: true,
      client: 'lazer',
      message: `已向运行中的 osu!lazer 发送导入加载请求 (#${beatmapsetId})`,
    };
  }

  const stableExe = path.join(cfg.stablePath, 'osu!.exe');
  if (!fs.existsSync(stableExe)) {
    if (located.isTemp && fs.existsSync(located.oszPath)) fs.unlinkSync(located.oszPath);
    return {
      ok: false,
      client: 'stable',
      message: `未找到 osu!stable 可执行文件: ${stableExe}`,
    };
  }

  let stagingPath = located.oszPath;
  if (!located.isTemp) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    stagingPath = path.join(TMP_DIR, `stable-live-${beatmapsetId}-${Date.now()}.osz`);
    fs.copyFileSync(located.oszPath, stagingPath);
  }

  const child = spawn(stableExe, [stagingPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  markInstalledInMemory(beatmapsetId, 'stable', located.baseName);
  setTimeout(() => {
    void rescanLibrary(false);
  }, 2500);
  return {
    ok: true,
    client: 'stable',
    message: `已向运行中的 osu!stable 发送导入加载请求 (#${beatmapsetId})`,
  };
}
