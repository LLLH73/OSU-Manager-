import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  Activity,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  ImagePlus,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  APP_VERSION,
  DEFAULT_FONT_SCALE,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  PROJECT_REPO_URL,
  clampFontScale,
  getAccentPresets,
  getFontScalePresets,
  getThemeOptions,
  openExternalLink,
} from '../constants';
import { useI18n } from '../i18n';
import {
  AppConfig,
  DownloadTarget,
  DownloadVariant,
  IpFamilyMode,
  MirrorHealth,
  NetworkStatus,
  PreferredMirror,
  ProxyMode,
  SearchSource,
  StableInstallMode,
  ThemeId,
  UiLanguage,
} from '../types';
import { SelectField } from './SelectField';
import { LaneEmblem } from './TitleBar';

interface SettingsModalProps {
  open: boolean;
  config: AppConfig | null;
  network: NetworkStatus | null;
  theme: ThemeId;
  activeExtractedColor?: string | null;
  onChangeTheme: (t: ThemeId) => void;
  onPreviewAppearance?: (patch: Partial<AppConfig> | null) => void;
  onUploadBackground?: (payload: {
    filePath?: string;
    dataUrl?: string;
    url?: string;
  }) => Promise<AppConfig>;
  onClearBackground?: () => Promise<AppConfig>;
  onReplayOnboarding?: () => void;
  onClose: () => void;
  onSave: (patch: Partial<AppConfig>) => Promise<void>;
  onBenchmark: () => void;
}

type DirKey = 'stablePath' | 'lazerDataPath' | 'lazerImportDir';

const REGION_CHIP: Record<MirrorHealth['region'], string> = {
  CN: 'border-emerald-500/35 bg-emerald-500/12 text-ok',
  GLOBAL: 'border-stable/35 bg-stable/12 text-stable-soft',
  OFFICIAL: 'border-osu/35 bg-osu/12 text-osu-soft',
};

function latencyTone(ms: number): { bar: string; text: string } {
  if (ms < 300) return { bar: 'bg-emerald-500', text: 'text-ok' };
  if (ms < 1000) return { bar: 'bg-amber-500', text: 'text-warn' };
  return { bar: 'bg-rose-500', text: 'text-bad' };
}

function Section({
  index,
  title,
  hint,
  icon,
  action,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-flat space-y-3.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-stat flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-[6px] border border-hairline bg-surface-2 text-[0.75rem] font-bold text-osu-soft">
            {index}
          </span>
          {icon}
          <h3 className="font-display text-[0.875rem] font-bold text-ink">{title}</h3>
          {hint && <span className="truncate text-[0.75rem] font-medium text-ink-3">{hint}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingsModal({
  open,
  config,
  network,
  theme,
  activeExtractedColor = null,
  onChangeTheme,
  onPreviewAppearance,
  onUploadBackground,
  onClearBackground,
  onReplayOnboarding,
  onClose,
  onSave,
  onBenchmark,
}: SettingsModalProps) {
  const { lang, isEn, setLang, t } = useI18n();
  const [form, setForm] = useState<AppConfig | null>(config);
  const [saving, setSaving] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [bgUrlDraft, setBgUrlDraft] = useState('');
  const [copiedRepo, setCopiedRepo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevOpenRef = useRef(false);
  const initialLangRef = useRef<UiLanguage>(lang);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (justOpened) {
      initialLangRef.current = lang;
    }
    if (open && config) {
      setForm((prev) => ({
        ...config,
        theme,
        language: justOpened ? lang : (prev?.language ?? config.language ?? lang),
      }));
      setBgError(null);
      setCopiedRepo(false);
      setBgUrlDraft(
        config.customBgImage && /^https?:\/\//i.test(config.customBgImage)
          ? config.customBgImage
          : '',
      );
    }
  }, [open, config]);

  if (!open || !form) return null;

  const isElectron = !!window.electronAPI?.isElectron;
  const themeOptions = getThemeOptions(lang);
  const fontScalePresets = getFontScalePresets(lang);
  const accentPresets = getAccentPresets(lang);
  const currentFontScale = clampFontScale(form.fontScale, DEFAULT_FONT_SCALE);
  const currentBgOpacity = form.customBgOpacity ?? 0.75;

  const handleCloseCancel = () => {
    setLang(initialLangRef.current);
    onPreviewAppearance?.(null);
    onClose();
  };

  const updateAppearance = (patch: Partial<AppConfig>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    onPreviewAppearance?.(patch);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const nextLanguage: UiLanguage = form.language || lang;
      await onSave({ ...form, theme, language: nextLanguage });
      void window.electronAPI?.setLanguage?.(nextLanguage);
      onPreviewAppearance?.(null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handlePickBackground = async () => {
    if (!onUploadBackground) return;
    setBgError(null);
    const api = window.electronAPI;
    if (api?.isElectron && api.selectFile) {
      const picked = await api.selectFile(undefined, [
        { name: t('图片文件', 'Image Files'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] },
      ]);
      if (!picked) return;
      setBgUploading(true);
      try {
        const updated = await onUploadBackground({ filePath: picked });
        setForm((prev) => (prev ? { ...prev, customBgImage: updated.customBgImage } : prev));
        setBgUrlDraft('');
      } catch (err) {
        setBgError(err instanceof Error ? err.message : t('设置背景图失败', 'Failed to set background image'));
      } finally {
        setBgUploading(false);
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleWebFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadBackground) return;
    if (file.size > 20 * 1024 * 1024) {
      setBgError(t('背景图片不能超过 20 MB', 'Background image must be 20 MB or smaller'));
      return;
    }
    setBgError(null);
    setBgUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) throw new Error(t('读取图片失败', 'Failed to read image'));
        const updated = await onUploadBackground({ dataUrl });
        setForm((prev) => (prev ? { ...prev, customBgImage: updated.customBgImage } : prev));
        setBgUrlDraft('');
      } catch (err) {
        setBgError(err instanceof Error ? err.message : t('上传背景图失败', 'Failed to upload background image'));
      } finally {
        setBgUploading(false);
      }
    };
    reader.onerror = () => {
      setBgError(t('读取图片失败', 'Failed to read image'));
      setBgUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyBgUrl = async () => {
    if (!onUploadBackground) return;
    const trimmed = bgUrlDraft.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setBgError(t('请输入以 http:// 或 https:// 开头的图片链接', 'Enter an image URL starting with http:// or https://'));
      return;
    }
    setBgError(null);
    setBgUploading(true);
    try {
      const updated = await onUploadBackground({ url: trimmed });
      setForm((prev) => (prev ? { ...prev, customBgImage: updated.customBgImage } : prev));
    } catch (err) {
      setBgError(err instanceof Error ? err.message : t('应用链接失败', 'Failed to apply image URL'));
    } finally {
      setBgUploading(false);
    }
  };

  const handleClearBg = async () => {
    if (!onClearBackground) return;
    setBgError(null);
    setBgUploading(true);
    try {
      const updated = await onClearBackground();
      setForm((prev) => (prev ? { ...prev, customBgImage: updated.customBgImage } : prev));
      setBgUrlDraft('');
    } catch (err) {
      setBgError(err instanceof Error ? err.message : t('清除背景图失败', 'Failed to clear background image'));
    } finally {
      setBgUploading(false);
    }
  };

  const browseDirectory = async (key: DirKey) => {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.selectDirectory(form[key] || undefined);
    if (result != null) setForm((prev) => (prev ? { ...prev, [key]: result } : prev));
  };

  const browseLazerExe = async () => {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.selectFile(form.lazerExePath || undefined, [
      { name: 'osu!lazer', extensions: ['exe'] },
      { name: t('所有文件', 'All Files'), extensions: ['*'] },
    ]);
    if (result != null) setForm((prev) => (prev ? { ...prev, lazerExePath: result } : prev));
  };

  const renderPathField = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    onBrowse: () => void,
  ) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="field font-mono text-[0.8125rem]"
          title={value}
        />
        {isElectron && (
          <button type="button" onClick={onBrowse} className="btn shrink-0 px-2.5">
            <FolderOpen className="h-3.5 w-3.5" />
            <span>{t('浏览...', 'Browse...')}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={handleCloseCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('客户端路径、代理与主题背景设置', 'Client Paths, Proxy & Appearance Settings')}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="modal-surface flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-surface-3">
              <Settings2 className="h-4 w-4 text-osu-soft" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[1.0625rem] font-bold text-ink">
                  {t('客户端路径、代理与主题背景设置', 'Client Paths, Proxy & Appearance')}
                </h2>
                <span className="font-mono shrink-0 rounded-full border border-osu/35 bg-osu/10 px-2 py-0.5 text-[0.6875rem] font-bold text-osu-soft tabular-nums">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="truncate text-[0.78125rem] font-medium text-ink-3">
                {form.proxyMode === 'direct'
                  ? t(
                      '当前使用纯直连模式与本机 Stable / Lazer 路径',
                      'Configured with local Stable / Lazer paths (Direct mode)',
                    )
                  : t(
                      `已配置本机 Stable / Lazer 路径及 ${form.proxyPort} 代理端口`,
                      `Configured with local Stable / Lazer paths & proxy :${form.proxyPort}`,
                    )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseCancel}
            className="btn btn-icon shrink-0"
            aria-label={t('关闭', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[0.84375rem]">
          {/* 1. Client Paths */}
          <Section index={1} title={t('本地客户端路径', 'Local Client Paths')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {renderPathField(
                'cfg-stable-path',
                t('osu!stable 根目录', 'osu!stable Root Folder'),
                form.stablePath,
                (v) => setForm({ ...form, stablePath: v }),
                () => void browseDirectory('stablePath'),
              )}
              {renderPathField(
                'cfg-lazer-data',
                t('osu!lazer 数据目录', 'osu!lazer Data Folder'),
                form.lazerDataPath,
                (v) => setForm({ ...form, lazerDataPath: v }),
                () => void browseDirectory('lazerDataPath'),
              )}
              {renderPathField(
                'cfg-lazer-exe',
                t('osu!lazer 可执行文件 (用于一键导入)', 'osu!lazer Executable (Auto-Import)'),
                form.lazerExePath,
                (v) => setForm({ ...form, lazerExePath: v }),
                () => void browseLazerExe(),
              )}
              {renderPathField(
                'cfg-lazer-import',
                t('Lazer 待导入队列目录', 'Lazer Import Queue Folder'),
                form.lazerImportDir,
                (v) => setForm({ ...form, lazerImportDir: v }),
                () => void browseDirectory('lazerImportDir'),
              )}
            </div>
          </Section>

          {/* 2. Proxy & Mirror Benchmark */}
          <Section
            index={2}
            title={t('智能网络与代理设置', 'Network & Proxy')}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {network && (
                  <span
                    className={`chip font-mono ${
                      network.hasGlobalIpv6
                        ? 'border-emerald-500/35 bg-emerald-500/12 text-ok'
                        : 'border-hairline bg-surface-1 text-ink-3'
                    }`}
                  >
                    {network.hasGlobalIpv6 ? t('IPv6 已就绪', 'IPv6 Ready') : t('仅 IPv4', 'IPv4 Only')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onBenchmark}
                  disabled={network?.benchmarking}
                  className="btn btn-sm border-emerald-500/35 bg-emerald-500/12 text-ok hover:border-emerald-500/55 hover:bg-emerald-500/20"
                >
                  {network?.benchmarking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                  <span>{t('立即检测代理与全部镜像测速', 'Test Proxy & Benchmark Mirrors')}</span>
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(0,0.85fr)_minmax(0,0.6fr)]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('代理策略', 'Proxy Strategy')}</span>
                <SelectField
                  value={form.proxyMode}
                  onChange={(val) => setForm({ ...form, proxyMode: val as ProxyMode })}
                >
                  <option value="auto">{t('自动检测 (国内直连 · 海外优先代理)', 'Auto (CN Direct · Global Proxy)')}</option>
                  <option value="proxy">{t('强制走本地代理', 'Force Local Proxy')}</option>
                  <option value="direct">{t('强制全直连', 'Direct Only')}</option>
                </SelectField>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('网络协议 (IPv6)', 'IP Stack (IPv6)')}</span>
                <SelectField
                  value={form.ipFamily || 'auto'}
                  onChange={(val) => setForm({ ...form, ipFamily: val as IpFamilyMode })}
                >
                  <option value="auto">{t('自动双栈 (Happy Eyeballs)', 'Auto Dual-Stack (Happy Eyeballs)')}</option>
                  <option value="ipv6_first">{t('IPv6 优先 (直连加速)', 'Prefer IPv6 (Fast Direct)')}</option>
                  <option value="ipv6_only">{t('强制仅 IPv6', 'IPv6 Only')}</option>
                  <option value="ipv4_first">{t('IPv4 优先', 'Prefer IPv4')}</option>
                  <option value="ipv4_only">{t('强制仅 IPv4', 'IPv4 Only')}</option>
                </SelectField>
              </div>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('代理主机', 'Proxy Host')}</span>
                <input
                  type="text"
                  value={form.proxyHost}
                  onChange={(e) => setForm({ ...form, proxyHost: e.target.value })}
                  spellCheck={false}
                  className="field font-mono text-[0.8125rem]"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('代理端口', 'Proxy Port')}</span>
                <input
                  type="number"
                  value={form.proxyPort}
                  onChange={(e) => setForm({ ...form, proxyPort: Number(e.target.value) || 6174 })}
                  className="field font-mono text-[0.8125rem] tabular-nums"
                />
              </label>
            </div>

            {network && (
              <div className="overflow-x-auto rounded-[10px] border border-hairline bg-surface-2">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('下载源', 'Mirror')}</th>
                      <th>{t('区域', 'Region')}</th>
                      <th>{t('路由', 'Route')}</th>
                      <th className="text-right">{t('延迟', 'Latency')}</th>
                      <th>{t('状态', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {network.mirrors.map((m) => {
                      const best = m.id === network.recommendedMirror;
                      const tone = m.latencyMs != null ? latencyTone(m.latencyMs) : null;
                      return (
                        <tr key={m.id} className={best ? 'bg-osu/8' : ''}>
                          <td className="relative">
                            {best && <span className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-full bg-osu" />}
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-ink">{m.name}</div>
                                <div className="truncate font-mono text-[0.71875rem] text-ink-3">{m.shortName}</div>
                              </div>
                              {best && (
                                <span className="chip shrink-0 border-osu/40 bg-osu/12 text-osu-soft">
                                  {t('最优', 'Best')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`chip font-stat ${REGION_CHIP[m.region] ?? ''}`}>{m.region}</span>
                          </td>
                          <td className="whitespace-nowrap text-ink-2">
                            {m.routeUsed === 'proxy' ? (
                              <span>
                                {t('代理', 'Proxy')} <span className="font-mono text-ink-3">:{network.proxyPort}</span>
                              </span>
                            ) : m.routeUsed === 'direct' ? (
                              t('直连', 'Direct')
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            {m.latencyMs != null && tone ? (
                              <div className="ml-auto flex w-[92px] flex-col items-end gap-1">
                                <span className={`font-mono text-[0.78125rem] font-semibold tabular-nums ${tone.text}`}>
                                  {m.latencyMs} <span className="text-ink-3">ms</span>
                                </span>
                                <div className="meter h-[3px]">
                                  <span
                                    className={tone.bar}
                                    style={{ width: `${Math.max(6, Math.min(100, (m.latencyMs / 2000) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </td>
                          <td className="max-w-[200px]">
                            {m.healthy ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-ok">
                                <span className="live-dot" /> {t('可用', 'OK')}
                              </span>
                            ) : (
                              <span
                                className="flex min-w-0 items-center gap-1.5 text-ink-2"
                                title={m.error || ''}
                              >
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                <span className="truncate">
                                  {m.requiresAuth
                                    ? t('未登录(已自动跳过)', 'Auth required (skipped)')
                                    : m.error || t('不可用', 'Offline')}
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 3. Theme, Language, Font Scale, Custom Background & Download Preferences */}
          <Section
            index={3}
            title={t('界面主题、语言、字号与偏好设置', 'Theme, Language, Scale & Preferences')}
            icon={<Palette className="h-3.5 w-3.5 shrink-0 text-osu-soft" />}
          >
            {/* Interface Language Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-hairline bg-surface-2/55 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-osu-soft" />
                <div className="min-w-0">
                  <div className="field-label font-semibold text-ink">
                    {t('界面语言', 'Interface Language')}
                  </div>
                  <div className="text-[0.71875rem] font-medium text-ink-3">
                    {t(
                      '即时切换主界面与浮窗语言（取消将还原）',
                      'Switch UI & overlay language live (reverts on Cancel)',
                    )}
                  </div>
                </div>
              </div>
              <div className="segmented segmented-auto shrink-0">
                {(
                  [
                    { id: 'zh', label: '简体中文' },
                    { id: 'en', label: 'English' },
                  ] as const
                ).map((opt) => {
                  const active = (form.language || lang) === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setLang(opt.id);
                        setForm((prev) => (prev ? { ...prev, language: opt.id } : prev));
                      }}
                      className={
                        active
                          ? '!bg-surface-2 !px-3 !text-ink shadow-[inset_0_0_0_1px_var(--t-osu)]'
                          : '!px-3'
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 8 Theme Picker */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {themeOptions.map((opt) => {
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChangeTheme(opt.id);
                      setForm({ ...form, theme: opt.id });
                    }}
                    title={opt.desc}
                    className={`flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? 'border-osu/60 bg-surface-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_35%,transparent)]'
                        : 'border-hairline bg-surface-2/60 hover:border-hairline-strong hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-black/20 shadow-inner"
                      style={{
                        backgroundColor: opt.swatchBg,
                        boxShadow: active ? `0 0 0 2px ${opt.swatchRing}` : undefined,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="font-display truncate text-[0.84375rem] font-bold text-ink">
                        {opt.label}
                      </div>
                      <div className="truncate text-[0.71875rem] font-medium text-ink-3">
                        {opt.isDark ? t('暗色', 'Dark') : t('浅色', 'Light')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom UI Font Size Scaling */}
            <div className="space-y-2.5 rounded-[10px] border border-hairline bg-surface-2/55 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Type className="h-3.5 w-3.5 shrink-0 text-osu-soft" />
                  <span className="field-label font-semibold text-ink">{t('界面字体大小', 'UI Font Scale')}</span>
                  <span className="font-mono rounded-[6px] border border-hairline bg-surface-1 px-1.5 py-0.5 text-[0.75rem] font-bold text-osu-soft tabular-nums">
                    {Math.round(currentFontScale * 100)}%
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {fontScalePresets.map((preset) => {
                    const active = Math.abs(currentFontScale - preset.value) < 0.015;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => updateAppearance({ fontScale: preset.value })}
                        className={`btn btn-sm min-h-[26px] px-2 text-[0.75rem] ${
                          active ? 'border-osu/50 bg-osu/14 text-osu-soft' : ''
                        }`}
                      >
                        {preset.label} {Math.round(preset.value * 100)}%
                      </button>
                    );
                  })}
                  {Math.abs(currentFontScale - DEFAULT_FONT_SCALE) > 0.005 && (
                    <button
                      type="button"
                      onClick={() => updateAppearance({ fontScale: DEFAULT_FONT_SCALE })}
                      className="btn btn-sm min-h-[26px] px-2 text-[0.75rem]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{t('恢复默认', 'Reset')}</span>
                    </button>
                  )}
                </div>
              </div>

              <input
                type="range"
                aria-label={t('界面字体大小缩放', 'UI font scale')}
                min={FONT_SCALE_MIN}
                max={FONT_SCALE_MAX}
                step={0.01}
                value={currentFontScale}
                onChange={(e) => updateAppearance({ fontScale: Number(e.target.value) })}
                style={{
                  '--fill': `${Math.round(((currentFontScale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)) * 100)}%`,
                } as React.CSSProperties}
                className="slim-range w-full"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem] font-medium text-ink-3">
                <span>
                  {t(
                    '默认 120%，实时缩放全部中英文界面字号，取消保存将还原原设定',
                    'Default 120%; scales UI live and reverts on Cancel',
                  )}
                </span>
                <span className="truncate font-semibold text-ink-2">
                  {t(
                    '预览示例：双端曲库同步 · Mania 4K 谱面下载器 · 98.50% ~420pp',
                    'Preview: Dual-Client Sync · Mania 4K Downloader · 98.50% ~420pp',
                  )}
                </span>
              </div>
            </div>

            {/* Custom Accent Color Picker */}
            <div className="space-y-2 rounded-[10px] border border-hairline bg-surface-2/55 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="field-label font-semibold text-ink">{t('自定义主题强调色', 'Custom Accent Color')}</span>
                <div className="flex items-center gap-2">
                  {form.dynamicThemeFromBg && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-osu/35 bg-osu/10 px-2 py-0.5 text-[0.71875rem] font-medium text-osu-soft">
                      <Sparkles className="h-3 w-3" />
                      <span>
                        {t('随背景变色中', 'Auto from BG')}
                        {activeExtractedColor ? ` (${activeExtractedColor})` : ''}
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => updateAppearance({ accentColor: '' })}
                    className={`btn btn-sm min-h-[26px] px-2 text-[0.75rem] font-semibold ${
                      !form.accentColor ? 'border-osu/45 bg-osu/12 text-osu-soft' : ''
                    }`}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{t('主题默认', 'Theme Default')}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {accentPresets.map((preset) => {
                  const active = form.accentColor.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => updateAppearance({ accentColor: preset.hex })}
                      title={`${preset.label} (${preset.hex})`}
                      className={`h-6 w-6 rounded-full border border-black/25 transition-transform hover:scale-110 ${
                        active ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface-2' : ''
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    />
                  );
                })}

                <label
                  className="ml-1 inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 text-[0.75rem] font-semibold text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
                  title={t('自由选取任意强调色', 'Pick any custom accent color')}
                >
                  <input
                    type="color"
                    value={form.accentColor || '#ff66aa'}
                    onChange={(e) => updateAppearance({ accentColor: e.target.value })}
                    className="h-4 w-4 cursor-pointer rounded border-none bg-transparent p-0"
                  />
                  <span className="font-mono text-[0.75rem] uppercase">
                    {form.accentColor || t('自选颜色', 'Custom')}
                  </span>
                </label>
              </div>
            </div>

            {/* Custom Desktop Background Image + Opacity + Dynamic Switches */}
            <div className="space-y-3 rounded-[10px] border border-hairline bg-surface-2/55 p-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={handleWebFileChange}
                className="hidden"
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-[8px] border border-hairline bg-surface-1">
                  {form.customBgImage ? (
                    <img
                      src={form.customBgImage}
                      alt={t('自定义桌面背景预览', 'Custom background preview')}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[0.75rem] font-medium text-ink-4">
                      {t('未设置壁纸', 'No Wallpaper')}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={bgUploading}
                      onClick={() => void handlePickBackground()}
                      className="btn btn-sm"
                    >
                      {bgUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5 text-osu" />
                      )}
                      <span>{t('选择本地背景图...', 'Choose Local Image...')}</span>
                    </button>

                    {form.customBgImage && (
                      <button
                        type="button"
                        disabled={bgUploading}
                        onClick={() => void handleClearBg()}
                        className="btn btn-sm btn-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t('清除背景图', 'Clear Image')}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={bgUrlDraft}
                      onChange={(e) => setBgUrlDraft(e.target.value)}
                      placeholder={t('或粘贴网络图片链接 (https://...)', 'Or paste image URL (https://...)')}
                      className="field min-h-[30px] flex-1 font-mono text-[0.78125rem]"
                    />
                    <button
                      type="button"
                      disabled={bgUploading || !bgUrlDraft.trim()}
                      onClick={() => void handleApplyBgUrl()}
                      className="btn btn-sm min-h-[30px] px-2.5"
                    >
                      {t('应用链接', 'Apply URL')}
                    </button>
                  </div>
                  {bgError && <div className="text-[0.78125rem] font-medium text-bad">{bgError}</div>}
                </div>
              </div>

              {/* Background Opacity Slider */}
              <div className="space-y-1.5 border-t border-hairline pt-2.5">
                <div className="flex items-center justify-between text-[0.8125rem]">
                  <span className="font-semibold text-ink-2">
                    {t('背景图不透明度（默认 75%，越高背景越清晰）', 'Background Opacity (Default 75%, higher = clearer)')}
                  </span>
                  <span className="font-mono font-bold text-ink tabular-nums">
                    {Math.round(currentBgOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label={t('背景图不透明度', 'Background opacity')}
                  min={0.04}
                  max={1}
                  step={0.01}
                  value={currentBgOpacity}
                  onChange={(e) => updateAppearance({ customBgOpacity: Number(e.target.value) })}
                  style={{
                    '--fill': `${Math.round(((currentBgOpacity - 0.04) / (1 - 0.04)) * 100)}%`,
                  } as React.CSSProperties}
                  className="slim-range w-full"
                />
              </div>

              {/* Dynamic Song Background & Theme-from-Bg Toggles */}
              <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-hairline bg-surface-1/70 px-3 py-2 text-[0.8125rem] font-medium text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink">
                  <input
                    type="checkbox"
                    checked={form.dynamicBgFromSong ?? true}
                    onChange={(e) => updateAppearance({ dynamicBgFromSong: e.target.checked })}
                    className="check"
                  />
                  <span>{t('Lazer 模式随选中歌曲更换桌面背景', 'Sync background to selected song in Lazer mode')}</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-hairline bg-surface-1/70 px-3 py-2 text-[0.8125rem] font-medium text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink">
                  <input
                    type="checkbox"
                    checked={form.dynamicThemeFromBg ?? true}
                    onChange={(e) => updateAppearance({ dynamicThemeFromBg: e.target.checked })}
                    className="check check-lazer"
                  />
                  <span>{t('主题强调色随背景图主色调自动改变', 'Adapt accent color to background palette')}</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('默认下载目标', 'Default Target')}</span>
                <SelectField
                  value={form.defaultTarget}
                  onChange={(val) => setForm({ ...form, defaultTarget: val as DownloadTarget })}
                >
                  <option value="lazer">osu!lazer</option>
                  <option value="stable">osu!stable</option>
                  <option value="both">{t('双端同时安装', 'Both Clients')}</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('默认包体格式', 'Default Package')}</span>
                <SelectField
                  value={form.defaultVariant}
                  onChange={(val) => setForm({ ...form, defaultVariant: val as DownloadVariant })}
                >
                  <option value="novideo">{t('无视频 (No Video)', 'No Video')}</option>
                  <option value="full">{t('完整版 (含视频)', 'Full (With Video)')}</option>
                  <option value="mini">{t('精简 Mini 版', 'Mini')}</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('首选下载源', 'Preferred Mirror')}</span>
                <SelectField
                  value={form.preferredDownloadSource}
                  onChange={(val) =>
                    setForm({ ...form, preferredDownloadSource: val as PreferredMirror })
                  }
                >
                  <option value="auto">{t('自动选择最快镜像 (推荐)', 'Auto Fastest Mirror (Recommended)')}</option>
                  <option value="sayobot-auto">{t('小夜镜像 · 自动', 'Sayobot · Auto')}</option>
                  <option value="sayobot-txy">{t('小夜镜像 · 腾讯云', 'Sayobot · Tencent Cloud')}</option>
                  <option value="nekoha">{t('Nekoha 镜像', 'Nekoha')}</option>
                  <option value="osudirect">{t('osu.direct 镜像', 'osu.direct')}</option>
                  <option value="beatconnect">{t('BeatConnect 镜像', 'BeatConnect')}</option>
                  <option value="nerinyan">{t('Nerinyan 镜像', 'Nerinyan')}</option>
                  <option value="official">{t('官方源 (需下方 Cookie)', 'Official (Cookie required)')}</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('默认搜索引擎', 'Default Search Source')}</span>
                <SelectField
                  value={form.preferredSearchSource}
                  onChange={(val) =>
                    setForm({ ...form, preferredSearchSource: val as SearchSource })
                  }
                >
                  <option value="auto">{t('自动 (osu.direct + 故障转移)', 'Auto (osu.direct + Failover)')}</option>
                  <option value="osudirect">osu.direct</option>
                  <option value="sayobot">{t('小夜镜像 (国内直连)', 'Sayobot (CN Direct)')}</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('Stable 安装方式', 'Stable Install Mode')}</span>
                <SelectField
                  value={form.stableInstallMode}
                  onChange={(val) =>
                    setForm({ ...form, stableInstallMode: val as StableInstallMode })
                  }
                >
                  <option value="extract">{t('直接解压到 Songs 目录 (推荐)', 'Extract to Songs Folder (Recommended)')}</option>
                  <option value="drop_osz">{t('保留 .osz 到 Songs 目录', 'Keep .osz in Songs Folder')}</option>
                </SelectField>
              </div>

              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('并发下载数 (1-6)', 'Concurrency (1-6)')}</span>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={form.concurrency}
                  onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) || 3 })}
                  className="field font-mono text-[0.8125rem] tabular-nums"
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-hairline bg-surface-2/70 px-3 py-2.5 text-[0.8125rem] font-medium text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink">
              <input
                type="checkbox"
                checked={form.autoImportWhenLazerRunning}
                onChange={(e) =>
                  setForm({ ...form, autoImportWhenLazerRunning: e.target.checked })
                }
                className="check check-lazer"
              />
              <span>
                {t(
                  '检测到 osu!lazer 正在运行时，下载完成后自动触发客户端导入',
                  'Auto-import into osu!lazer on completion while running',
                )}
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-hairline bg-surface-2/70 px-3 py-2.5 text-[0.8125rem] font-medium text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink">
              <input
                type="checkbox"
                checked={form.autoLoadWhenStableRunning}
                onChange={(e) =>
                  setForm({ ...form, autoLoadWhenStableRunning: e.target.checked })
                }
                className="check"
              />
              <span>
                {t(
                  '检测到 osu!stable 正在运行时，下载完成后自动调用客户端导入并加载',
                  'Auto-load into osu!stable on completion while running',
                )}
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">{t('游戏内浮窗全局热键', 'In-Game Overlay Hotkey')}</span>
                <SelectField
                  value={form.overlayHotkey}
                  onChange={(val) => setForm({ ...form, overlayHotkey: val })}
                >
                  <option value="Alt+Shift+O">{t('Alt + Shift + O (默认)', 'Alt + Shift + O (Default)')}</option>
                  <option value="Ctrl+Shift+O">Ctrl + Shift + O</option>
                  <option value="Alt+O">Alt + O</option>
                  <option value="F9">F9</option>
                  <option value="F10">F10</option>
                  <option value="F11">F11</option>
                </SelectField>
              </div>
              <div className="flex min-w-0 flex-col justify-end text-[0.78125rem] font-medium text-ink-3">
                <span>
                  {t(
                    '提示：在游戏内使用「无边框窗口 (Borderless)」模式时，热键可一键呼出 macOS 磨砂浮窗。',
                    'Tip: Use Borderless Windowed mode in osu! so this hotkey brings up the quick overlay.',
                  )}
                </span>
              </div>
            </div>
          </Section>

          {/* 4. Optional Official Auth */}
          <Section
            index={4}
            title={t('官方源 Cookie', 'Official Source Cookie')}
            hint={t('(完全可选，无需登录即可使用全部镜像)', '(Optional — all mirrors work without login)')}
            icon={<ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ok" />}
          >
            <p className="text-[0.8125rem] font-medium leading-relaxed text-ink-2">
              {isEn ? (
                <>
                  All mirrors (Sayobot, Nekoha, osu.direct, etc.) work without any login. Only paste your browser{' '}
                  <code className="mx-1 rounded-[5px] border border-hairline bg-tint px-1 py-px font-mono text-[0.78125rem] text-osu-soft">
                    osu_session
                  </code>{' '}
                  cookie if you explicitly want to download from official osu! servers.
                </>
              ) : (
                <>
                  不填任何账号信息即可通过小夜、Nekoha、osu.direct 等镜像站自由搜索与下载。仅当你明确想走官方下载通道时才需填写浏览器中的
                  <code className="mx-1 rounded-[5px] border border-hairline bg-tint px-1 py-px font-mono text-[0.78125rem] text-osu-soft">
                    osu_session
                  </code>
                  。
                </>
              )}
            </p>
            <input
              type="password"
              value={form.officialCookie}
              placeholder={t('可选：留空则完全免登录使用镜像站', 'Optional: leave blank to use mirrors without login')}
              onChange={(e) => setForm({ ...form, officialCookie: e.target.value })}
              className="field font-mono"
            />
          </Section>

          {/* 5. About, Version, Open-Source Repo & Onboarding */}
          <Section
            index={5}
            title={t('关于与帮助', 'About & Help')}
            hint={t('版本信息、开源仓库与新手引导', 'Version, GitHub repo & setup wizard')}
            icon={<Info className="h-3.5 w-3.5 shrink-0 text-osu-soft" />}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-hairline bg-surface-2/65 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <LaneEmblem className="h-6 w-6 text-ink" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[0.9375rem] font-bold text-ink">
                      OSU!Manager!
                    </span>
                    <span className="font-mono rounded-full border border-osu/35 bg-osu/10 px-2 py-0.5 text-[0.71875rem] font-bold text-osu-soft tabular-nums">
                      v{APP_VERSION}
                    </span>
                  </div>
                  <div className="truncate text-[0.75rem] font-medium text-ink-3">
                    {t(
                      'osu!mania 双端管理下载器 · Book 档案库 · OSU! 音乐台',
                      'Dual-Client osu!mania Manager · Book Archive · OSU! Audio',
                    )}
                  </div>
                </div>
              </div>

              <span className="chip font-mono border-hairline bg-surface-1 text-ink-2">
                {isElectron ? t('Electron 桌面版', 'Electron Desktop') : t('Web 浏览器版', 'Web Browser')}
              </span>
            </div>

            <div className="flex flex-col gap-2 rounded-[10px] border border-hairline bg-surface-2/55 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <div className="field-label">{t('开源项目地址 (GitHub)', 'GitHub Repository')}</div>
                <a
                  href={PROJECT_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => openExternalLink(e, PROJECT_REPO_URL)}
                  className="font-mono inline-flex max-w-full items-center gap-1.5 truncate text-[0.8125rem] font-semibold text-osu-soft underline-offset-2 hover:underline"
                >
                  <span className="truncate">{PROJECT_REPO_URL}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              </div>

              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(PROJECT_REPO_URL).then(() => {
                    setCopiedRepo(true);
                    window.setTimeout(() => setCopiedRepo(false), 2000);
                  }).catch(() => {});
                }}
                className="btn btn-sm shrink-0"
              >
                {copiedRepo ? (
                  <Check className="h-3.5 w-3.5 text-ok" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedRepo ? t('已复制链接', 'Copied URL') : t('复制地址', 'Copy URL')}</span>
              </button>
            </div>

            {onReplayOnboarding && (
              <div className="flex flex-col gap-2 rounded-[10px] border border-hairline bg-surface-2/55 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <div className="font-display text-[0.84375rem] font-bold text-ink">
                    {t('新手引导', 'Setup Wizard')}
                  </div>
                  <p className="text-[0.78125rem] font-medium text-ink-3">
                    {t(
                      '重新打开新手配置与功能引导（支持探测本机客户端路径与代理端口）',
                      'Re-open the setup walkthrough (detects local client paths & proxy ports)',
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onReplayOnboarding}
                  className="btn btn-sm shrink-0 border-osu/35 bg-osu/10 text-osu-soft hover:border-osu/55 hover:bg-osu/16"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{t('重新观看新手引导', 'Replay Setup Wizard')}</span>
                </button>
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface-1/75 px-5 py-3">
          <span className="font-mono text-[0.75rem] font-medium text-ink-3 tabular-nums">
            OSU!Manager! · v{APP_VERSION}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleCloseCancel} className="btn">
              {t('取消', 'Cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary px-4">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saving ? t('保存中...', 'Saving...') : t('保存并刷新状态', 'Save & Refresh')}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
