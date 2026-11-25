import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from './config.js';
import { st } from './i18n.js';
import { detectLocalGlobalIpv6 } from './network.js';
import type {
  AppConfig,
  DetectedEnvironment,
  DetectedProxyPort,
  DownloadTarget,
} from './types.js';

function getCommonProxyPorts(): DetectedProxyPort[] {
  return [
    { port: 6174, label: st('默认代理 6174', 'Default Proxy 6174') },
    { port: 7890, label: 'Clash / Mihomo' },
    { port: 7897, label: 'Clash Verge' },
    { port: 10808, label: st('v2rayN (SOCKS/混合)', 'v2rayN (SOCKS/Mixed)') },
    { port: 10809, label: 'v2rayN (HTTP)' },
    { port: 2080, label: 'Sing-box / Nekoray' },
    { port: 20171, label: 'v2rayA' },
    { port: 1080, label: st('通用 SOCKS 1080', 'Common SOCKS 1080') },
    { port: 1081, label: st('通用 HTTP 1081', 'Common HTTP 1081') },
    { port: 12334, label: 'Hiddify' },
    { port: 8888, label: st('本地代理 8888', 'Local Proxy 8888') },
  ];
}

function dedupePaths(candidates: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const resolved = path.resolve(trimmed);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

function safeIsDir(p: string): boolean {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeIsFile(p: string): boolean {
  try {
    return Boolean(p) && fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isValidStableDir(dir: string): boolean {
  if (!safeIsDir(dir)) return false;
  return safeIsDir(path.join(dir, 'Songs')) || safeIsFile(path.join(dir, 'osu!.exe'));
}

function isValidLazerDataDir(dir: string): boolean {
  if (!safeIsDir(dir)) return false;
  return safeIsFile(path.join(dir, 'client.realm')) || safeIsDir(path.join(dir, 'files'));
}

function readLazerStorageIniFullPath(appDataDir: string): string | null {
  try {
    const iniPath = path.join(appDataDir, 'osu', 'storage.ini');
    if (!safeIsFile(iniPath)) return null;
    const raw = fs.readFileSync(iniPath, 'utf8');
    const match = raw.match(/^FullPath\s*=\s*(.+)$/im);
    if (!match?.[1]) return null;
    return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

function probeTcpPort(host: string, port: number, timeoutMs = 160): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      finish(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      finish(false);
    });
    socket.once('error', () => {
      socket.destroy();
      finish(false);
    });
  });
}

export async function detectLocalEnvironment(
  probe?: Partial<
    Pick<
      AppConfig,
      'stablePath' | 'lazerDataPath' | 'lazerExePath' | 'lazerImportDir' | 'proxyHost' | 'proxyPort'
    >
  >,
): Promise<DetectedEnvironment> {
  const cfg = getConfig();
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  const probedStable = typeof probe?.stablePath === 'string' ? probe.stablePath.trim() : cfg.stablePath;
  const probedLazerData =
    typeof probe?.lazerDataPath === 'string' ? probe.lazerDataPath.trim() : cfg.lazerDataPath;
  const probedLazerExe =
    typeof probe?.lazerExePath === 'string' ? probe.lazerExePath.trim() : cfg.lazerExePath;
  const probedImportDir =
    typeof probe?.lazerImportDir === 'string' ? probe.lazerImportDir.trim() : cfg.lazerImportDir;
  const proxyHost =
    typeof probe?.proxyHost === 'string' && probe.proxyHost.trim()
      ? probe.proxyHost.trim()
      : cfg.proxyHost || '127.0.0.1';
  const rawPort = Number(probe?.proxyPort ?? cfg.proxyPort);
  const proxyPort =
    Number.isFinite(rawPort) && rawPort >= 1 && rawPort <= 65535
      ? Math.round(rawPort)
      : cfg.proxyPort || 6174;

  const stablePool = dedupePaths([
    probedStable,
    path.join(localAppData, 'osu!'),
    'C:\\osu!',
    'C:\\OSU',
    'D:\\osu!',
    'D:\\OSU',
    'E:\\osu!',
    'E:\\OSU',
    'F:\\osu!',
    'F:\\OSU',
    'D:\\Games\\osu!',
    'E:\\Games\\osu!',
  ]);
  const stableCandidates = stablePool.filter(isValidStableDir);
  const currentStableExists = Boolean(probedStable) && isValidStableDir(probedStable);
  const stablePath = currentStableExists ? path.resolve(probedStable) : stableCandidates[0] ?? null;

  const storageIniPath = readLazerStorageIniFullPath(appData);
  const lazerDataPool = dedupePaths([
    probedLazerData,
    storageIniPath,
    path.join(appData, 'osu'),
    'D:\\OSU\\OSUlazer\\osu-lazer',
    'D:\\osu-lazer',
    'C:\\osu-lazer',
    'E:\\osu-lazer',
  ]);
  const lazerDataCandidates = lazerDataPool.filter(isValidLazerDataDir);
  const currentLazerDataExists = Boolean(probedLazerData) && isValidLazerDataDir(probedLazerData);
  const lazerDataPath = currentLazerDataExists
    ? path.resolve(probedLazerData)
    : lazerDataCandidates[0] ?? null;

  const extraExeFromData = lazerDataCandidates.flatMap((dir) => [
    path.resolve(dir, '..', 'osu!.exe'),
    path.resolve(dir, 'osu!.exe'),
  ]);
  const lazerExePool = dedupePaths([
    probedLazerExe,
    path.join(localAppData, 'osulazer', 'current', 'osu!.exe'),
    path.join(localAppData, 'osulazer', 'osu!.exe'),
    'D:\\OSU\\OSUlazer\\osu!.exe',
    'C:\\osu-lazer\\osu!.exe',
    ...extraExeFromData,
  ]);
  const lazerExeCandidates = lazerExePool.filter(safeIsFile);
  const currentLazerExeExists = Boolean(probedLazerExe) && safeIsFile(probedLazerExe);
  const lazerExePath = currentLazerExeExists
    ? path.resolve(probedLazerExe)
    : lazerExeCandidates[0] ?? null;

  let suggestedLazerImportDir = probedImportDir;
  const importUsable =
    Boolean(suggestedLazerImportDir) &&
    (safeIsDir(suggestedLazerImportDir) || safeIsDir(path.dirname(suggestedLazerImportDir)));
  if (!importUsable) {
    const legacy = 'D:\\OSU\\Downloads\\lazer-import';
    if (safeIsDir(legacy) || safeIsDir('D:\\OSU')) {
      suggestedLazerImportDir = legacy;
    } else {
      suggestedLazerImportDir = path.join(os.homedir(), 'Downloads', 'osu-lazer-import');
    }
  }

  const hasStable = Boolean(stablePath);
  const hasLazer = Boolean(lazerDataPath);
  const suggestedTarget: DownloadTarget =
    hasStable && hasLazer ? 'both' : hasStable ? 'stable' : 'lazer';

  const portDefs: DetectedProxyPort[] = getCommonProxyPorts();
  if (!portDefs.some((p) => p.port === proxyPort)) {
    portDefs.unshift({ port: proxyPort, label: st(`当前端口 ${proxyPort}`, `Current Port ${proxyPort}`) });
  }

  const probeResults = await Promise.all(
    portDefs.map(async (item) => ({
      ...item,
      open: await probeTcpPort(proxyHost, item.port, 160),
    })),
  );

  const openProxyPorts: DetectedProxyPort[] = probeResults
    .filter((r) => r.open)
    .map(({ port, label }) => ({ port, label }));
  const currentProxyOpen = probeResults.some((r) => r.port === proxyPort && r.open);

  return {
    stablePath,
    stableCandidates,
    currentStableExists,
    lazerDataPath,
    lazerDataCandidates,
    currentLazerDataExists,
    lazerExePath,
    lazerExeCandidates,
    currentLazerExeExists,
    suggestedLazerImportDir,
    suggestedTarget,
    proxyHost,
    proxyPort,
    currentProxyOpen,
    openProxyPorts,
    hasGlobalIpv6: detectLocalGlobalIpv6(),
  };
}
