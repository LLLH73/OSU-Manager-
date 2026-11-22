import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Download, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { TARGET_META, formatDuration } from '../constants';
import { DownloadTarget, NormalizedBeatmapset } from '../types';

interface AudioPlayerBarProps {
  beatmapset: NormalizedBeatmapset | null;
  playing: boolean;
  activeTarget: DownloadTarget;
  onTogglePlay: () => void;
  onStop: () => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
}

export function AudioPlayerBar({
  beatmapset,
  playing,
  activeTarget,
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
  const targetMeta = TARGET_META[activeTarget];

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-40 flex justify-center lg:left-[280px]">
      <div className="glass animate-dock-in pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-3 rounded-2xl px-3.5 py-2.5">
        <audio
          ref={audioRef}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onEnded={() => onTogglePlay()}
          onError={() => setErrorMsg('试听加载失败')}
        />

        {/* Cover & Track Meta */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-[9px] border border-hairline bg-surface-1">
            <img
              src={beatmapset.coverUrl}
              alt={beatmapset.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute right-1 bottom-1 flex items-center rounded bg-black/70 px-1 py-0.5 text-osu">
              <span className={`eq h-[9px] ${!playing ? 'eq-paused' : ''}`}>
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-display truncate text-[13px] font-bold text-ink">{beatmapset.title}</div>
            <div className="truncate text-[11px] text-ink-2">
              {beatmapset.artist}
              {errorMsg && <span className="ml-2 text-bad">({errorMsg})</span>}
            </div>
          </div>
        </div>

        {/* Transport & Seek */}
        <div className="flex w-full items-center gap-2.5 sm:w-auto sm:min-w-[300px] sm:flex-[1.35]">
          <button
            type="button"
            onClick={onTogglePlay}
            className="btn-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            title={playing ? '暂停试听' : '播放试听'}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>

          <span className="font-mono w-9 text-right text-[11px] text-ink-3 tabular-nums">
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
            className="slim-range flex-1"
            aria-label="试听进度"
          />
          <span className="font-mono w-9 text-[11px] text-ink-3 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Volume & Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="btn btn-icon btn-sm"
            title={muted ? '取消静音' : '静音'}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-ink-3" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-ink-2" />
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
            className="slim-range hidden w-16 md:block"
            aria-label="音量"
          />
          <button
            type="button"
            onClick={() => onDownload(beatmapset, activeTarget)}
            className={`btn btn-sm ml-1 ${targetMeta.btnCls}`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>下载</span>
          </button>
          <button
            type="button"
            onClick={onStop}
            className="btn btn-icon btn-sm"
            title="关闭试听栏"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
