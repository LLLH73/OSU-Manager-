import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  Heart,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { drawGachaBeatmapsets } from '../../api';
import { getStarColor } from '../../constants';
import { useI18n } from '../../i18n';
import type {
  DownloadTarget,
  DownloadTask,
  GachaPackId,
  NormalizedBeatmapset,
  SearchFilters,
} from '../../types';
import { SelectField } from '../SelectField';
import { BeatmapGachaCard } from './BeatmapGachaCard';
import { brokenAxis, crops, ring, rng, ticks } from './gachaSketch';
import { playSwipeSound } from './gachaSound';
import { getCardSummaryStats, getGachaPacks } from './gachaUtils';

interface GachaDatingModeProps {
  baseFilters: SearchFilters;
  target: DownloadTarget;
  activeTaskBySet: Map<number, DownloadTask>;
  playingSetId: number | null;
  isPlaying: boolean;
  onPlaySet: (set: NormalizedBeatmapset, autoplay?: boolean) => void;
  onTogglePlaySet: (set: NormalizedBeatmapset) => void;
  onStopAudio: () => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onBatchDownload: (sets: NormalizedBeatmapset[]) => void;
  onOpenDetail: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onTriggerEffect: (intensity?: number, hexColor?: string) => void;
  onNotify: (msg: string) => void;
}

interface SwipeHistoryEntry {
  set: NormalizedBeatmapset;
  action: 'like' | 'pass';
}

export function GachaDatingMode({
  baseFilters,
  target,
  activeTaskBySet,
  playingSetId,
  isPlaying,
  onPlaySet,
  onTogglePlaySet,
  onStopAudio,
  onDownload,
  onBatchDownload,
  onOpenDetail,
  onTriggerEffect,
  onNotify,
}: GachaDatingModeProps) {
  const { lang, t } = useI18n();
  const packs = getGachaPacks(lang);

  const [packId, setPackId] = useState<GachaPackId>('standard');
  const [deck, setDeck] = useState<NormalizedBeatmapset[]>([]);
  const [liked, setLiked] = useState<NormalizedBeatmapset[]>([]);
  const [history, setHistory] = useState<SwipeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [autoDownloadLiked, setAutoDownloadLiked] = useState(false);
  const [showBackPeek, setShowBackPeek] = useState(false);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [exitingAction, setExitingAction] = useState<'like' | 'pass' | null>(null);

  const seenIdsRef = useRef<Set<number>>(new Set());
  const fetchingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastAutoPlayedIdRef = useRef<number | null>(null);

  // Hand-drawn Compass behind deck stage
  const compassSvg = useMemo(() => {
    const r = rng(802);
    return {
      outerRing: ring(210, 210, 188, r, 1.5),
      innerRing: ring(210, 210, 148, r, 1.1),
      dialTicks: ticks(210, 210, 170, 48, r),
      axes: `${brokenAxis(20, 210, 400, 210, r, 4)}${brokenAxis(210, 20, 210, 400, r, 4)}`,
      cropMarks: crops(18, 18, 402, 402, 20),
    };
  }, []);

  const loadMoreCards = useCallback(
    async (chosenPack: GachaPackId, reset = false) => {
      if (fetchingRef.current && !reset) return;
      fetchingRef.current = true;
      setLoading(true);
      setError(null);
      if (reset) {
        seenIdsRef.current.clear();
        setDeck([]);
        setHistory([]);
        lastAutoPlayedIdRef.current = null;
      }
      try {
        const res = await drawGachaBeatmapsets({
          count: 10,
          packId: chosenPack,
          baseFilters,
          excludeIds: Array.from(seenIdsRef.current).slice(-160),
        });
        for (const c of res.cards) seenIdsRef.current.add(c.id);
        setDeck((prev) => {
          const base = reset ? [] : prev;
          const baseIds = new Set(base.map((x) => x.id));
          return [...base, ...res.cards.filter((c) => !baseIds.has(c.id))];
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('抽取曲目失败', 'Failed to draw beatmaps'));
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [baseFilters, t],
  );

  useEffect(() => {
    void loadMoreCards(packId, true);
  }, [packId]);

  const topCard = deck[0] ?? null;

  useEffect(() => {
    if (!loading && deck.length > 0 && deck.length <= 3) {
      void loadMoreCards(packId, false);
    }
  }, [deck.length, loading, packId, loadMoreCards]);

  useEffect(() => {
    if (!topCard || !autoPlayEnabled) return;
    if (lastAutoPlayedIdRef.current !== topCard.id) {
      lastAutoPlayedIdRef.current = topCard.id;
      onPlaySet(topCard, true);
    }
  }, [topCard, autoPlayEnabled, onPlaySet]);

  useEffect(() => {
    if (!autoPlayEnabled && playingSetId !== null) {
      onStopAudio();
    }
  }, [autoPlayEnabled, playingSetId, onStopAudio]);

  const commitSwipe = useCallback(
    (action: 'like' | 'pass') => {
      if (!topCard || exitingAction) return;
      playSwipeSound(action);
      setExitingAction(action);
      setDragOffset({ x: action === 'like' ? 380 : -380, y: 18 });
      if (action === 'like') {
        onTriggerEffect(0.45, '#10b981');
      }

      const swiped = topCard;
      window.setTimeout(() => {
        setDeck((prev) => prev.slice(1));
        setHistory((prev) => [{ set: swiped, action }, ...prev].slice(0, 24));
        if (action === 'like') {
          setLiked((prev) => (prev.some((x) => x.id === swiped.id) ? prev : [swiped, ...prev]));
          if (autoDownloadLiked) {
            onDownload(swiped, target);
          }
        }
        setShowBackPeek(false);
        setExitingAction(null);
        setDragOffset({ x: 0, y: 0 });
      }, 210);
    },
    [topCard, exitingAction, onTriggerEffect, autoDownloadLiked, onDownload, target],
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0 || exitingAction) return;
    const [latest, ...rest] = history;
    setHistory(rest);
    setDeck((prev) => [latest.set, ...prev.filter((x) => x.id !== latest.set.id)]);
    if (latest.action === 'like') {
      setLiked((prev) => prev.filter((x) => x.id !== latest.set.id));
    }
    setShowBackPeek(false);
    lastAutoPlayedIdRef.current = null;
  }, [history, exitingAction]);

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
      if (!topCard) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        commitSwipe('pass');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        commitSwipe('like');
      } else if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlaySet(topCard);
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDownload(topCard, target);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onOpenDetail(topCard);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [topCard, commitSwipe, onTogglePlaySet, handleUndo, onDownload, target, onOpenDetail]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!topCard || exitingAction) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    setDragOffset({
      x: e.clientX - dragStartRef.current.x,
      y: (e.clientY - dragStartRef.current.y) * 0.35,
    });
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStartRef.current = null;
    if (dragOffset.x >= 105) {
      commitSwipe('like');
    } else if (dragOffset.x <= -105) {
      commitSwipe('pass');
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const likeOpacity = Math.min(1, Math.max(0, (dragOffset.x - 24) / 90));
  const passOpacity = Math.min(1, Math.max(0, (-dragOffset.x - 24) / 90));
  const compassColor =
    dragOffset.x > 25
      ? '#10b981'
      : dragOffset.x < -25
        ? 'var(--ga-crimson)'
        : 'var(--ga-cobalt)';

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-3.5 overflow-hidden p-3 sm:p-5 lg:flex-row">
      {/* Left/Center: Architectural Swipe Stage */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Editorial Control Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44 sm:w-48">
              <SelectField
                value={packId}
                onChange={(v) => setPackId(v as GachaPackId)}
                className="h-8 text-[0.78125rem]"
                title={t('选择抽卡曲池', 'Select beatmap pool')}
              >
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
            </div>

            <button
              type="button"
              data-ga-cursor={t('换一批', 'RESHUFFLE')}
              onClick={() => void loadMoreCards(packId, true)}
              disabled={loading}
              className="ga-line-btn h-8 px-3 text-[0.75rem]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{t('换一批', 'New Deck')}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[0.75rem]">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-2.5 py-1 text-[var(--ga-ink-2)] backdrop-blur-sm">
              <input
                type="checkbox"
                checked={autoPlayEnabled}
                onChange={(e) => setAutoPlayEnabled(e.target.checked)}
                className="accent-[var(--ga-cobalt)]"
              />
              <span>{t('切牌自动试听', 'Auto-Play')}</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-2.5 py-1 text-[var(--ga-ink-2)] backdrop-blur-sm">
              <input
                type="checkbox"
                checked={autoDownloadLiked}
                onChange={(e) => setAutoDownloadLiked(e.target.checked)}
                className="accent-[var(--ga-cobalt)]"
              />
              <span>{t('喜欢自动下载', 'Auto-DL Liked')}</span>
            </label>

            {topCard && (
              <button
                type="button"
                data-active={showBackPeek ? 'true' : 'false'}
                data-ga-cursor={showBackPeek ? 'FRONT' : 'BACK'}
                onClick={() => setShowBackPeek((v) => !v)}
                className="ga-line-btn h-8 px-2.5 text-[0.75rem]"
                title={t('查看派蒙星空卡背', 'Peek Paimon starfield back')}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>{showBackPeek ? t('回正面', 'Front') : t('看卡背', 'Back')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Center Deck Stage with Live Sketch Drafting Compass */}
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel)] px-3 py-4 backdrop-blur-sm">
          {/* Background SVG Drafting Compass */}
          <svg
            aria-hidden="true"
            viewBox="0 0 420 420"
            className="pointer-events-none absolute h-[min(92%,460px)] w-[min(92%,460px)] transition-colors duration-200"
            style={{
              color: compassColor,
              transform: `rotate(${(dragOffset.x * 0.14).toFixed(2)}deg)`,
            }}
          >
            <path d={compassSvg.cropMarks} fill="none" stroke="var(--ga-ink)" strokeOpacity="0.25" strokeWidth="1" />
            <path d={compassSvg.axes} fill="none" stroke="var(--ga-ink)" strokeOpacity="0.14" strokeWidth="0.85" />
            <path d={compassSvg.outerRing} fill="none" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1.2" />
            <path
              d={compassSvg.outerRing}
              transform="translate(1.5 1.1)"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.16"
              strokeWidth="1.2"
            />
            <path d={compassSvg.innerRing} fill="none" stroke="var(--ga-ink)" strokeOpacity="0.18" strokeWidth="0.9" strokeDasharray="3 4" />
            <path d={compassSvg.dialTicks} fill="none" stroke="currentColor" strokeOpacity="0.32" strokeWidth="0.9" />
          </svg>

          {/* Live Telemetry Vector Readout */}
          <div
            aria-hidden="true"
            className="ga-mono pointer-events-none absolute top-3 left-3.5 text-[0.65625rem] tracking-[0.16em] text-[var(--ga-ink-3)] uppercase"
          >
            ΔX {dragOffset.x >= 0 ? '+' : ''}
            {Math.round(dragOffset.x)} · {(dragOffset.x * 0.055).toFixed(1)}°
          </div>
          <div
            aria-hidden="true"
            className="ga-mono pointer-events-none absolute top-3 right-3.5 text-[0.65625rem] tracking-[0.16em] text-[var(--ga-ink-3)] uppercase"
          >
            QUEUE {String(deck.length).padStart(2, '0')}
          </div>

          {loading && deck.length === 0 ? (
            <div className="relative z-10 flex flex-col items-center gap-3 text-[var(--ga-ink-2)]">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--ga-cobalt)]" />
              <p className="text-[0.875rem] font-semibold">
                {t('正在从在线曲库随机洗牌…', 'Shuffling online non-local beatmaps…')}
              </p>
            </div>
          ) : error && deck.length === 0 ? (
            <div className="relative z-10 flex flex-col items-center gap-3 text-center">
              <p className="text-[0.875rem] font-semibold text-rose-500">{error}</p>
              <button
                type="button"
                onClick={() => void loadMoreCards(packId, true)}
                className="ga-solid-btn px-4 py-2 text-[0.8125rem]"
              >
                {t('重试抽卡', 'Retry Draw')}
              </button>
            </div>
          ) : deck.length === 0 ? (
            <div className="relative z-10 flex flex-col items-center gap-3 text-center text-[var(--ga-ink-2)]">
              <p className="text-[0.875rem] font-semibold">
                {t('当前牌堆已划完，点击重新洗牌', 'Deck exhausted — shuffle a fresh batch')}
              </p>
              <button
                type="button"
                onClick={() => void loadMoreCards(packId, true)}
                className="ga-solid-btn px-4 py-2 text-[0.8125rem]"
              >
                {t('再来 10 张', 'Draw 10 More')}
              </button>
            </div>
          ) : (
            <div className="relative z-10 flex h-[min(100%,465px)] w-[min(100%,345px)] items-center justify-center">
              {deck
                .slice(0, 3)
                .reverse()
                .map((card, revIdx, arr) => {
                  const stackIndex = arr.length - 1 - revIdx;
                  const isTop = stackIndex === 0;
                  const stackScale = 1 - stackIndex * 0.045;
                  const stackTranslateY = stackIndex * 12;
                  const tiltDeg = isTop ? dragOffset.x * 0.055 : stackIndex === 1 ? -1.8 : 2.2;
                  const cardTransform = isTop
                    ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${tiltDeg}deg)`
                    : `translate3d(0px, ${stackTranslateY}px, 0) scale(${stackScale}) rotate(${tiltDeg}deg)`;

                  return (
                    <div
                      key={card.id}
                      onPointerDown={isTop ? handlePointerDown : undefined}
                      onPointerMove={isTop ? handlePointerMove : undefined}
                      onPointerUp={isTop ? handlePointerUp : undefined}
                      onPointerCancel={isTop ? handlePointerUp : undefined}
                      style={{
                        transform: cardTransform,
                        transition:
                          isTop && isDragging
                            ? 'none'
                            : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
                        opacity: isTop && exitingAction ? 0 : 1,
                        zIndex: 20 - stackIndex,
                        touchAction: 'none',
                      }}
                      className={`absolute inset-0 ${isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                    >
                      <BeatmapGachaCard
                        beatmapset={card}
                        faceDown={isTop ? showBackPeek : true}
                        target={target}
                        activeTask={activeTaskBySet.get(card.id)}
                        isPlaying={isPlaying && playingSetId === card.id}
                        className="h-full w-full"
                        onFlip={() => {
                          if (isTop) setShowBackPeek(false);
                        }}
                        onTogglePlay={onTogglePlaySet}
                        onDownload={onDownload}
                        onOpenDetail={(s, diffId) => onOpenDetail(s, diffId)}
                      />

                      {isTop && likeOpacity > 0.04 && (
                        <div
                          style={{ opacity: likeOpacity }}
                          className="ga-mono pointer-events-none absolute top-6 left-5 z-30 -rotate-12 rounded-[2px] border-2 border-emerald-300 bg-emerald-600/90 px-3.5 py-1 text-[1.0625rem] font-black tracking-[0.18em] text-white shadow-xl"
                        >
                          LIKE ♥
                        </div>
                      )}
                      {isTop && passOpacity > 0.04 && (
                        <div
                          style={{ opacity: passOpacity }}
                          className="ga-mono pointer-events-none absolute top-6 right-5 z-30 rotate-12 rounded-[2px] border-2 border-rose-300 bg-rose-600/90 px-3.5 py-1 text-[1.0625rem] font-black tracking-[0.18em] text-white shadow-xl"
                        >
                          PASS ✕
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Bottom Architectural Tactile Swipe Dock */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <button
            type="button"
            disabled={history.length === 0 || Boolean(exitingAction)}
            data-ga-cursor="UNDO [Z]"
            onClick={handleUndo}
            title={t('撤回上一张 (Z)', 'Undo last swipe (Z)')}
            className="ga-line-btn h-10 px-3"
          >
            <RotateCcw className="h-4 w-4" />
            <kbd className="ga-mono text-[0.625rem] opacity-70">Z</kbd>
          </button>

          <button
            type="button"
            disabled={!topCard || Boolean(exitingAction)}
            data-ga-cursor="PASS [←]"
            onClick={() => commitSwipe('pass')}
            title={t('跳过 / 不感兴趣 (←)', 'Pass (←)')}
            className="inline-flex h-11 items-center gap-2 rounded-[2px] border border-rose-500/45 bg-rose-500/12 px-5 font-bold text-rose-500 transition-all hover:bg-rose-500 hover:text-white disabled:opacity-35"
          >
            <X className="h-4 w-4" />
            <span className="text-[0.84375rem]">{t('跳过', 'Pass')}</span>
            <kbd className="ga-mono text-[0.625rem] opacity-70">←</kbd>
          </button>

          {topCard && (
            <button
              type="button"
              data-ga-cursor="AUDIO [SPACE]"
              onClick={() => onTogglePlaySet(topCard)}
              title={t('播放 / 暂停试听 (Space)', 'Play / Pause preview (Space)')}
              className="ga-line-btn h-11 w-11 rounded-full"
            >
              {isPlaying && playingSetId === topCard.id ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-[0.5px] fill-current" />
              )}
            </button>
          )}

          <button
            type="button"
            disabled={!topCard || Boolean(exitingAction)}
            data-ga-cursor="LIKE [→]"
            onClick={() => commitSwipe('like')}
            title={t('心动收藏 / 右滑 (→)', 'Like / Match (→)')}
            className="inline-flex h-11 items-center gap-2 rounded-[2px] border border-emerald-500 bg-emerald-500 px-6 font-bold text-white shadow-md transition-all hover:brightness-110 disabled:opacity-35"
          >
            <Heart className="h-4 w-4 fill-current" />
            <span className="text-[0.84375rem]">{t('心动', 'Like')}</span>
            <kbd className="ga-mono text-[0.625rem] opacity-80">→</kbd>
          </button>
        </div>
      </div>

      {/* Right Rail: Archival Liked Folio */}
      <aside className="flex h-[215px] shrink-0 flex-col rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] backdrop-blur-md lg:h-full lg:w-[356px]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--ga-line)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 fill-current text-[var(--ga-crimson)]" />
            <div>
              <div className="ga-mono text-[0.625rem] tracking-[0.16em] text-[var(--ga-ink-3)] uppercase">
                LIKED ARCHIVE // {String(liked.length).padStart(2, '0')}
              </div>
              <span className="ga-cn-serif text-[0.875rem] font-bold text-[var(--ga-ink)]">
                {t(`心动曲库 (${liked.length})`, `Liked Deck (${liked.length})`)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {liked.length > 0 && (
              <>
                <button
                  type="button"
                  data-ga-cursor={t('全部下载', 'DL ALL')}
                  onClick={() => {
                    onBatchDownload(liked);
                    onNotify(
                      t(
                        `已将 ${liked.length} 首心动谱面加入下载队列`,
                        `Queued ${liked.length} liked maps for download`,
                      ),
                    );
                  }}
                  className="ga-solid-btn h-7 px-2.5 text-[0.71875rem]"
                >
                  <Download className="h-3 w-3" />
                  <span>{t('全部下载', 'Download All')}</span>
                </button>
                <button
                  type="button"
                  data-ga-cursor={t('清空', 'CLEAR')}
                  onClick={() => setLiked([])}
                  title={t('清空心动列表', 'Clear liked list')}
                  className="ga-line-btn h-7 px-1.5 text-[var(--ga-ink-3)] hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[var(--ga-line)]">
          {liked.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-5 text-center text-[0.78125rem] text-[var(--ga-ink-2)]">
              <p>{t('向右滑动卡片或点击「心动」收集喜欢的谱面', 'Swipe right or press Like to collect beatmaps')}</p>
              <p className="ga-mono mt-1.5 text-[0.6875rem] text-[var(--ga-ink-3)]">
                {t('快捷键：← 跳过 · → 心动 · Space 试听 · Z 撤回', 'Keys: ← Pass · → Like · Space Audio · Z Undo')}
              </p>
            </div>
          ) : (
            liked.map((item) => {
              const stats = getCardSummaryStats(item);
              const srStyle = getStarColor(stats.repStars);
              const task = activeTaskBySet.get(item.id);
              const activeBusy = Boolean(
                task &&
                  (task.status === 'queued' ||
                    task.status === 'downloading' ||
                    task.status === 'installing'),
              );
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--ga-cobalt)_6%,transparent)]"
                >
                  <button
                    type="button"
                    data-ga-cursor="PREVIEW"
                    onClick={() => onTogglePlaySet(item)}
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[2px]"
                    title={t('播放试听', 'Preview audio')}
                  >
                    <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                      {isPlaying && playingSetId === item.id ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.8125rem] font-bold text-[var(--ga-ink)]">
                      {item.titleUnicode || item.title}
                    </div>
                    <div className="ga-mono flex items-center gap-1.5 text-[0.6875rem] text-[var(--ga-ink-3)]">
                      <span
                        className="rounded-[2px] px-1 py-px font-bold"
                        style={{ backgroundColor: srStyle.bg, color: srStyle.text }}
                      >
                        {stats.repStars.toFixed(2)}★
                      </span>
                      <span className="tabular-nums">{Math.round(item.bpm)} BPM</span>
                      <span className="font-semibold text-emerald-500 tabular-nums">{stats.ppLabel}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={activeBusy}
                      data-ga-cursor="GET"
                      onClick={() => onDownload(item, target)}
                      title={t('下载谱面', 'Download beatmap')}
                      className="ga-line-btn h-7 px-2 text-[0.71875rem]"
                    >
                      {activeBusy ? `${task?.progress ?? 0}%` : <Download className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      data-ga-cursor="DETAIL"
                      onClick={() => onOpenDetail(item)}
                      title={t('详情', 'Details')}
                      className="ga-line-btn h-7 px-1.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiked((prev) => prev.filter((x) => x.id !== item.id))}
                      title={t('移除', 'Remove')}
                      className="p-1 text-[var(--ga-ink-3)] hover:text-rose-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
