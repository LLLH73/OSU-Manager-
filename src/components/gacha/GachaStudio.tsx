import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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

export type GachaStudioTab = 'dating' | 'pack' | 'guess';

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
  config,
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

  // Default to Dating Swipe mode per UX flow
  const [tab, setTab] = useState<GachaStudioTab>('dating');
  const [blueprint, setBlueprint] = useState(false);
  const [sfxMuted, setSfxMuted] = useState<boolean>(isGachaSfxMuted);
  const [resolvedColors, setResolvedColors] = useState<{ accent: string; canvas: string }>({
    accent: isDark ? '#ff66aa' : '#e03a82',
    canvas: isDark ? '#0b0c12' : '#f3f5f9',
  });

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

  // Read live global CSS accent & canvas colors so 3D Sanctum & sleeve follow active global theme
  useEffect(() => {
    const syncGlobalColors = () => {
      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue('--t-osu').trim() || (isDark ? '#ff66aa' : '#e03a82');
      const canvas = style.getPropertyValue('--t-canvas').trim() || (isDark ? '#0b0c12' : '#f3f5f9');
      setResolvedColors({ accent, canvas });
    };
    syncGlobalColors();
    const timer = window.setTimeout(syncGlobalColors, 30);
    return () => window.clearTimeout(timer);
  }, [theme, isDark, config?.accentColor, config?.customBgImage, config?.dynamicThemeFromBg]);

  const triggerEffect = useCallback(
    (intensity = 1, colorHex?: string) => {
      atmosphereRef.current?.triggerEffect(intensity, colorHex || resolvedColors.accent);
    },
    [resolvedColors.accent],
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
      triggerEffect(0.5);
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
      id: 'dating',
      num: '01',
      label: t('约会试听', 'DATING SWIPE'),
      icon: <Flame className="h-3 w-3" />,
      cursor: 'CHAPTER 01',
    },
    {
      id: 'pack',
      num: '02',
      label: t('卡包典藏', 'PACK OPENING'),
      icon: <PackageOpen className="h-3 w-3" />,
      cursor: 'CHAPTER 02',
    },
    {
      id: 'guess',
      num: '03',
      label: t('星数推演', 'GUESS SR'),
      icon: <HelpCircle className="h-3 w-3" />,
      cursor: 'CHAPTER 03',
    },
  ];

  const volFillPct = Math.round((audioMuted ? 0 : volume) * 100);

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

      {/* Atmospheric Three.js Sanctum, Veil, Paper Grain, Edge Ruler, Reticle & Background Burst FX */}
      <GachaAtmosphere
        ref={atmosphereRef}
        containerRef={studioRef}
        isDark={isDark}
        mode={tab}
        blueprint={blueprint}
        accentHex={resolvedColors.accent}
        canvasHex={resolvedColors.canvas}
      />

      {/* Open Content Stage above Three.js Architecture */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
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

        {tab === 'guess' && (
          <GachaGuessMode
            baseFilters={filters}
            target={target}
            activeTaskBySet={activeTaskBySet}
            playingSetId={audioSet?.id ?? null}
            isPlaying={isPlaying}
            onTogglePlaySet={handleTogglePlaySet}
            onDownload={onDownload}
            onTriggerEffect={triggerEffect}
          />
        )}
      </div>

      {/* Slim Bottom Exhibition Dock (`the-masses-travels` architectural bottom navigation bar) */}
      <footer className="relative z-20 flex h-10 shrink-0 items-center justify-between gap-2 border-t border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-3 backdrop-blur-md sm:h-11 sm:px-5">
        {/* Left: Compact Back & Identity */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-ga-cursor={t('返回选图', 'RETURN')}
            onClick={() => {
              stopAudio();
              onClose();
            }}
            className="ga-line-btn h-7 px-2.5 text-[0.71875rem]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('返回搜图', 'Back')}</span>
          </button>

          <div className="hidden h-4 w-px bg-[var(--ga-line)] sm:block" />

          <div className="hidden items-center gap-2 md:flex">
            <svg
              aria-hidden="true"
              viewBox="0 0 36 36"
              className="h-5 w-5 shrink-0 text-[var(--ga-cobalt)]"
            >
              <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="18" cy="18" r="3" fill="currentColor" />
            </svg>
            <span className="ga-cn-serif text-[0.8125rem] font-bold tracking-wide text-[var(--ga-ink)]">
              <ScrambleText text={t('随机抽卡', 'CARD ARCHIVE')} triggerKey={lang} />
            </span>
            <span className="ga-mono text-[0.625rem] font-semibold text-[var(--ga-cobalt)]">
              · {targetMeta.label}
            </span>
          </div>
        </div>

        {/* Center: Numbered Chapter Tabs with Top Accent Indicator */}
        <nav
          role="tablist"
          aria-label={t('随机抽卡模式', 'Card Draw Modes')}
          className="flex h-full items-center gap-1 sm:gap-4"
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
                className={`relative inline-flex h-full items-center gap-1.5 px-2.5 text-[0.75rem] font-semibold tracking-wider transition-colors ${
                  active
                    ? 'text-[var(--ga-ink)]'
                    : 'text-[var(--ga-ink-3)] hover:text-[var(--ga-ink)]'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 right-1 left-1 h-[2.5px] bg-[var(--ga-cobalt)]"
                  />
                )}
                <span
                  className={`ga-mono text-[0.625rem] font-bold ${
                    active ? 'text-[var(--ga-cobalt)]' : 'opacity-65'
                  }`}
                >
                  {ch.num}
                </span>
                <span className={active ? 'text-[var(--ga-cobalt)]' : 'opacity-70'}>{ch.icon}</span>
                <span className="whitespace-nowrap">{ch.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Audio Preview Readout, Volume, Blueprint & SFX Toggles */}
        <div className="flex items-center gap-1.5">
          {audioSet && (
            <div className="hidden h-7 items-center gap-1.5 rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel)] px-2 xl:flex">
              <button
                type="button"
                data-ga-cursor={isPlaying ? t('暂停', 'PAUSE') : t('播放', 'PLAY')}
                onClick={() => handleTogglePlaySet(audioSet)}
                className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[var(--ga-cobalt)] text-white"
              >
                {isPlaying ? (
                  <Pause className="h-2.5 w-2.5" />
                ) : (
                  <Play className="h-2.5 w-2.5 translate-x-[0.5px] fill-current" />
                )}
              </button>
              {isPlaying && (
                <span aria-hidden="true" className="flex h-2.5 items-end gap-[2px]">
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
              <span className="max-w-[118px] truncate text-[0.6875rem] font-semibold text-[var(--ga-ink)]">
                {audioSet.titleUnicode || audioSet.title}
              </span>
            </div>
          )}

          {/* Audio Volume Slider with active fill tracking */}
          <div className="hidden h-7 items-center gap-1.5 rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel)] px-2 sm:flex">
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
              style={{ '--fill': `${volFillPct}%` } as CSSProperties}
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
            data-active={blueprint ? 'true' : 'false'}
            data-ga-cursor="BLUEPRINT [B]"
            onClick={() => setBlueprint((b) => !b)}
            title={t('切换建筑构造线图纸视图 (B)', 'Toggle Blueprint wireframe view (B)')}
            className="ga-line-btn h-7 px-2 text-[0.6875rem]"
          >
            <Compass className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t('构造线', 'Blueprint')}</span>
          </button>

          <button
            type="button"
            data-active={!sfxMuted ? 'true' : 'false'}
            data-ga-cursor={sfxMuted ? 'SFX OFF' : 'SFX ON'}
            onClick={toggleSfx}
            title={sfxMuted ? t('开启抽卡音效', 'Enable card SFX') : t('关闭抽卡音效', 'Mute card SFX')}
            className="ga-line-btn h-7 px-2 font-mono text-[0.6875rem]"
          >
            {sfxMuted ? t('音效关', 'SFX Off') : t('音效开', 'SFX On')}
          </button>
        </div>
      </footer>
    </div>
  );
}
