import fs from 'node:fs';
import path from 'node:path';
import { AppConfig } from './types.js';

export const DATA_DIR = process.env.OSU_DL_DATA_DIR
  ? path.resolve(process.env.OSU_DL_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');

function detectLazerExePath(): string {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\LLLH\\AppData\\Local';
  const candidates = [
    path.join(localAppData, 'osulazer', 'current', 'osu!.exe'),
    path.join(localAppData, 'osulazer', 'osu!.exe'),
    'C:\\Users\\LLLH\\AppData\\Local\\osulazer\\current\\osu!.exe',
    'D:\\OSU\\OSUlazer\\osu!.exe',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

export function getDefaultConfig(): AppConfig {
  return {
    stablePath: 'D:\\OSU',
    lazerDataPath: 'D:\\OSU\\OSUlazer\\osu-lazer',
    lazerExePath: detectLazerExePath(),
    lazerImportDir: 'D:\\OSU\\Downloads\\lazer-import',
    proxyMode: 'auto',
    proxyHost: '127.0.0.1',
    proxyPort: 6174,
    defaultTarget: 'lazer',
    defaultVariant: 'novideo',
    preferredSearchSource: 'auto',
    preferredDownloadSource: 'auto',
    concurrency: 3,
    autoImportWhenLazerRunning: true,
    stableInstallMode: 'extract',
    officialCookie: '',
    theme: 'dark',
  };
}

let cachedConfig: AppConfig | null = null;

function ensureDirs(cfg: AppConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'covers'), { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'previews'), { recursive: true });
  if (cfg.lazerImportDir) {
    try {
      fs.mkdirSync(cfg.lazerImportDir, { recursive: true });
    } catch {
      // Ignore if path is temporarily invalid
    }
  }
}

export function loadConfig(): AppConfig {
  const defaults = getDefaultConfig();
  ensureDirs(defaults);
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf8');
    cachedConfig = defaults;
    return cachedConfig;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    cachedConfig = {
      ...defaults,
      ...parsed,
      proxyPort: Number(parsed.proxyPort ?? defaults.proxyPort) || 6174,
      concurrency: Math.min(6, Math.max(1, Number(parsed.concurrency ?? defaults.concurrency) || 3)),
    };
  } catch {
    cachedConfig = defaults;
  }
  ensureDirs(cachedConfig);
  return cachedConfig;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const next: AppConfig = {
    ...current,
    ...patch,
    proxyPort: Math.min(65535, Math.max(1, Number(patch.proxyPort ?? current.proxyPort) || 6174)),
    concurrency: Math.min(6, Math.max(1, Number(patch.concurrency ?? current.concurrency) || 3)),
  };
  ensureDirs(next);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  cachedConfig = next;
  return next;
}
