import {
  ArrowRightLeft,
  ChevronRight,
  Download,
  Loader2,
  PanelLeftClose,
  Settings,
} from 'lucide-react';
import { TARGET_META, VARIANT_OPTIONS, WORKFLOW_PRESETS, WorkflowPreset } from '../constants';
import { DownloadTarget, DownloadTask, DownloadVariant, LocalLibraryStatus } from '../types';

interface SideRailProps {
  target: DownloadTarget;
  variant: DownloadVariant;
  activePresetId: string | null;
  library: LocalLibraryStatus | null;
  downloads: DownloadTask[];
  onChangeTarget: (t: DownloadTarget) => void;
  onChangeVariant: (v: DownloadVariant) => void;
  onSelectPreset: (preset: WorkflowPreset) => void;
  onOpenLibrarySync: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  onCollapse?: () => void;
}

const TARGET_ORDER: DownloadTarget[] = ['lazer', 'stable', 'both'];

export function SideRail({
  target,
  variant,
  activePresetId,
  library,
  downloads,
  onChangeTarget,
  onChangeVariant,
  onSelectPreset,
  onOpenLibrarySync,
  onOpenDownloads,
  onOpenSettings,
  onCollapse,
}: SideRailProps) {
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
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-4 pb-3">
        {/* Download Target (Impeccable machined 3-way pill + underline variant tabs) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <span className="overline">下载目标</span>
              <span className="text-[10.5px] font-medium text-ink-3">
                {TARGET_META[target].sub}
              </span>
            </div>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                title="收起左侧栏"
                className="flex h-5 w-5 items-center justify-center rounded text-ink-3 transition-colors hover:bg-tint-hover hover:text-ink"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 rounded-[9px] border border-hairline bg-canvas/55 p-0.5">
            {TARGET_ORDER.map((t) => {
              const meta = TARGET_META[t];
              const active = target === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChangeTarget(t)}
                  title={t === 'both' ? '同时安装到 Stable + Lazer' : `下载到 ${meta.label} (${meta.sub})`}
                  className={`h-[26px] rounded-[7px] text-[11.5px] transition-all duration-150 ${
                    active
                      ? 'bg-surface-2 font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                      : 'font-medium text-ink-3 hover:text-ink'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3.5 px-0.5">
            {VARIANT_OPTIONS.map((opt) => {
              const active = variant === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  onClick={() => onChangeVariant(opt.value)}
                  className={`border-b-[1.5px] pb-1 text-[11px] transition-colors ${
                    active
                      ? 'border-osu font-semibold text-ink'
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
            <span className="overline">Mania 4K 场景</span>
          </div>
          <div className="space-y-0.5">
            {WORKFLOW_PRESETS.map((preset) => {
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  title={preset.description}
                  className={`group flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-[7px] text-left transition-colors duration-150 ${
                    active
                      ? 'bg-surface-2 font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-ink-2 hover:bg-tint hover:text-ink'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-[5px] w-[5px] shrink-0 rounded-full transition-opacity ${
                        active ? 'bg-osu opacity-100' : 'bg-ink-4 opacity-0 group-hover:opacity-60'
                      }`}
                    />
                    <span className="truncate text-[12px]">{preset.label}</span>
                  </span>
                  <span className="font-mono shrink-0 text-[10px] text-ink-3">
                    {preset.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Local Dual-Client Library (Hairline-bounded tabular summary, zero card-in-card) */}
        <section className="space-y-2 border-y border-hairline py-3">
          <div className="px-0.5">
            <span className="overline">本地曲库</span>
          </div>

          <div className="space-y-1.5 px-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
                {library?.stableRunning ? <span className="live-dot" /> : <span className="idle-dot" />}
                <span>Stable</span>
                <span className="text-[10px] text-ink-3">
                  {library?.stableRunning ? '运行中' : library?.stableExists === false ? '未找到' : ''}
                </span>
              </span>
              <span className="font-stat text-[15px] font-bold text-ink tabular-nums">
                {library ? library.stableCount.toLocaleString() : '—'}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
                {library?.lazerRunning ? <span className="live-dot" /> : <span className="idle-dot" />}
                <span>Lazer</span>
                {library?.lazerDeepScanRunning && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-ink-3" />
                )}
                <span className="text-[10px] text-ink-3">
                  {library?.lazerRunning ? '运行中' : library?.lazerExists === false ? '未找到' : ''}
                </span>
              </span>
              <span className="font-stat text-[15px] font-bold text-ink tabular-nums">
                {library ? library.lazerCount.toLocaleString() : '—'}
              </span>
            </div>

            {pending > 0 && (
              <div className="flex items-center justify-between pt-0.5 text-[11px] text-warn">
                <span>待导入 .osz</span>
                <span className="font-mono font-semibold tabular-nums">{pending}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom Quiet Editorial Links */}
      <div className="space-y-0.5 border-t border-hairline px-3 py-2.5">
        <button
          type="button"
          onClick={onOpenLibrarySync}
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-ink-3 transition-colors group-hover:text-osu" />
            <span>双端曲库比对同步</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-2" />
        </button>

        <button
          type="button"
          onClick={onOpenDownloads}
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            {activeDownloads.length > 0 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-osu" />
            ) : (
              <Download className="h-3.5 w-3.5 text-ink-3 transition-colors group-hover:text-osu" />
            )}
            <span>下载队列</span>
          </span>
          <span className="flex items-center gap-1.5">
            {failedCount > 0 && (
              <span className="font-mono text-[10px] font-semibold text-bad tabular-nums">
                {failedCount} 失败
              </span>
            )}
            {(activeDownloads.length > 0 || downloads.length > 0) && (
              <span
                className={`font-mono rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
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
          className="group flex w-full items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-tint hover:text-ink"
        >
          <span className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-ink-3 transition-transform group-hover:rotate-45 group-hover:text-ink" />
            <span>设置</span>
          </span>
          <span className="text-[10px] text-ink-3">背景 · 主题 · 代理</span>
        </button>
      </div>
    </div>
  );
}
