import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  HelpCircle,
  PackageOpen,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getTargetMeta } from '../../constants';
import { useI18n } from '../../i18n';
import type {
  AppConfig,
  DownloadTarget,
  DownloadTask,
  NormalizedBeatmapset,
  SearchFilters,
  ThemeId,
} from '../../types';
import { GachaDatingMode } from './GachaDatingMode';
import { GachaGuessMode } from './GachaGuessMode';
import { GachaPackMode } from './GachaPackMode';
import { isGachaSfxMuted, setGachaSfxMuted } from './gachaSound';

export type GachaStudioTab = 'dating' | 'guess' | 'pack';

interface GachaStudioProps {
  filters: SearchFilters;
  target: DownloadTarget;
  config: AppConfig | null;
  theme: ThemeId;
  activeTaskBySet: Map<number, DownloadTask>;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onBatchDownload: (sets: NormalizedBeatmapset[]) => void;
  onOpenDetail: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onNotify: (msg: string) => void;
  onClose: () => void;
}

export function GachaStudio({
  filters,
  target,
  activeTaskBySet,
  onDownload,
  onBatchDownload,
  onOpenDetail,
  onNotify,
  onClose,
}: GachaStudioProps) {
  const { lang, t } = useI18n();
  const [tab, setTab] = useState<GachaStudioTab>('pack');
  const [sfxMuted, setSfxMuted] = useState<boolean>(isGachaSfxMuted);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioSet, setAudioSet] = useState<NormalizedBeatmapset | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [audioMuted, setAudioMuted] = useState(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  const targetMeta = getTargetMeta(lang)[target];

  const stopAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
    }
    setIsPlaying(false);
  }, []);

  const handlePlaySet = useCallback(
    (set: NormalizedBeatmapset, autoplay = true) => {
      const el = audioRef.current;
      setAudioSet(set);
      if (el) {
        if (el.getAttribute('data-set-id') !== String(set.id)) {
          el.setAttribute('data-set-id', String(set.id));
          el.src = set.previewUrl;
        }
        el.volume = audioMuted ? 0 : volume;
        if (autoplay) {
          void el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } else {
          setIsPlaying(true);
        }
      }
    },
    [audioMuted, volume],
  );

  const handleTogglePlaySet = useCallback(
    (set: NormalizedBeatmapset) => {
      const el = audioRef.current;
      if (audioSet?.id === set.id && el) {
        if (isPlayingRef.current) {
          el.pause();
          setIsPlaying(false);
        } else {
          el.volume = audioMuted ? 0 : volume;
          void el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
        return;
      }
      handlePlaySet(set, true);
    },
    [audioSet?.id, audioMuted, volume, handlePlaySet],
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = audioMuted ? 0 : volume;
  }, [volume, audioMuted]);

  // Pause active audio cleanly when leaving Dating mode or closing studio
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
    };
  }, []);

  const handleSwitchTab = (next: GachaStudioTab) => {
    if (next !== tab) {
      stopAudio();
      setTab(next);
    }
  };

  const toggleSfx = () => {
    const next = !sfxMuted;
    setSfxMuted(next);
    setGachaSfxMuted(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas/35">
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
      />

      {/* Studio Header Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface-1/85 px-3.5 py-2 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              stopAudio();
              onClose();
            }}
            className="btn btn-sm h-8 gap-1.5 text-[0.78125rem]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('返回搜图', 'Back')}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-osu/15 text-osu">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="font-display text-[0.9375rem] leading-tight font-extrabold text-ink">
                {t('随机抽卡', 'Card Draw')}
              </h2>
              <p className="text-[0.6875rem] font-medium text-ink-3">
                {t('仅抽取本地未下载曲目', 'Non-local online beatmaps')} ·{' '}
                <span className={targetMeta.textCls}>{targetMeta.label}</span>
              </p>
            </div>
          </div>
        </div>

        {/* 3-Mode Switcher */}
        <div
          role="tablist"
          aria-label={t('随机抽卡模式', 'Card Draw Modes')}
          className="segmented segmented-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pack'}
            onClick={() => handleSwitchTab('pack')}
            className={`inline-flex items-center gap-1.5 !px-3 ${
              tab === 'pack'
                ? '!bg-surface-2 !text-ink shadow-[inset_0_0_0_1px_var(--t-osu)]'
                : ''
            }`}
          >
            <PackageOpen className="h-3.5 w-3.5 text-amber-400" />
            <span>{t('卡包模式', 'Pack Opening')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'dating'}
            onClick={() => handleSwitchTab('dating')}
            className={`inline-flex items-center gap-1.5 !px-3 ${
              tab === 'dating'
                ? '!bg-surface-2 !text-ink shadow-[inset_0_0_0_1px_var(--t-osu)]'
                : ''
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-rose-400" />
            <span>{t('约会模式', 'Dating Swipe')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'guess'}
            onClick={() => handleSwitchTab('guess')}
            className={`inline-flex items-center gap-1.5 !px-3 ${
              tab === 'guess'
                ? '!bg-surface-2 !text-ink shadow-[inset_0_0_0_1px_var(--t-osu)]'
                : ''
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
            <span>{t('猜测模式', 'Guess SR')}</span>
          </button>
        </div>

        {/* Integrated Compact Audio Preview + SFX Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {audioSet && (
            <div className="hidden items-center gap-2 rounded-full border border-hairline bg-surface-2/85 px-2.5 py-1 xl:flex">
              <button
                type="button"
                onClick={() => handleTogglePlaySet(audioSet)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-osu text-white"
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3 translate-x-[0.5px] fill-current" />
                )}
              </button>
              <span className="max-w-[140px] truncate text-[0.71875rem] font-semibold text-ink">
                {audioSet.titleUnicode || audioSet.title}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/70 px-2.5 py-1">
            <button
              type="button"
              onClick={() => setAudioMuted((m) => !m)}
              title={audioMuted ? t('取消试听静音', 'Unmute preview') : t('试听静音', 'Mute preview')}
              className="text-ink-2 hover:text-ink"
            >
              {audioMuted || volume === 0 ? (
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
              value={audioMuted ? 0 : volume}
              onChange={(e) => {
                setAudioMuted(false);
                setVolume(Number(e.target.value));
              }}
              className="impeccable-range w-14"
              aria-label={t('抽卡试听音量', 'Card preview volume')}
            />
          </div>

          <button
            type="button"
            onClick={toggleSfx}
            title={sfxMuted ? t('开启抽卡音效', 'Enable card SFX') : t('关闭抽卡音效', 'Mute card SFX')}
            className={`btn btn-sm h-8 px-2.5 font-mono text-[0.71875rem] ${
              sfxMuted ? 'text-ink-3' : 'border-osu/40 bg-osu/10 text-osu-soft'
            }`}
          >
            {sfxMuted ? t('音效关', 'SFX Off') : t('音效开', 'SFX On')}
          </button>
        </div>
      </header>

      {/* Active Mode Workspace */}
      {tab === 'pack' && (
        <GachaPackMode
          baseFilters={filters}
          target={target}
          activeTaskBySet={activeTaskBySet}
          playingSetId={audioSet?.id ?? null}
          isPlaying={isPlaying}
          onTogglePlaySet={handleTogglePlaySet}
          onDownload={onDownload}
          onBatchDownload={onBatchDownload}
          onOpenDetail={onOpenDetail}
          onNotify={onNotify}
        />
      )}

      {tab === 'dating' && (
        <GachaDatingMode
          baseFilters={filters}
          target={target}
          activeTaskBySet={activeTaskBySet}
          playingSetId={audioSet?.id ?? null}
          isPlaying={isPlaying}
          onPlaySet={handlePlaySet}
          onTogglePlaySet={handleTogglePlaySet}
          onStopAudio={stopAudio}
          onDownload={onDownload}
          onBatchDownload={onBatchDownload}
          onOpenDetail={onOpenDetail}
          onNotify={onNotify}
        />
      )}

      {tab === 'guess' && (
        <GachaGuessMode
          baseFilters={filters}
          target={target}
          activeTaskBySet={activeTaskBySet}
          playingSetId={audioSet?.id ?? null}
          isPlaying={isPlaying}
          onTogglePlaySet={handleTogglePlaySet}
          onDownload={onDownload}
          onOpenDetail={onOpenDetail}
        />
      )}
    </div>
  );
}
