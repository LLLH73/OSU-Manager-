import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Disc3,
  Gamepad2,
  ImageOff,
  Loader2,
  LocateFixed,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  fetchParsedManiaChart,
  fetchPreviewBeatmapset,
  fetchResolvedManiaSkin,
  fetchSkinsList,
} from '../api';
import { formatDuration } from '../constants';
import { useI18n } from '../i18n';
import {
  AppConfig,
  ParsedManiaChart,
  PreviewBeatmapsetResponse,
  ResolvedManiaSkin,
  SkinsListResponse,
} from '../types';
import {
  buildScrollTimeline,
  getScrollTimeMs,
  loadSkinTextures,
  renderManiaMinimap,
  renderManiaPlayfield,
  SkinAnimator,
} from '../utils/maniaEngine';
import { SelectField } from './SelectField';

interface ManiaPreviewModalProps {
  beatmapsetId: number | null;
  initialBeatmapId?: number | null;
  titleHint?: string;
  config: AppConfig | null;
  canLoadIntoGame?: boolean;
  onLoadIntoGame?: (beatmapsetId: number) => void;
  onUpdatePreviewPrefs?: (patch: { previewSkinId?: string; previewScrollSpeed?: number }) => void;
  onClose: () => void;
}

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const ZOOM_PX_PER_SEC: Record<1 | 2 | 4, number> = {
  1: 22,
  2: 46,
  4: 92,
};

function formatTimePrecise(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = clamped / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${mins}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function ManiaPreviewModal({
  beatmapsetId,
  initialBeatmapId = null,
  titleHint,
  config,
  canLoadIntoGame = false,
  onLoadIntoGame,
  onUpdatePreviewPrefs,
  onClose,
}: ManiaPreviewModalProps) {
  const { t } = useI18n();
  const [setMeta, setSetMeta] = useState<PreviewBeatmapsetResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [chart, setChart] = useState<ParsedManiaChart | null>(null);
  const [skinsResp, setSkinsResp] = useState<SkinsListResponse | null>(null);
  const [selectedSkinId, setSelectedSkinId] = useState<string>(
    config?.previewSkinId || '__builtin_bar__',
  );
  const [skin, setSkin] = useState<ResolvedManiaSkin | null>(null);
  const [textures, setTextures] = useState<Map<string, HTMLImageElement>>(() => new Map());
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  const [loadingSet, setLoadingSet] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Playback & View Controls
  const [playing, setPlaying] = useState(false);
  const [displayTimeMs, setDisplayTimeMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [scrollSpeed, setScrollSpeed] = useState<number>(config?.previewScrollSpeed ?? 28);
  const [respectSv, setRespectSv] = useState(true);
  const [upsideDownOverride, setUpsideDownOverride] = useState<'skin' | 'down' | 'up'>('skin');
  const [showBarlines, setShowBarlines] = useState(true);
  const [showKeyLight, setShowKeyLight] = useState(true);
  const [bgDim, setBgDim] = useState(0.76);
  const [volume, setVolume] = useState(0.65);
  const [muted, setMuted] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [stageBox, setStageBox] = useState<{ w: number; h: number }>({ w: 640, h: 360 });

  // Minimap state
  const [minimapZoom, setMinimapZoom] = useState<1 | 2 | 4>(2);
  const [autoFollow, setAutoFollow] = useState(true);
  const [userDetached, setUserDetached] = useState(false);
  const [minimapViewportH, setMinimapViewportH] = useState(460);

  // Progress bar hover
  const [hoverProgress, setHoverProgress] = useState<{ pct: number; timeMs: number } | null>(null);

  // Mutable high-frequency clock refs for smooth 60/144fps rAF without React thrash
  const currentTimeRef = useRef(0);
  const animElapsedMsRef = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const lastFramePerfRef = useRef(0);
  const lastUiSyncPerfRef = useRef(0);
  const scrubbingProgressRef = useRef(false);
  const scrubbingMinimapRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animatorRef = useRef<SkinAnimator | null>(null);
  const playfieldWrapRef = useRef<HTMLDivElement | null>(null);
  const playfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapScrollRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const playfieldSizeRef = useRef({ w: 640, h: 360 });
  const minimapSizeRef = useRef({ w: 180, h: 460 });

  playingRef.current = playing;
  rateRef.current = playbackRate;

  // Reset and load beatmapset + skins when beatmapsetId opens/changes
  useEffect(() => {
    if (!beatmapsetId) return;
    let disposed = false;
    setSetMeta(null);
    setChart(null);
    setErrorMsg(null);
    setPlaying(false);
    currentTimeRef.current = 0;
    setDisplayTimeMs(0);
    setLoadingSet(true);

    void (async () => {
      try {
        const [meta, skins] = await Promise.all([
          fetchPreviewBeatmapset(beatmapsetId),
          fetchSkinsList(),
        ]);
        if (disposed) return;
        setSetMeta(meta);
        setSkinsResp(skins);

        // Pick default skin
        const availableIds = new Set(skins.skins.map((s) => s.id));
        if (config?.previewSkinId && availableIds.has(config.previewSkinId)) {
          setSelectedSkinId(config.previewSkinId);
        } else if (skins.activeStableSkin && availableIds.has(skins.activeStableSkin)) {
          setSelectedSkinId(skins.activeStableSkin);
        } else {
          setSelectedSkinId('__builtin_bar__');
        }

        // Pick initial scroll speed
        if (!config?.previewScrollSpeed && skins.stableManiaSpeed) {
          setScrollSpeed(Math.min(40, Math.max(1, skins.stableManiaSpeed)));
        }

        // Pick initial difficulty matching initialBeatmapId
        let initIdx = 0;
        if (initialBeatmapId) {
          const found = meta.difficulties.find((d) => d.beatmapId === initialBeatmapId);
          if (found) initIdx = found.index;
        }
        setSelectedIndex(initIdx);
      } catch (err) {
        if (!disposed) {
          setErrorMsg(err instanceof Error ? err.message : t('加载本地谱面预览失败', 'Failed to load local chart preview'));
        }
      } finally {
        if (!disposed) setLoadingSet(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [beatmapsetId, initialBeatmapId]);

  // Fetch parsed chart when setMeta / selectedIndex changes
  useEffect(() => {
    if (!beatmapsetId || !setMeta) return;
    let disposed = false;
    setLoadingChart(true);
    setPlaying(false);
    currentTimeRef.current = 0;
    setDisplayTimeMs(0);
    setUserDetached(false);

    void (async () => {
      try {
        const parsed = await fetchParsedManiaChart(beatmapsetId, selectedIndex);
        if (disposed) return;
        setChart(parsed);
        setErrorMsg(null);
      } catch (err) {
        if (!disposed) {
          setErrorMsg(err instanceof Error ? err.message : t('解析 Mania 谱面失败', 'Failed to parse Mania chart'));
        }
      } finally {
        if (!disposed) setLoadingChart(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [beatmapsetId, setMeta, selectedIndex]);

  // Load background image for chart
  useEffect(() => {
    if (!chart?.backgroundUrl) {
      setBgImage(null);
      return;
    }
    let disposed = false;
    const img = new Image();
    img.onload = () => {
      if (!disposed) setBgImage(img);
    };
    img.onerror = () => {
      if (!disposed) setBgImage(null);
    };
    img.src = chart.backgroundUrl;
    return () => {
      disposed = true;
    };
  }, [chart?.backgroundUrl]);

  // Load resolved skin & textures when skinId or keyCount changes
  useEffect(() => {
    if (!chart) return;
    let disposed = false;
    animElapsedMsRef.current = 0;
    animatorRef.current?.dispose();
    const animator = new SkinAnimator();
    animatorRef.current = animator;
    void (async () => {
      try {
        const resolved = await fetchResolvedManiaSkin(selectedSkinId, chart.keyCount);
        if (disposed) return;
        setSkin(resolved);
        const texMap = await loadSkinTextures(resolved);
        if (!disposed) setTextures(texMap);
      } catch {
        // Keep fallback
      }
    })();
    return () => {
      disposed = true;
      animator.dispose();
      if (animatorRef.current === animator) {
        animatorRef.current = null;
      }
    };
  }, [selectedSkinId, chart?.keyCount]);

  // Sync audio volume & playback rate
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.playbackRate = playbackRate;
  }, [volume, muted, playbackRate, chart?.audioUrl]);

  // Build scroll timeline once per chart
  const timeline = useMemo(() => {
    if (!chart) return null;
    return buildScrollTimeline(chart.timingPoints, chart.baseBpm, chart.notes);
  }, [chart]);

  const seekTo = useCallback(
    (targetMs: number) => {
      if (!chart) return;
      const clamped = Math.min(chart.totalLengthMs, Math.max(0, targetMs));
      currentTimeRef.current = clamped;
      setDisplayTimeMs(clamped);
      const audio = audioRef.current;
      if (chart.hasFullAudio && chart.audioUrl && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        const sec = Math.min(audio.duration - 0.05, Math.max(0, clamped / 1000));
        try {
          audio.currentTime = sec;
        } catch {
          // Ignore seek errors before metadata loads
        }
      }
    },
    [chart],
  );

  const togglePlay = useCallback(() => {
    if (!chart) return;
    setPlaying((prev) => {
      const next = !prev;
      const audio = audioRef.current;
      if (next) {
        if (currentTimeRef.current >= chart.totalLengthMs - 150) {
          currentTimeRef.current = 0;
          setDisplayTimeMs(0);
          if (audio) audio.currentTime = 0;
        }
        lastFramePerfRef.current = performance.now();
        if (audio && chart.hasFullAudio && chart.audioUrl) {
          audio.playbackRate = rateRef.current;
          void audio.play().catch(() => {
            // Audio unavailable or blocked; fallback software clock still runs smoothly
          });
        }
      } else {
        audio?.pause();
      }
      return next;
    });
  }, [chart]);

  // Pause audio cleanly if modal closes
  useEffect(() => {
    if (!beatmapsetId) {
      audioRef.current?.pause();
      setPlaying(false);
      animElapsedMsRef.current = 0;
    }
  }, [beatmapsetId]);

  // ResizeObserver for strict 16:9 playfield canvas & minimap canvas
  useEffect(() => {
    if (!beatmapsetId) return;
    const pfWrap = playfieldWrapRef.current;
    const mmWrap = minimapScrollRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (entry.target === pfWrap && width > 20 && height > 20) {
          const availW = Math.max(320, width - 16);
          const availH = Math.max(180, height - 16);
          let boxW = availW;
          let boxH = Math.round((boxW * 9) / 16);
          if (boxH > availH) {
            boxH = availH;
            boxW = Math.round((boxH * 16) / 9);
          }
          playfieldSizeRef.current = { w: boxW, h: boxH };
          setStageBox((prev) => (prev.w === boxW && prev.h === boxH ? prev : { w: boxW, h: boxH }));
        } else if (entry.target === mmWrap && width > 20 && height > 20) {
          minimapSizeRef.current = { w: Math.round(width), h: Math.round(height) };
          setMinimapViewportH(Math.round(height));
        }
      }
    });
    if (pfWrap) ro.observe(pfWrap);
    if (mmWrap) ro.observe(mmWrap);
    return () => ro.disconnect();
  }, [beatmapsetId, chart?.index]);

  const totalMinimapHeight = useMemo(() => {
    if (!chart) return minimapViewportH;
    const pxPerSec = ZOOM_PX_PER_SEC[minimapZoom];
    return Math.max(minimapViewportH, Math.round((chart.totalLengthMs / 1000) * pxPerSec));
  }, [chart, minimapZoom, minimapViewportH]);

  // Main 60/144fps Animation + Playfield + Minimap Render Loop
  useEffect(() => {
    if (!beatmapsetId || !chart || !timeline || !skin) return;
    let rafId = 0;

    const frame = (now: number) => {
      if (playingRef.current) {
        const dt = lastFramePerfRef.current ? Math.min(80, now - lastFramePerfRef.current) : 0;
        lastFramePerfRef.current = now;
        animElapsedMsRef.current += dt;
        let nextTime = currentTimeRef.current + dt * rateRef.current;

        const audio = audioRef.current;
        if (
          chart.hasFullAudio &&
          audio &&
          !audio.paused &&
          Number.isFinite(audio.currentTime) &&
          audio.duration > 0
        ) {
          const audioMs = audio.currentTime * 1000;
          if (Math.abs(audioMs - nextTime) > 35) {
            nextTime = audioMs;
          }
        }

        if (nextTime >= chart.totalLengthMs) {
          nextTime = chart.totalLengthMs;
          playingRef.current = false;
          setPlaying(false);
          audio?.pause();
        }
        currentTimeRef.current = nextTime;
      } else {
        lastFramePerfRef.current = now;
      }

      if (now - lastUiSyncPerfRef.current >= 48) {
        lastUiSyncPerfRef.current = now;
        setDisplayTimeMs(currentTimeRef.current);
      }

      // Sync minimap scroll when auto-following
      const mmScroller = minimapScrollRef.current;
      if (mmScroller && autoFollow && !userDetached && !scrubbingMinimapRef.current) {
        const maxScroll = Math.max(0, totalMinimapHeight - minimapSizeRef.current.h);
        if (maxScroll > 0) {
          const targetY =
            (currentTimeRef.current / chart.totalLengthMs) * totalMinimapHeight -
            minimapSizeRef.current.h * 0.35;
          const clampedScroll = Math.min(maxScroll, Math.max(0, targetY));
          if (Math.abs(mmScroller.scrollTop - clampedScroll) > 1) {
            programmaticScrollRef.current = true;
            mmScroller.scrollTop = clampedScroll;
          }
        }
      }

      // Render Center Playfield Canvas
      const pfCanvas = playfieldCanvasRef.current;
      if (pfCanvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const { w, h } = playfieldSizeRef.current;
        const targetW = Math.round(w * dpr);
        const targetH = Math.round(h * dpr);
        if (pfCanvas.width !== targetW || pfCanvas.height !== targetH) {
          pfCanvas.width = targetW;
          pfCanvas.height = targetH;
        }
        const ctx = pfCanvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderManiaPlayfield(ctx, w, h, {
            chart,
            timeline,
            skin,
            textures,
            animator: animatorRef.current,
            bgImage,
            currentTimeMs: currentTimeRef.current,
            animNowMs: animElapsedMsRef.current,
            scrollSpeed,
            respectSv,
            upsideDownOverride,
            showBarlines,
            showKeyLight,
            bgDim,
            stageScale,
          });
        }
      }

      // Render Right Sticky Minimap Canvas (only visible time slice)
      const mmCanvas = minimapCanvasRef.current;
      if (mmCanvas && mmScroller) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const { w, h } = minimapSizeRef.current;
        const targetW = Math.round(w * dpr);
        const targetH = Math.round(h * dpr);
        if (mmCanvas.width !== targetW || mmCanvas.height !== targetH) {
          mmCanvas.width = targetW;
          mmCanvas.height = targetH;
        }
        const ctx = mmCanvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const scrollTop = mmScroller.scrollTop;
          const spanTotal = Math.max(1, totalMinimapHeight);
          const viewStartMs = (scrollTop / spanTotal) * chart.totalLengthMs;
          const viewEndMs = ((scrollTop + h) / spanTotal) * chart.totalLengthMs;
          renderManiaMinimap(ctx, w, h, {
            chart,
            currentTimeMs: currentTimeRef.current,
            viewStartMs,
            viewEndMs,
            scrollSpeed,
            hitPosition: skin.hitPosition,
          });
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [
    beatmapsetId,
    chart,
    timeline,
    skin,
    textures,
    bgImage,
    scrollSpeed,
    respectSv,
    upsideDownOverride,
    showBarlines,
    showKeyLight,
    bgDim,
    stageScale,
    autoFollow,
    userDetached,
    totalMinimapHeight,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!beatmapsetId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        if (e.key === 'Escape') {
          onClose();
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(currentTimeRef.current - 3000);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(currentTimeRef.current + 3000);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setScrollSpeed((s) => {
          const next = Math.min(40, s + 1);
          onUpdatePreviewPrefs?.({ previewScrollSpeed: next });
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setScrollSpeed((s) => {
          const next = Math.max(1, s - 1);
          onUpdatePreviewPrefs?.({ previewScrollSpeed: next });
          return next;
        });
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        seekTo(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [beatmapsetId, togglePlay, seekTo, onClose, onUpdatePreviewPrefs]);

  // Progress bar scrubbing handlers
  const scrubProgressFromClientX = useCallback(
    (clientX: number) => {
      const bar = progressBarRef.current;
      if (!bar || !chart) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      seekTo(pct * chart.totalLengthMs);
    },
    [chart, seekTo],
  );

  // Minimap click/drag seek handlers
  const seekMinimapFromClientY = useCallback(
    (clientY: number) => {
      const canvas = minimapCanvasRef.current;
      const scroller = minimapScrollRef.current;
      if (!canvas || !scroller || !chart) return;
      const rect = canvas.getBoundingClientRect();
      const relY = Math.min(rect.height, Math.max(0, clientY - rect.top));
      const spanTotal = Math.max(1, totalMinimapHeight);
      const scrollTop = scroller.scrollTop;
      const viewStartMs = (scrollTop / spanTotal) * chart.totalLengthMs;
      const viewEndMs = ((scrollTop + rect.height) / spanTotal) * chart.totalLengthMs;
      const targetMs = viewStartMs + (relY / Math.max(1, rect.height)) * (viewEndMs - viewStartMs);
      seekTo(targetMs);
    },
    [chart, totalMinimapHeight, seekTo],
  );

  if (!beatmapsetId) return null;

  const activeSkins = skinsResp?.skins.filter((s) => s.isActiveInStable) ?? [];
  const builtinSkins = skinsResp?.skins.filter((s) => s.source === 'builtin') ?? [];
  const localSkins = skinsResp?.skins.filter((s) => s.source === 'local' && !s.isActiveInStable) ?? [];

  const scrollTimeMs = Math.round(getScrollTimeMs(scrollSpeed, skin?.hitPosition ?? 402));
  const progressPct =
    chart && chart.totalLengthMs > 0
      ? Math.min(100, Math.max(0, (displayTimeMs / chart.totalLengthMs) * 100))
      : 0;
  const maxDensity = chart
    ? Math.max(1, ...chart.densityBins)
    : 1;

  return (
    <div className="modal-backdrop flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Mania 谱面预览', 'Mania Chart Preview')}
        onClick={(e) => e.stopPropagation()}
        className="modal-surface flex h-[92vh] w-[96vw] max-w-[1440px] select-none flex-col overflow-hidden"
      >
        {/* Top Bar */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface-1/80 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-osu text-white">
              <Disc3 className={`h-4 w-4 ${playing ? 'animate-spin' : ''}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display truncate text-[0.9375rem] font-bold text-ink">
                  {setMeta?.title || titleHint || `Beatmapset #${beatmapsetId}`}
                </h2>
                {chart && (
                  <span className="chip font-stat shrink-0 border-osu/40 bg-osu/12 text-osu-soft">
                    Mania {chart.keyCount}K
                  </span>
                )}
                {chart && !chart.hasFullAudio && (
                  <span
                    className="chip shrink-0 border-hairline bg-surface-2 text-[0.6875rem] text-ink-3"
                    title={t(
                      '本地未找到完整音频文件，已切换为静音时间轴演示（可完整播放全曲与拖动进度）',
                      'Full audio file not found locally — running in silent timeline mode (full playback & scrubbing still available)',
                    )}
                  >
                    {t('静音时间轴 · 16:9', 'Silent Timeline · 16:9')}
                  </span>
                )}
              </div>
              <p className="truncate text-[0.75rem] font-medium text-ink-3">
                {setMeta
                  ? t(`${setMeta.artist} · 谱师 ${setMeta.creator}`, `${setMeta.artist} · Mapper ${setMeta.creator}`)
                  : t('正在读取本地谱面...', 'Loading local beatmap...')}
                {chart && (
                  <span className="ml-2 font-mono text-ink-2">
                    OD {chart.od} · HP {chart.hp} · {chart.stats.totalNotes} {t('物件', 'notes')} (LN {chart.stats.lnRatio}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {setMeta && setMeta.difficulties.length > 0 && (
              <div className="w-[clamp(220px,15rem,280px)]">
                <SelectField
                  value={String(selectedIndex)}
                  onChange={(val) => setSelectedIndex(Number(val))}
                  className="min-h-[30px] text-[0.78125rem]"
                >
                  {setMeta.difficulties.map((d) => (
                    <option key={d.index} value={String(d.index)}>
                      [{d.keyCount}K] {d.version} ({d.noteCount} notes)
                    </option>
                  ))}
                </SelectField>
              </div>
            )}

            {canLoadIntoGame && onLoadIntoGame && (
              <button
                type="button"
                onClick={() => onLoadIntoGame(beatmapsetId)}
                className="btn btn-sm btn-lazer min-h-[30px] px-3"
                title={t('将此谱面直接发送到运行中的游戏客户端加载', 'Send this beatmapset directly to the running game client')}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                <span>{t('在游戏中加载', 'Load in Game')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn btn-icon h-[30px] w-[30px]"
              title={t('关闭预览 (Esc)', 'Close preview (Esc)')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Main 3-Column Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* LEFT: Skin, Speed & Visual Controls */}
          <aside className="w-full shrink-0 space-y-3.5 overflow-x-hidden overflow-y-auto border-b border-hairline bg-surface-0/85 p-3.5 lg:w-[clamp(268px,16.75rem,320px)] lg:border-r lg:border-b-0">
            {/* Skin Picker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="overline flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-osu" /> {t('演示皮肤', 'Skin')}
                </span>
                {skin?.source === 'local' && (
                  <span className="chip min-h-[19px] px-1.5 text-[0.65625rem]">
                    {skin.noteBodyStyle === 0
                      ? 'Stretch'
                      : skin.noteBodyStyle === 2
                        ? 'Tile-Up'
                        : 'PerCy/Cascade'}
                  </span>
                )}
              </div>
              <SelectField
                value={selectedSkinId}
                onChange={(val) => {
                  setSelectedSkinId(val);
                  onUpdatePreviewPrefs?.({ previewSkinId: val });
                }}
              >
                {activeSkins.length > 0 && (
                  <optgroup label={t('当前 Stable 游戏使用中', 'Active Stable Skin')}>
                    {activeSkins.map((s) => (
                      <option key={s.id} value={s.id}>
                        ★ {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={t('内置高对比演示皮肤', 'Built-in High-Contrast Skins')}>
                  {builtinSkins.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
                {localSkins.length > 0 && (
                  <optgroup label={t(`本地 Stable 皮肤库 (${localSkins.length})`, `Local Stable Skins (${localSkins.length})`)}>
                    {localSkins.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.hasManiaConfig ? '● ' : '○ '}
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </SelectField>
            </div>

            {/* Scroll Speed */}
            <div className="panel-flat space-y-2 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[0.78125rem]">
                <span className="font-semibold text-ink-2">{t('下落流速 (Scroll Speed)', 'Scroll Speed')}</span>
                <span className="font-mono font-bold text-osu-soft tabular-nums">
                  {scrollSpeed} <span className="text-[0.6875rem] text-ink-3">({scrollTimeMs}ms)</span>
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={scrollSpeed}
                style={{ '--fill': `${((scrollSpeed - 1) / 39) * 100}%` } as React.CSSProperties}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setScrollSpeed(next);
                  onUpdatePreviewPrefs?.({ previewScrollSpeed: next });
                }}
                className="slim-range w-full"
              />
              <div className="grid grid-cols-5 gap-1">
                {[18, 24, 28, 32, 36].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setScrollSpeed(preset);
                      onUpdatePreviewPrefs?.({ previewScrollSpeed: preset });
                    }}
                    className={`font-mono rounded-[6px] border py-0.5 text-[0.71875rem] transition-colors ${
                      scrollSpeed === preset
                        ? 'border-osu/60 bg-osu/15 font-bold text-osu-soft'
                        : 'border-hairline bg-surface-1 text-ink-3 hover:text-ink'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Playback Rate */}
            <div className="space-y-1.5">
              <span className="overline">{t('播放倍速', 'Playback Rate')}</span>
              <div className="segmented segmented-compact">
                {RATE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPlaybackRate(r)}
                    className={
                      playbackRate === r
                        ? '!bg-surface-2 font-mono !text-osu-soft shadow-[inset_0_0_0_1px_var(--t-hairline-strong)]'
                        : 'font-mono'
                    }
                  >
                    {r}x
                  </button>
                ))}
              </div>
            </div>

            {/* Scroll Direction */}
            <div className="space-y-1.5">
              <span className="overline">{t('谱面方向', 'Scroll Direction')}</span>
              <div className="segmented segmented-auto">
                {(
                  [
                    { id: 'skin', label: t('跟随皮肤', 'Skin Default') },
                    { id: 'down', label: t('下落', 'Down'), icon: ArrowDown },
                    { id: 'up', label: t('上升', 'Up'), icon: ArrowUp },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setUpsideDownOverride(opt.id)}
                    className={
                      upsideDownOverride === opt.id
                        ? '!bg-surface-2 !text-ink shadow-[inset_0_0_0_1px_var(--t-hairline-strong)]'
                        : ''
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="panel-flat space-y-2 p-2.5 text-[0.78125rem] font-medium">
              <div className="overline flex items-center gap-1.5">
                <Sliders className="h-3 w-3" /> {t('谱面与视觉开关', 'Chart & Visuals')}
              </div>
              <label className="flex cursor-pointer items-center justify-between text-ink-2 hover:text-ink">
                <span>{t('遵循 SV 变速绿线 / BPM', 'Respect SV / BPM Changes')}</span>
                <input
                  type="checkbox"
                  checked={respectSv}
                  onChange={(e) => setRespectSv(e.target.checked)}
                  className="check"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between text-ink-2 hover:text-ink">
                <span>{t('显示小节线 (Barlines)', 'Show Barlines')}</span>
                <input
                  type="checkbox"
                  checked={showBarlines}
                  onChange={(e) => setShowBarlines(e.target.checked)}
                  className="check"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between text-ink-2 hover:text-ink">
                <span>{t('Autoplay 按键光效', 'Autoplay Key Lighting')}</span>
                <input
                  type="checkbox"
                  checked={showKeyLight}
                  onChange={(e) => setShowKeyLight(e.target.checked)}
                  className="check"
                />
              </label>
            </div>

            {/* Dim / Volume / Stage Scale */}
            <div className="panel-flat space-y-2.5 p-2.5 text-[0.75rem] font-medium">
              <div className="space-y-1">
                <div className="flex justify-between text-ink-2">
                  <span>{t('背景暗化 (BG Dim)', 'BG Dim')}</span>
                  <span className="font-mono text-ink">{Math.round(bgDim * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={0.96}
                  step={0.02}
                  value={bgDim}
                  style={{ '--fill': `${((bgDim - 0.25) / 0.71) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setBgDim(Number(e.target.value))}
                  className="slim-range w-full"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-ink-2">
                  <span>{t('轨道缩放 (Scale)', 'Stage Scale')}</span>
                  <span className="font-mono text-ink">{Math.round(stageScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.15}
                  step={0.05}
                  value={stageScale}
                  style={{ '--fill': `${((stageScale - 0.7) / 0.45) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setStageScale(Number(e.target.value))}
                  className="slim-range w-full"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-ink-2">
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {muted ? <VolumeX className="h-3.5 w-3.5 text-bad" /> : <Volume2 className="h-3.5 w-3.5 text-osu" />}
                    <span>{t('音量', 'Volume')}</span>
                  </button>
                  <span className="font-mono text-ink">{muted ? t('静音', 'Muted') : `${Math.round(volume * 100)}%`}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  style={{ '--fill': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
                  onChange={(e) => {
                    setMuted(false);
                    setVolume(Number(e.target.value));
                  }}
                  className="slim-range w-full"
                />
              </div>
            </div>

            {chart && (
              <div className="panel-flat grid grid-cols-3 gap-1.5 p-2 text-center text-[0.6875rem]">
                <div className="min-w-0">
                  <div className="truncate text-ink-3">{t('单键 / 长条', 'Rice / LN')}</div>
                  <div className="font-mono truncate font-semibold text-ink">
                    {chart.stats.riceCount}/{chart.stats.lnCount}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-ink-3">{t('峰值 NPS', 'Peak NPS')}</div>
                  <div className="font-mono truncate font-semibold text-osu-soft">{chart.stats.maxNps}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-ink-3">{t('均速 NPS', 'Avg NPS')}</div>
                  <div className="font-mono truncate font-semibold text-ink">{chart.stats.avgNps}</div>
                </div>
              </div>
            )}
          </aside>

          {/* CENTER: Strict 16:9 Mania Playfield Canvas */}
          <div
            ref={playfieldWrapRef}
            className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden bg-[#04060b] p-2"
            onWheel={(e) => {
              if (!chart) return;
              e.preventDefault();
              seekTo(currentTimeRef.current + (e.deltaY > 0 ? 1200 : -1200));
            }}
          >
            {loadingSet || loadingChart ? (
              <div className="flex flex-col items-center gap-2 text-ink-2">
                <Loader2 className="h-7 w-7 animate-spin text-osu" />
                <span className="text-[0.8125rem] font-medium">
                  {t('正在解析 .osu 谱面与皮肤资源…', 'Parsing .osu chart & skin assets…')}
                </span>
              </div>
            ) : errorMsg ? (
              <div className="flex max-w-md flex-col items-center gap-2 px-6 text-center">
                <ImageOff className="h-8 w-8 text-ink-4" />
                <p className="font-display text-[0.9375rem] font-semibold text-ink">{errorMsg}</p>
                <p className="text-[0.78125rem] font-medium text-ink-3">
                  {t(
                    '完成下载后（或本地 Stable Songs / Lazer 待导入队列中存在该谱面）即可离线实时预览全部 Mania 难度。',
                    'Once downloaded (or present in Stable Songs / Lazer import queue), all Mania diffs can be previewed offline.',
                  )}
                </p>
              </div>
            ) : (
              <div
                style={{ width: `${stageBox.w}px`, height: `${stageBox.h}px` }}
                className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-white/10 bg-[#05070c]"
              >
                <canvas
                  ref={playfieldCanvasRef}
                  onClick={togglePlay}
                  title={t(
                    '点击画面暂停/继续 · 滚轮快进/快退 · 空格键播放/暂停',
                    'Click to play/pause · Wheel to seek · Space to toggle',
                  )}
                  className="block h-full w-full cursor-pointer"
                />
                {!playing && displayTimeMs === 0 && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="btn btn-primary pointer-events-auto absolute gap-2 rounded-full px-5 py-2.5 text-[0.875rem]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>{t('点击开始演示预览', 'Click to Preview')}</span>
                  </button>
                )}
              </div>
            )}

            {chart?.hasFullAudio && chart?.audioUrl && (
              <audio
                ref={audioRef}
                src={chart.audioUrl}
                preload="auto"
                onEnded={() => {
                  setPlaying(false);
                }}
                className="hidden"
              />
            )}
          </div>

          {/* RIGHT: Scrollable Timeline Minimap */}
          <aside className="flex h-[220px] w-full shrink-0 flex-col border-t border-hairline bg-surface-0/90 lg:h-auto lg:w-[clamp(212px,13.25rem,248px)] lg:border-t-0 lg:border-l">
            <div className="flex items-center justify-between border-b border-hairline px-2.5 py-2">
              <span className="overline">{t('全曲缩略图', 'Minimap')}</span>
              <div className="flex items-center gap-1">
                {([1, 2, 4] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setMinimapZoom(z)}
                    className={`font-mono rounded-[5px] px-1.5 py-0.5 text-[0.6875rem] transition-colors ${
                      minimapZoom === z
                        ? 'bg-osu/20 font-bold text-osu-soft'
                        : 'text-ink-3 hover:bg-tint hover:text-ink'
                    }`}
                  >
                    {z}x
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setAutoFollow((v) => !v);
                    setUserDetached(false);
                  }}
                  title={t('切换缩略图自动跟随当前进度', 'Toggle auto-follow playback')}
                  className={`rounded-[5px] border px-1.5 py-0.5 text-[0.6875rem] font-semibold transition-colors ${
                    autoFollow && !userDetached
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-ok'
                      : 'border-hairline text-ink-3 hover:text-ink'
                  }`}
                >
                  {t('跟随', 'Follow')}
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                ref={minimapScrollRef}
                onScroll={() => {
                  if (programmaticScrollRef.current) {
                    programmaticScrollRef.current = false;
                    return;
                  }
                  if (autoFollow) {
                    setUserDetached(true);
                  }
                }}
                className="h-full w-full overflow-y-auto overflow-x-hidden"
              >
                <div style={{ height: `${totalMinimapHeight}px`, position: 'relative' }}>
                  <canvas
                    ref={minimapCanvasRef}
                    onPointerDown={(e) => {
                      scrubbingMinimapRef.current = true;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      seekMinimapFromClientY(e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (!scrubbingMinimapRef.current) return;
                      seekMinimapFromClientY(e.clientY);
                    }}
                    onPointerUp={(e) => {
                      if (scrubbingMinimapRef.current) {
                        scrubbingMinimapRef.current = false;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                    onPointerCancel={() => {
                      scrubbingMinimapRef.current = false;
                    }}
                    title={t('上下滑动浏览全曲音符分布，点击或拖动可立即跳转进度', 'Scroll to inspect chart; click or drag to seek')}
                    className="sticky top-0 block h-[var(--mm-h)] w-full cursor-crosshair select-none"
                    style={{ '--mm-h': `${minimapViewportH}px` } as React.CSSProperties}
                  />
                </div>
              </div>

              {userDetached && (
                <button
                  type="button"
                  onClick={() => {
                    setUserDetached(false);
                    setAutoFollow(true);
                  }}
                  className="glass absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border-osu/50 px-2.5 py-1 text-[0.71875rem] font-semibold text-ink hover:border-osu"
                >
                  <LocateFixed className="h-3 w-3 text-osu" />
                  <span>{t('回到当前', 'Back to Now')}</span>
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* BOTTOM: Transport & Draggable Progress Bar with NPS Density Sparkline */}
        <footer className="shrink-0 border-t border-hairline bg-surface-1/90 px-4 py-2.5">
          <div className="flex items-center gap-3">
            {/* Transport Buttons */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!chart}
                onClick={() => seekTo(0)}
                title={t('回到开头 (R)', 'Restart (R)')}
                className="btn btn-sm btn-icon h-8 w-8"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!chart}
                onClick={() => seekTo(currentTimeRef.current - 5000)}
                title={t('后退 5 秒 (←)', 'Back 5s (←)')}
                className="btn btn-sm btn-icon h-8 w-8"
              >
                <SkipBack className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!chart}
                onClick={togglePlay}
                title={playing ? t('暂停 (Space)', 'Pause (Space)') : t('继续播放 (Space)', 'Play (Space)')}
                className="btn btn-primary min-h-[32px] px-3.5"
              >
                {playing ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span>{t('暂停', 'Pause')}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{displayTimeMs > 0 ? t('继续', 'Resume') : t('播放', 'Play')}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={!chart}
                onClick={() => seekTo(currentTimeRef.current + 5000)}
                title={t('快进 5 秒 (→)', 'Forward 5s (→)')}
                className="btn btn-sm btn-icon h-8 w-8"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Draggable Scrubbing Progress Bar with NPS Histogram */}
            <div
              ref={progressBarRef}
              role="slider"
              aria-label={t('谱面播放进度条', 'Chart playback progress')}
              aria-valuemin={0}
              aria-valuemax={chart ? Math.round(chart.totalLengthMs) : 100}
              aria-valuenow={Math.round(displayTimeMs)}
              tabIndex={0}
              onPointerDown={(e) => {
                if (!chart) return;
                scrubbingProgressRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubProgressFromClientX(e.clientX);
              }}
              onPointerMove={(e) => {
                if (!chart) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
                setHoverProgress({ pct: pct * 100, timeMs: pct * chart.totalLengthMs });
                if (scrubbingProgressRef.current) {
                  scrubProgressFromClientX(e.clientX);
                }
              }}
              onPointerUp={(e) => {
                if (scrubbingProgressRef.current) {
                  scrubbingProgressRef.current = false;
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              onPointerLeave={() => setHoverProgress(null)}
              className="relative flex h-9 flex-1 cursor-pointer items-center select-none"
            >
              {/* NPS Density Sparkline Backdrop */}
              <div className="relative h-6 w-full overflow-hidden rounded-[7px] border border-hairline bg-surface-0">
                {chart && (
                  <div className="absolute inset-0 flex items-end gap-px px-0.5 pt-1 opacity-75">
                    {chart.densityBins.map((val, idx) => {
                      const hPct = Math.max(8, Math.round((val / maxDensity) * 100));
                      const binPct = ((idx + 0.5) / chart.densityBins.length) * 100;
                      const passed = binPct <= progressPct;
                      return (
                        <div
                          key={idx}
                          style={{ height: `${hPct}%` }}
                          className={`flex-1 rounded-t-[1px] transition-colors duration-75 ${
                            passed ? 'bg-osu/75' : 'bg-ink-4/35'
                          }`}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Progress tint overlay */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-osu/20 to-lazer/25"
                  style={{ width: `${progressPct}%` }}
                />

                {/* Hover indicator */}
                {hoverProgress && (
                  <div
                    className="pointer-events-none absolute inset-y-0 w-px bg-white/60"
                    style={{ left: `${hoverProgress.pct}%` }}
                  />
                )}
              </div>

              {/* Hover Time Bubble */}
              {hoverProgress && (
                <div
                  className="glass font-mono pointer-events-none absolute -top-7 -translate-x-1/2 rounded-[6px] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-ink tabular-nums shadow"
                  style={{ left: `${hoverProgress.pct}%` }}
                >
                  {formatTimePrecise(hoverProgress.timeMs)}
                </div>
              )}

              {/* Draggable Playhead Handle */}
              <div
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-osu shadow-[0_0_10px_rgba(255,102,170,0.9)]"
                style={{ left: `${progressPct}%` }}
              />
            </div>

            {/* Time Readout */}
            <div className="font-mono flex shrink-0 items-center gap-1 text-[0.78125rem] text-ink-2 tabular-nums">
              <span className="font-semibold text-ink">{formatTimePrecise(displayTimeMs)}</span>
              <span className="text-ink-4">/</span>
              <span>{chart ? formatDuration(Math.round(chart.totalLengthMs / 1000)) : '0:00'}</span>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] font-medium text-ink-3">
            <span>
              {t(
                '快捷键：Space 播放/暂停 · ←/→ ±3s · ↑/↓ 流速 · R 重头 · 拖动进度条或右侧缩略图实时跳转',
                'Shortcuts: Space Play/Pause · ←/→ ±3s · ↑/↓ Speed · R Restart · Drag bar or minimap to seek',
              )}
            </span>
            {setMeta && (
              <span className="inline-flex items-center gap-1 font-mono text-ink-2">
                <ChevronRight className="h-3 w-3 text-osu" />
                {t('数据源:', 'Source:')} {setMeta.sourceType}
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
