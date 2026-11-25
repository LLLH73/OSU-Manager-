import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Disc3,
  FolderOpen,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { detectLocalEnvironment } from '../api';
import {
  DEFAULT_FONT_SCALE,
  FONT_SCALE_PRESETS,
  TARGET_META,
  THEME_OPTIONS,
  VARIANT_OPTIONS,
  VIEW_MODE_OPTIONS,
  clampFontScale,
} from '../constants';
import type {
  AppConfig,
  DetectedEnvironment,
  DownloadTarget,
  DownloadVariant,
  IpFamilyMode,
  PreferredMirror,
  ProxyMode,
  SongViewMode,
  StableInstallMode,
  ThemeId,
} from '../types';
import { SelectField } from './SelectField';
import { LaneEmblem } from './TitleBar';

interface OnboardingModalProps {
  open: boolean;
  version: string;
  config: AppConfig | null;
  theme: ThemeId;
  viewMode: SongViewMode;
  onPreviewTheme: (theme: ThemeId) => void;
  onPreviewAppearance: (patch: Partial<AppConfig> | null) => void;
  onSkip: () => void;
  onSaveAndFinish: (patch: Partial<AppConfig>, openSettingsAfter?: boolean) => Promise<void>;
}

interface WizardStepMeta {
  id: string;
  shortLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
}

const COMMON_PROXY_PRESETS: Array<{ port: number; label: string }> = [
  { port: 6174, label: '6174 默认' },
  { port: 7890, label: '7890 Clash' },
  { port: 7897, label: '7897 Verge' },
  { port: 10808, label: '10808 v2rayN' },
  { port: 10809, label: '10809 HTTP' },
  { port: 2080, label: '2080 Sing-box' },
];

const OVERLAY_HOTKEYS = ['Alt+Shift+O', 'Ctrl+Shift+O', 'Alt+O', 'F9', 'F10', 'F11'] as const;

function createFallbackConfig(theme: ThemeId, viewMode: SongViewMode): AppConfig {
  return {
    stablePath: 'D:\\OSU',
    lazerDataPath: 'D:\\OSU\\OSUlazer\\osu-lazer',
    lazerExePath: '',
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
    theme,
    viewMode,
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
    fontScale: DEFAULT_FONT_SCALE,
    ipFamily: 'auto',
    onboardingCompleted: false,
  };
}

function buildStepMeta(version: string): WizardStepMeta[] {
  return [
    {
      id: 'welcome',
      shortLabel: '欢迎',
      eyebrow: `WELCOME // v${version}`,
      title: '欢迎使用 OSU!Manager!',
      subtitle:
        '跨端 osu!mania 谱面管理、免登录下载、3D Book 档案库与本地音乐台工作台。不同电脑的安装目录和代理环境各有不同，接下来只需 1 分钟即可完成初始化配置。',
      icon: <LaneEmblem className="h-5 w-5 text-osu" />,
    },
    {
      id: 'paths',
      shortLabel: '客户端路径',
      eyebrow: 'STEP 02 // LOCAL CLIENTS',
      title: '配置本机 osu!stable & osu!lazer 路径',
      subtitle:
        '已自动扫描本机常见盘符与 Lazer storage.ini；若你的客户端安装在其他目录，可手动填写、点击候选路径或通过浏览选择。',
      icon: <HardDrive className="h-5 w-5 text-osu" />,
    },
    {
      id: 'network',
      shortLabel: '网络与端口',
      eyebrow: 'STEP 03 // PROXY & DOWNLOAD',
      title: '配置代理端口、IPv6 策略与下载偏好',
      subtitle:
        '国内镜像直连优先，海外源优先探测本地代理。不同软件（Clash / v2rayN / Sing-box 等）监听端口不同，支持一键扫描本机在线端口或切换纯直连。',
      icon: <Globe className="h-5 w-5 text-osu" />,
    },
    {
      id: 'appearance',
      shortLabel: '外观与浮窗',
      eyebrow: 'STEP 04 // THEME & OVERLAY',
      title: '选择界面主题、默认视图、字号与热键',
      subtitle:
        '所有外观选项均可在此处实时预览；若跳过向导，未保存的外观预览会自动还原。',
      icon: <Palette className="h-5 w-5 text-osu" />,
    },
    {
      id: 'features',
      shortLabel: '核心功能',
      eyebrow: 'STEP 05 // CORE WORKFLOWS',
      title: 'Lazer 选歌轮盘 · PP 筛选 · 双端同步 · 看谱',
      subtitle: '快速了解搜图下载与双端曲库管理的核心交互方式。',
      icon: <Compass className="h-5 w-5 text-osu" />,
    },
    {
      id: 'confirm',
      shortLabel: '档案与完成',
      eyebrow: 'STEP 06 // BOOK, AUDIO & FINISH',
      title: 'Book 档案库 · OSU! 音乐台 · 确认并保存',
      subtitle: '了解本地曲库衍生模式后，核对你的初始化配置并写入 config.json。',
      icon: <Disc3 className="h-5 w-5 text-osu" />,
    },
  ];
}

export function OnboardingModal({
  open,
  version,
  config,
  theme,
  viewMode,
  onPreviewTheme,
  onPreviewAppearance,
  onSkip,
  onSaveAndFinish,
}: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AppConfig>(() => createFallbackConfig(theme, viewMode));
  const [envInfo, setEnvInfo] = useState<DetectedEnvironment | null>(null);
  const [probingEnv, setProbingEnv] = useState(false);
  const [saving, setSaving] = useState(false);

  const prevOpenRef = useRef(false);
  const initialThemeRef = useRef<ThemeId>(theme);
  const probeEpochRef = useRef(0);

  const runEnvProbe = useCallback(async (sourceDraft: AppConfig) => {
    const epoch = ++probeEpochRef.current;
    setProbingEnv(true);
    try {
      const detected = await detectLocalEnvironment({
        stablePath: sourceDraft.stablePath,
        lazerDataPath: sourceDraft.lazerDataPath,
        lazerExePath: sourceDraft.lazerExePath,
        lazerImportDir: sourceDraft.lazerImportDir,
        proxyHost: sourceDraft.proxyHost,
        proxyPort: sourceDraft.proxyPort,
      });
      if (probeEpochRef.current === epoch) {
        setEnvInfo(detected);
      }
    } catch {
      // Non-fatal fallback if detection endpoint is temporarily unavailable
    } finally {
      if (probeEpochRef.current === epoch) {
        setProbingEnv(false);
      }
    }
  }, []);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    setStep(0);
    setSaving(false);
    initialThemeRef.current = theme;
    const initialDraft = config ? { ...config, theme, viewMode } : createFallbackConfig(theme, viewMode);
    setDraft(initialDraft);
    void runEnvProbe(initialDraft);
  }, [open, config, theme, viewMode, runEnvProbe]);

  const steps = buildStepMeta(version);
  const current = steps[step] ?? steps[0];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const isElectron = Boolean(window.electronAPI?.isElectron);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStep((prev) => Math.min(steps.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, steps.length]);

  if (!open) return null;

  const handleSkipClick = () => {
    onPreviewAppearance(null);
    onPreviewTheme(initialThemeRef.current);
    onSkip();
  };

  const handleApplyDetectedPaths = () => {
    if (!envInfo) return;
    const nextDraft: AppConfig = {
      ...draft,
      stablePath: envInfo.stablePath ?? draft.stablePath,
      lazerDataPath: envInfo.lazerDataPath ?? draft.lazerDataPath,
      lazerExePath: envInfo.lazerExePath ?? draft.lazerExePath,
      lazerImportDir: envInfo.suggestedLazerImportDir || draft.lazerImportDir,
      defaultTarget: envInfo.suggestedTarget,
    };
    setDraft(nextDraft);
    void runEnvProbe(nextDraft);
  };

  const browseDir = async (key: 'stablePath' | 'lazerDataPath' | 'lazerImportDir') => {
    const api = window.electronAPI;
    if (!api?.selectDirectory) return;
    const picked = await api.selectDirectory(draft[key] || undefined);
    if (picked == null) return;
    const nextDraft = { ...draft, [key]: picked };
    setDraft(nextDraft);
    void runEnvProbe(nextDraft);
  };

  const browseExe = async () => {
    const api = window.electronAPI;
    if (!api?.selectFile) return;
    const picked = await api.selectFile(draft.lazerExePath || undefined, [
      { name: 'osu!lazer', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ]);
    if (picked == null) return;
    const nextDraft = { ...draft, lazerExePath: picked };
    setDraft(nextDraft);
    void runEnvProbe(nextDraft);
  };

  const selectProxyPort = (port: number) => {
    const nextDraft: AppConfig = { ...draft, proxyPort: port };
    setDraft(nextDraft);
    void runEnvProbe(nextDraft);
  };

  const handleCommit = async (openSettingsAfter = false) => {
    setSaving(true);
    try {
      const normalizedPort = Math.min(65535, Math.max(1, Math.round(Number(draft.proxyPort) || 6174)));
      const normalizedConcurrency = Math.min(6, Math.max(1, Math.round(Number(draft.concurrency) || 3)));
      await onSaveAndFinish(
        {
          stablePath: draft.stablePath.trim(),
          lazerDataPath: draft.lazerDataPath.trim(),
          lazerExePath: draft.lazerExePath.trim(),
          lazerImportDir: draft.lazerImportDir.trim(),
          proxyMode: draft.proxyMode,
          proxyHost: draft.proxyHost.trim() || '127.0.0.1',
          proxyPort: normalizedPort,
          ipFamily: draft.ipFamily,
          defaultTarget: draft.defaultTarget,
          defaultVariant: draft.defaultVariant,
          preferredDownloadSource: draft.preferredDownloadSource,
          stableInstallMode: draft.stableInstallMode,
          concurrency: normalizedConcurrency,
          theme: draft.theme,
          viewMode: draft.viewMode,
          fontScale: clampFontScale(draft.fontScale, DEFAULT_FONT_SCALE),
          overlayHotkey: draft.overlayHotkey,
          autoImportWhenLazerRunning: draft.autoImportWhenLazerRunning,
          autoLoadWhenStableRunning: draft.autoLoadWhenStableRunning,
        },
        openSettingsAfter,
      );
    } finally {
      setSaving(false);
    }
  };

  const currentFontScale = clampFontScale(draft.fontScale, DEFAULT_FONT_SCALE);
  const canApplyDetectedPaths = Boolean(
    envInfo &&
      ((envInfo.stablePath && envInfo.stablePath !== draft.stablePath) ||
        (envInfo.lazerDataPath && envInfo.lazerDataPath !== draft.lazerDataPath) ||
        (envInfo.lazerExePath && envInfo.lazerExePath !== draft.lazerExePath) ||
        (envInfo.suggestedLazerImportDir && envInfo.suggestedLazerImportDir !== draft.lazerImportDir)),
  );

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={handleSkipClick}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="OSU!Manager! 新手引导"
        onClick={(e) => e.stopPropagation()}
        className="modal-surface animate-modal-in flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-surface-3">
              {current.icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[1.0625rem] font-bold text-ink">
                  OSU!Manager! 新手配置与引导
                </h2>
                <span className="font-mono rounded-full border border-osu/35 bg-osu/10 px-2 py-0.5 text-[0.6875rem] font-bold text-osu-soft tabular-nums">
                  v{version}
                </span>
              </div>
              <p className="font-mono text-[0.71875rem] font-medium tracking-[0.06em] text-ink-3 uppercase">
                {current.eyebrow} · {step + 1} / {steps.length}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkipClick}
            aria-label="关闭新手引导"
            className="btn btn-icon shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Clickable 6-Step Progress Bar */}
        <div className="grid grid-cols-6 gap-1.5 border-b border-hairline bg-surface-1/55 px-5 py-2.5">
          {steps.map((s, idx) => {
            const active = idx === step;
            const passed = idx < step;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(idx)}
                title={`${idx + 1}. ${s.shortLabel}`}
                aria-label={`跳至第 ${idx + 1} 步：${s.shortLabel}`}
                className="group flex flex-col gap-1 text-left focus:outline-none"
              >
                <span
                  className={`h-1.5 w-full rounded-full transition-colors ${
                    active
                      ? 'bg-osu'
                      : passed
                        ? 'bg-osu/45 group-hover:bg-osu/70'
                        : 'bg-hairline-strong group-hover:bg-ink-4'
                  }`}
                />
                <span
                  className={`truncate text-[0.6875rem] font-semibold transition-colors ${
                    active ? 'text-osu-soft' : 'text-ink-3 group-hover:text-ink-2'
                  }`}
                >
                  <span className="font-mono mr-1">0{idx + 1}</span>
                  <span className="hidden sm:inline">{s.shortLabel}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[0.84375rem]">
          <div className="space-y-1">
            <h3 className="font-display text-[1.125rem] font-bold tracking-tight text-ink">
              {current.title}
            </h3>
            <p className="leading-relaxed text-ink-2">{current.subtitle}</p>
          </div>

          {/* Step 1: Welcome */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                  {
                    label: '完全免登录',
                    detail: '无需账号或 Cookie，自动智能路由 7 大镜像站与本地代理端口。',
                  },
                  {
                    label: '双端本地识别',
                    detail: '同时支持 osu!stable 与 osu!lazer，自动适配不同盘符与数据路径。',
                  },
                  {
                    label: '8 主题 · 档案 · 音乐台',
                    detail: '离线 Lazer 字体、3D 书脊档案库及跟随主题切换的 OSU! 音乐台。',
                  },
                ].map((item, idx) => (
                  <div key={item.label} className="panel-flat space-y-1.5 p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-stat flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-[6px] border border-osu/35 bg-osu/10 text-[0.71875rem] font-bold text-osu-soft">
                        {idx + 1}
                      </span>
                      <span className="font-display text-[0.875rem] font-bold text-ink">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-[0.8125rem] leading-relaxed text-ink-2">{item.detail}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 rounded-[10px] border border-osu/25 bg-osu/8 px-3.5 py-2.5 text-[0.8125rem] font-medium text-ink-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-osu-soft" />
                <span>
                  本向导第 2–4 步可直接配置你的 <strong>Stable / Lazer 路径</strong>、<strong>本地代理端口</strong> 与{' '}
                  <strong>主题偏好</strong>；完成后可在「设置 → 关于与帮助」随时重新打开。
                </span>
              </div>
            </div>
          )}

          {/* Step 2: Client Paths */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-hairline bg-surface-2/60 px-3.5 py-2.5">
                <div className="text-[0.8125rem] font-medium text-ink-2">
                  {probingEnv ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-osu" />
                      <span>正在探测本机 osu! 客户端目录...</span>
                    </span>
                  ) : envInfo ? (
                    <span>
                      本机探测：Stable{' '}
                      <strong className={envInfo.stablePath ? 'text-ok' : 'text-ink-3'}>
                        {envInfo.stablePath ? '已发现' : '未发现'}
                      </strong>{' '}
                      · Lazer{' '}
                      <strong className={envInfo.lazerDataPath ? 'text-ok' : 'text-ink-3'}>
                        {envInfo.lazerDataPath ? '已发现' : '未发现'}
                      </strong>
                    </span>
                  ) : (
                    <span>可填写或浏览本地 osu! 安装路径</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {canApplyDetectedPaths && (
                    <button
                      type="button"
                      onClick={handleApplyDetectedPaths}
                      className="btn btn-sm border-emerald-500/40 bg-emerald-500/12 text-ok hover:bg-emerald-500/20"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>一键填入探测路径</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={probingEnv}
                    onClick={() => void runEnvProbe(draft)}
                    className="btn btn-sm"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${probingEnv ? 'animate-spin' : ''}`} />
                    <span>重新探测本机环境</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Stable Path */}
                <div className="panel-flat space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="onb-stable-path" className="field-label">
                      osu!stable 根目录
                    </label>
                    <span
                      className={`chip font-mono text-[0.6875rem] ${
                        envInfo?.currentStableExists
                          ? 'border-emerald-500/35 bg-emerald-500/12 text-ok'
                          : 'border-hairline bg-surface-1 text-ink-3'
                      }`}
                    >
                      {envInfo?.currentStableExists ? '✓ 已检测到 Songs' : '未找到（可选）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="onb-stable-path"
                      type="text"
                      value={draft.stablePath}
                      onChange={(e) => setDraft({ ...draft, stablePath: e.target.value })}
                      onBlur={() => void runEnvProbe(draft)}
                      placeholder="例如 D:\OSU 或 C:\osu!"
                      spellCheck={false}
                      className="field font-mono text-[0.8125rem]"
                    />
                    {isElectron && (
                      <button
                        type="button"
                        onClick={() => void browseDir('stablePath')}
                        className="btn shrink-0 px-2.5"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>浏览</span>
                      </button>
                    )}
                  </div>
                  {envInfo && envInfo.stableCandidates.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {envInfo.stableCandidates.map((cand) => (
                        <button
                          key={cand}
                          type="button"
                          onClick={() => {
                            const next = { ...draft, stablePath: cand };
                            setDraft(next);
                            void runEnvProbe(next);
                          }}
                          className={`font-mono rounded-[6px] border px-1.5 py-0.5 text-[0.6875rem] transition-colors ${
                            draft.stablePath.toLowerCase() === cand.toLowerCase()
                              ? 'border-osu/50 bg-osu/12 text-osu-soft'
                              : 'border-hairline bg-surface-1 text-ink-3 hover:text-ink'
                          }`}
                        >
                          {cand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lazer Data Path */}
                <div className="panel-flat space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="onb-lazer-data" className="field-label">
                      osu!lazer 数据目录
                    </label>
                    <span
                      className={`chip font-mono text-[0.6875rem] ${
                        envInfo?.currentLazerDataExists
                          ? 'border-emerald-500/35 bg-emerald-500/12 text-ok'
                          : 'border-hairline bg-surface-1 text-ink-3'
                      }`}
                    >
                      {envInfo?.currentLazerDataExists ? '✓ 已检测到 client.realm' : '未找到（可选）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="onb-lazer-data"
                      type="text"
                      value={draft.lazerDataPath}
                      onChange={(e) => setDraft({ ...draft, lazerDataPath: e.target.value })}
                      onBlur={() => void runEnvProbe(draft)}
                      placeholder="例如 %APPDATA%\osu 或 D:\OSU\OSUlazer\osu-lazer"
                      spellCheck={false}
                      className="field font-mono text-[0.8125rem]"
                    />
                    {isElectron && (
                      <button
                        type="button"
                        onClick={() => void browseDir('lazerDataPath')}
                        className="btn shrink-0 px-2.5"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>浏览</span>
                      </button>
                    )}
                  </div>
                  {envInfo && envInfo.lazerDataCandidates.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {envInfo.lazerDataCandidates.map((cand) => (
                        <button
                          key={cand}
                          type="button"
                          onClick={() => {
                            const next = { ...draft, lazerDataPath: cand };
                            setDraft(next);
                            void runEnvProbe(next);
                          }}
                          className={`font-mono max-w-full truncate rounded-[6px] border px-1.5 py-0.5 text-[0.6875rem] transition-colors ${
                            draft.lazerDataPath.toLowerCase() === cand.toLowerCase()
                              ? 'border-osu/50 bg-osu/12 text-osu-soft'
                              : 'border-hairline bg-surface-1 text-ink-3 hover:text-ink'
                          }`}
                          title={cand}
                        >
                          {cand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lazer Exe Path */}
                <div className="panel-flat space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="onb-lazer-exe" className="field-label">
                      osu!lazer 可执行文件
                    </label>
                    <span
                      className={`chip font-mono text-[0.6875rem] ${
                        envInfo?.currentLazerExeExists
                          ? 'border-emerald-500/35 bg-emerald-500/12 text-ok'
                          : 'border-hairline bg-surface-1 text-ink-3'
                      }`}
                    >
                      {envInfo?.currentLazerExeExists ? '✓ 文件存在' : '未找到（可选）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="onb-lazer-exe"
                      type="text"
                      value={draft.lazerExePath}
                      onChange={(e) => setDraft({ ...draft, lazerExePath: e.target.value })}
                      onBlur={() => void runEnvProbe(draft)}
                      placeholder="例如 C:\Users\...\AppData\Local\osulazer\current\osu!.exe"
                      spellCheck={false}
                      className="field font-mono text-[0.8125rem]"
                    />
                    {isElectron && (
                      <button
                        type="button"
                        onClick={() => void browseExe()}
                        className="btn shrink-0 px-2.5"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>浏览</span>
                      </button>
                    )}
                  </div>
                  {envInfo && envInfo.lazerExeCandidates.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {envInfo.lazerExeCandidates.map((cand) => (
                        <button
                          key={cand}
                          type="button"
                          onClick={() => {
                            const next = { ...draft, lazerExePath: cand };
                            setDraft(next);
                            void runEnvProbe(next);
                          }}
                          className={`font-mono max-w-full truncate rounded-[6px] border px-1.5 py-0.5 text-[0.6875rem] transition-colors ${
                            draft.lazerExePath.toLowerCase() === cand.toLowerCase()
                              ? 'border-osu/50 bg-osu/12 text-osu-soft'
                              : 'border-hairline bg-surface-1 text-ink-3 hover:text-ink'
                          }`}
                          title={cand}
                        >
                          {cand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lazer Import Dir */}
                <div className="panel-flat space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="onb-lazer-import" className="field-label">
                      Lazer 待导入 .osz 暂存目录
                    </label>
                    <span className="chip font-mono border-hairline bg-surface-1 text-[0.6875rem] text-ink-3">
                      自动创建
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="onb-lazer-import"
                      type="text"
                      value={draft.lazerImportDir}
                      onChange={(e) => setDraft({ ...draft, lazerImportDir: e.target.value })}
                      placeholder="用于 Lazer 未运行时暂存待导入 .osz"
                      spellCheck={false}
                      className="field font-mono text-[0.8125rem]"
                    />
                    {isElectron && (
                      <button
                        type="button"
                        onClick={() => void browseDir('lazerImportDir')}
                        className="btn shrink-0 px-2.5"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>浏览</span>
                      </button>
                    )}
                  </div>
                  {envInfo?.suggestedLazerImportDir &&
                    envInfo.suggestedLazerImportDir !== draft.lazerImportDir && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, lazerImportDir: envInfo.suggestedLazerImportDir })
                        }
                        className="font-mono mt-0.5 max-w-full truncate rounded-[6px] border border-hairline bg-surface-1 px-1.5 py-0.5 text-[0.6875rem] text-ink-3 hover:text-ink"
                      >
                        推荐：{envInfo.suggestedLazerImportDir}
                      </button>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Proxy Port, IPv6 & Download Preferences */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Proxy Strategy */}
              <div className="panel-flat space-y-3 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="field-label font-semibold text-ink">代理模式与本地端口</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`chip font-mono ${
                        envInfo?.currentProxyOpen
                          ? 'border-emerald-500/35 bg-emerald-500/12 text-ok'
                          : 'border-hairline bg-surface-1 text-ink-3'
                      }`}
                    >
                      {envInfo?.currentProxyOpen ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="live-dot" /> 端口 :{draft.proxyPort} 在线
                        </span>
                      ) : (
                        `端口 :${draft.proxyPort} 未监听`
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={probingEnv}
                      onClick={() => void runEnvProbe(draft)}
                      className="btn btn-sm"
                    >
                      <Wifi className={`h-3.5 w-3.5 ${probingEnv ? 'animate-pulse text-warn' : ''}`} />
                      <span>检测端口</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {(
                    [
                      { id: 'auto', label: '自动智能路由 (推荐)', desc: '国内源直连 · 海外源走代理' },
                      { id: 'proxy', label: '强制全部走代理', desc: '全部请求经由下方代理端口' },
                      { id: 'direct', label: '强制纯直连', desc: '不使用本地代理端口' },
                    ] as Array<{ id: ProxyMode; label: string; desc: string }>
                  ).map((opt) => {
                    const active = draft.proxyMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, proxyMode: opt.id })}
                        className={`rounded-[9px] border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? 'border-osu/55 bg-osu/10 text-ink'
                            : 'border-hairline bg-surface-1/70 text-ink-2 hover:border-hairline-strong hover:text-ink'
                        }`}
                      >
                        <div className="text-[0.8125rem] font-bold">{opt.label}</div>
                        <div className="text-[0.71875rem] text-ink-3">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">代理主机 (Host)</span>
                    <input
                      type="text"
                      value={draft.proxyHost}
                      onChange={(e) => setDraft({ ...draft, proxyHost: e.target.value })}
                      onBlur={() => void runEnvProbe(draft)}
                      spellCheck={false}
                      className="field font-mono text-[0.8125rem]"
                    />
                  </label>

                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">代理端口 (Port)</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={draft.proxyPort}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          proxyPort: Number(e.target.value) || 6174,
                        })
                      }
                      onBlur={() => void runEnvProbe(draft)}
                      className="field font-mono text-[0.8125rem] tabular-nums"
                    />
                  </label>
                </div>

                {/* Open local proxy ports detected on this PC */}
                <div className="space-y-1.5 border-t border-hairline pt-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem]">
                    <span className="font-semibold text-ink-2">本机已探测到开放端口：</span>
                    {envInfo && envInfo.openProxyPorts.length > 0 ? (
                      envInfo.openProxyPorts.map((item) => {
                        const active = Number(draft.proxyPort) === item.port;
                        return (
                          <button
                            key={item.port}
                            type="button"
                            onClick={() => selectProxyPort(item.port)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.71875rem] font-semibold transition-colors ${
                              active
                                ? 'border-emerald-500/60 bg-emerald-500/18 text-ok'
                                : 'border-emerald-500/35 bg-emerald-500/10 text-ok hover:bg-emerald-500/18'
                            }`}
                          >
                            <span className="live-dot" />
                            <span>
                              :{item.port} ({item.label})
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <span className="text-ink-3">暂未检测到常见代理端口（若使用国内镜像可选择纯直连或自动）</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem]">
                    <span className="font-medium text-ink-3">常见端口快填：</span>
                    {COMMON_PROXY_PRESETS.map((preset) => {
                      const active = Number(draft.proxyPort) === preset.port;
                      return (
                        <button
                          key={preset.port}
                          type="button"
                          onClick={() => selectProxyPort(preset.port)}
                          className={`font-mono rounded-[6px] border px-2 py-0.5 text-[0.6875rem] font-semibold transition-colors ${
                            active
                              ? 'border-osu/50 bg-osu/12 text-osu-soft'
                              : 'border-hairline bg-surface-1 text-ink-2 hover:border-hairline-strong hover:text-ink'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Network Protocol & Download Preferences */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="field-label">网络协议 (IPv6)</span>
                    {envInfo && (
                      <span
                        className={`font-mono text-[0.6875rem] font-semibold ${
                          envInfo.hasGlobalIpv6 ? 'text-ok' : 'text-ink-3'
                        }`}
                      >
                        {envInfo.hasGlobalIpv6 ? 'IPv6 已就绪' : '仅 IPv4'}
                      </span>
                    )}
                  </div>
                  <SelectField
                    value={draft.ipFamily || 'auto'}
                    onChange={(val) => setDraft({ ...draft, ipFamily: val as IpFamilyMode })}
                  >
                    <option value="auto">自动双栈 (Happy Eyeballs)</option>
                    <option value="ipv6_first">IPv6 优先 (直连加速)</option>
                    <option value="ipv6_only">强制仅 IPv6</option>
                    <option value="ipv4_first">IPv4 优先</option>
                    <option value="ipv4_only">强制仅 IPv4</option>
                  </SelectField>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="field-label">默认下载目标</span>
                  <SelectField
                    value={draft.defaultTarget}
                    onChange={(val) => setDraft({ ...draft, defaultTarget: val as DownloadTarget })}
                  >
                    <option value="lazer">osu!lazer</option>
                    <option value="stable">osu!stable</option>
                    <option value="both">双端同时安装</option>
                  </SelectField>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="field-label">默认包体格式</span>
                  <SelectField
                    value={draft.defaultVariant}
                    onChange={(val) => setDraft({ ...draft, defaultVariant: val as DownloadVariant })}
                  >
                    <option value="novideo">无视频 (No Video · 推荐)</option>
                    <option value="full">完整版 (含视频)</option>
                    <option value="mini">精简 Mini 版</option>
                  </SelectField>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="field-label">首选下载镜像</span>
                  <SelectField
                    value={draft.preferredDownloadSource}
                    onChange={(val) =>
                      setDraft({ ...draft, preferredDownloadSource: val as PreferredMirror })
                    }
                  >
                    <option value="auto">自动选择最快镜像 (推荐)</option>
                    <option value="sayobot-auto">小夜镜像 · 自动</option>
                    <option value="sayobot-txy">小夜镜像 · 腾讯云</option>
                    <option value="nekoha">Nekoha 镜像</option>
                    <option value="osudirect">osu.direct 镜像</option>
                    <option value="beatconnect">BeatConnect 镜像</option>
                    <option value="nerinyan">Nerinyan 镜像</option>
                  </SelectField>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="field-label">Stable 安装方式</span>
                  <SelectField
                    value={draft.stableInstallMode}
                    onChange={(val) =>
                      setDraft({ ...draft, stableInstallMode: val as StableInstallMode })
                    }
                  >
                    <option value="extract">直接解压到 Songs (推荐)</option>
                    <option value="drop_osz">保留 .osz 到 Songs</option>
                  </SelectField>
                </div>

                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="field-label">并发下载线程 (1–6)</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={draft.concurrency}
                    onChange={(e) => setDraft({ ...draft, concurrency: Number(e.target.value) || 3 })}
                    className="field font-mono text-[0.8125rem] tabular-nums"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Step 4: Appearance, Default View, Font Scale & Hotkey */}
          {step === 3 && (
            <div className="space-y-3">
              {/* 8 Theme Swatches */}
              <div className="panel-flat space-y-2 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="field-label font-semibold text-ink">选择界面主题（实时预览）</span>
                  <span className="text-[0.75rem] text-ink-3">共 4 套浅色 + 4 套暗色</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {THEME_OPTIONS.map((opt) => {
                    const active = draft.theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDraft({ ...draft, theme: opt.id });
                          onPreviewTheme(opt.id);
                        }}
                        className={`flex items-center gap-2 rounded-[9px] border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? 'border-osu/60 bg-surface-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_35%,transparent)]'
                            : 'border-hairline bg-surface-1/75 hover:border-hairline-strong hover:bg-surface-2'
                        }`}
                      >
                        <span
                          className="h-4.5 w-4.5 shrink-0 rounded-full border border-black/20"
                          style={{
                            backgroundColor: opt.swatchBg,
                            boxShadow: active ? `0 0 0 2px ${opt.swatchRing}` : undefined,
                          }}
                        />
                        <div className="min-w-0">
                          <div className="font-display truncate text-[0.8125rem] font-bold text-ink">
                            {opt.label}
                          </div>
                          <div className="truncate text-[0.6875rem] text-ink-3">
                            {opt.isDark ? '暗色' : '浅色'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Default View Mode */}
                <div className="panel-flat space-y-2 p-3.5">
                  <span className="field-label font-semibold text-ink">默认搜图视图</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {VIEW_MODE_OPTIONS.map((opt) => {
                      const active = draft.viewMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDraft({ ...draft, viewMode: opt.id })}
                          className={`rounded-[8px] border px-2 py-2 text-center text-[0.8125rem] font-bold transition-colors ${
                            active
                              ? 'border-osu/55 bg-osu/12 text-osu-soft'
                              : 'border-hairline bg-surface-1 text-ink-2 hover:text-ink'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Scale Presets */}
                <div className="panel-flat space-y-2 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="field-label font-semibold text-ink">界面字体缩放</span>
                    <span className="font-mono text-[0.75rem] font-bold text-osu-soft tabular-nums">
                      {Math.round(currentFontScale * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {FONT_SCALE_PRESETS.map((preset) => {
                      const active = Math.abs(currentFontScale - preset.value) < 0.015;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setDraft({ ...draft, fontScale: preset.value });
                            onPreviewAppearance({ fontScale: preset.value });
                          }}
                          className={`rounded-[8px] border px-1.5 py-2 text-center text-[0.75rem] font-semibold transition-colors ${
                            active
                              ? 'border-osu/55 bg-osu/12 text-osu-soft'
                              : 'border-hairline bg-surface-1 text-ink-2 hover:text-ink'
                          }`}
                        >
                          {Math.round(preset.value * 100)}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Overlay Hotkey + Auto-import Flags */}
              <div className="panel-flat space-y-2.5 p-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">游戏内磨砂浮窗热键 (无边框游戏适用)</span>
                    <SelectField
                      value={draft.overlayHotkey}
                      onChange={(val) => setDraft({ ...draft, overlayHotkey: val })}
                    >
                      {OVERLAY_HOTKEYS.map((hk) => (
                        <option key={hk} value={hk}>
                          {hk}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div className="flex flex-col justify-end text-[0.78125rem] text-ink-3">
                    <span>游戏中按此热键即可随时在桌面上方呼出悬浮搜图窗口，直接向客户端发图。</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-hairline bg-surface-1/75 px-3 py-2 text-[0.78125rem] font-medium text-ink-2">
                    <input
                      type="checkbox"
                      checked={draft.autoImportWhenLazerRunning}
                      onChange={(e) =>
                        setDraft({ ...draft, autoImportWhenLazerRunning: e.target.checked })
                      }
                      className="check check-lazer"
                    />
                    <span>Lazer 运行时下载后自动导入</span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-hairline bg-surface-1/75 px-3 py-2 text-[0.78125rem] font-medium text-ink-2">
                    <input
                      type="checkbox"
                      checked={draft.autoLoadWhenStableRunning}
                      onChange={(e) =>
                        setDraft({ ...draft, autoLoadWhenStableRunning: e.target.checked })
                      }
                      className="check"
                    />
                    <span>Stable 运行时下载后自动加载</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Core Features Digest */}
          {step === 4 && (
            <div className="space-y-2.5">
              {[
                {
                  label: 'Lazer 选歌轮盘 · 情景 PP 筛选 · Filter 存档',
                  detail:
                    '使用光谱星数双滑块（0–15★ / ∞）与情景化 PP 双滑块（NM / DT / HT / 变速 / 自定义），支持右侧「存档」保存筛选条件与当前浏览定位、极速 1–500 首跨页批量下载。',
                },
                {
                  label: '双端金色框体 · 零流量比对同步 · 客户端启动',
                  detail:
                    '已安装的谱面在各视图均以四边金色框体标出；支持在左侧栏「双端曲库比对同步」中直接将 Stable 谱面零流量导入 Lazer，并可一键拉起运行或未运行的客户端。',
                },
                {
                  label: 'Mania 谱面实景看谱器',
                  detail:
                    '点击已装或已下载谱面的「预览谱面」，即可加载本地皮肤（含 PerCy 超长 LN 裁切）、调流速与倍速、切换上下落，并通过 NPS 密度条快速跳转任意段落。',
                },
              ].map((item, idx) => (
                <div key={item.label} className="panel-flat flex items-start gap-3 p-3.5">
                  <span className="font-stat mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-osu/35 bg-osu/10 text-[0.75rem] font-bold text-osu-soft">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-display text-[0.875rem] font-bold text-ink">{item.label}</div>
                    <p className="text-[0.8125rem] leading-relaxed text-ink-2">{item.detail}</p>
                  </div>
                </div>
              ))}

              <div className="flex items-start gap-2.5 rounded-[10px] border border-osu/25 bg-osu/8 px-3.5 py-2.5 text-[0.8125rem] font-medium text-ink-2">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-osu-soft" />
                <span>
                  Lazer 选歌快捷键：<strong>↑ / ↓</strong> 切歌 · <strong>← / →</strong> 切难度 ·{' '}
                  <strong>Space</strong> 试听 · <strong>Enter</strong> 查看详情与 PP 计算器。
                </span>
              </div>
            </div>
          )}

          {/* Step 6: Book + Music Station + Config Summary */}
          {step === 5 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="panel-flat space-y-1 p-3.5">
                  <div className="font-display text-[0.875rem] font-bold text-ink">
                    Book 本地曲库档案库
                  </div>
                  <p className="text-[0.8125rem] leading-relaxed text-ink-2">
                    聚合 Stable 与 Lazer 全部曲目与游玩成绩，提供 Three.js 3D 书脊档案架与无字平铺毛玻璃双视图。
                  </p>
                </div>

                <div className="panel-flat space-y-1 p-3.5">
                  <div className="font-display text-[0.875rem] font-bold text-ink">
                    OSU! AUDIO // 本地音乐台
                  </div>
                  <p className="text-[0.8125rem] leading-relaxed text-ink-2">
                    支持画幅/唱盘双舞台、.osu 节拍跟随、频谱/示波、主题同步专注画报、歌单与迷你条/托盘后台纯播放。
                  </p>
                </div>
              </div>

              {/* Config Confirmation Summary */}
              <div className="panel-flat space-y-2 border-osu/25 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[0.875rem] font-bold text-ink">
                    即将应用的初始化配置摘要
                  </span>
                  <span className="font-mono text-[0.71875rem] text-ink-3">可在设置中随时修改</span>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[0.78125rem] sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2 border-b border-hairline/70 py-1">
                    <span className="text-ink-3">Stable 路径</span>
                    <span className="font-mono max-w-[210px] truncate font-semibold text-ink" title={draft.stablePath}>
                      {draft.stablePath || '未设置'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-hairline/70 py-1">
                    <span className="text-ink-3">Lazer 数据目录</span>
                    <span className="font-mono max-w-[210px] truncate font-semibold text-ink" title={draft.lazerDataPath}>
                      {draft.lazerDataPath || '未设置'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-hairline/70 py-1">
                    <span className="text-ink-3">代理策略与端口</span>
                    <span className="font-mono font-semibold text-ink">
                      {draft.proxyMode} · {draft.proxyHost}:{draft.proxyPort}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-hairline/70 py-1">
                    <span className="text-ink-3">下载目标与格式</span>
                    <span className="font-semibold text-ink">
                      {TARGET_META[draft.defaultTarget].label} ·{' '}
                      {VARIANT_OPTIONS.find((v) => v.value === draft.defaultVariant)?.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-ink-3">主题与字号</span>
                    <span className="font-semibold text-ink">
                      {THEME_OPTIONS.find((t) => t.id === draft.theme)?.label ?? draft.theme} ·{' '}
                      {Math.round(currentFontScale * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-ink-3">浮窗热键</span>
                    <span className="font-mono font-semibold text-ink">{draft.overlayHotkey}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-[10px] border border-osu/25 bg-osu/8 px-3.5 py-2.5 text-[0.8125rem] font-medium text-ink-2">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-osu-soft" />
                <span>
                  点击下方「保存配置并开始使用」将立即写入配置并自动测试镜像延迟与刷新本地曲库；之后可在{' '}
                  <strong>设置 → 关于与帮助</strong> 重新观看此引导。
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface-1/75 px-5 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={handleSkipClick}
            className="btn btn-sm text-ink-3 hover:text-ink"
          >
            跳过引导
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="btn"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>上一步</span>
              </button>
            )}

            {isLast ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleCommit(true)}
                  className="btn"
                >
                  <Settings className="h-3.5 w-3.5 text-osu-soft" />
                  <span>保存并打开完整设置</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleCommit(false)}
                  className="btn btn-primary px-4"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>{saving ? '保存中...' : '保存配置并开始使用'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                className="btn btn-primary px-4"
              >
                <span>下一步</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
