import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Download, ExternalLink, Loader2, Pause, Play, Sparkles, Star } from 'lucide-react';
import { formatDuration, getLnCategory, getStarColor, getStatusBadge } from '../../constants';
import { useI18n } from '../../i18n';
import type { DownloadTarget, DownloadTask, NormalizedBeatmapset } from '../../types';
import type { PpScenarioInput } from '../../utils/pp';
import { MarqueeText } from '../MarqueeText';
import { PaimonStarfieldBack } from './PaimonStarfieldBack';
import { blade, ring, rng } from './gachaSketch';
import { getCardSummaryStats, getStarRarityMeta, type StarRarityTier } from './gachaUtils';

interface BeatmapGachaCardProps {
  beatmapset: NormalizedBeatmapset;
  ppScenario?: Partial<PpScenarioInput>;
  faceDown?: boolean;
  /** Increment to trigger Hearthstone + architectural light-blade reveal burst */
  revealTrigger?: number;
  /** Mask exact star rating in Guess mode */
  maskStars?: boolean;
  /** Optional PP / hint banner rendered inside the front card */
  clueBanner?: ReactNode;
  compact?: boolean;
  isPlaying?: boolean;
  activeTask?: DownloadTask;
  target: DownloadTarget;
  className?: string;
  onFlip?: () => void;
  onInspect?: () => void;
  onHoverBack?: (tier: StarRarityTier) => void;
  onTogglePlay?: (set: NormalizedBeatmapset) => void;
  onDownload?: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail?: (set: NormalizedBeatmapset, diffId?: number | null) => void;
}

const SPARK_VECTORS = [
  { sx: '-92px', sy: '-76px', delay: '0ms' },
  { sx: '96px', sy: '-68px', delay: '25ms' },
  { sx: '-104px', sy: '14px', delay: '45ms' },
  { sx: '108px', sy: '18px', delay: '30ms' },
  { sx: '-78px', sy: '92px', delay: '60ms' },
  { sx: '82px', sy: '86px', delay: '40ms' },
  { sx: '0px', sy: '-112px', delay: '15ms' },
  { sx: '0px', sy: '110px', delay: '50ms' },
  { sx: '-56px', sy: '-102px', delay: '75ms' },
  { sx: '60px', sy: '-98px', delay: '65ms' },
  { sx: '-52px', sy: '106px', delay: '85ms' },
  { sx: '56px', sy: '102px', delay: '70ms' },
];

export const BeatmapGachaCard = memo(function BeatmapGachaCard({
  beatmapset,
  ppScenario,
  faceDown = false,
  revealTrigger = 0,
  maskStars = false,
  clueBanner,
  compact = false,
  isPlaying = false,
  activeTask,
  target,
  className = '',
  onFlip,
  onInspect,
  onHoverBack,
  onTogglePlay,
  onDownload,
  onOpenDetail,
}: BeatmapGachaCardProps) {
  const { lang, t } = useI18n();
  const [burstTier, setBurstTier] = useState<StarRarityTier | null>(null);
  const prevRevealRef = useRef(revealTrigger);

  const summary = getCardSummaryStats(beatmapset, ppScenario);
  const rarity = getStarRarityMeta(summary.repStars, lang);
  const statusMeta = getStatusBadge(beatmapset.status);
  const starColor = getStarColor(summary.repStars);
  const lnInfo = getLnCategory(summary.featuredDiff?.lnRatio ?? null, lang);

  // Architectural burst geometry (light-blades + hand-drawn double shock ring)
  const burstSvg = useMemo(() => {
    const r = rng(beatmapset.id * 43 + 7);
    const ringPath = ring(100, 100, 56, r, 2.2);
    const bladePaths = Array.from({ length: 6 }, (_, i) => {
      const ang = (i / 6) * Math.PI * 2 + 0.25;
      return blade(100 + Math.cos(ang) * 44, 100 + Math.sin(ang) * 44, 48, 8, ang, r);
    });
    return { ringPath, bladePaths };
  }, [beatmapset.id]);

  useEffect(() => {
    if (revealTrigger > prevRevealRef.current) {
      prevRevealRef.current = revealTrigger;
      setBurstTier(rarity.tier);
      const timer = window.setTimeout(() => setBurstTier(null), 1050);
      return () => window.clearTimeout(timer);
    }
    prevRevealRef.current = revealTrigger;
    return undefined;
  }, [revealTrigger, rarity.tier]);

  const installed =
    target === 'both'
      ? beatmapset.localStatus.inStable && beatmapset.localStatus.inLazer
      : target === 'stable'
        ? beatmapset.localStatus.inStable
        : beatmapset.localStatus.inLazer || beatmapset.localStatus.inLazerPending;

  const isBusy = Boolean(
    activeTask &&
      (activeTask.status === 'queued' ||
        activeTask.status === 'downloading' ||
        activeTask.status === 'verifying' ||
        activeTask.status === 'installing'),
  );

  const auraStyle = {
    '--star-glow': rarity.glow,
    '--star-glow-2': rarity.glowSecondary,
  } as CSSProperties;

  const showStarHover = faceDown;

  return (
    <div
      className={`gacha-perspective gacha-card-shell group relative select-none ${className}`}
      style={auraStyle}
      data-ga-target={faceDown ? 'true' : undefined}
      data-ga-cursor={faceDown ? t('翻开卡牌', 'UNSEAL') : undefined}
      onMouseEnter={() => {
        if (faceDown) onHoverBack?.(rarity.tier);
      }}
    >
      {/* Hearthstone Hover Rarity Perimeter Aura (shines in true Star Rating color when faceDown hovered) */}
      {showStarHover && (
        <div
          aria-hidden="true"
          className="gacha-hover-aura pointer-events-none absolute -inset-[8px] rounded-[6px] blur-[14px]"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${rarity.glow}, ${rarity.glowSecondary} 62%, transparent 78%)`,
          }}
        />
      )}

      {/* Corner Registration Crop-Brackets snapping in on face-down hover */}
      {showStarHover && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[5px] z-20 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <span
            className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2"
            style={{ borderColor: rarity.glow }}
          />
          <span
            className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2"
            style={{ borderColor: rarity.glow }}
          />
          <span
            className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2"
            style={{ borderColor: rarity.glow }}
          />
          <span
            className="absolute right-0 bottom-0 h-3 w-3 border-r-2 border-b-2"
            style={{ borderColor: rarity.glow }}
          />
        </div>
      )}

      {/* Hearthstone + Architectural Light-Blade Reveal Burst FX (triggers on flip to front) */}
      {burstTier && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-visible"
        >
          <div
            className="gacha-ring-expand absolute h-32 w-32 rounded-full"
            style={{
              boxShadow: `0 0 36px 8px ${rarity.glow}, inset 0 0 24px 4px ${rarity.glowSecondary}`,
            }}
          />
          <svg
            viewBox="0 0 200 200"
            className="ga-blade-burst pointer-events-none absolute h-52 w-52 overflow-visible"
          >
            <path
              d={burstSvg.ringPath}
              fill="none"
              stroke={rarity.glow}
              strokeWidth="1.6"
              strokeOpacity="0.9"
            />
            <path
              d={burstSvg.ringPath}
              transform="translate(2 1.5)"
              fill="none"
              stroke={rarity.glowSecondary}
              strokeWidth="1.4"
              strokeOpacity="0.45"
            />
            {burstSvg.bladePaths.map((bp, bIdx) => (
              <path
                key={bIdx}
                d={bp}
                fill={bIdx % 2 === 0 ? rarity.glow : rarity.glowSecondary}
                fillOpacity="0.88"
              />
            ))}
          </svg>
          {(burstTier === 'epic' || burstTier === 'legendary' || burstTier === 'mythic') && (
            <div
              className="gacha-beam-sweep absolute -inset-y-12 w-24 rounded-full blur-md"
              style={{
                background: `linear-gradient(180deg, transparent 0%, ${rarity.glow}aa 48%, transparent 100%)`,
              }}
            />
          )}
          {SPARK_VECTORS.slice(0, rarity.sparkCount).map((vec, i) => (
            <span
              key={i}
              className="gacha-spark absolute top-1/2 left-1/2 text-[1rem] leading-none"
              style={
                {
                  color: i % 2 === 0 ? rarity.glow : rarity.glowSecondary,
                  textShadow: `0 0 12px ${rarity.glow}`,
                  '--sx': vec.sx,
                  '--sy': vec.sy,
                  animationDelay: vec.delay,
                } as CSSProperties
              }
            >
              ✦
            </span>
          ))}
        </div>
      )}

      {/* Borderless 3D Architectural Card Body (sharp 3px editorial collector silhouette) */}
      <div
        onClick={() => {
          if (faceDown && onFlip) onFlip();
        }}
        className={`gacha-card-3d relative h-full w-full ${
          !faceDown ? 'is-flipped' : 'cursor-pointer'
        }`}
      >
        {/* BACK FACE: Paimon Starfield Cloak + Minimalist Thin-Stroke `osu!` */}
        <div
          className="gacha-card-face gacha-card-face-back overflow-hidden rounded-[3px] border-0"
          style={{
            boxShadow: faceDown
              ? '0 22px 48px -18px rgba(4, 6, 20, 0.72), 0 8px 20px -10px rgba(0, 0, 0, 0.5)'
              : 'none',
          }}
        >
          <PaimonStarfieldBack seed={beatmapset.id} compact={compact} />

          {/* Subtle Inner Edge Star-Aura Wash on Hover */}
          {showStarHover && (
            <div
              aria-hidden="true"
              className="gacha-hover-aura pointer-events-none absolute inset-0"
              style={{
                boxShadow: `inset 0 0 28px ${rarity.glow}bb, inset 0 0 8px ${rarity.glowSecondary}`,
              }}
            />
          )}

          {/* Hover Click-to-Unseal Strip */}
          <div className="pointer-events-none absolute right-0 bottom-3.5 left-0 flex flex-col items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span
              className="inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-mono text-[0.65625rem] font-bold tracking-[0.14em] uppercase backdrop-blur-md"
              style={{
                background: 'rgba(6, 10, 32, 0.84)',
                color: rarity.glow,
                boxShadow: `0 0 16px ${rarity.glow}55`,
              }}
            >
              <Sparkles className="h-3 w-3" />
              <span>{t('点击翻牌', 'UNSEAL CARD')}</span>
            </span>
          </div>
        </div>

        {/* FRONT FACE: Borderless Full-Bleed Rectangular Beatmap Plate */}
        <div
          onClick={() => {
            if (!faceDown && onInspect) onInspect();
          }}
          data-ga-target={!faceDown && onInspect ? 'true' : undefined}
          data-ga-cursor={!faceDown && onInspect ? '360° INSPECT' : undefined}
          className={`gacha-card-face gacha-card-face-front overflow-hidden rounded-[3px] border-0 bg-[#0b0e17] text-white ${
            !faceDown && onInspect ? 'cursor-pointer' : ''
          }`}
          style={{
            boxShadow:
              '0 26px 56px -18px rgba(0, 0, 0, 0.65), 0 10px 24px -12px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Full-bleed Cover Art */}
          <img
            src={beatmapset.coverUrl}
            alt={beatmapset.title}
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
          />

          {/* Subtle Graphic Halftone Accent Corner */}
          <div
            aria-hidden="true"
            className="ga-halftone pointer-events-none absolute top-0 right-0 h-28 w-28 text-white opacity-[0.09]"
            style={{ maskImage: 'radial-gradient(circle at top right, black 10%, transparent 72%)' }}
          />

          {/* Cinematic Gradient Scrim (zero borders, effortless contrast) */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(6,8,16,0.58) 0%, rgba(6,8,16,0.12) 34%, rgba(6,8,16,0.72) 60%, rgba(6,8,16,0.97) 100%)',
            }}
          />

          {/* Top Editorial Rarity Accent Wash on Uncommon+ */}
          {!maskStars && rarity.tier !== 'common' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 left-0 h-[3px] opacity-95"
              style={{
                background: `linear-gradient(90deg, transparent, ${rarity.glow}, ${rarity.glowSecondary}, transparent)`,
              }}
            />
          )}

          {/* Front Content Layer */}
          <div
            className={`relative z-10 flex h-full flex-col justify-between ${
              compact ? 'p-2.5' : 'p-4'
            }`}
          >
            {!faceDown && onInspect && (
              <div className="pointer-events-none absolute top-11 left-1/2 z-20 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="rounded-[2px] bg-black/75 px-2 py-0.5 font-mono text-[0.5625rem] font-bold tracking-[0.16em] text-white/95 uppercase backdrop-blur-md">
                  {t('点击 360° 检视', '360° INSPECT')}
                </span>
              </div>
            )}
            {/* Top Editorial Index & Audio Trigger */}
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <div className="flex max-w-full flex-wrap items-center gap-1">
                  <span
                    className={`rounded-[2px] px-1.5 py-0.5 font-mono text-[0.59375rem] font-extrabold tracking-wider uppercase shadow-sm ${statusMeta.cls}`}
                  >
                    {statusMeta.label}
                  </span>
                  {summary.keysTag && (
                    <span className="rounded-[2px] bg-black/60 px-1.5 py-0.5 font-mono text-[0.59375rem] font-bold text-white/95 backdrop-blur-md">
                      {summary.keysTag}
                    </span>
                  )}
                  {lnInfo && !compact && (
                    <span className="rounded-[2px] bg-black/60 px-1.5 py-0.5 font-mono text-[0.59375rem] font-semibold text-white/90 backdrop-blur-md">
                      {lnInfo.label}
                    </span>
                  )}
                </div>

                {compact &&
                  (maskStars ? (
                    <span className="font-stat inline-flex items-center gap-1 rounded-[2px] bg-black/75 px-2 py-0.5 text-[0.6875rem] font-extrabold text-amber-300 backdrop-blur-md">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      <span>?.??★</span>
                    </span>
                  ) : (
                    <span
                      className="font-stat inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 text-[0.6875rem] font-extrabold shadow-sm"
                      style={{ backgroundColor: starColor.bg, color: starColor.text }}
                    >
                      <span>★ {summary.repStars.toFixed(2)}</span>
                    </span>
                  ))}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {!compact &&
                  (maskStars ? (
                    <span className="font-stat inline-flex items-center gap-1 rounded-[2px] bg-black/75 px-2.5 py-0.5 text-[0.75rem] font-extrabold text-amber-300 backdrop-blur-md">
                      <Star className="h-3 w-3 fill-current" />
                      <span>?.??★</span>
                    </span>
                  ) : (
                    <span
                      className="font-stat inline-flex items-center gap-1 rounded-[2px] px-2.5 py-0.5 text-[0.75rem] font-extrabold shadow-sm"
                      style={{ backgroundColor: starColor.bg, color: starColor.text }}
                    >
                      <span>★ {summary.repStars.toFixed(2)}</span>
                    </span>
                  ))}

                {onTogglePlay && (
                  <button
                    type="button"
                    data-ga-cursor={isPlaying ? t('暂停试听', 'PAUSE') : t('试听音频', 'PREVIEW')}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePlay(beatmapset);
                    }}
                    title={isPlaying ? t('暂停试听', 'Pause preview') : t('播放试听', 'Play preview')}
                    className={`flex shrink-0 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 ${
                      compact ? 'h-7 w-7' : 'h-8 w-8'
                    } ${
                      isPlaying
                        ? 'bg-[#3a5bc2] text-white'
                        : 'bg-black/65 text-white backdrop-blur-md hover:bg-[#3a5bc2]'
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Play className="h-3.5 w-3.5 translate-x-[0.5px] fill-current" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Dossier Telemetry + Borderless Actions */}
            <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
              {clueBanner}

              {/* Title & Artist */}
              <div className="min-w-0 space-y-0.5">
                <MarqueeText
                  text={beatmapset.titleUnicode || beatmapset.title}
                  mode="always"
                  className={`font-display leading-tight font-extrabold tracking-tight text-white drop-shadow ${
                    compact ? 'text-[0.875rem]' : 'text-[1.25rem] sm:text-[1.375rem]'
                  }`}
                />
                <p
                  className={`truncate font-medium text-white/75 ${
                    compact ? 'text-[0.6875rem]' : 'text-[0.8125rem]'
                  }`}
                >
                  {beatmapset.artistUnicode || beatmapset.artist} · {beatmapset.creator}
                </p>
              </div>

              {/* Crisp Hairline-Separated Telemetry Row */}
              <div
                className={`grid border-t border-white/20 pt-1.5 ${
                  compact
                    ? 'grid-cols-[0.75fr_0.95fr_1.3fr] gap-1'
                    : 'grid-cols-4 gap-2'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-[0.5625rem] font-semibold tracking-wider text-white/55 uppercase">
                    BPM
                  </div>
                  <div
                    className={`font-mono font-bold whitespace-nowrap text-white tabular-nums ${
                      compact ? 'text-[0.6875rem]' : 'text-[0.8125rem]'
                    }`}
                  >
                    {Math.round(beatmapset.bpm)}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="font-mono text-[0.5625rem] font-semibold tracking-wider text-white/55 uppercase">
                    {t('星数', 'SR')}
                  </div>
                  <div
                    className={`font-mono font-bold whitespace-nowrap tabular-nums ${
                      compact ? 'text-[0.6875rem]' : 'text-[0.8125rem]'
                    }`}
                    style={{
                      color: maskStars
                        ? '#fcd34d'
                        : starColor.bg === '#000000'
                          ? '#fde047'
                          : '#ffffff',
                    }}
                  >
                    {maskStars
                      ? '?.??★'
                      : summary.minStars < summary.maxStars - 0.05 && !compact
                        ? `${summary.minStars.toFixed(1)}–${summary.maxStars.toFixed(1)}★`
                        : `${summary.repStars.toFixed(2)}★`}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="font-mono text-[0.5625rem] font-semibold tracking-wider text-white/55 uppercase">
                    {compact ? t('参考 PP', '~PP') : t('大致 PP', 'Est. PP')}
                  </div>
                  <div
                    className={`font-mono font-bold whitespace-nowrap text-emerald-300 tabular-nums ${
                      compact ? 'text-[0.6875rem]' : 'text-[0.8125rem]'
                    }`}
                  >
                    {summary.ppLabel}
                  </div>
                </div>

                {!compact && (
                  <div className="min-w-0">
                    <div className="font-mono text-[0.5625rem] font-semibold tracking-wider text-white/55 uppercase">
                      {t('时长 / 难度', 'LEN / DIFF')}
                    </div>
                    <div className="font-mono truncate text-[0.8125rem] font-bold text-white/95 tabular-nums">
                      {formatDuration(summary.lengthSec)} · {beatmapset.beatmaps.length}
                    </div>
                  </div>
                )}
              </div>

              {/* Architectural Action Strip (Download + Details) */}
              <div
                className="flex items-center gap-1.5 pt-0.5"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {onDownload && (
                  <button
                    type="button"
                    disabled={isBusy}
                    data-ga-cursor={t('下载谱面', 'DOWNLOAD')}
                    onClick={() => onDownload(beatmapset, target)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-[2px] font-semibold whitespace-nowrap transition-all ${
                      compact ? 'h-8 px-2 text-[0.71875rem]' : 'h-9 px-3 text-[0.8125rem]'
                    } ${
                      installed
                        ? 'bg-emerald-500/30 text-emerald-200 hover:bg-emerald-500/45'
                        : isBusy
                          ? 'bg-[var(--ga-cobalt)] text-white'
                          : 'bg-osu text-white shadow-md hover:brightness-110'
                    }`}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        <span className="font-mono tabular-nums">{activeTask?.progress ?? 0}%</span>
                      </>
                    ) : installed ? (
                      <>
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        <span>{compact ? t('已装', 'Owned') : t('已入库', 'Installed')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5 shrink-0" />
                        <span>{compact ? t('下载', 'Get') : t('下载谱面', 'Download')}</span>
                      </>
                    )}
                  </button>
                )}

                {onOpenDetail && (
                  <button
                    type="button"
                    data-ga-cursor={t('谱面详情', 'DETAILS')}
                    onClick={() => onOpenDetail(beatmapset, summary.featuredDiff?.id ?? null)}
                    title={t('查看谱面详细页面', 'Open beatmap detail page')}
                    className={`flex shrink-0 items-center justify-center gap-1 rounded-[2px] bg-white/14 font-semibold whitespace-nowrap text-white backdrop-blur-md transition-colors hover:bg-white/26 ${
                      compact ? 'h-8 px-2.5 text-[0.71875rem]' : 'h-9 px-3 text-[0.8125rem]'
                    }`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span>{compact ? t('详情', 'Info') : t('详情', 'Details')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
