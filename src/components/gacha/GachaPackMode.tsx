import { useCallback, useRef, useState } from 'react';
import {
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
  activeTaskBySet: Map<number, DownloadTask>;
  playingSetId: number | null;
  isPlaying: boolean;
  onTogglePlaySet: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onBatchDownload: (sets: NormalizedBeatmapset[]) => void;
  onOpenDetail: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onNotify: (msg: string) => void;
}

type PackStage = 'sealed' | 'tearing' | 'opened';

const CARD_COUNT_PRESETS = [1, 5, 10, 15, 20] as const;

export function GachaPackMode({
  baseFilters,
  target,
  activeTaskBySet,
  playingSetId,
  isPlaying,
  onTogglePlaySet,
  onDownload,
  onBatchDownload,
  onOpenDetail,
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

  // Interactive foil 3D tilt + drag-to-tear along top seam
  const [packTilt, setPackTilt] = useState({ rx: 0, ry: 0 });
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

      setError(null);
      setStage('tearing');
      setTearDragPct(100);
      playPackTearSound();

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
    [stage, packId, cardCount, baseFilters, t],
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
        window.setTimeout(() => setStageShake(false), 380);
      }
    },
    [flippedIds, lang],
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

  // Determine grid sizing dynamically across 1..20 cards
  const gridColsClass =
    cards.length <= 1
      ? 'grid-cols-1 max-w-[310px] mx-auto'
      : cards.length === 2
        ? 'grid-cols-1 sm:grid-cols-2 max-w-[660px] mx-auto'
        : cards.length <= 3
          ? 'grid-cols-1 sm:grid-cols-3 max-w-[980px] mx-auto'
          : cards.length <= 5
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5';

  const cardHeightClass =
    cards.length <= 1
      ? 'h-[430px]'
      : cards.length <= 5
        ? 'h-[375px] sm:h-[395px]'
        : 'h-[310px] sm:h-[325px]';

  // Count highest rarity revealed in current pack
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
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 ${
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
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Left: Pack Catalog & Card Count Configurator */}
          <div className="flex shrink-0 flex-col gap-3 rounded-2xl border border-hairline bg-surface-1/85 p-4 lg:w-[390px] xl:w-[430px]">
            <div>
              <div className="font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-osu uppercase">
                CARD PACK SELECTION
              </div>
              <h3 className="font-display text-[1.0625rem] font-extrabold text-ink">
                {t('选择卡包与单包卡牌数量', 'Choose Booster Pack & Card Count')}
              </h3>
            </div>

            {/* 7 Pack Kinds */}
            <div className="grid max-h-[310px] grid-cols-1 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-2 lg:grid-cols-1">
              {packs.map((p) => {
                const active = p.id === packId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={stage === 'tearing'}
                    onClick={() => setPackId(p.id)}
                    className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                      active
                        ? 'border-osu/60 bg-osu/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_35%,transparent)]'
                        : 'border-hairline bg-surface-2/60 hover:border-hairline-strong hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-7 w-5 shrink-0 rounded-[4px] shadow"
                        style={{ background: p.foilGradient }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display truncate text-[0.84375rem] font-bold text-ink">
                            {p.name}
                          </span>
                          <span
                            className="shrink-0 rounded px-1.5 py-px font-mono text-[0.625rem] font-bold"
                            style={{
                              backgroundColor: `${p.accentHex}22`,
                              color: p.accentHex,
                            }}
                          >
                            {p.badge}
                          </span>
                        </div>
                        <div className="truncate text-[0.71875rem] text-ink-3">{p.tagline}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Card Count Customizer (1..20, Default 5) */}
            <div className="space-y-2 rounded-xl border border-hairline bg-surface-2/75 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-ink">
                  <Layers className="h-3.5 w-3.5 text-osu" />
                  <span>{t('单包爆出卡牌数 (1–20)', 'Cards per Pack (1–20)')}</span>
                </span>
                <span className="font-stat rounded-md bg-osu/15 px-2 py-0.5 text-[0.875rem] font-extrabold text-osu tabular-nums">
                  {cardCount} {t('张', 'cards')}
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

              <div className="flex flex-wrap items-center gap-1.5">
                {CARD_COUNT_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={stage === 'tearing'}
                    onClick={() => setCardCount(n)}
                    className={`btn btn-sm min-h-[26px] flex-1 font-mono text-[0.75rem] ${
                      cardCount === n ? 'border-osu/50 bg-osu/15 font-bold text-osu' : ''
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[0.78125rem] text-bad">
                {error}
              </div>
            )}
          </div>

          {/* Right: Interactive Hearthstone 3D Foil Pack Stage */}
          <div className="relative flex min-h-[380px] flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl bg-surface-0/55 p-6">
            {/* Ambient Altar Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute h-80 w-80 rounded-full opacity-35 blur-3xl transition-all duration-500"
              style={{
                background: `radial-gradient(circle, ${selectedPack.glowHex} 0%, transparent 70%)`,
              }}
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
              className={`relative z-10 w-[238px] sm:w-[258px] ${
                stage === 'tearing' ? 'gacha-pack-shake' : 'gacha-pack-float'
              }`}
            >
              {/* Top Tear Flap */}
              <div
                onPointerDown={handlePackSeamPointerDown}
                onPointerMove={handlePackSeamPointerMove}
                onPointerUp={handlePackSeamPointerUp}
                onPointerCancel={handlePackSeamPointerUp}
                title={t('沿此虚线左右划动或直接点击撕开按钮', 'Drag across top seam or click Rip Open Pack')}
                className={`relative cursor-ew-resize overflow-hidden rounded-t-[14px] px-4 py-3 text-center select-none ${
                  stage === 'tearing' ? 'gacha-pack-rip-top' : ''
                }`}
                style={{
                  background: selectedPack.foilGradient,
                  boxShadow: `0 -4px 20px -4px ${selectedPack.glowHex}55`,
                  borderBottom: '2px dashed rgba(255, 255, 255, 0.55)',
                }}
              >
                <div className="flex items-center justify-center gap-1.5 font-mono text-[0.65625rem] font-bold tracking-[0.18em] text-white/85 uppercase">
                  <Scissors className="h-3 w-3 text-amber-300" />
                  <span>{t('沿虚线划开', 'DRAG TO TEAR')}</span>
                </div>
                {tearDragPct > 0 && (
                  <div
                    className="mt-1 h-1 rounded-full bg-amber-300 shadow-[0_0_12px_#fde047]"
                    style={{ width: `${tearDragPct}%` }}
                  />
                )}
              </div>

              {/* Lower Main Booster Body */}
              <div
                onClick={() => void handleRipOpen()}
                className="relative flex h-[286px] cursor-pointer flex-col items-center justify-between overflow-hidden rounded-b-[18px] px-5 py-6 text-white shadow-[0_28px_60px_-14px_rgba(0,0,0,0.72)] select-none"
                style={{
                  background: selectedPack.foilGradient,
                  boxShadow: `0 24px 56px -14px rgba(0,0,0,0.75), 0 0 36px -8px ${selectedPack.glowHex}66`,
                }}
              >
                {/* Foil Shimmer */}
                <div
                  aria-hidden="true"
                  className="paimon-nebula pointer-events-none absolute -inset-8 opacity-45"
                  style={{
                    background: `radial-gradient(circle at 30% 25%, ${selectedPack.glowHex}55, transparent 52%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.22), transparent 45%)`,
                  }}
                />

                <div className="relative z-10 flex w-full items-center justify-between font-mono text-[0.65625rem] font-bold tracking-widest text-white/75 uppercase">
                  <span>PACK {selectedPack.code}</span>
                  <span>{selectedPack.starRangeLabel}</span>
                </div>

                {/* Central Emblem */}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-full backdrop-blur-md"
                    style={{
                      background: `radial-gradient(circle, ${selectedPack.glowHex}44 0%, rgba(0,0,0,0.35) 75%)`,
                      boxShadow: `0 0 30px ${selectedPack.glowHex}66`,
                    }}
                  >
                    <span
                      className="font-display text-[1.625rem] tracking-[0.14em]"
                      style={{ fontWeight: 200, color: '#fef3c7', paddingLeft: '0.14em' }}
                    >
                      osu!
                    </span>
                  </div>
                  <div className="mt-3 font-display text-[1.125rem] font-extrabold tracking-tight drop-shadow">
                    {selectedPack.name}
                  </div>
                  <div className="mt-0.5 text-[0.71875rem] font-medium text-white/75">
                    {selectedPack.badge}
                  </div>
                </div>

                <div className="relative z-10 rounded-full bg-black/45 px-3.5 py-1 font-mono text-[0.75rem] font-bold tracking-wider text-amber-300 backdrop-blur-md">
                  × {cardCount} {t('张未装谱面卡', 'BEATMAP CARDS')}
                </div>
              </div>
            </div>

            {/* Rip Open Action Button */}
            <div className="relative z-10 mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={stage === 'tearing'}
                onClick={() => void handleRipOpen()}
                className="btn btn-primary min-h-[42px] gap-2 rounded-full px-7 text-[0.9375rem] font-bold shadow-xl"
              >
                {stage === 'tearing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('正在撕开卡包…', 'Ripping Pack Open…')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {t(`撕开卡包 · 爆出 ${cardCount} 张卡`, `Rip Open Pack (${cardCount} Cards)`)}
                    </span>
                  </>
                )}
              </button>
              <p className="text-[0.71875rem] text-ink-3">
                {t(
                  '开包后鼠标悬停卡背可窥视星数光晕，点击翻牌触发特效',
                  'Hover face-down cards to peek Star Rating aura, then click to flip!',
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Opened Hearthstone Reveal Grid */
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Reveal Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface-1/85 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[0.875rem] font-extrabold text-ink">
                {selectedPack.name}
              </span>
              <span className="chip font-mono text-[0.71875rem]">
                {t(`已翻开 ${flippedCount} / ${cards.length}`, `Revealed ${flippedCount} / ${cards.length}`)}
              </span>

              {tierCounts.mythic > 0 && (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-mono text-[0.6875rem] font-bold text-amber-400">
                  ✦ MYTHIC ×{tierCounts.mythic}
                </span>
              )}
              {tierCounts.legendary > 0 && (
                <span className="rounded-full bg-orange-400/20 px-2 py-0.5 font-mono text-[0.6875rem] font-bold text-orange-400">
                  ★ LEGENDARY ×{tierCounts.legendary}
                </span>
              )}
              {tierCounts.epic > 0 && (
                <span className="rounded-full bg-rose-400/20 px-2 py-0.5 font-mono text-[0.6875rem] font-bold text-rose-400">
                  ★ EPIC ×{tierCounts.epic}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {!allFlipped && (
                <button
                  type="button"
                  onClick={handleRevealAll}
                  className="btn btn-primary btn-sm gap-1.5 text-[0.78125rem]"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t('全部翻开', 'Reveal All')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onBatchDownload(cards);
                  onNotify(
                    t(
                      `已将整包 ${cards.length} 首谱面加入下载队列`,
                      `Queued all ${cards.length} pack cards for download`,
                    ),
                  );
                }}
                className="btn btn-sm gap-1.5 text-[0.78125rem]"
              >
                <Download className="h-3.5 w-3.5 text-osu" />
                <span>{t(`下载整包 (${cards.length})`, `Download All (${cards.length})`)}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleRipOpen()}
                className="btn btn-sm gap-1.5 text-[0.78125rem]"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>{t('再开一包', 'Open Another')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStage('sealed');
                  setCards([]);
                  setFlippedIds(new Set());
                }}
                className="btn btn-sm gap-1 text-[0.78125rem]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('换卡包', 'Change Pack')}</span>
              </button>
            </div>
          </div>

          {/* Scrollable Card Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
            <div className={`grid gap-3.5 sm:gap-4 ${gridColsClass}`}>
              {cards.map((card, idx) => {
                const isFaceDown = !flippedIds.has(card.id);
                const stats = getCardSummaryStats(card);
                const rarity = getStarRarityMeta(stats.repStars, lang);

                return (
                  <div
                    key={card.id}
                    style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}
                    className={`gacha-pack-deal flex flex-col gap-1.5 ${cardHeightClass}`}
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

                    {/* Subtle rarity stamp underneath once flipped */}
                    <div className="flex h-5 items-center justify-center">
                      {!isFaceDown ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-extrabold tracking-wider uppercase shadow-sm"
                          style={{ background: rarity.badgeBg, color: rarity.badgeText }}
                        >
                          <Star className="h-2.5 w-2.5 fill-current" />
                          <span>{rarity.label}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[0.625rem] text-ink-4">
                          #{idx + 1} · {t('悬停感应星光', 'Hover to sense SR')}
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
