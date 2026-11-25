import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { detectLazerExePath, PREVIEW_OSZ_CACHE_DIR, TMP_DIR } from './config.js';
import { st } from './i18n.js';
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

function fileTooSmallReason(size: number): string {
  return st(`文件过小 (${size}B)，不是有效的 .osz 包`, `File too small (${size}B), not a valid .osz package`);
}

function notZipReason(): string {
  return st(
    '响应内容不是 ZIP/.osz 压缩包（可能镜像返回了错误页）',
    'Response is not a ZIP/.osz archive (mirror may have returned an error page)',
  );
}

function noOsuInArchiveReason(): string {
  return st('.osz 压缩包内未找到任何 .osu 谱面文件', 'No .osu beatmap files found inside the .osz archive');
}

function verifyFailedReason(): string {
  return st('校验 .osz 压缩包失败', 'Failed to verify .osz archive');
}

function unsafeArchivePathMsg(entryName: string): string {
  return st(
    `检测到不安全的压缩包路径: ${entryName}`,
    `Unsafe archive entry path detected: ${entryName}`,
  );
}

function lazerExeNotFoundMsg(exePath: string): string {
  return st(`未找到 osu!lazer 可执行文件: ${exePath}`, `osu!lazer executable not found: ${exePath}`);
}

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
      return { valid: false, reason: fileTooSmallReason(stat.size), osuCount: 0 };
    }
    const fd = fs.openSync(filePath, 'r');
    const magic = Buffer.allocUnsafe(4);
    try {
      fs.readSync(fd, magic, 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) {
      return { valid: false, reason: notZipReason(), osuCount: 0 };
    }

    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const osuCount = entries.filter(
      (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.osu'),
    ).length;

    if (osuCount === 0) {
      return { valid: false, reason: noOsuInArchiveReason(), osuCount: 0 };
    }
    return { valid: true, osuCount };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : verifyFailedReason(),
      osuCount: 0,
    };
  }
}

export async function verifyOszFileFast(
  filePath: string,
): Promise<{ valid: boolean; reason?: string }> {
  let fh: fs.promises.FileHandle | null = null;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size < 512) {
      return { valid: false, reason: fileTooSmallReason(stat.size) };
    }

    fh = await fs.promises.open(filePath, 'r');
    const head = Buffer.allocUnsafe(4);
    await fh.read(head, 0, 4, 0);
    if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
      return { valid: false, reason: notZipReason() };
    }

    const tailLen = Math.min(stat.size, 65_558);
    const tailOffset = stat.size - tailLen;
    const tail = Buffer.allocUnsafe(tailLen);
    await fh.read(tail, 0, tailLen, tailOffset);

    let eocdPos = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (
        tail[i] === 0x50 &&
        tail[i + 1] === 0x4b &&
        tail[i + 2] === 0x05 &&
        tail[i + 3] === 0x06
      ) {
        eocdPos = i;
        break;
      }
    }

    if (eocdPos < 0) {
      await fh.close();
      fh = null;
      const fallback = verifyOszFile(filePath);
      return { valid: fallback.valid, reason: fallback.reason };
    }

    const totalEntries = tail.readUInt16LE(eocdPos + 10);
    const cdSize = tail.readUInt32LE(eocdPos + 12);
    const cdOffset = tail.readUInt32LE(eocdPos + 16);

    if (
      totalEntries === 0xffff ||
      cdSize === 0xffffffff ||
      cdOffset === 0xffffffff ||
      cdSize === 0 ||
      cdOffset + cdSize > stat.size
    ) {
      await fh.close();
      fh = null;
      const fallback = verifyOszFile(filePath);
      return { valid: fallback.valid, reason: fallback.reason };
    }

    const readSize = Math.min(cdSize, 512 * 1024);
    const cdBuf = Buffer.allocUnsafe(readSize);
    await fh.read(cdBuf, 0, readSize, cdOffset);
    const cdText = cdBuf.toString('latin1').toLowerCase();
    if (cdText.includes('.osu')) {
      return { valid: true };
    }
    return { valid: false, reason: noOsuInArchiveReason() };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : verifyFailedReason(),
    };
  } finally {
    if (fh) {
      await fh.close().catch(() => {});
    }
  }
}

export async function moveFileFast(src: string, dest: string): Promise<void> {
  try {
    await fs.promises.rename(src, dest);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EXDEV' || code === 'EPERM' || code === 'EACCES') {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src).catch(() => {});
    } else {
      throw err;
    }
  }
}

export interface InstallMeta {
  beatmapsetId: number;
  artist: string;
  title: string;
}

export async function fastInstallToStable(
  oszPath: string,
  meta: InstallMeta,
  cfg: AppConfig,
  opts: { dropOsz: boolean; moveSource: boolean },
): Promise<{ installedPath: string; folderName: string }> {
  const songsDir = path.join(cfg.stablePath, 'Songs');
  await fs.promises.mkdir(songsDir, { recursive: true });
  const baseName = sanitizeWindowsName(`${meta.beatmapsetId} ${meta.artist} - ${meta.title}`);

  if (opts.dropOsz) {
    const oszName = `${baseName}.osz`;
    const dest = path.join(songsDir, oszName);
    if (opts.moveSource) {
      await moveFileFast(oszPath, dest);
    } else {
      await fs.promises.copyFile(oszPath, dest);
    }
    markInstalledInMemory(meta.beatmapsetId, 'stable', oszName);
    return { installedPath: dest, folderName: oszName };
  }

  const targetDir = path.join(songsDir, baseName);
  const tmpDir = path.join(songsDir, `.tmp-${meta.beatmapsetId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  try {
    const zip = new AdmZip(oszPath);
    const resolvedTmp = path.resolve(tmpDir);
    const dirsCreated = new Set<string>([resolvedTmp]);
    const fileTasks: Array<{ destFile: string; data: Buffer }> = [];

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const safeRel = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!safeRel || safeRel.includes('..')) continue;
      const destFile = path.resolve(resolvedTmp, safeRel);
      if (!destFile.startsWith(resolvedTmp + path.sep)) {
        throw new Error(unsafeArchivePathMsg(entry.entryName));
      }
      const parentDir = path.dirname(destFile);
      if (!dirsCreated.has(parentDir)) {
        dirsCreated.add(parentDir);
        await fs.promises.mkdir(parentDir, { recursive: true });
      }
      fileTasks.push({ destFile, data: entry.getData() });
    }

    for (let i = 0; i < fileTasks.length; i += 8) {
      const batch = fileTasks.slice(i, i + 8);
      await Promise.all(batch.map((item) => fs.promises.writeFile(item.destFile, item.data)));
    }

    if (fs.existsSync(targetDir)) {
      await fs.promises.rm(targetDir, { recursive: true, force: true });
    }
    await fs.promises.rename(tmpDir, targetDir);

    if (opts.moveSource) {
      await fs.promises.unlink(oszPath).catch(() => {});
    }
  } catch (err) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  markInstalledInMemory(meta.beatmapsetId, 'stable', baseName);
  return { installedPath: targetDir, folderName: baseName };
}

export async function fastStageToLazer(
  oszPath: string,
  meta: InstallMeta,
  cfg: AppConfig,
  opts: { moveSource: boolean },
): Promise<{ oszDestPath: string; filename: string }> {
  await fs.promises.mkdir(cfg.lazerImportDir, { recursive: true });
  const fileName = `${sanitizeWindowsName(`${meta.beatmapsetId} ${meta.artist} - ${meta.title}`)}.osz`;
  const destPath = path.join(cfg.lazerImportDir, fileName);
  if (opts.moveSource) {
    await moveFileFast(oszPath, destPath);
  } else {
    await fs.promises.copyFile(oszPath, destPath);
  }
  return { oszDestPath: destPath, filename: fileName };
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
        throw new Error(unsafeArchivePathMsg(entry.entryName));
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
      message: lazerExeNotFoundMsg(cfg.lazerExePath),
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
      message: st('待导入目录中没有 .osz 文件', 'No .osz files in pending import folder'),
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
    message: st(
      `已向 osu!lazer 发送 ${targets.length} 个谱面导入请求`,
      `Sent ${targets.length} beatmap import request(s) to osu!lazer`,
    ),
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
      failed.push({
        setId,
        reason: st('Stable 库中未找到该谱面目录', 'Beatmap folder not found in Stable library'),
      });
      continue;
    }
    const srcPath = path.join(songsDir, folderName);
    if (!fs.existsSync(srcPath)) {
      failed.push({
        setId,
        reason: st(`目录不存在: ${srcPath}`, `Directory does not exist: ${srcPath}`),
      });
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
      return {
        ok: false,
        client: null,
        message: st('未检测到运行中的 osu!lazer', 'No running osu!lazer instance detected'),
      };
    }
    targetClient = 'lazer';
  } else if (requestedClient === 'stable') {
    if (!stableRunning) {
      return {
        ok: false,
        client: null,
        message: st('未检测到运行中的 osu!stable', 'No running osu!stable instance detected'),
      };
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
      message: st(
        '未检测到正在运行的 osu!lazer 或 osu!stable 客户端',
        'No running osu!lazer or osu!stable client detected',
      ),
    };
  }

  const located = locateOrPackOszForGame(beatmapsetId, cfg);
  if (!located) {
    return {
      ok: false,
      client: targetClient,
      message: st(
        `未找到谱面 #${beatmapsetId} 的本地 .osz 文件或 Songs 目录，请先下载`,
        `Local .osz file or Songs folder for beatmapset #${beatmapsetId} not found; please download it first`,
      ),
    };
  }

  if (targetClient === 'lazer') {
    if (!cfg.lazerExePath || !fs.existsSync(cfg.lazerExePath)) {
      if (located.isTemp && fs.existsSync(located.oszPath)) fs.unlinkSync(located.oszPath);
      return {
        ok: false,
        client: 'lazer',
        message: lazerExeNotFoundMsg(cfg.lazerExePath),
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
      message: st(
        `已向运行中的 osu!lazer 发送导入加载请求 (#${beatmapsetId})`,
        `Sent import & load request (#${beatmapsetId}) to running osu!lazer`,
      ),
    };
  }

  const stableExe = path.join(cfg.stablePath, 'osu!.exe');
  if (!fs.existsSync(stableExe)) {
    if (located.isTemp && fs.existsSync(located.oszPath)) fs.unlinkSync(located.oszPath);
    return {
      ok: false,
      client: 'stable',
      message: st(`未找到 osu!stable 可执行文件: ${stableExe}`, `osu!stable executable not found: ${stableExe}`),
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
    message: st(
      `已向运行中的 osu!stable 发送导入加载请求 (#${beatmapsetId})`,
      `Sent import & load request (#${beatmapsetId}) to running osu!stable`,
    ),
  };
}

export async function launchGameClient(
  client: 'stable' | 'lazer',
  cfg: AppConfig,
): Promise<{
  ok: boolean;
  client: 'stable' | 'lazer';
  alreadyRunning?: boolean;
  exePath?: string;
  message: string;
}> {
  let exePath = '';
  if (client === 'stable') {
    exePath = cfg.stablePath ? path.join(cfg.stablePath, 'osu!.exe') : '';
  } else {
    exePath = cfg.lazerExePath || '';
    if (!exePath || !fs.existsSync(exePath)) {
      const fallback = detectLazerExePath();
      if (fallback && fs.existsSync(fallback)) {
        exePath = fallback;
      }
    }
  }

  if (!exePath || !fs.existsSync(exePath)) {
    return {
      ok: false,
      client,
      message:
        client === 'stable'
          ? st(
              `未找到 osu!stable 可执行文件 (${exePath || '未配置目录'})，请在设置中确认 Stable 目录`,
              `osu!stable executable not found (${exePath || 'directory not configured'}); please check your Stable path in Settings`,
            )
          : st(
              `未找到 osu!lazer 可执行文件 (${exePath || '未配置路径'})，请在设置中确认 Lazer 路径`,
              `osu!lazer executable not found (${exePath || 'path not configured'}); please check your Lazer path in Settings`,
            ),
    };
  }

  const running = await detectRunningClients(true);
  const isRunning = client === 'stable' ? running.stableRunning : running.lazerRunning;
  if (isRunning) {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(New-Object -ComObject WScript.Shell).AppActivate('osu!') | Out-Null",
      ],
      { timeout: 2000, windowsHide: true },
      () => {},
    );
    libraryEvents.emit('update', await getLibraryStatus(false));
    return {
      ok: true,
      client,
      alreadyRunning: true,
      exePath,
      message:
        client === 'stable'
          ? st(
              'osu!stable 已在运行中，已尝试切至前台',
              'osu!stable is already running; attempted to bring to foreground',
            )
          : st(
              'osu!lazer 已在运行中，已尝试切至前台',
              'osu!lazer is already running; attempted to bring to foreground',
            ),
    };
  }

  const cwd = path.dirname(exePath);
  let launchedOk = await new Promise<boolean>((resolve) => {
    let settled = false;
    const child = spawn(exePath, [], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.once('spawn', () => {
      if (!settled) {
        settled = true;
        child.unref();
        resolve(true);
      }
    });
    child.on('error', () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
  });

  if (!launchedOk) {
    launchedOk = await new Promise<boolean>((resolve) => {
      let settled = false;
      const child = spawn('cmd.exe', ['/c', 'start', '""', '/d', cwd, exePath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('spawn', () => {
        if (!settled) {
          settled = true;
          child.unref();
          resolve(true);
        }
      });
      child.on('error', () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      });
    });
  }

  if (!launchedOk) {
    return {
      ok: false,
      client,
      exePath,
      message:
        client === 'stable'
          ? st(`启动 osu!stable 失败: ${exePath}`, `Failed to launch osu!stable: ${exePath}`)
          : st(`启动 osu!lazer 失败: ${exePath}`, `Failed to launch osu!lazer: ${exePath}`),
    };
  }

  const refreshStatus = () => {
    void getLibraryStatus(true)
      .then((st) => libraryEvents.emit('update', st))
      .catch(() => {});
  };
  setTimeout(refreshStatus, 1500);
  setTimeout(refreshStatus, 4000);

  return {
    ok: true,
    client,
    alreadyRunning: false,
    exePath,
    message:
      client === 'stable'
        ? st('正在启动 osu!stable…', 'Launching osu!stable...')
        : st('正在启动 osu!lazer…', 'Launching osu!lazer...'),
  };
}
