import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Download, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { formatDuration } from '../constants';
import { DownloadTarget, NormalizedBeatmapset } from '../types';
import { MarqueeText } from './MarqueeText';

interface AudioPlayerBarProps {
  beatmapset: NormalizedBeatmapset | null;
  playing: boolean;
  activeTarget: DownloadTarget;
  sidebarCollapsed?: boolean;
  rightRailOpen?: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
}

export function AudioPlayerBar({
  beatmapset,
  playing,
  activeTarget,
  sidebarCollapsed = false,
  rightRailOpen = false,
  onTogglePlay,
  onStop,
  onDownload,
}: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.6);
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !beatmapset) return;
    setErrorMsg(null);
    setCurrentTime(0);
    setDuration(0);
    el.src = beatmapset.previewUrl;
    el.volume = muted ? 0 : volume;
    if (playing) {
      el.play().catch(() => {
        setErrorMsg('试听加载失败');
      });
    }
  }, [beatmapset?.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !beatmapset) return;
    if (playing) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [playing, beatmapset]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  if (!beatmapset) return null;

  const seekMax = duration > 0 ? duration : 10;
  const seekFillPct = Math.min(100, Math.max(0, (currentTime / seekMax) * 100));
  const volFillPct = Math.round((muted ? 0 : volume) * 100);

  return (
    <div
      className={`pointer-events-none fixed right-4 bottom-4 left-4 z-40 flex justify-center transition-[left,right] duration-250 ${
        sidebarCollapsed ? 'lg:left-4' : 'lg:left-[calc(var(--sidebar-w)+16px)]'
      } ${rightRailOpen ? '2xl:right-[calc(var(--right-sidebar-w)+16px)]' : ''}`}
    >
      <div className="animate-dock-in pointer-events-auto flex w-full max-w-[740px] flex-wrap items-center gap-3 rounded-2xl border border-hairline-strong bg-surface-2/90 px-3.5 py-2 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-full">
        <audio
          ref={audioRef}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onEnded={() => onTogglePlay()}
          onError={() => setErrorMsg('试听加载失败')}
        />

        {/* Circular Cover & Quiet Track Meta */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-hairline bg-surface-1">
            <img
              src={beatmapset.coverUrl}
              alt={beatmapset.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <MarqueeText
              text={beatmapset.title}
              className="font-display text-[0.8125rem] font-bold text-ink"
            />
            <div className="flex items-center gap-1.5 truncate text-[0.75rem] font-medium text-ink-3">
              <span className="truncate">{beatmapset.artist}</span>
              <span className={`eq h-[8px] shrink-0 text-osu ${!playing ? 'eq-paused' : ''}`}>
                <i />
                <i />
                <i />
                <i />
              </span>
              {errorMsg && <span className="shrink-0 text-bad">({errorMsg})</span>}
            </div>
          </div>
        </div>

        {/* Transport & Ultra-Slim 2px Scrubber */}
        <div className="flex w-full items-center gap-2.5 sm:w-auto sm:min-w-[260px] sm:flex-[1.25]">
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-osu text-white transition-transform hover:scale-[1.04]"
            title={playing ? '暂停试听' : '播放试听'}
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
            )}
          </button>

          <span className="font-mono w-8 text-right text-[0.71875rem] text-ink-3 tabular-nums">
            {formatDuration(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const t = Number(e.target.value);
              setCurrentTime(t);
              if (audioRef.current) audioRef.current.currentTime = t;
            }}
            style={{ '--fill': `${seekFillPct}%` } as CSSProperties}
            className="impeccable-range flex-1"
            aria-label="试听进度"
          />
          <span className="font-mono w-8 text-[0.71875rem] text-ink-3 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Restrained Volume, Pill Download CTA & Close */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
            title={muted ? '取消静音' : '静音'}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-ink-3" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setMuted(false);
              setVolume(Number(e.target.value));
            }}
            style={{ '--fill': `${volFillPct}%` } as CSSProperties}
            className="impeccable-range hidden w-14 md:block"
            aria-label="音量"
          />
          <button
            type="button"
            onClick={() => onDownload(beatmapset, activeTarget)}
            className="ml-1 inline-flex min-h-[28px] items-center gap-1.5 rounded-full bg-ink px-3 text-[0.75rem] font-semibold text-canvas transition-opacity hover:opacity-88"
          >
            <Download className="h-3 w-3" />
            <span>下载</span>
          </button>
          <button
            type="button"
            onClick={onStop}
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-tint-hover hover:text-ink"
            title="关闭试听栏"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
