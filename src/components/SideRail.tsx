import { useMemo } from 'react';
import {
  ArrowRightLeft,
  BookOpen,
  ChevronRight,
  Compass,
  Download,
  Loader2,
  Play,
  Settings,
  Zap,
} from 'lucide-react';
import { OsuMusicMark } from './music/OsuMusicMark';
import {
  WorkflowPreset,
  getTargetMeta,
  getVariantOptions,
  getWorkflowPresets,
} from '../constants';
import { useI18n } from '../i18n';
import {
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  FastBatchSnapshot,
  LocalLibraryStatus,
  WorkspaceMode,
} from '../types';

interface SideRailProps {
  workspaceMode: WorkspaceMode;
  target: DownloadTarget;
  variant: DownloadVariant;
  activePresetId: string | null;
  library: LocalLibraryStatus | null;
  downloads: DownloadTask[];
  fastBatch?: FastBatchSnapshot | null;
  launchingClient?: 'stable' | 'lazer' | null;
  musicPlaying?: boolean;
  onChangeWorkspaceMode: (mode: WorkspaceMode) => void;
  onChangeTarget: (t: DownloadTarget) => void;
  onChangeVariant: (v: DownloadVariant) => void;
  onSelectPreset: (preset: WorkflowPreset) => void;
  onLaunchGame: (client: 'stable' | 'lazer') => void;
  onOpenLibrarySync: () => void;
  onOpenFastBatch: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
}

const TARGET_ORDER: DownloadTarget[] = ['lazer', 'stable', 'both'];

export function SideRail({
  workspaceMode,
  target,
  variant,
  activePresetId,
  library,
  downloads,
  fastBatch,
  launchingClient,
  musicPlaying = false,
  onChangeWorkspaceMode,
  onChangeTarget,
  onChangeVariant,
  onSelectPreset,
  onLaunchGame,
  onOpenLibrarySync,
  onOpenFastBatch,
  onOpenDownloads,
  onOpenSettings,
}: SideRailProps) {
  const { lang, t } = useI18n();
  const targetMeta = useMemo(() => getTargetMeta(lang), [lang]);
  const variantOptions = useMemo(() => getVariantOptions(lang), [lang]);
  const workflowPresets = useMemo(() => getWorkflowPresets(lang), [lang]);

  const activeDownloads = downloads.filter(
    (d) =>
      d.status === 'queued' ||
      d.status === 'downloading' ||
      d.status === 'verifying' ||
      d.status === 'installing',
  );
  const failedCount = downloads.filter((d) => d.status === 'failed').length;
  const pending = library?.lazerPendingCount ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto px-3.5 pt-1.5 pb-1">
        {/* Workspace Mode Switcher: Online Browse / 3D Book Archive / Swiss Music Player */}
        <section className="space-y-1">
          <div className="px-0.5">
            <span className="overline">{t('工作区模式', 'Workspace')}</span>
          </div>
          <div className="grid grid-cols-3 rounded-[9px] border border-hairline bg-canvas/55 p-0.5">
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('browse')}
              aria-pressed={workspaceMode === 'browse'}
              className={`flex min-h-[28px] items-center justify-center gap-1 rounded-[7px] px-1 py-0.5 text-[0.75rem] transition-all duration-150 ${
                workspaceMode === 'browse'
                  ? 'bg-surface-2 font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                  : 'font-semibold text-ink-3 hover:text-ink'
              }`}
            >
              <Compass className="h-3.5 w-3.5 shrink-0" />
              <span>{t('搜图', 'Browse')}</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('book')}
              aria-pressed={workspaceMode === 'book'}
              className={`flex min-h-[28px] items-center justify-center gap-1 rounded-[7px] px-1 py-0.5 text-[0.75rem] transition-all duration-150 ${
                workspaceMode === 'book'
                  ? 'bg-surface-2 font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                  : 'font-semibold text-ink-3 hover:text-ink'
              }`}
            >
              <BookOpen
                className={`h-3.5 w-3.5 shrink-0 ${
                  workspaceMode === 'book' ? 'text-amber-500' : ''
                }`}
              />
              <span>Book</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('music')}
              aria-pressed={workspaceMode === 'music'}
              className={`flex min-h-[28px] items-center justify-center gap-1 rounded-[7px] px-1 py-0.5 text-[0.75rem] transition-all duration-150 ${
                workspaceMode === 'music'
                  ? 'bg-surface-2 font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                  : 'font-semibold text-ink-3 hover:text-ink'
              }`}
            >
              <OsuMusicMark
                className="h-3.5 w-3.5 text-ink"
                active={workspaceMode === 'music'}
                playing={musicPlaying}
              />
              <span>{t('音乐', 'Music')}</span>
              {musicPlaying && workspaceMode !== 'music' && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d62828]" />
              )}
            </button>
          </div>
        </section>

        {/* Download Target (Impeccable machined 3-way pill + underline variant tabs) */}
        <section className="space-y-1.5">
          <div className="px-0.5">
            <span className="overline">{t('下载目标', 'Target')}</span>
          </div>

          <div className="grid grid-cols-3 rounded-[9px] border border-hairline bg-canvas/55 p-0.5">
            {TARGET_ORDER.map((tgt) => {
              const meta = targetMeta[tgt];
              const active = target === tgt;
              return (
                <button
                  key={tgt}
                  type="button"
                  onClick={() => onChangeTarget(tgt)}
                  title={
                    tgt === 'both'
                      ? t('同时安装到 Stable + Lazer', 'Install to Stable + Lazer')
                      : t(`下载到 ${meta.label}`, `Download to ${meta.label}`)
                  }
                  className={`min-h-[30px] rounded-[7px] px-1 py-1 text-[0.8125rem] transition-all duration-150 ${
                    active
                      ? 'bg-surface-2 font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                      : 'font-semibold text-ink-3 hover:text-ink'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3.5 px-0.5">
            {variantOptions.map((opt) => {
              const active = variant === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  onClick={() => onChangeVariant(opt.value)}
                  className={`border-b-[1.5px] pb-1 text-[0.78125rem] font-semibold transition-colors ${
                    active
                      ? 'border-osu text-ink'
                      : 'border-transparent text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Mania 4K Presets (Borderless editorial index with 5px accent dot) */}
        <section className="space-y-1.5">
          <div className="px-0.5">
            <span className="overline">{t('Mania 4K 场景', 'Mania 4K Presets')}</span>
          </div>
          <div className="space-y-0.5">
            {workflowPresets.map((preset) => {
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  title={preset.description}
                  className={`group flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-[3.5px] text-left transition-colors duration-150 ${
                    active
                      ? 'bg-surface-2 font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'font-medium text-ink-2 hover:bg-tint hover:text-ink'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-[5px] w-[5px] shrink-0 rounded-full transition-opacity ${
                        active ? 'bg-osu opacity-100' : 'bg-ink-4 opacity-0 group-hover:opacity-60'
                      }`}
                    />
                    <span className="truncate text-[0.8125rem]">{preset.label}</span>
                  </span>
                  <span className="font-mono shrink-0 text-[0.71875rem] font-semibold text-ink-3">
                    {preset.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Local Dual-Client Library (Hairline-bounded tabular summary, zero card-in-card) */}
        <section className="space-y-1 border-y border-hairline py-1.5">
          <div className="px-0.5">
            <span className="overline">{t('本地曲库', 'Local Library')}</span>
          </div>

          <div className="space-y-1.5 px-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-2">
                {library?.stableRunning ? <span className="live-dot" /> : <span className="idle-dot" />}
                <span>Stable</span>
                <span className="text-[0.71875rem] font-medium text-ink-3">
                  {library?.stableRunning
                    ? t('运行中', 'Running')
                    : library?.stableExists === false
                      ? t('未找到', 'Not found')
                      : ''}
                </span>
              </span>
              <span className="font-stat text-[1rem] font-bold text-ink tabular-nums">
                {library ? library.stableCount.toLocaleString() : '—'}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-2">
                {library?.lazerRunning ? <span className="live-dot" /> : <span className="idle-dot" />}
                <span>Lazer</span>
                {library?.lazerDeepScanRunning && (
                  <Loader2 className="h-3 w-3 animate-spin text-ink-3" />
                )}
                <span className="text-[0.71875rem] font-medium text-ink-3">
                  {library?.lazerRunning
                    ? t('运行中', 'Running')
                    : library?.lazerExists === false
                      ? t('未找到', 'Not found')
                      : ''}
                </span>
              </span>
              <span className="font-stat text-[1rem] font-bold text-ink tabular-nums">
                {library ? library.lazerCount.toLocaleString() : '—'}
              </span>
            </div>

            {pending > 0 && (
              <div className="flex items-center justify-between pt-0.5 text-[0.78125rem] font-semibold text-warn">
                <span>{t('待导入 .osz', 'Pending .osz')}</span>
                <span className="font-mono font-semibold tabular-nums">{pending}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              disabled={Boolean(launchingClient)}
              onClick={() => onLaunchGame('stable')}
              title={
                library?.stableRunning
                  ? t('osu!stable 运行中，点击尝试切至前台', 'osu!stable is running — click to focus')
                  : library?.stableExeExists === false
                    ? t('未找到 osu!stable 可执行文件，点击检查路径', 'osu!stable executable not found — click to check path')
                    : t('启动 osu!stable 客户端', 'Launch osu!stable')
              }
              className={`btn btn-sm min-h-[30px] justify-center gap-1.5 px-2 text-[0.75rem] ${
                library?.stableRunning
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-ok'
                  : 'hover:border-stable/50 hover:bg-stable/12 hover:text-stable-soft'
              }`}
            >
              {launchingClient === 'stable' ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <Play className="h-3 w-3 shrink-0 fill-current" />
              )}
              <span className="truncate">{t('启动 Stable', 'Run Stable')}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(launchingClient)}
              onClick={() => onLaunchGame('lazer')}
              title={
                library?.lazerRunning
                  ? t('osu!lazer 运行中，点击尝试切至前台', 'osu!lazer is running — click to focus')
                  : library?.lazerExeExists === false
                    ? t('未找到 osu!lazer 可执行文件，点击检查路径', 'osu!lazer executable not found — click to check path')
                    : t('启动 osu!lazer 客户端', 'Launch osu!lazer')
              }
              className={`btn btn-sm min-h-[30px] justify-center gap-1.5 px-2 text-[0.75rem] ${
                library?.lazerRunning
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-ok'
                  : 'hover:border-lazer/50 hover:bg-lazer/12 hover:text-lazer-soft'
              }`}
            >
              {launchingClient === 'lazer' ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <Play className="h-3 w-3 shrink-0 fill-current" />
              )}
              <span className="truncate">{t('启动 Lazer', 'Run Lazer')}</span>
            </button>
          </div>

          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('book')}
              className={`group flex items-center justify-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[0.75rem] font-semibold transition-colors ${
                workspaceMode === 'book'
                  ? 'border-amber-500/45 bg-amber-500/10 text-ink'
                  : 'border-hairline bg-canvas/40 text-ink-2 hover:border-hairline-strong hover:bg-tint hover:text-ink'
              }`}
            >
              <BookOpen
                className={`h-3.5 w-3.5 shrink-0 ${
                  workspaceMode === 'book'
                    ? 'text-amber-500'
                    : 'text-ink-3 group-hover:text-amber-500'
                }`}
              />
              <span className="truncate">{t('Book 档案库', '3D Books')}</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('music')}
              className={`group flex items-center justify-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[0.75rem] font-semibold transition-colors ${
                workspaceMode === 'music'
                  ? 'border-[#d62828]/50 bg-[#d62828]/10 text-ink'
                  : 'border-hairline bg-canvas/40 text-ink-2 hover:border-hairline-strong hover:bg-tint hover:text-ink'
              }`}
            >
              <OsuMusicMark
                className="h-3.5 w-3.5 text-ink"
                active={workspaceMode === 'music'}
                playing={musicPlaying}
              />
              <span className="truncate">{t('OSU 音乐台', 'OSU! Audio')}</span>
            </button>
          </div>
        </section>
      </div>

      {/* Bottom Quiet Editorial Links */}
      <div className="space-y-0.5 border-t border-hairline px-3 py-1.5">
        <button
          type="button"
          onClick={onOpenLibrarySync}
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-[3px] text-left text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-ink-3 transition-colors group-hover:text-osu" />
            <span>{t('双端曲库比对同步', 'Library Sync')}</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" />
        </button>

        <button
          type="button"
          onClick={onOpenFastBatch}
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-[3px] text-left text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            <Zap
              className={`h-3.5 w-3.5 transition-colors ${
                fastBatch?.state === 'running'
                  ? 'text-osu'
                  : 'text-ink-3 group-hover:text-osu'
              }`}
            />
            <span>{t('快速批量下载', 'Fast Batch')}</span>
          </span>
          {(fastBatch?.state === 'running' || fastBatch?.state === 'paused') && (
            <span className="font-mono rounded-full bg-osu px-1.5 py-px text-[0.71875rem] font-semibold text-white tabular-nums">
              {fastBatch.completedCount}/{fastBatch.targetCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenDownloads}
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-[3px] text-left text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            {activeDownloads.length > 0 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-osu" />
            ) : (
              <Download className="h-3.5 w-3.5 text-ink-3 transition-colors group-hover:text-osu" />
            )}
            <span>{t('下载队列', 'Downloads')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            {failedCount > 0 && (
              <span className="font-mono text-[0.71875rem] font-semibold text-bad tabular-nums">
                {t(`${failedCount} 失败`, `${failedCount} failed`)}
              </span>
            )}
            {(activeDownloads.length > 0 || downloads.length > 0) && (
              <span
                className={`font-mono rounded-full px-1.5 py-px text-[0.71875rem] font-semibold tabular-nums ${
                  activeDownloads.length > 0
                    ? 'bg-osu text-white'
                    : 'bg-tint text-ink-3 group-hover:text-ink-2'
                }`}
              >
                {activeDownloads.length > 0 ? activeDownloads.length : downloads.length}
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-[3px] text-left text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-ink-3 transition-transform group-hover:rotate-45 group-hover:text-ink" />
            <span>{t('设置', 'Settings')}</span>
          </span>
          <span className="text-[0.71875rem] font-medium text-ink-3">
            {t('字体 · 主题 · 背景', 'Font · Theme · BG')}
          </span>
        </button>
      </div>
    </div>
  );
}
