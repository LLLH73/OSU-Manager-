import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Clock,
  Disc3,
  Heart,
  Image,
  ListPlus,
  Loader2,
  Maximize2,
  Minimize2,
  MinusCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatDuration, isDarkTheme } from '../../constants';
import type { BookSummary, ThemeId } from '../../types';
import { MarqueeText } from '../MarqueeText';
import { SelectField } from '../SelectField';
import { ConstructivistCoverStage } from './ConstructivistCoverStage';
import { ConstructivistPosterBg } from './ConstructivistPosterBg';
import {
  getFallbackConstructivistPalette,
  type ConstructivistPalette,
} from './constructivistRedraw';
import { MusicParticleCanvas } from './MusicParticleCanvas';
import {
  useMusicPlayer,
  useMusicTime,
  type MusicCoverMode,
  type MusicRhythmIntensity,
  type MusicVisualizerMode,
} from './MusicPlayerContext';
import { MusicVisualizerCanvas } from './MusicVisualizerCanvas';
import { OsuMusicMark } from './OsuMusicMark';
import { computeBeatState } from './rhythmEngine';

interface MusicPlayerModeProps {
  theme: ThemeId;
  canLoadIntoGame: boolean;
  onPreviewBeatmap?: (beatmapsetId: number, beatmapId?: number | null, title?: string) => void;
  onLoadIntoGame?: (beatmapsetId: number) => void;
  onOpenFolder?: (subFolder: string) => void;
  onNotify?: (msg: string) => void;
}

type SystemCollectionId = 'sys:all' | 'sys:liked' | 'sys:recent' | 'sys:frequent' | 'sys:mania4k';
type TrackSortField = 'default' | 'recent' | 'title' | 'plays' | 'bpm' | 'length' | 'stars';
type SourceFilter = 'all' | 'stable' | 'lazer';

const RATE_PRESETS = [0.75, 1.0, 1.25, 1.5] as const;

const SYSTEM_COLLECTIONS: Array<{ id: SystemCollectionId; code: string; label: string }> = [
  { id: 'sys:all', code: '01', label: '全部本地曲目' },
  { id: 'sys:liked', code: '02', label: '红心收藏' },
  { id: 'sys:recent', code: '03', label: '最近游玩' },
  { id: 'sys:frequent', code: '04', label: '常听精选' },
  { id: 'sys:mania4k', code: '05', label: 'Mania 4K' },
];

function formatCompactDate(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function MusicTransportDeck() {
  const {
    currentTrack,
    isPlaying,
    buffering,
    audioError,
    playbackRate,
    preservesPitch,
    volume,
    muted,
    loopMode,
    rhythmData,
    togglePlay,
    prevTrack,
    nextTrack,
    cycleLoopMode,
    setPlaybackRate,
    setPreservesPitch,
    setVolume,
    toggleMute,
  } = useMusicPlayer();
  const { currentTime, duration, seek, seekRelative } = useMusicTime();

  const seekMax = duration > 0 ? duration : Math.max(10, currentTrack?.lengthSec ?? 10);
  const seekFillPct = Math.min(100, Math.max(0, (currentTime / seekMax) * 100));
  const volFillPct = Math.round((muted ? 0 : volume) * 100);
  const rateFillPct = Math.round(((playbackRate - 0.5) / 1.5) * 100);

  const density = rhythmData?.densityProfile ?? [];
  const kiaiRanges = rhythmData?.kiaiRanges ?? [];
  const totalMs = Math.max(seekMax * 1000, 1);

  return (
    <footer className="relative z-20 shrink-0 border-t-2 border-[var(--mp-rule)] bg-[var(--mp-panel)] px-4 pt-2 pb-2.5 backdrop-blur-md sm:px-5">
      {/* Strictly Aligned Dual Progress Strip: Density Histogram + Seek Scrubber */}
      <div className="mb-2 flex items-end gap-2.5">
        <span className="w-11 shrink-0 pb-[1px] font-mono text-[0.71875rem] font-semibold text-[var(--mp-ink)] tabular-nums">
          {formatDuration(currentTime)}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="relative flex h-3.5 w-full items-end gap-[2px] overflow-hidden border-b border-[var(--mp-line)] pb-[2px]">
            {kiaiRanges.map((kr, idx) => {
              const left = Math.min(100, Math.max(0, (kr.startMs / totalMs) * 100));
              const width = Math.min(
                100 - left,
                Math.max(0.5, ((kr.endMs - kr.startMs) / totalMs) * 100),
              );
              return (
                <div
                  key={idx}
                  className="pointer-events-none absolute top-0 h-[2px] bg-[var(--mp-signal)]/75"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}
            {(density.length > 0 ? density : new Array<number>(72).fill(0.08)).map((v, idx) => {
              const pct = ((idx + 0.5) / 72) * 100;
              const passed = pct <= seekFillPct;
              const hPct = Math.max(14, Math.round(v * 100));
              return (
                <span
                  key={idx}
                  className="flex-1 transition-colors"
                  style={{
                    height: `${hPct}%`,
                    backgroundColor: passed ? 'var(--mp-signal)' : 'var(--mp-line)',
                  }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.1}
            value={Math.min(seekMax, currentTime)}
            disabled={!currentTrack}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ '--fill': `${seekFillPct}%` } as CSSProperties}
            className="swiss-range block w-full"
            aria-label="播放进度"
          />
        </div>

        <span className="w-11 shrink-0 pb-[1px] text-right font-mono text-[0.71875rem] text-[var(--mp-muted)] tabular-nums">
          {duration > 0 ? formatDuration(duration) : formatDuration(currentTrack?.lengthSec ?? 0)}
        </span>
      </div>

      {/* Main 3-Zone Swiss Control Grid */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {/* Left: Transport */}
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={cycleLoopMode}
            title={
              loopMode === 'all'
                ? '循环模式：列表循环（点击切换单曲/随机）'
                : loopMode === 'one'
                  ? '循环模式：单曲循环'
                  : '循环模式：随机播放'
            }
            className={`inline-flex h-7 items-center gap-1 px-2 font-mono text-[0.6875rem] font-bold ${
              loopMode === 'all' ? 'swiss-btn' : 'swiss-btn-signal'
            }`}
          >
            {loopMode === 'one' ? (
              <Repeat1 className="h-3.5 w-3.5" />
            ) : loopMode === 'shuffle' ? (
              <Shuffle className="h-3.5 w-3.5" />
            ) : (
              <Repeat className="h-3.5 w-3.5" />
            )}
            <span className="hidden xl:inline">
              {loopMode === 'all' ? '列表' : loopMode === 'one' ? '单曲' : '随机'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => seekRelative(-5)}
            disabled={!currentTrack}
            title="快退 5 秒 (←)"
            className="swiss-btn hidden h-7 w-7 items-center justify-center md:inline-flex disabled:opacity-35"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={prevTrack}
            title="上一首 (P)"
            className="swiss-btn inline-flex h-7 w-7 items-center justify-center"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? '暂停 (Space)' : '播放 (Space)'}
            className={`inline-flex h-8 min-w-[76px] items-center justify-center gap-1.5 px-2.5 font-mono text-[0.71875rem] font-bold tracking-[0.06em] ${
              isPlaying ? 'swiss-btn-signal' : 'swiss-btn-solid'
            }`}
          >
            {buffering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            onClick={nextTrack}
            title="下一首 (N)"
            className="swiss-btn inline-flex h-7 w-7 items-center justify-center"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => seekRelative(5)}
            disabled={!currentTrack}
            title="快进 5 秒 (→)"
            className="swiss-btn hidden h-7 w-7 items-center justify-center md:inline-flex disabled:opacity-35"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          {audioError && (
            <span className="ml-1 max-w-[120px] truncate font-mono text-[0.6875rem] text-[var(--mp-signal)]">
              {audioError}
            </span>
          )}
        </div>

        {/* Center: Rate Adjustment & Pitch Lock (0.50x - 2.00x) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hidden font-mono text-[0.625rem] font-bold tracking-[0.12em] text-[var(--mp-muted)] uppercase sm:inline">
            RATE
          </span>
          <div className="flex items-center border border-[var(--mp-line)]">
            {RATE_PRESETS.map((r) => {
              const active = Math.abs(playbackRate - r) < 0.01;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setPlaybackRate(r)}
                  className={`h-7 px-1.5 font-mono text-[0.6875rem] font-bold transition-colors ${
                    active
                      ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                      : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  {r}×
                </button>
              );
            })}
          </div>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.05}
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            style={{ '--fill': `${rateFillPct}%` } as CSSProperties}
            className="swiss-range hidden w-20 md:block"
            aria-label="播放倍速"
          />
          <span className="w-11 font-mono text-[0.71875rem] font-bold text-[var(--mp-ink)] tabular-nums">
            {playbackRate.toFixed(2)}×
          </span>
          <button
            type="button"
            onClick={() => setPreservesPitch(!preservesPitch)}
            title={
              preservesPitch
                ? '原调锁高：倍速不变音高（点击切换 Nightcore 磁带变调）'
                : '磁带变调 (Nightcore/Daycore)：音高随倍速变化'
            }
            className={`h-7 px-2 font-mono text-[0.65625rem] font-bold ${
              preservesPitch ? 'swiss-btn' : 'swiss-btn-signal'
            }`}
          >
            {preservesPitch ? '原调' : 'NC变调'}
          </button>
        </div>

        {/* Right: Volume Control */}
        <div
          className="flex items-center gap-1.5"
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.05 : -0.05;
            setVolume(volume + delta);
          }}
        >
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? '取消静音 (M)' : '静音 (M)'}
            className="swiss-btn inline-flex h-7 w-7 items-center justify-center"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-[var(--mp-signal)]" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ '--fill': `${volFillPct}%` } as CSSProperties}
            className="swiss-range w-20 sm:w-24"
            aria-label="音量"
          />
          <span className="w-9 text-right font-mono text-[0.6875rem] font-bold text-[var(--mp-ink)] tabular-nums">
            {volFillPct}%
          </span>
        </div>
      </div>
      {/* Top Swiss Telemetry Plinth for Zen Constructivist Poster Mode */}
    </footer>
  );
}

function ZenPosterInfoCard({
  track,
  trackIndexLabel,
  isPlaying,
  playbackRate,
  isLiked,
  onToggleLike,
  onExitZen,
}: {
  track: BookSummary | null;
  trackIndexLabel: string;
  isPlaying: boolean;
  playbackRate: number;
  isLiked: boolean;
  onToggleLike: () => void;
  onExitZen: () => void;
}) {
  const { audioRef, rhythmDataRef, rhythmData } = useMusicPlayer();
  const [collapsed, setCollapsed] = useState(false);
  const bpmRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const kiaiRef = useRef<HTMLSpanElement | null>(null);
  const beatCellsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const meter = Math.min(8, Math.max(1, rhythmData?.timingPoints[0]?.meter ?? 4));
  const baseBpm = rhythmData?.baseBpm ?? track?.bpm ?? 120;
  const effectiveBpm = Math.round(baseBpm * playbackRate * 10) / 10;

  useEffect(() => {
    if (collapsed) return;
    let rafId = 0;
    const update = () => {
      const curMs = (audioRef.current?.currentTime ?? 0) * 1000;
      const beat = computeBeatState(curMs, playbackRate, rhythmDataRef.current, track?.bpm ?? 120);
      if (bpmRef.current) bpmRef.current.textContent = beat.effectiveBpm.toFixed(1);
      if (barRef.current) {
        barRef.current.textContent = `BAR ${String(Math.max(1, beat.measureIndex + 1)).padStart(3, '0')} · B${beat.beatInBar + 1}`;
      }
      if (kiaiRef.current) {
        kiaiRef.current.dataset.active = isPlaying && beat.isKiai ? 'true' : 'false';
      }
      const activeSlot = isPlaying ? beat.beatInBar : -1;
      for (let i = 0; i < beatCellsRef.current.length; i += 1) {
        const cell = beatCellsRef.current[i];
        if (!cell) continue;
        const on = i === activeSlot;
        cell.dataset.active = on ? 'true' : 'false';
        cell.dataset.downbeat = on && i === 0 ? 'true' : 'false';
      }
    };
    const tick = () => {
      if (document.hidden) {
        rafId = 0;
        return;
      }
      update();
      if (isPlaying) rafId = window.requestAnimationFrame(tick);
      else rafId = 0;
    };
    update();
    if (isPlaying && !document.hidden) rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [collapsed, isPlaying, playbackRate, track?.bookKey, track?.bpm, audioRef, rhythmDataRef]);

  const titleText = track ? track.titleUnicode || track.title : '未选择本地曲目';

  if (collapsed) {
    return (
      <div
        className="relative z-10 m-3.5 flex w-fit max-w-[min(94%,540px)] flex-wrap items-center gap-2 px-3 py-2 shadow-2xl backdrop-blur-md sm:m-5"
        style={{
          backgroundColor: 'var(--mp-panel)',
          border: '1.5px solid var(--mp-rule)',
          borderLeft: '5px solid var(--mp-signal)',
          color: 'var(--mp-ink)',
        }}
      >
        <OsuMusicMark className="h-3.5 w-3.5 shrink-0" active playing={isPlaying} />
        <span className="max-w-[180px] truncate text-[0.75rem] font-bold sm:max-w-[260px]">
          {titleText}
        </span>

        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="展开曲目信息卡"
          className="inline-flex h-6 items-center gap-1 border px-2 text-[0.6875rem] font-bold transition-colors hover:opacity-85"
          style={{ borderColor: 'var(--mp-rule)', color: 'var(--mp-ink)' }}
        >
          <Maximize2 className="h-3 w-3" />
          <span>展开</span>
        </button>

        <button
          type="button"
          onClick={onExitZen}
          className="inline-flex h-6 items-center gap-1 border px-2 text-[0.6875rem] font-bold transition-colors hover:opacity-85"
          style={{ borderColor: 'var(--mp-rule)', color: 'var(--mp-ink)' }}
        >
          <Minimize2 className="h-3 w-3" />
          <span>退出</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative z-10 m-3.5 max-w-[min(94%,540px)] shadow-2xl backdrop-blur-md sm:m-5"
      style={{
        backgroundColor: 'var(--mp-panel)',
        border: '1.5px solid var(--mp-rule)',
        borderLeft: '5px solid var(--mp-signal)',
        color: 'var(--mp-ink)',
      }}
    >
      <div className="px-4 py-3 sm:px-5 sm:py-3.5">
        <div
          className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.625rem] font-bold tracking-[0.12em] uppercase"
          style={{ color: 'var(--mp-muted)' }}
        >
          <span className="flex items-center gap-2">
            <OsuMusicMark className="h-3.5 w-3.5" active playing={isPlaying} />
            <span>FOCUS COVER // 专注画报</span>
            <span>·</span>
            <span>{trackIndexLabel}</span>
          </span>

          <div className="flex items-center gap-1.5">
            <span
              ref={kiaiRef}
              data-active="false"
              className="border px-1.5 py-0.5 text-[0.6rem] transition-colors data-[active=true]:border-[var(--mp-signal)] data-[active=true]:bg-[var(--mp-signal)] data-[active=true]:text-white"
              style={{ borderColor: 'var(--mp-rule)' }}
            >
              KIAI
            </span>

            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="收起信息卡（欣赏完整封面）"
              className="border px-1.5 py-0.5 text-[0.6rem] tracking-normal transition-colors hover:opacity-85"
              style={{ borderColor: 'var(--mp-rule)', color: 'var(--mp-ink)' }}
            >
              收起
            </button>
          </div>
        </div>

        <div className="mt-2 min-w-0 overflow-hidden">
          <MarqueeText
            text={titleText}
            mode="always"
            className="font-display text-[1.25rem] leading-tight font-extrabold tracking-tight sm:text-[1.45rem]"
          />
          {track && (
            <div className="mt-0.5 truncate text-[0.8125rem]" style={{ color: 'var(--mp-muted)' }}>
              {track.artistUnicode || track.artist} · {track.creator}
              {track.beatmapsetId ? ` · SET #${track.beatmapsetId}` : ''}
            </div>
          )}
        </div>

        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5"
          style={{ borderColor: 'var(--mp-line)' }}
        >
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(8, meter) }, (_, i) => (
              <span
                key={i}
                ref={(node) => {
                  beatCellsRef.current[i] = node;
                }}
                data-active="false"
                data-downbeat="false"
                className="inline-flex h-5 min-w-[22px] items-center justify-center border font-mono text-[0.625rem] font-bold transition-colors duration-75 data-[active=true]:border-[var(--mp-ink)] data-[active=true]:bg-[var(--mp-ink)] data-[active=true]:text-[var(--mp-bg)] data-[downbeat=true]:border-[var(--mp-signal)] data-[downbeat=true]:bg-[var(--mp-signal)] data-[downbeat=true]:text-white"
                style={{ borderColor: 'var(--mp-line)', color: 'var(--mp-muted)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 font-mono text-[0.6875rem] tabular-nums">
            <span ref={barRef} style={{ color: 'var(--mp-muted)' }}>
              BAR 001 · B1
            </span>
            <span className="font-bold">
              <span ref={bpmRef}>{effectiveBpm.toFixed(1)}</span>{' '}
              <span style={{ color: 'var(--mp-signal)' }}>BPM</span>
            </span>
            {track && (
              <button
                type="button"
                onClick={onToggleLike}
                className="inline-flex h-6 items-center gap-1 border px-2 text-[0.6875rem] font-bold transition-colors hover:opacity-85"
                style={{
                  borderColor: isLiked ? 'var(--mp-signal)' : 'var(--mp-rule)',
                  backgroundColor: isLiked ? 'var(--mp-signal)' : 'transparent',
                  color: isLiked ? '#ffffff' : 'var(--mp-ink)',
                }}
              >
                <Heart className={`h-3 w-3 ${isLiked ? 'fill-current' : ''}`} />
                <span>{isLiked ? '已红心' : '红心'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExitZen}
              className="inline-flex h-6 items-center gap-1 border px-2 text-[0.6875rem] font-bold transition-colors hover:opacity-85"
              style={{ borderColor: 'var(--mp-rule)', color: 'var(--mp-ink)' }}
            >
              <Minimize2 className="h-3 w-3" />
              <span>退出</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MusicPlayerMode({
  theme,
  canLoadIntoGame,
  onPreviewBeatmap,
  onLoadIntoGame,
  onOpenFolder,
  onNotify,
}: MusicPlayerModeProps) {
  const {
    playableBooks,
    loadingLibrary,
    libraryError,
    refreshLibrary,
    playlists,
    createNewPlaylist,
    renamePlaylist,
    togglePinPlaylist,
    addBookToPlaylist,
    removeBookFromPlaylist,
    reorderPlaylistTrack,
    removePlaylist,
    likedSet,
    toggleLike,
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    playbackRate,
    visualizerMode,
    coverMode,
    rhythmFollow,
    sleepTimer,
    playTrack,
    playQueueIndex,
    setQueueAndPlay,
    enqueueTrackNext,
    removeFromQueue,
    togglePlay,
    prevTrack,
    nextTrack,
    setPlaybackRate,
    toggleMute,
    setVisualizerMode,
    setCoverMode,
    setRhythmFollow,
    startSleepTimerMinutes,
    startSleepTimerTrackEnd,
    cancelSleepTimer,
  } = useMusicPlayer();
  const { seekRelative } = useMusicTime();

  const isDark = isDarkTheme(theme);
  const isElectron = Boolean(window.electronAPI?.isElectron);

  const [activeCollection, setActiveCollection] = useState<string>('sys:all');
  const [rightTab, setRightTab] = useState<'tracks' | 'queue'>('tracks');
  const [searchQ, setSearchQ] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortBy, setSortBy] = useState<TrackSortField>('default');
  const [zenMode, setZenMode] = useState(false);
  const [particlesEnabled, setParticlesEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('osu4k-music-particles');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [playlistsOpen, setPlaylistsOpen] = useState(false);
  const [posterPalette, setPosterPalette] = useState<ConstructivistPalette>(() =>
    getFallbackConstructivistPalette(isDark),
  );

  const toggleParticles = () => {
    setParticlesEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('osu4k-music-particles', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Playlist creation & management UI states
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [newPlImportFiltered, setNewPlImportFiltered] = useState(false);
  const [pendingSeedBookKey, setPendingSeedBookKey] = useState<string | null>(null);
  const [renamingPlId, setRenamingPlId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [confirmDeletePlId, setConfirmDeletePlId] = useState<string | null>(null);

  // Playlist track picker mode (adds songs from full local library into active custom playlist)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState('');

  // Quick row "+歌单" popover
  const [rowMenuBookKey, setRowMenuBookKey] = useState<string | null>(null);

  // Sleep timer menu
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const timerMenuRef = useRef<HTMLDivElement | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const bookMap = useMemo(() => {
    const map = new Map<string, BookSummary>();
    for (const b of playableBooks) {
      map.set(b.bookKey, b);
    }
    return map;
  }, [playableBooks]);

  const activeCustomPlaylist = useMemo(
    () => playlists.find((p) => p.id === activeCollection) ?? null,
    [playlists, activeCollection],
  );

  // Fallback to All if active custom playlist was deleted
  useEffect(() => {
    if (!activeCollection.startsWith('sys:') && !activeCustomPlaylist) {
      setActiveCollection('sys:all');
      setPickerOpen(false);
    }
  }, [activeCollection, activeCustomPlaylist]);

  useEffect(() => {
    if (!timerMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (timerMenuRef.current && !timerMenuRef.current.contains(e.target as Node)) {
        setTimerMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [timerMenuOpen]);

  useEffect(() => {
    if (!rowMenuBookKey) return;
    const onDown = () => setRowMenuBookKey(null);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [rowMenuBookKey]);

  const collectionBooks = useMemo(() => {
    if (activeCustomPlaylist) {
      const list: BookSummary[] = [];
      for (const k of activeCustomPlaylist.bookKeys) {
        const b = bookMap.get(k);
        if (b) list.push(b);
      }
      return list;
    }

    switch (activeCollection) {
      case 'sys:liked':
        return playableBooks.filter((b) => likedSet.has(b.bookKey));
      case 'sys:recent':
        return [...playableBooks]
          .filter((b) => Boolean(b.lastPlayedAt))
          .sort((a, b) => Date.parse(b.lastPlayedAt!) - Date.parse(a.lastPlayedAt!));
      case 'sys:frequent':
        return [...playableBooks]
          .filter((b) => b.playCount > 0)
          .sort((a, b) => b.playCount - a.playCount);
      case 'sys:mania4k':
        return playableBooks.filter((b) => b.has4k);
      default:
        return playableBooks;
    }
  }, [activeCollection, activeCustomPlaylist, bookMap, playableBooks, likedSet]);

  const displayedTracks = useMemo(() => {
    let list = collectionBooks;
    if (sourceFilter === 'stable') {
      list = list.filter((b) => b.inStable);
    } else if (sourceFilter === 'lazer') {
      list = list.filter((b) => b.inLazer);
    }

    const q = searchQ.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        const hay = `${b.title} ${b.titleUnicode} ${b.artist} ${b.artistUnicode} ${b.creator} ${b.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (sortBy === 'default') return list;
    const copy = [...list];
    copy.sort((a, b) => {
      if (sortBy === 'title') {
        return (a.titleUnicode || a.title).localeCompare(b.titleUnicode || b.title);
      }
      if (sortBy === 'plays') return b.playCount - a.playCount;
      if (sortBy === 'bpm') return b.bpm - a.bpm;
      if (sortBy === 'length') return b.lengthSec - a.lengthSec;
      if (sortBy === 'stars') return b.maxStars - a.maxStars;
      const ta = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0;
      const tb = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0;
      return tb - ta;
    });
    return copy;
  }, [collectionBooks, sourceFilter, searchQ, sortBy]);

  const pickerCandidates = useMemo(() => {
    if (!pickerOpen) return [];
    const q = pickerQ.trim().toLowerCase();
    const list = q
      ? playableBooks.filter((b) => {
          const hay = `${b.title} ${b.titleUnicode} ${b.artist} ${b.artistUnicode} ${b.creator}`.toLowerCase();
          return hay.includes(q);
        })
      : playableBooks;
    return list.slice(0, 80);
  }, [pickerOpen, pickerQ, playableBooks]);

  // Scoped keyboard shortcuts for Music Player Mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      } else if (e.key === '[') {
        e.preventDefault();
        setPlaybackRate(playbackRate - 0.05);
      } else if (e.key === ']') {
        e.preventDefault();
        setPlaybackRate(playbackRate + 0.05);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        nextTrack();
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        prevTrack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, seekRelative, setPlaybackRate, playbackRate, toggleMute, nextTrack, prevTrack]);

  const handleCreatePlaylist = async () => {
    const name = newPlName.trim() || `歌单 ${playlists.length + 1}`;
    const seedKeys: string[] = [];
    if (pendingSeedBookKey) seedKeys.push(pendingSeedBookKey);
    if (newPlImportFiltered) {
      for (const b of displayedTracks) {
        if (!seedKeys.includes(b.bookKey)) seedKeys.push(b.bookKey);
      }
    }
    const created = await createNewPlaylist({ name, bookKeys: seedKeys });
    if (created) {
      setActiveCollection(created.id);
      setRightTab('tracks');
      setCreateOpen(false);
      setNewPlName('');
      setNewPlImportFiltered(false);
      setPendingSeedBookKey(null);
    }
  };

  const handlePlayAll = (shuffle = false) => {
    if (displayedTracks.length === 0) {
      onNotify?.('当前列表没有可播放的曲目');
      return;
    }
    const list = shuffle
      ? [...displayedTracks].sort(() => Math.random() - 0.5)
      : displayedTracks;
    setQueueAndPlay(list, 0);
  };

  const activeCollectionLabel = activeCustomPlaylist
    ? activeCustomPlaylist.name
    : SYSTEM_COLLECTIONS.find((c) => c.id === activeCollection)?.label ?? '全部本地曲目';

  const trackIndexLabel =
    currentTrack && currentIndex >= 0
      ? `NO.${String(currentIndex + 1).padStart(3, '0')} / ${String(queue.length).padStart(3, '0')}`
      : `LIBRARY · ${String(playableBooks.length).padStart(3, '0')}`;

  const playlistsSidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--mp-line)] px-3 py-2.5">
        <div>
          <div className="font-mono text-[0.625rem] font-bold tracking-[0.14em] text-[var(--mp-muted)] uppercase">
            COLLECTIONS
          </div>
          <div className="text-[0.8125rem] font-bold text-[var(--mp-ink)]">曲库与歌单</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setPendingSeedBookKey(null);
              setCreateOpen((v) => !v);
            }}
            className="swiss-btn-solid inline-flex h-7 items-center gap-1 px-2 font-mono text-[0.6875rem] font-bold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>新建</span>
          </button>
          <button
            type="button"
            onClick={() => setPlaylistsOpen(false)}
            title="收起歌单侧栏"
            className="swiss-btn inline-flex h-7 w-7 items-center justify-center"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Swiss Create Playlist Box */}
      {createOpen && (
        <div className="space-y-2 border-b border-[var(--mp-rule)] bg-[var(--mp-surface-alt)] p-2.5">
          <div className="font-mono text-[0.625rem] font-bold tracking-[0.1em] text-[var(--mp-signal)] uppercase">
            NEW PLAYLIST // 创建歌单
          </div>
          <input
            type="text"
            value={newPlName}
            onChange={(e) => setNewPlName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreatePlaylist();
              if (e.key === 'Escape') setCreateOpen(false);
            }}
            placeholder="输入歌单名称..."
            autoFocus
            className="w-full border border-[var(--mp-line)] bg-[var(--mp-panel)] px-2 py-1 text-[0.75rem] text-[var(--mp-ink)] outline-none focus:border-[var(--mp-ink)]"
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-[0.71875rem] text-[var(--mp-muted)]">
            <input
              type="checkbox"
              checked={newPlImportFiltered}
              onChange={(e) => setNewPlImportFiltered(e.target.checked)}
              className="accent-[var(--mp-signal)]"
            />
            <span>导入当前列表 ({displayedTracks.length} 首)</span>
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCreatePlaylist()}
              className="swiss-btn-signal flex-1 py-1 text-[0.71875rem] font-bold"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="swiss-btn px-2.5 py-1 text-[0.71875rem] font-semibold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="px-1.5 pb-1 font-mono text-[0.59375rem] font-bold tracking-[0.14em] text-[var(--mp-muted)] uppercase">
          SMART INDEX
        </div>
        <div className="space-y-0.5">
          {SYSTEM_COLLECTIONS.map((col) => {
            const active = activeCollection === col.id && rightTab === 'tracks';
            const count =
              col.id === 'sys:all'
                ? playableBooks.length
                : col.id === 'sys:liked'
                  ? playableBooks.filter((b) => likedSet.has(b.bookKey)).length
                  : col.id === 'sys:recent'
                    ? playableBooks.filter((b) => Boolean(b.lastPlayedAt)).length
                    : col.id === 'sys:frequent'
                      ? playableBooks.filter((b) => b.playCount > 0).length
                      : playableBooks.filter((b) => b.has4k).length;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => {
                  setActiveCollection(col.id);
                  setRightTab('tracks');
                  setPickerOpen(false);
                  if (window.innerWidth < 1024) setPlaylistsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[0.78125rem] transition-colors ${
                  active
                    ? 'bg-[var(--mp-ink)] font-bold text-[var(--mp-bg)]'
                    : 'font-medium text-[var(--mp-ink-2)] hover:bg-[var(--mp-surface-alt)] hover:text-[var(--mp-ink)]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`font-mono text-[0.65625rem] ${
                      active ? 'text-[var(--mp-signal)]' : 'text-[var(--mp-muted)]'
                    }`}
                  >
                    {col.code}
                  </span>
                  <span className="truncate">{col.label}</span>
                </span>
                <span className="font-mono text-[0.6875rem] opacity-75 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[var(--mp-line)] px-1.5 pt-2.5 pb-1">
          <span className="font-mono text-[0.59375rem] font-bold tracking-[0.14em] text-[var(--mp-muted)] uppercase">
            USER PLAYLISTS ({playlists.length})
          </span>
        </div>

        <div className="space-y-1">
          {playlists.length === 0 ? (
            <div className="px-2 py-3 text-[0.71875rem] text-[var(--mp-muted)]">
              暂无自定义歌单，点击右上角「新建」创建。
            </div>
          ) : (
            playlists.map((pl) => {
              const active = activeCollection === pl.id && rightTab === 'tracks';
              const isRenaming = renamingPlId === pl.id;
              const isDeleting = confirmDeletePlId === pl.id;

              if (isRenaming) {
                return (
                  <div key={pl.id} className="flex items-center gap-1 bg-[var(--mp-surface-alt)] p-1">
                    <input
                      type="text"
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void renamePlaylist(pl.id, renamingName);
                          setRenamingPlId(null);
                        } else if (e.key === 'Escape') {
                          setRenamingPlId(null);
                        }
                      }}
                      autoFocus
                      className="min-w-0 flex-1 border border-[var(--mp-ink)] bg-[var(--mp-panel)] px-1.5 py-0.5 text-[0.75rem] text-[var(--mp-ink)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void renamePlaylist(pl.id, renamingName);
                        setRenamingPlId(null);
                      }}
                      className="swiss-btn-solid p-1"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={pl.id}
                  className={`group flex items-center justify-between gap-1 px-2 py-1.5 transition-colors ${
                    active
                      ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                      : 'text-[var(--mp-ink-2)] hover:bg-[var(--mp-surface-alt)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCollection(pl.id);
                      setRightTab('tracks');
                      if (window.innerWidth < 1024) setPlaylistsOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {pl.pinned && (
                      <Pin
                        className={`h-3 w-3 shrink-0 ${
                          active ? 'text-[var(--mp-signal)]' : 'text-[var(--mp-ochre)]'
                        }`}
                      />
                    )}
                    <span className="truncate text-[0.78125rem] font-semibold">{pl.name}</span>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {isDeleting ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            void removePlaylist(pl.id);
                            setConfirmDeletePlId(null);
                          }}
                          className="bg-[var(--mp-signal)] px-1.5 py-0.5 font-mono text-[0.625rem] font-bold text-white"
                        >
                          删
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePlId(null)}
                          className="px-1 py-0.5 font-mono text-[0.625rem] opacity-75"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-[0.6875rem] opacity-70 tabular-nums group-hover:hidden">
                          {pl.bookKeys.length}
                        </span>
                        <div className="hidden items-center gap-0.5 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => void togglePinPlaylist(pl.id)}
                            title={pl.pinned ? '取消置顶' : '置顶歌单'}
                            className="p-0.5 opacity-75 hover:opacity-100"
                          >
                            {pl.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingPlId(pl.id);
                              setRenamingName(pl.name);
                            }}
                            title="重命名"
                            className="px-1 font-mono text-[0.625rem] font-bold opacity-75 hover:opacity-100"
                          >
                            改
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePlId(pl.id)}
                            title="删除歌单"
                            className="p-0.5 opacity-75 hover:text-[var(--mp-signal)] hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  const zenRootStyle = zenMode
    ? ({
        '--mp-bg': 'var(--t-canvas)',
        '--mp-panel': isDark
          ? 'color-mix(in srgb, var(--t-surface-1) 82%, transparent)'
          : 'color-mix(in srgb, var(--t-surface-2) 86%, transparent)',
        '--mp-surface-alt': isDark
          ? 'color-mix(in srgb, var(--t-surface-2) 72%, transparent)'
          : 'color-mix(in srgb, var(--t-surface-1) 78%, transparent)',
        '--mp-ink': 'var(--t-ink)',
        '--mp-ink-2': 'var(--t-ink-2)',
        '--mp-muted': 'var(--t-ink-3)',
        '--mp-line': isDark
          ? 'color-mix(in srgb, var(--t-ink) 18%, transparent)'
          : 'color-mix(in srgb, var(--t-ink) 16%, transparent)',
        '--mp-rule': isDark
          ? 'color-mix(in srgb, var(--t-ink) 48%, transparent)'
          : 'color-mix(in srgb, var(--t-ink) 38%, transparent)',
        '--mp-signal': isDark ? posterPalette.vizSignal : posterPalette.accent,
        '--mp-ochre': isDark ? posterPalette.vizOchre : posterPalette.secondary,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className="swiss-player-root swiss-grid-bg relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden select-none"
      data-player-dark={isDark ? 'true' : 'false'}
      style={zenRootStyle}
    >
      {/* Top Swiss Masthead */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--mp-rule)] bg-[var(--mp-panel)] px-4 py-2 backdrop-blur-md sm:px-5">
        <div className="flex items-center gap-2.5">
          {!zenMode && (
            <button
              type="button"
              onClick={() => setPlaylistsOpen((v) => !v)}
              title={playlistsOpen ? '收起歌单侧栏' : '展开歌单侧栏'}
              className={`inline-flex h-8 items-center gap-1.5 px-2.5 text-[0.75rem] font-bold ${
                playlistsOpen ? 'swiss-btn-solid' : 'swiss-btn'
              }`}
            >
              {playlistsOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5 text-[var(--mp-signal)]" />
              )}
              <span>歌单</span>
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <OsuMusicMark className="h-6 w-6 text-[var(--mp-ink)]" active playing={isPlaying} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-[1rem] leading-none font-bold tracking-tight text-[var(--mp-ink)] sm:text-[1.125rem]">
                  OSU! AUDIO
                </h1>
                <span className="font-mono text-[0.6875rem] font-bold tracking-[0.1em] text-[var(--mp-muted)] uppercase">
                  // 音乐台
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.1em] text-[var(--mp-muted)] uppercase">
                <span>{zenMode ? 'FOCUS COVER' : activeCollectionLabel}</span>
                <span>·</span>
                <span>{playableBooks.length} LOCAL TRACKS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Controls: Visualizer (Spectrum/Scope), Cover Mode, Rhythm, Sleep Timer, Zen, Refresh, Background Tray */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Visualizer Mode Switcher (Spectrum & Oscilloscope) */}
          <div className="flex h-8 items-center border border-[var(--mp-line)] bg-[var(--mp-bg)] p-0.5" role="group" aria-label="可视化模式">
            {(
              [
                { id: 'bars', label: '频谱', icon: BarChart3 },
                { id: 'scope', label: '示波', icon: Activity },
              ] as Array<{ id: MusicVisualizerMode; label: string; icon: typeof BarChart3 }>
            ).map((opt) => {
              const Icon = opt.icon;
              const active = visualizerMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setVisualizerMode(opt.id)}
                  className={`inline-flex h-full items-center gap-1 px-2 text-[0.71875rem] font-bold transition-colors ${
                    active
                      ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                      : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Cover Mode Switcher */}
          <div className="flex h-8 items-center border border-[var(--mp-line)] bg-[var(--mp-bg)] p-0.5" role="group" aria-label="封面模式">
            {(
              [
                { id: 'poster', label: '画幅', icon: Image },
                { id: 'disc', label: '唱盘', icon: Disc3 },
              ] as Array<{ id: MusicCoverMode; label: string; icon: typeof Image }>
            ).map((opt) => {
              const Icon = opt.icon;
              const active = coverMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCoverMode(opt.id)}
                  className={`inline-flex h-full items-center gap-1 px-2 text-[0.71875rem] font-bold transition-colors ${
                    active
                      ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                      : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Rhythm Follow Level */}
          <div className="hidden h-8 items-center border border-[var(--mp-line)] bg-[var(--mp-bg)] p-0.5 sm:flex" role="group" aria-label="节奏跟随强度">
            <span className="px-1.5 font-mono text-[0.625rem] font-bold text-[var(--mp-muted)]">
              节奏
            </span>
            {(
              [
                { id: 'off', label: '关' },
                { id: 'subtle', label: '克制' },
                { id: 'standard', label: '标准' },
                { id: 'kinetic', label: '律动' },
              ] as Array<{ id: MusicRhythmIntensity; label: string }>
            ).map((opt) => {
              const active = rhythmFollow === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRhythmFollow(opt.id)}
                  className={`h-full px-2 text-[0.6875rem] font-bold transition-colors ${
                    active
                      ? 'bg-[var(--mp-signal)] text-white'
                      : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Reactive Particles Toggle */}
          <button
            type="button"
            onClick={toggleParticles}
            aria-pressed={particlesEnabled}
            title={particlesEnabled ? '关闭背景律动粒子' : '开启背景律动粒子'}
            className={`inline-flex h-8 items-center gap-1 px-2.5 text-[0.71875rem] font-bold ${
              particlesEnabled ? 'swiss-btn-signal' : 'swiss-btn'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">粒子</span>
          </button>

          {/* Sleep Timer */}
          <div ref={timerMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setTimerMenuOpen((v) => !v)}
              className={`inline-flex h-8 items-center gap-1.5 px-2.5 font-mono text-[0.6875rem] font-bold ${
                sleepTimer ? 'swiss-btn-signal' : 'swiss-btn'
              }`}
              title="定时暂停播放"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>
                {sleepTimer?.mode === 'minutes'
                  ? formatCompactDate(sleepTimer.remainingSec)
                  : sleepTimer?.mode === 'track_end'
                    ? '本曲后停'
                    : '定时'}
              </span>
            </button>

            {timerMenuOpen && (
              <div className="absolute top-9 right-0 z-30 w-40 border border-[var(--mp-rule)] bg-[var(--mp-panel)] p-1 shadow-xl">
                {[15, 30, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      startSleepTimerMinutes(m);
                      setTimerMenuOpen(false);
                    }}
                    className="block w-full px-2.5 py-1.5 text-left text-[0.75rem] font-semibold text-[var(--mp-ink)] hover:bg-[var(--mp-surface-alt)]"
                  >
                    {m} 分钟后暂停
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    startSleepTimerTrackEnd();
                    setTimerMenuOpen(false);
                  }}
                  className="block w-full px-2.5 py-1.5 text-left text-[0.75rem] font-semibold text-[var(--mp-ink)] hover:bg-[var(--mp-surface-alt)]"
                >
                  播完当前曲目
                </button>
                {sleepTimer && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelSleepTimer();
                      setTimerMenuOpen(false);
                    }}
                    className="mt-1 block w-full border-t border-[var(--mp-line)] px-2.5 py-1.5 text-left text-[0.75rem] font-bold text-[var(--mp-signal)] hover:bg-[var(--mp-surface-alt)]"
                  >
                    取消定时
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setZenMode((v) => !v)}
            className={`inline-flex h-8 items-center gap-1 px-2.5 text-[0.71875rem] font-bold ${
              zenMode ? 'swiss-btn-solid' : 'swiss-btn'
            }`}
            title="专注画报模式（聚焦封面、节奏与可视化）"
          >
            {zenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{zenMode ? '退出画报' : '专注画报'}</span>
          </button>

          <button
            type="button"
            disabled={loadingLibrary}
            onClick={() => void refreshLibrary(true)}
            title="重新扫描本地歌曲库"
            className="swiss-btn inline-flex h-8 w-8 items-center justify-center"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingLibrary ? 'animate-spin' : ''}`} />
          </button>

          {isElectron && (
            <button
              type="button"
              onClick={() => {
                void window.electronAPI?.hideToTray?.().then((ok) => {
                  if (ok) onNotify?.('已最小化至系统托盘继续纯播放音乐');
                });
              }}
              title="隐藏主窗口到系统托盘继续后台纯播放（点击托盘图标可呼回）"
              className="swiss-btn inline-flex h-8 items-center gap-1 px-2.5 text-[0.71875rem] font-bold"
            >
              <MinusCircle className="h-3.5 w-3.5 text-[var(--mp-signal)]" />
              <span className="hidden sm:inline">后台挂机</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace: Collapsible Playlists + Center Cover/Tracks + Full-Width Visualizer (or Zen Constructivist Stage) */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {zenMode ? (
          /* Zen Focus Cover Mode: Original High-Res Cover + Optional Audio-Reactive Particles + Harmonized Wide Visualizer */
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col justify-between overflow-hidden">
            <ConstructivistPosterBg
              track={currentTrack}
              isDark={isDark}
              onPaletteChange={setPosterPalette}
            />

            {particlesEnabled && (
              <MusicParticleCanvas
                isPlaying={isPlaying}
                isDark={isDark}
                theme={theme}
                zenMode
                rhythmFollow={rhythmFollow}
                playbackRate={playbackRate}
                className="pointer-events-none absolute inset-0 z-[5]"
              />
            )}

            <ZenPosterInfoCard
              track={currentTrack}
              trackIndexLabel={trackIndexLabel}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              isLiked={Boolean(currentTrack && likedSet.has(currentTrack.bookKey))}
              onToggleLike={() => {
                if (currentTrack) toggleLike(currentTrack.bookKey);
              }}
              onExitZen={() => setZenMode(false)}
            />

            {/* Harmonized Wide-Axis Visualizer Plinth */}
            <div
              className="relative z-10 mx-3.5 mb-3 overflow-hidden shadow-2xl backdrop-blur-md sm:mx-5 sm:mb-4"
              style={{
                backgroundColor: 'var(--mp-panel)',
                border: '1.5px solid var(--mp-rule)',
                borderTop: '2.5px solid var(--mp-signal)',
              }}
            >
              <MusicVisualizerCanvas
                mode={visualizerMode}
                isPlaying={isPlaying}
                isDark={isDark}
                theme={theme}
                rhythmFollow={rhythmFollow}
                playbackRate={playbackRate}
                customPalette={{
                  bg: 'transparent',
                  signal: isDark ? posterPalette.vizSignal : posterPalette.accent,
                  ochre: isDark ? posterPalette.vizOchre : posterPalette.secondary,
                }}
                className="h-[126px] w-full !border-0 !bg-transparent sm:h-[148px]"
              />
            </div>
          </div>
        ) : (
          <>
            {particlesEnabled && (
              <MusicParticleCanvas
                isPlaying={isPlaying}
                isDark={isDark}
                theme={theme}
                zenMode={false}
                rhythmFollow={rhythmFollow}
                playbackRate={playbackRate}
                className="pointer-events-none absolute inset-0 z-[1] opacity-80"
              />
            )}

            {/* Left: Collapsible Playlists Sidebar (default collapsed; lg+ inline, <lg slide-over drawer) */}
            {playlistsOpen && (
              <>
                <aside className="relative z-10 hidden w-[224px] shrink-0 border-r border-[var(--mp-line)] bg-[var(--mp-panel)] lg:block">
                  {playlistsSidebarContent}
                </aside>
                <div
                  className="absolute inset-0 z-30 flex bg-black/40 lg:hidden"
                  onClick={() => setPlaylistsOpen(false)}
                >
                  <aside
                    className="h-full w-[248px] border-r-2 border-[var(--mp-rule)] bg-[var(--mp-panel)] shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {playlistsSidebarContent}
                  </aside>
                </div>
              </>
            )}

            {/* Right of Sidebar: Cover Stage + Track List on Top Row, Full-Width Horizontal Visualizer on Bottom */}
            <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
                {/* Cover Stage + Beat Follow */}
                <section className="w-full shrink-0 border-b border-[var(--mp-line)] p-3 sm:p-3.5 lg:w-[316px] lg:overflow-y-auto lg:border-r lg:border-b-0 xl:w-[356px]">
                  <ConstructivistCoverStage
                    track={currentTrack}
                    trackIndexLabel={trackIndexLabel}
                    isPlaying={isPlaying}
                    playbackRate={playbackRate}
                    coverMode={coverMode}
                    rhythmFollow={rhythmFollow}
                    playlists={playlists}
                    isLiked={Boolean(currentTrack && likedSet.has(currentTrack.bookKey))}
                    canLoadIntoGame={canLoadIntoGame}
                    zenMode={false}
                    onToggleLike={() => {
                      if (currentTrack) toggleLike(currentTrack.bookKey);
                    }}
                    onAddToPlaylist={(plId) => {
                      if (currentTrack) void addBookToPlaylist(plId, currentTrack.bookKey);
                    }}
                    onCreatePlaylistWithTrack={() => {
                      if (currentTrack) {
                        setPendingSeedBookKey(currentTrack.bookKey);
                        setNewPlName(currentTrack.titleUnicode || currentTrack.title);
                        setCreateOpen(true);
                        setPlaylistsOpen(true);
                      }
                    }}
                    onPreviewBeatmap={onPreviewBeatmap}
                    onLoadIntoGame={onLoadIntoGame}
                    onOpenFolder={onOpenFolder}
                  />
                </section>

                {/* Track Index / Playback Queue */}
                <section className="flex min-h-[240px] min-w-0 flex-1 flex-col bg-[var(--mp-bg)]/60 lg:min-h-0">
            {/* Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--mp-line)] bg-[var(--mp-panel)] px-3 py-2 sm:px-4">
              <div className="flex items-center gap-1 border border-[var(--mp-line)] p-0.5">
                <button
                  type="button"
                  onClick={() => setRightTab('tracks')}
                  className={`px-2.5 py-1 text-[0.71875rem] font-bold transition-colors ${
                    rightTab === 'tracks'
                      ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                      : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  曲目列表 ({displayedTracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('queue')}
                  className={`px-2.5 py-1 text-[0.71875rem] font-bold transition-colors ${
                    rightTab === 'queue'
                      ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                      : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                  }`}
                >
                  播放队列 ({queue.length})
                </button>
              </div>

              {rightTab === 'tracks' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="relative flex h-7 items-center border border-[var(--mp-line)] bg-[var(--mp-bg)]">
                    <Search className="ml-2 h-3.5 w-3.5 text-[var(--mp-muted)]" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder="搜曲名 / 曲师 / 标签 (/)"
                      className="h-full w-36 bg-transparent pr-6 pl-1.5 text-[0.75rem] text-[var(--mp-ink)] outline-none placeholder:text-[var(--mp-muted)] sm:w-44"
                    />
                    {searchQ && (
                      <button
                        type="button"
                        onClick={() => setSearchQ('')}
                        aria-label="清空搜索"
                        className="absolute right-1 p-0.5 text-[var(--mp-muted)] hover:text-[var(--mp-ink)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="hidden h-7 items-center border border-[var(--mp-line)] p-0.5 sm:flex">
                    {(['all', 'stable', 'lazer'] as const).map((sf) => (
                      <button
                        key={sf}
                        type="button"
                        onClick={() => setSourceFilter(sf)}
                        className={`h-full px-1.5 text-[0.6875rem] font-bold ${
                          sourceFilter === sf
                            ? 'bg-[var(--mp-ink)] text-[var(--mp-bg)]'
                            : 'text-[var(--mp-muted)] hover:text-[var(--mp-ink)]'
                        }`}
                      >
                        {sf === 'all' ? '全部' : sf === 'stable' ? 'Stable' : 'Lazer'}
                      </button>
                    ))}
                  </div>

                  <div className="w-24">
                    <SelectField
                      value={sortBy}
                      onChange={(v) => setSortBy(v as TrackSortField)}
                      title="排序方式"
                      className="h-7 !rounded-[2px] !border-[var(--mp-line)] !bg-[var(--mp-bg)] text-[0.71875rem]"
                    >
                      <option value="default">默认排序</option>
                      <option value="recent">最近游玩</option>
                      <option value="title">曲名 A–Z</option>
                      <option value="plays">游玩次数</option>
                      <option value="bpm">曲目 BPM</option>
                      <option value="length">曲目时长</option>
                      <option value="stars">最高星数</option>
                    </SelectField>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlayAll(false)}
                    className="swiss-btn-solid inline-flex h-7 items-center gap-1 px-2.5 text-[0.71875rem] font-bold"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span>播放全部</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePlayAll(true)}
                    className="swiss-btn inline-flex h-7 items-center gap-1 px-2 text-[0.71875rem] font-semibold"
                    title="打乱顺序并播放当前列表"
                  >
                    <Shuffle className="h-3 w-3" />
                  </button>

                  {activeCustomPlaylist && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen((v) => !v)}
                      className={`inline-flex h-7 items-center gap-1 px-2.5 text-[0.71875rem] font-bold ${
                        pickerOpen ? 'swiss-btn-signal' : 'swiss-btn'
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{pickerOpen ? '完成选曲' : '添加曲目'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Playlist Track Picker Drawer */}
            {pickerOpen && activeCustomPlaylist && rightTab === 'tracks' && (
              <div className="shrink-0 border-b-2 border-[var(--mp-rule)] bg-[var(--mp-surface-alt)] px-3 py-2.5 sm:px-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[0.65625rem] font-bold tracking-[0.1em] text-[var(--mp-signal)] uppercase">
                    PICK LOCAL SONGS INTO 「{activeCustomPlaylist.name}」
                  </span>
                  <input
                    type="text"
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                    placeholder="过滤本地曲库添加到歌单..."
                    className="h-7 w-56 border border-[var(--mp-line)] bg-[var(--mp-panel)] px-2 text-[0.75rem] text-[var(--mp-ink)] outline-none focus:border-[var(--mp-ink)]"
                  />
                </div>
                <div className="mt-2 grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {pickerCandidates.map((b) => {
                    const added = activeCustomPlaylist.bookKeys.includes(b.bookKey);
                    return (
                      <button
                        key={b.bookKey}
                        type="button"
                        onClick={() => {
                          if (added) {
                            void removeBookFromPlaylist(activeCustomPlaylist.id, b.bookKey);
                          } else {
                            void addBookToPlaylist(activeCustomPlaylist.id, b.bookKey);
                          }
                        }}
                        className={`flex items-center justify-between gap-2 border px-2 py-1 text-left text-[0.75rem] transition-colors ${
                          added
                            ? 'border-[var(--mp-signal)] bg-[var(--mp-signal)]/10 font-bold text-[var(--mp-ink)]'
                            : 'border-[var(--mp-line)] bg-[var(--mp-panel)] text-[var(--mp-ink-2)] hover:border-[var(--mp-ink)]'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {b.titleUnicode || b.title} — {b.artistUnicode || b.artist}
                        </span>
                        <span className="font-mono shrink-0 text-[0.65625rem]">
                          {added ? '✓ 已加入' : '+ 加入'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Track Table Body */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingLibrary && playableBooks.length === 0 ? (
                <div className="flex h-full items-center justify-center gap-2 text-[var(--mp-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--mp-signal)]" />
                  <span className="font-mono text-[0.78125rem]">SCANNING LOCAL OSU! LIBRARY...</span>
                </div>
              ) : libraryError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-[0.875rem] font-semibold text-[var(--mp-ink)]">{libraryError}</p>
                  <button
                    type="button"
                    onClick={() => void refreshLibrary(true)}
                    className="swiss-btn-solid px-4 py-1.5 text-[0.75rem] font-bold"
                  >
                    重试扫描本地曲库
                  </button>
                </div>
              ) : rightTab === 'queue' ? (
                queue.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[var(--mp-muted)]">
                    <p className="text-[0.875rem] font-semibold">播放队列为空</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--mp-line)]">
                    {queue.map((b, idx) => {
                      const active = idx === currentIndex;
                      return (
                        <div
                          key={`${b.bookKey}-${idx}`}
                          onClick={() => playQueueIndex(idx)}
                          className={`swiss-track-row group relative flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors sm:px-4 ${
                            active
                              ? 'bg-[var(--mp-panel)]'
                              : 'hover:bg-[var(--mp-panel)]/70'
                          }`}
                        >
                          {active && (
                            <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-[var(--mp-signal)]" />
                          )}
                          <span className="w-8 shrink-0 font-mono text-[0.6875rem] font-bold text-[var(--mp-muted)] tabular-nums">
                            {String(idx + 1).padStart(3, '0')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-[0.8125rem] font-bold ${
                                active ? 'text-[var(--mp-signal)]' : 'text-[var(--mp-ink)]'
                              }`}
                            >
                              {b.titleUnicode || b.title}
                            </div>
                            <div className="truncate text-[0.71875rem] text-[var(--mp-muted)]">
                              {b.artistUnicode || b.artist} · {b.creator}
                            </div>
                          </div>
                          <span className="hidden font-mono text-[0.6875rem] text-[var(--mp-muted)] tabular-nums sm:inline">
                            {Math.round(b.bpm)} BPM
                          </span>
                          <span className="w-11 text-right font-mono text-[0.6875rem] text-[var(--mp-muted)] tabular-nums">
                            {formatDuration(b.lengthSec)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(idx);
                            }}
                            title="从队列移除"
                            className="p-1 text-[var(--mp-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--mp-signal)]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : displayedTracks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[var(--mp-muted)]">
                  <p className="text-[0.875rem] font-semibold text-[var(--mp-ink)]">
                    {activeCustomPlaylist ? '该歌单暂无曲目' : '没有匹配的本地歌曲'}
                  </p>
                  {activeCustomPlaylist && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="swiss-btn-signal px-3 py-1.5 text-[0.75rem] font-bold"
                    >
                      + 从本地曲库添加歌曲
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[var(--mp-line)]">
                  {displayedTracks.map((b, idx) => {
                    const active = currentTrack?.bookKey === b.bookKey;
                    const liked = likedSet.has(b.bookKey);
                    const menuOpen = rowMenuBookKey === b.bookKey;
                    return (
                      <div
                        key={b.bookKey}
                        onClick={() => playTrack(b, displayedTracks)}
                        className={`swiss-track-row group relative flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors sm:px-4 ${
                          active ? 'bg-[var(--mp-panel)]' : 'hover:bg-[var(--mp-panel)]/75'
                        }`}
                      >
                        {active && (
                          <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-[var(--mp-signal)]" />
                        )}
                        <span
                          className={`w-8 shrink-0 font-mono text-[0.6875rem] font-bold tabular-nums ${
                            active ? 'text-[var(--mp-signal)]' : 'text-[var(--mp-muted)]'
                          }`}
                        >
                          {active && isPlaying ? '▶' : String(idx + 1).padStart(3, '0')}
                        </span>

                        <div className="cover-frame relative h-8 w-8 shrink-0 overflow-hidden border border-[var(--mp-line)]">
                          <img
                            src={b.coverUrl}
                            alt=""
                            loading="lazy"
                            className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-[0.8125rem] font-bold ${
                              active ? 'text-[var(--mp-signal)]' : 'text-[var(--mp-ink)]'
                            }`}
                          >
                            {b.titleUnicode || b.title}
                          </div>
                          <div className="truncate text-[0.71875rem] text-[var(--mp-muted)]">
                            {b.artistUnicode || b.artist} · {b.creator}
                          </div>
                        </div>

                        <span className="hidden w-14 text-right font-mono text-[0.6875rem] text-[var(--mp-muted)] tabular-nums md:inline">
                          {Math.round(b.bpm)} BPM
                        </span>

                        <span className="w-11 text-right font-mono text-[0.6875rem] text-[var(--mp-muted)] tabular-nums">
                          {formatDuration(b.lengthSec)}
                        </span>

                        <div
                          className="relative flex shrink-0 items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => toggleLike(b.bookKey)}
                            title={liked ? '取消红心' : '红心收藏'}
                            className={`p-1 transition-colors ${
                              liked
                                ? 'text-[var(--mp-signal)]'
                                : 'text-[var(--mp-muted)] opacity-50 hover:opacity-100'
                            }`}
                          >
                            <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => enqueueTrackNext(b)}
                            title="下一首播放"
                            className="hidden p-1 text-[var(--mp-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--mp-ink)] sm:inline-flex"
                          >
                            <Play className="h-3 w-3" />
                          </button>

                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              setRowMenuBookKey((prev) => (prev === b.bookKey ? null : b.bookKey))
                            }
                            title="加入歌单"
                            className="p-1 text-[var(--mp-muted)] opacity-60 hover:text-[var(--mp-ink)] hover:opacity-100"
                          >
                            <ListPlus className="h-3.5 w-3.5" />
                          </button>

                          {activeCustomPlaylist && sortBy === 'default' && !searchQ && sourceFilter === 'all' && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() =>
                                  void reorderPlaylistTrack(activeCustomPlaylist.id, idx, idx - 1)
                                }
                                title="上移"
                                className="p-0.5 text-[var(--mp-muted)] hover:text-[var(--mp-ink)] disabled:opacity-25"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === displayedTracks.length - 1}
                                onClick={() =>
                                  void reorderPlaylistTrack(activeCustomPlaylist.id, idx, idx + 1)
                                }
                                title="下移"
                                className="p-0.5 text-[var(--mp-muted)] hover:text-[var(--mp-ink)] disabled:opacity-25"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void removeBookFromPlaylist(activeCustomPlaylist.id, b.bookKey)
                                }
                                title="从歌单移除"
                                className="p-1 text-[var(--mp-muted)] hover:text-[var(--mp-signal)]"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}

                          {menuOpen && (
                            <div
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute top-7 right-0 z-30 w-44 border border-[var(--mp-rule)] bg-[var(--mp-panel)] p-1 shadow-xl"
                            >
                              {playlists.map((pl) => (
                                <button
                                  key={pl.id}
                                  type="button"
                                  onClick={() => {
                                    void addBookToPlaylist(pl.id, b.bookKey);
                                    setRowMenuBookKey(null);
                                  }}
                                  className="flex w-full items-center justify-between px-2 py-1 text-left text-[0.71875rem] font-medium text-[var(--mp-ink)] hover:bg-[var(--mp-surface-alt)]"
                                >
                                  <span className="truncate">{pl.name}</span>
                                  <span className="font-mono text-[0.625rem] text-[var(--mp-muted)]">
                                    {pl.bookKeys.includes(b.bookKey) ? '✓' : '+'}
                                  </span>
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setRowMenuBookKey(null);
                                  setPendingSeedBookKey(b.bookKey);
                                  setNewPlName(b.titleUnicode || b.title);
                                  setCreateOpen(true);
                                  setPlaylistsOpen(true);
                                }}
                                className="mt-0.5 flex w-full items-center gap-1 border-t border-[var(--mp-line)] px-2 py-1 text-left text-[0.71875rem] font-bold text-[var(--mp-signal)] hover:bg-[var(--mp-surface-alt)]"
                              >
                                <Plus className="h-3 w-3" />
                                <span>新建歌单并加入</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
                </section>
              </div>

              {/* Full-Width Horizontal Visualizer Strip (Spectrum / Oscilloscope) */}
              <div className="h-[100px] w-full shrink-0 border-t border-[var(--mp-line)] bg-[var(--mp-panel)] sm:h-[112px] xl:h-[122px]">
                <MusicVisualizerCanvas
                  mode={visualizerMode}
                  isPlaying={isPlaying}
                  isDark={isDark}
                  theme={theme}
                  rhythmFollow={rhythmFollow}
                  playbackRate={playbackRate}
                  className="h-full w-full !border-0"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Swiss Transport, Speed/Rate & Volume Deck */}
      <MusicTransportDeck />
    </div>
  );
}
