import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Gamepad2,
  Loader2,
  Maximize2,
  Minus,
  Pause,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react';
import {
  enqueueDownload,
  fetchConfig,
  fetchDownloads,
  fetchLibraryStatus,
  loadBeatmapIntoGame,
  searchBeatmapsets,
  updateConfig,
} from '../api';
import {
  DEFAULT_FILTERS,
  DEFAULT_FONT_SCALE,
  THEME_OPTIONS,
  clampFontScale,
  formatBytes,
  getStarColor,
  isValidTheme,
} from '../constants';
import {
  AppConfig,
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  LocalLibraryStatus,
  NormalizedBeatmapset,
  SearchFilters,
  ThemeId,
} from '../types';

type SmartTarget = 'auto' | DownloadTarget;

const STAR_PRESETS: Array<{ id: string; label: string; min?: number; max?: number }> = [
  { id: 'all', label: '全星' },
  { id: 'lt3', label: '<3★', max: 3 },
  { id: '3-4', label: '3-4★', min: 3, max: 4 },
  { id: '4-5', label: '4-5★', min: 4, max: 5 },
  { id: '5-6', label: '5-6★', min: 5, max: 6 },
  { id: '6p', label: '6★+', min: 6 },
];

function readInitialTheme(): ThemeId {
  try {
    const stored = localStorage.getItem('osu4k-theme');
    if (isValidTheme(stored)) return stored;
  } catch {
    // Ignore storage error
  }
  return 'light';
}

function readHintDismissed(): boolean {
  try {
    return localStorage.getItem('osu4k-overlay-hint-dismissed') === '1';
  } catch {
    return false;
  }
}

export function OverlayApp() {
  const [theme, setTheme] = useState<ThemeId>(readInitialTheme);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [library, setLibrary] = useState<LocalLibraryStatus | null>(null);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);

  const [compact, setCompact] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [opacity, setOpacity] = useState(0.94);
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);
  const [hintDismissed, setHintDismissed] = useState<boolean>(readHintDismissed);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'leaderboard' | 'any'>('leaderboard');
  const [starBucket, setStarBucket] = useState<string>('all');
  const [smartTarget, setSmartTarget] = useState<SmartTarget>('auto');
  const [variant, setVariant] = useState<DownloadVariant>('novideo');

  const [results, setResults] = useState<NormalizedBeatmapset[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [playingId, setPlayingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void window.electronAPI?.setOverlayNativeTheme?.(theme);
  }, [theme]);

  const changeTheme = (next: ThemeId) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    void window.electronAPI?.setOverlayNativeTheme?.(next);
    try {
      localStorage.setItem('osu4k-theme', next);
    } catch {
      // Ignore storage error
    }
    void updateConfig({ theme: next }).catch(() => {});
  };

  const runSearch = useCallback(
    async (overrideQ?: string, overrideStatus?: 'leaderboard' | 'any', overrideStar?: string) => {
      const qVal = (overrideQ ?? query).trim();
      const stVal = overrideStatus ?? statusFilter;
      const starId = overrideStar ?? starBucket;
      const starMeta = STAR_PRESETS.find((s) => s.id === starId);

      const filters: SearchFilters = {
        ...DEFAULT_FILTERS,
        q: qVal || undefined,
        status: stVal,
        minStars: starMeta?.min,
        maxStars: starMeta?.max,
        limit: 16,
        offset: 0,
      };

      setSearching(true);
      setSearchError(null);
      try {
        const res = await searchBeatmapsets(filters);
        setResults(res.beatmapsets);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : '搜索失败');
      } finally {
        setSearching(false);
      }
    },
    [query, statusFilter, starBucket],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [cfg, lib, dls] = await Promise.all([
          fetchConfig(),
          fetchLibraryStatus(true),
          fetchDownloads(),
        ]);
        setConfig(cfg);
        setVariant(cfg.defaultVariant);
        const fs = clampFontScale(cfg.fontScale, DEFAULT_FONT_SCALE);
        document.documentElement.style.setProperty('--ui-font-scale', String(fs));
        try {
          localStorage.setItem('osu4k-font-scale', String(fs));
        } catch {
          // Ignore storage error
        }
        if (typeof cfg.overlayOpacity === 'number') {
          setOpacity(cfg.overlayOpacity);
          void window.electronAPI?.setOverlayOpacity?.(cfg.overlayOpacity);
        }
        setLibrary(lib);
        setDownloads(dls);
      } catch {
        // SSE recovers
      }
      void runSearch('', 'leaderboard', 'all');
    })();

    const es = new EventSource('/api/events');
    es.addEventListener('downloads', (ev) => {
      try {
        setDownloads(JSON.parse(ev.data) as DownloadTask[]);
      } catch {
        // Ignore
      }
    });
    es.addEventListener('library', (ev) => {
      try {
        setLibrary(JSON.parse(ev.data) as LocalLibraryStatus);
      } catch {
        // Ignore
      }
    });

    return () => es.close();
  }, []);

  // Resolve effective target client based on running game processes
  const effectiveTarget: DownloadTarget = useMemo(() => {
    if (smartTarget !== 'auto') return smartTarget;
    if (library?.lazerRunning && library?.stableRunning) {
      return config?.defaultTarget || 'both';
    }
    if (library?.lazerRunning) return 'lazer';
    if (library?.stableRunning) return 'stable';
    return config?.defaultTarget || 'lazer';
  }, [smartTarget, library?.lazerRunning, library?.stableRunning, config?.defaultTarget]);

  const activeTaskBySet = useMemo(() => {
    const map = new Map<number, DownloadTask>();
    for (const t of downloads) {
      if (
        !map.has(t.beatmapsetId) &&
        (t.status === 'queued' ||
          t.status === 'downloading' ||
          t.status === 'verifying' ||
          t.status === 'installing')
      ) {
        map.set(t.beatmapsetId, t);
      }
    }
    return map;
  }, [downloads]);

  // Reflect completed downloads onto local results immediately
  useEffect(() => {
    const doneIds = new Set(
      downloads
        .filter((d) => d.status === 'completed' || d.status === 'queued_lazer')
        .map((d) => d.beatmapsetId),
    );
    if (doneIds.size === 0) return;
    setResults((prev) =>
      prev.map((item) => {
        if (!doneIds.has(item.id)) return item;
        const matched = downloads.filter(
          (d) =>
            d.beatmapsetId === item.id &&
            (d.status === 'completed' || d.status === 'queued_lazer'),
        );
        let inStable = item.localStatus.inStable;
        let inLazer = item.localStatus.inLazer;
        let inLazerPending = item.localStatus.inLazerPending;
        for (const t of matched) {
          if (t.target === 'stable' || t.target === 'both') inStable = true;
          if (t.target === 'lazer' || t.target === 'both') {
            if (t.status === 'completed') inLazer = true;
            else inLazerPending = true;
          }
        }
        return {
          ...item,
          localStatus: { ...item.localStatus, inStable, inLazer, inLazerPending },
        };
      }),
    );
  }, [downloads]);

  const toggleCompact = async () => {
    const next = !compact;
    setCompact(next);
    setShowOpacitySlider(false);
    await window.electronAPI?.setOverlayCompact?.(next);
  };

  const togglePinned = async () => {
    const next = !pinned;
    setPinned(next);
    await window.electronAPI?.setOverlayAlwaysOnTop?.(next);
    notify(next ? '浮窗已置顶' : '已取消置顶');
  };

  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    void window.electronAPI?.setOverlayOpacity?.(val);
  };

  const persistOpacity = () => {
    void updateConfig({ overlayOpacity: opacity }).catch(() => {});
  };

  const handleTogglePreviewAudio = (setId: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === setId) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = `/api/media/preview/${setId}`;
    audio.volume = 0.5;
    setPlayingId(setId);
    void audio.play().catch(() => {
      setPlayingId(null);
    });
  };

  const handleDownloadAndLoad = async (set: NormalizedBeatmapset) => {
    await enqueueDownload({
      beatmapsetId: set.id,
      title: set.title,
      artist: set.artist,
      creator: set.creator,
      target: effectiveTarget,
      variant,
      preferredMirror: config?.preferredDownloadSource || 'auto',
    });
    const runningHint =
      (effectiveTarget === 'lazer' && library?.lazerRunning) ||
      (effectiveTarget === 'stable' && library?.stableRunning) ||
      (effectiveTarget === 'both' && (library?.lazerRunning || library?.stableRunning));
    notify(runningHint ? `正在下载，完成后将自动加载到游戏: ${set.title}` : `已加入下载队列: ${set.title}`);
  };

  const handleLoadAgain = async (setId: number) => {
    const clientArg: 'auto' | 'lazer' | 'stable' =
      effectiveTarget === 'lazer'
        ? 'lazer'
        : effectiveTarget === 'stable'
          ? 'stable'
          : 'auto';
    try {
      const res = await loadBeatmapIntoGame(setId, clientArg);
      notify(res.message);
    } catch (err) {
      notify(err instanceof Error ? err.message : '游戏内加载失败');
    }
  };

  const handleOpenPreview = (setId: number) => {
    if (window.electronAPI?.openPreviewInMain) {
      void window.electronAPI.openPreviewInMain({ beatmapsetId: setId });
    } else {
      window.open(`/?previewSet=${setId}`, '_blank', 'noopener');
    }
  };

  const anyGameRunning = Boolean(library?.lazerRunning || library?.stableRunning);
  const gameStatusText =
    library?.lazerRunning && library?.stableRunning
      ? 'Lazer + Stable 运行中'
      : library?.lazerRunning
        ? 'Lazer 运行中 · 自动加载'
        : library?.stableRunning
          ? 'Stable 运行中 · 自动加载'
          : '等待游戏启动';

  const recentTasks = downloads.slice(0, 3);
  const activeTaskCount = downloads.filter(
    (d) =>
      d.status === 'queued' ||
      d.status === 'downloading' ||
      d.status === 'verifying' ||
      d.status === 'installing',
  ).length;

  const isElectronOverlay = Boolean(window.electronAPI?.isElectron);
  const tintAlpha = Number((0.16 + ((opacity - 0.55) / 0.45) * 0.68).toFixed(3));

  return (
    <div className={isElectronOverlay ? 'h-screen w-screen' : 'h-screen w-screen p-1.5'}>
      <div
        style={{ '--mac-tint-alpha': String(tintAlpha) } as React.CSSProperties}
        className={`mac-glass-shell relative flex h-full w-full flex-col overflow-hidden text-ink ${
          isElectronOverlay ? 'rounded-none border-0' : 'rounded-[18px]'
        }`}
      >
        {/* macOS Titlebar */}
        <header className="app-drag mac-glass-bar flex h-[40px] shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
          {/* Left: Traffic Lights */}
          <div className="app-no-drag mac-traffic-group flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void window.electronAPI?.closeOverlay?.()}
              title="隐藏浮窗"
              className="mac-traffic-dot bg-[#ff5f57]"
            >
              <X className="h-2 w-2" strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => void toggleCompact()}
              title={compact ? '展开浮窗面板' : '折叠为极简搜索条'}
              className="mac-traffic-dot bg-[#febc2e]"
            >
              <Minus className="h-2 w-2" strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => void window.electronAPI?.showMainWindow?.()}
              title="回到完整主窗口"
              className="mac-traffic-dot bg-[#28c840]"
            >
              <Maximize2 className="h-2 w-2" strokeWidth={2.5} />
            </button>
          </div>

          {/* Center: Title or Compact Spotlight Input */}
          {compact ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCompact(false);
                void window.electronAPI?.setOverlayCompact?.(false);
                void runSearch();
              }}
              className="app-no-drag flex min-w-0 flex-1 items-center gap-1.5"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-osu" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜歌 / ID / 链接，回车展开下载..."
                className="h-7 min-w-0 flex-1 bg-transparent text-[0.78125rem] text-ink outline-none placeholder:text-ink-3"
              />
              {activeTaskCount > 0 && (
                <span className="chip font-mono min-h-[20px] border-osu/40 bg-osu/20 text-osu-soft">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  {activeTaskCount}
                </span>
              )}
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-display truncate text-[0.8125rem] font-bold text-ink">
                osu! 浮窗助手
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${
                  anyGameRunning
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-ok'
                    : 'border-hairline bg-tint text-ink-3'
                }`}
              >
                <span className={anyGameRunning ? 'live-dot' : 'idle-dot'} />
                <span className="truncate">{gameStatusText}</span>
              </span>
            </div>
          )}

          {/* Right: Theme dots, Opacity, Pin */}
          <div className="app-no-drag flex shrink-0 items-center gap-1">
            {!compact && (
              <div className="flex items-center gap-1 rounded-full border border-hairline bg-tint px-1.5 py-1">
                {THEME_OPTIONS.filter((t) =>
                  ['dark', 'stone', 'light', 'paper', 'latte'].includes(t.id),
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => changeTheme(t.id)}
                    title={`切换主题：${t.label}`}
                    className="h-2.5 w-2.5 rounded-full border border-black/25 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: t.swatchBg,
                      boxShadow: theme === t.id ? `0 0 0 1.5px ${t.swatchRing}` : undefined,
                    }}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowOpacitySlider((v) => !v)}
              title="调节浮窗透明度"
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                showOpacitySlider ? 'bg-tint-hover text-ink' : 'text-ink-3 hover:bg-tint hover:text-ink'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void togglePinned()}
              title={pinned ? '取消始终置顶' : '保持始终置顶'}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                pinned ? 'text-osu-soft hover:bg-tint' : 'text-ink-3 hover:bg-tint hover:text-ink'
              }`}
            >
              {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        </header>

        {/* Opacity Popover */}
        {showOpacitySlider && !compact && (
          <div className="mac-glass-bar flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-3.5 py-2 text-[0.75rem]">
            <span className="font-medium text-ink-2">浮窗透明度</span>
            <input
              type="range"
              min={0.55}
              max={1}
              step={0.02}
              value={opacity}
              style={{ '--fill': `${((opacity - 0.55) / 0.45) * 100}%` } as React.CSSProperties}
              onChange={(e) => handleOpacityChange(Number(e.target.value))}
              onMouseUp={persistOpacity}
              onTouchEnd={persistOpacity}
              className="slim-range flex-1"
            />
            <span className="font-mono w-9 text-right text-ink">{Math.round(opacity * 100)}%</span>
          </div>
        )}

        {!compact && (
          <>
            {/* Spotlight Search & Quick Controls */}
            <div className="shrink-0 space-y-2 border-b border-hairline px-3 py-2.5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runSearch();
                }}
                className="flex items-center gap-1.5"
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索歌名、谱师、Beatmapset ID 或官网链接…"
                    className="field min-h-[32px] pl-8 pr-7 text-[0.78125rem]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        void runSearch('', statusFilter, starBucket);
                      }}
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-3 hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="btn btn-primary min-h-[32px] px-3 text-[0.78125rem]"
                >
                  {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '搜索'}
                </button>
              </form>

              {/* Quick Mania 4K Filters */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[0.71875rem]">
                <div className="flex items-center gap-1 rounded-[7px] border border-hairline bg-tint p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('leaderboard');
                      void runSearch(query, 'leaderboard', starBucket);
                    }}
                    className={`rounded-[5px] px-2 py-0.5 font-medium transition-colors ${
                      statusFilter === 'leaderboard'
                        ? 'bg-surface-2 text-ink'
                        : 'text-ink-3 hover:text-ink'
                    }`}
                  >
                    Ranked
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('any');
                      void runSearch(query, 'any', starBucket);
                    }}
                    className={`rounded-[5px] px-2 py-0.5 font-medium transition-colors ${
                      statusFilter === 'any'
                        ? 'bg-surface-2 text-ink'
                        : 'text-ink-3 hover:text-ink'
                    }`}
                  >
                    全部状态
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-0.5">
                  {STAR_PRESETS.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => {
                        setStarBucket(sp.id);
                        void runSearch(query, statusFilter, sp.id);
                      }}
                      className={`font-stat rounded-[6px] px-1.5 py-0.5 transition-colors ${
                        starBucket === sp.id
                          ? 'bg-osu/20 font-bold text-osu-soft'
                          : 'text-ink-3 hover:bg-tint hover:text-ink'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smart Target + Variant */}
              <div className="flex items-center justify-between gap-2 text-[0.75rem]">
                <div className="segmented flex-1">
                  {(
                    [
                      { id: 'auto', label: '自动匹配' },
                      { id: 'lazer', label: 'Lazer' },
                      { id: 'stable', label: 'Stable' },
                      { id: 'both', label: '双端' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSmartTarget(opt.id)}
                      className={`!min-h-[24px] !text-[0.71875rem] ${
                        smartTarget === opt.id
                          ? '!bg-surface-2 !text-ink shadow-[inset_0_0_0_1px_var(--t-hairline-strong)]'
                          : ''
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setVariant((v) => (v === 'novideo' ? 'full' : v === 'full' ? 'mini' : 'novideo'))
                  }
                  title="点击切换下载包体类型"
                  className="btn btn-sm min-h-[30px] px-2 text-[0.71875rem]"
                >
                  {variant === 'novideo' ? '无视频' : variant === 'full' ? '含视频' : 'Mini'}
                </button>
              </div>

              {!hintDismissed && (
                <div className="flex items-center justify-between gap-2 rounded-[8px] border border-hairline bg-tint px-2.5 py-1 text-[0.6875rem] font-medium text-ink-2">
                  <span>游戏全屏下如看不见浮窗，请在游戏内设为「无边框窗口」模式</span>
                  <button
                    type="button"
                    onClick={() => {
                      setHintDismissed(true);
                      try {
                        localStorage.setItem('osu4k-overlay-hint-dismissed', '1');
                      } catch {
                        // Ignore
                      }
                    }}
                    className="shrink-0 text-ink-3 hover:text-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Results Scroll List */}
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {searchError && (
                <div className="mac-glass-card rounded-[11px] border-rose-500/40 p-2.5 text-[0.78125rem] font-medium text-bad">
                  {searchError}
                </div>
              )}

              {searching && results.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-ink-3">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-osu" />
                  <span className="text-[0.8125rem] font-medium">搜索中…</span>
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-[0.8125rem] font-medium text-ink-3">
                  没有找到匹配的谱面，试试放宽关键词或切换「全部状态」
                </div>
              ) : (
                results.map((set) => {
                  const activeTask = activeTaskBySet.get(set.id);
                  const isDownloading = Boolean(activeTask);
                  const isInstalled = set.localStatus.inStable || set.localStatus.inLazer;
                  const canPreview =
                    (isInstalled || set.localStatus.inLazerPending) &&
                    set.beatmaps.some((b) => b.modeInt === 3);
                  const diffs = set.beatmaps.filter((b) => b.matchesFilter !== false).slice(0, 3);
                  const isTargetInstalled =
                    (effectiveTarget === 'lazer' && set.localStatus.inLazer) ||
                    (effectiveTarget === 'stable' && set.localStatus.inStable) ||
                    (effectiveTarget === 'both' && set.localStatus.inLazer && set.localStatus.inStable);

                  return (
                    <div
                      key={set.id}
                      className={`mac-glass-card relative flex items-center gap-2.5 overflow-hidden rounded-[12px] p-2 ${
                        isInstalled ? 'card-installed' : ''
                      }`}
                    >
                      {/* Thumbnail + Audio Preview */}
                      <div className="relative h-13 w-13 shrink-0 overflow-hidden rounded-[9px] border border-hairline bg-surface-1">
                        <img
                          src={set.coverUrl}
                          alt={set.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleTogglePreviewAudio(set.id)}
                          title={playingId === set.id ? '暂停试听' : '试听音频'}
                          className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                            playingId === set.id
                              ? 'bg-osu/75 text-white opacity-100'
                              : 'bg-black/45 text-white opacity-0 hover:opacity-100'
                          }`}
                        >
                          {playingId === set.id ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4 fill-current" />
                          )}
                        </button>
                      </div>

                      {/* Metadata */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-display truncate text-[0.84375rem] font-bold text-ink">
                            {set.title}
                          </h3>
                        </div>
                        <p className="truncate text-[0.71875rem] font-medium text-ink-2">
                          {set.artist} · {set.creator}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {diffs.map((bm) => {
                            const c = getStarColor(bm.difficultyRating);
                            return (
                              <span
                                key={bm.id}
                                style={{
                                  backgroundColor: c.bg,
                                  color: c.text,
                                  borderColor: c.border,
                                }}
                                className="font-stat inline-flex min-h-[16px] items-center rounded-[4px] border px-1 text-[0.625rem] leading-none font-bold whitespace-nowrap"
                              >
                                {bm.modeInt === 3 ? `${Math.round(bm.cs)}K ` : ''}
                                {bm.difficultyRating.toFixed(2)}★
                              </span>
                            );
                          })}
                          {set.localStatus.inLazer && (
                            <span className="chip chip-gold min-h-[16px] px-1 text-[0.625rem]">Lazer</span>
                          )}
                          {set.localStatus.inStable && (
                            <span className="chip chip-gold min-h-[16px] px-1 text-[0.625rem]">Stable</span>
                          )}
                        </div>
                      </div>

                      {/* Right Action Stack */}
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isDownloading && activeTask ? (
                          <span className="btn btn-sm min-h-[28px] border-osu/40 bg-osu/15 px-2 font-mono text-[0.71875rem] text-osu-soft">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {activeTask.progress}%
                          </span>
                        ) : isTargetInstalled && anyGameRunning ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleLoadAgain(set.id)}
                              className="btn btn-sm btn-lazer min-h-[28px] px-2 text-[0.71875rem]"
                              title="向运行中的游戏发送加载请求"
                            >
                              <Gamepad2 className="h-3 w-3" />
                              <span>再次导入</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadAndLoad(set)}
                              title="重新下载"
                              className="btn btn-sm btn-icon min-h-[28px] w-7"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleDownloadAndLoad(set)}
                            className="btn btn-sm btn-primary min-h-[28px] px-2.5 text-[0.71875rem]"
                          >
                            {anyGameRunning ? (
                              <Zap className="h-3 w-3" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            <span>{anyGameRunning ? '下载并加载' : '下载'}</span>
                          </button>
                        )}

                        {canPreview && (
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(set.id)}
                            className="btn btn-sm min-h-[24px] px-2 text-[0.6875rem] text-ink-2 hover:text-ink"
                          >
                            <Eye className="h-3 w-3 text-osu" />
                            <span>预览</span>
                          </button>
                        )}
                      </div>

                      {isDownloading && activeTask && (
                        <div className="meter absolute inset-x-0 bottom-0 h-[2.5px] rounded-none">
                          <span
                            style={{ width: `${activeTask.progress}%`, backgroundColor: '#ff66aa' }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Live Download / Auto-Load Dock */}
            {recentTasks.length > 0 && (
              <footer className="mac-glass-bar shrink-0 space-y-1.5 border-t border-hairline px-3 py-2">
                <div className="flex items-center justify-between text-[0.6875rem] text-ink-3">
                  <span className="overline">最近下载与加载状态</span>
                  <button
                    type="button"
                    onClick={() => void window.electronAPI?.showMainWindow?.()}
                    className="hover:text-ink"
                  >
                    在主窗口查看全部 →
                  </button>
                </div>
                {recentTasks.map((t) => {
                  const done = t.status === 'completed' || t.status === 'queued_lazer';
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-[8px] border border-hairline bg-tint px-2 py-1 text-[0.71875rem]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        {done ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-ok" />
                        ) : t.status === 'failed' ? (
                          <X className="h-3 w-3 shrink-0 text-bad" />
                        ) : (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-osu" />
                        )}
                        <span className="truncate font-semibold text-ink">{t.title}</span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {t.autoLoadedInGame ? (
                          <span className="rounded bg-emerald-500/18 px-1.5 py-px text-[0.65625rem] font-semibold text-ok">
                            已游戏加载
                          </span>
                        ) : done ? (
                          <span className="text-[0.65625rem] font-semibold text-ok">已完成</span>
                        ) : (
                          <span className="font-mono text-[0.6875rem] text-ink-2 tabular-nums">
                            {t.speedBps > 0 ? `${formatBytes(t.speedBps)}/s` : `${t.progress}%`}
                          </span>
                        )}
                        {done && (
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(t.beatmapsetId)}
                            className="rounded border border-hairline bg-surface-2 px-1.5 py-px text-[0.65625rem] font-semibold text-ink hover:border-osu/50"
                          >
                            预览
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </footer>
            )}
          </>
        )}

        <audio
          ref={audioRef}
          onEnded={() => setPlayingId(null)}
          className="hidden"
        />

        {toast && (
          <div className="glass animate-toast-in pointer-events-none fixed right-3 bottom-3 left-3 z-50 rounded-[10px] border-osu/40 px-3 py-2 text-center text-[0.75rem] font-semibold text-ink shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
