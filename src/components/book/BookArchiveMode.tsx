import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUp,
  ArrowUpNarrowWide,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  LayoutGrid,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { OsuMusicMark } from '../music/OsuMusicMark';
import { fetchLocalBookDetail, fetchLocalBooks } from '../../api';
import {
  BookDetail,
  BooksLibraryResponse,
  BookSummary,
  LocalLibraryStatus,
  ThemeId,
} from '../../types';
import { isDarkTheme } from '../../constants';
import { getCurrentLang, tx, useI18n } from '../../i18n';
import { SelectField } from '../SelectField';
import { BookArchiveScene, BookOpenPhase } from './BookArchiveScene';
import { BookFilterPanel } from './BookFilterPanel';
import {
  BookFilters,
  BookSortField,
  BookSourceFilter,
  DEFAULT_BOOK_FILTERS,
  applyBookFilters,
  countActiveAdvancedFilters,
  getBookFilterTransitionLabel,
  getBookSortOptions,
} from './bookFilters';
import {
  BookMosaicHandle,
  BookMosaicView,
  MosaicGridKey,
  getMosaicGridDimensions,
} from './BookMosaicView';
import { BookSpreadOverlay } from './BookSpreadOverlay';
import {
  RhineFilterTransitionHud,
  RhineLoadingVeil,
  RhineVeilMode,
} from './RhineLoadingVeil';

export type BookDisplayMode = 'shelf' | 'mosaic';

interface BookArchiveModeProps {
  theme: ThemeId;
  library: LocalLibraryStatus | null;
  musicPlaying?: boolean;
  onOpenMusicPlayer?: (book?: BookSummary, contextBooks?: BookSummary[]) => void;
  onPauseBackgroundMusic?: () => void;
  onPreviewBeatmap?: (beatmapsetId: number, beatmapId?: number | null, title?: string) => void;
  onLoadIntoGame?: (beatmapsetId: number) => void;
  onNotify?: (msg: string) => void;
}

const TICK_SLOTS = 8;
const CALLOUT_STORAGE_KEY = 'osu_book_callout_collapsed';
const MOSAIC_GRID_OPTIONS: Array<{ id: MosaicGridKey; label: string }> = [
  { id: '3x2', label: '3×2' },
  { id: '4x2', label: '4×2' },
  { id: '4x3', label: '4×3' },
  { id: '5x3', label: '5×3' },
];

function formatBookNo(idx: number): string {
  return String(Math.max(1, idx + 1)).padStart(3, '0');
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function BookArchiveMode({
  theme,
  library,
  musicPlaying = false,
  onOpenMusicPlayer,
  onPauseBackgroundMusic,
  onPreviewBeatmap,
  onLoadIntoGame,
  onNotify,
}: BookArchiveModeProps) {
  const { lang, isEn, t } = useI18n();
  const isDark = isDarkTheme(theme);
  const prefersReduced =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const [data, setData] = useState<BooksLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneBooted, setSceneBooted] = useState(false);

  const [displayMode, setDisplayMode] = useState<BookDisplayMode>('shelf');
  const [mosaicGridKey, setMosaicGridKey] = useState<MosaicGridKey>('4x3');
  const [mosaicPage, setMosaicPage] = useState(0);
  const [mosaicHoveredBook, setMosaicHoveredBook] = useState<BookSummary | null>(null);
  const [mosaicHoveredIndex, setMosaicHoveredIndex] = useState(-1);

  const [filters, setFilters] = useState<BookFilters>(DEFAULT_BOOK_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [waveTrigger, setWaveTrigger] = useState(0);

  const [focusedBook, setFocusedBook] = useState<BookSummary | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hoveredBook, setHoveredBook] = useState<BookSummary | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [cameraMoved, setCameraMoved] = useState(false);

  const [calloutCollapsed, setCalloutCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CALLOUT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [veil, setVeil] = useState<{
    visible: boolean;
    mode: RhineVeilMode;
    progress: number;
    statusText: string;
    detailText: string;
  }>({
    visible: true,
    mode: 'enter',
    progress: 14,
    statusText: tx(
      '正在初始化三维档案架与本地曲库索引...',
      'Initializing 3D archive shelf & local library index...',
      lang,
    ),
    detailText: 'MOUNTING WEBGL VIEWPORT // THREE.JS',
  });

  const [filterBanner, setFilterBanner] = useState<{
    active: boolean;
    label: string;
    countText?: string;
  }>({ active: false, label: '' });

  const [openPhase, setOpenPhase] = useState<BookOpenPhase>('idle');
  const [activeOpenBook, setActiveOpenBook] = useState<BookSummary | null>(null);
  const [activeOpenIndex, setActiveOpenIndex] = useState(0);
  const [activeDetail, setActiveDetail] = useState<BookDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BookArchiveScene | null>(null);
  const mosaicRef = useRef<BookMosaicHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);
  const detailCacheRef = useRef<Map<string, BookDetail>>(new Map());
  const mosaicClosingTimerRef = useRef<number | null>(null);

  const mountedRef = useRef(true);
  const mountTimeRef = useRef(performance.now());
  const initDoneRef = useRef(false);
  const veilSeqRef = useRef(0);
  const filterSeqRef = useRef(0);
  const lastWaveTriggerRef = useRef(0);
  const latestIsDarkRef = useRef(isDark);
  latestIsDarkRef.current = isDark;
  const prevThemeRef = useRef<ThemeId>(theme);
  const prevIsDarkRef = useRef<boolean>(isDark);
  const focusedBookKeyRef = useRef<string | null>(null);
  focusedBookKeyRef.current = focusedBook?.bookKey ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      veilSeqRef.current += 1;
      filterSeqRef.current += 1;
      if (mosaicClosingTimerRef.current !== null) {
        window.clearTimeout(mosaicClosingTimerRef.current);
      }
    };
  }, []);

  const toggleCallout = useCallback(() => {
    setCalloutCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CALLOUT_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const updateFilters = useCallback((patch: Partial<BookFilters>, commitWave = false) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setMosaicPage(0);
    if (commitWave) {
      setWaveTrigger((t) => t + 1);
    }
  }, []);

  const resetAllFilters = useCallback(() => {
    setFilters(DEFAULT_BOOK_FILTERS);
    setMosaicPage(0);
    setWaveTrigger((t) => t + 1);
  }, []);

  const loadBooks = useCallback(async (forceRefresh = false) => {
    const seq = forceRefresh ? ++veilSeqRef.current : veilSeqRef.current;
    const curLang = getCurrentLang();

    if (forceRefresh) {
      setRefreshing(true);
      setVeil({
        visible: true,
        mode: 'refresh',
        progress: 20,
        statusText: tx(
          '正在重新扫描 osu!stable 与 osu!lazer 本地数据库...',
          'Rescanning osu!stable & osu!lazer local databases...',
          curLang,
        ),
        detailText: 'SYNCING REALM & OSU!.DB // SCORES',
      });
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetchLocalBooks(forceRefresh);
      if (!mountedRef.current) return;
      if (forceRefresh) detailCacheRef.current.clear();
      setData(res);

      if (forceRefresh) {
        if (seq === veilSeqRef.current) {
          setVeil((prev) => ({
            ...prev,
            progress: 72,
            statusText: tx(
              `已重新索引 ${res.stats.totalBooks} 本曲目，正在刷新书脊...`,
              `Re-indexed ${res.stats.totalBooks} books, refreshing spines...`,
              curLang,
            ),
            detailText: `${res.stats.totalPlays.toLocaleString()} PLAYS INDEXED`,
          }));
        }
        await nextAnimationFrame();
        await nextAnimationFrame();
        await sceneRef.current?.waitForInitialReady(500);
        if (!mountedRef.current || seq !== veilSeqRef.current) return;
        setVeil((prev) => ({ ...prev, progress: 100 }));
        await new Promise((r) => window.setTimeout(r, 110));
        if (mountedRef.current && seq === veilSeqRef.current) {
          setVeil((prev) => ({ ...prev, visible: false }));
        }
      } else {
        setVeil((prev) => ({
          ...prev,
          progress: Math.max(prev.progress, 66),
          statusText: tx(
            `已加载 ${res.stats.totalBooks} 本本地曲目，正在生成模糊书脊...`,
            `Loaded ${res.stats.totalBooks} local books, building shelf spines...`,
            curLang,
          ),
          detailText: `${res.stats.totalPlays.toLocaleString()} PLAY RECORDS`,
        }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : tx('读取本地曲库失败', 'Failed to load local library', curLang),
      );
      setVeil((prev) => ({ ...prev, visible: false }));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadBooks(false);
  }, [loadBooks]);

  const filteredBooks = useMemo(() => {
    if (!data?.books) return [];
    return applyBookFilters(data.books, filters);
  }, [data, filters]);

  const advancedFilterCount = useMemo(
    () => countActiveAdvancedFilters(filters),
    [filters],
  );

  const mosaicGridDims = useMemo(
    () => getMosaicGridDimensions(mosaicGridKey, filteredBooks.length),
    [mosaicGridKey, filteredBooks.length],
  );
  const mosaicPerPage = Math.max(1, mosaicGridDims.cols * mosaicGridDims.rows);
  const mosaicTotalPages =
    filteredBooks.length > 0 ? Math.max(1, Math.ceil(filteredBooks.length / mosaicPerPage)) : 1;

  useEffect(() => {
    if (mosaicPage >= mosaicTotalPages) {
      setMosaicPage(Math.max(0, mosaicTotalPages - 1));
    }
  }, [mosaicPage, mosaicTotalPages]);

  const fetchDetailForBook = useCallback(async (book: BookSummary) => {
    const cached = detailCacheRef.current.get(book.bookKey);
    if (cached) {
      setActiveDetail(cached);
      setLoadingDetail(false);
      return;
    }
    setActiveDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await fetchLocalBookDetail(book.bookKey);
      detailCacheRef.current.set(book.bookKey, detail);
      setActiveDetail(detail);
    } catch {
      setActiveDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Initialize Three.js BookArchiveScene ONLY while displayMode === 'shelf'
  useEffect(() => {
    if (displayMode !== 'shelf' || webglFallback) return;
    const el = canvasMountRef.current;
    if (!el) return;

    let cancelled = false;
    let rafA = 0;
    let rafB = 0;

    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        if (cancelled || !mountedRef.current || !canvasMountRef.current) return;

        const scene = new BookArchiveScene(
          canvasMountRef.current,
          latestIsDarkRef.current,
          prefersReduced,
          {
            onFocusChange: (book, idx) => {
              setFocusedBook(book);
              setFocusedIndex(Math.max(0, idx));
            },
            onHoverChange: (book, idx) => {
              setHoveredBook(book);
              setHoveredIndex(idx);
            },
            onPhaseChange: (phase, book, idx) => {
              setOpenPhase(phase);
              if (phase === 'extracting' || phase === 'opening' || phase === 'open') {
                if (book) {
                  setActiveOpenBook(book);
                  setActiveOpenIndex(Math.max(0, idx));
                  void fetchDetailForBook(book);
                }
              } else if (phase === 'idle') {
                setActiveOpenBook(null);
                setActiveDetail(null);
              }
            },
            onCameraOffsetChange: (moved) => {
              setCameraMoved(moved);
            },
            onWebglUnavailable: () => {
              setWebglFallback(true);
            },
          },
        );

        sceneRef.current = scene;
        setSceneBooted(true);
        setVeil((prev) => ({
          ...prev,
          progress: Math.max(prev.progress, 38),
        }));
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setSceneBooted(false);
      setCameraMoved(false);
      setHoveredBook(null);
      setHoveredIndex(-1);
    };
  }, [displayMode, fetchDetailForBook, webglFallback, prefersReduced]);

  // Smooth loading veil choreography when changing theme inside Book Mode
  useEffect(() => {
    if (theme === prevThemeRef.current) return;
    prevThemeRef.current = theme;
    const prevDark = prevIsDarkRef.current;
    prevIsDarkRef.current = isDark;

    if (!initDoneRef.current) {
      sceneRef.current?.setDarkMode(isDark);
      return;
    }

    const seq = ++veilSeqRef.current;
    setVeil({
      visible: true,
      mode: 'theme',
      progress: 18,
      statusText:
        displayMode === 'mosaic'
          ? tx(
              '正在校准毛玻璃光学校准底色与滤镜质感...',
              'Calibrating frosted optical palette & glass filter...',
              getCurrentLang(),
            )
          : tx(
              '正在校准书脊釉面、环境光照与雾效色温...',
              'Calibrating spine glaze, ambient lighting & horizon mist...',
              getCurrentLang(),
            ),
      detailText: `OPTICAL CALIBRATION // ${isDark ? 'DARK SLATE' : 'PORCELAIN LIGHT'}`,
    });

    void (async () => {
      await nextAnimationFrame();
      await nextAnimationFrame();
      if (!mountedRef.current || seq !== veilSeqRef.current) return;

      if (displayMode === 'shelf' && !webglFallback && sceneRef.current) {
        if (isDark !== prevDark) {
          await sceneRef.current.setDarkModeAsync(isDark, (p) => {
            if (mountedRef.current && seq === veilSeqRef.current) {
              setVeil((prev) => ({
                ...prev,
                progress: Math.round(24 + p * 72),
              }));
            }
          });
        } else {
          setVeil((prev) => ({ ...prev, progress: 68 }));
          await new Promise((r) => window.setTimeout(r, 180));
        }
      } else {
        setVeil((prev) => ({ ...prev, progress: 72 }));
        await new Promise((r) => window.setTimeout(r, 160));
      }

      if (!mountedRef.current || seq !== veilSeqRef.current) return;
      setVeil((prev) => ({ ...prev, progress: 100 }));
      await new Promise((r) => window.setTimeout(r, 90));
      if (!mountedRef.current || seq !== veilSeqRef.current) return;
      setVeil((prev) => ({ ...prev, visible: false }));
    })();
  }, [theme, isDark, webglFallback, displayMode]);

  // Initial reveal readiness + dataset sync + committed filter transition choreography
  useEffect(() => {
    if (!data) return;
    if (displayMode === 'shelf' && !webglFallback && !sceneBooted) return;

    if (!initDoneRef.current) {
      lastWaveTriggerRef.current = waveTrigger;
      if (displayMode === 'shelf' && !webglFallback) {
        sceneRef.current?.setDarkMode(isDark);
        sceneRef.current?.setBooks(filteredBooks, focusedBookKeyRef.current);
      } else {
        setFocusedBook(filteredBooks[0] ?? null);
        setFocusedIndex(0);
      }

      const seq = ++veilSeqRef.current;
      void (async () => {
        if (displayMode === 'shelf' && !webglFallback && sceneRef.current && filteredBooks.length > 0) {
          setVeil((prev) => ({
            ...prev,
            progress: Math.max(prev.progress, 82),
            statusText: tx(
              '正在预处理近景书脊封面与着色器矩阵...',
              'Preparing foreground spine covers & shader matrix...',
              getCurrentLang(),
            ),
            detailText: `BUFFERING ${Math.min(filteredBooks.length, 30)} FRONT SPINES`,
          }));
          await sceneRef.current.waitForInitialReady(650);
        }

        if (!mountedRef.current || seq !== veilSeqRef.current) return;
        setVeil((prev) => ({ ...prev, progress: 100 }));

        const elapsed = performance.now() - mountTimeRef.current;
        if (elapsed < 260) {
          await new Promise((r) => window.setTimeout(r, 260 - elapsed));
        }
        if (!mountedRef.current || seq !== veilSeqRef.current) return;
        initDoneRef.current = true;
        setVeil((prev) => ({ ...prev, visible: false }));
      })();
      return;
    }

    const waveCommitted = waveTrigger !== lastWaveTriggerRef.current;
    if (waveCommitted) {
      lastWaveTriggerRef.current = waveTrigger;
    }

    const curLang = getCurrentLang();
    if (displayMode === 'mosaic' || webglFallback) {
      const preservedIdx = focusedBookKeyRef.current
        ? filteredBooks.findIndex((b) => b.bookKey === focusedBookKeyRef.current)
        : 0;
      const safeIdx = preservedIdx >= 0 ? preservedIdx : 0;
      setFocusedBook(filteredBooks[safeIdx] ?? null);
      setFocusedIndex(safeIdx);

      if (waveCommitted) {
        const seq = ++filterSeqRef.current;
        setFilterBanner({
          active: true,
          label: getBookFilterTransitionLabel(filters, curLang),
          countText: tx(`${filteredBooks.length} 本`, `${filteredBooks.length} books`, curLang),
        });
        window.setTimeout(() => {
          if (mountedRef.current && seq === filterSeqRef.current) {
            setFilterBanner((prev) => ({ ...prev, active: false }));
          }
        }, 380);
      }
      return;
    }

    // Shelf mode active & booted: keep theme in sync (e.g. if switched in mosaic) and sync dataset
    sceneRef.current?.setDarkMode(isDark);

    if (waveCommitted) {
      const seq = ++filterSeqRef.current;
      setFilterBanner({
        active: true,
        label: getBookFilterTransitionLabel(filters, curLang),
        countText: tx(`${filteredBooks.length} 本`, `${filteredBooks.length} books`, curLang),
      });
      void (async () => {
        await sceneRef.current?.transitionToBooks(filteredBooks, focusedBookKeyRef.current);
        if (mountedRef.current && seq === filterSeqRef.current) {
          setFilterBanner((prev) => ({ ...prev, active: false }));
        }
      })();
      return;
    }

    sceneRef.current?.setBooks(filteredBooks, focusedBookKeyRef.current);
  }, [
    data,
    displayMode,
    sceneBooted,
    webglFallback,
    filteredBooks,
    waveTrigger,
    filters,
    isDark,
  ]);

  const handleOpenBook = useCallback(
    (index: number) => {
      const book = filteredBooks[index];
      if (!book) return;
      if (mosaicClosingTimerRef.current !== null) {
        window.clearTimeout(mosaicClosingTimerRef.current);
        mosaicClosingTimerRef.current = null;
      }
      if (displayMode === 'mosaic' || webglFallback) {
        setFocusedBook(book);
        setFocusedIndex(index);
        setActiveOpenBook(book);
        setActiveOpenIndex(index);
        setOpenPhase('open');
        void fetchDetailForBook(book);
        return;
      }
      sceneRef.current?.openBookByIndex(index);
    },
    [filteredBooks, displayMode, webglFallback, fetchDetailForBook],
  );

  const handleCloseBook = useCallback(() => {
    if (displayMode === 'mosaic' || webglFallback) {
      if (prefersReduced) {
        setOpenPhase('idle');
        setActiveOpenBook(null);
        setActiveDetail(null);
        return;
      }
      setOpenPhase('closing');
      mosaicClosingTimerRef.current = window.setTimeout(() => {
        mosaicClosingTimerRef.current = null;
        if (mountedRef.current) {
          setOpenPhase('idle');
          setActiveOpenBook(null);
          setActiveDetail(null);
        }
      }, 210);
      return;
    }
    sceneRef.current?.closeBook();
  }, [displayMode, webglFallback, prefersReduced]);

  const handleStepOpenBook = useCallback(
    (delta: -1 | 1) => {
      if (filteredBooks.length === 0) return;
      const next = (activeOpenIndex + delta + filteredBooks.length) % filteredBooks.length;
      if (displayMode === 'mosaic' || webglFallback) {
        const b = filteredBooks[next];
        setFocusedBook(b);
        setFocusedIndex(next);
        setActiveOpenBook(b);
        setActiveOpenIndex(next);
        setMosaicPage(Math.floor(next / mosaicPerPage));
        void fetchDetailForBook(b);
        return;
      }
      sceneRef.current?.swapOpenBook(next);
    },
    [activeOpenIndex, filteredBooks, displayMode, webglFallback, mosaicPerPage, fetchDetailForBook],
  );

  const handleSwitchDisplayMode = useCallback(
    (nextMode: BookDisplayMode) => {
      if (nextMode === displayMode) return;
      if (mosaicClosingTimerRef.current !== null) {
        window.clearTimeout(mosaicClosingTimerRef.current);
        mosaicClosingTimerRef.current = null;
      }
      setOpenPhase('idle');
      setActiveOpenBook(null);
      setActiveDetail(null);
      setAdvancedOpen(false);

      if (nextMode === 'mosaic') {
        const anchorIdx = hoveredIndex >= 0 ? hoveredIndex : focusedIndex;
        const dims = getMosaicGridDimensions(mosaicGridKey, filteredBooks.length);
        const perPage = Math.max(1, dims.cols * dims.rows);
        setMosaicPage(
          filteredBooks.length > 0 ? Math.floor(Math.max(0, anchorIdx) / perPage) : 0,
        );
        setMosaicHoveredBook(null);
        setMosaicHoveredIndex(-1);
      }
      setDisplayMode(nextMode);
    },
    [displayMode, hoveredIndex, focusedIndex, mosaicGridKey, filteredBooks.length],
  );

  // Global keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isInput) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      const dialogs = document.querySelectorAll('[role="dialog"]');
      const hasExternalDialog = Array.from(dialogs).some(
        (d) => !d.closest('.rhine-book-root'),
      );
      if (hasExternalDialog) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (openPhase !== 'idle') {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCloseBook();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleStepOpenBook(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleStepOpenBook(1);
        }
        return;
      }

      if (displayMode === 'mosaic') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          mosaicRef.current?.stepPage(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          mosaicRef.current?.stepPage(1);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        sceneRef.current?.stepFocus(-1, 0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sceneRef.current?.stepFocus(1, 0);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        sceneRef.current?.stepFocus(0, -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        sceneRef.current?.stepFocus(0, 1);
      } else if (e.key === 'Enter' && focusedBook) {
        e.preventDefault();
        handleOpenBook(focusedIndex);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    openPhase,
    displayMode,
    focusedBook,
    focusedIndex,
    handleCloseBook,
    handleStepOpenBook,
    handleOpenBook,
  ]);

  const activeHoveredBook = displayMode === 'mosaic' ? mosaicHoveredBook : hoveredBook;
  const activeHoveredIndex = displayMode === 'mosaic' ? mosaicHoveredIndex : hoveredIndex;
  const displayBook = activeHoveredBook ?? focusedBook;
  const displayIndex = activeHoveredBook ? activeHoveredIndex : focusedIndex;

  const laneCount =
    filteredBooks.length >= 25
      ? 5
      : Math.max(1, Math.min(5, Math.ceil(filteredBooks.length / 5)));
  const currentLane = filteredBooks.length > 0 ? (displayIndex % laneCount) + 1 : 1;

  const shelfTickTargets = useMemo(() => {
    if (filteredBooks.length === 0) return [];
    return Array.from({ length: TICK_SLOTS }, (_, i) => {
      if (filteredBooks.length <= TICK_SLOTS) return i < filteredBooks.length ? i : -1;
      return Math.round((i / (TICK_SLOTS - 1)) * (filteredBooks.length - 1));
    });
  }, [filteredBooks.length]);

  const activeShelfTick = useMemo(() => {
    if (filteredBooks.length <= 1) return 0;
    if (filteredBooks.length <= TICK_SLOTS) return Math.min(TICK_SLOTS - 1, displayIndex);
    return Math.round((displayIndex / (filteredBooks.length - 1)) * (TICK_SLOTS - 1));
  }, [displayIndex, filteredBooks.length]);

  const mosaicTickTargets = useMemo(() => {
    if (mosaicTotalPages <= 0) return [];
    return Array.from({ length: TICK_SLOTS }, (_, i) => {
      if (mosaicTotalPages <= TICK_SLOTS) return i < mosaicTotalPages ? i : -1;
      return Math.round((i / (TICK_SLOTS - 1)) * (mosaicTotalPages - 1));
    });
  }, [mosaicTotalPages]);

  const activeMosaicTick = useMemo(() => {
    if (mosaicTotalPages <= 1) return 0;
    if (mosaicTotalPages <= TICK_SLOTS) return Math.min(TICK_SLOTS - 1, mosaicPage);
    return Math.round((mosaicPage / (mosaicTotalPages - 1)) * (TICK_SLOTS - 1));
  }, [mosaicPage, mosaicTotalPages]);

  const showSpread = openPhase === 'open' || openPhase === 'closing';
  const canLoadIntoGame = Boolean(library?.lazerRunning || library?.stableRunning);
  const isFiltered = data ? filteredBooks.length !== data.stats.totalBooks : false;

  return (
    <div
      className="rhine-book-root relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden select-none"
      data-rhine-dark={isDark ? 'true' : 'false'}
    >
      {/* 3D Three.js Shelf Canvas Layer (only active in 'shelf' mode) */}
      {displayMode === 'shelf' && !webglFallback && (
        <div
          ref={canvasMountRef}
          className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
        />
      )}

      {/* Rhine Lab Atmospheric Vignette + Distant Horizon Mist (only for 3D shelf) */}
      {displayMode === 'shelf' && (
        <>
          <div className="rhine-distance-mist pointer-events-none absolute inset-0 z-[1]" />
          <div className="rhine-atmosphere pointer-events-none absolute inset-0 z-[1]" />
        </>
      )}

      {/* Top Filter Sync Scanline & Telemetry HUD */}
      <RhineFilterTransitionHud
        active={filterBanner.active}
        label={filterBanner.label}
        countText={filterBanner.countText}
      />

      {/* Top HUD: Brand Mark (Left) + Display Switcher & Expanded Filters (Right) */}
      <div className="pointer-events-none relative z-20 flex shrink-0 flex-wrap items-start justify-between gap-2.5 px-4 pt-3.5 sm:px-6 sm:pt-4">
        <div className="pointer-events-auto">
          <div className="font-display text-[1.45rem] leading-none font-extrabold tracking-[0.06em] text-[var(--rb-ink)] sm:text-[1.75rem]">
            LOCAL ARCHIVE
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-[var(--rb-muted)]">
            <span>BEATMAP REPOSITORY</span>
            <span className="inline-block h-1 w-1 bg-[var(--rb-accent)]" />
            <span>{displayMode === 'mosaic' ? 'FROSTED MOSAIC' : 'BOOK INDEX'}</span>
          </div>
          {data && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[0.6875rem] text-[var(--rb-muted)]">
              <span>
                {isEn ? (
                  <>
                    <strong className="text-[var(--rb-ink)]">{data.stats.totalBooks}</strong> local books
                  </>
                ) : (
                  <>
                    本地曲目 <strong className="text-[var(--rb-ink)]">{data.stats.totalBooks}</strong> 本
                  </>
                )}
              </span>
              {isFiltered && (
                <span>
                  {isEn ? (
                    <>
                      <strong className="text-[var(--rb-accent)]">{filteredBooks.length}</strong> matched
                    </>
                  ) : (
                    <>
                      筛选命中 <strong className="text-[var(--rb-accent)]">{filteredBooks.length}</strong> 本
                    </>
                  )}
                </span>
              )}
              <span>
                {isEn ? (
                  <>
                    <strong className="text-[var(--rb-ink)]">{data.stats.totalPlays.toLocaleString()}</strong> plays
                  </>
                ) : (
                  <>
                    总游玩 <strong className="text-[var(--rb-ink)]">{data.stats.totalPlays.toLocaleString()}</strong> 次
                  </>
                )}
              </span>
              {data.stats.highestPp !== null && (
                <span>
                  {isEn ? (
                    <>
                      Best <strong className="text-[var(--rb-accent)]">{data.stats.highestPp.toFixed(1)}pp</strong>
                    </>
                  ) : (
                    <>
                      最高 <strong className="text-[var(--rb-accent)]">{data.stats.highestPp.toFixed(1)}pp</strong>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Top-Right Compact Display Mode, Search, Quick Filters & Collapsible Advanced Matrix */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {/* Display Mode Toggle: 3D Spine Shelf (default) | Frosted Mosaic */}
          <div
            className="flex h-8 items-center border border-[var(--rb-line)] bg-[var(--rb-panel)]/92 p-0.5 backdrop-blur-md"
            role="group"
            aria-label={t('档案展示模式切换', 'Archive display mode')}
          >
            <button
              type="button"
              onClick={() => handleSwitchDisplayMode('shelf')}
              title={t('默认 3D 书脊档案架视图', 'Default 3D spine archive shelf view')}
              className={`inline-flex h-full items-center gap-1 px-2 text-[0.71875rem] font-semibold transition-colors ${
                displayMode === 'shelf'
                  ? 'bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                  : 'text-[var(--rb-muted)] hover:text-[var(--rb-ink)]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{t('3D 书脊', '3D Shelf')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchDisplayMode('mosaic')}
              title={t('无字毛玻璃无缝平铺封面模式', 'Textless frosted seamless cover mosaic')}
              className={`inline-flex h-full items-center gap-1 px-2 text-[0.71875rem] font-semibold transition-colors ${
                displayMode === 'mosaic'
                  ? 'bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                  : 'text-[var(--rb-muted)] hover:text-[var(--rb-ink)]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>{t('平铺毛玻璃', 'Mosaic')}</span>
            </button>
          </div>

          {onOpenMusicPlayer && (
            <button
              type="button"
              onClick={() => onOpenMusicPlayer(displayBook ?? undefined, filteredBooks)}
              title={t('进入 OSU! 构成主义音乐播放器（播放本地曲目）', 'Open OSU! Audio Station (play local tracks)')}
              className="rhine-btn-outline flex h-8 items-center gap-1.5 bg-[var(--rb-panel)]/92 px-2.5 text-[0.71875rem] font-semibold backdrop-blur-md"
            >
              <OsuMusicMark
                className="h-3.5 w-3.5 text-[var(--rb-ink)]"
                active
                playing={musicPlaying}
              />
              <span>{t('音乐台', 'Music')}</span>
              {musicPlaying && <span className="h-1.5 w-1.5 rounded-full bg-[#d62828]" />}
            </button>
          )}

          {/* Search Input */}
          <div className="relative flex h-8 items-center border border-[var(--rb-line)] bg-[var(--rb-panel)]/92 backdrop-blur-md">
            <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-[var(--rb-muted)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={filters.q}
              onChange={(e) => updateFilters({ q: e.target.value }, false)}
              placeholder={t('搜本地曲目 / 谱师 / 标签 (/)', 'Search maps / mapper / tags (/)')}
              className="h-full w-40 bg-transparent pr-7 pl-2 text-[0.75rem] text-[var(--rb-ink)] placeholder:text-[var(--rb-muted)] focus:outline-none sm:w-44"
            />
            {filters.q && (
              <button
                type="button"
                onClick={() => updateFilters({ q: '' }, false)}
                aria-label={t('清空搜索', 'Clear search')}
                className="absolute right-1.5 flex h-5 w-5 items-center justify-center text-[var(--rb-muted)] hover:text-[var(--rb-ink)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Quick Source Pills */}
          <div className="flex h-8 items-center border border-[var(--rb-line)] bg-[var(--rb-panel)]/92 p-0.5 backdrop-blur-md">
            {(
              [
                { id: 'all', label: t('全部', 'All') },
                { id: 'stable', label: 'Stable' },
                { id: 'lazer', label: 'Lazer' },
                { id: 'played', label: t('已游玩', 'Played') },
              ] as Array<{ id: BookSourceFilter; label: string }>
            ).map((opt) => {
              const active = filters.source === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateFilters({ source: opt.id }, true)}
                  className={`h-full px-2 text-[0.71875rem] font-semibold transition-colors ${
                    active
                      ? 'bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                      : 'text-[var(--rb-muted)] hover:text-[var(--rb-ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sort Select + Asc/Desc Toggle */}
          <div className="flex h-8 items-center gap-1">
            <div className={isEn ? 'w-32' : 'w-28'}>
              <SelectField
                value={filters.sortBy}
                onChange={(v) => {
                  const nextSort = v as BookSortField;
                  updateFilters(
                    {
                      sortBy: nextSort,
                      sortDir: nextSort === 'title' ? 'asc' : filters.sortDir,
                    },
                    true,
                  );
                }}
                title={t('Book 排列顺序', 'Sort books by')}
                className="h-8 !rounded-none !border-[var(--rb-line)] !bg-[var(--rb-panel)] text-[0.75rem]"
              >
                {getBookSortOptions(lang).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <button
              type="button"
              onClick={() =>
                updateFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' }, true)
              }
              title={
                filters.sortDir === 'asc'
                  ? t('当前升序，点击切换降序', 'Ascending — click for descending')
                  : t('当前降序，点击切换升序', 'Descending — click for ascending')
              }
              className="rhine-btn-outline flex h-8 w-8 items-center justify-center bg-[var(--rb-panel)]/92 backdrop-blur-md"
            >
              {filters.sortDir === 'asc' ? (
                <ArrowUpNarrowWide className="h-3.5 w-3.5 text-[var(--rb-accent)]" />
              ) : (
                <ArrowDownWideNarrow className="h-3.5 w-3.5 text-[var(--rb-ink)]" />
              )}
            </button>
          </div>

          {/* Download-style Collapsible Advanced Filter Button */}
          <button
            ref={filterBtnRef}
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            title={t(
              '展开/收起仿下载页高级筛选面板（星数 / PP / BPM / 时长 / 模式键数 / 评级 / LN%）',
              'Toggle advanced filters (Stars / PP / BPM / Length / Mode / Grade / LN%)',
            )}
            className={`flex h-8 items-center gap-1.5 px-2.5 text-[0.71875rem] font-semibold backdrop-blur-md ${
              advancedOpen || advancedFilterCount > 0
                ? 'rhine-solid-btn !border-[var(--rb-accent)]'
                : 'rhine-btn-outline bg-[var(--rb-panel)]/92'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{t('高级筛选', 'Filters')}</span>
            {advancedFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center bg-[var(--rb-accent)] px-1 font-mono text-[0.625rem] font-bold text-[#121410]">
                {advancedFilterCount}
              </span>
            )}
          </button>

          {/* Refresh Local Database Button */}
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void loadBooks(true)}
            title={t('重新扫描 Stable / Lazer 本地曲库与成绩', 'Rescan Stable / Lazer local library & scores')}
            className="rhine-btn-outline flex h-8 items-center gap-1.5 bg-[var(--rb-panel)]/92 px-2.5 text-[0.71875rem] font-semibold backdrop-blur-md"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">{t('刷新', 'Refresh')}</span>
          </button>
        </div>

        {/* Collapsible Download-Style Advanced Filter Panel */}
        <BookFilterPanel
          open={advancedOpen}
          filters={filters}
          matchedCount={filteredBooks.length}
          totalCount={data?.stats.totalBooks ?? 0}
          anchorRef={filterBtnRef}
          onUpdate={updateFilters}
          onReset={resetAllFilters}
          onClose={() => setAdvancedOpen(false)}
        />
      </div>

      {/* Center Stage: Loading / Error / Empty / Frosted Mosaic / WebGL-Fallback / 3D Callout */}
      <div className="pointer-events-none relative z-10 min-h-0 flex-1">
        {loading && !data ? (
          <div className="pointer-events-auto flex h-full flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--rb-accent)]" />
          </div>
        ) : error ? (
          <div className="pointer-events-auto flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-[0.9375rem] font-semibold text-[var(--rb-ink)]">{error}</p>
            <button
              type="button"
              onClick={() => void loadBooks(true)}
              className="rhine-solid-btn px-4 py-2 text-[0.8125rem] font-semibold"
            >
              {t('重试读取曲库', 'Retry Loading Library')}
            </button>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="pointer-events-auto flex h-full flex-col items-center justify-center gap-2.5 p-6 text-center">
            <BookOpen className="h-8 w-8 text-[var(--rb-muted)] opacity-60" />
            <p className="text-[0.9375rem] font-semibold text-[var(--rb-ink)]">
              {t('没有匹配当前筛选条件的本地 Book', 'No local books match the current filters')}
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="rhine-btn-outline mt-1 px-4 py-1.5 text-[0.78125rem] font-semibold"
            >
              {t('重置全部筛选条件', 'Reset All Filters')}
            </button>
          </div>
        ) : displayMode === 'mosaic' ? (
          /* Seamless Tiled Frosted Cover Mode (Preset A + Frost-Iris Page Turn) */
          <div className="pointer-events-auto h-full w-full px-4 py-2 sm:px-6 sm:py-2.5">
            <div className="relative h-full w-full overflow-hidden border border-[var(--rb-line)] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.42)]">
              <BookMosaicView
                ref={mosaicRef}
                books={filteredBooks}
                page={mosaicPage}
                gridKey={mosaicGridKey}
                isDark={isDark}
                reducedMotion={prefersReduced}
                spreadOpen={showSpread}
                onPageChange={setMosaicPage}
                onOpenBook={handleOpenBook}
                onHoverChange={(b, idx) => {
                  setMosaicHoveredBook(b);
                  setMosaicHoveredIndex(idx);
                }}
              />
            </div>
          </div>
        ) : webglFallback ? (
          <div className="pointer-events-auto h-full overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredBooks.slice(0, 120).map((b, idx) => (
                <button
                  key={b.bookKey}
                  type="button"
                  onMouseEnter={() => {
                    setHoveredBook(b);
                    setHoveredIndex(idx);
                  }}
                  onClick={() => handleOpenBook(idx)}
                  className="group relative flex h-16 items-center gap-3 overflow-hidden border border-[var(--rb-line)] bg-[var(--rb-panel)] px-3 text-left transition-transform duration-200 hover:-translate-y-1.5 hover:border-[var(--rb-accent)]"
                >
                  <img
                    src={b.coverUrl}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 blur-[4px]"
                  />
                  <span className="relative z-10 h-full w-1 shrink-0 bg-[var(--rb-accent)]" />
                  <span className="relative z-10 font-mono text-[0.71875rem] text-[var(--rb-muted)]">
                    NO.{formatBookNo(idx)}
                  </span>
                  <span className="relative z-10 min-w-0 flex-1 truncate text-[0.84375rem] font-bold text-[var(--rb-ink)]">
                    {b.titleUnicode || b.title}
                  </span>
                  <span className="relative z-10 font-mono text-[0.71875rem] font-semibold text-[var(--rb-accent)]">
                    {b.bestPp !== null ? `${b.bestPp.toFixed(0)}pp` : `★${b.maxStars.toFixed(1)}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          displayBook &&
          (openPhase === 'idle' || openPhase === 'returning') &&
          (calloutCollapsed ? (
            <button
              type="button"
              onClick={toggleCallout}
              title={t('展开右侧书目预览卡片', 'Expand book preview card')}
              className="pointer-events-auto group absolute top-[45%] right-0 hidden -translate-y-1/2 items-center gap-2 border border-r-0 border-[var(--rb-line)]/90 bg-[var(--rb-paper)]/88 py-3 pr-3 pl-2.5 shadow-[0_14px_34px_-16px_rgba(0,0,0,0.34)] backdrop-blur-md transition-all hover:border-[var(--rb-accent)] md:flex"
            >
              <span className="h-7 w-[2px] bg-[var(--rb-accent)]" />
              <ChevronLeft className="h-3.5 w-3.5 text-[var(--rb-ink)] transition-transform group-hover:-translate-x-0.5 group-hover:text-[var(--rb-accent)]" />
              <div className="text-left font-mono leading-tight">
                <div className="text-[0.65625rem] font-bold tracking-[0.12em] text-[var(--rb-ink)]">
                  NO.{formatBookNo(displayIndex)}
                </div>
                <div className="text-[0.5625rem] tracking-[0.1em] text-[var(--rb-muted)]">
                  {t('展开预览', 'EXPAND')}
                </div>
              </div>
            </button>
          ) : (
            <div className="pointer-events-none absolute top-[45%] right-4 hidden w-[min(46vw,500px)] -translate-y-1/2 border border-[var(--rb-line)]/85 bg-[var(--rb-paper)]/86 px-5 py-4 shadow-[0_20px_50px_-22px_rgba(0,0,0,0.34)] backdrop-blur-md transition-all duration-200 md:block xl:right-8">
              <div className="flex items-center justify-between gap-3 font-mono text-[0.6875rem] tracking-[0.14em] text-[var(--rb-muted)] uppercase">
                <div className="flex items-center">
                  <span>
                    {displayBook.inStable && displayBook.inLazer
                      ? 'STABLE + LAZER'
                      : displayBook.inLazer
                        ? 'OSU!LAZER'
                        : 'OSU!STABLE'}
                  </span>
                  <span className="ml-3">NO.{formatBookNo(displayIndex)}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCallout();
                  }}
                  title={t('收起书目预览卡片', 'Collapse book preview card')}
                  className="pointer-events-auto inline-flex items-center gap-1 border border-[var(--rb-line)] px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] transition-colors hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]"
                >
                  <span>{t('收起', 'Hide')}</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenBook(displayIndex)}
                className="pointer-events-auto group mt-1.5 flex max-w-full items-center gap-2.5 text-left"
              >
                <span className="truncate font-display text-[1.25rem] font-bold tracking-tight text-[var(--rb-ink)] transition-colors group-hover:text-[var(--rb-accent)] xl:text-[1.45rem]">
                  {displayBook.titleUnicode || displayBook.title}
                </span>
                <ArrowUpRight className="h-4.5 w-4.5 shrink-0 text-[var(--rb-ink)] opacity-60 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--rb-accent)] group-hover:opacity-100" />
              </button>

              <div className="relative mt-3 ml-5 h-[1px] bg-[var(--rb-ink)]/55">
                <i className="absolute -top-[2.5px] -left-5 h-[6px] w-[6px] bg-[var(--rb-ink)]" />
              </div>

              <div className="mt-2.5 ml-5 flex items-center justify-between gap-3 text-[0.8125rem] text-[var(--rb-muted)]">
                <span className="truncate">
                  {displayBook.artistUnicode || displayBook.artist} · {displayBook.creator} · ★
                  {displayBook.minStars.toFixed(1)}–{displayBook.maxStars.toFixed(1)}
                </span>
                <span className="shrink-0 font-mono text-[0.71875rem] font-semibold tracking-[0.06em] text-[var(--rb-ink)]">
                  {displayBook.playCount > 0
                    ? isEn
                      ? `${displayBook.playCount} ${displayBook.playCount === 1 ? 'play' : 'plays'}${
                          displayBook.bestPp !== null ? ` · ${displayBook.bestPp.toFixed(1)} PP` : ''
                        }`
                      : `${displayBook.playCount} 次游玩${
                          displayBook.bestPp !== null ? ` · ${displayBook.bestPp.toFixed(1)} PP` : ''
                        }`
                    : isEn
                      ? `${displayBook.difficultyCount} ${displayBook.difficultyCount === 1 ? 'diff' : 'diffs'}`
                      : `${displayBook.difficultyCount} 难度`}
                </span>
              </div>

              <div className="mt-3.5 ml-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenBook(displayIndex)}
                  className="pointer-events-auto group inline-flex items-center gap-6 font-mono text-[0.75rem] font-bold tracking-[0.12em] text-[var(--rb-ink)] transition-colors hover:text-[var(--rb-accent)]"
                >
                  <span>ACCESS BOOK</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-2" />
                </button>

                {onOpenMusicPlayer && (
                  <button
                    type="button"
                    onClick={() => onOpenMusicPlayer(displayBook, filteredBooks)}
                    className="pointer-events-auto rhine-btn-outline inline-flex h-7 items-center gap-1.5 px-2.5 font-mono text-[0.6875rem] font-semibold"
                  >
                    <OsuMusicMark
                      className="h-3.5 w-3.5 text-[var(--rb-ink)]"
                      active
                      playing={musicPlaying}
                    />
                    <span>{t('在音乐台中播放', 'Play in Music')}</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom HUD: Counter (Left) + Navigation (Center) + Lane/Grid/Reset (Right) */}
      <footer className="pointer-events-none relative z-10 flex shrink-0 items-end justify-between gap-2 px-4 pb-3 sm:gap-4 sm:px-6 sm:pb-3.5">
        <div className="pointer-events-auto min-w-0 max-w-[34vw] shrink-0">
          <div className="font-mono text-[0.625rem] tracking-[0.16em] text-[var(--rb-muted)] uppercase">
            ARCHIVE / SELECT
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-stat leading-none text-[var(--rb-ink)]">
            <span className="text-[1.9rem] font-light tracking-tight tabular-nums sm:text-[2.4rem]">
              {filteredBooks.length > 0 ? formatBookNo(displayIndex) : '000'}
            </span>
            <span className="text-[1.15rem] font-light text-[var(--rb-muted)]">/</span>
            <span className="text-[0.9rem] font-medium text-[var(--rb-muted)] tabular-nums">
              {String(filteredBooks.length).padStart(3, '0')}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
            <span className="inline-block h-[5px] w-[5px] shrink-0 bg-[var(--rb-accent)]" />
            <span className="truncate">
              {displayMode === 'mosaic' && mosaicHoveredBook
                ? mosaicHoveredBook.titleUnicode || mosaicHoveredBook.title
                : 'LOCAL ARCHIVE AUTHORIZED'}
            </span>
          </div>
        </div>

        {filteredBooks.length > 0 &&
          (openPhase === 'idle' || openPhase === 'returning') &&
          (displayMode === 'mosaic' ? (
            <div className="pointer-events-auto hidden min-w-0 flex-col items-center gap-1 md:flex">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={mosaicTotalPages <= 1}
                  onClick={() => mosaicRef.current?.stepPage(-1)}
                  aria-label={t('上一页封面', 'Previous cover page')}
                  className="inline-flex h-7 items-center gap-1 border border-[var(--rb-line)] px-2 font-mono text-[0.6875rem] font-semibold text-[var(--rb-ink)] transition-colors hover:border-[var(--rb-accent)] hover:text-[var(--rb-accent)] disabled:opacity-35"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>{t('上一页', 'Prev')}</span>
                </button>

                <div className="rhine-file-ticks flex items-center gap-2" role="group" aria-label={t('平铺页码刻度导航', 'Mosaic page index')}>
                  {mosaicTickTargets.map((targetPage, slot) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={targetPage < 0}
                      onClick={() => {
                        if (targetPage >= 0) mosaicRef.current?.jumpToPage(targetPage);
                      }}
                      title={targetPage >= 0 ? t(`第 ${targetPage + 1} 页`, `Page ${targetPage + 1}`) : undefined}
                      className={activeMosaicTick === slot ? 'is-selected' : ''}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  disabled={mosaicTotalPages <= 1}
                  onClick={() => mosaicRef.current?.stepPage(1)}
                  aria-label={t('下一页封面', 'Next cover page')}
                  className="inline-flex h-7 items-center gap-1 border border-[var(--rb-line)] px-2 font-mono text-[0.6875rem] font-semibold text-[var(--rb-ink)] transition-colors hover:border-[var(--rb-accent)] hover:text-[var(--rb-accent)] disabled:opacity-35"
                >
                  <span>{t('下一页', 'Next')}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="truncate font-mono text-[0.625rem] tracking-[0.06em] text-[var(--rb-muted)]">
                {isEn
                  ? `PAGE ${String(mosaicPage + 1).padStart(2, '0')} / ${String(mosaicTotalPages).padStart(2, '0')} · Wheel / ← → Iris Turn · Click Cover to Open`
                  : `第 ${String(mosaicPage + 1).padStart(2, '0')} / ${String(mosaicTotalPages).padStart(2, '0')} 页 · 滚轮 / ← → 虹膜翻页 · 点击封面打开详情`}
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto hidden min-w-0 flex-col items-center gap-1 md:flex">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => sceneRef.current?.stepFocus(-1, 0)}
                  aria-label={t('上一本 Book', 'Previous book')}
                  className="flex h-7 w-7 items-center justify-center text-[var(--rb-ink)] transition-colors hover:bg-[var(--rb-accent)]/20"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>

                <div className="rhine-file-ticks flex items-center gap-2" role="group" aria-label={t('档案刻度导航', 'Archive index navigation')}>
                  {shelfTickTargets.map((targetIdx, slot) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={targetIdx < 0}
                      onClick={() => {
                        if (targetIdx >= 0) sceneRef.current?.focusBookByIndex(targetIdx);
                      }}
                      title={
                        targetIdx >= 0 && filteredBooks[targetIdx]
                          ? `#${targetIdx + 1} ${filteredBooks[targetIdx].titleUnicode}`
                          : undefined
                      }
                      className={activeShelfTick === slot ? 'is-selected' : ''}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => sceneRef.current?.stepFocus(1, 0)}
                  aria-label={t('下一本 Book', 'Next book')}
                  className="flex h-7 w-7 items-center justify-center text-[var(--rb-ink)] transition-colors hover:bg-[var(--rb-accent)]/20"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <div className="truncate font-mono text-[0.625rem] tracking-[0.06em] text-[var(--rb-muted)]">
                {t(
                  '悬停半抽出 · 点击翻开 · 滚轮/左键浏览 · 中键移动视角 · ESC 放回',
                  'Hover to peek · Click to open · Scroll/Drag to browse · Middle-drag to pan · ESC close',
                )}
              </div>
            </div>
          ))}

        <div className="pointer-events-auto flex shrink-0 items-center gap-2.5">
          {displayMode === 'mosaic' ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 items-center border border-[var(--rb-line)] bg-[var(--rb-panel)]/92 p-0.5 backdrop-blur-md">
                {MOSAIC_GRID_OPTIONS.map((opt) => {
                  const active = mosaicGridKey === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setMosaicGridKey(opt.id);
                        setMosaicPage(0);
                      }}
                      className={`h-full px-2 font-mono text-[0.6875rem] font-semibold transition-colors ${
                        active
                          ? 'bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                          : 'text-[var(--rb-muted)] hover:text-[var(--rb-ink)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {mosaicTotalPages > 1 && (
                <div className="flex items-center gap-1 md:hidden">
                  <button
                    type="button"
                    onClick={() => mosaicRef.current?.stepPage(-1)}
                    aria-label={t('上一页', 'Previous page')}
                    className="rhine-btn-outline flex h-8 w-8 items-center justify-center"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mosaicRef.current?.stepPage(1)}
                    aria-label={t('下一页', 'Next page')}
                    className="rhine-btn-outline flex h-8 w-8 items-center justify-center"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {cameraMoved &&
                (openPhase === 'idle' || openPhase === 'returning') &&
                !webglFallback && (
                  <button
                    type="button"
                    onClick={() => sceneRef.current?.resetCameraView()}
                    title={t('复位三维观察视角（或双击鼠标中键）', 'Reset 3D camera view (or middle double-click)')}
                    className="rhine-btn-outline inline-flex h-8 items-center gap-1.5 bg-[var(--rb-panel)]/90 px-2.5 font-mono text-[0.6875rem] font-semibold backdrop-blur-md"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{t('重置视角', 'Reset View')}</span>
                  </button>
                )}

              {filteredBooks.length > 0 &&
                laneCount > 1 &&
                (openPhase === 'idle' || openPhase === 'returning') && (
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <button
                      type="button"
                      onClick={() => sceneRef.current?.stepFocus(0, -1)}
                      aria-label={t('上一列', 'Previous lane')}
                      className="flex h-8 w-8 items-center justify-center text-[var(--rb-ink)] transition-colors hover:bg-[var(--rb-accent)]/20"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-[76px] text-center font-mono">
                      <div className="text-[0.5625rem] tracking-[0.12em] text-[var(--rb-muted)]">
                        LANE {String(currentLane).padStart(2, '0')} / {String(laneCount).padStart(2, '0')}
                      </div>
                      <div className="text-[0.75rem] font-semibold text-[var(--rb-ink)]">
                        {t('档案序列', 'Shelf Lane')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => sceneRef.current?.stepFocus(0, 1)}
                      aria-label={t('下一列', 'Next lane')}
                      className="flex h-8 w-8 items-center justify-center text-[var(--rb-ink)] transition-colors hover:bg-[var(--rb-accent)]/20"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

              {displayBook && openPhase === 'idle' && (
                <button
                  type="button"
                  onClick={() => handleOpenBook(displayIndex)}
                  className="rhine-solid-btn inline-flex h-8 items-center gap-2 px-3 text-[0.71875rem] font-semibold md:hidden"
                >
                  <span>{t('打开', 'Open')}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </footer>

      {/* Opened 2-Page Book Inner Spread (Shared across 3D Shelf & Frosted Mosaic) */}
      <BookSpreadOverlay
        visible={showSpread}
        closing={openPhase === 'closing'}
        bookSummary={activeOpenBook}
        bookDetail={activeDetail}
        loadingDetail={loadingDetail}
        bookIndex={activeOpenIndex}
        totalBooks={filteredBooks.length}
        canLoadIntoGame={canLoadIntoGame}
        onClose={handleCloseBook}
        onStepBook={handleStepOpenBook}
        onPlayInMusicPlayer={
          onOpenMusicPlayer
            ? (b) => {
                handleCloseBook();
                onOpenMusicPlayer(b, filteredBooks);
              }
            : undefined
        }
        onPauseBackgroundMusic={onPauseBackgroundMusic}
        onPreviewBeatmap={onPreviewBeatmap}
        onLoadIntoGame={onLoadIntoGame}
        onFilterByTag={(tag) => updateFilters({ q: tag }, true)}
        onNotify={onNotify}
      />

      {/* RhineLabUI Loading Veil for Enter / Theme Calibration / Rescan */}
      <RhineLoadingVeil
        visible={veil.visible}
        mode={veil.mode}
        isDark={isDark}
        progress={veil.progress}
        statusText={veil.statusText}
        detailText={veil.detailText}
      />
    </div>
  );
}
