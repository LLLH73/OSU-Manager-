import {
  ArrowRightLeft,
  ChevronRight,
  CircleDot,
  Download,
  LayoutGrid,
  Loader2,
  Medal,
  RectangleVertical,
  Settings,
  Target,
  Trophy,
  type LucideIcon,
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
}

const PRESET_VISUALS: Record<string, { icon: LucideIcon; accent: string; activeCls: string }> = {
  'lazer-pp': {
    icon: Trophy,
    accent: 'text-lazer-soft',
    activeCls: 'border-lazer/40 bg-lazer/12 text-ink',
  },
  'stable-practice': {
    icon: Target,
    accent: 'text-stable',
    activeCls: 'border-stable/40 bg-stable/12 text-ink',
  },
  'rice-4k': {
    icon: CircleDot,
    accent: 'text-stable-soft',
    activeCls: 'border-stable/35 bg-stable/10 text-ink',
  },
  'ln-4k': {
    icon: RectangleVertical,
    accent: 'text-lazer-soft',
    activeCls: 'border-lazer/35 bg-lazer/10 text-ink',
  },
  'dan-4k': {
    icon: Medal,
    accent: 'text-warn',
    activeCls: 'border-amber-500/40 bg-amber-500/12 text-ink',
  },
  'all-modes': {
    icon: LayoutGrid,
    accent: 'text-osu',
    activeCls: 'border-osu/40 bg-osu/10 text-ink',
  },
};

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
      <div className="flex-1 space-y-5 overflow-y-auto px-3.5 pt-4 pb-3">
        {/* Download target */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="overline">下载目标</span>
            <span className={`text-[10.5px] font-medium ${TARGET_META[target].textCls}`}>
              {TARGET_META[target].sub}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {TARGET_ORDER.map((t) => {
              const meta = TARGET_META[t];
              const active = target === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChangeTarget(t)}
                  title={t === 'both' ? '同时安装到 Stable + Lazer' : `下载到 ${meta.label} (${meta.sub})`}
                  className={`group relative flex flex-col items-start gap-1 overflow-hidden rounded-[10px] border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow] duration-150 ${
                    active
                      ? 'border-transparent bg-surface-2'
                      : 'border-hairline bg-tint hover:border-hairline-strong hover:bg-tint-hover'
                  }`}
                  style={
                    active
                      ? { boxShadow: `inset 0 0 0 1px ${meta.hex}85, 0 8px 22px -14px ${meta.hex}` }
                      : undefined
                  }
                >
                  <span
                    className="h-1 w-5 rounded-full transition-colors"
                    style={{ backgroundColor: active ? meta.hex : 'var(--t-ink-4)' }}
                  />
                  <span className={`font-display text-[12px] font-bold ${active ? 'text-ink' : 'text-ink-2'}`}>
                    {meta.label}
                  </span>
                  <span className={`text-[10px] ${active ? meta.textCls : 'text-ink-3'}`}>
                    {t === 'both' ? '双端同步' : meta.sub}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="segmented">
            {VARIANT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.hint}
                onClick={() => onChangeVariant(opt.value)}
                className={
                  variant === opt.value
                    ? '!bg-surface-2 !text-ink shadow-[inset_0_0_0_1px_var(--t-hairline-strong)]'
                    : ''
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Mania 4K presets */}
        <section className="space-y-1.5">
          <div className="px-0.5">
            <span className="overline">Mania 4K 场景</span>
          </div>
          <div className="space-y-0.5">
            {WORKFLOW_PRESETS.map((preset) => {
              const visual = PRESET_VISUALS[preset.id] ?? PRESET_VISUALS['all-modes'];
              const Icon = visual.icon;
              const active = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  title={preset.description}
                  className={`group flex w-full items-center gap-2.5 rounded-[9px] border px-2.5 py-[7px] text-left transition-[background-color,border-color,color] duration-150 ${
                    active
                      ? visual.activeCls
                      : 'border-transparent text-ink-2 hover:bg-tint-hover hover:text-ink'
                  }`}
                >
                  <Icon className={`h-[15px] w-[15px] shrink-0 ${visual.accent}`} strokeWidth={2} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{preset.label}</span>
                  <span
                    className={`font-stat shrink-0 rounded-[5px] px-1.5 py-px text-[9.5px] font-semibold ${
                      active ? 'bg-tint-hover text-ink' : 'bg-tint text-ink-3 group-hover:text-ink-2'
                    }`}
                  >
                    {preset.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Local dual-client library */}
        <section className="space-y-2">
          <div className="px-0.5">
            <span className="overline">本地双端曲库</span>
          </div>
          <div className="panel overflow-hidden !rounded-[12px]">
            <div className="grid grid-cols-2 divide-x divide-hairline">
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-stable-soft">
                  {library?.stableRunning ? <span className="live-dot" /> : <span className="idle-dot" />}
                  <span>Stable</span>
                </div>
                <div className="font-stat mt-1 text-[20px] leading-none font-bold text-ink">
                  {library ? library.stableCount.toLocaleString() : '—'}
                </div>
                <div className="mt-1 text-[10px] text-ink-3">
                  {library?.stableRunning ? '运行中' : library?.stableExists === false ? '未找到目录' : '未运行'}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-lazer-soft">
                  {library?.lazerRunning ? <span className="live-dot" /> : <span className="idle-dot" />}
                  <span>Lazer</span>
                  {library?.lazerDeepScanRunning && (
                    <Loader2 className="h-2.5 w-2.5 animate-spin text-lazer-soft" />
                  )}
                </div>
                <div className="font-stat mt-1 text-[20px] leading-none font-bold text-ink">
                  {library ? library.lazerCount.toLocaleString() : '—'}
                </div>
                <div className="mt-1 text-[10px] text-ink-3">
                  {library?.lazerRunning ? '运行中' : library?.lazerExists === false ? '未找到目录' : '未运行'}
                </div>
              </div>
            </div>

            {pending > 0 && (
              <div className="flex items-center justify-between border-t border-hairline bg-amber-500/10 px-3 py-1.5 text-[10.5px]">
                <span className="font-medium text-warn">Lazer 待导入 .osz</span>
                <span className="font-mono rounded-full bg-amber-500/20 px-1.5 font-semibold text-warn tabular-nums">
                  {pending}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenLibrarySync}
              className="group flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-stable" />
              <span className="flex-1">双端比对 · 零流量同步</span>
              <ChevronRight className="h-3.5 w-3.5 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
            </button>
          </div>
        </section>
      </div>

      {/* Bottom dock: queue & settings */}
      <div className="space-y-1 border-t border-hairline p-2.5">
        <button
          type="button"
          onClick={onOpenDownloads}
          className={`group flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors ${
            activeDownloads.length > 0
              ? 'bg-osu/12 text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_35%,transparent)]'
              : 'text-ink-2 hover:bg-tint-hover hover:text-ink'
          }`}
        >
          {activeDownloads.length > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin text-osu" />
          ) : (
            <Download className="h-4 w-4 text-ink-3 group-hover:text-osu" />
          )}
          <span className="flex-1 text-[12.5px] font-medium">下载队列</span>
          {failedCount > 0 && (
            <span className="font-mono rounded-full bg-rose-500/15 px-1.5 text-[10px] font-semibold text-bad tabular-nums">
              {failedCount} 失败
            </span>
          )}
          {(activeDownloads.length > 0 || downloads.length > 0) && (
            <span
              className={`font-stat min-w-[20px] rounded-full px-1.5 text-center text-[10px] font-bold ${
                activeDownloads.length > 0 ? 'bg-osu text-white' : 'bg-tint-hover text-ink-2'
              }`}
            >
              {activeDownloads.length > 0 ? activeDownloads.length : downloads.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="group flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
        >
          <Settings className="h-4 w-4 text-ink-3 transition-transform group-hover:rotate-45 group-hover:text-ink" />
          <span className="flex-1 text-[12.5px] font-medium">设置</span>
          <span className="text-[10px] text-ink-3">路径 · 代理 · 主题</span>
        </button>
      </div>
    </div>
  );
}
