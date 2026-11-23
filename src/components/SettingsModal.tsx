import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  FolderOpen,
  Loader2,
  Palette,
  Save,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { THEME_OPTIONS } from '../constants';
import {
  AppConfig,
  DownloadTarget,
  DownloadVariant,
  MirrorHealth,
  NetworkStatus,
  PreferredMirror,
  ProxyMode,
  SearchSource,
  StableInstallMode,
  ThemeId,
} from '../types';
import { SelectField } from './SelectField';

interface SettingsModalProps {
  open: boolean;
  config: AppConfig | null;
  network: NetworkStatus | null;
  theme: ThemeId;
  onChangeTheme: (t: ThemeId) => void;
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
          <span className="font-stat flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-hairline bg-surface-2 text-[10.5px] font-bold text-osu-soft">
            {index}
          </span>
          {icon}
          <h3 className="overline text-ink-2">{title}</h3>
          {hint && <span className="truncate text-[11px] text-ink-3">{hint}</span>}
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
  onChangeTheme,
  onClose,
  onSave,
  onBenchmark,
}: SettingsModalProps) {
  const [form, setForm] = useState<AppConfig | null>(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && config) setForm({ ...config, theme });
  }, [open, config]);

  if (!open || !form) return null;

  const isElectron = !!window.electronAPI?.isElectron;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, theme });
      onClose();
    } finally {
      setSaving(false);
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
      { name: '所有文件', extensions: ['*'] },
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
          className="field font-mono text-[11.5px]"
          title={value}
        />
        {isElectron && (
          <button type="button" onClick={onBrowse} className="btn shrink-0 px-2.5">
            <FolderOpen className="h-3.5 w-3.5" />
            <span>浏览...</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="客户端路径、代理与下载源设置"
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
              <h2 className="font-display text-[14.5px] font-bold text-ink">
                客户端路径、代理与主题设置
              </h2>
              <p className="truncate text-[11px] text-ink-3">
                默认已自动绑定本机 Stable / Lazer 路径及 <span className="font-mono tabular-nums">6174</span> 代理端口
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-icon shrink-0" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-[12px]">
          {/* 1. Client Paths */}
          <Section index={1} title="本地客户端路径">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {renderPathField(
                'cfg-stable-path',
                'osu!stable 根目录',
                form.stablePath,
                (v) => setForm({ ...form, stablePath: v }),
                () => void browseDirectory('stablePath'),
              )}
              {renderPathField(
                'cfg-lazer-data',
                'osu!lazer 数据目录',
                form.lazerDataPath,
                (v) => setForm({ ...form, lazerDataPath: v }),
                () => void browseDirectory('lazerDataPath'),
              )}
              {renderPathField(
                'cfg-lazer-exe',
                'osu!lazer 可执行文件 (用于一键导入)',
                form.lazerExePath,
                (v) => setForm({ ...form, lazerExePath: v }),
                () => void browseLazerExe(),
              )}
              {renderPathField(
                'cfg-lazer-import',
                'Lazer 待导入队列目录',
                form.lazerImportDir,
                (v) => setForm({ ...form, lazerImportDir: v }),
                () => void browseDirectory('lazerImportDir'),
              )}
            </div>
          </Section>

          {/* 2. Proxy & Mirror Benchmark */}
          <Section
            index={2}
            title="智能网络与代理设置"
            action={
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
                <span>立即检测代理与全部镜像测速</span>
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">代理策略</span>
                <SelectField
                  value={form.proxyMode}
                  onChange={(val) => setForm({ ...form, proxyMode: val as ProxyMode })}
                >
                  <option value="auto">自动检测 (国内直连 · 海外优先代理)</option>
                  <option value="proxy">强制走本地代理</option>
                  <option value="direct">强制全直连</option>
                </SelectField>
              </div>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">代理主机</span>
                <input
                  type="text"
                  value={form.proxyHost}
                  onChange={(e) => setForm({ ...form, proxyHost: e.target.value })}
                  spellCheck={false}
                  className="field font-mono text-[11.5px]"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">代理端口</span>
                <input
                  type="number"
                  value={form.proxyPort}
                  onChange={(e) => setForm({ ...form, proxyPort: Number(e.target.value) || 6174 })}
                  className="field font-mono text-[11.5px] tabular-nums"
                />
              </label>
            </div>

            {network && (
              <div className="overflow-x-auto rounded-[10px] border border-hairline bg-surface-2">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>下载源</th>
                      <th>区域</th>
                      <th>路由</th>
                      <th className="text-right">延迟</th>
                      <th>状态</th>
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
                                <div className="truncate font-medium text-ink">{m.name}</div>
                                <div className="truncate font-mono text-[10px] text-ink-3">{m.shortName}</div>
                              </div>
                              {best && (
                                <span className="chip shrink-0 border-osu/40 bg-osu/12 text-osu-soft">最优</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`chip font-stat ${REGION_CHIP[m.region] ?? ''}`}>{m.region}</span>
                          </td>
                          <td className="whitespace-nowrap text-ink-2">
                            {m.routeUsed === 'proxy' ? (
                              <span>
                                代理 <span className="font-mono text-ink-3">:{network.proxyPort}</span>
                              </span>
                            ) : m.routeUsed === 'direct' ? (
                              '直连'
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            {m.latencyMs != null && tone ? (
                              <div className="ml-auto flex w-[92px] flex-col items-end gap-1">
                                <span className={`font-mono text-[11.5px] tabular-nums ${tone.text}`}>
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
                                <span className="live-dot" /> 可用
                              </span>
                            ) : (
                              <span
                                className="flex min-w-0 items-center gap-1.5 text-ink-2"
                                title={m.error || ''}
                              >
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                <span className="truncate">
                                  {m.requiresAuth ? '未登录(已自动跳过)' : m.error || '不可用'}
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

          {/* 3. Theme & Download Preferences */}
          <Section
            index={3}
            title="界面主题与下载偏好"
            icon={<Palette className="h-3.5 w-3.5 shrink-0 text-osu-soft" />}
          >
            {/* Theme Picker */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {THEME_OPTIONS.map((opt) => {
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChangeTheme(opt.id);
                      setForm({ ...form, theme: opt.id });
                    }}
                    className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-osu/60 bg-surface-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_35%,transparent)]'
                        : 'border-hairline bg-surface-2/60 hover:border-hairline-strong hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border border-black/20 shadow-inner"
                      style={{
                        backgroundColor: opt.swatchBg,
                        boxShadow: active ? `0 0 0 2px ${opt.swatchRing}` : undefined,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="font-display text-[12.5px] font-bold text-ink">{opt.label}</div>
                      <div className="truncate text-[10.5px] text-ink-3">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">默认下载目标</span>
                <SelectField
                  value={form.defaultTarget}
                  onChange={(val) => setForm({ ...form, defaultTarget: val as DownloadTarget })}
                >
                  <option value="lazer">osu!lazer (刷PP)</option>
                  <option value="stable">osu!stable (日常练习)</option>
                  <option value="both">双端同时安装</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">默认包体格式</span>
                <SelectField
                  value={form.defaultVariant}
                  onChange={(val) => setForm({ ...form, defaultVariant: val as DownloadVariant })}
                >
                  <option value="novideo">无视频 (No Video)</option>
                  <option value="full">完整版 (含视频)</option>
                  <option value="mini">精简 Mini 版</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">首选下载源</span>
                <SelectField
                  value={form.preferredDownloadSource}
                  onChange={(val) =>
                    setForm({ ...form, preferredDownloadSource: val as PreferredMirror })
                  }
                >
                  <option value="auto">自动选择最快镜像 (推荐)</option>
                  <option value="sayobot-auto">小夜镜像 · 自动</option>
                  <option value="sayobot-txy">小夜镜像 · 腾讯云</option>
                  <option value="nekoha">Nekoha 镜像</option>
                  <option value="osudirect">osu.direct 镜像</option>
                  <option value="beatconnect">BeatConnect 镜像</option>
                  <option value="nerinyan">Nerinyan 镜像</option>
                  <option value="official">官方源 (需下方 Cookie)</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">默认搜索引擎</span>
                <SelectField
                  value={form.preferredSearchSource}
                  onChange={(val) =>
                    setForm({ ...form, preferredSearchSource: val as SearchSource })
                  }
                >
                  <option value="auto">自动 (osu.direct + 故障转移)</option>
                  <option value="osudirect">osu.direct</option>
                  <option value="sayobot">小夜镜像 (国内直连)</option>
                </SelectField>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">Stable 安装方式</span>
                <SelectField
                  value={form.stableInstallMode}
                  onChange={(val) =>
                    setForm({ ...form, stableInstallMode: val as StableInstallMode })
                  }
                >
                  <option value="extract">直接解压到 Songs 目录 (推荐)</option>
                  <option value="drop_osz">保留 .osz 到 Songs 目录</option>
                </SelectField>
              </div>

              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">并发下载数 (1-6)</span>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={form.concurrency}
                  onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) || 3 })}
                  className="field font-mono text-[11.5px] tabular-nums"
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-hairline bg-surface-2/70 px-3 py-2.5 text-[12px] text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink">
              <input
                type="checkbox"
                checked={form.autoImportWhenLazerRunning}
                onChange={(e) =>
                  setForm({ ...form, autoImportWhenLazerRunning: e.target.checked })
                }
                className="check check-lazer"
              />
              <span>检测到 osu!lazer 正在运行时，下载完成后自动触发客户端导入</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-hairline bg-surface-2/70 px-3 py-2.5 text-[12px] text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink">
              <input
                type="checkbox"
                checked={form.autoLoadWhenStableRunning}
                onChange={(e) =>
                  setForm({ ...form, autoLoadWhenStableRunning: e.target.checked })
                }
                className="check"
              />
              <span>检测到 osu!stable 正在运行时，下载完成后自动调用客户端导入并加载</span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="field-label">游戏内浮窗全局热键</span>
                <SelectField
                  value={form.overlayHotkey}
                  onChange={(val) => setForm({ ...form, overlayHotkey: val })}
                >
                  <option value="Alt+Shift+O">Alt + Shift + O (默认)</option>
                  <option value="Ctrl+Shift+O">Ctrl + Shift + O</option>
                  <option value="Alt+O">Alt + O</option>
                  <option value="F9">F9</option>
                  <option value="F10">F10</option>
                  <option value="F11">F11</option>
                </SelectField>
              </div>
              <div className="flex min-w-0 flex-col justify-end text-[11px] text-ink-3">
                <span>
                  提示：在游戏内使用「无边框窗口 (Borderless)」模式时，热键可一键呼出 macOS 磨砂浮窗。
                </span>
              </div>
            </div>
          </Section>

          {/* 4. Optional Official Auth */}
          <Section
            index={4}
            title="官方源 Cookie"
            hint="(完全可选，无需登录即可使用全部镜像)"
            icon={<ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ok" />}
          >
            <p className="text-[11.5px] leading-relaxed text-ink-2">
              不填任何账号信息即可通过小夜、Nekoha、osu.direct 等镜像站自由搜索与下载。仅当你明确想走官方下载通道时才需填写浏览器中的
              <code className="mx-1 rounded-[5px] border border-hairline bg-tint px-1 py-px font-mono text-[11px] text-osu-soft">
                osu_session
              </code>
              。
            </p>
            <input
              type="password"
              value={form.officialCookie}
              placeholder="可选：留空则完全免登录使用镜像站"
              onChange={(e) => setForm({ ...form, officialCookie: e.target.value })}
              className="field font-mono"
            />
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-1/75 px-5 py-3">
          <button type="button" onClick={onClose} className="btn">
            取消
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary px-4">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saving ? '保存中...' : '保存并刷新状态'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
