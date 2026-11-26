import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Eye,
  Filter,
  Heart,
  Layers,
  Loader2,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
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
import { GachaCardInspectorModal } from './GachaCardInspectorModal';
import { GachaPackPlate } from './GachaPackPlate';
import { playCardFlipSound, playCardHoverTick, playPackTearSound } from './gachaSound';
import {
  getCardSummaryStats,
  getGachaPacks,
  getStarRarityMeta,
  type GachaPackSigil,
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

function PackSigilIcon({ sigil, className = 'h-4 w-4' }: { sigil: GachaPackSigil; className?: string }) {
  switch (sigil) {
    case 'prism':
      return <Layers className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'pulse':
      return <Activity className={className} />;
    case 'weave':
      return <Sparkles className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'filter':
      return <Filter className={className} />;
    default:
      return <Orbit className={className} />;
  }
}

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
  const [dossierOpen, setDossierOpen] = useState(true);
  const [stage, setStage] = useState<PackStage>('sealed');
  const [cards, setCards] = useState<NormalizedBeatmapset[]>([]);
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set());
  const [revealTriggers, setRevealTriggers] = useState<Record<number, number>>({});
  const [stageShake, setStageShake] = useState(false);
  const [flashBurst, setFlashBurst] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3D Circular Ring Stage & 360° Inspector state
  const [ringAngle, setRingAngle] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 1200, height: 640 });
  const [inspectorIndex, setInspectorIndex] = useState<number | null>(null);

  const ringStageRef = useRef<HTMLDivElement | null>(null);
  const ringDragRef = useRef<{ active: boolean; startX: number; baseAngle: number }>({
    active: false,
    startX: 0,
    baseAngle: 0,
  });

  const [packTilt, setPackTilt] = useState({ rx: 0, ry: 0 });
  const [platePointer, setPlatePointer] = useState({ x: 0, y: 0 });
  const [tearDragPct, setTearDragPct] = useState(0);
  const tearOriginXRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const lastHoveredCardRef = useRef<number | null>(null);

  const selectedPack = packs.find((p) => p.id === packId) ?? packs[0];

  // Observe Circular Ring dimensions dynamically
  useEffect(() => {
    const el = ringStageRef.current;
    if (!el || stage !== 'opened') return undefined;
    const update = () => {
      setStageSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage]);

  const handleRipOpen = useCallback(
    async (overridePackId?: GachaPackId, overrideCount?: number) => {
      if (stage === 'tearing') return;
      const targetPack = overridePackId ?? packId;
      const targetCount = Math.min(20, Math.max(1, overrideCount ?? cardCount));

      setError(null);
      setStage('tearing');
      setTearDragPct(100);
      playPackTearSound();
      onTriggerEffect(1.0);

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
        setInspectorIndex(null);
        setRingAngle(0);
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
    [stage, packId, cardCount, onTriggerEffect, baseFilters, t],
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
    const stepDelayMs = Math.min(80, Math.round(520 / Math.max(1, unflipped.length)));
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
      }, i * stepDelayMs);
    });
  };

  const rotateRingByCards = (step: number) => {
    const stepRad = (Math.PI * 2) / Math.max(1, cards.length);
    setRingAngle((a) => a + step * stepRad);
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
  const sliderFillPct = Math.round(((cardCount - 1) / 19) * 100);

  const tierCounts = cards.reduce<Record<StarRarityTier, number>>(
    (acc, c) => {
      if (!flippedIds.has(c.id)) return acc;
      const r = getStarRarityMeta(getCardSummaryStats(c).repStars, lang).tier;
      acc[r] += 1;
      return acc;
    },
    { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
  );

  // Compute responsive 3D circular ring geometry for 1..20 cards
  const N = Math.max(1, cards.length);
  const w = Math.max(360, stageSize.width);
  const h = Math.max(360, stageSize.height);
  const baseCardW =
    N <= 1
      ? Math.min(276, w * 0.42)
      : N <= 5
        ? Math.min(212, Math.max(150, w * 0.162))
        : N <= 10
          ? Math.min(190, Math.max(138, w * 0.145))
          : Math.min(176, Math.max(128, w * 0.135));
  const baseCardH = Math.round(baseCardW * 1.48);
  const rx = N <= 1 ? 0 : Math.min(w * 0.37, Math.max(250, N * 36));
  const ry = N <= 1 ? 0 : Math.min(h * 0.21, 74 + Math.min(N, 8) * 6);

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 ${
        stageShake ? 'gacha-stage-shake' : ''
      }`}
    >
      {/* Subtle Flash on Unseal */}
      {flashBurst && (
        <div
          aria-hidden="true"
          className="gacha-pack-flash pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
        >
          <div
            className="h-72 w-72 rounded-full blur-2xl"
            style={{
              background: 'radial-gradient(circle, #ffffff 0%, var(--ga-cobalt) 48%, transparent 72%)',
            }}
          />
        </div>
      )}

      {stage === 'sealed' || stage === 'tearing' ? (
        <div className="relative mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:items-stretch lg:overflow-hidden">
          {/* Collapsible Compact Left Dossier (narrower width) */}
          {dossierOpen ? (
            <aside className="flex shrink-0 flex-col justify-between gap-2.5 rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] p-3 backdrop-blur-md lg:w-[272px] xl:w-[292px]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1.5 border-b border-[var(--ga-line)] pb-1.5">
                  <span className="ga-mono text-[0.625rem] font-bold tracking-[0.16em] text-[var(--ga-cobalt)] uppercase">
                    SERIES {selectedPack.code} // POOL
                  </span>
                  <button
                    type="button"
                    data-ga-cursor={t('收起侧栏', 'COLLAPSE')}
                    onClick={() => setDossierOpen(false)}
                    title={t('收起左侧卡包栏', 'Collapse pack sidebar')}
                    className="ga-line-btn h-6 w-6 p-0 text-[var(--ga-ink-2)]"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <div className="ga-mono text-[0.625rem] tracking-[0.18em] text-[var(--ga-ink-3)] uppercase">
                    {selectedPack.editorialSub}
                  </div>
                  <h3 className="ga-cn-serif text-[1.2rem] leading-tight font-bold text-[var(--ga-ink)]">
                    <ScrambleText text={selectedPack.name} triggerKey={packId} />
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-[0.71875rem] text-[var(--ga-ink-2)]">
                    {selectedPack.tagline}
                  </p>
                </div>
              </div>

              {/* Clean Hairline Pack List */}
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
                        onTriggerEffect(0.3);
                      }}
                      className={`relative flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors ${
                        active
                          ? 'bg-[color-mix(in_srgb,var(--ga-cobalt)_12%,transparent)]'
                          : 'hover:bg-[color-mix(in_srgb,var(--ga-ink)_4%,transparent)]'
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute top-0 bottom-0 left-0 w-[3px] bg-[var(--ga-cobalt)]"
                        />
                      )}
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`ga-mono text-[0.65625rem] font-bold ${
                            active ? 'text-[var(--ga-cobalt)]' : 'text-[var(--ga-ink-3)]'
                          }`}
                        >
                          {p.code}
                        </span>
                        <span
                          className={
                            active ? 'text-[var(--ga-cobalt)]' : 'text-[var(--ga-ink-3)]'
                          }
                        >
                          <PackSigilIcon sigil={p.sigil} className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-[0.78125rem] font-bold text-[var(--ga-ink)]">
                          {p.name}
                        </span>
                      </div>
                      <span className="ga-mono shrink-0 text-[0.59375rem] font-bold text-[var(--ga-ink-3)]">
                        {p.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Card Count Calibration Strip (1..20) with working --fill track */}
              <div className="space-y-2">
                <div className="space-y-1.5 border border-[var(--ga-line)] bg-[var(--ga-panel)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[0.75rem] font-bold text-[var(--ga-ink)]">
                      <Layers className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
                      <span>{t('抽卡数 (1–20)', 'Cards (1–20)')}</span>
                    </span>
                    <span className="ga-serif text-[1rem] font-bold text-[var(--ga-cobalt)] tabular-nums">
                      {String(cardCount).padStart(2, '0')}{' '}
                      <span className="ga-mono text-[0.625rem] uppercase">{t('张', 'CARDS')}</span>
                    </span>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    disabled={stage === 'tearing'}
                    value={cardCount}
                    style={{ '--fill': `${sliderFillPct}%` } as CSSProperties}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    className="impeccable-range w-full"
                    aria-label={t('单包卡牌数量', 'Cards per pack')}
                  />

                  <div className="flex items-center gap-1">
                    {CARD_COUNT_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={stage === 'tearing'}
                        data-active={cardCount === n ? 'true' : 'false'}
                        data-ga-cursor={`QTY ${n}`}
                        onClick={() => setCardCount(n)}
                        className="ga-line-btn h-6 flex-1 font-mono text-[0.6875rem]"
                      >
                        {String(n).padStart(2, '0')}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[0.75rem] text-rose-500">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  disabled={stage === 'tearing'}
                  data-ga-cursor={t('开启卡包', 'UNSEAL')}
                  onClick={() => void handleRipOpen()}
                  className="ga-solid-btn h-10 w-full justify-between px-3.5 text-[0.8125rem]"
                >
                  {stage === 'tearing' ? (
                    <>
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('正在撕开…', 'Unsealing…')}</span>
                      </span>
                      <span className="ga-mono text-[0.625rem] opacity-75">TEARING</span>
                    </>
                  ) : (
                    <>
                      <span className="ga-cn-serif tracking-wide">
                        {t(`撕开卡包 · ${cardCount} 张`, `UNSEAL · ${cardCount}`)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="ga-mono text-[0.625rem] opacity-65">
                          #{selectedPack.code}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </>
                  )}
                </button>
              </div>
            </aside>
          ) : (
            <button
              type="button"
              data-ga-cursor={t('展开卡包栏', 'EXPAND')}
              onClick={() => setDossierOpen(true)}
              className="ga-line-btn absolute top-2 left-2 z-20 h-8 bg-[var(--ga-panel-strong)] px-3 text-[0.75rem] backdrop-blur-md"
            >
              <PanelLeftOpen className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
              <span className="ga-mono font-bold">PACK {selectedPack.code}</span>
              <span>· {selectedPack.name}</span>
              <span className="ga-mono text-[var(--ga-cobalt)]">×{cardCount}</span>
            </button>
          )}

          {/* Right: Open Transparent Sanctuary Stage + Graphic Plate + Unified Theme Sleeve */}
          <div
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const nx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
              const ny = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
              setPlatePointer({ x: nx, y: ny });
            }}
            onMouseLeave={() => setPlatePointer({ x: 0, y: 0 })}
            className="relative flex min-h-[420px] flex-1 flex-col items-center justify-center overflow-hidden border-0 bg-transparent p-4"
          >
            {/* Procedural `the-masses-travels` Graphic Plate */}
            <GachaPackPlate
              pack={selectedPack}
              cardCount={cardCount}
              blueprint={blueprint}
              tearing={stage === 'tearing'}
              pointer={platePointer}
            />

            {/* Unified Global-Theme Collector Booster Sleeve */}
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
              className={`relative z-10 -mt-5 w-[240px] sm:w-[258px] ${
                stage === 'tearing' ? 'gacha-pack-shake' : 'gacha-pack-float'
              }`}
            >
              {/* Top Tear Seam (Unified theme ink + cobalt stripe) */}
              <div
                data-ga-target="true"
                data-ga-cursor={t('沿虚线划开', 'DRAG TEAR')}
                onPointerDown={handlePackSeamPointerDown}
                onPointerMove={handlePackSeamPointerMove}
                onPointerUp={handlePackSeamPointerUp}
                onPointerCancel={handlePackSeamPointerUp}
                title={t('沿此虚线左右划动或直接点击下方卡包撕开', 'Drag across seam or click pack body to open')}
                className={`relative cursor-ew-resize overflow-hidden rounded-t-[3px] border border-b-0 border-[var(--ga-cobalt)] px-4 py-3 text-center select-none ${
                  stage === 'tearing' ? 'gacha-pack-rip-top' : ''
                }`}
                style={{
                  background:
                    'linear-gradient(160deg, var(--ga-panel-strong) 0%, color-mix(in srgb, var(--ga-cobalt) 22%, var(--ga-paper)) 100%)',
                  borderBottom: '2px dashed var(--ga-cobalt)',
                  boxShadow: '0 -6px 24px -6px color-mix(in srgb, var(--ga-cobalt) 40%, transparent)',
                }}
              >
                <div className="ga-mono flex items-center justify-center gap-1.5 text-[0.65625rem] font-bold tracking-[0.2em] text-[var(--ga-ink)] uppercase">
                  <Scissors className="h-3 w-3 text-[var(--ga-cobalt)]" />
                  <span>{t('沿虚线划开', 'DRAG TO TEAR')}</span>
                </div>
                {tearDragPct > 0 && (
                  <div
                    className="mt-1 h-1 bg-[var(--ga-cobalt)]"
                    style={{ width: `${tearDragPct}%` }}
                  />
                )}
              </div>

              {/* Unified Theme-Synchronized Collector Sleeve Body */}
              <div
                data-ga-target="true"
                data-ga-cursor={t('点击撕开', 'UNSEAL PACK')}
                onClick={() => void handleRipOpen()}
                className="relative flex h-[288px] cursor-pointer flex-col items-center justify-between overflow-hidden rounded-b-[4px] border border-t-0 border-[var(--ga-line-strong)] px-5 py-6 text-[var(--ga-ink)] select-none"
                style={{
                  background:
                    'linear-gradient(155deg, color-mix(in srgb, var(--ga-paper) 94%, var(--ga-cobalt) 6%) 0%, color-mix(in srgb, var(--ga-paper) 78%, var(--ga-cobalt) 22%) 100%)',
                  boxShadow:
                    '0 28px 60px -16px rgba(0,0,0,0.42), 0 0 38px -10px color-mix(in srgb, var(--ga-cobalt) 42%, transparent)',
                }}
              >
                {/* Crisp Architectural Inner Hairline Frame */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2.5 border border-[color-mix(in_srgb,var(--ga-cobalt)_36%,transparent)]"
                />
                <div
                  aria-hidden="true"
                  className="ga-halftone pointer-events-none absolute top-0 right-0 h-28 w-28 text-[var(--ga-cobalt)] opacity-15"
                  style={{ maskImage: 'radial-gradient(circle at top right, black 10%, transparent 74%)' }}
                />

                <div className="ga-mono relative z-10 flex w-full items-center justify-between text-[0.625rem] font-bold tracking-[0.16em] text-[var(--ga-ink-2)] uppercase">
                  <span>PACK {selectedPack.code}</span>
                  <span className="text-[var(--ga-cobalt)]">{selectedPack.starRangeLabel}</span>
                </div>

                {/* Central Minimalist Sigil + Thin-Stroke `osu!` */}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div
                    className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[var(--ga-cobalt)]"
                    style={{
                      background:
                        'radial-gradient(circle, color-mix(in srgb, var(--ga-cobalt) 18%, transparent) 0%, transparent 76%)',
                      boxShadow: '0 0 28px color-mix(in srgb, var(--ga-cobalt) 35%, transparent)',
                    }}
                  >
                    <span
                      className="font-display text-[1.45rem] tracking-[0.16em] text-[var(--ga-ink)]"
                      style={{ fontWeight: 200, paddingLeft: '0.16em' }}
                    >
                      osu!
                    </span>
                    <span className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ga-cobalt)] text-white shadow">
                      <PackSigilIcon sigil={selectedPack.sigil} className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="ga-cn-serif mt-3 text-[1.125rem] font-bold tracking-wide text-[var(--ga-ink)]">
                    {selectedPack.name}
                  </div>
                  <div className="ga-mono mt-0.5 text-[0.625rem] tracking-[0.18em] text-[var(--ga-ink-3)] uppercase">
                    {selectedPack.editorialSub}
                  </div>
                </div>

                <div className="ga-mono relative z-10 rounded-[2px] border border-[var(--ga-cobalt)] bg-[color-mix(in_srgb,var(--ga-cobalt)_14%,transparent)] px-3 py-1 text-[0.6875rem] font-bold tracking-[0.14em] text-[var(--ga-cobalt)]">
                  × {String(cardCount).padStart(2, '0')} {t('张未装谱面', 'UNOWNED MAPS')}
                </div>
              </div>
            </div>

            <p className="ga-mono absolute bottom-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-[var(--ga-panel-strong)] px-3 py-1 text-[0.65625rem] text-[var(--ga-ink-2)] backdrop-blur-sm">
              {t(
                '开包后卡片将呈圆环排列 · 悬停亮起星数光晕 · 翻开后可点击进入 360° 3D 检视',
                'CARDS DEAL IN A 3D RING · HOVER FOR STAR AURA · CLICK REVEALED CARD FOR 360° INSPECT',
              )}
            </p>
          </div>
        </div>
      ) : (
        /* Opened 3D Circular Ring Exhibition Stage (open Three.js backdrop, zero frosted panel wrapper) */
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-2 overflow-hidden">
          {/* Minimal Floating Command Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ga-line)] px-1 pb-2">
            <div className="flex flex-wrap items-center gap-2.5">
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
                <span className="ga-mono rounded-[2px] bg-amber-500/20 px-1.5 py-0.5 text-[0.625rem] font-bold text-amber-500">
                  ✦ MYTHIC ×{tierCounts.mythic}
                </span>
              )}
              {tierCounts.legendary > 0 && (
                <span className="ga-mono rounded-[2px] bg-orange-500/20 px-1.5 py-0.5 text-[0.625rem] font-bold text-orange-500">
                  ★ LEGENDARY ×{tierCounts.legendary}
                </span>
              )}
              {tierCounts.epic > 0 && (
                <span className="ga-mono rounded-[2px] bg-rose-500/20 px-1.5 py-0.5 text-[0.625rem] font-bold text-rose-500">
                  ★ EPIC ×{tierCounts.epic}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {cards.length > 1 && (
                <div className="mr-1 flex items-center gap-1">
                  <button
                    type="button"
                    data-ga-cursor="ORBIT PREV"
                    onClick={() => rotateRingByCards(1)}
                    title={t('逆时针旋转圆环', 'Rotate ring prev')}
                    className="ga-line-btn h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    data-ga-cursor="ORBIT NEXT"
                    onClick={() => rotateRingByCards(-1)}
                    title={t('顺时针旋转圆环', 'Rotate ring next')}
                    className="ga-line-btn h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {!allFlipped && (
                <button
                  type="button"
                  data-ga-cursor={t('全部翻开', 'REVEAL ALL')}
                  onClick={handleRevealAll}
                  className="ga-solid-btn h-7 px-3 text-[0.71875rem]"
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
                className="ga-line-btn h-7 px-2.5 text-[0.71875rem]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
                <span>{t(`下载整包 (${cards.length})`, `Download All (${cards.length})`)}</span>
              </button>

              <button
                type="button"
                data-ga-cursor={t('再开一包', 'OPEN AGAIN')}
                onClick={() => void handleRipOpen()}
                className="ga-line-btn h-7 px-2.5 text-[0.71875rem]"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
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
                className="ga-line-btn h-7 px-2.5 text-[0.71875rem]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('换卡包', 'Change Pack')}</span>
              </button>
            </div>
          </div>

          {/* 3D Circular Ring Stage (drag background or scroll wheel to orbit) */}
          <div
            ref={ringStageRef}
            onWheel={(e) => {
              if (cards.length <= 1) return;
              setRingAngle((a) => a + Math.sign(e.deltaY) * 0.34);
            }}
            onPointerDown={(e) => {
              if (cards.length <= 1) return;
              if ((e.target as HTMLElement).closest('button, .gacha-card-shell')) return;
              ringDragRef.current = { active: true, startX: e.clientX, baseAngle: ringAngle };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!ringDragRef.current.active) return;
              const dx = e.clientX - ringDragRef.current.startX;
              setRingAngle(ringDragRef.current.baseAngle + dx * 0.0055);
            }}
            onPointerUp={() => {
              ringDragRef.current.active = false;
            }}
            onPointerCancel={() => {
              ringDragRef.current.active = false;
            }}
            className="relative isolate min-h-0 flex-1 overflow-hidden select-none"
          >
            {/* Subtle Architectural Ring Orbit Track SVG */}
            {cards.length > 1 && (
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <ellipse
                  cx="50%"
                  cy="52%"
                  rx={Math.round(rx * 1.04)}
                  ry={Math.round(ry * 1.08)}
                  fill="none"
                  stroke="var(--ga-cobalt)"
                  strokeOpacity="0.28"
                  strokeWidth="1.1"
                  strokeDasharray="6 6"
                />
                <ellipse
                  cx="50%"
                  cy="52%"
                  rx={Math.round(rx * 0.72)}
                  ry={Math.round(ry * 0.74)}
                  fill="none"
                  stroke="var(--ga-ink)"
                  strokeOpacity="0.12"
                  strokeWidth="0.9"
                />
              </svg>
            )}

            {/* Circular Orbital Cards */}
            {cards.map((card, idx) => {
              const isFaceDown = !flippedIds.has(card.id);
              const stats = getCardSummaryStats(card);
              const rarity = getStarRarityMeta(stats.repStars, lang);
              const serial = String(idx + 1).padStart(2, '0');

              const theta = N <= 1 ? 0 : (idx / N) * Math.PI * 2 + ringAngle;
              const depth = N <= 1 ? 1 : Math.cos(theta); // +1 frontmost, -1 farthest
              const x = Math.sin(theta) * rx;
              const y = N <= 1 ? -12 : depth * (ry * 0.62) - 10;
              const scale = N <= 1 ? 1 : 0.72 + ((depth + 1) / 2) * 0.30;
              const rotY = N <= 1 ? 0 : -Math.sin(theta) * 14;
              const opacity = N <= 8 ? 1 : 0.58 + ((depth + 1) / 2) * 0.42;
              const zIndex = Math.round(((depth + 1) / 2) * 80) + 10;

              return (
                <div
                  key={card.id}
                  style={{
                    width: `${baseCardW}px`,
                    height: `${baseCardH}px`,
                    zIndex,
                    opacity,
                    transform: `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px), 0) scale(${scale.toFixed(3)}) perspective(1200px) rotateY(${rotY.toFixed(2)}deg)`,
                  }}
                  className="ga-ring-card flex flex-col gap-1.5"
                >
                  <BeatmapGachaCard
                    beatmapset={card}
                    faceDown={isFaceDown}
                    revealTrigger={revealTriggers[card.id] || 0}
                    compact
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
                    onInspect={() => setInspectorIndex(idx)}
                    onTogglePlay={onTogglePlaySet}
                    onDownload={onDownload}
                    onOpenDetail={(s, diffId) => onOpenDetail(s, diffId)}
                  />

                  <div className="flex h-5 items-center justify-between px-0.5">
                    <span className="ga-mono text-[0.625rem] font-bold text-[var(--ga-ink-2)]">
                      #{serial}
                    </span>
                    {!isFaceDown ? (
                      <span
                        className="ga-mono inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[0.59375rem] font-extrabold tracking-wider uppercase shadow-sm"
                        style={{ background: rarity.badgeBg, color: rarity.badgeText }}
                      >
                        <Star className="h-2.5 w-2.5 fill-current" />
                        <span>{rarity.label}</span>
                      </span>
                    ) : (
                      <span className="ga-mono text-[0.59375rem] text-[var(--ga-ink-3)]">
                        {t('悬停感应星光', 'HOVER SR')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {cards.length > 1 && (
              <div className="ga-mono pointer-events-none absolute right-2 bottom-1 text-[0.625rem] text-[var(--ga-ink-3)]">
                {t('拖拽空白处或滚轮旋转圆环 · 翻开后点击卡片 360° 检视', 'Drag canvas or scroll to orbit · Click revealed card for 360° 3D view')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 360-Degree 3D Collector Slab Inspector Modal */}
      {inspectorIndex !== null && cards[inspectorIndex] && (
        <GachaCardInspectorModal
          cards={cards}
          initialIndex={inspectorIndex}
          target={target}
          activeTaskBySet={activeTaskBySet}
          playingSetId={playingSetId}
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlaySet}
          onDownload={onDownload}
          onOpenDetail={onOpenDetail}
          onClose={() => setInspectorIndex(null)}
        />
      )}
    </div>
  );
}
