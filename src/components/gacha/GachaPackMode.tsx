import { type MouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
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
  Move,
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
  favoriteIds: Set<number>;
  likedCount: number;
  likedOpen: boolean;
  playingSetId: number | null;
  isPlaying: boolean;
  prefetchCacheRef: MutableRefObject<Map<string, NormalizedBeatmapset[]>>;
  prefetchInFlightRef: MutableRefObject<Map<string, Promise<void>>>;
  onToggleFavorite: (set: NormalizedBeatmapset) => void;
  onToggleLikedDrawer: () => void;
  onOpenCustomFilter: () => void;
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
  favoriteIds,
  likedCount,
  likedOpen,
  playingSetId,
  isPlaying,
  prefetchCacheRef,
  prefetchInFlightRef,
  onToggleFavorite,
  onToggleLikedDrawer,
  onOpenCustomFilter,
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

  // Hearthstone-style physical pack stack & Awakening Altar drag physics
  const packDockRef = useRef<HTMLDivElement | null>(null);
  const altarWellRef = useRef<HTMLDivElement | null>(null);
  const [packDrag, setPackDrag] = useState<{
    active: boolean;
    returning: boolean;
    snapping: boolean;
    originX: number;
    originY: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    rotX: number;
    rotY: number;
    proximity: number;
    inDropZone: boolean;
  } | null>(null);
  const dragMetaRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    movedDist: number;
    wasInZone: boolean;
  } | null>(null);
  const snapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    };
  }, []);

  const selectedPack = packs.find((p) => p.id === packId) ?? packs[0];
  const filterSignature =
    packId === 'current_filter'
      ? JSON.stringify({
          q: baseFilters.q ?? '',
          keys: baseFilters.keys ?? '',
          status: baseFilters.status ?? 'any',
          minStars: baseFilters.minStars ?? null,
          maxStars: baseFilters.maxStars ?? null,
          minBpm: baseFilters.minBpm ?? null,
          maxBpm: baseFilters.maxBpm ?? null,
          minLn: baseFilters.minLn ?? null,
          maxLn: baseFilters.maxLn ?? null,
          minLength: baseFilters.minLength ?? null,
          maxLength: baseFilters.maxLength ?? null,
        })
      : '';
  const poolKey = filterSignature ? `${packId}::${filterSignature}` : packId;

  const ensurePrefetch = useCallback(
    (pid: GachaPackId, key: string) => {
      const existing = prefetchCacheRef.current.get(key) ?? [];
      if (existing.length >= 20 || prefetchInFlightRef.current.has(key)) return;
      const promise = drawGachaBeatmapsets({
        count: 20,
        packId: pid,
        baseFilters,
        excludeIds: Array.from(seenIdsRef.current).slice(-160),
      })
        .then((res) => {
          if (res.cards.length === 0) return;
          const prev = prefetchCacheRef.current.get(key) ?? [];
          const prevIds = new Set(prev.map((c) => c.id));
          const merged = [...prev, ...res.cards.filter((c) => !prevIds.has(c.id))];
          prefetchCacheRef.current.set(key, merged);
        })
        .catch(() => {
          // Silent prefetch failure is harmless; interactive draw handles errors
        })
        .finally(() => {
          prefetchInFlightRef.current.delete(key);
        });
      prefetchInFlightRef.current.set(key, promise);
    },
    [baseFilters],
  );

  useEffect(() => {
    ensurePrefetch(packId, poolKey);
  }, [packId, poolKey, ensurePrefetch]);

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
      const targetKey =
        targetPack === 'current_filter' && filterSignature
          ? `${targetPack}::${filterSignature}`
          : targetPack;
      const targetCount = Math.min(20, Math.max(1, overrideCount ?? cardCount));

      setError(null);
      setStage('tearing');
      setTearDragPct(100);
      playPackTearSound();
      onTriggerEffect(1.0);

      const minAnimPromise = new Promise<void>((resolve) => {
        window.setTimeout(resolve, 240);
      });

      try {
        let cachedPool = prefetchCacheRef.current.get(targetKey) ?? [];
        const inFlight = prefetchInFlightRef.current.get(targetKey);
        if (cachedPool.length < targetCount && inFlight) {
          await Promise.all([inFlight, minAnimPromise]);
          cachedPool = prefetchCacheRef.current.get(targetKey) ?? [];
        }
        let drawn: NormalizedBeatmapset[] = [];
        if (cachedPool.length >= targetCount) {
          drawn = cachedPool.slice(0, targetCount);
          prefetchCacheRef.current.set(targetKey, cachedPool.slice(targetCount));
          await minAnimPromise;
        } else {
          const fetchPromise = drawGachaBeatmapsets({
            count: targetCount,
            packId: targetPack,
            baseFilters,
            excludeIds: Array.from(seenIdsRef.current).slice(-160),
          });
          const [res] = await Promise.all([fetchPromise, minAnimPromise]);
          drawn = res.cards;
        }

        if (drawn.length === 0) {
          setError(t('该卡池暂时没有符合条件的未安装谱面', 'No non-local maps found in this pack pool'));
          setStage('sealed');
          setTearDragPct(0);
          return;
        }
        for (const c of drawn) seenIdsRef.current.add(c.id);
        setCards(drawn);
        setFlippedIds(new Set());
        setRevealTriggers({});
        setInspectorIndex(null);
        setRingAngle(0);
        setFlashBurst(true);
        setStage('opened');
        setTearDragPct(0);
        setPackDrag(null);
        ensurePrefetch(targetPack, targetKey);
        window.setTimeout(() => setFlashBurst(false), 620);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('开包失败，请重试', 'Failed to open card pack'));
        setStage('sealed');
        setTearDragPct(0);
        setPackDrag(null);
      }
    },
    [stage, packId, filterSignature, cardCount, onTriggerEffect, baseFilters, ensurePrefetch, t, prefetchCacheRef, prefetchInFlightRef],
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

  const handlePackSeamPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage !== 'sealed') return;
    e.stopPropagation();
    tearOriginXRef.current = e.clientX;
    setTearDragPct(8);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePackSeamPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage !== 'sealed' || tearOriginXRef.current === null) return;
    e.stopPropagation();
    const dx = Math.abs(e.clientX - tearOriginXRef.current);
    const pct = Math.min(100, Math.max(8, Math.round((dx / 92) * 100)));
    setTearDragPct(pct);
    if (pct >= 100) {
      tearOriginXRef.current = null;
      void handleRipOpen();
    }
  };

  const handlePackSeamPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tearOriginXRef.current === null) return;
    e.stopPropagation();
    tearOriginXRef.current = null;
    if (tearDragPct >= 75) {
      void handleRipOpen();
    } else {
      setTearDragPct(0);
    }
  };

  const snapToAltarAndOpen = useCallback(
    (originRect?: DOMRect) => {
      if (stage !== 'sealed') return;
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
      const dockRect = originRect ?? packDockRef.current?.getBoundingClientRect();
      const altarRect = altarWellRef.current?.getBoundingClientRect();
      if (!dockRect || !altarRect) {
        void handleRipOpen();
        return;
      }
      const snapDx = altarRect.left + altarRect.width / 2 - (dockRect.left + dockRect.width / 2);
      const snapDy = altarRect.top + altarRect.height / 2 - (dockRect.top + dockRect.height / 2);
      setPackDrag({
        active: false,
        returning: false,
        snapping: true,
        originX: dockRect.left,
        originY: dockRect.top,
        width: dockRect.width,
        height: dockRect.height,
        dx: snapDx,
        dy: snapDy,
        rotX: 0,
        rotY: 0,
        proximity: 1,
        inDropZone: true,
      });
      snapTimerRef.current = window.setTimeout(() => {
        void handleRipOpen();
      }, 170);
    },
    [stage, handleRipOpen],
  );

  const handlePackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage !== 'sealed' || (e.target as HTMLElement).closest('[data-pack-seam="true"]')) return;
    const dockEl = packDockRef.current;
    if (!dockEl) return;
    const rect = dockEl.getBoundingClientRect();
    dragMetaRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      movedDist: 0,
      wasInZone: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const meta = dragMetaRef.current;
    if (!meta || meta.pointerId !== e.pointerId || stage !== 'sealed') return;
    const vx = e.clientX - meta.lastX;
    const vy = e.clientY - meta.lastY;
    meta.movedDist += Math.hypot(vx, vy);
    meta.lastX = e.clientX;
    meta.lastY = e.clientY;

    if (meta.movedDist < 6) return;

    const dx = e.clientX - meta.startX;
    const dy = e.clientY - meta.startY;
    const rotY = Math.max(-22, Math.min(22, vx * 1.15));
    const rotX = Math.max(-18, Math.min(18, -vy * 0.85));

    let proximity = 0;
    let inDropZone = false;
    const altarRect = altarWellRef.current?.getBoundingClientRect();
    if (altarRect) {
      const packCx = meta.originX + meta.width / 2 + dx;
      const packCy = meta.originY + meta.height / 2 + dy;
      const altarCx = altarRect.left + altarRect.width / 2;
      const altarCy = altarRect.top + altarRect.height / 2;
      const dist = Math.hypot(packCx - altarCx, packCy - altarCy);
      proximity = Math.max(0, Math.min(1, 1 - dist / 460));
      inDropZone = dist <= Math.max(145, altarRect.width * 0.45);
    }

    if (inDropZone && !meta.wasInZone) {
      meta.wasInZone = true;
      playCardHoverTick('legendary');
      onTriggerEffect(0.28);
    } else if (!inDropZone && meta.wasInZone) {
      meta.wasInZone = false;
    }

    setPackDrag({
      active: true,
      returning: false,
      snapping: false,
      originX: meta.originX,
      originY: meta.originY,
      width: meta.width,
      height: meta.height,
      dx,
      dy,
      rotX,
      rotY,
      proximity,
      inDropZone,
    });
  };

  const finishPackPointerDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const meta = dragMetaRef.current;
    if (!meta || meta.pointerId !== e.pointerId) return;
    dragMetaRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Safe fallback
    }

    if (meta.movedDist < 6 || meta.wasInZone) {
      snapToAltarAndOpen(new DOMRect(meta.originX, meta.originY, meta.width, meta.height));
      return;
    }

    setPackDrag((prev) =>
      prev
        ? {
            ...prev,
            active: false,
            returning: true,
            snapping: false,
            dx: 0,
            dy: 0,
            rotX: 0,
            rotY: 0,
            proximity: 0,
            inDropZone: false,
          }
        : null,
    );
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      setPackDrag(null);
    }, 300);
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

  // Compute viewport-adaptive enlarged 3D circular ring geometry for 1..20 cards
  const N = Math.max(1, cards.length);
  const w = Math.max(360, stageSize.width);
  const h = Math.max(360, stageSize.height);
  const maxByHeight = Math.round(((h - 52) * 0.68) / 1.48);
  const targetByWidth =
    N <= 1
      ? Math.min(340, w * 0.44)
      : N <= 5
        ? Math.min(266, Math.max(168, w * 0.195))
        : N <= 10
          ? Math.min(226, Math.max(150, w * 0.168))
          : Math.min(198, Math.max(134, w * 0.148));
  const baseCardW = Math.max(134, Math.min(targetByWidth, maxByHeight));
  const baseCardH = Math.round(baseCardW * 1.48);
  const rx = N <= 1 ? 0 : Math.min(w * 0.39, Math.max(260, N * 38));
  const ry = N <= 1 ? 0 : Math.min(h * 0.22, 78 + Math.min(N, 8) * 6);

  const renderPackSleeve = (isFloating: boolean) => (
    <div className="w-full select-none">
      {/* Top Tear Seam (High-contrast Constructivist ink header + perforated cobalt seam) */}
      <div
        data-pack-seam="true"
        data-ga-target="true"
        data-ga-cursor={t('沿虚线划开', 'DRAG TEAR')}
        onPointerDown={isFloating ? undefined : handlePackSeamPointerDown}
        onPointerMove={isFloating ? undefined : handlePackSeamPointerMove}
        onPointerUp={isFloating ? undefined : handlePackSeamPointerUp}
        onPointerCancel={isFloating ? undefined : handlePackSeamPointerUp}
        title={t('沿此虚线左右划动撕开，或按住卡包拖入右侧祭坛', 'Drag seam to rip or drag pack into right altar')}
        className={`relative cursor-ew-resize overflow-hidden rounded-t-[3px] border border-b-0 border-[var(--ga-ink)] px-3.5 py-2.5 text-center select-none ${
          stage === 'tearing' ? 'gacha-pack-rip-top' : ''
        }`}
        style={{
          background: 'var(--ga-ink)',
          color: 'var(--ga-paper)',
          borderBottom: '2.5px dashed var(--ga-cobalt)',
          boxShadow: '0 -8px 24px -6px color-mix(in srgb, var(--ga-cobalt) 40%, transparent)',
        }}
      >
        <div className="ga-mono flex items-center justify-center gap-1.5 text-[0.65625rem] font-bold tracking-[0.2em] uppercase">
          <Scissors className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
          <span>{t(`沿虚线撕开 · ${selectedPack.code}`, `TEAR // POOL ${selectedPack.code}`)}</span>
        </div>
        {tearDragPct > 0 && (
          <div className="mt-1.5 h-1 bg-[var(--ga-cobalt)]" style={{ width: `${tearDragPct}%` }} />
        )}
      </div>

      {/* PROUN Bauhaus Diagonal-Slash Collector Sleeve Body */}
      <div
        className={`relative flex h-[clamp(300px,44vh,406px)] flex-col items-center justify-between overflow-hidden rounded-b-[4px] border border-t-0 border-[var(--ga-line-strong)] bg-[var(--ga-paper)] px-5 py-6 text-[var(--ga-ink)] select-none ${
          isFloating ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          boxShadow: isFloating
            ? '0 44px 86px -18px rgba(0,0,0,0.62), 0 0 56px -6px color-mix(in srgb, var(--ga-cobalt) 60%, transparent)'
            : '0 28px 60px -18px rgba(0,0,0,0.42), 0 0 36px -10px color-mix(in srgb, var(--ga-cobalt) 36%, transparent)',
        }}
      >
        {/* Bauhaus Diagonal Theme-Accent Block + Constructivist Crimson Corner Wedge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: 'var(--ga-cobalt)',
            clipPath: 'polygon(0 0, 68% 0, 0 44%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-88"
          style={{
            background: 'var(--ga-crimson)',
            clipPath: 'polygon(100% 62%, 100% 100%, 48% 100%)',
          }}
        />

        {/* Crisp Architectural Inner Frame + Halftone Micro Accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 border border-[color-mix(in_srgb,var(--ga-ink)_22%,transparent)]"
        />
        <div
          aria-hidden="true"
          className="ga-halftone pointer-events-none absolute top-0 right-0 h-28 w-28 text-[var(--ga-cobalt)] opacity-15"
          style={{ maskImage: 'radial-gradient(circle at top right, black 10%, transparent 74%)' }}
        />

        {/* Top Technical Pool Index */}
        <div className="ga-mono relative z-10 flex w-full items-center justify-between text-[0.65625rem] font-bold tracking-[0.16em] uppercase">
          <span className="rounded-[2px] bg-[var(--ga-ink)] px-2 py-0.5 text-[var(--ga-paper)]">
            POOL {selectedPack.code}
          </span>
          <span className="rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-paper)] px-2 py-0.5 text-[var(--ga-cobalt)]">
            {selectedPack.starRangeLabel}
          </span>
        </div>

        {/* Central Double-Ring osu! Hit Circle + Approach Ring Stamp */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-[var(--ga-ink)] bg-[var(--ga-paper)] shadow-lg"
            style={{
              boxShadow: '0 0 28px color-mix(in srgb, var(--ga-cobalt) 35%, transparent)',
            }}
          >
            <div className="pointer-events-none absolute inset-2 rounded-full border border-[var(--ga-cobalt)]" />
            <span
              className="font-display text-[1.7rem] tracking-[0.16em] text-[var(--ga-ink)]"
              style={{ fontWeight: 200, paddingLeft: '0.16em' }}
            >
              osu!
            </span>
            <span className="absolute -right-1.5 -bottom-1.5 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-[var(--ga-cobalt)] text-white shadow">
              <PackSigilIcon sigil={selectedPack.sigil} className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="ga-cn-serif mt-3.5 rounded-[2px] bg-[color-mix(in_srgb,var(--ga-paper)_90%,transparent)] px-3 py-0.5 text-[1.15rem] font-bold tracking-wide text-[var(--ga-ink)] backdrop-blur-sm">
            {selectedPack.name}
          </div>
          <div className="ga-mono mt-0.5 text-[0.625rem] font-semibold tracking-[0.18em] text-[var(--ga-ink-2)] uppercase">
            {selectedPack.editorialSub}
          </div>
        </div>

        {/* Constructivist Ink Quantity Stamp */}
        <div className="ga-mono relative z-10 flex w-full items-center justify-between border border-[var(--ga-ink)] bg-[var(--ga-ink)] px-3 py-1.5 text-[0.6875rem] font-bold tracking-[0.14em] text-[var(--ga-paper)]">
          <span>{selectedPack.badge}</span>
          <span>
            × {String(cardCount).padStart(2, '0')} {t('张', 'CARDS')}
          </span>
        </div>
      </div>
    </div>
  );

  const packIsLifted = Boolean(packDrag);
  const effectiveProximity = packDrag?.proximity ?? 0;
  const effectiveDropActive = Boolean(packDrag?.inDropZone);

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

              {packId === 'current_filter' && (
                <button
                  type="button"
                  data-ga-cursor={t('配置筛选', 'EDIT FILTERS')}
                  onClick={onOpenCustomFilter}
                  className="ga-line-btn h-8 w-full justify-between px-2.5 text-[0.71875rem]"
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ga-ink)]">
                    <Filter className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
                    <span>{t('编辑自选筛选条件', 'Configure Filter Criteria')}</span>
                  </span>
                  <span className="ga-mono text-[0.625rem] text-[var(--ga-cobalt)]">
                    {[
                      baseFilters.keys ? `${baseFilters.keys}K` : t('全键', 'ALL'),
                      baseFilters.minStars !== undefined || baseFilters.maxStars !== undefined
                        ? `${baseFilters.minStars ?? 0}–${baseFilters.maxStars ?? '∞'}★`
                        : null,
                      baseFilters.status && baseFilters.status !== 'any'
                        ? baseFilters.status.toUpperCase()
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              )}

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
                  onClick={() => snapToAltarAndOpen()}
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

          {/* Right: Hearthstone Physical Pack Stack (Left) + Awakening Altar Drop Well (Right) */}
          <div
            onMouseMove={(e: MouseEvent<HTMLDivElement>) => {
              const r = e.currentTarget.getBoundingClientRect();
              const nx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
              const ny = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2;
              setPlatePointer({ x: nx, y: ny });
            }}
            onMouseLeave={() => setPlatePointer({ x: 0, y: 0 })}
            className="relative flex min-h-[420px] flex-1 flex-col items-center justify-center gap-6 overflow-hidden border-0 bg-transparent px-4 py-4 sm:flex-row sm:gap-8 lg:gap-12"
          >
            {/* Left Zone: Physical Reserve Stack + Grab-able Top Booster Pack */}
            <div className="relative flex shrink-0 flex-col items-center">
              <div
                ref={packDockRef}
                data-ga-target="true"
                data-ga-cursor={t('拖入祭坛', 'DRAG TO ALTAR')}
                onPointerDown={handlePackPointerDown}
                onPointerMove={handlePackPointerMove}
                onPointerUp={finishPackPointerDrag}
                onPointerCancel={finishPackPointerDrag}
                onMouseMove={(e) => {
                  if (stage !== 'sealed' || packIsLifted) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
                  const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
                  setPackTilt({ rx: -ny * 8, ry: nx * 11 });
                }}
                onMouseLeave={() => setPackTilt({ rx: 0, ry: 0 })}
                className="relative z-10 w-[clamp(210px,18vw,286px)] touch-none"
              >
                {/* Reserve Stack Cards Underneath (visible always & left cleanly behind when top pack is dragged) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-[4px] border border-[var(--ga-line-strong)] bg-[var(--ga-paper)] opacity-60 shadow-lg"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[4px] border border-[var(--ga-line-strong)] bg-[var(--ga-paper)] opacity-82 shadow-lg"
                />
                {packIsLifted && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[4px] border-2 border-dashed border-[var(--ga-cobalt)] opacity-45"
                  />
                )}

                {/* Active Draggable Booster Sleeve */}
                <div
                  style={{
                    transform: `perspective(1000px) rotateX(${packTilt.rx}deg) rotateY(${packTilt.ry}deg)`,
                    transition: 'transform 160ms ease-out',
                  }}
                  className={`relative z-10 ${
                    packIsLifted
                      ? 'pointer-events-none opacity-0'
                      : stage === 'tearing'
                        ? 'gacha-pack-shake'
                        : 'gacha-pack-float'
                  }`}
                >
                  {renderPackSleeve(false)}
                </div>
              </div>

              <div className="ga-mono mt-4 inline-flex items-center gap-1.5 text-[0.625rem] font-semibold tracking-[0.18em] text-[var(--ga-ink-2)] uppercase">
                <Move className="h-3 w-3 text-[var(--ga-cobalt)]" />
                <span>{t('DRAG → ALTAR', 'DRAG → ALTAR')}</span>
              </div>
            </div>

            {/* Right Zone: Hearthstone Awakening Drop Well & Graphic Altar Plate */}
            <div
              ref={altarWellRef}
              data-drop-well="true"
              data-drop-active={effectiveDropActive ? 'true' : 'false'}
              onClick={() => {
                if (stage === 'sealed' && !packIsLifted) snapToAltarAndOpen();
              }}
              className="relative flex aspect-square w-[clamp(290px,28vw,400px)] shrink-0 cursor-pointer items-center justify-center"
            >
              <GachaPackPlate
                pack={selectedPack}
                cardCount={cardCount}
                blueprint={blueprint}
                tearing={stage === 'tearing'}
                pointer={platePointer}
                dragProximity={effectiveProximity}
                isDropTarget={effectiveDropActive}
                isDragging={packIsLifted}
              />

              {/* Subtle Lock-On Status Chip inside Drop Well */}
              <div
                className={`pointer-events-none relative z-10 rounded-[2px] border px-3 py-1 font-mono text-[0.6875rem] font-bold tracking-[0.18em] uppercase transition-all duration-200 ${
                  effectiveDropActive
                    ? 'scale-105 border-[var(--ga-crimson)] bg-[var(--ga-crimson)] text-white shadow-lg'
                    : packIsLifted
                      ? 'border-[var(--ga-cobalt)] bg-[var(--ga-panel-strong)] text-[var(--ga-cobalt)]'
                      : 'border-[var(--ga-line)] bg-[var(--ga-panel)] text-[var(--ga-ink-3)] opacity-75'
                }`}
              >
                {effectiveDropActive
                  ? t('松手即刻开包', 'RELEASE TO UNSEAL')
                  : packIsLifted
                    ? t('拖至此处释放', 'DROP PACK HERE')
                    : t('OPENING ALTAR', 'OPENING ALTAR')}
              </div>
            </div>
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
                data-ga-cursor={t('心动曲库', 'LIKED ARCHIVE')}
                data-active={likedOpen ? 'true' : 'false'}
                onClick={onToggleLikedDrawer}
                className="ga-line-btn h-7 px-2.5 text-[0.71875rem]"
              >
                <Heart className={`h-3.5 w-3.5 ${likedCount > 0 ? 'fill-current text-[var(--ga-cobalt)]' : ''}`} />
                <span>{t(`心动 (${likedCount})`, `Liked (${likedCount})`)}</span>
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
              const scale = N <= 1 ? 1 : 0.74 + ((depth + 1) / 2) * 0.26;
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
                    isFavorited={favoriteIds.has(card.id)}
                    className="h-full w-full"
                    onHoverBack={(tier) => {
                      if (lastHoveredCardRef.current !== card.id) {
                        lastHoveredCardRef.current = card.id;
                        playCardHoverTick(tier);
                      }
                    }}
                    onToggleFavorite={!isFaceDown ? onToggleFavorite : undefined}
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
          </div>
        </div>
      )}

      {/* Floating Dragged / Snapping Pack Layer */}
      {packDrag && (stage === 'sealed' || stage === 'tearing') && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: `${packDrag.originX}px`,
            top: `${packDrag.originY}px`,
            width: `${packDrag.width}px`,
            zIndex: 42,
            pointerEvents: 'none',
            transform: `perspective(1200px) translate3d(${packDrag.dx.toFixed(1)}px, ${packDrag.dy.toFixed(1)}px, 0) scale(${packDrag.snapping ? 1.03 : 1.06}) rotateX(${packDrag.rotX.toFixed(2)}deg) rotateY(${packDrag.rotY.toFixed(2)}deg)`,
            transition: packDrag.active
              ? 'none'
              : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {renderPackSleeve(true)}
        </div>
      )}

      {/* 360-Degree 3D Collector Slab Inspector Modal */}
      {inspectorIndex !== null && cards[inspectorIndex] && (
        <GachaCardInspectorModal
          cards={cards}
          initialIndex={inspectorIndex}
          target={target}
          activeTaskBySet={activeTaskBySet}
          favoriteIds={favoriteIds}
          playingSetId={playingSetId}
          isPlaying={isPlaying}
          onToggleFavorite={onToggleFavorite}
          onTogglePlay={onTogglePlaySet}
          onDownload={onDownload}
          onOpenDetail={onOpenDetail}
          onClose={() => setInspectorIndex(null)}
        />
      )}
    </div>
  );
}
