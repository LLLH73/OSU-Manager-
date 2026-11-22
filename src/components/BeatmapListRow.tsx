import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Film,
  Heart,
  ImageOff,
  Loader2,
  Pause,
  Play,
  Sparkles,
  User,
} from 'lucide-react';
import {
  TARGET_META,
  formatCount,
  formatDuration,
  getLnCategory,
  getStarColor,
  getStatusBadge,
  openExternalLink,
} from '../constants';
import { DownloadTarget, DownloadTask, NormalizedBeatmapset } from '../types';

interface BeatmapListRowProps {
  beatmapset: NormalizedBeatmapset;
  activeTarget: DownloadTarget;
  isPlaying: boolean;
  activeTask?: DownloadTask;
  batchMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail: (set: NormalizedBeatmapset) => void;
}

export function BeatmapListRow({
  beatmapset,
  activeTarget,
  isPlaying,
  activeTask,
  batchMode,
  selected,
  onToggleSelect,
  onTogglePlay,
  onDownload,
  onOpenDetail,
}: BeatmapListRowProps) {
  const [imgError, setImgError] = useState(false);

  const statusBadge = getStatusBadge(beatmapset.status);
  const matchingDiffs = beatmapset.beatmaps.filter((b) => b.matchesFilter !== false);
  const sourceDiffs = matchingDiffs.length > 0 ? matchingDiffs : beatmapset.beatmaps;
  const displayDiffs = sourceDiffs.slice(0, 6);
  const hiddenDiffCount = sourceDiffs.length - displayDiffs.length;

  const primaryDiff = sourceDiffs[0];
  const lnBadge = primaryDiff ? getLnCategory(primaryDiff.lnRatio) : null;

  const isInstalled = beatmapset.localStatus.inStable || beatmapset.localStatus.inLazer;
  const inBoth = beatmapset.localStatus.inStable && beatmapset.localStatus.inLazer;

  const isDownloading = Boolean(
    activeTask &&
      (activeTask.status === 'queued' ||
        activeTask.status === 'downloading' ||
        activeTask.status === 'verifying' ||
        activeTask.status === 'installing'),
  );

  const targetMeta = TARGET_META[activeTarget];
  const primaryBtnLabel =
    activeTarget === 'lazer'
      ? '下载到 Lazer'
      : activeTarget === 'stable'
        ? '下载到 Stable'
        : '双端同步';

  const rowFrameClass = selected
    ? '!border-amber-400/80 ring-2 ring-amber-400/25'
    : inBoth
      ? 'card-installed card-installed-both'
      : isInstalled
        ? 'card-installed'
        : 'hover:border-hairline-strong';

  return (
    <article
      className={`panel group relative flex flex-col gap-2.5 overflow-hidden px-3 py-2.5 transition-[border-color,box-shadow,background-color] duration-200 md:flex-row md:items-center md:gap-3.5 ${rowFrameClass}`}
    >
      {/* Left: optional batch checkbox + Cover thumbnail */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {batchMode && (
          <button
            type="button"
            onClick={() => onToggleSelect(beatmapset.id)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors ${
              selected
                ? 'border-amber-300 bg-amber-400 text-[#120d02]'
                : 'border-hairline-strong bg-surface-2 text-ink-3 hover:border-amber-400/60'
            }`}
            title={selected ? '取消选择' : '选中'}
          >
            {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
          </button>
        )}

        <div className="cover-frame h-[62px] w-[100px] shrink-0 rounded-[9px] border border-hairline">
          {!imgError ? (
            <img
              src={beatmapset.coverUrl}
              alt={beatmapset.title}
              loading="lazy"
              onError={() => setImgError(true)}
              className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover will-change-transform transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-1 text-ink-4">
              <ImageOff className="h-5 w-5 opacity-50" />
            </div>
          )}
          <div className="cover-vignette" />

          <span
            className={`font-stat absolute top-1 left-1 inline-flex h-[16px] items-center rounded-[4px] border px-1 text-[8.5px] font-bold tracking-wider uppercase ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>

          <button
            type="button"
            onClick={() => onTogglePlay(beatmapset)}
            title={isPlaying ? '暂停试听' : '试听音频预览'}
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
              isPlaying
                ? 'bg-black/35 opacity-100'
                : 'bg-black/40 opacity-0 group-hover:opacity-100'
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
                isPlaying
                  ? 'border-osu/90 bg-osu text-white shadow-[0_4px_14px_-4px_rgba(255,102,170,0.9)]'
                  : 'border-white/35 bg-black/65 text-white hover:border-osu/80 hover:bg-osu/90'
              }`}
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
              )}
            </span>
          </button>
        </div>

        {/* Middle: Metadata & Diffs */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <button
              type="button"
              onClick={() => onOpenDetail(beatmapset)}
              className="min-w-0 max-w-full text-left"
            >
              <span
                className="font-display block truncate text-[13.5px] font-bold text-ink transition-colors group-hover:text-osu"
                title={beatmapset.titleUnicode || beatmapset.title}
              >
                {beatmapset.title}
              </span>
            </button>
            <span className="truncate text-[11.5px] text-ink-2" title={beatmapset.artistUnicode}>
              {beatmapset.artist}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
              <User className="h-3 w-3 shrink-0" />
              <span className="max-w-[120px] truncate text-ink-2">{beatmapset.creator}</span>
            </span>
            {beatmapset.video && (
              <span title="包含视频" className="text-ink-3">
                <Film className="h-3 w-3" />
              </span>
            )}
            {beatmapset.spotlight && (
              <span title="官方 Spotlight" className="text-warn">
                <Sparkles className="h-3 w-3" />
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {displayDiffs.map((bm) => {
                const color = getStarColor(bm.difficultyRating);
                const keyTag = bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
                return (
                  <span
                    key={bm.id}
                    style={{
                      backgroundColor: color.bg,
                      color: color.text,
                      borderColor: color.border,
                    }}
                    title={`${bm.version} | ${keyTag} | ${bm.difficultyRating.toFixed(2)}★ | OD ${bm.od} | HP ${bm.hp} | ${formatDuration(bm.totalLength)}${bm.lnRatio != null ? ` | LN ${bm.lnRatio}%` : ''}`}
                    className="font-stat inline-flex h-[18px] items-center gap-0.5 rounded-[5px] border px-1.5 text-[9.5px] font-bold"
                  >
                    <span>{keyTag}</span>
                    <span>{bm.difficultyRating.toFixed(2)}★</span>
                  </span>
                );
              })}
              {hiddenDiffCount > 0 && (
                <span className="chip font-stat h-[18px] text-[9.5px]">+{hiddenDiffCount}</span>
              )}
              {lnBadge && (
                <span className={`chip font-mono h-[18px] text-[9.5px] ${lnBadge.cls}`}>
                  {lnBadge.label}
                </span>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2.5 text-[10.5px] text-ink-3">
              <span className="font-stat font-semibold text-ink-2 tabular-nums">
                {Math.round(beatmapset.bpm)} BPM
              </span>
              {primaryDiff && (
                <span className="font-mono flex items-center gap-0.5 tabular-nums">
                  <Clock className="h-2.5 w-2.5" />
                  {formatDuration(primaryDiff.totalLength)}
                </span>
              )}
              <span className="font-mono flex items-center gap-0.5 text-osu-soft tabular-nums">
                <Heart className="h-2.5 w-2.5" />
                {formatCount(beatmapset.favouriteCount)}
              </span>
              <span className="font-mono hidden items-center gap-0.5 tabular-nums sm:flex">
                <Play className="h-2.5 w-2.5 fill-current" />
                {formatCount(beatmapset.playCount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Installed badges & Download controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2 md:shrink-0 md:justify-end md:border-t-0 md:pt-0">
        {(beatmapset.localStatus.inLazer ||
          beatmapset.localStatus.inStable ||
          beatmapset.localStatus.inLazerPending) && (
          <div className="flex flex-wrap items-center gap-1">
            {beatmapset.localStatus.inLazer && (
              <span className="chip chip-gold">
                <CheckCircle2 className="h-3 w-3" />
                Lazer 已装
              </span>
            )}
            {beatmapset.localStatus.inStable && (
              <span className="chip chip-gold">
                <CheckCircle2 className="h-3 w-3" />
                Stable 已装
              </span>
            )}
            {!beatmapset.localStatus.inLazer && beatmapset.localStatus.inLazerPending && (
              <span className="chip border-amber-400/50 bg-amber-500/15 text-warn">
                Lazer 待导入
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => onDownload(beatmapset, activeTarget)}
            className={`btn btn-sm ${targetMeta.btnCls}`}
          >
            {isDownloading && activeTask ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-mono tabular-nums">{activeTask.progress}%</span>
              </>
            ) : (
              <>
                <Download className="h-3 w-3" />
                <span>{primaryBtnLabel}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onDownload(beatmapset, 'stable')}
            title="单独下载到 Stable (日常练习)"
            className="font-stat btn btn-sm px-2 text-stable-soft hover:border-stable/50 hover:bg-stable/12 hover:text-stable"
          >
            S
          </button>
          <button
            type="button"
            onClick={() => onDownload(beatmapset, 'lazer')}
            title="单独下载到 Lazer (刷PP)"
            className="font-stat btn btn-sm px-2 text-lazer-soft hover:border-lazer/50 hover:bg-lazer/12 hover:text-lazer"
          >
            L
          </button>
          <button
            type="button"
            onClick={() => onDownload(beatmapset, 'both')}
            title="同时安装到 Stable + Lazer"
            className="btn btn-sm px-2 text-osu-soft hover:border-osu/50 hover:bg-osu/12 hover:text-osu"
          >
            双
          </button>
          <a
            href={beatmapset.officialUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => openExternalLink(e, beatmapset.officialUrl)}
            title="在浏览器中打开官网详情页"
            className="btn btn-sm btn-icon text-ink-3"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Bottom Live Download Progress Hairline */}
      {isDownloading && activeTask && (
        <div className="meter absolute inset-x-0 bottom-0 h-[3px] rounded-none">
          <span
            style={{
              width: `${activeTask.progress}%`,
              backgroundColor: targetMeta.hex,
            }}
          />
        </div>
      )}
    </article>
  );
}
