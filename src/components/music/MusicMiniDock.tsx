import {
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatDuration } from '../../constants';
import { useI18n } from '../../i18n';
import { MarqueeText } from '../MarqueeText';
import { useMusicPlayer, useMusicTime } from './MusicPlayerContext';
import { OsuMusicMark } from './OsuMusicMark';

interface MusicMiniDockProps {
  sidebarCollapsed?: boolean;
  rightRailOpen?: boolean;
  inBookMode?: boolean;
  onOpenPlayer: () => void;
}

export function MusicMiniDock({
  sidebarCollapsed = false,
  rightRailOpen = false,
  inBookMode = false,
  onOpenPlayer,
}: MusicMiniDockProps) {
  const {
    currentTrack,
    isPlaying,
    playbackRate,
    volume,
    muted,
    togglePlay,
    prevTrack,
    nextTrack,
    toggleMute,
    stopAndClear,
  } = useMusicPlayer();
  const { currentTime, duration } = useMusicTime();
  const { t } = useI18n();

  if (!currentTrack) return null;

  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className={`swiss-mini-dock pointer-events-none fixed right-4 left-4 z-40 flex justify-center transition-[left,right,bottom] duration-250 ${
        inBookMode ? 'bottom-[82px]' : 'bottom-4'
      } ${
        sidebarCollapsed ? 'lg:left-4' : 'lg:left-[calc(var(--sidebar-w)+16px)]'
      } ${rightRailOpen ? '2xl:right-[calc(var(--right-sidebar-w)+16px)]' : ''}`}
    >
      <div className="animate-dock-in pointer-events-auto relative flex w-full max-w-[780px] items-center gap-3 overflow-hidden rounded-[4px] border border-hairline-strong bg-surface-2/94 px-3 py-2 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {/* Bottom slim Swiss progress bar */}
        <div
          className="pointer-events-none absolute right-0 bottom-0 left-0 h-[2px] bg-hairline"
          aria-hidden="true"
        >
          <div
            className="h-full bg-[var(--mp-signal)] transition-[width] duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Left signal bar */}
        <span
          className={`h-8 w-[3px] shrink-0 transition-colors ${
            isPlaying ? 'bg-[var(--mp-signal)]' : 'bg-ink-4'
          }`}
        />

        {/* Square Cover */}
        <button
          type="button"
          onClick={onOpenPlayer}
          title={t('进入 OSU 音乐台', 'Open OSU! Audio Station')}
          className="cover-frame relative h-9 w-9 shrink-0 overflow-hidden border border-hairline bg-surface-1"
        >
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.titleUnicode || currentTrack.title}
            className="absolute -inset-[1px] h-[calc(100%+2px)] w-[calc(100%+2px)] object-cover"
          />
        </button>

        {/* Track Title & Meta */}
        <button
          type="button"
          onClick={onOpenPlayer}
          className="min-w-0 flex-1 text-left"
          title={t('点击返回音乐台界面', 'Click to return to Audio Station')}
        >
          <MarqueeText
            text={currentTrack.titleUnicode || currentTrack.title}
            className="font-display text-[0.8125rem] font-bold text-ink"
          />
          <div className="flex items-center gap-2 truncate text-[0.71875rem] text-ink-3">
            <span className="truncate">{currentTrack.artistUnicode || currentTrack.artist}</span>
            <span className="font-mono shrink-0 text-[0.6875rem] tabular-nums">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>
        </button>

        {/* Transport Controls */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={prevTrack}
            title={t('上一首', 'Previous track')}
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? t('暂停播放', 'Pause') : t('继续播放', 'Play')}
            className={`flex h-8 w-8 items-center justify-center rounded-[2px] text-white transition-opacity hover:opacity-90 ${
              isPlaying ? 'bg-[var(--mp-signal)]' : 'bg-ink text-canvas'
            }`}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
            )}
          </button>

          <button
            type="button"
            onClick={nextTrack}
            title={t('下一首', 'Next track')}
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Rate, Mute, Open Player, Close */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden rounded-[2px] border border-hairline px-1.5 py-0.5 font-mono text-[0.6875rem] font-bold text-ink-2 tabular-nums sm:inline-block">
            {playbackRate.toFixed(2)}×
          </span>

          <button
            type="button"
            onClick={toggleMute}
            title={muted ? t('取消静音', 'Unmute') : t('静音', 'Mute')}
            className="hidden h-7 w-7 items-center justify-center rounded-[2px] text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink sm:flex"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-ink-3" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenPlayer}
            className="inline-flex h-7 items-center gap-1.5 rounded-[2px] border border-hairline-strong bg-surface-1 px-2.5 text-[0.71875rem] font-bold text-ink transition-colors hover:border-ink"
          >
            <OsuMusicMark className="h-3.5 w-3.5 text-ink" active playing={isPlaying} />
            <span className="hidden sm:inline">{t('音乐台', 'Music')}</span>
            <Maximize2 className="h-3 w-3 sm:hidden" />
          </button>

          <button
            type="button"
            onClick={stopAndClear}
            title={t('停止并收起后台播放器', 'Stop and close mini player')}
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-ink-3 transition-colors hover:bg-tint-hover hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
