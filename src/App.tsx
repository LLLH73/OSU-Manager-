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
  MapPin,
  Music,
  RotateCcw,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react';
import {
  cancelDownloadTask,
  clearCustomBackground,
  clearFinishedDownloadTasks,
  clearLazerPending,
  createFilterArchive,
  deleteFilterArchive,
  enqueueBatchDownloads,
  enqueueDownload,
  fetchBeatmapsetDetail,
  fetchConfig,
  fetchDownloads,
  fetchFastBatchStatus,
  fetchFilterArchives,
  fetchLibraryStatus,
  fetchNetworkStatus,
  importLazerPending,
  launchGameClient,
  loadBeatmapIntoGame,
  openLocalFolder,
  openStableSongFolder,
  retryDownloadTask,
  runNetworkBenchmark,
  searchBeatmapsets,
  updateConfig,
  updateFilterArchive,
  uploadCustomBackground,
} from './api';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { BeatmapCard } from './components/BeatmapCard';
import { BeatmapDetailModal } from './components/BeatmapDetailModal';
import { BeatmapListRow } from './components/BeatmapListRow';
import { DownloadDrawer } from './components/DownloadDrawer';
import { FastBatchModal } from './components/FastBatchModal';
import { CurrentBrowsePreview, FilterArchiveRail } from './components/FilterArchiveRail';
import { FilterPanel } from './components/FilterPanel';
import { LazerSongSelect } from './components/LazerSongSelect';
import { LibrarySyncModal } from './components/LibrarySyncModal';
import { ManiaPreviewModal } from './components/ManiaPreviewModal';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsModal } from './components/SettingsModal';
import { SideRail } from './components/SideRail';
import { TitleBar } from './components/TitleBar';
import { BookArchiveMode } from './components/book/BookArchiveMode';
import { GachaStudio } from './components/gacha/GachaStudio';
import { MusicMiniDock } from './components/music/MusicMiniDock';
import { MusicPlayerProvider, useMusicPlayer } from './components/music/MusicPlayerContext';
import { MusicPlayerMode } from './components/music/MusicPlayerMode';
import {
  APP_VERSION,
  DEFAULT_FILTERS,
  DEFAULT_FONT_SCALE,
  THEME_OPTIONS,
  WorkflowPreset,
  clampFontScale,
  getViewModeOptions,
  isDarkTheme,
  isValidTheme,
} from './constants';
import { tx, useI18n } from './i18n';
import { sanitizeFiltersForArchive } from './utils/filterArchive';
import {
  applyAccentVariables,
  clearAccentVariables,
  extractDominantColor,
} from './utils/themeColor';
import { extractPpScenarioFromFilters } from './utils/pp';
import {
  AppConfig,
  BookSummary,
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  FastBatchSnapshot,
  FilterArchive,
  FilterArchiveBrowsePosition,
  LocalLibraryStatus,
  NetworkStatus,
  NormalizedBeatmapset,
  PreferredMirror,
  SearchFilters,
  SearchResult,
  SongViewMode,
  ThemeId,
  WorkspaceMode,
} from './types';
import type { MutableRefObject } from 'react';

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

function AppWorkspace({
  notifyBridgeRef,
  pausePreviewBridgeRef,
}: {
  notifyBridgeRef: MutableRefObject<((msg: string) => void) | null>;
  pausePreviewBridgeRef: MutableRefObject<(() => void) | null>;
}) {
  const { lang, setLang, t } = useI18n();
  const viewModeOptions = useMemo(() => getViewModeOptions(lang), [lang]);
  const {
    isPlaying: musicIsPlaying,
    currentTrack: musicCurrentTrack,
    pause: pauseMusic,
    playTrack: playMusicTrack,
  } = useMusicPlayer();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [network, setNetwork] = useState<NetworkStatus | null>(null);
  const [library, setLibrary] = useState<LocalLibraryStatus | null>(null);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);

  const [theme, setTheme] = useState<ThemeId>(readInitialTheme);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('browse');
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
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      localStorage.removeItem('osu4k-sidebar-collapsed');
    } catch {
      // Ignore storage error
    }
    return false;
  });
  const [filterCollapsed, setFilterCollapsed] = useState<boolean>(() =>
    readBoolStorage('osu4k-filter-collapsed', false),
  );
  const [archiveRailCollapsed, setArchiveRailCollapsed] = useState<boolean>(() =>
    readBoolStorage('osu4k-archive-rail-collapsed', true),
  );
  const [archives, setArchives] = useState<FilterArchive[]>([]);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [restoringArchiveId, setRestoringArchiveId] = useState<string | null>(null);
  const [highlightedSetId, setHighlightedSetId] = useState<number | null>(null);
  const [lazerRestoreTarget, setLazerRestoreTarget] = useState<{
    beatmapsetId: number;
    beatmapId?: number | null;
    nonce: number;
  } | null>(null);
  const [saveInputFocusNonce, setSaveInputFocusNonce] = useState(0);
  const [activeLazerDiffId, setActiveLazerDiffId] = useState<number | null>(null);
  const [gridListVisibleAnchorId, setGridListVisibleAnchorId] = useState<number | null>(null);
  const [headUpstreamOffset, setHeadUpstreamOffset] = useState(0);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [restoredContextInfo, setRestoredContextInfo] = useState<{
    archiveName: string;
    anchorTitle: string;
    anchorBeatmapsetId: number;
    headUpstreamOffset: number;
    savedAnchorSet?: NormalizedBeatmapset;
  } | null>(null);
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
  const [gachaOpen, setGachaOpen] = useState(false);
  const [fastBatch, setFastBatch] = useState<FastBatchSnapshot | null>(null);
  const [librarySyncOpen, setLibrarySyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
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
  const batchOffsetsRef = useRef<Map<number, number>>(new Map());
  const lazerScrollTopRef = useRef(0);
  const highlightTimerRef = useRef<number | null>(null);

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
      pauseMusic();
      setIsPlaying(false);
      setPlayingSet(null);
      setPreviewState({
        beatmapsetId,
        initialBeatmapId: options?.beatmapId ?? null,
        titleHint: options?.titleHint,
      });
    },
    [pauseMusic],
  );

  useEffect(() => {
    notifyBridgeRef.current = notify;
    pausePreviewBridgeRef.current = () => {
      setIsPlaying(false);
      setPlayingSet(null);
    };
  }, [notify, notifyBridgeRef, pausePreviewBridgeRef]);

  const syncConfigLanguage = useCallback(
    (cfg: AppConfig | null | undefined) => {
      if (!cfg) return;
      const cfgLang = cfg.language === 'en' ? 'en' : 'zh';
      setLang(cfgLang);
      void window.electronAPI?.setLanguage?.(cfgLang);
    },
    [setLang],
  );

  const handleCompleteOnboarding = useCallback(
    (openSettingsAfter = false) => {
      setOnboardingOpen(false);
      try {
        localStorage.setItem('osu4k-onboarding-completed', 'true');
      } catch {
        // Ignore storage error
      }
      setConfig((prev) => (prev ? { ...prev, onboardingCompleted: true } : prev));
      void updateConfig({ onboardingCompleted: true })
        .then((cfg) => {
          setConfig(cfg);
        })
        .catch(() => {});
      if (openSettingsAfter) {
        setSettingsOpen(true);
      }
    },
    [],
  );

  const handleSaveConfigRef = useRef<((patch: Partial<AppConfig>) => Promise<void>) | null>(null);

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

  const handleSkipOnboarding = useCallback(() => {
    setAppearancePreview(null);
    if (config?.theme && isValidTheme(config.theme)) {
      applyTheme(config.theme, false);
    }
    syncConfigLanguage(config);
    handleCompleteOnboarding(false);
  }, [applyTheme, config, handleCompleteOnboarding, syncConfigLanguage]);

  const handleSaveOnboardingConfig = useCallback(
    async (patch: Partial<AppConfig>, openSettingsAfter = false) => {
      setOnboardingOpen(false);
      setAppearancePreview(null);
      try {
        localStorage.setItem('osu4k-onboarding-completed', 'true');
      } catch {
        // Ignore storage error
      }
      if (patch.theme && isValidTheme(patch.theme)) {
        applyTheme(patch.theme, false);
      }
      if (patch.viewMode) {
        applyViewMode(patch.viewMode, false);
      }
      if (handleSaveConfigRef.current) {
        await handleSaveConfigRef.current({ ...patch, onboardingCompleted: true });
      }
      if (openSettingsAfter) {
        setSettingsOpen(true);
      }
    },
    [applyTheme, applyViewMode],
  );

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
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

  const toggleArchiveRailCollapsed = useCallback(() => {
    setArchiveRailCollapsed((prev) => {
      const next = !prev;
      if (!next) {
        setWorkspaceMode('browse');
        setGachaOpen(false);
      }
      try {
        localStorage.setItem('osu4k-archive-rail-collapsed', String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const openSaveArchiveRail = useCallback(() => {
    setWorkspaceMode('browse');
    setGachaOpen(false);
    setArchiveRailCollapsed(false);
    try {
      localStorage.setItem('osu4k-archive-rail-collapsed', 'false');
    } catch {
      // Ignore storage error
    }
    setSaveInputFocusNonce((n) => n + 1);
  }, []);

  const switchWorkspaceMode = useCallback((nextMode: WorkspaceMode) => {
    setWorkspaceMode(nextMode);
    setGachaOpen(false);
    setNavOpen(false);
    if (nextMode === 'book' || nextMode === 'music') {
      setIsPlaying(false);
      if (nextMode === 'music') {
        setPlayingSet(null);
        setSidebarCollapsed(true);
      }
      setArchiveRailCollapsed(true);
      try {
        localStorage.setItem('osu4k-archive-rail-collapsed', 'true');
      } catch {
        // Ignore storage error
      }
    }
  }, []);

  const openGachaStudio = useCallback(() => {
    pauseMusic();
    setIsPlaying(false);
    setPlayingSet(null);
    setNavOpen(false);
    setSidebarCollapsed(true);
    setArchiveRailCollapsed(true);
    try {
      localStorage.setItem('osu4k-archive-rail-collapsed', 'true');
    } catch {
      // Ignore storage error
    }
    setWorkspaceMode('browse');
    setGachaOpen(true);
  }, [pauseMusic]);

  const handleOpenBookInMusicPlayer = useCallback(
    (book?: BookSummary, contextBooks?: BookSummary[]) => {
      if (book) {
        playMusicTrack(
          book,
          contextBooks && contextBooks.length > 0 ? contextBooks : undefined,
        );
      }
      switchWorkspaceMode('music');
    },
    [playMusicTrack, switchWorkspaceMode],
  );

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
      if (!append) {
        const nextMap = new Map<number, number>();
        for (const item of beatmapsets) {
          nextMap.set(item.id, meta.upstreamOffset);
        }
        batchOffsetsRef.current = nextMap;
        setHeadUpstreamOffset(f.offset ?? 0);
        setRestoredContextInfo(null);
      } else {
        for (const item of beatmapsets) {
          if (!batchOffsetsRef.current.has(item.id)) {
            batchOffsetsRef.current.set(item.id, meta.upstreamOffset);
          }
        }
      }
      setResults((prev) => {
        if (!append) return beatmapsets;
        const existingIds = new Set(prev.map((x) => x.id));
        return [...prev, ...beatmapsets.filter((x) => !existingIds.has(x.id))];
      });
    } catch (err) {
      if (myEpoch !== searchEpochRef.current) return;
      setSearchError(err instanceof Error ? err.message : tx('搜索失败', 'Search failed'));
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
        const [cfg, net, lib, dls, fb, savedArchives] = await Promise.all([
          fetchConfig(),
          fetchNetworkStatus(false),
          fetchLibraryStatus(false),
          fetchDownloads(),
          fetchFastBatchStatus().catch(() => null),
          fetchFilterArchives().catch(() => [] as FilterArchive[]),
        ]);
        setConfig(cfg);
        syncConfigLanguage(cfg);
        let localSeenOnboarding = false;
        try {
          localSeenOnboarding = localStorage.getItem('osu4k-onboarding-completed') === 'true';
        } catch {
          localSeenOnboarding = false;
        }
        if (!cfg.onboardingCompleted && !localSeenOnboarding) {
          setOnboardingOpen(true);
        }
        setArchives(savedArchives);
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
  }, [applyTheme, applyViewMode, openManiaPreview, runSearch, syncConfigLanguage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (onboardingOpen) {
        handleSkipOnboarding();
      } else if (settingsOpen) {
        setAppearancePreview(null);
        setSettingsOpen(false);
        syncConfigLanguage(config);
      }
      else if (fastBatchOpen) setFastBatchOpen(false);
      else if (librarySyncOpen) setLibrarySyncOpen(false);
      else if (previewState) setPreviewState(null);
      else if (detailState) setDetailState(null);
      else if (downloadsOpen) setDownloadsOpen(false);
      else if (navOpen) setNavOpen(false);
      else if (gachaOpen) setGachaOpen(false);
      else if (!archiveRailCollapsed && window.innerWidth < 1536) {
        setArchiveRailCollapsed(true);
        try {
          localStorage.setItem('osu4k-archive-rail-collapsed', 'true');
        } catch {
          // Ignore storage error
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    onboardingOpen,
    handleSkipOnboarding,
    settingsOpen,
    config,
    syncConfigLanguage,
    fastBatchOpen,
    librarySyncOpen,
    previewState,
    detailState,
    downloadsOpen,
    navOpen,
    gachaOpen,
    archiveRailCollapsed,
  ]);

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
    for (const task of downloads) {
      if (
        (task.status === 'completed' || task.status === 'queued_lazer') &&
        !notifiedDoneIdsRef.current.has(task.id)
      ) {
        notifiedDoneIdsRef.current.add(task.id);
        notify(
          task.autoLoadedInGame
            ? t(`${task.title} 已导入并在游戏中加载`, `${task.title} imported & loaded in-game`)
            : t(`${task.title} 下载完成，可立即预览谱面`, `${task.title} downloaded — ready to preview`),
          {
            actionLabel: t('预览谱面', 'Preview'),
            onAction: () => openManiaPreview(task.beatmapsetId, { titleHint: task.title }),
          },
        );
        break;
      }
    }
  }, [downloads, notify, openManiaPreview, t]);

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
    const activeProxyMode = network?.proxyMode ?? config?.proxyMode ?? 'auto';
    const activePort = network?.proxyPort ?? config?.proxyPort ?? 6174;
    notify(
      activeProxyMode === 'direct'
        ? t('正在检测直连与全部镜像源延迟...', 'Checking direct connection & all mirror latencies...')
        : t(`正在检测代理 ${activePort} 与全部镜像源延迟...`, `Checking proxy :${activePort} & all mirror latencies...`),
    );
    const st = await runNetworkBenchmark();
    setNetwork(st);
    const best = st.mirrors.find((m) => m.id === st.recommendedMirror);
    notify(
      best
        ? t(
            `测速完成：最优源 ${best.shortName} (${best.latencyMs ?? '?'}ms)`,
            `Benchmark complete: Best ${best.shortName} (${best.latencyMs ?? '?'}ms)`,
          )
        : t('测速完成，请检查网络或代理设置', 'Benchmark complete — check network or proxy settings'),
    );
  };

  const handleSelectPreset = (preset: WorkflowPreset) => {
    setWorkspaceMode('browse');
    setGachaOpen(false);
    setActivePresetId(preset.id);
    setActiveArchiveId(null);
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
    setActiveArchiveId(null);
    setFilters(next);
    if (autoSearch) {
      void runSearch(next, false);
    }
  };

  const handleResetFilters = () => {
    setActivePresetId(null);
    setActiveArchiveId(null);
    setFilters(DEFAULT_FILTERS);
    void runSearch(DEFAULT_FILTERS, false);
  };

  const findGridListAnchor = useCallback((): {
    set: NormalizedBeatmapset;
    index: number;
    scrollTop: number;
  } | null => {
    if (results.length === 0) return null;
    const root = mainScrollRef.current;
    if (!root || root.scrollTop < 40) {
      return { set: results[0], index: 0, scrollTop: root?.scrollTop ?? 0 };
    }
    const rootRect = root.getBoundingClientRect();
    const focusY = rootRect.top + 88;
    const nodes = root.querySelectorAll<HTMLElement>('[data-set-id]');
    let bestId: number | null = null;
    let bestDist = Infinity;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.bottom < rootRect.top + 28) continue;
      const dist = Math.abs(r.top - focusY);
      if (dist < bestDist) {
        const parsedId = Number(el.dataset.setId);
        if (Number.isFinite(parsedId) && parsedId > 0) {
          bestDist = dist;
          bestId = parsedId;
        }
      }
    }
    if (bestId !== null) {
      const idx = results.findIndex((s) => s.id === bestId);
      if (idx >= 0) {
        return { set: results[idx], index: idx, scrollTop: root.scrollTop };
      }
    }
    return { set: results[0], index: 0, scrollTop: root.scrollTop };
  }, [results]);

  useEffect(() => {
    if (viewMode === 'lazer' || results.length === 0) {
      setGridListVisibleAnchorId(null);
      return;
    }
    const root = mainScrollRef.current;
    if (!root) return;
    let timer: number | null = null;
    const syncAnchor = () => {
      const anchor = findGridListAnchor();
      setGridListVisibleAnchorId(anchor ? anchor.set.id : null);
    };
    syncAnchor();
    const onScroll = () => {
      if (archiveRailCollapsed) return;
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        syncAnchor();
      }, 120);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [viewMode, results, archiveRailCollapsed, findGridListAnchor]);

  const currentBrowsePreview = useMemo<CurrentBrowsePreview | null>(() => {
    if (results.length === 0) return null;
    let anchor: NormalizedBeatmapset | undefined;
    if (viewMode === 'lazer') {
      anchor = (activeLazerSet && results.find((r) => r.id === activeLazerSet.id)) ?? results[0];
    } else {
      anchor =
        (gridListVisibleAnchorId !== null
          ? results.find((r) => r.id === gridListVisibleAnchorId)
          : undefined) ?? results[0];
    }
    if (!anchor) return null;
    const index = Math.max(0, results.findIndex((r) => r.id === anchor!.id));
    return {
      id: anchor.id,
      title: anchor.title,
      artist: anchor.artist,
      coverUrl: anchor.coverUrl,
      index,
      totalLoaded: results.length,
      viewMode,
    };
  }, [results, viewMode, activeLazerSet, gridListVisibleAnchorId]);

  const captureCurrentBrowsePosition = useCallback((): FilterArchiveBrowsePosition | null => {
    if (results.length === 0) return null;
    let anchorSet: NormalizedBeatmapset | undefined;
    let anchorIndex = 0;
    let scrollTop = 0;
    let anchorBeatmapId: number | null = null;

    if (viewMode === 'lazer') {
      anchorSet = (activeLazerSet && results.find((r) => r.id === activeLazerSet.id)) ?? results[0];
      anchorIndex = Math.max(0, results.findIndex((r) => r.id === anchorSet!.id));
      scrollTop = lazerScrollTopRef.current;
      anchorBeatmapId = activeLazerDiffId;
    } else {
      const found = findGridListAnchor();
      anchorSet = found?.set ?? results[0];
      anchorIndex = found?.index ?? 0;
      scrollTop = found?.scrollTop ?? 0;
    }

    if (!anchorSet) return null;

    const contextBeatmapsetIds: number[] = [];
    for (const offset of [1, -1, 2, -2, 3, -3, 4, -4]) {
      const neighbor = results[anchorIndex + offset];
      if (neighbor && neighbor.id !== anchorSet.id && !contextBeatmapsetIds.includes(neighbor.id)) {
        contextBeatmapsetIds.push(neighbor.id);
      }
    }

    const snapStart = Math.max(0, anchorIndex - 5);
    const snapEnd = Math.min(results.length, anchorIndex + 6);
    const contextSnapshot = results.slice(snapStart, snapEnd);
    const batchUpstreamOffset =
      batchOffsetsRef.current.get(anchorSet.id) ?? Math.max(0, Math.floor(anchorIndex / 24) * 24);

    return {
      anchorBeatmapsetId: anchorSet.id,
      anchorBeatmapId,
      anchorTitle: anchorSet.title,
      anchorArtist: anchorSet.artist,
      anchorCreator: anchorSet.creator,
      anchorCoverUrl: anchorSet.coverUrl,
      anchorIndex,
      loadedCount: results.length,
      batchUpstreamOffset,
      nextUpstreamOffset: searchMeta?.nextUpstreamOffset ?? results.length,
      provider: searchMeta?.provider,
      viewMode,
      scrollTop,
      contextBeatmapsetIds,
      contextSnapshot,
    };
  }, [results, viewMode, activeLazerSet, activeLazerDiffId, findGridListAnchor, searchMeta]);

  const scrollToGridListTarget = useCallback((targetId: number) => {
    setHighlightedSetId(targetId);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedSetId((prev) => (prev === targetId ? null : prev));
    }, 2500);

    const locate = (behavior: ScrollBehavior) => {
      const root = mainScrollRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(`[data-set-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior, block: 'center' });
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        locate('smooth');
      });
    });
    window.setTimeout(() => {
      locate('smooth');
    }, 150);
  }, []);

  const handleSaveNewArchive = useCallback(
    async ({ name, savePosition }: { name: string; savePosition: boolean }) => {
      const browsePosition = savePosition ? captureCurrentBrowsePosition() : null;
      const created = await createFilterArchive({
        name,
        filters: sanitizeFiltersForArchive(filters),
        browsePosition,
      });
      setArchives((prev) => {
        const next = [created, ...prev];
        return next.sort((a, b) => {
          const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          return pinDiff !== 0 ? pinDiff : b.createdAt - a.createdAt;
        });
      });
      setActiveArchiveId(created.id);
      notify(
        browsePosition
          ? t(
              `已保存存档「${created.name}」（含定位：${browsePosition.anchorTitle}）`,
              `Saved archive "${created.name}" (at ${browsePosition.anchorTitle})`,
            )
          : t(`已保存存档「${created.name}」`, `Saved archive "${created.name}"`),
      );
    },
    [filters, captureCurrentBrowsePosition, notify, t],
  );

  const handleOverwriteArchive = useCallback(
    async (archive: FilterArchive, savePosition: boolean) => {
      const browsePosition = savePosition ? captureCurrentBrowsePosition() : null;
      const updated = await updateFilterArchive(archive.id, {
        filters: sanitizeFiltersForArchive(filters),
        browsePosition,
      });
      setArchives((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setActiveArchiveId(updated.id);
      notify(t(`已覆盖更新存档「${updated.name}」`, `Updated archive "${updated.name}"`));
    },
    [filters, captureCurrentBrowsePosition, notify, t],
  );

  const handleRenameArchive = useCallback(
    async (id: string, name: string) => {
      const updated = await updateFilterArchive(id, { name });
      setArchives((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      notify(t(`已重命名存档为「${updated.name}」`, `Renamed archive to "${updated.name}"`));
    },
    [notify, t],
  );

  const handleTogglePinArchive = useCallback(async (archive: FilterArchive) => {
    const updated = await updateFilterArchive(archive.id, { pinned: !archive.pinned });
    setArchives((prev) =>
      prev
        .map((a) => (a.id === updated.id ? updated : a))
        .sort((a, b) => {
          const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          return pinDiff !== 0 ? pinDiff : b.createdAt - a.createdAt;
        }),
    );
  }, []);

  const handleDeleteArchive = useCallback(
    async (id: string) => {
      await deleteFilterArchive(id);
      setArchives((prev) => prev.filter((a) => a.id !== id));
      setActiveArchiveId((prev) => (prev === id ? null : prev));
      notify(t('已删除 Filter 存档', 'Filter archive deleted'));
    },
    [notify, t],
  );

  const handleRestoreFilterArchive = useCallback(
    async (archive: FilterArchive, options?: { ignorePosition?: boolean }) => {
      const nextFilters: SearchFilters = {
        ...DEFAULT_FILTERS,
        ...archive.filters,
        offset: 0,
      };
      setActivePresetId(null);
      setActiveArchiveId(archive.id);
      setFilters(nextFilters);
      setRestoredContextInfo(null);

      const pos = !options?.ignorePosition ? archive.browsePosition : null;
      if (!pos) {
        setHeadUpstreamOffset(0);
        if (mainScrollRef.current && viewMode !== 'lazer') {
          mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        await runSearch(nextFilters, false);
        notify(t(`已应用存档「${archive.name}」`, `Applied archive "${archive.name}"`));
        return;
      }

      searchEpochRef.current += 1;
      const myEpoch = searchEpochRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoading(true);
      setRestoringArchiveId(archive.id);
      setSearchError(null);

      try {
        const fetchWindow = async (initialOffset: number) => {
          let cursor = Math.max(0, initialOffset);
          const acc: NormalizedBeatmapset[] = [];
          const seen = new Set<number>();
          const offsetsMap = new Map<number, number>();
          let lastRes: SearchResult | null = null;
          let anchorFoundIdx = -1;

          for (let round = 0; round < 4; round++) {
            const res = await searchBeatmapsets({ ...nextFilters, offset: cursor });
            if (myEpoch !== searchEpochRef.current) return null;
            lastRes = res;
            for (const item of res.beatmapsets) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                offsetsMap.set(item.id, res.upstreamOffset);
                acc.push(item);
              }
            }
            anchorFoundIdx = acc.findIndex((s) => s.id === pos.anchorBeatmapsetId);
            if (anchorFoundIdx >= 0) {
              if (anchorFoundIdx <= acc.length - 3 || !res.hasMore) {
                break;
              }
            }
            if (!res.hasMore || res.nextUpstreamOffset <= cursor) {
              break;
            }
            cursor = res.nextUpstreamOffset;
          }

          return {
            acc,
            offsetsMap,
            lastRes,
            anchorFoundIdx,
            startOffset: Math.max(0, initialOffset),
          };
        };

        const plannedStart =
          pos.batchUpstreamOffset <= 48 ? 0 : Math.max(0, pos.batchUpstreamOffset - 24);
        let windowData = await fetchWindow(plannedStart);
        if (!windowData || myEpoch !== searchEpochRef.current) return;

        if (plannedStart > 0 && windowData.acc.length === 0) {
          windowData = await fetchWindow(0);
          if (!windowData || myEpoch !== searchEpochRef.current) return;
        }

        const { acc, offsetsMap, lastRes, anchorFoundIdx, startOffset } = windowData;
        if (lastRes) {
          const { beatmapsets: _ignored, ...meta } = lastRes;
          setSearchMeta(meta);
        } else {
          setSearchMeta(null);
        }
        batchOffsetsRef.current = offsetsMap;
        setResults(acc);
        setHeadUpstreamOffset(startOffset);

        const savedAnchorSnap = pos.contextSnapshot?.find(
          (s) => s.id === pos.anchorBeatmapsetId,
        );

        if (startOffset > 0) {
          setRestoredContextInfo({
            archiveName: archive.name,
            anchorTitle: pos.anchorTitle,
            anchorBeatmapsetId: pos.anchorBeatmapsetId,
            headUpstreamOffset: startOffset,
            savedAnchorSet: savedAnchorSnap,
          });
        }

        if (acc.length === 0) {
          notify(
            t(
              `存档「${archive.name}」已恢复筛选，但当前无匹配结果`,
              `Restored filters for "${archive.name}", but no results matched`,
            ),
          );
          return;
        }

        let targetId: number | null = null;
        let hitKind: 'exact' | 'neighbor' | 'fallback' = 'fallback';

        if (anchorFoundIdx >= 0) {
          targetId = pos.anchorBeatmapsetId;
          hitKind = 'exact';
        } else {
          for (const neighborId of pos.contextBeatmapsetIds) {
            if (acc.some((s) => s.id === neighborId)) {
              targetId = neighborId;
              hitKind = 'neighbor';
              break;
            }
          }
          if (targetId === null) {
            const fallbackIdx = Math.min(acc.length - 1, Math.floor(acc.length / 2));
            targetId = acc[fallbackIdx].id;
          }
        }

        if (viewMode === 'lazer') {
          setLazerRestoreTarget({
            beatmapsetId: targetId,
            beatmapId: hitKind === 'exact' ? pos.anchorBeatmapId ?? null : null,
            nonce: Date.now(),
          });
        } else {
          scrollToGridListTarget(targetId);
        }

        const openSavedAnchorDetail = () => {
          if (savedAnchorSnap) {
            openDetail(savedAnchorSnap, { diffId: pos.anchorBeatmapId ?? undefined });
          } else {
            void fetchBeatmapsetDetail(pos.anchorBeatmapsetId)
              .then((detail) => openDetail(detail, { diffId: pos.anchorBeatmapId ?? undefined }))
              .catch(() => notify(t('未能加载原谱面详情', 'Failed to load original beatmap details')));
          }
        };

        if (hitKind === 'exact') {
          notify(t(`已定位至「${pos.anchorTitle}」`, `Located "${pos.anchorTitle}"`));
        } else if (hitKind === 'neighbor') {
          notify(
            t(
              `原曲「${pos.anchorTitle}」排序已变动，已定位到相邻上下文`,
              `"${pos.anchorTitle}" shifted in results; positioned at nearby context`,
            ),
            {
              actionLabel: t('查看原谱面', 'View Original'),
              onAction: openSavedAnchorDetail,
            },
          );
        } else {
          notify(
            t(
              `未在当前窗口找到「${pos.anchorTitle}」，已恢复筛选与附近页面`,
              `"${pos.anchorTitle}" not in window; restored nearby page`,
            ),
            {
              actionLabel: t('查看原谱面', 'View Original'),
              onAction: openSavedAnchorDetail,
            },
          );
        }
      } catch (err) {
        if (myEpoch === searchEpochRef.current) {
          setSearchError(err instanceof Error ? err.message : t('恢复存档失败', 'Failed to restore archive'));
        }
      } finally {
        if (myEpoch === searchEpochRef.current) {
          setLoading(false);
          setRestoringArchiveId(null);
        }
      }
    },
    [viewMode, runSearch, notify, scrollToGridListTarget, openDetail, t],
  );

  const handleLoadEarlierResults = useCallback(async () => {
    if (loading || loadingMoreRef.current || loadingEarlier || headUpstreamOffset <= 0) return;
    const prevOffset = Math.max(0, headUpstreamOffset - 24);
    const reqLimit = headUpstreamOffset - prevOffset;
    const myEpoch = searchEpochRef.current;
    setLoadingEarlier(true);
    try {
      const res = await searchBeatmapsets({
        ...filters,
        offset: prevOffset,
        limit: Math.max(12, reqLimit),
      });
      if (myEpoch !== searchEpochRef.current) return;
      setResults((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const prepended = res.beatmapsets.filter((x) => !existingIds.has(x.id));
        for (const item of prepended) {
          batchOffsetsRef.current.set(item.id, res.upstreamOffset);
        }
        return [...prepended, ...prev];
      });
      setHeadUpstreamOffset(prevOffset);
      setRestoredContextInfo((prev) =>
        prev ? { ...prev, headUpstreamOffset: prevOffset } : null,
      );
      if (prevOffset === 0) {
        notify(t('已向上加载至第 1 页', 'Loaded back to page 1'));
      }
    } catch (err) {
      if (myEpoch === searchEpochRef.current) {
        notify(err instanceof Error ? err.message : t('向上加载更早谱面失败', 'Failed to load earlier beatmaps'));
      }
    } finally {
      if (myEpoch === searchEpochRef.current) {
        setLoadingEarlier(false);
      }
    }
  }, [loading, loadingEarlier, headUpstreamOffset, filters, notify, t]);

  const handleTogglePlay = useCallback(
    (set: NormalizedBeatmapset) => {
      if (playingSet?.id === set.id) {
        const next = !isPlayingRef.current;
        if (next) pauseMusic();
        setIsPlaying(next);
      } else {
        pauseMusic();
        setPlayingSet(set);
        setIsPlaying(true);
      }
    },
    [playingSet?.id, pauseMusic],
  );

  const handleStartPlay = useCallback(
    (set: NormalizedBeatmapset) => {
      pauseMusic();
      setPlayingSet(set);
      setIsPlaying(true);
    },
    [pauseMusic],
  );

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
        chosenTarget === 'lazer'
          ? 'Lazer'
          : chosenTarget === 'stable'
            ? 'Stable'
            : t('双端', 'Both');
      notify(t(`已加入下载队列 (${label}): ${set.title}`, `Queued download (${label}): ${set.title}`));
    },
    [variant, config?.preferredDownloadSource, notify, t],
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
    notify(
      t(
        `已批量加入 ${picked.length} 首谱面到下载队列`,
        `Queued ${picked.length} beatmapsets for download`,
      ),
    );
    setSelectedIds(new Set());
    setBatchMode(false);
    setDownloadsOpen(true);
  };

  const handleGachaBatchDownload = useCallback(
    async (picked: NormalizedBeatmapset[]) => {
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
    },
    [target, variant, config?.preferredDownloadSource],
  );

  const handleImportAllLazer = async () => {
    const res = await importLazerPending();
    notify(res.message);
    setLibrary(await fetchLibraryStatus(true));
  };

  const handleClearLazerPending = async () => {
    const res = await clearLazerPending();
    notify(
      t(
        `已清理 ${res.deletedCount} 个待导入 .osz 文件`,
        `Cleared ${res.deletedCount} pending .osz files`,
      ),
    );
    setLibrary(await fetchLibraryStatus(false));
  };

  const handleSaveConfig = async (patch: Partial<AppConfig>) => {
    const prevHotkey = config?.overlayHotkey;
    const updated = await updateConfig(patch);
    setConfig(updated);
    syncConfigLanguage(updated);
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
        notify(hkRes.error || t('热键注册失败', 'Failed to register hotkey'));
      } else {
        notify(
          t(
            `设置已保存，浮窗热键已更新为 ${patch.overlayHotkey}`,
            `Settings saved; overlay hotkey updated to ${patch.overlayHotkey}`,
          ),
        );
      }
    } else {
      notify(
        t(
          '设置已保存，正在刷新网络与本地曲库...',
          'Settings saved; refreshing network & local library...',
        ),
      );
    }
    const [net, lib] = await Promise.all([runNetworkBenchmark(), fetchLibraryStatus(true)]);
    setNetwork(net);
    setLibrary(lib);
  };
  handleSaveConfigRef.current = handleSaveConfig;

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
      notify(err instanceof Error ? err.message : t('发送加载请求失败', 'Failed to send load request'));
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
            actionLabel: t('打开设置', 'Settings'),
            onAction: () => setSettingsOpen(true),
          });
        } else if (
          client === 'lazer' &&
          !res.alreadyRunning &&
          (library?.lazerPendingCount ?? 0) > 0
        ) {
          notify(res.message, {
            actionLabel: t(
              `导入 ${library?.lazerPendingCount} 个待导入`,
              `Import ${library?.lazerPendingCount} pending`,
            ),
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
        notify(err instanceof Error ? err.message : t('启动游戏失败', 'Failed to launch game'));
      } finally {
        setLaunchingClient(null);
      }
    },
    [launchingClient, library?.lazerPendingCount, notify, t],
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
        configProxyPort={config?.proxyPort}
        configProxyMode={config?.proxyMode}
        theme={theme}
        overlayOpen={overlayOpen}
        overlayHotkey={config?.overlayHotkey}
        sidebarCollapsed={sidebarCollapsed}
        archiveRailCollapsed={archiveRailCollapsed}
        archiveCount={archives.length}
        activeAccentHex={activeAccentHex}
        onToggleOverlay={() => void handleToggleOverlay()}
        onChangeTheme={(nextTheme) => applyTheme(nextTheme, true)}
        onBenchmark={handleBenchmark}
        onToggleNav={() => setNavOpen((v) => !v)}
        onToggleSidebar={toggleSidebarCollapsed}
        onToggleArchiveRail={toggleArchiveRailCollapsed}
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
              workspaceMode={workspaceMode}
              target={target}
              variant={variant}
              activePresetId={activePresetId}
              library={library}
              downloads={downloads}
              fastBatch={fastBatch}
              launchingClient={launchingClient}
              musicPlaying={musicIsPlaying}
              onChangeWorkspaceMode={switchWorkspaceMode}
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

        {/* Main Workspace */}
        <main
          ref={mainScrollRef}
          className={
            workspaceMode === 'book' || workspaceMode === 'music' || gachaOpen
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0'
              : viewMode === 'lazer'
                ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3.5 pt-3 pb-3 sm:px-5 sm:pt-3.5 sm:pb-3.5'
                : `min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4 sm:px-5 ${
                    playingSet || musicCurrentTrack ? 'pb-28' : 'pb-8'
                  }`
          }
        >
          {workspaceMode === 'book' ? (
            <BookArchiveMode
              theme={theme}
              library={library}
              musicPlaying={musicIsPlaying}
              onOpenMusicPlayer={handleOpenBookInMusicPlayer}
              onPauseBackgroundMusic={pauseMusic}
              onPreviewBeatmap={(setId, diffId, title) =>
                openManiaPreview(setId, { beatmapId: diffId ?? null, titleHint: title })
              }
              onLoadIntoGame={(setId) => void handleLoadIntoGame(setId)}
              onNotify={notify}
            />
          ) : workspaceMode === 'music' ? (
            <MusicPlayerMode
              theme={theme}
              canLoadIntoGame={Boolean(library?.lazerRunning || library?.stableRunning)}
              onPreviewBeatmap={(setId, diffId, title) =>
                openManiaPreview(setId, { beatmapId: diffId ?? null, titleHint: title })
              }
              onLoadIntoGame={(setId) => void handleLoadIntoGame(setId)}
              onOpenFolder={(subFolder) => {
                void openStableSongFolder(subFolder).catch((err) =>
                  notify(err instanceof Error ? err.message : t('打开本地文件夹失败', 'Failed to open local folder')),
                );
              }}
              onNotify={notify}
            />
          ) : gachaOpen ? (
            <GachaStudio
              filters={filters}
              filterArchives={archives}
              target={target}
              config={config}
              theme={theme}
              activeTaskBySet={activeTaskBySet}
              onDownload={(s, chosenTarget) => void handleDownload(s, chosenTarget)}
              onBatchDownload={(sets) => void handleGachaBatchDownload(sets)}
              onOpenDetail={(s, diffId) => openDetail(s, { diffId: diffId ?? undefined })}
              onNotify={notify}
              onClose={() => setGachaOpen(false)}
            />
          ) : (
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
              onOpenSaveArchive={openSaveArchiveRail}
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
                  {lang === 'en' ? (
                    <>
                      Showing <strong className="font-stat font-bold text-ink">{results.length}</strong> beatmapsets
                    </>
                  ) : (
                    <>
                      当前显示 <strong className="font-stat font-bold text-ink">{results.length}</strong> 套谱面
                    </>
                  )}
                </span>
                {searchMeta && (
                  <span className="chip">
                    {t('搜索源', 'Source')}:{' '}
                    {searchMeta.provider === 'osudirect'
                      ? 'osu.direct'
                      : t('小夜镜像 (Sayobot)', 'Sayobot Mirror')}
                  </span>
                )}
                {searchMeta?.fallbackUsed && searchMeta.fallbackReason && (
                  <span className="chip border-amber-500/40 bg-amber-500/12 text-warn">
                    <AlertTriangle className="h-3 w-3" />
                    {searchMeta.fallbackReason}
                  </span>
                )}
                {searchError && (
                  <span className="text-bad">
                    {t('错误', 'Error')}: {searchError}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* 3-mode Song View Switcher (Grid / List / Lazer) */}
                <div
                  role="group"
                  aria-label={t('谱面呈现形式', 'Beatmap view mode')}
                  className="inline-flex min-h-[30px] items-center gap-0.5 rounded-[9px] border border-hairline bg-surface-1 p-0.5"
                >
                  {viewModeOptions.map((opt) => {
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
                  onClick={openGachaStudio}
                  title={t(
                    '随机抽取本地未安装谱面（约会划卡 / 猜星数 / 炉石开卡包）',
                    'Random Card Draw for non-local maps (Dating Swipe / Guess SR / Pack Opening)',
                  )}
                  className="btn btn-sm border-amber-500/45 bg-amber-500/12 text-amber-500 hover:border-amber-500/70 hover:bg-amber-500/20"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t('随机抽卡', 'Card Draw')}</span>
                </button>

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
                      ? t(
                          `快速批量 ${fastBatch.completedCount}/${fastBatch.targetCount}`,
                          `Fast Batch ${fastBatch.completedCount}/${fastBatch.targetCount}`,
                        )
                      : t('快速批量下载', 'Fast Batch')}
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
                  <span>{batchMode ? t('退出批量', 'Exit Batch') : t('批量选择', 'Batch Select')}</span>
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
                      <span>
                        {selectedIds.size === results.length && results.length > 0
                          ? t('取消全选', 'Deselect All')
                          : t('全选本页', 'Select Page')}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => void handleBatchDownload()}
                      className="btn btn-sm btn-primary font-stat"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{t(`下载已选 (${selectedIds.size})`, `Download (${selectedIds.size})`)}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Restored Deep-Page Context Bar */}
            {restoredContextInfo && headUpstreamOffset > 0 && !loading && (
              <div className="panel-flat flex shrink-0 flex-wrap items-center justify-between gap-2 border-lazer/35 bg-lazer/10 px-3 py-1.5 text-[0.75rem]">
                <div className="flex min-w-0 items-center gap-2 text-ink-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-lazer-soft" />
                  <span className="truncate">
                    {lang === 'en' ? (
                      <>
                        Jumped to archive <strong className="text-ink">"{restoredContextInfo.archiveName}"</strong>{' '}
                        around rank <span className="font-mono font-bold text-lazer-soft">#{headUpstreamOffset}+</span>
                      </>
                    ) : (
                      <>
                        已跳转至存档 <strong className="text-ink">「{restoredContextInfo.archiveName}」</strong>{' '}
                        第 <span className="font-mono font-bold text-lazer-soft">{headUpstreamOffset}+</span>{' '}
                        位附近上下文
                      </>
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={loadingEarlier}
                    onClick={() => void handleLoadEarlierResults()}
                    className="btn btn-sm min-h-[24px] border-lazer/45 bg-surface-2/80 px-2.5 text-[0.71875rem] text-lazer-soft hover:bg-lazer/15"
                  >
                    {loadingEarlier ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )}
                    <span>{loadingEarlier ? t('加载中…', 'Loading…') : t('向上加载更早谱面', 'Load Earlier')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRestoredContextInfo(null);
                      void runSearch({ ...filters, offset: 0 }, false);
                    }}
                    className="btn btn-sm min-h-[24px] px-2 text-[0.71875rem]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{t('回到第 1 页', 'Back to Page 1')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoredContextInfo(null)}
                    aria-label={t('关闭上下文提示', 'Close context banner')}
                    className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-tint-hover hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

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
                <p className="font-display text-[0.9375rem] font-semibold text-ink">
                  {t('没有找到符合当前筛选条件的谱面', 'No beatmapsets match the current filters')}
                </p>
                <p className="mt-1 text-[0.8125rem] font-medium text-ink-3">
                  {t(
                    '可以放宽星数 / LN% / 状态限制，或切换至「全部状态 (Any)」搜索更多练习图',
                    'Try widening Star / LN% / Status limits, or switch to "Any Status" to find more maps.',
                  )}
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
                          highlighted={highlightedSetId === set.id}
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
                          highlighted={highlightedSetId === set.id}
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
                      hasAudioDock={Boolean(playingSet || musicCurrentTrack)}
                      hasGlobalBg={Boolean(effectiveBgUrl)}
                      filterCollapsed={filterCollapsed}
                      compactStage={!sidebarCollapsed && !archiveRailCollapsed}
                      ppScenario={activePpScenario}
                      restoreTarget={lazerRestoreTarget}
                      carouselScrollTopRef={lazerScrollTopRef}
                      onActiveBeatmapsetChange={setActiveLazerSet}
                      onActiveDiffIdChange={setActiveLazerDiffId}
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
                          <span>{t('正在自动加载更多谱面…', 'Loading more beatmapsets…')}</span>
                        </div>
                      ) : searchError && searchMeta?.hasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          className="btn min-h-[36px] border-amber-500/45 px-5 text-[0.8125rem] text-warn"
                        >
                          <ChevronDown className="h-4 w-4" />
                          <span>{t('加载失败，点击重试加载更多', 'Load failed — click to retry')}</span>
                        </button>
                      ) : searchMeta?.hasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          className="btn min-h-[36px] px-6 text-[0.84375rem]"
                        >
                          <ChevronDown className="h-4 w-4 text-osu" />
                          <span>{t('加载更多谱面', 'Load More')}</span>
                        </button>
                      ) : (
                        results.length > 0 && (
                          <span className="text-[0.75rem] font-medium text-ink-3">
                            {t(`已显示全部 ${results.length} 套搜索结果`, `Showing all ${results.length} beatmapsets`)}
                          </span>
                        )
                      )}
                    </div>
                  </>
                )}
              </>
            )}
            </div>
          )}
        </main>

        {/* Desktop Collapsible Right Filter Archive Rail (2xl+ docked; collapsed by default) */}
        <aside
          className={`hidden shrink-0 overflow-hidden bg-surface-0/82 backdrop-blur-xl transition-[width,opacity] duration-250 ease-out 2xl:block ${
            archiveRailCollapsed
              ? 'pointer-events-none w-0 border-l-0 opacity-0'
              : 'w-[var(--right-sidebar-w)] border-l border-hairline opacity-100'
          }`}
        >
          <div className="h-full w-[var(--right-sidebar-w)]">
            <FilterArchiveRail
              archives={archives}
              activeArchiveId={activeArchiveId}
              restoringArchiveId={restoringArchiveId}
              currentFilters={filters}
              currentBrowsePreview={currentBrowsePreview}
              saveInputFocusNonce={saveInputFocusNonce}
              onSaveNew={handleSaveNewArchive}
              onRestore={(arch, opts) => void handleRestoreFilterArchive(arch, opts)}
              onOverwrite={handleOverwriteArchive}
              onRename={handleRenameArchive}
              onTogglePin={handleTogglePinArchive}
              onDelete={handleDeleteArchive}
              onClose={toggleArchiveRailCollapsed}
            />
          </div>
        </aside>
      </div>

      {/* Narrow Viewport Left Navigation Drawer (Root z-50 above TitleBar) */}
      {navOpen && (
        <div className="modal-backdrop flex lg:hidden" onClick={() => setNavOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('左侧导航栏', 'Left navigation rail')}
            className="animate-rail-in h-full w-[var(--sidebar-w)] border-r border-hairline-strong bg-surface-0 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SideRail
              workspaceMode={workspaceMode}
              target={target}
              variant={variant}
              activePresetId={activePresetId}
              library={library}
              downloads={downloads}
              fastBatch={fastBatch}
              launchingClient={launchingClient}
              musicPlaying={musicIsPlaying}
              onChangeWorkspaceMode={switchWorkspaceMode}
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

      {/* Narrow Viewport Right Filter Archive Drawer (<2xl, Root z-50 above TitleBar) */}
      {!archiveRailCollapsed && (
        <div
          className="modal-backdrop flex justify-end 2xl:hidden"
          onClick={toggleArchiveRailCollapsed}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('Filter 存档右侧栏', 'Filter archive sidebar')}
            className="animate-drawer-in h-full w-[min(92vw,336px)] border-l border-hairline-strong bg-surface-0 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <FilterArchiveRail
              archives={archives}
              activeArchiveId={activeArchiveId}
              restoringArchiveId={restoringArchiveId}
              currentFilters={filters}
              currentBrowsePreview={currentBrowsePreview}
              saveInputFocusNonce={saveInputFocusNonce}
              onSaveNew={handleSaveNewArchive}
              onRestore={(arch, opts) => {
                toggleArchiveRailCollapsed();
                void handleRestoreFilterArchive(arch, opts);
              }}
              onOverwrite={handleOverwriteArchive}
              onRename={handleRenameArchive}
              onTogglePin={handleTogglePinArchive}
              onDelete={handleDeleteArchive}
              onClose={toggleArchiveRailCollapsed}
            />
          </aside>
        </div>
      )}

      {/* Floating Back-to-Top in Grid / List Views */}
      {workspaceMode === 'browse' && viewMode !== 'lazer' && showBackToTop && results.length > 0 && (
        <div
          className={`pointer-events-none fixed right-5 z-30 transition-[bottom,right] duration-200 ${
            playingSet || musicCurrentTrack ? 'bottom-28 sm:bottom-[84px]' : 'bottom-5'
          } ${!archiveRailCollapsed ? '2xl:right-[calc(var(--right-sidebar-w)+20px)]' : ''}`}
        >
          <button
            type="button"
            onClick={() => mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            title={t('回到顶部', 'Back to Top')}
            aria-label={t('回到顶部', 'Back to Top')}
            className="glass animate-fade-in pointer-events-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[0.78125rem] font-semibold text-ink transition-all duration-150 hover:border-osu/60 hover:text-osu"
          >
            <ArrowUp className="h-3.5 w-3.5 text-osu" />
            <span>{t('回到顶部', 'Top')}</span>
          </button>
        </div>
      )}

      {/* Floating Audio Preview Dock */}
      {workspaceMode === 'browse' && !gachaOpen && (
        <AudioPlayerBar
          beatmapset={playingSet}
          playing={isPlaying}
          activeTarget={target}
          sidebarCollapsed={sidebarCollapsed}
          rightRailOpen={!archiveRailCollapsed}
          onTogglePlay={() => {
            const next = !isPlayingRef.current;
            if (next) pauseMusic();
            setIsPlaying(next);
          }}
          onStop={() => {
            setIsPlaying(false);
            setPlayingSet(null);
          }}
          onDownload={(s, t) => void handleDownload(s, t)}
        />
      )}

      {/* Persistent Background Music Mini Dock (shown outside Music Player Mode) */}
      {workspaceMode !== 'music' && !playingSet && (
        <MusicMiniDock
          sidebarCollapsed={sidebarCollapsed}
          rightRailOpen={!archiveRailCollapsed}
          inBookMode={workspaceMode === 'book'}
          onOpenPlayer={() => switchWorkspaceMode('music')}
        />
      )}

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
        onReplayOnboarding={() => {
          setAppearancePreview(null);
          setSettingsOpen(false);
          setOnboardingOpen(true);
        }}
        onClose={() => {
          setAppearancePreview(null);
          setSettingsOpen(false);
        }}
        onSave={handleSaveConfig}
        onBenchmark={handleBenchmark}
      />

      {/* First-Run Onboarding Setup & Walkthrough Wizard */}
      <OnboardingModal
        open={onboardingOpen}
        version={APP_VERSION}
        config={config}
        theme={theme}
        viewMode={viewMode}
        onPreviewTheme={(t) => applyTheme(t, false)}
        onPreviewAppearance={handlePreviewAppearance}
        onSkip={handleSkipOnboarding}
        onSaveAndFinish={handleSaveOnboardingConfig}
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

export function App() {
  const notifyBridgeRef = useRef<((msg: string) => void) | null>(null);
  const pausePreviewBridgeRef = useRef<(() => void) | null>(null);

  return (
    <MusicPlayerProvider
      onNotify={(msg) => notifyBridgeRef.current?.(msg)}
      onBeforeStartPlayback={() => pausePreviewBridgeRef.current?.()}
    >
      <AppWorkspace
        notifyBridgeRef={notifyBridgeRef}
        pausePreviewBridgeRef={pausePreviewBridgeRef}
      />
    </MusicPlayerProvider>
  );
}

export default App;
