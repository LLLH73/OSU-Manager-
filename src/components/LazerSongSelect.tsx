import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Disc3,
  Download,
  ExternalLink,
  Film,
  Heart,
  ImageOff,
  Info,
  Keyboard,
  Loader2,
  Pause,
  Play,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react';
import {
  TARGET_META,
  formatCount,
  formatDuration,
  getLnCategory,
  getStarColor,
  getStarSpectrum,
  getStatusBadge,
  openExternalLink,
} from '../constants';
import { DownloadTarget, DownloadTask, NormalizedBeatmap, NormalizedBeatmapset } from '../types';

interface LazerSongSelectProps {
  results: NormalizedBeatmapset[];
  activeTarget: DownloadTarget;
  playingSetId: number | null;
  isPlaying: boolean;
  activeTaskBySet: Map<number, DownloadTask>;
  batchMode: boolean;
  selectedIds: Set<number>;
  hasMore: boolean;
  loadingMore: boolean;
  hasAudioDock: boolean;
  onToggleSelect: (id: number) => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onStartPlay: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail: (set: NormalizedBeatmapset) => void;
  onLoadMore: () => void;
}

const AUTO_PREVIEW_STORAGE_KEY = 'osu4k-lazer-autopreview';

function readInitialAutoPreview(): boolean {
  try {
    return localStorage.getItem(AUTO_PREVIEW_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getDisplayDiffs(set: NormalizedBeatmapset): NormalizedBeatmap[] {
  const matching = set.beatmaps.filter((b) => b.matchesFilter !== false);
  const base = matching.length > 0 ? matching : set.beatmaps;
  return [...base].sort((a, b) => a.difficultyRating - b.difficultyRating);
}

export function LazerSongSelect({
  results,
  activeTarget,
  playingSetId,
  isPlaying,
  activeTaskBySet,
  batchMode,
  selectedIds,
  hasMore,
  loadingMore,
  hasAudioDock,
  onToggleSelect,
  onTogglePlay,
  onStartPlay,
  onDownload,
  onOpenDetail,
  onLoadMore,
}: LazerSongSelectProps) {
  const [activeSetId, setActiveSetId] = useState<number | null>(() => {
    if (playingSetId && results.some((r) => r.id === playingSetId)) return playingSetId;
    return results[0]?.id ?? null;
  });
  const [activeDiffId, setActiveDiffId] = useState<number | null>(null);
  const [autoPreview, setAutoPreview] = useState<boolean>(readInitialAutoPreview);
  const [brokenCovers, setBrokenCovers] = useState<Set<number>>(() => new Set());

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const shouldScrollToActiveRef = useRef(false);

  const markCoverBroken = useCallback((id: number) => {
    setBrokenCovers((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Keep activeSetId valid across new searches without resetting when appending more pages
  useEffect(() => {
    if (results.length === 0) {
      setActiveSetId(null);
      return;
    }
    setActiveSetId((prev) => {
      if (prev !== null && results.some((r) => r.id === prev)) return prev;
      if (playingSetId && results.some((r) => r.id === playingSetId)) return playingSetId;
      return results[0].id;
    });
  }, [results, playingSetId]);

  const activeSet = useMemo(
    () => results.find((r) => r.id === activeSetId) ?? results[0] ?? null,
    [results, activeSetId],
  );

  const activeDiffs = useMemo(
    () => (activeSet ? getDisplayDiffs(activeSet) : []),
    [activeSet],
  );

  // Sync activeDiffId whenever activeSet changes
  useEffect(() => {
    if (!activeSet || activeDiffs.length === 0) {
      setActiveDiffId(null);
      return;
    }
    setActiveDiffId((prev) => {
      if (prev !== null && activeDiffs.some((d) => d.id === prev)) return prev;
      return activeDiffs[0].id;
    });
  }, [activeSet, activeDiffs]);

  const activeDiffIndex = useMemo(() => {
    if (activeDiffs.length === 0) return -1;
    const idx = activeDiffs.findIndex((d) => d.id === activeDiffId);
    return idx >= 0 ? idx : 0;
  }, [activeDiffs, activeDiffId]);

  const activeDiff = activeDiffIndex >= 0 ? activeDiffs[activeDiffIndex] : null;

  const selectBeatmapset = useCallback(
    (set: NormalizedBeatmapset, scrollIntoView = true) => {
      shouldScrollToActiveRef.current = scrollIntoView;
      setActiveSetId(set.id);
      const diffs = getDisplayDiffs(set);
      setActiveDiffId(diffs[0]?.id ?? null);
      if (autoPreview) {
        onStartPlay(set);
      }
    },
    [autoPreview, onStartPlay],
  );

  const toggleAutoPreview = () => {
    setAutoPreview((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_PREVIEW_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage error
      }
      if (next && activeSet) {
        onStartPlay(activeSet);
      }
      return next;
    });
  };

  // Curved arc motion engine (pure CSS var updates inside rAF, zero React re-renders during scroll)
  const updateArcPositions = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;
    const vpRect = container.getBoundingClientRect();
    const vpHeight = Math.max(240, vpRect.height);
    const vpCenterY = vpRect.top + vpHeight / 2;
    const normDenominator = Math.max(180, vpHeight * 0.56);

    const slots = container.querySelectorAll<HTMLElement>('[data-lazer-slot]');
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const slotCenterY = rect.top + rect.height / 2;
      const ny = Math.max(-1.25, Math.min(1.25, (slotCenterY - vpCenterY) / normDenominator));
      const arcX = Math.round(ny * ny * 34);
      const arcOpacity = Number(Math.max(0.64, 1 - Math.abs(ny) * 0.24).toFixed(3));
      slot.style.setProperty('--arc-x', `${arcX}px`);
      slot.style.setProperty('--arc-opacity', String(arcOpacity));
    }
  }, []);

  const scheduleArcUpdate = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateArcPositions();
    });
  }, [updateArcPositions]);

  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    scheduleArcUpdate();
    const onScroll = () => scheduleArcUpdate();
    container.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => scheduleArcUpdate());
    ro.observe(container);

    return () => {
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [scheduleArcUpdate]);

  useEffect(() => {
    scheduleArcUpdate();
    const timer = window.setTimeout(() => scheduleArcUpdate(), 290);
    return () => window.clearTimeout(timer);
  }, [results.length, activeSetId, scheduleArcUpdate]);

  // Smoothly scroll newly selected beatmapset toward the center of the carousel
  useEffect(() => {
    if (!shouldScrollToActiveRef.current || activeSetId === null) return;
    shouldScrollToActiveRef.current = false;
    const container = carouselRef.current;
    if (!container) return;
    const slot = container.querySelector<HTMLElement>(`[data-set-id="${activeSetId}"]`);
    if (!slot) return;

    const vpRect = container.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const currentOffset = slotRect.top - vpRect.top + container.scrollTop;
    const targetTop = Math.max(0, currentOffset - Math.max(40, (container.clientHeight - slotRect.height) * 0.42));
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [activeSetId]);

  // Keyboard navigation (disabled when typing in inputs or when any dialog modal is open)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl) {
        const tag = targetEl.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          targetEl.isContentEditable
        ) {
          return;
        }
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (results.length === 0) return;

      const currentIdx = activeSet ? results.findIndex((r) => r.id === activeSet.id) : 0;

      if (e.key === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        const nextIdx = Math.min(results.length - 1, currentIdx + 1);
        if (results[nextIdx]) selectBeatmapset(results[nextIdx], true);
      } else if (e.key === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        const prevIdx = Math.max(0, currentIdx - 1);
        if (results[prevIdx]) selectBeatmapset(results[prevIdx], true);
      } else if (e.key === 'ArrowRight' && activeDiffs.length > 1) {
        e.preventDefault();
        const nextDiffIdx = (activeDiffIndex + 1) % activeDiffs.length;
        setActiveDiffId(activeDiffs[nextDiffIdx].id);
      } else if (e.key === 'ArrowLeft' && activeDiffs.length > 1) {
        e.preventDefault();
        const prevDiffIdx = (activeDiffIndex - 1 + activeDiffs.length) % activeDiffs.length;
        setActiveDiffId(activeDiffs[prevDiffIdx].id);
      } else if (e.code === 'Space' && activeSet) {
        e.preventDefault();
        onTogglePlay(activeSet);
      } else if (e.key === 'Enter' && activeSet) {
        if (targetEl && (targetEl.tagName === 'BUTTON' || targetEl.tagName === 'A')) return;
        e.preventDefault();
        onOpenDetail(activeSet);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    results,
    activeSet,
    activeDiffs,
    activeDiffIndex,
    selectBeatmapset,
    onTogglePlay,
    onOpenDetail,
  ]);

  if (!activeSet) return null;

  const targetMeta = TARGET_META[activeTarget];
  const primaryBtnLabel =
    activeTarget === 'lazer'
      ? '下载到 Lazer'
      : activeTarget === 'stable'
        ? '下载到 Stable'
        : '双端同步下载';

  const activeInstalled = activeSet.localStatus.inStable || activeSet.localStatus.inLazer;
  const activeInBoth = activeSet.localStatus.inStable && activeSet.localStatus.inLazer;
  const activeTask = activeTaskBySet.get(activeSet.id);
  const activeDownloading = Boolean(
    activeTask &&
      (activeTask.status === 'queued' ||
        activeTask.status === 'downloading' ||
        activeTask.status === 'verifying' ||
        activeTask.status === 'installing'),
  );
  const activePlaying = isPlaying && playingSetId === activeSet.id;
  const activeStatusBadge = getStatusBadge(activeSet.status);
  const activeLnBadge = activeDiff ? getLnCategory(activeDiff.lnRatio) : null;

  const activeTotalObjects = activeDiff
    ? activeDiff.countCircles + activeDiff.countSliders + activeDiff.countSpinners
    : 0;

  const statMeters = activeDiff
    ? [
        {
          label: 'SR',
          display: `${activeDiff.difficultyRating.toFixed(2)}★`,
          pct: Math.min(100, Math.max(5, (activeDiff.difficultyRating / 10) * 100)),
          color: getStarSpectrum(activeDiff.difficultyRating),
        },
        {
          label: 'OD',
          display: activeDiff.od.toFixed(1),
          pct: Math.min(100, Math.max(5, (activeDiff.od / 10) * 100)),
          color: 'var(--t-stable)',
        },
        {
          label: 'HP',
          display: activeDiff.hp.toFixed(1),
          pct: Math.min(100, Math.max(5, (activeDiff.hp / 10) * 100)),
          color: 'var(--t-lazer)',
        },
        {
          label: 'LN%',
          display: activeDiff.lnRatio != null ? `${activeDiff.lnRatio}%` : '—',
          pct: activeDiff.lnRatio != null ? Math.min(100, Math.max(3, activeDiff.lnRatio)) : 0,
          color: 'var(--t-osu)',
        },
      ]
    : [];

  return (
    <section
      aria-label="osu!lazer 选歌轮盘视图"
      className="lazer-stage relative overflow-hidden rounded-[18px] border border-hairline shadow-lg"
    >
      {/* Dynamic blurred backdrop derived from the active song cover */}
      {!brokenCovers.has(activeSet.id) && (
        <img
          key={`bg-${activeSet.id}`}
          src={activeSet.coverUrl}
          alt=""
          aria-hidden="true"
          onError={() => markCoverBroken(activeSet.id)}
          className="lazer-bg-enter pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl select-none"
        />
      )}
      <div className="lazer-stage-scrim pointer-events-none absolute inset-0" />

      <div className="relative z-10 grid grid-cols-1 lg:h-[670px] lg:grid-cols-[minmax(360px,430px)_minmax(0,1fr)] xl:grid-cols-[minmax(390px,460px)_minmax(0,1fr)]">
        {/* LEFT: osu!lazer Wedge Showcase */}
        <div className="flex min-h-0 flex-col justify-between gap-3 border-b border-hairline p-4 sm:p-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div
            className={`panel relative flex flex-col gap-3.5 overflow-hidden p-3.5 transition-[border-color,box-shadow] duration-200 ${
              activeInBoth
                ? 'card-installed card-installed-both'
                : activeInstalled
                  ? 'card-installed'
                  : ''
            }`}
          >
            {/* Cover Header */}
            <div className="cover-frame h-[168px] w-full rounded-[11px] border border-hairline">
              {!brokenCovers.has(activeSet.id) ? (
                <img
                  src={activeSet.coverUrl}
                  alt={activeSet.title}
                  onError={() => markCoverBroken(activeSet.id)}
                  className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-1 text-ink-4">
                  <ImageOff className="h-9 w-9 opacity-50" />
                </div>
              )}
              <div className="cover-vignette" />

              {/* Top-left badges */}
              <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`font-stat inline-flex h-[20px] items-center rounded-[5px] border px-1.5 text-[9.5px] font-bold tracking-wider uppercase ${activeStatusBadge.cls}`}
                >
                  {activeStatusBadge.label}
                </span>
                {activeSet.video && (
                  <span
                    title="包含视频"
                    className="flex h-[20px] items-center rounded-[5px] border border-white/15 bg-black/60 px-1.5 text-slate-100 backdrop-blur-sm"
                  >
                    <Film className="h-3 w-3" />
                  </span>
                )}
                {activeSet.spotlight && (
                  <span
                    title="官方 Spotlight"
                    className="flex h-[20px] items-center rounded-[5px] border border-amber-300/40 bg-amber-500/25 px-1.5 text-amber-200 backdrop-blur-sm"
                  >
                    <Sparkles className="h-3 w-3" />
                  </span>
                )}
              </div>

              {/* Top-right gold installed badges */}
              <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
                {activeSet.localStatus.inLazer && (
                  <span className="chip chip-gold backdrop-blur-sm">
                    <CheckCircle2 className="h-3 w-3" />
                    Lazer 已装
                  </span>
                )}
                {activeSet.localStatus.inStable && (
                  <span className="chip chip-gold backdrop-blur-sm">
                    <CheckCircle2 className="h-3 w-3" />
                    Stable 已装
                  </span>
                )}
                {!activeSet.localStatus.inLazer && activeSet.localStatus.inLazerPending && (
                  <span className="chip border-amber-300/60 bg-black/75 text-amber-200 backdrop-blur-sm">
                    Lazer 待导入
                  </span>
                )}
              </div>

              {/* Bottom-left: Play + Auto preview */}
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onTogglePlay(activeSet)}
                  className={`flex h-[28px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur-md transition-colors ${
                    activePlaying
                      ? 'border-osu/80 bg-osu text-white shadow-[0_6px_18px_-6px_rgba(255,102,170,0.85)]'
                      : 'border-white/25 bg-black/65 text-white hover:border-osu/70 hover:bg-osu/90'
                  }`}
                >
                  {activePlaying ? (
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
                      <span>试听预览</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleAutoPreview}
                  title="切歌时自动播放音频预览"
                  className={`flex h-[28px] items-center gap-1 rounded-full border px-2.5 text-[10.5px] font-medium backdrop-blur-md transition-colors ${
                    autoPreview
                      ? 'border-lazer/80 bg-lazer/85 text-white'
                      : 'border-white/20 bg-black/60 text-slate-200 hover:border-white/45'
                  }`}
                >
                  <Volume2 className="h-3 w-3" />
                  <span>自动试听</span>
                </button>
              </div>

              {/* Bottom-right: BPM & Duration */}
              <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1 text-[10.5px] font-medium text-white tabular-nums">
                <span className="font-stat rounded-[5px] border border-white/15 bg-black/65 px-1.5 py-0.5 backdrop-blur-sm">
                  {Math.round(activeSet.bpm)} BPM
                </span>
                {activeDiff && (
                  <span className="font-mono flex items-center gap-1 rounded-[5px] border border-white/15 bg-black/65 px-1.5 py-0.5 backdrop-blur-sm">
                    <Clock className="h-2.5 w-2.5 text-slate-300" />
                    {formatDuration(activeDiff.totalLength)}
                  </span>
                )}
              </div>
            </div>

            {/* Song Identity */}
            <div className="space-y-1">
              <h2
                className="font-display line-clamp-2 text-[17px] leading-snug font-bold text-ink"
                title={activeSet.titleUnicode || activeSet.title}
              >
                {activeSet.title}
              </h2>
              {activeSet.titleUnicode && activeSet.titleUnicode !== activeSet.title && (
                <p className="line-clamp-1 text-[11.5px] text-ink-3">{activeSet.titleUnicode}</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11.5px] text-ink-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{activeSet.artist}</span>
                  <span className="text-ink-4">·</span>
                  <span className="inline-flex min-w-0 items-center gap-1 text-ink-3">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="truncate text-ink-2">{activeSet.creator}</span>
                  </span>
                </div>
                <div className="font-mono flex shrink-0 items-center gap-2.5 text-[10.5px]">
                  <span className="flex items-center gap-1 text-osu-soft">
                    <Heart className="h-3 w-3" />
                    {formatCount(activeSet.favouriteCount)}
                  </span>
                  <span className="flex items-center gap-0.5 text-ink-3">
                    <Play className="h-2.5 w-2.5 fill-current" />
                    {formatCount(activeSet.playCount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Selected Difficulty Panel */}
            {activeDiff && (
              <div className="panel-flat space-y-2.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {(() => {
                      const c = getStarColor(activeDiff.difficultyRating);
                      const keyTag =
                        activeDiff.modeInt === 3
                          ? `${Math.round(activeDiff.cs)}K`
                          : activeDiff.mode.toUpperCase();
                      return (
                        <span
                          style={{
                            backgroundColor: c.bg,
                            color: c.text,
                            borderColor: c.border,
                          }}
                          className="font-stat inline-flex h-[20px] shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-[10.5px] font-bold"
                        >
                          <span>{keyTag}</span>
                          <span>{activeDiff.difficultyRating.toFixed(2)}★</span>
                        </span>
                      );
                    })()}
                    <span className="truncate text-[12px] font-semibold text-ink" title={activeDiff.version}>
                      {activeDiff.version}
                    </span>
                    {activeLnBadge && (
                      <span className={`chip font-mono h-[19px] shrink-0 text-[9.5px] ${activeLnBadge.cls}`}>
                        {activeLnBadge.label}
                      </span>
                    )}
                  </div>

                  {activeDiffs.length > 1 && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const prevIdx =
                            (activeDiffIndex - 1 + activeDiffs.length) % activeDiffs.length;
                          setActiveDiffId(activeDiffs[prevIdx].id);
                        }}
                        title="上一个难度 (←)"
                        className="btn btn-sm btn-icon h-[22px] w-[22px]"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="font-mono px-1 text-[10px] text-ink-3 tabular-nums">
                        {activeDiffIndex + 1}/{activeDiffs.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = (activeDiffIndex + 1) % activeDiffs.length;
                          setActiveDiffId(activeDiffs[nextIdx].id);
                        }}
                        title="下一个难度 (→)"
                        className="btn btn-sm btn-icon h-[22px] w-[22px]"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 4 Animated osu!lazer Attribute Meters */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {statMeters.map((m) => (
                    <div key={m.label} className="space-y-1">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-stat font-semibold text-ink-3">{m.label}</span>
                        <span className="font-stat font-bold text-ink tabular-nums">
                          {m.display}
                        </span>
                      </div>
                      <div className="meter h-[4px]">
                        <span
                          style={{
                            width: `${m.pct}%`,
                            backgroundColor: m.color,
                            transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Note Breakdown Strip */}
                <div className="font-mono grid grid-cols-5 gap-1 border-t border-hairline pt-2 text-center text-[10px] tabular-nums">
                  <div>
                    <div className="text-ink-3">总物件</div>
                    <div className="font-semibold text-ink">{activeTotalObjects}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">单键</div>
                    <div className="font-semibold text-ink">{activeDiff.countCircles}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">长条</div>
                    <div className="font-semibold text-ink">{activeDiff.countSliders}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">时长</div>
                    <div className="font-semibold text-ink">
                      {formatDuration(activeDiff.totalLength)}
                    </div>
                  </div>
                  <div>
                    <div className="text-ink-3">Combo</div>
                    <div className="font-semibold text-ink">{activeDiff.maxCombo ?? '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Download Actions */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={activeDownloading}
                  onClick={() => onDownload(activeSet, activeTarget)}
                  className={`btn flex-1 ${targetMeta.btnCls}`}
                >
                  {activeDownloading && activeTask ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="font-mono tabular-nums">{activeTask.progress}%</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      <span>{primaryBtnLabel}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onDownload(activeSet, 'stable')}
                  title="单独下载到 Stable (日常练习)"
                  className="font-stat btn px-2.5 text-stable-soft hover:border-stable/50 hover:bg-stable/12 hover:text-stable"
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(activeSet, 'lazer')}
                  title="单独下载到 Lazer (刷PP)"
                  className="font-stat btn px-2.5 text-lazer-soft hover:border-lazer/50 hover:bg-lazer/12 hover:text-lazer"
                >
                  L
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(activeSet, 'both')}
                  title="同时安装到 Stable + Lazer"
                  className="btn px-2.5 text-osu-soft hover:border-osu/50 hover:bg-osu/12 hover:text-osu"
                >
                  双
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenDetail(activeSet)}
                  className="btn btn-sm flex-1"
                >
                  <Info className="h-3.5 w-3.5 text-osu" />
                  <span>完整详情与标签</span>
                </button>
                <a
                  href={activeSet.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => openExternalLink(e, activeSet.officialUrl)}
                  title="在浏览器中打开官网详情页"
                  className="btn btn-sm px-2.5 text-ink-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>官网</span>
                </a>
              </div>
            </div>

            {activeDownloading && activeTask && (
              <div className="meter absolute inset-x-0 bottom-0 h-[3px] rounded-none">
                <span
                  style={{
                    width: `${activeTask.progress}%`,
                    backgroundColor: targetMeta.hex,
                  }}
                />
              </div>
            )}
          </div>

          {/* Keyboard Hints Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-hairline bg-surface-0/75 px-3 py-1.5 text-[10.5px] text-ink-3 backdrop-blur-md">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
              <Keyboard className="h-3.5 w-3.5 text-lazer-soft" />
              <span>快捷键导航</span>
            </span>
            <span className="font-mono flex flex-wrap items-center gap-2 text-[10px]">
              <span>↑↓/WS 切歌</span>
              <span>←→ 切难度</span>
              <span>Space 试听</span>
              <span>Enter 详情</span>
            </span>
          </div>
        </div>

        {/* RIGHT: Curved osu!lazer Carousel */}
        <div
          ref={carouselRef}
          className={`relative min-h-0 max-h-[560px] overflow-x-hidden overflow-y-auto py-5 pr-3 pl-8 sm:pr-4 sm:pl-10 lg:max-h-none ${
            hasAudioDock ? 'pb-24' : 'pb-6'
          }`}
        >
          <div className="space-y-2.5">
            {results.map((set) => {
              const isActive = activeSet.id === set.id;
              const isInstalled = set.localStatus.inStable || set.localStatus.inLazer;
              const inBoth = set.localStatus.inStable && set.localStatus.inLazer;
              const isSelected = selectedIds.has(set.id);
              const setTask = activeTaskBySet.get(set.id);
              const setDownloading = Boolean(
                setTask &&
                  (setTask.status === 'queued' ||
                    setTask.status === 'downloading' ||
                    setTask.status === 'verifying' ||
                    setTask.status === 'installing'),
              );
              const setPlaying = isPlaying && playingSetId === set.id;
              const setStatusBadge = getStatusBadge(set.status);
              const setDiffs = getDisplayDiffs(set);
              const previewDiffs = setDiffs.slice(0, 5);
              const extraDiffCount = setDiffs.length - previewDiffs.length;
              const leadDiff = setDiffs[0];

              const frameClass = isSelected
                ? '!border-amber-400/80 ring-2 ring-amber-400/25'
                : inBoth
                  ? 'card-installed card-installed-both'
                  : isInstalled
                    ? 'card-installed'
                    : 'border-hairline hover:border-hairline-strong';

              return (
                <div
                  key={set.id}
                  data-lazer-slot
                  data-set-id={set.id}
                  data-active={isActive ? 'true' : 'false'}
                  className="lazer-slot"
                >
                  {/* Main Slanted Beatmapset Card */}
                  <div
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => selectBeatmapset(set, true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectBeatmapset(set, true);
                      }
                    }}
                    className={`lazer-set-card group relative flex min-h-[88px] cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-[13px] border px-3.5 py-2.5 ${frameClass}`}
                  >
                    {/* Right Slanted Cover Art inside GPU-isolated .cover-frame */}
                    <div className="lazer-cover-slant cover-frame">
                      {!brokenCovers.has(set.id) ? (
                        <img
                          src={set.coverUrl}
                          alt=""
                          loading="lazy"
                          onError={() => markCoverBroken(set.id)}
                          className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover opacity-80 will-change-transform transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="h-full w-full bg-surface-2 opacity-60" />
                      )}
                    </div>

                    {/* Gradient Scrim keeping left text crisp on every theme */}
                    <div className="lazer-card-scrim" />

                    {/* Left Slanted Accent Stripe */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[5px] transition-opacity"
                      style={{
                        background: isInstalled
                          ? 'var(--gold-border)'
                          : isActive
                            ? 'linear-gradient(180deg, var(--t-osu) 0%, var(--t-lazer) 100%)'
                            : 'var(--t-hairline-strong)',
                      }}
                    />

                    {/* Left Content */}
                    <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 pl-1.5">
                      {batchMode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelect(set.id);
                          }}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors ${
                            isSelected
                              ? 'border-amber-300 bg-amber-400 text-[#120d02]'
                              : 'border-hairline-strong bg-surface-2/85 text-ink-3 hover:border-amber-400/60'
                          }`}
                          title={isSelected ? '取消选择' : '选中'}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </button>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-stat inline-flex h-[17px] shrink-0 items-center rounded-[4px] border px-1 text-[8.5px] font-bold tracking-wider uppercase ${setStatusBadge.cls}`}
                          >
                            {setStatusBadge.label}
                          </span>
                          <h3
                            className={`font-display truncate text-[13.5px] font-bold transition-colors ${
                              isActive ? 'text-osu' : 'text-ink group-hover:text-osu'
                            }`}
                          >
                            {set.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1.5 truncate text-[11px] text-ink-2">
                          <span className="truncate">{set.artist}</span>
                          <span className="text-ink-4">//</span>
                          <span className="truncate text-ink-3">{set.creator}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {previewDiffs.map((bm) => {
                            const c = getStarColor(bm.difficultyRating);
                            const keyTag =
                              bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
                            return (
                              <span
                                key={bm.id}
                                style={{
                                  backgroundColor: c.bg,
                                  color: c.text,
                                  borderColor: c.border,
                                }}
                                className="font-stat inline-flex h-[17px] items-center gap-0.5 rounded-[4px] border px-1 text-[9px] font-bold"
                              >
                                <span>{keyTag}</span>
                                <span>{bm.difficultyRating.toFixed(2)}★</span>
                              </span>
                            );
                          })}
                          {extraDiffCount > 0 && (
                            <span className="chip font-stat h-[17px] px-1 text-[9px]">
                              +{extraDiffCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Badges & Quick Actions */}
                    <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1">
                        {set.localStatus.inLazer && (
                          <span className="chip chip-gold h-[18px] px-1.5 text-[9.5px] backdrop-blur-sm">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Lazer
                          </span>
                        )}
                        {set.localStatus.inStable && (
                          <span className="chip chip-gold h-[18px] px-1.5 text-[9.5px] backdrop-blur-sm">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Stable
                          </span>
                        )}
                        {!set.localStatus.inLazer && set.localStatus.inLazerPending && (
                          <span className="chip h-[18px] border-amber-300/60 bg-black/75 px-1.5 text-[9.5px] text-amber-200 backdrop-blur-sm">
                            待导入
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="font-mono hidden rounded-[5px] border border-white/15 bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm sm:inline">
                          {Math.round(set.bpm)} BPM
                          {leadDiff ? ` · ${formatDuration(leadDiff.totalLength)}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePlay(set);
                          }}
                          title={setPlaying ? '暂停试听' : '试听'}
                          className={`flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
                            setPlaying
                              ? 'border-osu/80 bg-osu text-white'
                              : 'border-white/25 bg-black/60 text-white hover:border-osu/80 hover:bg-osu/90'
                          }`}
                        >
                          {setPlaying ? (
                            <Pause className="h-3 w-3" />
                          ) : (
                            <Play className="h-3 w-3 translate-x-[0.5px] fill-current" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={setDownloading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownload(set, activeTarget);
                          }}
                          title={primaryBtnLabel}
                          className={`btn btn-sm h-7 px-2 ${targetMeta.btnCls}`}
                        >
                          {setDownloading && setTask ? (
                            <span className="font-mono text-[10px] tabular-nums">
                              {setTask.progress}%
                            </span>
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {setDownloading && setTask && (
                      <div className="meter absolute inset-x-0 bottom-0 z-20 h-[2.5px] rounded-none">
                        <span
                          style={{
                            width: `${setTask.progress}%`,
                            backgroundColor: targetMeta.hex,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Accordion Difficulty List (expands smoothly when active) */}
                  <div
                    data-open={isActive ? 'true' : 'false'}
                    className="lazer-diff-accordion pl-5"
                  >
                    <div>
                      <div className="max-h-[240px] space-y-1 overflow-y-auto pt-1.5 pr-0.5 pb-0.5">
                        {setDiffs.map((bm) => {
                          const diffActive = activeDiff?.id === bm.id;
                          const c = getStarColor(bm.difficultyRating);
                          const keyTag =
                            bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
                          const ln = getLnCategory(bm.lnRatio);
                          return (
                            <button
                              key={bm.id}
                              type="button"
                              data-active={diffActive ? 'true' : 'false'}
                              onClick={() => setActiveDiffId(bm.id)}
                              className={`lazer-diff-row flex w-full items-center justify-between gap-2 rounded-[9px] border px-3 py-1.5 text-left ${
                                diffActive
                                  ? 'border-osu/60 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_25%,transparent)]'
                                  : 'border-hairline hover:border-hairline-strong'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  style={{
                                    backgroundColor: c.bg,
                                    color: c.text,
                                    borderColor: c.border,
                                  }}
                                  className="font-stat inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-[9.5px] font-bold"
                                >
                                  <span>{keyTag}</span>
                                  <span>{bm.difficultyRating.toFixed(2)}★</span>
                                </span>
                                <span className="truncate text-[11.5px] font-semibold text-ink">
                                  {bm.version}
                                </span>
                                {diffActive && (
                                  <Disc3 className="h-3 w-3 shrink-0 animate-[spin_4s_linear_infinite] text-osu" />
                                )}
                              </div>

                              <div className="font-mono flex shrink-0 items-center gap-2 text-[10px] text-ink-3 tabular-nums">
                                {ln && (
                                  <span className={`chip h-[17px] px-1.5 text-[9px] ${ln.cls}`}>
                                    {ln.label}
                                  </span>
                                )}
                                <span>OD {bm.od}</span>
                                <span>HP {bm.hp}</span>
                                <span>{formatDuration(bm.totalLength)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="btn h-9 bg-surface-2/90 px-6 text-[13px] backdrop-blur-md"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin text-osu" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-osu" />
                )}
                <span>{loadingMore ? '加载中…' : '加载更多谱面'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
