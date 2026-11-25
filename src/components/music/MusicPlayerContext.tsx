import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  createPlaylist as apiCreatePlaylist,
  deletePlaylist as apiDeletePlaylist,
  fetchBookRhythm,
  fetchLocalBooks,
  fetchPlaylists,
  updatePlaylist as apiUpdatePlaylist,
} from '../../api';
import type { BookRhythmData, BooksLibraryResponse, BookSummary, MusicPlaylist } from '../../types';

export type MusicLoopMode = 'all' | 'one' | 'shuffle';
export type MusicVisualizerMode = 'bars' | 'scope';
export type MusicCoverMode = 'poster' | 'disc';
export type MusicRhythmIntensity = 'off' | 'subtle' | 'standard' | 'kinetic';

export type SleepTimerState =
  | { mode: 'minutes'; endsAt: number; remainingSec: number }
  | { mode: 'track_end'; endsAt: null; remainingSec: 0 }
  | null;

interface MusicTimeContextValue {
  currentTime: number;
  duration: number;
  seek: (seconds: number) => void;
  seekRelative: (deltaSeconds: number) => void;
}

interface MusicPlayerContextValue {
  libraryBooks: BookSummary[];
  playableBooks: BookSummary[];
  libraryStats: BooksLibraryResponse['stats'] | null;
  loadingLibrary: boolean;
  libraryError: string | null;
  refreshLibrary: (forceRefresh?: boolean) => Promise<void>;

  playlists: MusicPlaylist[];
  loadingPlaylists: boolean;
  createNewPlaylist: (input: {
    name: string;
    description?: string;
    bookKeys?: string[];
  }) => Promise<MusicPlaylist | null>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  togglePinPlaylist: (id: string) => Promise<void>;
  addBookToPlaylist: (playlistId: string, bookKey: string) => Promise<void>;
  removeBookFromPlaylist: (playlistId: string, bookKey: string) => Promise<void>;
  reorderPlaylistTrack: (playlistId: string, fromIdx: number, toIdx: number) => Promise<void>;
  setPlaylistBooks: (playlistId: string, bookKeys: string[]) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;

  likedKeys: string[];
  likedSet: Set<string>;
  toggleLike: (bookKey: string) => void;

  queue: BookSummary[];
  currentIndex: number;
  currentTrack: BookSummary | null;
  isPlaying: boolean;
  buffering: boolean;
  audioError: string | null;

  playbackRate: number;
  preservesPitch: boolean;
  volume: number;
  muted: boolean;
  loopMode: MusicLoopMode;

  visualizerMode: MusicVisualizerMode;
  coverMode: MusicCoverMode;
  rhythmFollow: MusicRhythmIntensity;
  sleepTimer: SleepTimerState;

  rhythmData: BookRhythmData | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  analyserRef: MutableRefObject<AnalyserNode | null>;
  audioContextRef: MutableRefObject<AudioContext | null>;
  rhythmDataRef: MutableRefObject<BookRhythmData | null>;

  playTrack: (book: BookSummary, nextQueue?: BookSummary[]) => void;
  playQueueIndex: (index: number) => void;
  setQueueAndPlay: (books: BookSummary[], startIndex?: number) => void;
  enqueueTrackNext: (book: BookSummary) => void;
  removeFromQueue: (index: number) => void;
  togglePlay: () => void;
  pause: () => void;
  stopAndClear: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  cycleLoopMode: () => void;

  setPlaybackRate: (rate: number) => void;
  setPreservesPitch: (locked: boolean) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;

  setVisualizerMode: (mode: MusicVisualizerMode) => void;
  setCoverMode: (mode: MusicCoverMode) => void;
  setRhythmFollow: (level: MusicRhythmIntensity) => void;

  startSleepTimerMinutes: (minutes: number) => void;
  startSleepTimerTrackEnd: () => void;
  cancelSleepTimer: () => void;
}

const MusicControlContext = createContext<MusicPlayerContextValue | null>(null);
const MusicTimeContext = createContext<MusicTimeContextValue | null>(null);

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  } catch {
    return fallback;
  }
}

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // Ignore storage error
  }
  return fallback;
}

function readStoredEnum<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw && (valid as readonly string[]).includes(raw)) {
      return raw as T;
    }
  } catch {
    // Ignore storage error
  }
  return fallback;
}

function readStoredLiked(): string[] {
  try {
    const raw = localStorage.getItem('osu4k-music-liked');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

function createSyntheticRhythm(book: BookSummary): BookRhythmData {
  const safeBpm = book.bpm > 0 && Number.isFinite(book.bpm) ? book.bpm : 120;
  const beatLengthMs = Math.round((60000 / safeBpm) * 1000) / 1000;
  const firstBeatMs =
    book.previewTimeMs > 0 ? Math.round((book.previewTimeMs % beatLengthMs) * 100) / 100 : 0;
  return {
    bookKey: book.bookKey,
    baseBpm: safeBpm,
    firstBeatMs,
    previewTimeMs: book.previewTimeMs || 0,
    timingPoints: [
      {
        timeMs: firstBeatMs,
        beatLengthMs,
        bpm: safeBpm,
        meter: 4,
      },
    ],
    kiaiRanges: [],
    densityProfile: new Array<number>(72).fill(0),
    hasExactTiming: false,
  };
}

function applyPreservesPitch(el: HTMLAudioElement, locked: boolean): void {
  try {
    const anyEl = el as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    if ('preservesPitch' in anyEl) anyEl.preservesPitch = locked;
    if ('mozPreservesPitch' in anyEl) anyEl.mozPreservesPitch = locked;
    if ('webkitPreservesPitch' in anyEl) anyEl.webkitPreservesPitch = locked;
  } catch {
    // Ignore unsupported pitch setting
  }
}

interface MusicPlayerProviderProps {
  children: ReactNode;
  onNotify?: (msg: string) => void;
  onBeforeStartPlayback?: () => void;
}

export function MusicPlayerProvider({
  children,
  onNotify,
  onBeforeStartPlayback,
}: MusicPlayerProviderProps) {
  const [libraryBooks, setLibraryBooks] = useState<BookSummary[]>([]);
  const [libraryStats, setLibraryStats] = useState<BooksLibraryResponse['stats'] | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [likedKeys, setLikedKeys] = useState<string[]>(readStoredLiked);

  const [queue, setQueue] = useState<BookSummary[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [playbackRate, setPlaybackRateState] = useState<number>(() =>
    readStoredNumber('osu4k-music-rate', 1.0, 0.5, 2.0),
  );
  const [preservesPitch, setPreservesPitchState] = useState<boolean>(() =>
    readStoredBool('osu4k-music-pitch-lock', true),
  );
  const [volume, setVolumeState] = useState<number>(() =>
    readStoredNumber('osu4k-music-volume', 0.7, 0, 1),
  );
  const [muted, setMuted] = useState<boolean>(() => readStoredBool('osu4k-music-muted', false));
  const [loopMode, setLoopMode] = useState<MusicLoopMode>(() =>
    readStoredEnum('osu4k-music-loop', ['all', 'one', 'shuffle'] as const, 'all'),
  );
  const [visualizerMode, setVisualizerModeState] = useState<MusicVisualizerMode>(() =>
    readStoredEnum('osu4k-music-viz', ['bars', 'scope'] as const, 'bars'),
  );
  const [coverMode, setCoverModeState] = useState<MusicCoverMode>(() =>
    readStoredEnum('osu4k-music-cover', ['poster', 'disc'] as const, 'poster'),
  );
  const [rhythmFollow, setRhythmFollowState] = useState<MusicRhythmIntensity>(() =>
    readStoredEnum('osu4k-music-rhythm', ['off', 'subtle', 'standard', 'kinetic'] as const, 'standard'),
  );
  const [sleepTimer, setSleepTimer] = useState<SleepTimerState>(null);
  const [rhythmData, setRhythmData] = useState<BookRhythmData | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rhythmCacheRef = useRef<Map<string, BookRhythmData>>(new Map());
  const rhythmDataRef = useRef<BookRhythmData | null>(null);

  const queueRef = useRef<BookSummary[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const isPlayingRef = useRef<boolean>(false);
  const loopModeRef = useRef<MusicLoopMode>(loopMode);
  const playbackRateRef = useRef<number>(playbackRate);
  const preservesPitchRef = useRef<boolean>(preservesPitch);
  const sleepTimerRef = useRef<SleepTimerState>(sleepTimer);
  const consecutiveErrorsRef = useRef<number>(0);
  const lastTimeUpdateRef = useRef<number>(0);
  const libraryLoadedOnceRef = useRef<boolean>(false);

  const onNotifyRef = useRef(onNotify);
  const onBeforeStartRef = useRef(onBeforeStartPlayback);
  onNotifyRef.current = onNotify;
  onBeforeStartRef.current = onBeforeStartPlayback;

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    loopModeRef.current = loopMode;
  }, [loopMode]);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    preservesPitchRef.current = preservesPitch;
  }, [preservesPitch]);
  useEffect(() => {
    sleepTimerRef.current = sleepTimer;
  }, [sleepTimer]);

  const playableBooks = useMemo(
    () =>
      libraryBooks.filter(
        (b) => b.hasLocalAudio || (b.beatmapsetId !== null && b.beatmapsetId > 0),
      ),
    [libraryBooks],
  );

  const likedSet = useMemo(() => new Set(likedKeys), [likedKeys]);

  const currentTrack = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= queue.length) return null;
    return queue[currentIndex];
  }, [queue, currentIndex]);

  const refreshLibrary = useCallback(async (forceRefresh = false) => {
    setLoadingLibrary(true);
    setLibraryError(null);
    try {
      const res = await fetchLocalBooks(forceRefresh);
      libraryLoadedOnceRef.current = true;
      setLibraryBooks(res.books);
      setLibraryStats(res.stats);
      setQueue((prev) => {
        if (prev.length > 0) return prev;
        return res.books.filter(
          (b) => b.hasLocalAudio || (b.beatmapsetId !== null && b.beatmapsetId > 0),
        );
      });
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : '读取本地曲库失败');
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    try {
      const list = await fetchPlaylists();
      setPlaylists(list);
    } catch {
      // Non-fatal
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    void loadPlaylists();
    void refreshLibrary(false);
  }, [loadPlaylists, refreshLibrary]);

  const ensureAudioAnalyser = useCallback(() => {
    const el = audioRef.current;
    if (!el || typeof window === 'undefined') return;
    try {
      if (!audioContextRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.78;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioContextRef.current = ctx;
        mediaSourceRef.current = source;
        analyserRef.current = analyser;
      }
      if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume().catch(() => {});
      }
    } catch {
      // Safe fallback in environments restricting Web Audio
    }
  }, []);

  // Load rhythm metadata when active track changes
  useEffect(() => {
    if (!currentTrack) {
      rhythmDataRef.current = null;
      setRhythmData(null);
      return;
    }

    const key = currentTrack.bookKey;
    const cached = rhythmCacheRef.current.get(key);
    if (cached) {
      rhythmDataRef.current = cached;
      setRhythmData(cached);
      return;
    }

    const synthetic = createSyntheticRhythm(currentTrack);
    rhythmDataRef.current = synthetic;
    setRhythmData(synthetic);

    let cancelled = false;
    void fetchBookRhythm(key)
      .then((data) => {
        rhythmCacheRef.current.set(key, data);
        if (!cancelled) {
          rhythmDataRef.current = data;
          setRhythmData(data);
        }
      })
      .catch(() => {
        // Keep synthetic fallback
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.bookKey]);

  // Bind src and playback prefs on track change
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (!currentTrack) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      setCurrentTime(0);
      setDuration(0);
      setBuffering(false);
      setAudioError(null);
      return;
    }

    setAudioError(null);
    setCurrentTime(0);
    setDuration(0);
    setBuffering(true);
    el.src = currentTrack.audioUrl;
    el.volume = muted ? 0 : volume;
    el.playbackRate = playbackRateRef.current;
    applyPreservesPitch(el, preservesPitchRef.current);

    if (isPlayingRef.current) {
      ensureAudioAnalyser();
      void el.play().catch(() => {
        setBuffering(false);
      });
    } else {
      setBuffering(false);
    }
  }, [currentTrack?.bookKey, ensureAudioAnalyser]);

  // Apply play/pause state
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentTrack) return;
    if (isPlaying) {
      ensureAudioAnalyser();
      el.playbackRate = playbackRateRef.current;
      applyPreservesPitch(el, preservesPitchRef.current);
      void el.play().catch((err: unknown) => {
        if (err instanceof Error && err.name === 'NotAllowedError') {
          setIsPlaying(false);
        }
      });
    } else {
      el.pause();
    }
  }, [isPlaying, currentTrack, ensureAudioAnalyser]);

  // Apply volume & mute
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Apply playbackRate & pitch preservation
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    applyPreservesPitch(el, preservesPitch);
  }, [playbackRate, preservesPitch]);

  const advanceTrack = useCallback((direction: -1 | 1, autoStart = true) => {
    const q = queueRef.current;
    if (q.length === 0) return;

    let nextIdx = currentIndexRef.current;
    if (loopModeRef.current === 'shuffle' && q.length > 1) {
      let candidate = Math.floor(Math.random() * q.length);
      if (candidate === nextIdx) {
        candidate = (nextIdx + 1) % q.length;
      }
      nextIdx = candidate;
    } else {
      if (nextIdx < 0) nextIdx = 0;
      else nextIdx = (nextIdx + direction + q.length) % q.length;
    }

    setCurrentIndex(nextIdx);
    if (autoStart) {
      onBeforeStartRef.current?.();
      setIsPlaying(true);
    }
  }, []);

  const nextTrack = useCallback(() => {
    consecutiveErrorsRef.current = 0;
    advanceTrack(1, true);
  }, [advanceTrack]);

  const prevTrack = useCallback(() => {
    consecutiveErrorsRef.current = 0;
    const el = audioRef.current;
    if (el && el.currentTime > 3.5) {
      el.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    advanceTrack(-1, true);
  }, [advanceTrack]);

  const togglePlay = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) {
      onNotifyRef.current?.('当前没有可播放的本地曲目');
      return;
    }
    if (currentIndexRef.current < 0 || currentIndexRef.current >= q.length) {
      onBeforeStartRef.current?.();
      setCurrentIndex(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        onBeforeStartRef.current?.();
        ensureAudioAnalyser();
      }
      return next;
    });
  }, [ensureAudioAnalyser]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const stopAndClear = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setSleepTimer(null);
  }, []);

  const playTrack = useCallback((book: BookSummary, nextQueue?: BookSummary[]) => {
    consecutiveErrorsRef.current = 0;
    onBeforeStartRef.current?.();
    if (nextQueue && nextQueue.length > 0) {
      const idx = nextQueue.findIndex((b) => b.bookKey === book.bookKey);
      if (idx >= 0) {
        setQueue(nextQueue);
        setCurrentIndex(idx);
      } else {
        const merged = [book, ...nextQueue];
        setQueue(merged);
        setCurrentIndex(0);
      }
    } else {
      const curQ = queueRef.current;
      const idx = curQ.findIndex((b) => b.bookKey === book.bookKey);
      if (idx >= 0) {
        setCurrentIndex(idx);
      } else {
        setQueue([book, ...curQ]);
        setCurrentIndex(0);
      }
    }
    setIsPlaying(true);
  }, []);

  const playQueueIndex = useCallback((index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    consecutiveErrorsRef.current = 0;
    onBeforeStartRef.current?.();
    setCurrentIndex(index);
    setIsPlaying(true);
  }, []);

  const setQueueAndPlay = useCallback((books: BookSummary[], startIndex = 0) => {
    if (books.length === 0) {
      onNotifyRef.current?.('列表中没有可播放曲目');
      return;
    }
    consecutiveErrorsRef.current = 0;
    onBeforeStartRef.current?.();
    const clamped = Math.min(books.length - 1, Math.max(0, startIndex));
    setQueue(books);
    setCurrentIndex(clamped);
    setIsPlaying(true);
  }, []);

  const enqueueTrackNext = useCallback((book: BookSummary) => {
    setQueue((prev) => {
      const curIdx = currentIndexRef.current;
      if (prev.length === 0 || curIdx < 0) {
        return [book, ...prev.filter((b) => b.bookKey !== book.bookKey)];
      }
      const currentKey = prev[curIdx]?.bookKey;
      if (currentKey === book.bookKey) return prev;
      const filtered = prev.filter((b) => b.bookKey !== book.bookKey);
      const newCurIdx = filtered.findIndex((b) => b.bookKey === currentKey);
      const insertAt = newCurIdx >= 0 ? newCurIdx + 1 : 0;
      const next = [...filtered];
      next.splice(insertAt, 0, book);
      if (newCurIdx >= 0 && newCurIdx !== curIdx) {
        setCurrentIndex(newCurIdx);
      }
      return next;
    });
    onNotifyRef.current?.(`已添加到下一首播放：${book.titleUnicode || book.title}`);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev.filter((_, i) => i !== index);
      const cur = currentIndexRef.current;
      if (next.length === 0) {
        setCurrentIndex(-1);
        setIsPlaying(false);
      } else if (index < cur) {
        setCurrentIndex(cur - 1);
      } else if (index === cur) {
        const clamped = Math.min(index, next.length - 1);
        setCurrentIndex(clamped);
      }
      return next;
    });
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const maxD = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : seconds;
    const target = Math.min(maxD, Math.max(0, seconds));
    el.currentTime = target;
    setCurrentTime(target);
  }, []);

  const seekRelative = useCallback((deltaSeconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const maxD = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    const target = Math.min(maxD, Math.max(0, el.currentTime + deltaSeconds));
    el.currentTime = target;
    setCurrentTime(target);
  }, []);

  const cycleLoopMode = useCallback(() => {
    setLoopMode((prev) => {
      const next: MusicLoopMode = prev === 'all' ? 'one' : prev === 'one' ? 'shuffle' : 'all';
      try {
        localStorage.setItem('osu4k-music-loop', next);
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const rounded = Math.round(Math.min(2.0, Math.max(0.5, rate)) * 100) / 100;
    setPlaybackRateState(rounded);
    try {
      localStorage.setItem('osu4k-music-rate', String(rounded));
    } catch {
      // Ignore storage error
    }
  }, []);

  const setPreservesPitch = useCallback((locked: boolean) => {
    setPreservesPitchState(locked);
    try {
      localStorage.setItem('osu4k-music-pitch-lock', String(locked));
    } catch {
      // Ignore storage error
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.round(Math.min(1, Math.max(0, vol)) * 100) / 100;
    setMuted(false);
    setVolumeState(clamped);
    try {
      localStorage.setItem('osu4k-music-muted', 'false');
      localStorage.setItem('osu4k-music-volume', String(clamped));
    } catch {
      // Ignore storage error
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('osu4k-music-muted', String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  const setVisualizerMode = useCallback((mode: MusicVisualizerMode) => {
    setVisualizerModeState(mode);
    try {
      localStorage.setItem('osu4k-music-viz', mode);
    } catch {
      // Ignore storage error
    }
  }, []);

  const setCoverMode = useCallback((mode: MusicCoverMode) => {
    setCoverModeState(mode);
    try {
      localStorage.setItem('osu4k-music-cover', mode);
    } catch {
      // Ignore storage error
    }
  }, []);

  const setRhythmFollow = useCallback((level: MusicRhythmIntensity) => {
    setRhythmFollowState(level);
    try {
      localStorage.setItem('osu4k-music-rhythm', level);
    } catch {
      // Ignore storage error
    }
  }, []);

  const toggleLike = useCallback((bookKey: string) => {
    setLikedKeys((prev) => {
      const exists = prev.includes(bookKey);
      const next = exists ? prev.filter((k) => k !== bookKey) : [bookKey, ...prev];
      try {
        localStorage.setItem('osu4k-music-liked', JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  }, []);

  // Playlist CRUD
  const createNewPlaylist = useCallback(
    async (input: { name: string; description?: string; bookKeys?: string[] }) => {
      try {
        const created = await apiCreatePlaylist(input);
        setPlaylists((prev) => [created, ...prev]);
        onNotifyRef.current?.(`已创建歌单「${created.name}」`);
        return created;
      } catch (err) {
        onNotifyRef.current?.(err instanceof Error ? err.message : '创建歌单失败');
        return null;
      }
    },
    [],
  );

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const updated = await apiUpdatePlaylist(id, { name: clean });
      setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      onNotifyRef.current?.(err instanceof Error ? err.message : '重命名歌单失败');
    }
  }, []);

  const togglePinPlaylist = useCallback(async (id: string) => {
    const target = playlists.find((p) => p.id === id);
    if (!target) return;
    try {
      const updated = await apiUpdatePlaylist(id, { pinned: !target.pinned });
      setPlaylists((prev) =>
        prev
          .map((p) => (p.id === id ? updated : p))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
      );
    } catch {
      // Ignore
    }
  }, [playlists]);

  const setPlaylistBooks = useCallback(async (playlistId: string, bookKeys: string[]) => {
    try {
      const updated = await apiUpdatePlaylist(playlistId, { bookKeys });
      setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));
    } catch (err) {
      onNotifyRef.current?.(err instanceof Error ? err.message : '更新歌单曲目失败');
    }
  }, []);

  const addBookToPlaylist = useCallback(
    async (playlistId: string, bookKey: string) => {
      const target = playlists.find((p) => p.id === playlistId);
      if (!target) return;
      if (target.bookKeys.includes(bookKey)) {
        onNotifyRef.current?.(`该曲目已在歌单「${target.name}」中`);
        return;
      }
      const nextKeys = [...target.bookKeys, bookKey];
      await setPlaylistBooks(playlistId, nextKeys);
      onNotifyRef.current?.(`已加入歌单「${target.name}」`);
    },
    [playlists, setPlaylistBooks],
  );

  const removeBookFromPlaylist = useCallback(
    async (playlistId: string, bookKey: string) => {
      const target = playlists.find((p) => p.id === playlistId);
      if (!target) return;
      const nextKeys = target.bookKeys.filter((k) => k !== bookKey);
      await setPlaylistBooks(playlistId, nextKeys);
    },
    [playlists, setPlaylistBooks],
  );

  const reorderPlaylistTrack = useCallback(
    async (playlistId: string, fromIdx: number, toIdx: number) => {
      const target = playlists.find((p) => p.id === playlistId);
      if (!target) return;
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= target.bookKeys.length ||
        toIdx >= target.bookKeys.length ||
        fromIdx === toIdx
      ) {
        return;
      }
      const nextKeys = [...target.bookKeys];
      const [moved] = nextKeys.splice(fromIdx, 1);
      nextKeys.splice(toIdx, 0, moved);
      await setPlaylistBooks(playlistId, nextKeys);
    },
    [playlists, setPlaylistBooks],
  );

  const removePlaylist = useCallback(async (id: string) => {
    try {
      await apiDeletePlaylist(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      onNotifyRef.current?.('歌单已删除');
    } catch (err) {
      onNotifyRef.current?.(err instanceof Error ? err.message : '删除歌单失败');
    }
  }, []);

  // Sleep Timer countdown
  const startSleepTimerMinutes = useCallback((minutes: number) => {
    const endsAt = Date.now() + Math.max(1, minutes) * 60_000;
    setSleepTimer({ mode: 'minutes', endsAt, remainingSec: Math.max(60, Math.round(minutes * 60)) });
    onNotifyRef.current?.(`已开启定时关闭：${minutes} 分钟后暂停播放`);
  }, []);

  const startSleepTimerTrackEnd = useCallback(() => {
    setSleepTimer({ mode: 'track_end', endsAt: null, remainingSec: 0 });
    onNotifyRef.current?.('已设置：当前曲目播放完毕后暂停');
  }, []);

  const cancelSleepTimer = useCallback(() => {
    setSleepTimer(null);
  }, []);

  useEffect(() => {
    if (!sleepTimer || sleepTimer.mode !== 'minutes') return;
    const timer = window.setInterval(() => {
      const leftMs = sleepTimer.endsAt - Date.now();
      if (leftMs <= 0) {
        setSleepTimer(null);
        setIsPlaying(false);
        onNotifyRef.current?.('定时关闭已触发，已暂停音乐播放');
      } else {
        setSleepTimer((prev) =>
          prev && prev.mode === 'minutes'
            ? { ...prev, remainingSec: Math.ceil(leftMs / 1000) }
            : prev,
        );
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimer?.mode, sleepTimer?.endsAt]);

  // OS MediaSession integration (Windows SMTC & hardware media keys)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!currentTrack) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }

    if (typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title: currentTrack.titleUnicode || currentTrack.title,
        artist: currentTrack.artistUnicode || currentTrack.artist,
        album: `OSU!Manager! · ${currentTrack.creator}`,
        artwork: [
          {
            src: `${window.location.origin}${currentTrack.coverUrl}`,
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ],
      });
    }
    ms.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const bind = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported MediaSession action
      }
    };
    bind('play', () => {
      onBeforeStartRef.current?.();
      setIsPlaying(true);
    });
    bind('pause', () => setIsPlaying(false));
    bind('previoustrack', () => prevTrack());
    bind('nexttrack', () => nextTrack());
    bind('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        seek(details.seekTime);
      }
    });
    return () => {
      bind('play', null);
      bind('pause', null);
      bind('previoustrack', null);
      bind('nexttrack', null);
      bind('seekto', null);
    };
  }, [nextTrack, prevTrack, seek]);

  // Electron tray music commands
  useEffect(() => {
    const unsub = window.electronAPI?.onMusicCommand?.((cmd) => {
      if (cmd === 'toggle') togglePlay();
      else if (cmd === 'prev') prevTrack();
      else if (cmd === 'next') nextTrack();
    });
    return () => unsub?.();
  }, [togglePlay, prevTrack, nextTrack]);

  const controlValue = useMemo<MusicPlayerContextValue>(
    () => ({
      libraryBooks,
      playableBooks,
      libraryStats,
      loadingLibrary,
      libraryError,
      refreshLibrary,

      playlists,
      loadingPlaylists,
      createNewPlaylist,
      renamePlaylist,
      togglePinPlaylist,
      addBookToPlaylist,
      removeBookFromPlaylist,
      reorderPlaylistTrack,
      setPlaylistBooks,
      removePlaylist,

      likedKeys,
      likedSet,
      toggleLike,

      queue,
      currentIndex,
      currentTrack,
      isPlaying,
      buffering,
      audioError,

      playbackRate,
      preservesPitch,
      volume,
      muted,
      loopMode,

      visualizerMode,
      coverMode,
      rhythmFollow,
      sleepTimer,

      rhythmData,
      audioRef,
      analyserRef,
      audioContextRef,
      rhythmDataRef,

      playTrack,
      playQueueIndex,
      setQueueAndPlay,
      enqueueTrackNext,
      removeFromQueue,
      togglePlay,
      pause,
      stopAndClear,
      nextTrack,
      prevTrack,
      cycleLoopMode,

      setPlaybackRate,
      setPreservesPitch,
      setVolume,
      toggleMute,

      setVisualizerMode,
      setCoverMode,
      setRhythmFollow,

      startSleepTimerMinutes,
      startSleepTimerTrackEnd,
      cancelSleepTimer,
    }),
    [
      libraryBooks,
      playableBooks,
      libraryStats,
      loadingLibrary,
      libraryError,
      refreshLibrary,
      playlists,
      loadingPlaylists,
      createNewPlaylist,
      renamePlaylist,
      togglePinPlaylist,
      addBookToPlaylist,
      removeBookFromPlaylist,
      reorderPlaylistTrack,
      setPlaylistBooks,
      removePlaylist,
      likedKeys,
      likedSet,
      toggleLike,
      queue,
      currentIndex,
      currentTrack,
      isPlaying,
      buffering,
      audioError,
      playbackRate,
      preservesPitch,
      volume,
      muted,
      loopMode,
      visualizerMode,
      coverMode,
      rhythmFollow,
      sleepTimer,
      rhythmData,
      playTrack,
      playQueueIndex,
      setQueueAndPlay,
      enqueueTrackNext,
      removeFromQueue,
      togglePlay,
      pause,
      stopAndClear,
      nextTrack,
      prevTrack,
      cycleLoopMode,
      setPlaybackRate,
      setPreservesPitch,
      setVolume,
      toggleMute,
      setVisualizerMode,
      setCoverMode,
      setRhythmFollow,
      startSleepTimerMinutes,
      startSleepTimerTrackEnd,
      cancelSleepTimer,
    ],
  );

  const timeValue = useMemo<MusicTimeContextValue>(
    () => ({
      currentTime,
      duration,
      seek,
      seekRelative,
    }),
    [currentTime, duration, seek, seekRelative],
  );

  return (
    <MusicControlContext.Provider value={controlValue}>
      <MusicTimeContext.Provider value={timeValue}>
        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          preload="auto"
          className="hidden"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            el.playbackRate = playbackRateRef.current;
            applyPreservesPitch(el, preservesPitchRef.current);
            setDuration(Number.isFinite(el.duration) ? el.duration : 0);
            setBuffering(false);
            consecutiveErrorsRef.current = 0;
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) {
              setDuration(d);
            }
          }}
          onCanPlay={(e) => {
            const el = e.currentTarget;
            el.playbackRate = playbackRateRef.current;
            applyPreservesPitch(el, preservesPitchRef.current);
            setBuffering(false);
            consecutiveErrorsRef.current = 0;
          }}
          onPlay={(e) => {
            const el = e.currentTarget;
            el.playbackRate = playbackRateRef.current;
            applyPreservesPitch(el, preservesPitchRef.current);
          }}
          onTimeUpdate={(e) => {
            const now = performance.now();
            if (now - lastTimeUpdateRef.current < 220) return;
            lastTimeUpdateRef.current = now;
            setCurrentTime(e.currentTarget.currentTime);
          }}
          onEnded={() => {
            const st = sleepTimerRef.current;
            if (st?.mode === 'track_end') {
              setSleepTimer(null);
              setIsPlaying(false);
              onNotifyRef.current?.('定时关闭已触发，本曲已播放完毕');
              return;
            }
            if (loopModeRef.current === 'one') {
              const el = audioRef.current;
              if (el) {
                el.currentTime = 0;
                el.playbackRate = playbackRateRef.current;
                applyPreservesPitch(el, preservesPitchRef.current);
                void el.play().catch(() => {});
              }
              return;
            }
            advanceTrack(1, true);
          }}
          onError={() => {
            setBuffering(false);
            const cur = queueRef.current[currentIndexRef.current];
            const label = cur ? cur.titleUnicode || cur.title : '当前曲目';
            setAudioError(`音源不可用: ${label}`);
            if (!isPlayingRef.current) return;
            consecutiveErrorsRef.current += 1;
            const maxSkip = Math.min(5, Math.max(1, queueRef.current.length));
            if (consecutiveErrorsRef.current < maxSkip && queueRef.current.length > 1) {
              onNotifyRef.current?.(`音源加载失败，自动跳至下一首（${label}）`);
              advanceTrack(1, true);
            } else {
              setIsPlaying(false);
              onNotifyRef.current?.(`无法播放连续曲目音源，已暂停（${label}）`);
            }
          }}
        />
        {children}
      </MusicTimeContext.Provider>
    </MusicControlContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicControlContext);
  if (!ctx) throw new Error('useMusicPlayer must be used inside MusicPlayerProvider');
  return ctx;
}

export function useMusicTime(): MusicTimeContextValue {
  const ctx = useContext(MusicTimeContext);
  if (!ctx) throw new Error('useMusicTime must be used inside MusicPlayerProvider');
  return ctx;
}
