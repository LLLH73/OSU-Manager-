import { useState } from 'react';
import {
  Calculator,
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
import { formatPp, getBeatmapsetPpBadge, getQuickPpSummary, isRankedForPp } from '../utils/pp';

interface BeatmapCardProps {
  beatmapset: NormalizedBeatmapset;
  activeTarget: DownloadTarget;
  isPlaying: boolean;
  activeTask?: DownloadTask;
  batchMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail: (set: NormalizedBeatmapset, options?: { diffId?: number; focusPp?: boolean }) => void;
}

export function BeatmapCard({
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
}: BeatmapCardProps) {
  const [imgError, setImgError] = useState(false);

  const statusBadge = getStatusBadge(beatmapset.status);
  const matchingDiffs = beatmapset.beatmaps.filter((b) => b.matchesFilter !== false);
  const displayDiffs = (matchingDiffs.length > 0 ? matchingDiffs : beatmapset.beatmaps).slice(0, 7);
  const hiddenDiffCount =
    (matchingDiffs.length > 0 ? matchingDiffs : beatmapset.beatmaps).length - displayDiffs.length;

  const primaryDiff = matchingDiffs[0] || beatmapset.beatmaps[0];
  const lnBadge = primaryDiff ? getLnCategory(primaryDiff.lnRatio) : null;
  const ppBadge = getBeatmapsetPpBadge(beatmapset);
  const rankedForPp = isRankedForPp(beatmapset.status);

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
        : '双端同步下载';

  const cardFrameClass = selected
    ? '!border-amber-400/80 ring-2 ring-amber-400/25'
    : inBoth
      ? 'card-installed card-installed-both'
      : isInstalled
        ? 'card-installed'
        : 'hover:border-hairline-strong';

  return (
    <article
      className={`panel group relative flex flex-col overflow-hidden transition-[border-color,box-shadow,background-color] duration-200 ${cardFrameClass}`}
    >
      {/* Cover Banner (isolated layer + -1px bleed avoids subpixel seam line on hover zoom) */}
      <div className="cover-frame h-[134px] w-full">
        {!imgError ? (
          <img
            src={beatmapset.coverUrl}
            alt={beatmapset.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover will-change-transform transition-transform duration-500 ease-out group-hover:scale-[1.035]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-1 text-ink-4">
            <ImageOff className="h-8 w-8 opacity-50" />
          </div>
        )}

        <div className="cover-vignette" />

        {/* Top-left: Batch + Status + Media badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
          {batchMode && (
            <button
              type="button"
              onClick={() => onToggleSelect(beatmapset.id)}
              className={`flex h-6 w-6 items-center justify-center rounded-[7px] border transition-colors ${
                selected
                  ? 'border-amber-300 bg-amber-400 text-[#120d02]'
                  : 'border-white/35 bg-black/55 text-white hover:border-white/70'
              }`}
              title={selected ? '取消选择' : '选中'}
            >
              {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
            </button>
          )}
          <span
            className={`font-stat inline-flex h-[19px] items-center rounded-[5px] border px-1.5 text-[9.5px] font-bold tracking-wider uppercase ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>
          {beatmapset.video && (
            <span
              title="包含视频"
              className="flex h-[19px] items-center rounded-[5px] border border-white/15 bg-black/60 px-1.5 text-slate-100 backdrop-blur-sm"
            >
              <Film className="h-3 w-3" />
            </span>
          )}
          {beatmapset.spotlight && (
            <span
              title="官方 Spotlight"
              className="flex h-[19px] items-center rounded-[5px] border border-amber-300/40 bg-amber-500/25 px-1.5 text-amber-200 backdrop-blur-sm"
            >
              <Sparkles className="h-3 w-3" />
            </span>
          )}
        </div>

        {/* Top-right: Installed Status Badges */}
        <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
          {beatmapset.localStatus.inLazer && (
            <span className="chip chip-gold backdrop-blur-sm">
              <CheckCircle2 className="h-3 w-3" />
              Lazer 已装
            </span>
          )}
          {beatmapset.localStatus.inStable && (
            <span className="chip chip-gold backdrop-blur-sm">
              <CheckCircle2 className="h-3 w-3" />
              Stable 已装
            </span>
          )}
          {!beatmapset.localStatus.inLazer && beatmapset.localStatus.inLazerPending && (
            <span className="chip border-amber-300/60 bg-black/75 text-amber-200 backdrop-blur-sm">
              Lazer 待导入
            </span>
          )}
        </div>

        {/* Play Preview Trigger */}
        <button
          type="button"
          onClick={() => onTogglePlay(beatmapset)}
          title={isPlaying ? '暂停试听' : '试听音频预览'}
          className={`absolute bottom-2.5 left-2.5 flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold backdrop-blur-md transition-colors ${
            isPlaying
              ? 'border-osu/80 bg-osu text-white shadow-[0_6px_18px_-6px_rgba(255,102,170,0.85)]'
              : 'border-white/25 bg-black/60 text-white hover:border-osu/70 hover:bg-osu/90'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause className="h-3 w-3" />
              <span className="eq h-[10px]">
                <i />
                <i />
                <i />
                <i />
              </span>
            </>
          ) : (
            <>
              <Play className="h-3 w-3 fill-current" />
              <span>试听</span>
            </>
          )}
        </button>

        {/* Bottom-right: BPM & Duration */}
        <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1 text-[10.5px] font-medium text-white tabular-nums">
          <span className="font-stat rounded-[5px] border border-white/15 bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
            {Math.round(beatmapset.bpm)} BPM
          </span>
          {primaryDiff && (
            <span className="font-mono flex items-center gap-1 rounded-[5px] border border-white/15 bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
              <Clock className="h-2.5 w-2.5 text-slate-300" />
              {formatDuration(primaryDiff.totalLength)}
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div>
          <button
            type="button"
            onClick={() => onOpenDetail(beatmapset)}
            className="w-full text-left"
          >
            <h3
              className="font-display line-clamp-1 text-[14px] font-bold text-ink transition-colors group-hover:text-osu"
              title={beatmapset.titleUnicode || beatmapset.title}
            >
              {beatmapset.title}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-2" title={beatmapset.artistUnicode}>
              {beatmapset.artist}
            </p>
          </button>

          {/* Mapper & Engagement */}
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-3">
            <span className="flex min-w-0 items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium text-ink-2">{beatmapset.creator}</span>
            </span>
            <div className="font-mono flex shrink-0 items-center gap-2.5 text-[10.5px]">
              <span className="flex items-center gap-1 text-osu-soft">
                <Heart className="h-3 w-3" />
                {formatCount(beatmapset.favouriteCount)}
              </span>
              <span className="flex items-center gap-0.5 text-ink-3">
                <Play className="h-2.5 w-2.5 fill-current" />
                {formatCount(beatmapset.playCount)}
              </span>
            </div>
          </div>

          {/* Solid Official Spectrum Difficulty Pills */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1">
            {displayDiffs.map((bm) => {
              const color = getStarColor(bm.difficultyRating);
              const keyTag = bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
              const ppQuick = rankedForPp ? getQuickPpSummary(bm, 1) : null;
              return (
                <span
                  key={bm.id}
                  style={{
                    backgroundColor: color.bg,
                    color: color.text,
                    borderColor: color.border,
                  }}
                  title={`${bm.version} | ${keyTag} | ${bm.difficultyRating.toFixed(2)}★ | OD ${bm.od} | HP ${bm.hp} | ${formatDuration(bm.totalLength)}${bm.lnRatio != null ? ` | LN ${bm.lnRatio}%` : ''}${ppQuick ? ` | ~${formatPp(ppQuick.pp98)}pp(98%) / ~${formatPp(ppQuick.pp100)}pp(SS)` : ''}`}
                  className="font-stat inline-flex h-[19px] shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-[10px] leading-none font-bold whitespace-nowrap"
                >
                  <span>{keyTag}</span>
                  <span>{bm.difficultyRating.toFixed(2)}★</span>
                </span>
              );
            })}
            {hiddenDiffCount > 0 && (
              <span className="chip font-stat h-[19px] text-[10px]">+{hiddenDiffCount}</span>
            )}
            {lnBadge && (
              <span className={`chip font-mono h-[19px] text-[10px] ${lnBadge.cls}`}>
                {lnBadge.label}
              </span>
            )}
            {ppBadge && (
              <button
                type="button"
                onClick={() =>
                  onOpenDetail(beatmapset, { diffId: ppBadge.focusDiffId, focusPp: true })
                }
                title={ppBadge.tooltip}
                className="chip chip-pp font-stat h-[19px] text-[10px]"
              >
                <Calculator className="h-2.5 w-2.5" />
                <span>{ppBadge.label}</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-2.5">
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => onDownload(beatmapset, activeTarget)}
            className={`btn btn-sm flex-1 ${targetMeta.btnCls}`}
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
