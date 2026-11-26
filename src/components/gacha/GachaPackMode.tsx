import { useCallback, useRef, useState } from 'react';
import {
  ArrowRight,
  Download,
  Eye,
  Layers,
  Loader2,
  RotateCcw,
  Scissors,
  Sparkles,
  Star,
} from 'lucide-react';
import { drawGachaBeatmapsets } from '../../api';
import { useI18n } from '../../i18n';
import type {
  DownloadTarget,
  DownloadTask,
  GachaPackId,
  NormalizedBeatmapset,
  SearchFilters,
} from '../../types';
import { BeatmapGachaCard } from './BeatmapGachaCard';
import { ScrambleText } from './GachaAtmosphere';
import { GachaPackPlate } from './GachaPackPlate';
import { playCardFlipSound, playCardHoverTick, playPackTearSound } from './gachaSound';
import {
  getCardSummaryStats,
  getGachaPacks,
  getStarRarityMeta,
  type StarRarityTier,
} from './gachaUtils';

interface GachaPackModeProps {
  baseFilters: SearchFilters;
  target: DownloadTarget;
  blueprint: boolean;
  activeTaskBySet: Map<number, DownloadTask>;
  playingSetId: number | null;
  isPlaying: boolean;
  onTogglePlaySet: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onBatchDownload: (sets: NormalizedBeatmapset[]) => void;
  onOpenDetail: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onTriggerEffect: (intensity?: number, hexColor?: string) => void;
  onNotify: (msg: string) => void;
}

type PackStage = 'sealed' | 'tearing' | 'opened';

const CARD_COUNT_PRESETS = [1, 5, 10, 15, 20] as const;

export function GachaPackMode({
  baseFilters,
  target,
  blueprint,
  activeTaskBySet,
  playingSetId,
  isPlaying,
  onTogglePlaySet,
  onDownload,
  onBatchDownload,
  onOpenDetail,
  onTriggerEffect,
  onNotify,
}: GachaPackModeProps) {
  const { lang, t } = useI18n();
  const packs = getGachaPacks(lang);

  const [packId, setPackId] = useState<GachaPackId>('standard');
  const [cardCount, setCardCount] = useState<number>(5);
  const [stage, setStage] = useState<PackStage>('sealed');
  const [cards, setCards] = useState<NormalizedBeatmapset[]>([]);
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set());
  const [revealTriggers, setRevealTriggers] = useState<Record<number, number>>({});
  const [stageShake, setStageShake] = useState(false);
  const [flashBurst, setFlashBurst] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [packTilt, setPackTilt] = useState({ rx: 0, ry: 0 });
  const [platePointer, setPlatePointer] = useState({ x: 0, y: 0 });
  const [tearDragPct, setTearDragPct] = useState(0);
  const tearOriginXRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const lastHoveredCardRef = useRef<number | null>(null);

  const selectedPack = packs.find((p) => p.id === packId) ?? packs[0];

  const handleRipOpen = useCallback(
    async (overridePackId?: GachaPackId, overrideCount?: number) => {
      if (stage === 'tearing') return;
      const targetPack = overridePackId ?? packId;
      const targetCount = Math.min(20, Math.max(1, overrideCount ?? cardCount));
      const activeMeta = packs.find((p) => p.id === targetPack) ?? selectedPack;

      setError(null);
      setStage('tearing');
      setTearDragPct(100);
      playPackTearSound();
      onTriggerEffect(1.0, activeMeta.accentHex);

      const fetchPromise = drawGachaBeatmapsets({
        count: targetCount,
        packId: targetPack,
        baseFilters,
        excludeIds: Array.from(seenIdsRef.current).slice(-160),
      });

      const minAnimPromise = new Promise<void>((resolve) => {
        window.setTimeout(resolve, 640);
      });

      try {
        const [res] = await Promise.all([fetchPromise, minAnimPromise]);
        if (res.cards.length === 0) {
          setError(t('该卡池暂时没有符合条件的未安装谱面', 'No non-local maps found in this pack pool'));
          setStage('sealed');
          setTearDragPct(0);
          return;
        }
        for (const c of res.cards) seenIdsRef.current.add(c.id);
        setCards(res.cards);
        setFlippedIds(new Set());
        setRevealTriggers({});
        setFlashBurst(true);
        setStage('opened');
        setTearDragPct(0);
        window.setTimeout(() => setFlashBurst(false), 720);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('开包失败，请重试', 'Failed to open card pack'));
        setStage('sealed');
        setTearDragPct(0);
      }
    },
    [stage, packId, cardCount, packs, selectedPack, onTriggerEffect, baseFilters, t],
  );

  const flipSingleCard = useCallback(
    (card: NormalizedBeatmapset) => {
      if (flippedIds.has(card.id)) return;
      const stats = getCardSummaryStats(card);
      const rarity = getStarRarityMeta(stats.repStars, lang);
      playCardFlipSound(rarity.tier);

      setFlippedIds((prev) => {
        const next = new Set(prev);
        next.add(card.id);
        return next;
      });
      setRevealTriggers((prev) => ({
        ...prev,
        [card.id]: (prev[card.id] || 0) + 1,
      }));

      if (rarity.tier === 'legendary' || rarity.tier === 'mythic') {
        setStageShake(true);
        onTriggerEffect(0.85, rarity.glow);
        window.setTimeout(() => setStageShake(false), 380);
      }
    },
    [flippedIds, lang, onTriggerEffect],
  );

  const handleRevealAll = () => {
    const unflipped = cards.filter((c) => !flippedIds.has(c.id));
    unflipped.forEach((card, i) => {
      window.setTimeout(() => {
        const stats = getCardSummaryStats(card);
        const rarity = getStarRarityMeta(stats.repStars, lang);
        playCardFlipSound(rarity.tier);
        setFlippedIds((prev) => {
          const next = new Set(prev);
          next.add(card.id);
          return next;
        });
        setRevealTriggers((prev) => ({
          ...prev,
          [card.id]: (prev[card.id] || 0) + 1,
        }));
        if (rarity.tier === 'mythic' || rarity.tier === 'legendary') {
          setStageShake(true);
          onTriggerEffect(0.75, rarity.glow);
          window.setTimeout(() => setStageShake(false), 360);
        }
      }, i * 115);
    });
  };

  const handlePackSeamPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stage !== 'sealed') return;
    tearOriginXRef.current = e.clientX;
    setTearDragPct(8);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePackSeamPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stage !== 'sealed' || tearOriginXRef.current === null) return;
    const dx = Math.abs(e.clientX - tearOriginXRef.current);
    const pct = Math.min(100, Math.max(8, Math.round((dx / 92) * 100)));
    setTearDragPct(pct);
    if (pct >= 100) {
      tearOriginXRef.current = null;
      void handleRipOpen();
    }
  };

  const handlePackSeamPointerUp = () => {
    if (tearOriginXRef.current === null) return;
    tearOriginXRef.current = null;
    if (tearDragPct >= 75) {
      void handleRipOpen();
    } else {
      setTearDragPct(0);
    }
  };

  const flippedCount = cards.filter((c) => flippedIds.has(c.id)).length;
  const allFlipped = cards.length > 0 && flippedCount === cards.length;

  const gridColsClass =
    cards.length <= 1
      ? 'grid-cols-1 max-w-[310px] mx-auto'
      : cards.length === 2
        ? 'grid-cols-1 sm:grid-cols-2 max-w-[660px] mx-auto'
        : cards.length <= 3
          ? 'grid-cols-1 sm:grid-cols-3 max-w-[980px] mx-auto'
          : cards.length <= 5
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 max-w-[1440px] mx-auto w-full'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 max-w-[1440px] mx-auto w-full';

  const cardHeightClass =
    cards.length <= 1
      ? 'h-[430px]'
      : cards.length <= 5
        ? 'h-[375px] sm:h-[400px]'
        : 'h-[315px] sm:h-[330px]';

  const tierCounts = cards.reduce<Record<StarRarityTier, number>>(
    (acc, c) => {
      if (!flippedIds.has(c.id)) return acc;
      const r = getStarRarityMeta(getCardSummaryStats(c).repStars, lang).tier;
      acc[r] += 1;
      return acc;
    },
    { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
  );

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-5 ${
        stageShake ? 'gacha-stage-shake' : ''
      }`}
    >
      {/* Pack Burst Radial Flash */}
      {flashBurst && (
        <div
          aria-hidden="true"
          className="gacha-pack-flash pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
        >
          <div
            className="h-72 w-72 rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle, #ffffff 0%, ${selectedPack.glowHex} 45%, transparent 72%)`,
            }}
          />
        </div>
      )}

      {stage === 'sealed' || stage === 'tearing' ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:items-stretch lg:overflow-hidden">
          {/* Left: Editorial Pack Dossier (`the-masses-travels` operator archive layout) */}
          <aside className="flex shrink-0 flex-col justify-between gap-3 rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] p-4 backdrop-blur-md lg:w-[410px] xl:w-[445px]">
            {/* Eyebrow & 3-Color Palette Swatches */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--ga-line)] pb-2">
                <span className="ga-mono text-[0.65625rem] font-bold tracking-[0.18em] text-[var(--ga-cobalt)] uppercase">
                  SERIES {selectedPack.code} // NON-LOCAL POOL
                </span>
                <div className="flex items-center gap-1" title="Editorial Palette Swatches">
                  {selectedPack.swatches.map((hex, sIdx) => (
                    <span
                      key={sIdx}
                      className="h-3 w-3 border border-black/15"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="ga-serif text-[0.6875rem] tracking-[0.22em] text-[var(--ga-ink-3)] uppercase">
                  {selectedPack.editorialSub}
                </div>
                <h3 className="ga-cn-serif text-[1.45rem] leading-tight font-bold text-[var(--ga-ink)]">
                  <ScrambleText text={selectedPack.name} triggerKey={packId} />
                </h3>
                <p className="mt-1 text-[0.78125rem] text-[var(--ga-ink-2)]">
                  {selectedPack.tagline}
                </p>
              </div>
            </div>

            {/* Clean Hairline-Divided Pack Index (01 - 07) */}
            <div className="min-h-0 flex-1 overflow-y-auto border-y border-[var(--ga-line)] divide-y divide-[var(--ga-line)]">
              {packs.map((p) => {
                const active = p.id === packId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={stage === 'tearing'}
                    data-ga-cursor={`PACK ${p.code}`}
                    onClick={() => {
                      setPackId(p.id);
                      onTriggerEffect(0.35, p.accentHex);
                    }}
                    className={`relative flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                      active
                        ? 'bg-[color-mix(in_srgb,var(--ga-cobalt)_11%,transparent)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--ga-ink)_4%,transparent)]'
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute top-0 bottom-0 left-0 w-[3px]"
                        style={{ backgroundColor: p.accentHex }}
                      />
                    )}
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`ga-mono text-[0.6875rem] font-bold ${
                          active ? 'text-[var(--ga-cobalt)]' : 'text-[var(--ga-ink-3)]'
                        }`}
                      >
                        {p.code}
                      </span>
                      <span className="h-3.5 w-2.5 shrink-0" style={{ background: p.foilGradient }} />
                      <span className="truncate text-[0.84375rem] font-bold text-[var(--ga-ink)]">
                        {p.name}
                      </span>
                    </div>
                    <span
                      className="ga-mono shrink-0 rounded-[2px] px-1.5 py-0.5 text-[0.625rem] font-bold"
                      style={{
                        backgroundColor: `${p.accentHex}1c`,
                        color: active ? p.accentHex : 'var(--ga-ink-2)',
                      }}
                    >
                      {p.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Card Count Calibration Strip (1..20) + Primary Solid Obsidian CTA */}
            <div className="space-y-2.5">
              <div className="space-y-2 border border-[var(--ga-line)] bg-[var(--ga-panel)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[0.78125rem] font-bold text-[var(--ga-ink)]">
                    <Layers className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
                    <span>{t('单包爆出卡牌数 (1–20)', 'Cards per Pack (1–20)')}</span>
                  </span>
                  <span className="ga-serif text-[1.125rem] font-bold text-[var(--ga-cobalt)] tabular-nums">
                    {String(cardCount).padStart(2, '0')}{' '}
                    <span className="ga-mono text-[0.6875rem] font-bold uppercase">
                      {t('张', 'CARDS')}
                    </span>
                  </span>
                </div>

                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  disabled={stage === 'tearing'}
                  value={cardCount}
                  onChange={(e) => setCardCount(Number(e.target.value))}
                  className="impeccable-range w-full"
                  aria-label={t('单包卡牌数量', 'Cards per pack')}
                />

                <div className="flex items-center gap-1.5">
                  {CARD_COUNT_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={stage === 'tearing'}
                      data-active={cardCount === n ? 'true' : 'false'}
                      data-ga-cursor={`QTY ${n}`}
                      onClick={() => setCardCount(n)}
                      className="ga-line-btn h-7 flex-1 font-mono text-[0.71875rem]"
                    >
                      {String(n).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[0.78125rem] text-rose-500">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={stage === 'tearing'}
                data-ga-cursor={t('开启卡包', 'UNSEAL')}
                onClick={() => void handleRipOpen()}
                className="ga-solid-btn h-11 w-full justify-between px-4 text-[0.875rem]"
              >
                {stage === 'tearing' ? (
                  <>
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('正在撕开封条…', 'Unsealing Pack…')}</span>
                    </span>
                    <span className="ga-mono text-[0.6875rem] opacity-75">TEARING</span>
                  </>
                ) : (
                  <>
                    <span className="ga-cn-serif tracking-wide">
                      {t(`撕开卡包 · 爆出 ${cardCount} 张卡`, `UNSEAL PACK · ${cardCount} CARDS`)}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="ga-mono text-[0.65625rem] opacity-65">
                        PACK {selectedPack.code}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </>
                )}
              </button>
            </div>
          </aside>

          {/* Right: Multi-layered Graphic Plate Altar + 3D Foil Pack */}
          <div
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const nx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
              const ny = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
              setPlatePointer({ x: nx, y: ny });
            }}
            onMouseLeave={() => setPlatePointer({ x: 0, y: 0 })}
            className="relative flex min-h-[410px] flex-1 flex-col items-center justify-center overflow-hidden rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel)] p-6 backdrop-blur-sm"
          >
            {/* Procedural `the-masses-travels` Graphic Plate Layer */}
            <GachaPackPlate
              pack={selectedPack}
              cardCount={cardCount}
              blueprint={blueprint}
              tearing={stage === 'tearing'}
              pointer={platePointer}
            />

            {/* Foil Booster Packet */}
            <div
              onMouseMove={(e) => {
                if (stage !== 'sealed') return;
                const r = e.currentTarget.getBoundingClientRect();
                const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
                const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
                setPackTilt({ rx: -ny * 9, ry: nx * 12 });
              }}
              onMouseLeave={() => setPackTilt({ rx: 0, ry: 0 })}
              style={{
                transform: `perspective(1000px) rotateX(${packTilt.rx}deg) rotateY(${packTilt.ry}deg)`,
                transition: 'transform 160ms ease-out',
              }}
              className={`relative z-10 -mt-5 w-[238px] sm:w-[254px] ${
                stage === 'tearing' ? 'gacha-pack-shake' : 'gacha-pack-float'
              }`}
            >
              {/* Top Tear Seam */}
              <div
                data-ga-target="true"
                data-ga-cursor={t('沿虚线划开', 'DRAG TEAR')}
                onPointerDown={handlePackSeamPointerDown}
                onPointerMove={handlePackSeamPointerMove}
                onPointerUp={handlePackSeamPointerUp}
                onPointerCancel={handlePackSeamPointerUp}
                title={t('沿此虚线左右划动或直接点击下方卡包撕开', 'Drag across seam or click pack body to open')}
                className={`relative cursor-ew-resize overflow-hidden rounded-t-[3px] px-4 py-3 text-center select-none ${
                  stage === 'tearing' ? 'gacha-pack-rip-top' : ''
                }`}
                style={{
                  background: selectedPack.foilGradient,
                  boxShadow: `0 -4px 22px -4px ${selectedPack.glowHex}55`,
                  borderBottom: '2px dashed rgba(255, 255, 255, 0.58)',
                }}
              >
                <div className="ga-mono flex items-center justify-center gap-1.5 text-[0.65625rem] font-bold tracking-[0.2em] text-white/90 uppercase">
                  <Scissors className="h-3 w-3 text-amber-300" />
                  <span>{t('沿虚线划开', 'DRAG TO TEAR')}</span>
                </div>
                {tearDragPct > 0 && (
                  <div
                    className="mt-1 h-1 bg-amber-300 shadow-[0_0_12px_#fde047]"
                    style={{ width: `${tearDragPct}%` }}
                  />
                )}
              </div>

              {/* Main Architectural Booster Foil Body */}
              <div
                data-ga-target="true"
                data-ga-cursor={t('点击撕开', 'RIP PACK')}
                onClick={() => void handleRipOpen()}
                className="relative flex h-[284px] cursor-pointer flex-col items-center justify-between overflow-hidden rounded-b-[4px] px-5 py-6 text-white select-none"
                style={{
                  background: selectedPack.foilGradient,
                  boxShadow: `0 28px 60px -14px rgba(0,0,0,0.72), 0 0 38px -8px ${selectedPack.glowHex}55`,
                }}
              >
                {/* Hairline Technical Inner Framing */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2.5 border border-white/15"
                />
                <div
                  aria-hidden="true"
                  className="paimon-nebula pointer-events-none absolute -inset-8 opacity-45"
                  style={{
                    background: `radial-gradient(circle at 30% 25%, ${selectedPack.glowHex}55, transparent 52%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.22), transparent 45%)`,
                  }}
                />

                <div className="ga-mono relative z-10 flex w-full items-center justify-between text-[0.625rem] font-bold tracking-[0.16em] text-white/80 uppercase">
                  <span>PACK {selectedPack.code}</span>
                  <span>{selectedPack.starRangeLabel}</span>
                </div>

                {/* Central Minimalist Astrolabe Seal */}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full border border-white/25 backdrop-blur-md"
                    style={{
                      background: `radial-gradient(circle, ${selectedPack.glowHex}44 0%, rgba(0,0,0,0.38) 76%)`,
                      boxShadow: `0 0 28px ${selectedPack.glowHex}55`,
                    }}
                  >
                    <span
                      className="font-display text-[1.55rem] tracking-[0.16em]"
                      style={{ fontWeight: 200, color: '#fef3c7', paddingLeft: '0.16em' }}
                    >
                      osu!
                    </span>
                  </div>
                  <div className="ga-cn-serif mt-3 text-[1.125rem] font-bold tracking-wide drop-shadow">
                    {selectedPack.name}
                  </div>
                  <div className="ga-mono mt-0.5 text-[0.625rem] tracking-[0.18em] text-white/70 uppercase">
                    {selectedPack.editorialSub}
                  </div>
                </div>

                <div className="ga-mono relative z-10 rounded-[2px] border border-amber-300/35 bg-black/50 px-3 py-1 text-[0.6875rem] font-bold tracking-[0.14em] text-amber-300 backdrop-blur-md">
                  × {String(cardCount).padStart(2, '0')} {t('张未装谱面', 'UNOWNED MAPS')}
                </div>
              </div>
            </div>

            <p className="ga-mono absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-3 py-1 text-[0.6875rem] text-[var(--ga-ink-2)] backdrop-blur-sm">
              {t(
                '开包后鼠标悬停卡背亮起星数光谱光晕 · 点击翻牌触发特效',
                'HOVER SEALED CARDS FOR STAR-RATING AURA · CLICK TO UNSEAL',
              )}
            </p>
          </div>
        </div>
      ) : (
        /* Opened Exhibition Grid */
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-3 overflow-hidden">
          {/* Architectural Command Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-4 py-2.5 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-baseline gap-2">
                <span className="ga-mono text-[0.6875rem] font-bold text-[var(--ga-cobalt)]">
                  PACK {selectedPack.code}
                </span>
                <span className="ga-cn-serif text-[0.9375rem] font-bold text-[var(--ga-ink)]">
                  <ScrambleText text={selectedPack.name} triggerKey={`${packId}-${cards.length}`} />
                </span>
              </div>

              <span className="h-4 w-px bg-[var(--ga-line)]" />

              <span className="ga-mono text-[0.71875rem] font-semibold text-[var(--ga-ink-2)]">
                {t(`已翻开 ${flippedCount} / ${cards.length}`, `REVEALED ${flippedCount} / ${cards.length}`)}
              </span>

              {tierCounts.mythic > 0 && (
                <span className="ga-mono rounded-[2px] bg-amber-500/20 px-2 py-0.5 text-[0.65625rem] font-bold text-amber-500">
                  ✦ MYTHIC ×{tierCounts.mythic}
                </span>
              )}
              {tierCounts.legendary > 0 && (
                <span className="ga-mono rounded-[2px] bg-orange-500/20 px-2 py-0.5 text-[0.65625rem] font-bold text-orange-500">
                  ★ LEGENDARY ×{tierCounts.legendary}
                </span>
              )}
              {tierCounts.epic > 0 && (
                <span className="ga-mono rounded-[2px] bg-rose-500/20 px-2 py-0.5 text-[0.65625rem] font-bold text-rose-500">
                  ★ EPIC ×{tierCounts.epic}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {!allFlipped && (
                <button
                  type="button"
                  data-ga-cursor={t('全部翻开', 'REVEAL ALL')}
                  onClick={handleRevealAll}
                  className="ga-solid-btn h-8 px-3 text-[0.75rem]"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t('全部翻开', 'Reveal All')}</span>
                </button>
              )}

              <button
                type="button"
                data-ga-cursor={t('下载整包', 'QUEUE ALL')}
                onClick={() => {
                  onBatchDownload(cards);
                  onNotify(
                    t(
                      `已将整包 ${cards.length} 首谱面加入下载队列`,
                      `Queued all ${cards.length} pack cards for download`,
                    ),
                  );
                }}
                className="ga-line-btn h-8 px-3 text-[0.75rem]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
                <span>{t(`下载整包 (${cards.length})`, `Download All (${cards.length})`)}</span>
              </button>

              <button
                type="button"
                data-ga-cursor={t('再开一包', 'OPEN AGAIN')}
                onClick={() => void handleRipOpen()}
                className="ga-line-btn h-8 px-3 text-[0.75rem]"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>{t('再开一包', 'Open Another')}</span>
              </button>

              <button
                type="button"
                data-ga-cursor={t('换卡包', 'PACK LIST')}
                onClick={() => {
                  setStage('sealed');
                  setCards([]);
                  setFlippedIds(new Set());
                }}
                className="ga-line-btn h-8 px-3 text-[0.75rem]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('换卡包', 'Change Pack')}</span>
              </button>
            </div>
          </div>

          {/* Spacious Full-Width Card Exhibition Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
            <div className={`grid gap-4 sm:gap-5 ${gridColsClass}`}>
              {cards.map((card, idx) => {
                const isFaceDown = !flippedIds.has(card.id);
                const stats = getCardSummaryStats(card);
                const rarity = getStarRarityMeta(stats.repStars, lang);
                const serial = String(idx + 1).padStart(2, '0');

                return (
                  <div
                    key={card.id}
                    style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}
                    className={`gacha-pack-deal flex flex-col gap-2 ${cardHeightClass}`}
                  >
                    <BeatmapGachaCard
                      beatmapset={card}
                      faceDown={isFaceDown}
                      revealTrigger={revealTriggers[card.id] || 0}
                      compact={cards.length >= 4}
                      target={target}
                      activeTask={activeTaskBySet.get(card.id)}
                      isPlaying={isPlaying && playingSetId === card.id}
                      className="h-full w-full"
                      onHoverBack={(tier) => {
                        if (lastHoveredCardRef.current !== card.id) {
                          lastHoveredCardRef.current = card.id;
                          playCardHoverTick(tier);
                        }
                      }}
                      onFlip={() => flipSingleCard(card)}
                      onTogglePlay={onTogglePlaySet}
                      onDownload={onDownload}
                      onOpenDetail={(s, diffId) => onOpenDetail(s, diffId)}
                    />

                    {/* Crisp Index & Rarity Footnote */}
                    <div className="flex h-5 items-center justify-between border-t border-[var(--ga-line)] px-0.5 pt-1">
                      <span className="ga-mono text-[0.625rem] font-semibold text-[var(--ga-ink-3)]">
                        #{serial}
                      </span>
                      {!isFaceDown ? (
                        <span
                          className="ga-mono inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[0.625rem] font-extrabold tracking-wider uppercase"
                          style={{ background: rarity.badgeBg, color: rarity.badgeText }}
                        >
                          <Star className="h-2.5 w-2.5 fill-current" />
                          <span>{rarity.label}</span>
                        </span>
                      ) : (
                        <span className="ga-mono text-[0.625rem] text-[var(--ga-ink-3)]">
                          {t('悬停感应星光', 'HOVER TO SENSE SR')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
