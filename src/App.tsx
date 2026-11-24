import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  Disc3,
  Download,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Music,
  Square,
  Zap,
} from 'lucide-react';
import {
  cancelDownloadTask,
  clearCustomBackground,
  clearFinishedDownloadTasks,
  clearLazerPending,
  enqueueBatchDownloads,
  enqueueDownload,
  fetchConfig,
  fetchDownloads,
  fetchFastBatchStatus,
  fetchLibraryStatus,
  fetchNetworkStatus,
  importLazerPending,
  launchGameClient,
  loadBeatmapIntoGame,
  openLocalFolder,
  retryDownloadTask,
  runNetworkBenchmark,
  searchBeatmapsets,
  updateConfig,
  uploadCustomBackground,
} from './api';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { BeatmapCard } from './components/BeatmapCard';
import { BeatmapDetailModal } from './components/BeatmapDetailModal';
import { BeatmapListRow } from './components/BeatmapListRow';
import { DownloadDrawer } from './components/DownloadDrawer';
import { FastBatchModal } from './components/FastBatchModal';
import { FilterPanel } from './components/FilterPanel';
import { LazerSongSelect } from './components/LazerSongSelect';
import { LibrarySyncModal } from './components/LibrarySyncModal';
import { ManiaPreviewModal } from './components/ManiaPreviewModal';
import { SettingsModal } from './components/SettingsModal';
import { SideRail } from './components/SideRail';
import { TitleBar } from './components/TitleBar';
import {
  DEFAULT_FILTERS,
  DEFAULT_FONT_SCALE,
  THEME_OPTIONS,
  VIEW_MODE_OPTIONS,
  WorkflowPreset,
  clampFontScale,
  isDarkTheme,
  isValidTheme,
} from './constants';
import {
  applyAccentVariables,
  clearAccentVariables,
  extractDominantColor,
} from './utils/themeColor';
import { extractPpScenarioFromFilters } from './utils/pp';
import {
  AppConfig,
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  FastBatchSnapshot,
  LocalLibraryStatus,
  NetworkStatus,
  NormalizedBeatmapset,
  PreferredMirror,
  SearchFilters,
  SearchResult,
  SongViewMode,
  ThemeId,
} from './types';

function readInitialTheme(): ThemeId {
  try {
    const stored = localStorage.getItem('osu4k-theme');
    if (isValidTheme(stored)) return stored;
  } catch {
    // Ignore storage error
  }
  return 'light';
}

function readInitialFontScale(): number {
  try {
    const stored = localStorage.getItem('osu4k-font-scale');
    if (stored !== null && stored !== '') return clampFontScale(stored, DEFAULT_FONT_SCALE);
  } catch {
    // Ignore storage error
  }
  return DEFAULT_FONT_SCALE;
}

function readInitialViewMode(): SongViewMode {
  try {
    const stored = localStorage.getItem('osu4k-view-mode');
    if (stored === 'grid' || stored === 'list' || stored === 'lazer') return stored;
  } catch {
    // Ignore storage error
  }
  return 'lazer';
}

function readBoolStorage(key: string, fallback = false): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Ignore storage error
  }
  return fallback;
}

const VIEW_MODE_ICONS: Record<SongViewMode, typeof LayoutGrid> = {
  grid: LayoutGrid,
  list: List,
  lazer: Disc3,
};

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [network, setNetwork] = useState<NetworkStatus | null>(null);
  const [library, setLibrary] = useState<LocalLibraryStatus | null>(null);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);

  const [theme, setTheme] = useState<ThemeId>(readInitialTheme);
  const [viewMode, setViewMode] = useState<SongViewMode>(readInitialViewMode);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [target, setTarget] = useState<DownloadTarget>('lazer');
  const [variant, setVariant] = useState<DownloadVariant>('novideo');

  const [results, setResults] = useState<NormalizedBeatmapset[]>([]);
  const [searchMeta, setSearchMeta] = useState<Omit<SearchResult, 'beatmapsets'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [playingSet, setPlayingSet] = useState<NormalizedBeatmapset | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readBoolStorage('osu4k-sidebar-collapsed', false),
  );
  const [filterCollapsed, setFilterCollapsed] = useState<boolean>(() =>
    readBoolStorage('osu4k-filter-collapsed', false),
  );
  const [activeLazerSet, setActiveLazerSet] = useState<NormalizedBeatmapset | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [initialFontScale] = useState<number>(readInitialFontScale);
  const [appearancePreview, setAppearancePreview] = useState<Partial<AppConfig> | null>(null);
  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const [globalBgLayers, setGlobalBgLayers] = useState<[string | null, string | null]>([null, null]);
  const [frontGlobalBgSlot, setFrontGlobalBgSlot] = useState<0 | 1>(0);
  const loadedGlobalBgUrlsRef = useRef<Set<string>>(new Set());
  const [detailState, setDetailState] = useState<{
    set: NormalizedBeatmapset;
    diffId?: number | null;
    focusPp?: boolean;
  } | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [fastBatchOpen, setFastBatchOpen] = useState(false);
  const [fastBatch, setFastBatch] = useState<FastBatchSnapshot | null>(null);
  const [librarySyncOpen, setLibrarySyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [launchingClient, setLaunchingClient] = useState<'stable' | 'lazer' | null>(null);
  const [previewState, setPreviewState] = useState<{
    beatmapsetId: number;
    initialBeatmapId?: number | null;
    titleHint?: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const notifiedDoneIdsRef = useRef<Set<string>>(new Set());
  const initialDownloadsSyncedRef = useRef(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const searchEpochRef = useRef(0);

  const openDetail = useCallback(
    (set: NormalizedBeatmapset, options?: { diffId?: number; focusPp?: boolean }) => {
      setDetailState({
        set,
        diffId: options?.diffId ?? null,
        focusPp: options?.focusPp ?? false,
      });
    },
    [],
  );

  const notify = useCallback(
    (msg: string, action?: { actionLabel: string; onAction: () => void }) => {
      setToast({
        text: msg,
        actionLabel: action?.actionLabel,
        onAction: action?.onAction,
      });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), action ? 5500 : 3500);
    },
    [],
  );

  const openManiaPreview = useCallback(
    (beatmapsetId: number, options?: { beatmapId?: number | null; titleHint?: string }) => {
      setIsPlaying(false);
      setPlayingSet(null);
      setPreviewState({
        beatmapsetId,
        initialBeatmapId: options?.beatmapId ?? null,
        titleHint: options?.titleHint,
      });
    },
    [],
  );

  const applyTheme = useCallback((nextTheme: ThemeId, persistBackend = true) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem('osu4k-theme', nextTheme);
    } catch {
      // Ignore storage error
    }
    const meta = THEME_OPTIONS.find((t) => t.id === nextTheme);
    if (meta) {
      void window.electronAPI?.setBackgroundColor?.(meta.electronBg);
    }
    if (persistBackend) {
      void updateConfig({ theme: nextTheme })
        .then((cfg) => setConfig(cfg))
        .catch(() => {});
    }
  }, []);

  const applyViewMode = useCallback((nextMode: SongViewMode, persistBackend = true) => {
    setViewMode(nextMode);
    try {
      localStorage.setItem('osu4k-view-mode', nextMode);
    } catch {
      // Ignore storage error
    }
    if (persistBackend) {
      void updateConfig({ viewMode: nextMode })
        .then((cfg) => setConfig(cfg))
        .catch(() => {});
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('osu4k-sidebar-collapsed', String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const toggleFilterCollapsed = useCallback(() => {
    setFilterCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('osu4k-filter-collapsed', String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const effectiveConfig = useMemo(() => {
    const merged = {
      customBgImage: config?.customBgImage ?? '',
      customBgOpacity: config?.customBgOpacity ?? 0.75,
      dynamicBgFromSong: config?.dynamicBgFromSong ?? true,
      dynamicThemeFromBg: config?.dynamicThemeFromBg ?? true,
      accentColor: config?.accentColor ?? '',
      ...appearancePreview,
    };
    return {
      ...merged,
      fontScale: clampFontScale(
        appearancePreview?.fontScale ?? config?.fontScale ?? initialFontScale,
        DEFAULT_FONT_SCALE,
      ),
    };
  }, [config, appearancePreview, initialFontScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-scale', String(effectiveConfig.fontScale));
  }, [effectiveConfig.fontScale]);

  useEffect(() => {
    if (viewMode === 'lazer' && mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [viewMode]);

  const effectiveBgUrl = useMemo(() => {
    if (viewMode === 'lazer' && effectiveConfig.dynamicBgFromSong && activeLazerSet?.coverUrl) {
      return activeLazerSet.coverUrl;
    }
    return effectiveConfig.customBgImage || null;
  }, [viewMode, effectiveConfig.dynamicBgFromSong, effectiveConfig.customBgImage, activeLazerSet]);

  useEffect(() => {
    document.documentElement.dataset.hasBg = effectiveBgUrl ? 'true' : 'false';
  }, [effectiveBgUrl]);

  useEffect(() => {
    if (!effectiveBgUrl) {
      setGlobalBgLayers([null, null]);
      return;
    }
    if (globalBgLayers[frontGlobalBgSlot] === effectiveBgUrl) return;
    const backSlot: 0 | 1 = frontGlobalBgSlot === 0 ? 1 : 0;
    if (globalBgLayers[backSlot] === effectiveBgUrl) {
      if (loadedGlobalBgUrlsRef.current.has(effectiveBgUrl)) {
        setFrontGlobalBgSlot(backSlot);
      }
      return;
    }
    setGlobalBgLayers((prev) => {
      const next: [string | null, string | null] = [...prev];
      next[backSlot] = effectiveBgUrl;
      return next;
    });
  }, [effectiveBgUrl, frontGlobalBgSlot, globalBgLayers]);

  useEffect(() => {
    if (!effectiveConfig.dynamicThemeFromBg || !effectiveBgUrl) {
      setExtractedColor(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void extractDominantColor(effectiveBgUrl).then((hex) => {
        if (!cancelled) setExtractedColor(hex);
      });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [effectiveConfig.dynamicThemeFromBg, effectiveBgUrl]);

  const activeAccentHex = useMemo(() => {
    if (effectiveConfig.dynamicThemeFromBg && effectiveBgUrl && extractedColor) {
      return extractedColor;
    }
    return effectiveConfig.accentColor || null;
  }, [
    effectiveConfig.dynamicThemeFromBg,
    effectiveBgUrl,
    extractedColor,
    effectiveConfig.accentColor,
  ]);

  useEffect(() => {
    if (activeAccentHex) {
      applyAccentVariables(activeAccentHex, isDarkTheme(theme));
    } else {
      clearAccentVariables();
    }
  }, [activeAccentHex, theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = THEME_OPTIONS.find((t) => t.id === theme);
    if (meta) {
      void window.electronAPI?.setBackgroundColor?.(meta.electronBg);
    }
  }, [theme]);

  const runSearch = useCallback(async (f: SearchFilters, append = false) => {
    if (append && loadingMoreRef.current) return;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      searchEpochRef.current += 1;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoading(true);
    }
    const myEpoch = searchEpochRef.current;
    setSearchError(null);
    try {
      const res = await searchBeatmapsets(f);
      if (myEpoch !== searchEpochRef.current) return;
      const { beatmapsets, ...meta } = res;
      setSearchMeta(meta);
      setResults((prev) => {
        if (!append) return beatmapsets;
        const existingIds = new Set(prev.map((x) => x.id));
        return [...prev, ...beatmapsets.filter((x) => !existingIds.has(x.id))];
      });
    } catch (err) {
      if (myEpoch !== searchEpochRef.current) return;
      setSearchError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      if (myEpoch === searchEpochRef.current) {
        if (append) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMoreRef.current || !searchMeta?.hasMore) return;
    void runSearch({ ...filters, offset: searchMeta.nextUpstreamOffset }, true);
  }, [loading, searchMeta, filters, runSearch]);

  useEffect(() => {
    void (async () => {
      try {
        const [cfg, net, lib, dls, fb] = await Promise.all([
          fetchConfig(),
          fetchNetworkStatus(false),
          fetchLibraryStatus(false),
          fetchDownloads(),
          fetchFastBatchStatus().catch(() => null),
        ]);
        setConfig(cfg);
        if (fb) setFastBatch(fb);
        try {
          localStorage.setItem(
            'osu4k-font-scale',
            String(clampFontScale(cfg.fontScale, DEFAULT_FONT_SCALE)),
          );
        } catch {
          // Ignore storage error
        }
        setTarget(cfg.defaultTarget);
        setVariant(cfg.defaultVariant);
        if (isValidTheme(cfg.theme)) {
          let hasLocal = false;
          try {
            hasLocal = Boolean(localStorage.getItem('osu4k-theme'));
          } catch {
            hasLocal = false;
          }
          if (!hasLocal) applyTheme(cfg.theme, false);
        }
        if (
          cfg.viewMode &&
          (cfg.viewMode === 'grid' || cfg.viewMode === 'list' || cfg.viewMode === 'lazer')
        ) {
          let hasLocalView = false;
          try {
            hasLocalView = Boolean(localStorage.getItem('osu4k-view-mode'));
          } catch {
            hasLocalView = false;
          }
          if (!hasLocalView) applyViewMode(cfg.viewMode, false);
        }
        setNetwork(net);
        setLibrary(lib);
        for (const t of dls) {
          if (t.status === 'completed' || t.status === 'queued_lazer') {
            notifiedDoneIdsRef.current.add(t.id);
          }
        }
        initialDownloadsSyncedRef.current = true;
        setDownloads(dls);
      } catch {
        initialDownloadsSyncedRef.current = true;
      }
      void runSearch(DEFAULT_FILTERS, false);
    })();

    const previewParam = Number(new URLSearchParams(window.location.search).get('previewSet'));
    if (Number.isFinite(previewParam) && previewParam > 0) {
      openManiaPreview(previewParam);
    }

    const api = window.electronAPI;
    let unsubOverlay: (() => void) | undefined;
    let unsubOpenPreview: (() => void) | undefined;
    if (api?.isElectron) {
      void api.isOverlayOpen?.().then((v) => setOverlayOpen(Boolean(v)));
      unsubOverlay = api.onOverlayStateChange?.((v) => setOverlayOpen(Boolean(v)));
      unsubOpenPreview = api.onOpenPreviewInMain?.((payload) => {
        if (payload?.beatmapsetId) {
          openManiaPreview(payload.beatmapsetId, { beatmapId: payload.beatmapId ?? null });
        }
      });
    }

    const es = new EventSource('/api/events');
    es.addEventListener('downloads', (ev) => {
      try {
        setDownloads(JSON.parse(ev.data) as DownloadTask[]);
      } catch {
        // Ignore parse error
      }
    });
    es.addEventListener('network', (ev) => {
      try {
        setNetwork(JSON.parse(ev.data) as NetworkStatus);
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
    es.addEventListener('fast-batch', (ev) => {
      try {
        setFastBatch(JSON.parse(ev.data) as FastBatchSnapshot);
      } catch {
        // Ignore
      }
    });

    return () => {
      es.close();
      unsubOverlay?.();
      unsubOpenPreview?.();
    };
  }, [applyTheme, applyViewMode, openManiaPreview, runSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (settingsOpen) {
        setAppearancePreview(null);
        setSettingsOpen(false);
      }
      else if (fastBatchOpen) setFastBatchOpen(false);
      else if (librarySyncOpen) setLibrarySyncOpen(false);
      else if (previewState) setPreviewState(null);
      else if (detailState) setDetailState(null);
      else if (downloadsOpen) setDownloadsOpen(false);
      else if (navOpen) setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen, fastBatchOpen, librarySyncOpen, previewState, detailState, downloadsOpen, navOpen]);

  // Track outer scroll offset in Grid / List views for floating Back-to-Top button
  useEffect(() => {
    if (viewMode === 'lazer' || results.length === 0) {
      setShowBackToTop(false);
      return;
    }
    const root = mainScrollRef.current;
    if (!root) return;
    const syncTopState = () => {
      const next = root.scrollTop > 280;
      setShowBackToTop((prev) => (prev === next ? prev : next));
    };
    syncTopState();
    root.addEventListener('scroll', syncTopState, { passive: true });
    return () => root.removeEventListener('scroll', syncTopState);
  }, [viewMode, results.length]);

  // Infinite auto-load more when scrolling near the bottom in grid / list views
  useEffect(() => {
    if (viewMode === 'lazer') return;
    const root = mainScrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return;
    if (!searchMeta?.hasMore || loading || loadingMore || searchError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          handleLoadMore();
        }
      },
      { root, rootMargin: '300px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, searchMeta?.hasMore, loading, loadingMore, searchError, results.length, handleLoadMore]);

  const completedCount = useMemo(
    () => downloads.filter((d) => d.status === 'completed' || d.status === 'queued_lazer').length,
    [downloads],
  );
  useEffect(() => {
    if (!initialDownloadsSyncedRef.current) return;
    for (const t of downloads) {
      if (
        (t.status === 'completed' || t.status === 'queued_lazer') &&
        !notifiedDoneIdsRef.current.has(t.id)
      ) {
        notifiedDoneIdsRef.current.add(t.id);
        notify(
          t.autoLoadedInGame
            ? `${t.title} 已导入并在游戏中加载`
            : `${t.title} 下载完成，可立即预览谱面`,
          {
            actionLabel: '预览谱面',
            onAction: () => openManiaPreview(t.beatmapsetId, { titleHint: t.title }),
          },
        );
        break;
      }
    }
  }, [downloads, notify, openManiaPreview]);

  useEffect(() => {
    if (completedCount === 0) return;
    setResults((prev) =>
      prev.map((item) => {
        const doneTasks = downloads.filter(
          (d) =>
            d.beatmapsetId === item.id &&
            (d.status === 'completed' || d.status === 'queued_lazer'),
        );
        if (doneTasks.length === 0) return item;
        let inStable = item.localStatus.inStable;
        let inLazer = item.localStatus.inLazer;
        let inLazerPending = item.localStatus.inLazerPending;
        for (const t of doneTasks) {
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
  }, [completedCount, downloads]);

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

  const handleBenchmark = async () => {
    notify('正在检测代理 6174 与全部镜像源延迟...');
    const st = await runNetworkBenchmark();
    setNetwork(st);
    const best = st.mirrors.find((m) => m.id === st.recommendedMirror);
    notify(
      best
        ? `测速完成：最优源 ${best.shortName} (${best.latencyMs ?? '?'}ms)`
        : '测速完成，请检查网络或代理设置',
    );
  };

  const handleSelectPreset = (preset: WorkflowPreset) => {
    setActivePresetId(preset.id);
    const next: SearchFilters = { ...DEFAULT_FILTERS, ...preset.filters, offset: 0 };
    setFilters(next);
    if (preset.suggestedTarget) {
      setTarget(preset.suggestedTarget);
    }
    setNavOpen(false);
    void runSearch(next, false);
  };

  const handleFilterChange = (next: SearchFilters, autoSearch = false) => {
    setActivePresetId(null);
    setFilters(next);
    if (autoSearch) {
      void runSearch(next, false);
    }
  };

  const handleResetFilters = () => {
    setActivePresetId(null);
    setFilters(DEFAULT_FILTERS);
    void runSearch(DEFAULT_FILTERS, false);
  };

  const handleTogglePlay = useCallback(
    (set: NormalizedBeatmapset) => {
      if (playingSet?.id === set.id) {
        setIsPlaying((p) => !p);
      } else {
        setPlayingSet(set);
        setIsPlaying(true);
      }
    },
    [playingSet?.id],
  );

  const handleStartPlay = useCallback((set: NormalizedBeatmapset) => {
    setPlayingSet(set);
    setIsPlaying(true);
  }, []);

  const handleToggleSelectId = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDownload = useCallback(
    async (
      set: NormalizedBeatmapset,
      chosenTarget: DownloadTarget,
      chosenVariant: DownloadVariant = variant,
      chosenMirror: PreferredMirror = config?.preferredDownloadSource || 'auto',
    ) => {
      await enqueueDownload({
        beatmapsetId: set.id,
        title: set.title,
        artist: set.artist,
        creator: set.creator,
        target: chosenTarget,
        variant: chosenVariant,
        preferredMirror: chosenMirror,
      });
      const label =
        chosenTarget === 'lazer' ? 'Lazer' : chosenTarget === 'stable' ? 'Stable' : '双端';
      notify(`已加入下载队列 (${label}): ${set.title}`);
    },
    [variant, config?.preferredDownloadSource, notify],
  );

  const handleQuickDownload = useCallback(
    (s: NormalizedBeatmapset, t: DownloadTarget) => {
      void handleDownload(s, t);
    },
    [handleDownload],
  );

  const handleCardPreviewBeatmap = useCallback(
    (s: NormalizedBeatmapset, diffId?: number) => {
      openManiaPreview(s.id, { beatmapId: diffId ?? null, titleHint: s.title });
    },
    [openManiaPreview],
  );

  const handleBatchDownload = async () => {
    const picked = results.filter((r) => selectedIds.has(r.id));
    if (picked.length === 0) return;
    await enqueueBatchDownloads({
      items: picked.map((p) => ({
        beatmapsetId: p.id,
        title: p.title,
        artist: p.artist,
        creator: p.creator,
      })),
      target,
      variant,
      preferredMirror: config?.preferredDownloadSource || 'auto',
    });
    notify(`已批量加入 ${picked.length} 首谱面到下载队列`);
    setSelectedIds(new Set());
    setBatchMode(false);
    setDownloadsOpen(true);
  };

  const handleImportAllLazer = async () => {
    const res = await importLazerPending();
    notify(res.message);
    setLibrary(await fetchLibraryStatus(true));
  };

  const handleClearLazerPending = async () => {
    const res = await clearLazerPending();
    notify(`已清理 ${res.deletedCount} 个待导入 .osz 文件`);
    setLibrary(await fetchLibraryStatus(false));
  };

  const handleSaveConfig = async (patch: Partial<AppConfig>) => {
    const prevHotkey = config?.overlayHotkey;
    const updated = await updateConfig(patch);
    setConfig(updated);
    try {
      localStorage.setItem(
        'osu4k-font-scale',
        String(clampFontScale(updated.fontScale, DEFAULT_FONT_SCALE)),
      );
    } catch {
      // Ignore storage error
    }
    setTarget(updated.defaultTarget);
    setVariant(updated.defaultVariant);
    if (
      patch.overlayHotkey &&
      patch.overlayHotkey !== prevHotkey &&
      window.electronAPI?.setOverlayHotkey
    ) {
      const hkRes = await window.electronAPI.setOverlayHotkey(patch.overlayHotkey);
      if (!hkRes.ok) {
        notify(hkRes.error || '热键注册失败');
      } else {
        notify(`设置已保存，浮窗热键已更新为 ${patch.overlayHotkey}`);
      }
    } else {
      notify('设置已保存，正在刷新网络与本地曲库...');
    }
    const [net, lib] = await Promise.all([runNetworkBenchmark(), fetchLibraryStatus(true)]);
    setNetwork(net);
    setLibrary(lib);
  };

  const handleToggleOverlay = async () => {
    const api = window.electronAPI;
    if (api?.toggleOverlay) {
      const opened = await api.toggleOverlay();
      setOverlayOpen(opened);
    } else {
      window.open('/?mode=overlay', 'osu4k-overlay', 'width=440,height=660');
    }
  };

  const handleLoadIntoGame = async (beatmapsetId: number) => {
    try {
      const res = await loadBeatmapIntoGame(beatmapsetId, 'auto');
      notify(res.message);
    } catch (err) {
      notify(err instanceof Error ? err.message : '发送加载请求失败');
    }
  };

  const handleLaunchGame = useCallback(
    async (client: 'stable' | 'lazer') => {
      if (launchingClient) return;
      setLaunchingClient(client);
      try {
        const res = await launchGameClient(client);
        if (!res.ok) {
          notify(res.message, {
            actionLabel: '打开设置',
            onAction: () => setSettingsOpen(true),
          });
        } else if (
          client === 'lazer' &&
          !res.alreadyRunning &&
          (library?.lazerPendingCount ?? 0) > 0
        ) {
          notify(res.message, {
            actionLabel: `导入 ${library?.lazerPendingCount} 个待导入`,
            onAction: () => {
              void importLazerPending().then(async (imp) => {
                notify(imp.message);
                setLibrary(await fetchLibraryStatus(true));
              });
            },
          });
        } else {
          notify(res.message);
        }
        window.setTimeout(() => {
          void fetchLibraryStatus(true)
            .then((st) => setLibrary(st))
            .catch(() => {});
        }, 1600);
      } catch (err) {
        notify(err instanceof Error ? err.message : '启动游戏失败');
      } finally {
        setLaunchingClient(null);
      }
    },
    [launchingClient, library?.lazerPendingCount, notify],
  );

  const activePpScenario = useMemo(() => extractPpScenarioFromFilters(filters), [filters]);

  const handlePreviewAppearance = useCallback((patch: Partial<AppConfig> | null) => {
    if (!patch) {
      setAppearancePreview(null);
    } else {
      setAppearancePreview((prev) => ({ ...(prev ?? {}), ...patch }));
    }
  }, []);

  const handleUploadBackground = useCallback(
    async (payload: { filePath?: string; dataUrl?: string; url?: string }) => {
      const updated = await uploadCustomBackground(payload);
      setConfig(updated);
      return updated;
    },
    [],
  );

  const handleClearBackground = useCallback(async () => {
    const updated = await clearCustomBackground();
    setConfig(updated);
    return updated;
  }, []);

  return (
    <div className="app-canvas relative isolate flex h-screen flex-col overflow-hidden text-ink">
      {/* Whole-Desktop Double-Buffered Background Layer */}
      {effectiveBgUrl && (
        <div
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
          aria-hidden="true"
        >
          {([0, 1] as const).map((slotIdx) => {
            const url = globalBgLayers[slotIdx];
            if (!url) return null;
            return (
              <img
                key={slotIdx}
                src={url}
                alt=""
                onLoad={() => {
                  loadedGlobalBgUrlsRef.current.add(url);
                  if (url === effectiveBgUrl && frontGlobalBgSlot !== slotIdx) {
                    setFrontGlobalBgSlot(slotIdx);
                  }
                }}
                style={{
                  opacity: frontGlobalBgSlot === slotIdx ? effectiveConfig.customBgOpacity : 0,
                }}
                className="absolute inset-0 h-full w-full scale-[1.03] object-cover blur-[6px] transition-opacity duration-500 ease-out"
              />
            );
          })}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--t-canvas) 18%, transparent), color-mix(in srgb, var(--t-canvas) 62%, transparent))',
            }}
          />
        </div>
      )}

      <TitleBar
        network={network}
        theme={theme}
        overlayOpen={overlayOpen}
        overlayHotkey={config?.overlayHotkey}
        sidebarCollapsed={sidebarCollapsed}
        activeAccentHex={activeAccentHex}
        onToggleOverlay={() => void handleToggleOverlay()}
        onChangeTheme={(t) => applyTheme(t, true)}
        onBenchmark={handleBenchmark}
        onToggleNav={() => setNavOpen((v) => !v)}
        onToggleSidebar={toggleSidebarCollapsed}
      />

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Collapsible Impeccable Navigation Rail */}
        <aside
          className={`hidden shrink-0 overflow-hidden bg-surface-0/82 backdrop-blur-xl transition-[width,opacity] duration-250 ease-out lg:block ${
            sidebarCollapsed
              ? 'pointer-events-none w-0 border-r-0 opacity-0'
              : 'w-[var(--sidebar-w)] border-r border-hairline opacity-100'
          }`}
        >
          <div className="h-full w-[var(--sidebar-w)]">
            <SideRail
              target={target}
              variant={variant}
              activePresetId={activePresetId}
              library={library}
              downloads={downloads}
              fastBatch={fastBatch}
              launchingClient={launchingClient}
              onChangeTarget={setTarget}
              onChangeVariant={setVariant}
              onSelectPreset={handleSelectPreset}
              onLaunchGame={(c) => void handleLaunchGame(c)}
              onOpenLibrarySync={() => setLibrarySyncOpen(true)}
              onOpenFastBatch={() => setFastBatchOpen(true)}
              onOpenDownloads={() => setDownloadsOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </aside>

        {/* Narrow Viewport Drawer Rail */}
        {navOpen && (
          <div className="modal-backdrop flex lg:hidden" onClick={() => setNavOpen(false)}>
            <aside
              className="animate-rail-in h-full w-[var(--sidebar-w)] border-r border-hairline-strong bg-surface-0 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <SideRail
                target={target}
                variant={variant}
                activePresetId={activePresetId}
                library={library}
                downloads={downloads}
                fastBatch={fastBatch}
                launchingClient={launchingClient}
                onChangeTarget={setTarget}
                onChangeVariant={setVariant}
                onSelectPreset={handleSelectPreset}
                onLaunchGame={(c) => {
                  setNavOpen(false);
                  void handleLaunchGame(c);
                }}
                onOpenLibrarySync={() => {
                  setNavOpen(false);
                  setLibrarySyncOpen(true);
                }}
                onOpenFastBatch={() => {
                  setNavOpen(false);
                  setFastBatchOpen(true);
                }}
                onOpenDownloads={() => {
                  setNavOpen(false);
                  setDownloadsOpen(true);
                }}
                onOpenSettings={() => {
                  setNavOpen(false);
                  setSettingsOpen(true);
                }}
              />
            </aside>
          </div>
        )}

        {/* Main Workspace */}
        <main
          ref={mainScrollRef}
          className={
            viewMode === 'lazer'
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-3.5 pt-3 pb-3 sm:px-5 sm:pt-3.5 sm:pb-3.5'
              : `flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4 sm:px-5 ${playingSet ? 'pb-28' : 'pb-8'}`
          }
        >
          <div
            className={
              viewMode === 'lazer'
                ? 'mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-2.5 sm:gap-3'
                : 'mx-auto max-w-[1440px] space-y-4'
            }
          >
            <FilterPanel
              filters={filters}
              loading={loading}
              collapsed={filterCollapsed}
              floatingAdvanced={viewMode === 'lazer'}
              onToggleCollapsed={toggleFilterCollapsed}
              onChange={handleFilterChange}
              onSearch={(override) => void runSearch(override || filters, false)}
              onReset={handleResetFilters}
            />

            {/* Status & Batch Controls Bar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5 text-[0.78125rem] font-medium text-ink-2">
              <div
                className={`flex flex-wrap items-center gap-2 ${
                  effectiveBgUrl
                    ? 'rounded-lg border border-hairline bg-surface-1/78 px-2.5 py-1 backdrop-blur-md'
                    : ''
                }`}
              >
                <span>
                  当前显示 <strong className="font-stat font-bold text-ink">{results.length}</strong> 套谱面
                </span>
                {searchMeta && (
                  <span className="chip">
                    搜索源: {searchMeta.provider === 'osudirect' ? 'osu.direct' : '小夜镜像 (Sayobot)'}
                  </span>
                )}
                {searchMeta?.fallbackUsed && searchMeta.fallbackReason && (
                  <span className="chip border-amber-500/40 bg-amber-500/12 text-warn">
                    <AlertTriangle className="h-3 w-3" />
                    {searchMeta.fallbackReason}
                  </span>
                )}
                {searchError && <span className="text-bad">错误: {searchError}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* 3-mode Song View Switcher (卡片 / 列表 / Lazer) */}
                <div
                  role="group"
                  aria-label="谱面呈现形式"
                  className="inline-flex min-h-[30px] items-center gap-0.5 rounded-[9px] border border-hairline bg-surface-1 p-0.5"
                >
                  {VIEW_MODE_OPTIONS.map((opt) => {
                    const active = viewMode === opt.id;
                    const Icon = VIEW_MODE_ICONS[opt.id];
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => applyViewMode(opt.id, true)}
                        title={opt.desc}
                        aria-pressed={active}
                        className={`inline-flex min-h-[24px] items-center gap-1 rounded-[7px] px-2 py-0.5 text-[0.75rem] font-semibold transition-colors ${
                          active
                            ? opt.id === 'lazer'
                              ? 'bg-lazer/18 text-lazer-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-lazer)_48%,transparent)]'
                              : 'bg-surface-2 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.14),inset_0_0_0_1px_var(--t-hairline-strong)]'
                            : 'text-ink-3 hover:bg-tint hover:text-ink'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setFastBatchOpen(true)}
                  className={`btn btn-sm ${
                    fastBatch?.state === 'running'
                      ? 'border-osu/50 bg-osu/14 text-osu-soft'
                      : 'border-lazer/40 bg-lazer/10 text-lazer-soft hover:border-lazer/65 hover:bg-lazer/16'
                  }`}
                >
                  {fastBatch?.state === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {fastBatch?.state === 'running' || fastBatch?.state === 'paused'
                      ? `快速批量 ${fastBatch.completedCount}/${fastBatch.targetCount}`
                      : '快速批量下载'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBatchMode((v) => !v);
                    setSelectedIds(new Set());
                  }}
                  className={`btn btn-sm ${
                    batchMode
                      ? 'border-amber-500/45 bg-amber-500/15 text-warn'
                      : ''
                  }`}
                >
                  {batchMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                  <span>{batchMode ? '退出批量' : '批量选择'}</span>
                </button>

                {batchMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedIds.size === results.length && results.length > 0) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(results.map((r) => r.id)));
                        }
                      }}
                      className="btn btn-sm"
                    >
                      <Square className="h-3.5 w-3.5" />
                      <span>{selectedIds.size === results.length && results.length > 0 ? '取消全选' : '全选本页'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => void handleBatchDownload()}
                      className="btn btn-sm btn-primary font-stat"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载已选 ({selectedIds.size})</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Song Presentation (Grid / Compact List / Lazer Carousel) */}
            {loading ? (
              viewMode === 'list' ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="panel h-[84px] animate-pulse opacity-60" />
                  ))}
                </div>
              ) : viewMode === 'lazer' ? (
                <div className="panel grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 opacity-70 md:grid-cols-[minmax(290px,340px)_minmax(0,1fr)] lg:grid-cols-[minmax(320px,385px)_minmax(0,1fr)] xl:grid-cols-[minmax(360px,430px)_minmax(0,1fr)]">
                  <div className="panel-flat h-full animate-pulse" />
                  <div className="space-y-3 py-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="panel-flat h-[88px] animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="panel h-[284px] animate-pulse opacity-60"
                    />
                  ))}
                </div>
              )
            ) : results.length === 0 ? (
              <div
                className={
                  viewMode === 'lazer'
                    ? 'panel-flat flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center'
                    : 'panel-flat flex flex-col items-center justify-center py-20 text-center'
                }
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-hairline bg-surface-2 text-ink-3">
                  <Music className="h-6 w-6" />
                </div>
                <p className="font-display text-[0.9375rem] font-semibold text-ink">没有找到符合当前筛选条件的谱面</p>
                <p className="mt-1 text-[0.8125rem] font-medium text-ink-3">
                  可以放宽星数 / LN% / 状态限制，或切换至「全部状态 (Any)」搜索更多练习图
                </p>
              </div>
            ) : (
              <>
                <div
                  key={viewMode}
                  className={
                    viewMode === 'lazer'
                      ? 'animate-view-in flex min-h-0 flex-1 flex-col overflow-hidden'
                      : 'animate-view-in'
                  }
                >
                  {viewMode === 'grid' && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {results.map((set) => (
                        <BeatmapCard
                          key={set.id}
                          beatmapset={set}
                          activeTarget={target}
                          isPlaying={isPlaying && playingSet?.id === set.id}
                          activeTask={activeTaskBySet.get(set.id)}
                          batchMode={batchMode}
                          selected={selectedIds.has(set.id)}
                          ppScenario={activePpScenario}
                          onToggleSelect={handleToggleSelectId}
                          onTogglePlay={handleTogglePlay}
                          onDownload={handleQuickDownload}
                          onOpenDetail={openDetail}
                          onPreviewBeatmap={handleCardPreviewBeatmap}
                        />
                      ))}
                    </div>
                  )}

                  {viewMode === 'list' && (
                    <div className="space-y-2.5">
                      {results.map((set) => (
                        <BeatmapListRow
                          key={set.id}
                          beatmapset={set}
                          activeTarget={target}
                          isPlaying={isPlaying && playingSet?.id === set.id}
                          activeTask={activeTaskBySet.get(set.id)}
                          batchMode={batchMode}
                          selected={selectedIds.has(set.id)}
                          ppScenario={activePpScenario}
                          onToggleSelect={handleToggleSelectId}
                          onTogglePlay={handleTogglePlay}
                          onDownload={handleQuickDownload}
                          onOpenDetail={openDetail}
                          onPreviewBeatmap={handleCardPreviewBeatmap}
                        />
                      ))}
                    </div>
                  )}

                  {viewMode === 'lazer' && (
                    <LazerSongSelect
                      results={results}
                      activeTarget={target}
                      playingSetId={playingSet?.id ?? null}
                      isPlaying={isPlaying}
                      activeTaskBySet={activeTaskBySet}
                      batchMode={batchMode}
                      selectedIds={selectedIds}
                      hasMore={Boolean(searchMeta?.hasMore)}
                      loadingMore={loadingMore}
                      searchError={Boolean(searchError)}
                      hasAudioDock={Boolean(playingSet)}
                      hasGlobalBg={Boolean(effectiveBgUrl)}
                      filterCollapsed={filterCollapsed}
                      ppScenario={activePpScenario}
                      onActiveBeatmapsetChange={setActiveLazerSet}
                      onToggleSelect={handleToggleSelectId}
                      onTogglePlay={handleTogglePlay}
                      onStartPlay={handleStartPlay}
                      onDownload={handleQuickDownload}
                      onOpenDetail={openDetail}
                      onPreviewBeatmap={handleCardPreviewBeatmap}
                      onLoadMore={handleLoadMore}
                    />
                  )}
                </div>

                {viewMode !== 'lazer' && (
                  <>
                    <div ref={loadMoreSentinelRef} className="h-2" aria-hidden="true" />
                    <div className="flex justify-center pt-2">
                      {loadingMore ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-4 py-1.5 text-[0.78125rem] font-medium text-ink-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-osu" />
                          <span>正在自动加载更多谱面…</span>
                        </div>
                      ) : searchError && searchMeta?.hasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          className="btn min-h-[36px] border-amber-500/45 px-5 text-[0.8125rem] text-warn"
                        >
                          <ChevronDown className="h-4 w-4" />
                          <span>加载失败，点击重试加载更多</span>
                        </button>
                      ) : searchMeta?.hasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          className="btn min-h-[36px] px-6 text-[0.84375rem]"
                        >
                          <ChevronDown className="h-4 w-4 text-osu" />
                          <span>加载更多谱面</span>
                        </button>
                      ) : (
                        results.length > 0 && (
                          <span className="text-[0.75rem] font-medium text-ink-3">
                            已显示全部 {results.length} 套搜索结果
                          </span>
                        )
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Floating Back-to-Top in Grid / List Views */}
      {viewMode !== 'lazer' && showBackToTop && results.length > 0 && (
        <div
          className={`pointer-events-none fixed right-5 z-30 transition-[bottom] duration-200 ${
            playingSet ? 'bottom-28 sm:bottom-[84px]' : 'bottom-5'
          }`}
        >
          <button
            type="button"
            onClick={() => mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title="回到顶部"
            aria-label="回到顶部"
            className="glass animate-fade-in pointer-events-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[0.78125rem] font-semibold text-ink transition-all duration-150 hover:border-osu/60 hover:text-osu"
          >
            <ArrowUp className="h-3.5 w-3.5 text-osu" />
            <span>回到顶部</span>
          </button>
        </div>
      )}

      {/* Floating Audio Preview Dock */}
      <AudioPlayerBar
        beatmapset={playingSet}
        playing={isPlaying}
        activeTarget={target}
        sidebarCollapsed={sidebarCollapsed}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStop={() => {
          setIsPlaying(false);
          setPlayingSet(null);
        }}
        onDownload={(s, t) => void handleDownload(s, t)}
      />

      {/* Detail Modal */}
      <BeatmapDetailModal
        beatmapset={detailState?.set ?? null}
        initialDiffId={detailState?.diffId ?? null}
        focusPp={Boolean(detailState?.focusPp)}
        ppScenario={activePpScenario}
        network={network}
        defaultTarget={target}
        defaultVariant={variant}
        isPlaying={Boolean(detailState && isPlaying && playingSet?.id === detailState.set.id)}
        onClose={() => setDetailState(null)}
        onTogglePlay={handleTogglePlay}
        onSearchTag={(tag) => {
          const next = { ...filters, q: tag, offset: 0 };
          setFilters(next);
          void runSearch(next, false);
        }}
        onPreviewBeatmap={(s, diffId) =>
          openManiaPreview(s.id, { beatmapId: diffId ?? null, titleHint: s.title })
        }
        onDownload={(s, t, v, m) => void handleDownload(s, t, v, m)}
      />

      {/* Mania Beatmap Preview Modal */}
      <ManiaPreviewModal
        beatmapsetId={previewState?.beatmapsetId ?? null}
        initialBeatmapId={previewState?.initialBeatmapId ?? null}
        titleHint={previewState?.titleHint}
        config={config}
        canLoadIntoGame={Boolean(library?.lazerRunning || library?.stableRunning)}
        onLoadIntoGame={(setId) => void handleLoadIntoGame(setId)}
        onUpdatePreviewPrefs={(patch) => {
          void updateConfig(patch)
            .then((cfg) => setConfig(cfg))
            .catch(() => {});
        }}
        onClose={() => setPreviewState(null)}
      />

      {/* Download Queue & Lazer Import Drawer */}
      <DownloadDrawer
        open={downloadsOpen}
        tasks={downloads}
        library={library}
        onClose={() => setDownloadsOpen(false)}
        onCancel={(id) => void cancelDownloadTask(id)}
        onRetry={(id) => void retryDownloadTask(id)}
        onClearFinished={() => void clearFinishedDownloadTasks()}
        onImportAllLazer={() => void handleImportAllLazer()}
        onClearLazerPending={() => void handleClearLazerPending()}
        onOpenLazerImportFolder={() => void openLocalFolder('lazerImport')}
        onPreviewBeatmap={(setId, title) => openManiaPreview(setId, { titleHint: title })}
        onLoadIntoGame={(setId) => void handleLoadIntoGame(setId)}
      />

      {/* Fast Batch Bulk Download Modal */}
      <FastBatchModal
        open={fastBatchOpen}
        filters={filters}
        defaultTarget={target}
        defaultVariant={variant}
        config={config}
        network={network}
        library={library}
        snapshot={fastBatch}
        onClose={() => setFastBatchOpen(false)}
        onSnapshotChange={setFastBatch}
        onImportLazerPending={async (filenames) => {
          const res = await importLazerPending(filenames);
          notify(res.message);
          setLibrary(await fetchLibraryStatus(true));
        }}
        onNotify={notify}
      />

      {/* Dual-Client Library Sync Modal */}
      <LibrarySyncModal
        open={librarySyncOpen}
        library={library}
        onClose={() => setLibrarySyncOpen(false)}
        onLibraryUpdated={setLibrary}
        onNotify={notify}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        config={config}
        network={network}
        theme={theme}
        activeExtractedColor={extractedColor}
        onChangeTheme={(t) => applyTheme(t, true)}
        onPreviewAppearance={handlePreviewAppearance}
        onUploadBackground={handleUploadBackground}
        onClearBackground={handleClearBackground}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
        onBenchmark={handleBenchmark}
      />

      {/* Toast */}
      {toast && (
        <div className="glass animate-toast-in fixed top-12 right-4 z-[60] flex items-center gap-2.5 rounded-xl border-osu/35 px-4 py-2.5 text-[0.8125rem] font-semibold text-ink">
          <span>{toast.text}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
              className="btn btn-sm btn-primary min-h-[26px] px-2 text-[0.75rem]"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
