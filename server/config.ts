import fs from 'node:fs';
import path from 'node:path';
import { AppConfig, IpFamilyMode, SongViewMode, ThemeId, UiLanguage } from './types.js';

export const DATA_DIR = process.env.OSU_DL_DATA_DIR
  ? path.resolve(process.env.OSU_DL_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const PREVIEW_OSZ_CACHE_DIR = path.join(CACHE_DIR, 'osz');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');

function normalizeViewMode(val: unknown): SongViewMode {
  return val === 'grid' || val === 'list' || val === 'lazer' ? val : 'lazer';
}

const VALID_THEME_IDS: ReadonlySet<string> = new Set([
  'dark',
  'stone',
  'midnight',
  'forest',
  'light',
  'paper',
  'latte',
  'sakura',
]);

function normalizeTheme(val: unknown): ThemeId {
  return typeof val === 'string' && VALID_THEME_IDS.has(val) ? (val as ThemeId) : 'light';
}

function clampBgOpacity(val: unknown, fallback = 0.75): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.04, Math.round(n * 100) / 100));
}

function clampFontScale(val: unknown, fallback = 1.2): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1.25, Math.max(0.85, Math.round(n * 100) / 100));
}

const VALID_IP_FAMILIES: ReadonlySet<string> = new Set([
  'auto',
  'ipv6_first',
  'ipv4_first',
  'ipv6_only',
  'ipv4_only',
]);

function normalizeIpFamily(val: unknown): IpFamilyMode {
  return typeof val === 'string' && VALID_IP_FAMILIES.has(val) ? (val as IpFamilyMode) : 'auto';
}

function normalizeLanguage(val: unknown): UiLanguage {
  return val === 'en' ? 'en' : 'zh';
}

function normalizeAccentColor(val: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : '';
}

function clampOverlayOpacity(val: unknown, fallback = 0.94): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.55, Math.round(n * 100) / 100));
}

function clampScrollSpeed(val: unknown, fallback = 28): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(40, Math.max(1, Math.round(n)));
}

export function detectLazerExePath(): string {
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
    theme: 'light',
    viewMode: 'lazer',
    autoLoadWhenStableRunning: true,
    overlayHotkey: 'Alt+Shift+O',
    overlayOpacity: 0.94,
    previewSkinId: '',
    previewScrollSpeed: 28,
    customBgImage: '',
    customBgOpacity: 0.75,
    dynamicBgFromSong: true,
    dynamicThemeFromBg: true,
    accentColor: '',
    fontScale: 1.2,
    ipFamily: 'auto',
    language: 'zh',
    onboardingCompleted: false,
  };
}

let cachedConfig: AppConfig | null = null;

function ensureDirs(cfg: AppConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'covers'), { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'previews'), { recursive: true });
  fs.mkdirSync(PREVIEW_OSZ_CACHE_DIR, { recursive: true });
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
      theme: normalizeTheme(parsed.theme),
      viewMode: normalizeViewMode(parsed.viewMode),
      autoLoadWhenStableRunning: parsed.autoLoadWhenStableRunning ?? defaults.autoLoadWhenStableRunning,
      overlayHotkey:
        typeof parsed.overlayHotkey === 'string' && parsed.overlayHotkey.trim()
          ? parsed.overlayHotkey.trim()
          : defaults.overlayHotkey,
      overlayOpacity: clampOverlayOpacity(parsed.overlayOpacity, defaults.overlayOpacity),
      previewSkinId:
        typeof parsed.previewSkinId === 'string' ? parsed.previewSkinId : defaults.previewSkinId,
      previewScrollSpeed: clampScrollSpeed(parsed.previewScrollSpeed, defaults.previewScrollSpeed),
      customBgImage:
        typeof parsed.customBgImage === 'string' ? parsed.customBgImage : defaults.customBgImage,
      customBgOpacity: clampBgOpacity(parsed.customBgOpacity, defaults.customBgOpacity),
      dynamicBgFromSong:
        typeof parsed.dynamicBgFromSong === 'boolean'
          ? parsed.dynamicBgFromSong
          : defaults.dynamicBgFromSong,
      dynamicThemeFromBg:
        typeof parsed.dynamicThemeFromBg === 'boolean'
          ? parsed.dynamicThemeFromBg
          : defaults.dynamicThemeFromBg,
      accentColor: normalizeAccentColor(parsed.accentColor),
      fontScale: clampFontScale(parsed.fontScale, defaults.fontScale),
      ipFamily: normalizeIpFamily(parsed.ipFamily),
      language: normalizeLanguage(parsed.language),
      onboardingCompleted:
        typeof parsed.onboardingCompleted === 'boolean'
          ? parsed.onboardingCompleted
          : defaults.onboardingCompleted,
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
    theme: normalizeTheme(patch.theme ?? current.theme),
    viewMode: normalizeViewMode(patch.viewMode ?? current.viewMode),
    overlayHotkey:
      typeof (patch.overlayHotkey ?? current.overlayHotkey) === 'string' &&
      (patch.overlayHotkey ?? current.overlayHotkey).trim()
        ? (patch.overlayHotkey ?? current.overlayHotkey).trim()
        : 'Alt+Shift+O',
    overlayOpacity: clampOverlayOpacity(patch.overlayOpacity, current.overlayOpacity),
    previewScrollSpeed: clampScrollSpeed(patch.previewScrollSpeed, current.previewScrollSpeed),
    customBgImage:
      typeof (patch.customBgImage ?? current.customBgImage) === 'string'
        ? (patch.customBgImage ?? current.customBgImage)
        : '',
    customBgOpacity: clampBgOpacity(patch.customBgOpacity, current.customBgOpacity),
    dynamicBgFromSong: Boolean(patch.dynamicBgFromSong ?? current.dynamicBgFromSong),
    dynamicThemeFromBg: Boolean(patch.dynamicThemeFromBg ?? current.dynamicThemeFromBg),
    accentColor: normalizeAccentColor(patch.accentColor ?? current.accentColor),
    fontScale: clampFontScale(patch.fontScale, current.fontScale),
    ipFamily: normalizeIpFamily(patch.ipFamily ?? current.ipFamily),
    language: normalizeLanguage(patch.language ?? current.language),
    onboardingCompleted: Boolean(patch.onboardingCompleted ?? current.onboardingCompleted),
  };
  ensureDirs(next);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  cachedConfig = next;
  return next;
}
