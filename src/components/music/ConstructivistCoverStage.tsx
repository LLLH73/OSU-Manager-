import { useEffect, useRef, useState } from 'react';
import { Eye, FolderOpen, Gamepad2, Heart, ListPlus, Plus } from 'lucide-react';
import type { BookSummary, MusicPlaylist } from '../../types';
import { MarqueeText } from '../MarqueeText';
import {
  useMusicPlayer,
  type MusicCoverMode,
  type MusicRhythmIntensity,
} from './MusicPlayerContext';
import { OsuMusicMark } from './OsuMusicMark';
import { computeBeatState, extractAudioBands } from './rhythmEngine';

interface ConstructivistCoverStageProps {
  track: BookSummary | null;
  trackIndexLabel: string;
  isPlaying: boolean;
  playbackRate: number;
  coverMode: MusicCoverMode;
  rhythmFollow: MusicRhythmIntensity;
  playlists: MusicPlaylist[];
  isLiked: boolean;
  canLoadIntoGame: boolean;
  zenMode?: boolean;
  onToggleLike: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  onCreatePlaylistWithTrack: () => void;
  onPreviewBeatmap?: (setId: number, beatmapId?: number | null, title?: string) => void;
  onLoadIntoGame?: (setId: number) => void;
  onOpenFolder?: (subFolder: string) => void;
}

const RHYTHM_SCALE: Record<MusicRhythmIntensity, number> = {
  off: 0,
  subtle: 0.45,
  standard: 1.0,
  kinetic: 1.5,
};

export function ConstructivistCoverStage({
  track,
  trackIndexLabel,
  isPlaying,
  playbackRate,
  coverMode,
  rhythmFollow,
  playlists,
  isLiked,
  canLoadIntoGame,
  zenMode = false,
  onToggleLike,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
  onPreviewBeatmap,
  onLoadIntoGame,
  onOpenFolder,
}: ConstructivistCoverStageProps) {
  const { audioRef, analyserRef, audioContextRef, rhythmDataRef, rhythmData } = useMusicPlayer();
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const playlistMenuRef = useRef<HTMLDivElement | null>(null);

  const pulseBorderRef = useRef<HTMLDivElement | null>(null);
  const discSpinRef = useRef<HTMLDivElement | null>(null);
  const tonearmRef = useRef<HTMLDivElement | null>(null);
  const bpmReadoutRef = useRef<HTMLSpanElement | null>(null);
  const barReadoutRef = useRef<HTMLSpanElement | null>(null);
  const kiaiBadgeRef = useRef<HTMLSpanElement | null>(null);
  const beatCellsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const discAngleRef = useRef<number>(0);

  const meter = Math.min(8, Math.max(1, rhythmData?.timingPoints[0]?.meter ?? 4));
  const baseBpm = rhythmData?.baseBpm ?? track?.bpm ?? 120;
  const effectiveBpm = Math.round(baseBpm * playbackRate * 10) / 10;

  useEffect(() => {
    if (!playlistMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setPlaylistMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [playlistMenuOpen]);

  // Reset turntable rotation angle cleanly when leaving disc mode or changing tracks
  useEffect(() => {
    if (coverMode !== 'disc') {
      discAngleRef.current = 0;
      if (discSpinRef.current) {
        discSpinRef.current.style.transform = '';
      }
    }
  }, [coverMode, track?.bookKey]);

  useEffect(() => {
    discAngleRef.current = 0;
  }, [track?.bookKey]);

  // 60fps DOM-ref driven rhythm metronome, cover caliper & turntable spin (0 React re-renders)
  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastTs = performance.now();
    let prevLow = 0;
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;

    const updateVisualRefs = (now: number) => {
      const dt = Math.min(0.08, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const el = audioRef.current;
      const curMs = (el?.currentTime ?? 0) * 1000;
      const durMs = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 1;
      const beat = computeBeatState(
        curMs,
        playbackRate,
        rhythmDataRef.current,
        track?.bpm ?? 120,
      );

      let bassBoost = 0;
      const analyser = analyserRef.current;
      if (analyser && isPlaying) {
        if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqBuf);
        const bands = extractAudioBands(
          freqBuf,
          audioContextRef.current?.sampleRate ?? 44100,
          prevLow,
        );
        prevLow = bands.lowEnergy;
        bassBoost = bands.subBass * 0.6 + bands.onsetImpulse * 0.4;
      }

      const rScale = reducedMotion ? 0.2 : RHYTHM_SCALE[rhythmFollow];
      const pulse = isPlaying ? Math.min(1, beat.beatPulse * 0.72 + bassBoost * 0.45) * rScale : 0;

      if (pulseBorderRef.current) {
        pulseBorderRef.current.style.opacity =
          rhythmFollow === 'off' ? '0' : String(Math.min(1, 0.14 + pulse * 0.86));
        pulseBorderRef.current.style.transform =
          rhythmFollow === 'off'
            ? 'scale(1)'
            : `scale(${(1 + pulse * 0.016).toFixed(4)})`;
      }

      if (discSpinRef.current && coverMode === 'disc') {
        if (isPlaying && !reducedMotion) {
          // 33.33 RPM * playbackRate => 200 deg/sec * playbackRate
          discAngleRef.current = (discAngleRef.current + dt * 110 * playbackRate) % 360;
        }
        discSpinRef.current.style.transform = `rotate(${discAngleRef.current.toFixed(2)}deg) scale(${(
          1 +
          pulse * 0.015
        ).toFixed(4)})`;
      }

      if (tonearmRef.current && coverMode === 'disc') {
        const progress = Math.min(1, Math.max(0, curMs / durMs));
        // Paused: parked cleanly on right-side rest (~2deg); Playing: tracking outer->inner vinyl grooves (21deg..33deg)
        const armDeg = isPlaying ? 21 + progress * 12 + pulse * 0.6 : 2;
        tonearmRef.current.style.transform = `rotate(${armDeg.toFixed(2)}deg)`;
      }

      if (bpmReadoutRef.current) {
        bpmReadoutRef.current.textContent = `${beat.effectiveBpm.toFixed(1)}`;
      }
      if (barReadoutRef.current) {
        const barNo = Math.max(1, beat.measureIndex + 1);
        const beatNo = beat.beatInBar + 1;
        barReadoutRef.current.textContent = `BAR ${String(barNo).padStart(3, '0')} · B${beatNo}`;
      }
      if (kiaiBadgeRef.current) {
        kiaiBadgeRef.current.dataset.active = isPlaying && beat.isKiai ? 'true' : 'false';
      }

      const activeSlot = isPlaying ? beat.beatInBar : -1;
      for (let i = 0; i < beatCellsRef.current.length; i += 1) {
        const cell = beatCellsRef.current[i];
        if (!cell) continue;
        const isOn = i === activeSlot;
        cell.dataset.active = isOn ? 'true' : 'false';
        cell.dataset.downbeat = isOn && i === 0 ? 'true' : 'false';
      }
    };

    const loop = (now: number) => {
      if (document.hidden) {
        rafId = 0;
        return;
      }
      updateVisualRefs(now);
      if (isPlaying) {
        rafId = window.requestAnimationFrame(loop);
      } else {
        rafId = 0;
      }
    };

    updateVisualRefs(performance.now());
    if (isPlaying && !document.hidden) {
      rafId = window.requestAnimationFrame(loop);
    }

    const onVisChange = () => {
      if (!document.hidden && isPlaying && !rafId) {
        lastTs = performance.now();
        rafId = window.requestAnimationFrame(loop);
      } else if (document.hidden && rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    isPlaying,
    playbackRate,
    coverMode,
    rhythmFollow,
    track?.bookKey,
    track?.bpm,
    analyserRef,
    audioContextRef,
    audioRef,
    rhythmDataRef,
  ]);

  if (!track) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center border border-[var(--mp-line)] bg-[var(--mp-panel)] p-6 text-center">
        <OsuMusicMark className="h-11 w-11 text-[var(--mp-ink)]" active />
        <p className="mt-4 font-display text-[1rem] font-bold tracking-tight text-[var(--mp-ink)]">
          选择左侧或右侧本地曲目开始播放
        </p>
        <p className="mt-1 font-mono text-[0.6875rem] tracking-[0.12em] text-[var(--mp-muted)] uppercase">
          SELECT LOCAL OSU! TRACK TO INITIALIZE DECK
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col border border-[var(--mp-line)] bg-[var(--mp-panel)] p-3 sm:p-3.5">
      {/* Swiss Header Strip */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-[var(--mp-line)] pb-2 font-mono text-[0.625rem] font-semibold tracking-[0.08em] text-[var(--mp-muted)] uppercase">
        <span
          className="flex min-w-0 max-w-full items-center gap-1.5"
          title={track.beatmapsetId ? `${trackIndexLabel} · SET #${track.beatmapsetId}` : trackIndexLabel}
        >
          <span className="inline-block h-2 w-2 shrink-0 bg-[var(--mp-signal)]" />
          <span className="shrink-0 whitespace-nowrap">{trackIndexLabel}</span>
          {track.beatmapsetId && (
            <span className="min-w-0 truncate whitespace-nowrap">· SET #{track.beatmapsetId}</span>
          )}
        </span>
        <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
          {track.inStable && (
            <span className="whitespace-nowrap border border-[var(--mp-line)] px-1.5 py-0.5 text-[0.5625rem] leading-none tracking-[0.06em] text-[var(--mp-ink)]">
              STABLE
            </span>
          )}
          {track.inLazer && (
            <span className="whitespace-nowrap border border-[var(--mp-line)] px-1.5 py-0.5 text-[0.5625rem] leading-none tracking-[0.06em] text-[var(--mp-ink)]">
              LAZER
            </span>
          )}
          <span
            ref={kiaiBadgeRef}
            data-active="false"
            className="whitespace-nowrap border border-[var(--mp-line)] px-1.5 py-0.5 text-[0.5625rem] leading-none font-bold tracking-[0.06em] text-[var(--mp-muted)] transition-colors data-[active=true]:border-[var(--mp-signal)] data-[active=true]:bg-[var(--mp-signal)] data-[active=true]:text-white"
          >
            KIAI
          </span>
        </div>
      </div>

      {/* Cover Stage: Poster vs Frameless Swiss Disc */}
      <div className={`relative mt-2.5 flex items-center justify-center ${zenMode ? 'py-2' : ''}`}>
        {coverMode === 'poster' ? (
          <div
            key="cover-mode-poster"
            className={`relative w-full overflow-hidden border border-[var(--mp-rule)] bg-black/10 ${
              zenMode ? 'max-w-[540px] aspect-[16/9.5]' : 'aspect-[16/9]'
            }`}
          >
            {/* Outer beat-reactive geometric frame (never transforms cover img container) */}
            <div
              ref={pulseBorderRef}
              className="pointer-events-none absolute inset-1.5 z-20 border border-[var(--mp-signal)] transition-opacity duration-75"
              style={{ opacity: 0 }}
            />
            <div className="cover-frame h-full w-full">
              <img
                key={track.bookKey}
                src={track.coverUrl}
                alt={track.titleUnicode || track.title}
                className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
            </div>

            {/* Constructivist Corner Red Block & Registration Marks */}
            <div className="pointer-events-none absolute top-0 left-0 z-20 flex items-center gap-1.5 bg-[var(--mp-signal)] px-2 py-1 font-mono text-[0.625rem] font-bold tracking-[0.1em] text-white">
              <span>PROUN</span>
              <span>//</span>
              <span>{track.has4k ? '4K' : track.keyCounts.map((k) => `${k}K`).join('/') || 'OSU'}</span>
            </div>
            <div className="pointer-events-none absolute right-2 bottom-2 z-20 bg-black/72 px-2 py-0.5 font-mono text-[0.65625rem] font-semibold text-white">
              ★ {track.minStars.toFixed(1)}–{track.maxStars.toFixed(1)}
            </div>
          </div>
        ) : (
          /* Frameless Braun SK-4 / Swiss Turntable Disc Mode */
          <div
            key="cover-mode-disc"
            className="relative flex w-full items-center justify-center py-0.5"
          >
            <div className="relative mx-auto h-[188px] w-[240px] shrink-0">
              {/* Spinning Vinyl Record Platter (center at 96,94; radius 88px) */}
              <div
                ref={discSpinRef}
                className="absolute top-[6px] left-[8px] z-10 flex h-[176px] w-[176px] items-center justify-center rounded-full border-2 border-[var(--mp-rule)] bg-[#141414] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.48)]"
              >
                {/* Vinyl groove rings (outer rim -> inner label) */}
                <div className="pointer-events-none absolute inset-2.5 rounded-full border border-white/15" />
                <div className="pointer-events-none absolute inset-5 rounded-full border border-white/10" />
                <div className="pointer-events-none absolute inset-7 rounded-full border border-white/10" />
                <div className="relative h-[52%] w-[52%] overflow-hidden rounded-full border border-white/30">
                  <img
                    key={track.bookKey}
                    src={track.coverUrl}
                    alt={track.titleUnicode || track.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                {/* Center Constructivist Signal Spindle */}
                <div className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--mp-signal)]" />
              </div>

              {/* Tonearm Park Rest Bracket (outside vinyl radius at right) */}
              <div
                className="pointer-events-none absolute top-[116px] left-[199px] z-10 h-3 w-3 border border-[var(--mp-line)] bg-[var(--mp-panel)]"
                aria-hidden="true"
              />

              {/* Precision Swiss Tonearm (pivot at 204,20; length 108px drops stylus onto vinyl grooves when playing) */}
              <div
                ref={tonearmRef}
                className="pointer-events-none absolute top-[20px] left-[204px] z-20 h-0 w-0"
                style={{
                  transformOrigin: '0px 0px',
                  transform: isPlaying ? 'rotate(21deg)' : 'rotate(2deg)',
                  transition: isPlaying
                    ? 'transform 90ms linear'
                    : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <svg
                  width="48"
                  height="140"
                  viewBox="-24 -20 48 140"
                  className="overflow-visible -translate-x-6 -translate-y-5"
                  aria-hidden="true"
                >
                  {/* Counterweight behind pivot */}
                  <rect
                    x="-4.5"
                    y="-15"
                    width="9"
                    height="10"
                    fill="var(--mp-ink)"
                    stroke="var(--mp-panel)"
                    strokeWidth="0.75"
                  />
                  {/* Gimbal pivot base */}
                  <circle
                    cx="0"
                    cy="0"
                    r="6.5"
                    fill="var(--mp-panel)"
                    stroke="var(--mp-rule)"
                    strokeWidth="2"
                  />
                  <circle cx="0" cy="0" r="2.2" fill="var(--mp-signal)" />
                  {/* Straight precision arm tube */}
                  <line
                    x1="0"
                    y1="6.5"
                    x2="0"
                    y2="98"
                    stroke="var(--mp-rule)"
                    strokeWidth="2.5"
                    strokeLinecap="square"
                  />
                  {/* Offset headshell & Constructivist red cartridge over vinyl */}
                  <rect
                    x="-4.2"
                    y="98"
                    width="8.4"
                    height="14"
                    rx="1"
                    fill="var(--mp-signal)"
                    stroke="var(--mp-ink)"
                    strokeWidth="1"
                  />
                  <circle cx="0" cy="108" r="1.6" fill="#ffffff" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Editorial Track Identity + 2px Swiss Rule */}
      <div className="mt-3">
        <MarqueeText
          text={track.titleUnicode || track.title}
          mode="always"
          className="font-display text-[1.15rem] leading-snug font-bold tracking-tight text-[var(--mp-ink)]"
        />
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[0.78125rem] text-[var(--mp-muted)]">
          <span className="truncate font-medium">
            {track.artistUnicode || track.artist} · <span className="text-[var(--mp-ink-2)]">{track.creator}</span>
          </span>
          <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums">
            {track.playCount > 0 ? `${track.playCount} 次游玩` : `${track.difficultyCount} 难度`}
          </span>
        </div>
        <div className="mt-2.5 h-[2px] w-full bg-[var(--mp-rule)]" />
      </div>

      {/* Beat Follow Metronome Matrix + Live BPM Telemetry */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mp-line)] pb-2.5">
        <div className="flex items-center gap-1" role="status" aria-label="节拍矩阵">
          {Array.from({ length: Math.min(8, meter) }, (_, i) => (
            <span
              key={i}
              ref={(node) => {
                beatCellsRef.current[i] = node;
              }}
              data-active="false"
              data-downbeat="false"
              className="inline-flex h-5 min-w-[24px] items-center justify-center border border-[var(--mp-line)] font-mono text-[0.625rem] font-bold text-[var(--mp-muted)] transition-colors duration-75 data-[active=true]:border-[var(--mp-ink)] data-[active=true]:bg-[var(--mp-ink)] data-[active=true]:text-[var(--mp-bg)] data-[downbeat=true]:border-[var(--mp-signal)] data-[downbeat=true]:bg-[var(--mp-signal)] data-[downbeat=true]:text-white"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 font-mono text-[0.6875rem] tabular-nums">
          <span ref={barReadoutRef} className="text-[var(--mp-muted)]">
            BAR 001 · B1
          </span>
          <span className="font-bold text-[var(--mp-ink)]">
            <span ref={bpmReadoutRef}>{effectiveBpm.toFixed(1)}</span>{' '}
            <span className="text-[var(--mp-signal)]">BPM</span>
          </span>
        </div>
      </div>

      {/* Quick Actions: Like, Add to Playlist, Preview Mania, Load into Game, Folder */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleLike}
          className={`inline-flex h-7 items-center gap-1.5 px-2.5 text-[0.71875rem] font-semibold ${
            isLiked ? 'swiss-btn-signal' : 'swiss-btn'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
          <span>{isLiked ? '已红心' : '红心'}</span>
        </button>

        <div ref={playlistMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setPlaylistMenuOpen((v) => !v)}
            className="swiss-btn inline-flex h-7 items-center gap-1.5 px-2.5 text-[0.71875rem] font-semibold"
          >
            <ListPlus className="h-3.5 w-3.5" />
            <span>加入歌单</span>
          </button>

          {playlistMenuOpen && (
            <div className="absolute bottom-8 left-0 z-30 w-52 border border-[var(--mp-rule)] bg-[var(--mp-panel)] p-1.5 shadow-xl">
              <div className="border-b border-[var(--mp-line)] px-1.5 py-1 font-mono text-[0.625rem] font-bold tracking-[0.1em] text-[var(--mp-muted)] uppercase">
                ADD TO PLAYLIST
              </div>
              <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {playlists.length === 0 ? (
                  <div className="px-2 py-2 text-[0.71875rem] text-[var(--mp-muted)]">
                    暂无自定义歌单
                  </div>
                ) : (
                  playlists.map((pl) => {
                    const exists = pl.bookKeys.includes(track.bookKey);
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => {
                          onAddToPlaylist(pl.id);
                          setPlaylistMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[0.75rem] font-medium text-[var(--mp-ink)] hover:bg-[var(--mp-surface-alt)]"
                      >
                        <span className="truncate">{pl.name}</span>
                        <span className="font-mono text-[0.65625rem] text-[var(--mp-muted)]">
                          {exists ? '已存在' : `${pl.bookKeys.length}`}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlaylistMenuOpen(false);
                  onCreatePlaylistWithTrack();
                }}
                className="mt-1 flex w-full items-center gap-1.5 border-t border-[var(--mp-line)] px-2 py-1.5 text-left text-[0.75rem] font-bold text-[var(--mp-signal)] hover:bg-[var(--mp-surface-alt)]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>新建歌单并加入</span>
              </button>
            </div>
          )}
        </div>

        {track.beatmapsetId && track.modes.includes(3) && onPreviewBeatmap && (
          <button
            type="button"
            onClick={() =>
              onPreviewBeatmap(track.beatmapsetId!, null, track.titleUnicode || track.title)
            }
            className="swiss-btn inline-flex h-7 items-center gap-1 px-2 text-[0.71875rem] font-semibold"
            title="打开 Mania 谱面预览"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>看谱</span>
          </button>
        )}

        {track.beatmapsetId && canLoadIntoGame && onLoadIntoGame && (
          <button
            type="button"
            onClick={() => onLoadIntoGame(track.beatmapsetId!)}
            className="swiss-btn inline-flex h-7 items-center gap-1 px-2 text-[0.71875rem] font-semibold"
            title="载入正在运行的 osu! 客户端"
          >
            <Gamepad2 className="h-3.5 w-3.5 text-[var(--mp-signal)]" />
            <span>载入 osu!</span>
          </button>
        )}

        {track.stableFolder && onOpenFolder && (
          <button
            type="button"
            onClick={() => onOpenFolder(track.stableFolder!)}
            className="swiss-btn inline-flex h-7 items-center gap-1 px-2 text-[0.71875rem] font-semibold"
            title="打开本地文件夹"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
