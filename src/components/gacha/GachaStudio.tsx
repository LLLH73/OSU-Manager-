import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Compass,
  Flame,
  HelpCircle,
  PackageOpen,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getTargetMeta, isDarkTheme } from '../../constants';
import { useI18n } from '../../i18n';
import type {
  AppConfig,
  DownloadTarget,
  DownloadTask,
  NormalizedBeatmapset,
  SearchFilters,
  ThemeId,
} from '../../types';
import { GachaAtmosphere, ScrambleText, type GachaAtmosphereHandle } from './GachaAtmosphere';
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
  theme,
  activeTaskBySet,
  onDownload,
  onBatchDownload,
  onOpenDetail,
  onNotify,
  onClose,
}: GachaStudioProps) {
  const { lang, t } = useI18n();
  const isDark = isDarkTheme(theme);

  const [tab, setTab] = useState<GachaStudioTab>('pack');
  const [blueprint, setBlueprint] = useState(false);
  const [sfxMuted, setSfxMuted] = useState<boolean>(isGachaSfxMuted);
  const [accentHex, setAccentHex] = useState<string>(isDark ? '#6c8eff' : '#3a5bc2');

  const studioRef = useRef<HTMLDivElement | null>(null);
  const atmosphereRef = useRef<GachaAtmosphereHandle | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioSet, setAudioSet] = useState<NormalizedBeatmapset | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [audioMuted, setAudioMuted] = useState(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  const targetMeta = getTargetMeta(lang)[target];

  const triggerEffect = useCallback(
    (intensity = 1, colorHex?: string) => {
      if (colorHex) setAccentHex(colorHex);
      atmosphereRef.current?.triggerEffect(intensity, colorHex);
    },
    [],
  );

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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
    };
  }, []);

  // Keyboard shortcut 'B' toggles architectural Blueprint / 构造线 mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.tagName === 'SELECT' ||
          targetEl.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setBlueprint((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSwitchTab = (next: GachaStudioTab) => {
    if (next !== tab) {
      stopAudio();
      setTab(next);
      triggerEffect(0.55);
    }
  };

  const toggleSfx = () => {
    const next = !sfxMuted;
    setSfxMuted(next);
    setGachaSfxMuted(next);
  };

  const chapters: Array<{
    id: GachaStudioTab;
    num: string;
    label: string;
    icon: React.ReactNode;
    cursor: string;
  }> = [
    {
      id: 'pack',
      num: '01',
      label: t('卡包典藏', 'PACK OPENING'),
      icon: <PackageOpen className="h-3.5 w-3.5" />,
      cursor: 'CHAPTER 01',
    },
    {
      id: 'dating',
      num: '02',
      label: t('约会试听', 'DATING SWIPE'),
      icon: <Flame className="h-3.5 w-3.5" />,
      cursor: 'CHAPTER 02',
    },
    {
      id: 'guess',
      num: '03',
      label: t('星数推演', 'GUESS SR'),
      icon: <HelpCircle className="h-3.5 w-3.5" />,
      cursor: 'CHAPTER 03',
    },
  ];

  return (
    <div
      ref={studioRef}
      data-dark={isDark ? 'true' : 'false'}
      data-blueprint={blueprint ? 'true' : 'false'}
      className="gacha-atelier relative flex h-full min-h-0 flex-col overflow-hidden"
    >
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
      />

      {/* Atmospheric Three.js Sanctum, Veil, Paper Grain, Edge Ruler, Reticle & Burst FX */}
      <GachaAtmosphere
        ref={atmosphereRef}
        containerRef={studioRef}
        isDark={isDark}
        mode={tab}
        blueprint={blueprint}
        accentHex={accentHex}
      />

      {/* Editorial Exhibition Header */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-3.5 py-2 backdrop-blur-md sm:px-6">
        {/* Left Brand & Back Control */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-ga-cursor={t('返回选图', 'RETURN')}
            onClick={() => {
              stopAudio();
              onClose();
            }}
            className="ga-line-btn h-8 px-2.5 text-[0.75rem]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('返回搜图', 'Back')}</span>
          </button>

          <div className="hidden h-5 w-px bg-[var(--ga-line)] sm:block" />

          <div className="flex items-center gap-2.5">
            {/* Minimalist Geometric Astrolabe Emblem */}
            <svg
              aria-hidden="true"
              viewBox="0 0 36 36"
              className="h-7 w-7 shrink-0 text-[var(--ga-cobalt)]"
            >
              <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle
                cx="18"
                cy="18"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.55"
                strokeWidth="0.9"
                strokeDasharray="3 2"
              />
              <path d="M18 2v6M18 28v6M2 18h6M28 18h6" stroke="currentColor" strokeWidth="1.1" />
              <circle cx="18" cy="18" r="2.2" fill="currentColor" />
            </svg>

            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="ga-cn-serif text-[1rem] leading-tight font-bold tracking-wide text-[var(--ga-ink)]">
                  <ScrambleText text={t('随机抽卡', 'CARD ARCHIVE')} triggerKey={lang} />
                </h2>
                <span className="ga-mono hidden text-[0.625rem] tracking-[0.2em] text-[var(--ga-cobalt)] uppercase md:inline">
                  ARCHIVE // EDITION
                </span>
              </div>
              <p className="ga-mono text-[0.65625rem] tracking-wider text-[var(--ga-ink-3)] uppercase">
                {t('仅抽取本地未下载曲目', 'NON-LOCAL ONLINE POOL')} ·{' '}
                <span className="font-semibold text-[var(--ga-cobalt)]">{targetMeta.label}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Center Editorial Chapter Navigation (numbered with cobalt indicator rule) */}
        <nav
          role="tablist"
          aria-label={t('随机抽卡模式', 'Card Draw Modes')}
          className="flex items-center gap-1 sm:gap-5"
        >
          {chapters.map((ch) => {
            const active = tab === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-ga-cursor={ch.cursor}
                onClick={() => handleSwitchTab(ch.id)}
                className={`relative inline-flex items-center gap-1.5 px-2.5 py-2 text-[0.78125rem] font-semibold tracking-wider transition-colors ${
                  active
                    ? 'text-[var(--ga-ink)]'
                    : 'text-[var(--ga-ink-3)] hover:text-[var(--ga-ink)]'
                }`}
              >
                <span
                  className={`ga-mono text-[0.625rem] font-bold ${
                    active ? 'text-[var(--ga-cobalt)]' : 'opacity-65'
                  }`}
                >
                  {ch.num}
                </span>
                <span className={active ? 'text-[var(--ga-cobalt)]' : 'opacity-70'}>{ch.icon}</span>
                <span className="whitespace-nowrap">{ch.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 bottom-0 left-1 h-[2.5px] bg-[var(--ga-cobalt)]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Preview Readout, Blueprint Toggle & SFX Control */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {audioSet && (
            <div className="hidden items-center gap-2 border border-[var(--ga-line)] bg-[var(--ga-panel)] px-2.5 py-1 xl:flex">
              <button
                type="button"
                data-ga-cursor={isPlaying ? t('暂停', 'PAUSE') : t('播放', 'PLAY')}
                onClick={() => handleTogglePlaySet(audioSet)}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ga-cobalt)] text-white"
              >
                {isPlaying ? (
                  <Pause className="h-2.5 w-2.5" />
                ) : (
                  <Play className="h-2.5 w-2.5 translate-x-[0.5px] fill-current" />
                )}
              </button>
              {isPlaying && (
                <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
                  <i className="ga-eq-bar block h-full w-[2px] bg-[var(--ga-cobalt)]" />
                  <i
                    className="ga-eq-bar block h-full w-[2px] bg-[var(--ga-cobalt)]"
                    style={{ animationDelay: '0.18s' }}
                  />
                  <i
                    className="ga-eq-bar block h-full w-[2px] bg-[var(--ga-cobalt)]"
                    style={{ animationDelay: '0.36s' }}
                  />
                </span>
              )}
              <span className="max-w-[130px] truncate text-[0.71875rem] font-semibold text-[var(--ga-ink)]">
                {audioSet.titleUnicode || audioSet.title}
              </span>
            </div>
          )}

          {/* Hairline Audio Volume */}
          <div className="flex items-center gap-1.5 rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel)] px-2.5 py-1">
            <button
              type="button"
              data-ga-cursor={audioMuted ? t('取消静音', 'UNMUTE') : t('静音', 'MUTE')}
              onClick={() => setAudioMuted((m) => !m)}
              title={audioMuted ? t('取消试听静音', 'Unmute preview') : t('试听静音', 'Mute preview')}
              className="text-[var(--ga-ink-2)] hover:text-[var(--ga-cobalt)]"
            >
              {audioMuted || volume === 0 ? (
                <VolumeX className="h-3.5 w-3.5 opacity-60" />
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

          {/* Blueprint Wireframe Toggle (B) */}
          <button
            type="button"
            data-active={blueprint ? 'true' : 'false'}
            data-ga-cursor="BLUEPRINT [B]"
            onClick={() => setBlueprint((b) => !b)}
            title={t('切换建筑构造线图纸视图 (B)', 'Toggle Blueprint wireframe view (B)')}
            className="ga-line-btn h-8 px-2.5 text-[0.71875rem]"
          >
            <Compass className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('构造线', 'Blueprint')}</span>
            <kbd className="ga-mono hidden rounded border border-current/30 px-1 text-[0.5625rem] md:inline">
              B
            </kbd>
          </button>

          {/* Procedural SFX Toggle */}
          <button
            type="button"
            data-active={!sfxMuted ? 'true' : 'false'}
            data-ga-cursor={sfxMuted ? 'SFX OFF' : 'SFX ON'}
            onClick={toggleSfx}
            title={sfxMuted ? t('开启抽卡音效', 'Enable card SFX') : t('关闭抽卡音效', 'Mute card SFX')}
            className="ga-line-btn h-8 px-2.5 font-mono text-[0.71875rem]"
          >
            {sfxMuted ? t('音效关', 'SFX Off') : t('音效开', 'SFX On')}
          </button>
        </div>
      </header>

      {/* Main Content Stage above Three.js & Graphic Atmosphere */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'pack' && (
          <GachaPackMode
            baseFilters={filters}
            target={target}
            blueprint={blueprint}
            activeTaskBySet={activeTaskBySet}
            playingSetId={audioSet?.id ?? null}
            isPlaying={isPlaying}
            onTogglePlaySet={handleTogglePlaySet}
            onDownload={onDownload}
            onBatchDownload={onBatchDownload}
            onOpenDetail={onOpenDetail}
            onTriggerEffect={triggerEffect}
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
            onTriggerEffect={triggerEffect}
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
            onTriggerEffect={triggerEffect}
          />
        )}
      </div>
    </div>
  );
}
