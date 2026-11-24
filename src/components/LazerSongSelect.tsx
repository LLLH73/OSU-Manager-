import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  ArrowUp,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Disc3,
  Download,
  ExternalLink,
  Eye,
  Film,
  Heart,
  ImageOff,
  Info,
  Keyboard,
  Loader2,
  LocateFixed,
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
import {
  PpScenarioInput,
  calculateBeatmapPp,
  formatPp,
  getBeatmapsetPpBadge,
  getQuickPpSummary,
  isRankedForPp,
} from '../utils/pp';
import { MarqueeText } from './MarqueeText';

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
  searchError?: boolean;
  hasAudioDock: boolean;
  hasGlobalBg?: boolean;
  filterCollapsed?: boolean;
  compactStage?: boolean;
  ppScenario?: Partial<PpScenarioInput>;
  restoreTarget?: { beatmapsetId: number; beatmapId?: number | null; nonce: number } | null;
  carouselScrollTopRef?: MutableRefObject<number>;
  onActiveBeatmapsetChange?: (set: NormalizedBeatmapset | null) => void;
  onActiveDiffIdChange?: (diffId: number | null) => void;
  onToggleSelect: (id: number) => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onStartPlay: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail: (set: NormalizedBeatmapset, options?: { diffId?: number; focusPp?: boolean }) => void;
  onPreviewBeatmap?: (set: NormalizedBeatmapset, beatmapId?: number) => void;
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

interface LazerCarouselSlotProps {
  beatmapset: NormalizedBeatmapset;
  diffs: NormalizedBeatmap[];
  isActive: boolean;
  activeDiffId: number | null;
  activeTarget: DownloadTarget;
  isPlayingSet: boolean;
  activeTask?: DownloadTask;
  batchMode: boolean;
  selected: boolean;
  coverBroken: boolean;
  ppScenario?: Partial<PpScenarioInput>;
  onMarkCoverBroken: (id: number) => void;
  onSelectBeatmapset: (set: NormalizedBeatmapset, scrollIntoView: boolean) => void;
  onSelectDiff: (diffId: number) => void;
  onToggleSelect: (id: number) => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail: (set: NormalizedBeatmapset, options?: { diffId?: number; focusPp?: boolean }) => void;
}

const LazerCarouselSlot = memo(function LazerCarouselSlot({
  beatmapset,
  diffs,
  isActive,
  activeDiffId,
  activeTarget,
  isPlayingSet,
  activeTask,
  batchMode,
  selected,
  coverBroken,
  ppScenario,
  onMarkCoverBroken,
  onSelectBeatmapset,
  onSelectDiff,
  onToggleSelect,
  onTogglePlay,
  onDownload,
  onOpenDetail,
}: LazerCarouselSlotProps) {
  const targetMeta = TARGET_META[activeTarget];
  const primaryBtnLabel =
    activeTarget === 'lazer'
      ? '下载到 Lazer'
      : activeTarget === 'stable'
        ? '下载到 Stable'
        : '双端同步下载';

  const isInstalled = beatmapset.localStatus.inStable || beatmapset.localStatus.inLazer;
  const inBoth = beatmapset.localStatus.inStable && beatmapset.localStatus.inLazer;
  const setDownloading = Boolean(
    activeTask &&
      (activeTask.status === 'queued' ||
        activeTask.status === 'downloading' ||
        activeTask.status === 'verifying' ||
        activeTask.status === 'installing'),
  );
  const setStatusBadge = getStatusBadge(beatmapset.status);
  const rankedForPp = isRankedForPp(beatmapset.status);
  const ppBadge = getBeatmapsetPpBadge(beatmapset, ppScenario);
  const previewDiffs = diffs.slice(0, 5);
  const extraDiffCount = diffs.length - previewDiffs.length;
  const leadDiff = diffs[0];

  const frameClass = selected
    ? '!border-amber-400/80 ring-2 ring-amber-400/25'
    : inBoth
      ? 'card-installed card-installed-both'
      : isInstalled
        ? 'card-installed'
        : 'border-hairline hover:border-hairline-strong';

  return (
    <div
      data-lazer-slot
      data-set-id={beatmapset.id}
      data-active={isActive ? 'true' : 'false'}
      className="lazer-slot"
    >
      <div className="lazer-slot-inner">
        {/* Main Slanted Beatmapset Card (no backdrop-blur inside scrolling slots) */}
        <div
          data-active={isActive ? 'true' : 'false'}
          onClick={() => onSelectBeatmapset(beatmapset, true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectBeatmapset(beatmapset, true);
            }
          }}
          className={`lazer-set-card group relative flex min-h-[88px] cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-[13px] border px-3.5 py-2.5 ${frameClass}`}
        >
          {/* Right Slanted Cover Art inside GPU-isolated .cover-frame */}
          <div className="lazer-cover-slant cover-frame">
            {!coverBroken ? (
              <img
                src={beatmapset.coverUrl}
                alt=""
                loading="lazy"
                onError={() => onMarkCoverBroken(beatmapset.id)}
                className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover opacity-80 will-change-transform transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
            ) : (
              <div className="h-full w-full bg-surface-2 opacity-60" />
            )}
          </div>

          {/* Gradient Scrim keeping left text crisp on every theme */}
          <div className="lazer-card-scrim" />

          {/* Left Accent Stripe */}
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
                  onToggleSelect(beatmapset.id);
                }}
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

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`font-stat inline-flex min-h-[18px] shrink-0 items-center rounded-[4px] border px-1 text-[0.625rem] font-bold tracking-wider uppercase ${setStatusBadge.cls}`}
                >
                  {setStatusBadge.label}
                </span>
                <h3
                  className={`font-display min-w-0 flex-1 text-[0.9375rem] font-bold transition-colors ${
                    isActive ? 'text-osu' : 'text-ink group-hover:text-osu'
                  }`}
                >
                  <MarqueeText
                    text={beatmapset.title}
                    title={beatmapset.titleUnicode || beatmapset.title}
                  />
                </h3>
              </div>

              <div className="flex items-center gap-1.5 truncate text-[0.75rem] font-medium text-ink-2">
                <span className="truncate">{beatmapset.artist}</span>
                <span className="text-ink-4">//</span>
                <span className="truncate text-ink-3">{beatmapset.creator}</span>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {previewDiffs.map((bm) => {
                  const c = getStarColor(bm.difficultyRating);
                  const keyTag = bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
                  return (
                    <span
                      key={bm.id}
                      style={{
                        backgroundColor: c.bg,
                        color: c.text,
                        borderColor: c.border,
                      }}
                      className="font-stat inline-flex min-h-[18px] shrink-0 items-center gap-0.5 rounded-[4px] border px-1 text-[0.625rem] leading-none font-bold whitespace-nowrap"
                    >
                      <span>{keyTag}</span>
                      <span>{bm.difficultyRating.toFixed(2)}★</span>
                    </span>
                  );
                })}
                {extraDiffCount > 0 && (
                  <span className="chip font-stat min-h-[18px] px-1 text-[0.625rem]">
                    +{extraDiffCount}
                  </span>
                )}
                {ppBadge && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDetail(beatmapset, { diffId: ppBadge.focusDiffId, focusPp: true });
                    }}
                    title={ppBadge.tooltip}
                    className="chip chip-pp font-stat min-h-[18px] px-1.5 text-[0.625rem]"
                  >
                    <Calculator className="h-2.5 w-2.5" />
                    <span>{ppBadge.label}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Badges & Quick Actions */}
          <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              {beatmapset.localStatus.inLazer && (
                <span className="chip chip-gold min-h-[18px] px-1.5 text-[0.65625rem]">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Lazer
                </span>
              )}
              {beatmapset.localStatus.inStable && (
                <span className="chip chip-gold min-h-[18px] px-1.5 text-[0.65625rem]">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Stable
                </span>
              )}
              {!beatmapset.localStatus.inLazer && beatmapset.localStatus.inLazerPending && (
                <span className="chip min-h-[18px] border-amber-300/60 bg-amber-950/90 px-1.5 text-[0.65625rem] text-amber-200">
                  待导入
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-mono hidden rounded-[5px] border border-white/15 bg-black/72 px-1.5 py-0.5 text-[0.6875rem] text-white xl:inline">
                {Math.round(beatmapset.bpm)} BPM
                {leadDiff ? ` · ${formatDuration(leadDiff.totalLength)}` : ''}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlay(beatmapset);
                }}
                title={isPlayingSet ? '暂停试听' : '试听'}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                  isPlayingSet
                    ? 'border-osu/80 bg-osu text-white'
                    : 'border-white/25 bg-black/72 text-white hover:border-osu/80 hover:bg-osu/90'
                }`}
              >
                {isPlayingSet ? (
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
                  onDownload(beatmapset, activeTarget);
                }}
                title={primaryBtnLabel}
                className={`btn btn-sm min-h-[28px] px-2 ${targetMeta.btnCls}`}
              >
                {setDownloading && activeTask ? (
                  <span className="font-mono text-[0.6875rem] tabular-nums">
                    {activeTask.progress}%
                  </span>
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          {setDownloading && activeTask && (
            <div className="meter absolute inset-x-0 bottom-0 z-20 h-[2.5px] rounded-none">
              <span
                style={{
                  width: `${activeTask.progress}%`,
                  backgroundColor: targetMeta.hex,
                }}
              />
            </div>
          )}
        </div>

        {/* Active-Only Staggered Difficulty Fan-Out (zero offscreen accordion DOM overhead) */}
        {isActive && (
          <div className="pt-1.5 pl-2.5">
            <div className="max-h-[240px] space-y-1 overflow-x-hidden overflow-y-auto py-0.5 pr-1 pl-2.5">
              {diffs.map((bm, idx) => {
                const diffActive = activeDiffId === bm.id;
                const c = getStarColor(bm.difficultyRating);
                const keyTag = bm.modeInt === 3 ? `${Math.round(bm.cs)}K` : bm.mode.toUpperCase();
                const ln = getLnCategory(bm.lnRatio);
                const pp98 = rankedForPp
                  ? calculateBeatmapPp(bm, ppScenario || { accuracy: 98, rate: 1 }).pp
                  : null;
                return (
                  <button
                    key={bm.id}
                    type="button"
                    data-active={diffActive ? 'true' : 'false'}
                    onClick={() => onSelectDiff(bm.id)}
                    style={{ animationDelay: `${Math.min(idx, 6) * 24}ms` }}
                    className={`lazer-diff-row lazer-diff-enter flex w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-[9px] border px-3 py-1.5 text-left ${
                      diffActive
                        ? 'border-osu/60 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_25%,transparent)]'
                        : 'border-hairline hover:border-hairline-strong'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                      <span
                        style={{
                          backgroundColor: c.bg,
                          color: c.text,
                          borderColor: c.border,
                        }}
                        className="font-stat inline-flex min-h-[19px] shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-[0.65625rem] leading-none font-bold whitespace-nowrap"
                      >
                        <span>{keyTag}</span>
                        <span>{bm.difficultyRating.toFixed(2)}★</span>
                      </span>
                      <MarqueeText
                        text={bm.version}
                        className="min-w-0 text-[0.78125rem] font-semibold text-ink"
                      />
                      {diffActive && (
                        <Disc3 className="h-3 w-3 shrink-0 animate-[spin_4s_linear_infinite] text-osu" />
                      )}
                    </div>

                    <div className="font-mono flex shrink-0 items-center gap-2 text-[0.6875rem] text-ink-3 tabular-nums">
                      {pp98 !== null && (
                        <span className="font-stat font-bold text-lazer-soft">
                          ~{formatPp(pp98)}pp
                        </span>
                      )}
                      {ln && (
                        <span
                          title={ln.tooltip}
                          className={`chip min-h-[18px] px-1.5 text-[0.625rem] ${ln.cls}`}
                        >
                          {ln.label}
                        </span>
                      )}
                      <span className="hidden xl:inline">OD {bm.od}</span>
                      <span className="hidden xl:inline">HP {bm.hp}</span>
                      <span>{formatDuration(bm.totalLength)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

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
  searchError = false,
  hasAudioDock,
  hasGlobalBg = false,
  compactStage = false,
  ppScenario,
  restoreTarget = null,
  carouselScrollTopRef,
  onActiveBeatmapsetChange,
  onActiveDiffIdChange,
  onToggleSelect,
  onTogglePlay,
  onStartPlay,
  onDownload,
  onOpenDetail,
  onPreviewBeatmap,
  onLoadMore,
}: LazerSongSelectProps) {
  const [activeSetId, setActiveSetId] = useState<number | null>(() => {
    if (playingSetId && results.some((r) => r.id === playingSetId)) return playingSetId;
    return results[0]?.id ?? null;
  });
  const [activeDiffId, setActiveDiffId] = useState<number | null>(null);
  const [autoPreview, setAutoPreview] = useState<boolean>(readInitialAutoPreview);
  const [quickRate, setQuickRate] = useState<0.75 | 1 | 1.5>(1);

  useEffect(() => {
    const r = ppScenario?.rate;
    if (r == null) {
      setQuickRate(1);
    } else if (Math.abs(r - 0.75) < 0.01) {
      setQuickRate(0.75);
    } else if (Math.abs(r - 1.5) < 0.01) {
      setQuickRate(1.5);
    } else if (Math.abs(r - 1) < 0.01) {
      setQuickRate(1);
    }
  }, [ppScenario?.rate]);

  const [brokenCovers, setBrokenCovers] = useState<Set<number>>(() => new Set());
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeOffscreenDir, setActiveOffscreenDir] = useState<'up' | 'down' | null>(null);

  // Double-buffered background crossfade state (avoids unmount/blur thrash when switching songs)
  const [bgLayers, setBgLayers] = useState<[string | null, string | null]>(() => [
    results[0]?.coverUrl ?? null,
    null,
  ]);
  const [frontBgSlot, setFrontBgSlot] = useState<0 | 1>(0);

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const listContentRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const shouldScrollToActiveRef = useRef(false);
  const loadedBgUrlsRef = useRef<Set<string>>(new Set());
  const activeSetIdRef = useRef<number | null>(activeSetId);
  const prevShowTopRef = useRef(false);
  const prevOffscreenDirRef = useRef<'up' | 'down' | null>(null);
  const lastHandledRestoreNonceRef = useRef(0);

  const markCoverBroken = useCallback((id: number) => {
    setBrokenCovers((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Pre-compute sorted difficulty lists once per results update
  const sortedDiffsMap = useMemo(() => {
    const map = new Map<number, NormalizedBeatmap[]>();
    for (const s of results) {
      map.set(s.id, getDisplayDiffs(s));
    }
    return map;
  }, [results]);

  // Keep activeSetId valid across new searches without resetting on page appends
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

  useEffect(() => {
    onActiveBeatmapsetChange?.(activeSet);
  }, [activeSet, onActiveBeatmapsetChange]);

  const activeDiffs = useMemo(
    () => (activeSet ? sortedDiffsMap.get(activeSet.id) ?? [] : []),
    [activeSet, sortedDiffsMap],
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

  useEffect(() => {
    onActiveDiffIdChange?.(activeDiffId);
  }, [activeDiffId, onActiveDiffIdChange]);

  const activeDiffIndex = useMemo(() => {
    if (activeDiffs.length === 0) return -1;
    const idx = activeDiffs.findIndex((d) => d.id === activeDiffId);
    return idx >= 0 ? idx : 0;
  }, [activeDiffs, activeDiffId]);

  const activeDiff = activeDiffIndex >= 0 ? activeDiffs[activeDiffIndex] : null;

  // Stage next ambient background image into inactive slot (flips immediately if cached, else onLoad)
  useEffect(() => {
    if (!activeSet || brokenCovers.has(activeSet.id)) return;
    const url = activeSet.coverUrl;
    if (bgLayers[frontBgSlot] === url) return;
    const backSlot: 0 | 1 = frontBgSlot === 0 ? 1 : 0;
    if (bgLayers[backSlot] === url) {
      if (loadedBgUrlsRef.current.has(url)) {
        setFrontBgSlot(backSlot);
      }
      return;
    }
    setBgLayers((prev) => {
      const next: [string | null, string | null] = [...prev];
      next[backSlot] = url;
      return next;
    });
  }, [activeSet, brokenCovers, frontBgSlot, bgLayers]);

  const selectBeatmapset = useCallback(
    (set: NormalizedBeatmapset, scrollIntoView = true) => {
      shouldScrollToActiveRef.current = scrollIntoView;
      setActiveSetId(set.id);
      const diffs = sortedDiffsMap.get(set.id) ?? getDisplayDiffs(set);
      setActiveDiffId(diffs[0]?.id ?? null);
      if (autoPreview) {
        onStartPlay(set);
      }
    },
    [autoPreview, onStartPlay, sortedDiffsMap],
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

  // Batch-read then batch-write + viewport-culled curved arc motion engine
  const updateArcPositions = useCallback(() => {
    const container = carouselRef.current;
    const listEl = listContentRef.current;
    if (!container || !listEl) return;

    const scrollTop = container.scrollTop;
    const vpHeight = Math.max(240, container.clientHeight);
    const vpCenterY = scrollTop + vpHeight / 2;
    const normDenominator = Math.max(180, vpHeight * 0.56);
    const listTop = listEl.offsetTop;
    const minY = scrollTop - 260;
    const maxY = scrollTop + vpHeight + 260;

    const nextShowTop = scrollTop > 180;
    let nextOffscreenDir: 'up' | 'down' | null = null;
    const activeIdStr = activeSetIdRef.current !== null ? String(activeSetIdRef.current) : null;

    const slots = listEl.querySelectorAll<HTMLElement>('[data-lazer-slot]');
    const updates: Array<{ el: HTMLElement; arcX: string; arcOp: string }> = [];

    // Phase 1: Batch DOM reads (zero interleaved writes / zero getBoundingClientRect)
    for (const slot of slots) {
      const top = listTop + slot.offsetTop;
      const height = slot.offsetHeight;
      if (activeIdStr !== null && slot.dataset.setId === activeIdStr) {
        const cardBottom = top + Math.min(height, 92);
        if (cardBottom < scrollTop + 12) {
          nextOffscreenDir = 'up';
        } else if (top > scrollTop + vpHeight - 12) {
          nextOffscreenDir = 'down';
        }
      }
      if (top + height < minY || top > maxY) continue;
      const slotCenterY = top + height / 2;
      const ny = Math.max(-1.25, Math.min(1.25, (slotCenterY - vpCenterY) / normDenominator));
      const arcAmp = container.clientWidth < 520 ? 18 : 34;
      const arcX = `${Math.round(ny * ny * arcAmp)}px`;
      const arcOp = Number(Math.max(0.64, 1 - Math.abs(ny) * 0.24).toFixed(3)).toString();
      if (slot.dataset.arcX !== arcX || slot.dataset.arcOp !== arcOp) {
        updates.push({ el: slot, arcX, arcOp });
      }
    }

    // Phase 2: Batch DOM writes
    for (const u of updates) {
      u.el.dataset.arcX = u.arcX;
      u.el.dataset.arcOp = u.arcOp;
      u.el.style.setProperty('--arc-x', u.arcX);
      u.el.style.setProperty('--arc-opacity', u.arcOp);
    }

    if (nextShowTop !== prevShowTopRef.current) {
      prevShowTopRef.current = nextShowTop;
      setShowBackToTop(nextShowTop);
    }
    if (nextOffscreenDir !== prevOffscreenDirRef.current) {
      prevOffscreenDirRef.current = nextOffscreenDir;
      setActiveOffscreenDir(nextOffscreenDir);
    }
  }, []);

  const scheduleArcUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateArcPositions();
    });
  }, [updateArcPositions]);

  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    scheduleArcUpdate();
    const onScroll = () => {
      if (carouselScrollTopRef) {
        carouselScrollTopRef.current = container.scrollTop;
      }
      scheduleArcUpdate();
    };
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
    activeSetIdRef.current = activeSet?.id ?? null;
    scheduleArcUpdate();
  }, [results, activeSet?.id, scheduleArcUpdate]);

  const scrollToSetById = useCallback((id: number, behavior: ScrollBehavior = 'smooth') => {
    const container = carouselRef.current;
    const listEl = listContentRef.current;
    if (!container || !listEl) return;
    const slot = listEl.querySelector<HTMLElement>(`[data-set-id="${id}"]`);
    if (!slot) return;

    const slotTop = listEl.offsetTop + slot.offsetTop;
    const cardHeight = Math.min(slot.offsetHeight, 240);
    const targetTop = Math.max(
      0,
      slotTop - Math.max(40, (container.clientHeight - cardHeight) * 0.36),
    );
    container.scrollTo({ top: targetTop, behavior });
  }, []);

  const handleScrollToActive = useCallback(() => {
    if (activeSetIdRef.current !== null) {
      scrollToSetById(activeSetIdRef.current, 'smooth');
    }
  }, [scrollToSetById]);

  const handleScrollToTop = useCallback(() => {
    carouselRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Post-commit smooth scroll to newly selected beatmapset
  useEffect(() => {
    if (!shouldScrollToActiveRef.current || activeSetId === null) return;
    shouldScrollToActiveRef.current = false;

    const frame = requestAnimationFrame(() => {
      scrollToSetById(activeSetId, 'smooth');
    });

    return () => cancelAnimationFrame(frame);
  }, [activeSetId, scrollToSetById]);

  // Restore saved browse target quietly without triggering autoplay
  useEffect(() => {
    if (!restoreTarget || restoreTarget.nonce === lastHandledRestoreNonceRef.current) return;
    const targetSet = results.find((r) => r.id === restoreTarget.beatmapsetId);
    if (!targetSet) return;
    lastHandledRestoreNonceRef.current = restoreTarget.nonce;

    setActiveSetId(targetSet.id);
    const diffs = sortedDiffsMap.get(targetSet.id) ?? getDisplayDiffs(targetSet);
    if (
      restoreTarget.beatmapId != null &&
      diffs.some((d) => d.id === restoreTarget.beatmapId)
    ) {
      setActiveDiffId(restoreTarget.beatmapId);
    } else {
      setActiveDiffId(diffs[0]?.id ?? null);
    }

    const frame = requestAnimationFrame(() => {
      scrollToSetById(targetSet.id, 'smooth');
    });
    const timer = window.setTimeout(() => {
      scheduleArcUpdate();
    }, 130);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [restoreTarget, results, sortedDiffsMap, scrollToSetById, scheduleArcUpdate]);

  // Infinite Auto-Load More when scrolling near the bottom of Lazer carousel
  useEffect(() => {
    const root = carouselRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    if (!hasMore || loadingMore || searchError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onLoadMore();
        }
      },
      { root, rootMargin: '260px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, searchError, results.length, onLoadMore]);

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
          targetEl.isContentEditable ||
          targetEl.getAttribute('role') === 'slider'
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
        if (nextIdx >= results.length - 3 && hasMore && !loadingMore && !searchError) {
          onLoadMore();
        }
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
    hasMore,
    loadingMore,
    searchError,
    selectBeatmapset,
    onTogglePlay,
    onOpenDetail,
    onLoadMore,
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
  const activeRanked = isRankedForPp(activeSet.status);

  const activeTotalObjects = activeDiff
    ? activeDiff.countCircles + activeDiff.countSliders + activeDiff.countSpinners
    : 0;

  const statMeters: Array<{
    label: string;
    display: string;
    pct: number;
    color: string;
    title?: string;
  }> = activeDiff
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
          title: activeLnBadge?.tooltip,
        },
      ]
    : [];

  const quickPpSummary = activeDiff ? getQuickPpSummary(activeDiff, quickRate, ppScenario) : null;

  return (
    <section
      aria-label="osu!lazer 选歌轮盘视图"
      className="lazer-stage isolate relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-hairline shadow-lg"
    >
      {/* Double-buffered ambient background (skipped when global desktop background handles it) */}
      {!hasGlobalBg &&
        ([0, 1] as const).map((slotIdx) => {
          const url = bgLayers[slotIdx];
          if (!url) return null;
          return (
            <img
              key={slotIdx}
              src={url}
              alt=""
              aria-hidden="true"
              onLoad={() => {
                loadedBgUrlsRef.current.add(url);
                if (url === activeSet.coverUrl && frontBgSlot !== slotIdx) {
                  setFrontBgSlot(slotIdx);
                }
              }}
              style={{
                transform: 'translateZ(0) scale(1.06)',
                opacity: frontBgSlot === slotIdx ? 0.35 : 0,
              }}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover blur-lg transition-opacity duration-300 ease-out select-none"
            />
          );
        })}
      <div className="lazer-stage-scrim pointer-events-none absolute inset-0" />

      <div
        className={`relative z-10 grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44%)_minmax(0,1fr)] md:grid-cols-[minmax(290px,340px)_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[minmax(320px,385px)_minmax(0,1fr)] ${
          compactStage
            ? 'xl:grid-cols-[minmax(300px,355px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(360px,430px)_minmax(0,1fr)]'
            : 'xl:grid-cols-[minmax(360px,430px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(390px,460px)_minmax(0,1fr)]'
        }`}
      >
        {/* LEFT: osu!lazer Wedge Showcase */}
        <div
          className={`flex min-h-0 flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-contain border-b border-hairline p-3 md:border-r md:border-b-0 xl:p-4 ${
            hasAudioDock ? 'pb-20' : ''
          }`}
        >
          <div
            className={`panel relative flex shrink-0 flex-col gap-2.5 overflow-hidden p-3 transition-[border-color,box-shadow] duration-200 ${
              activeInBoth
                ? 'card-installed card-installed-both'
                : activeInstalled
                  ? 'card-installed'
                  : ''
            }`}
          >
            {/* Cover Header */}
            <div className="cover-frame h-[clamp(96px,16vh,156px)] w-full shrink-0 rounded-[11px] border border-hairline">
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
                  className={`font-stat inline-flex min-h-[20px] items-center rounded-[5px] border px-1.5 text-[0.65625rem] font-bold tracking-wider uppercase ${activeStatusBadge.cls}`}
                >
                  {activeStatusBadge.label}
                </span>
                {activeSet.video && (
                  <span
                    title="包含视频"
                    className="flex h-[20px] items-center rounded-[5px] border border-white/15 bg-black/65 px-1.5 text-slate-100"
                  >
                    <Film className="h-3 w-3" />
                  </span>
                )}
                {activeSet.spotlight && (
                  <span
                    title="官方 Spotlight"
                    className="flex h-[20px] items-center rounded-[5px] border border-amber-300/40 bg-amber-500/25 px-1.5 text-amber-200"
                  >
                    <Sparkles className="h-3 w-3" />
                  </span>
                )}
              </div>

              {/* Top-right gold installed badges */}
              <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
                {activeSet.localStatus.inLazer && (
                  <span className="chip chip-gold">
                    <CheckCircle2 className="h-3 w-3" />
                    Lazer 已装
                  </span>
                )}
                {activeSet.localStatus.inStable && (
                  <span className="chip chip-gold">
                    <CheckCircle2 className="h-3 w-3" />
                    Stable 已装
                  </span>
                )}
                {!activeSet.localStatus.inLazer && activeSet.localStatus.inLazerPending && (
                  <span className="chip border-amber-300/60 bg-amber-950/90 text-amber-200">
                    Lazer 待导入
                  </span>
                )}
              </div>

              {/* Bottom-left: Play + Auto preview */}
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onTogglePlay(activeSet)}
                  className={`flex min-h-[28px] items-center gap-1.5 rounded-full border px-3 text-[0.75rem] font-semibold transition-colors ${
                    activePlaying
                      ? 'border-osu bg-osu text-white'
                      : 'border-white/25 bg-black/70 text-white hover:border-osu/70 hover:bg-osu/90'
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
                  className={`flex min-h-[28px] items-center gap-1 rounded-full border px-2.5 text-[0.71875rem] font-semibold transition-colors ${
                    autoPreview
                      ? 'border-lazer/80 bg-lazer/90 text-white'
                      : 'border-white/20 bg-black/68 text-slate-200 hover:border-white/45'
                  }`}
                >
                  <Volume2 className="h-3 w-3" />
                  <span>自动试听</span>
                </button>
              </div>

              {/* Bottom-right: BPM & Duration */}
              <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1 text-[0.71875rem] font-semibold text-white tabular-nums">
                <span className="font-stat rounded-[5px] border border-white/15 bg-black/72 px-1.5 py-0.5">
                  {Math.round(activeSet.bpm)} BPM
                </span>
                {activeDiff && (
                  <span className="font-mono flex items-center gap-1 rounded-[5px] border border-white/15 bg-black/72 px-1.5 py-0.5">
                    <Clock className="h-2.5 w-2.5 text-slate-300" />
                    {formatDuration(activeDiff.totalLength)}
                  </span>
                )}
              </div>
            </div>

            {/* Song Identity */}
            <div className="min-w-0 space-y-1">
              <h2 className="font-display min-w-0 text-[1.0625rem] leading-snug font-bold text-ink">
                <MarqueeText
                  text={activeSet.title}
                  title={activeSet.titleUnicode || activeSet.title}
                />
              </h2>
              {activeSet.titleUnicode && activeSet.titleUnicode !== activeSet.title && (
                <p className="min-w-0 text-[0.75rem] font-medium text-ink-3">
                  <MarqueeText text={activeSet.titleUnicode} />
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[0.78125rem] text-ink-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold">{activeSet.artist}</span>
                  <span className="text-ink-4">·</span>
                  <span className="inline-flex min-w-0 items-center gap-1 text-ink-3">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="truncate font-medium text-ink-2">{activeSet.creator}</span>
                  </span>
                </div>
                <div className="font-mono flex shrink-0 items-center gap-2.5 text-[0.71875rem]">
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

            {/* Selected Difficulty Panel + Ranked Quick PP */}
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
                          className="font-stat inline-flex min-h-[21px] shrink-0 items-center gap-1 rounded-[5px] border px-1.5 text-[0.71875rem] font-bold"
                        >
                          <span>{keyTag}</span>
                          <span>{activeDiff.difficultyRating.toFixed(2)}★</span>
                        </span>
                      );
                    })()}
                    <MarqueeText
                      text={activeDiff.version}
                      className="min-w-0 text-[0.8125rem] font-semibold text-ink"
                    />
                    {activeLnBadge && (
                      <span
                        title={activeLnBadge.tooltip}
                        className={`chip font-mono min-h-[20px] shrink-0 text-[0.65625rem] ${activeLnBadge.cls}`}
                      >
                        {activeLnBadge.styleTag}
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
                      <span className="font-mono px-1 text-[0.6875rem] text-ink-3 tabular-nums">
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

                {/* 4 Animated Attribute Meters */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {statMeters.map((m) => (
                    <div key={m.label} title={m.title} className="space-y-1">
                      <div className="flex items-center justify-between text-[0.71875rem]">
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

                {/* Inline Ranked Quick PP Preview Bar */}
                {activeRanked && quickPpSummary ? (
                  <div className="space-y-1.5 border-t border-hairline pt-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-stat text-[0.6875rem] font-bold text-lazer-soft uppercase">
                          PP 速览
                        </span>
                        <div className="inline-flex rounded-[6px] border border-hairline bg-surface-1 p-0.5">
                          {(
                            [
                              { id: 0.75, label: 'HT' },
                              { id: 1, label: 'NM' },
                              { id: 1.5, label: 'DT' },
                            ] as const
                          ).map((r) => (
                            <button
                              key={r.label}
                              type="button"
                              onClick={() => setQuickRate(r.id)}
                              className={`font-stat rounded-[4px] px-1.5 py-px text-[0.65625rem] font-bold transition-colors ${
                                quickRate === r.id
                                  ? 'bg-lazer/22 text-lazer-soft'
                                  : 'text-ink-3 hover:text-ink'
                              }`}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenDetail(activeSet, { diffId: activeDiff.id, focusPp: true })
                        }
                        className="chip chip-pp font-stat min-h-[22px] px-2 text-[0.65625rem]"
                      >
                        <Calculator className="h-2.5 w-2.5" />
                        <span>PP 计算器</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-center">
                      {(
                        [
                          { label: '95%', val: quickPpSummary.pp95 },
                          { label: '98%', val: quickPpSummary.pp98 },
                          { label: '99%', val: quickPpSummary.pp99 },
                          { label: 'SS', val: quickPpSummary.pp100 },
                        ] as const
                      ).map((item) => (
                        <div
                          key={item.label}
                          className="rounded-[6px] border border-hairline bg-surface-2/75 px-1.5 py-1"
                        >
                          <div className="font-stat text-[0.65625rem] text-ink-3">{item.label}</div>
                          <div className="font-stat text-[0.75rem] font-bold text-ink tabular-nums">
                            ~{formatPp(item.val)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2 text-[0.75rem] font-medium text-ink-3">
                    <span>未上架谱面不计官方 PP</span>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDetail(activeSet, { diffId: activeDiff.id, focusPp: true })
                      }
                      className="btn btn-sm min-h-[24px] px-2 text-[0.6875rem]"
                    >
                      <Calculator className="h-3 w-3 text-lazer-soft" />
                      <span>模拟计算 PP</span>
                    </button>
                  </div>
                )}

                {/* Note Breakdown Strip */}
                <div className="font-mono grid grid-cols-5 gap-1 border-t border-hairline pt-2 text-center text-[0.6875rem] tabular-nums">
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
                  title="单独下载到 Stable"
                  className="font-stat btn px-2.5 text-stable-soft hover:border-stable/50 hover:bg-stable/12 hover:text-stable"
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(activeSet, 'lazer')}
                  title="单独下载到 Lazer"
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
                {(activeInstalled || activeSet.localStatus.inLazerPending) &&
                  activeSet.beatmaps.some((b) => b.modeInt === 3) &&
                  onPreviewBeatmap && (
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewBeatmap(
                          activeSet,
                          activeDiff?.modeInt === 3 ? activeDiff.id : undefined,
                        )
                      }
                      className="btn btn-sm border-osu/45 bg-osu/12 px-2.5 text-osu-soft hover:bg-osu/20"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>预览谱面</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() =>
                    onOpenDetail(activeSet, { diffId: activeDiff?.id, focusPp: false })
                  }
                  className="btn btn-sm flex-1"
                >
                  <Info className="h-3.5 w-3.5 text-osu" />
                  <span>完整详情 · PP 计算</span>
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
          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[10px] border border-hairline bg-surface-0/85 px-3 py-1.5 text-[0.71875rem] text-ink-3 [@media(max-height:740px)]:hidden">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-2">
              <Keyboard className="h-3.5 w-3.5 text-lazer-soft" />
              <span>快捷键导航</span>
            </span>
            <span className="font-mono flex flex-wrap items-center gap-2 text-[0.6875rem]">
              <span>↑↓/WS 切歌</span>
              <span>←→ 切难度</span>
              <span>Space 试听</span>
              <span>Enter 详情</span>
            </span>
          </div>
        </div>

        {/* RIGHT: Curved osu!lazer Carousel */}
        <div className="relative h-full min-h-0 overflow-hidden">
          <div
            ref={carouselRef}
            className={`relative h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain py-4 pr-3 pl-6 sm:pr-4 sm:pl-9 ${
              hasAudioDock ? 'pb-24' : 'pb-16'
            }`}
          >
            <div ref={listContentRef} className="relative space-y-2.5">
              {results.map((set) => {
                const isActive = activeSet.id === set.id;
                return (
                  <LazerCarouselSlot
                    key={set.id}
                    beatmapset={set}
                    diffs={sortedDiffsMap.get(set.id) ?? []}
                    isActive={isActive}
                    activeDiffId={isActive ? activeDiff?.id ?? null : null}
                    activeTarget={activeTarget}
                    isPlayingSet={isPlaying && playingSetId === set.id}
                    activeTask={activeTaskBySet.get(set.id)}
                    batchMode={batchMode}
                    selected={selectedIds.has(set.id)}
                    coverBroken={brokenCovers.has(set.id)}
                    ppScenario={ppScenario}
                    onMarkCoverBroken={markCoverBroken}
                    onSelectBeatmapset={selectBeatmapset}
                    onSelectDiff={setActiveDiffId}
                    onToggleSelect={onToggleSelect}
                    onTogglePlay={onTogglePlay}
                    onDownload={onDownload}
                    onOpenDetail={onOpenDetail}
                  />
                );
              })}
            </div>

            {/* Bottom Auto-Load Sentinel + Status / Fallback Controls */}
            <div ref={sentinelRef} className="h-4" aria-hidden="true" />
            <div className="flex justify-center pt-2">
              {loadingMore ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-2/90 px-4 py-1.5 text-[0.78125rem] font-medium text-ink-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-osu" />
                  <span>正在自动加载更多谱面…</span>
                </div>
              ) : searchError && hasMore ? (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="btn min-h-[36px] border-amber-500/45 bg-surface-2/90 px-5 text-[0.8125rem] text-warn"
                >
                  <ChevronDown className="h-4 w-4" />
                  <span>加载失败，点击重试加载更多</span>
                </button>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="btn min-h-[36px] bg-surface-2/90 px-6 text-[0.84375rem]"
                >
                  <ChevronDown className="h-4 w-4 text-osu" />
                  <span>加载更多谱面</span>
                </button>
              ) : (
                results.length > 0 && (
                  <span className="text-[0.75rem] font-medium text-ink-3">
                    已加载全部 {results.length} 套谱面
                  </span>
                )
              )}
            </div>
          </div>

          {/* Floating Carousel Quick-Navigation (Locate Selected + Back to Top) */}
          {(activeOffscreenDir !== null || showBackToTop) && (
            <div
              className={`pointer-events-none absolute right-4 z-20 flex flex-col items-end gap-2 transition-[bottom] duration-200 ${
                hasAudioDock ? 'bottom-24 sm:bottom-[76px]' : 'bottom-4'
              }`}
            >
              {activeOffscreenDir !== null && (
                <button
                  type="button"
                  onClick={handleScrollToActive}
                  title={`回到当前选中歌曲：${activeSet.title}`}
                  aria-label="回到当前选中歌曲"
                  className="glass animate-fade-in pointer-events-auto inline-flex min-h-[34px] items-center gap-1.5 rounded-full border-osu/45 px-3.5 text-[0.78125rem] font-semibold text-ink transition-all duration-150 hover:border-osu hover:text-osu"
                >
                  <LocateFixed className="h-3.5 w-3.5 text-osu" />
                  <span>回到选中</span>
                  <span className="font-mono text-[0.71875rem] text-osu-soft">
                    {activeOffscreenDir === 'up' ? '↑' : '↓'}
                  </span>
                </button>
              )}
              {showBackToTop && (
                <button
                  type="button"
                  onClick={handleScrollToTop}
                  title="回到列表顶部"
                  aria-label="回到顶部"
                  className="glass animate-fade-in pointer-events-auto inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[0.78125rem] font-semibold text-ink transition-all duration-150 hover:border-osu/60 hover:text-osu"
                >
                  <ArrowUp className="h-3.5 w-3.5 text-ink-2" />
                  <span>回到顶部</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
