import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Star,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import type { DownloadTarget, DownloadTask, NormalizedBeatmapset } from '../../types';
import { BeatmapGachaCard } from './BeatmapGachaCard';
import { PaimonStarfieldBack } from './PaimonStarfieldBack';
import { getCardSummaryStats, getStarRarityMeta } from './gachaUtils';

interface GachaCardInspectorModalProps {
  cards: NormalizedBeatmapset[];
  initialIndex: number;
  target: DownloadTarget;
  activeTaskBySet: Map<number, DownloadTask>;
  playingSetId: number | null;
  isPlaying: boolean;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail?: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onClose: () => void;
}

export function GachaCardInspectorModal({
  cards,
  initialIndex,
  target,
  activeTaskBySet,
  playingSetId,
  isPlaying,
  onTogglePlay,
  onDownload,
  onOpenDetail,
  onClose,
}: GachaCardInspectorModalProps) {
  const { lang, t } = useI18n();
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, cards.length - 1)),
  );
  const [hudState, setHudState] = useState({ yaw: 0, pitch: 0, zoom: 1 });

  const card = cards[index] ?? cards[0];
  const slabRef = useRef<HTMLDivElement | null>(null);
  const sheenRef = useRef<HTMLDivElement | null>(null);

  const poseRef = useRef({
    yaw: 0,
    pitch: 0,
    zoom: 1,
    vx: 0,
    vy: 0,
    targetYaw: null as number | null,
    targetPitch: null as number | null,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const applyTransform = useCallback(() => {
    const p = poseRef.current;
    if (slabRef.current) {
      slabRef.current.style.transform = `scale(${p.zoom.toFixed(3)}) rotateX(${p.pitch.toFixed(2)}deg) rotateY(${p.yaw.toFixed(2)}deg)`;
    }
    if (sheenRef.current) {
      const normYaw = (((p.yaw % 360) + 540) % 360) - 180;
      const sx = 50 + normYaw * 0.45;
      const sy = 50 - p.pitch * 0.55;
      const intensity = Math.min(0.42, (Math.abs(normYaw) + Math.abs(p.pitch)) * 0.004);
      sheenRef.current.style.background = `radial-gradient(circle at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, rgba(255,255,255,${intensity.toFixed(3)}), rgba(255,255,255,0.03) 42%, transparent 72%)`;
    }
  }, []);

  const resetPose = useCallback(() => {
    poseRef.current.targetYaw = 0;
    poseRef.current.targetPitch = 0;
    poseRef.current.zoom = 1;
    poseRef.current.vx = 0;
    poseRef.current.vy = 0;
    setHudState({ yaw: 0, pitch: 0, zoom: 1 });
  }, []);

  const flipSlab = useCallback(() => {
    const p = poseRef.current;
    p.vx = 0;
    p.vy = 0;
    p.targetPitch = 0;
    const base = p.targetYaw !== null ? p.targetYaw : p.yaw;
    const mod = ((base % 360) + 360) % 360;
    const showingBack = mod > 90 && mod < 270;
    const nearestTurn = Math.round(base / 360) * 360;
    p.targetYaw = showingBack ? nearestTurn : nearestTurn + 180;
  }, []);

  // Switch active card resets pose cleanly
  useEffect(() => {
    poseRef.current.yaw = 0;
    poseRef.current.pitch = 0;
    poseRef.current.zoom = 1;
    poseRef.current.vx = 0;
    poseRef.current.vy = 0;
    poseRef.current.targetYaw = null;
    poseRef.current.targetPitch = null;
    applyTransform();
    setHudState({ yaw: 0, pitch: 0, zoom: 1 });
  }, [index, applyTransform]);

  // 60fps inertial 360-degree physics loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudClock = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const p = poseRef.current;

      if (!p.dragging) {
        if (p.targetYaw !== null) {
          const k = 1 - Math.exp(-dt * 9.5);
          p.yaw += (p.targetYaw - p.yaw) * k;
          if (Math.abs(p.targetYaw - p.yaw) < 0.15) {
            p.yaw = p.targetYaw;
            p.targetYaw = null;
          }
        } else if (Math.abs(p.vx) > 0.02) {
          p.yaw += p.vx;
          p.vx *= Math.exp(-dt * 4.2);
        }

        if (p.targetPitch !== null) {
          const k = 1 - Math.exp(-dt * 9.5);
          p.pitch += (p.targetPitch - p.pitch) * k;
          if (Math.abs(p.targetPitch - p.pitch) < 0.15) {
            p.pitch = p.targetPitch;
            p.targetPitch = null;
          }
        } else if (Math.abs(p.vy) > 0.02) {
          p.pitch = Math.max(-82, Math.min(82, p.pitch + p.vy));
          p.vy *= Math.exp(-dt * 4.8);
        }
      }

      applyTransform();
      hudClock += dt;
      if (hudClock >= 0.06) {
        hudClock = 0;
        const nextYaw = Math.round(((p.yaw % 360) + 360) % 360);
        const nextPitch = Math.round(p.pitch);
        const nextZoom = Number(p.zoom.toFixed(2));
        setHudState((prev) =>
          prev.yaw === nextYaw && prev.pitch === nextPitch && prev.zoom === nextZoom
            ? prev
            : { yaw: nextYaw, pitch: nextPitch, zoom: nextZoom },
        );
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyTransform]);

  // Keyboard bindings inside inspector
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && cards.length > 1) {
        e.preventDefault();
        setIndex((i) => (i - 1 + cards.length) % cards.length);
      } else if (e.key === 'ArrowRight' && cards.length > 1) {
        e.preventDefault();
        setIndex((i) => (i + 1) % cards.length);
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        resetPose();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        flipSlab();
      } else if (e.code === 'Space' && card) {
        e.preventDefault();
        onTogglePlay(card);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cards.length, card, onClose, resetPose, flipSlab, onTogglePlay]);

  if (!card) return null;

  const summary = getCardSummaryStats(card);
  const rarity = getStarRarityMeta(summary.repStars, lang);

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('360° 3D 谱面卡检视', '360° 3D Card Inspector')}
      data-dark="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={(e) => {
        e.stopPropagation();
        const delta = -Math.sign(e.deltaY) * 0.08;
        poseRef.current.zoom = Math.min(1.42, Math.max(0.74, poseRef.current.zoom + delta));
      }}
      style={{ backgroundColor: 'rgba(7, 10, 18, 0.90)', color: '#ffffff' }}
      className="gacha-atelier fixed inset-0 z-[48] flex flex-col justify-between backdrop-blur-md select-none"
    >
      {/* Minimal Translucent Top Telemetry HUD */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/12 px-4 py-2.5 text-white">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[0.75rem] font-bold tracking-[0.18em] text-white/90">
            360° INSPECTOR // #{String(index + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 font-mono text-[0.65625rem] font-extrabold tracking-wider uppercase"
            style={{ background: rarity.badgeBg, color: rarity.badgeText }}
          >
            <Star className="h-2.5 w-2.5 fill-current" />
            <span>{rarity.label}</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[0.6875rem] tracking-[0.14em] text-white/65 tabular-nums sm:inline">
            YAW {String(hudState.yaw).padStart(3, '0')}° · PITCH {hudState.pitch >= 0 ? '+' : ''}
            {hudState.pitch}° · {hudState.zoom.toFixed(2)}×
          </span>
          <button
            type="button"
            onClick={onClose}
            title={t('关闭检视 (Esc)', 'Close inspector (Esc)')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/20 bg-white/8 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Center Interactive 360-Degree Collector Slab Stage */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const p = poseRef.current;
          p.dragging = true;
          p.targetYaw = null;
          p.targetPitch = null;
          p.vx = 0;
          p.vy = 0;
          p.lastX = e.clientX;
          p.lastY = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = poseRef.current;
          if (!p.dragging) return;
          const dx = e.clientX - p.lastX;
          const dy = e.clientY - p.lastY;
          p.lastX = e.clientX;
          p.lastY = e.clientY;
          const stepYaw = dx * 0.52;
          const stepPitch = -dy * 0.38;
          p.yaw += stepYaw;
          p.pitch = Math.max(-82, Math.min(82, p.pitch + stepPitch));
          p.vx = stepYaw * 0.68;
          p.vy = stepPitch * 0.58;
          applyTransform();
        }}
        onPointerUp={() => {
          poseRef.current.dragging = false;
        }}
        onPointerCancel={() => {
          poseRef.current.dragging = false;
        }}
        onDoubleClick={resetPose}
        className="ga-inspector-perspective relative z-10 flex min-h-0 flex-1 cursor-grab items-center justify-center overflow-hidden p-4 active:cursor-grabbing"
      >
        {/* Subtle Rarity Ambient Halo behind 3D Slab */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute h-[460px] w-[460px] rounded-full opacity-28 blur-3xl"
          style={{
            background: `radial-gradient(circle, ${rarity.glow}, ${rarity.glowSecondary} 50%, transparent 72%)`,
          }}
        />

        {/* 3D Solid Card Slab (front + back + 10px physical bevel edges) */}
        <div
          ref={slabRef}
          className="ga-inspector-slab h-[min(calc(100%-16px),530px)] w-[min(86vw,365px)]"
        >
          {/* Physical Left Edge */}
          <div
            aria-hidden="true"
            className="ga-slab-edge top-0 bottom-0 left-0 w-[10px]"
            style={{
              transform: 'translateX(-5px) rotateY(-90deg)',
              background: `linear-gradient(180deg, ${rarity.glow}, ${rarity.glowSecondary})`,
            }}
          />
          {/* Physical Right Edge */}
          <div
            aria-hidden="true"
            className="ga-slab-edge top-0 right-0 bottom-0 w-[10px]"
            style={{
              transform: 'translateX(5px) rotateY(90deg)',
              background: `linear-gradient(180deg, ${rarity.glowSecondary}, ${rarity.glow})`,
            }}
          />
          {/* Physical Top Edge */}
          <div
            aria-hidden="true"
            className="ga-slab-edge top-0 right-0 left-0 h-[10px]"
            style={{
              transform: 'translateY(-5px) rotateX(90deg)',
              background: rarity.glow,
            }}
          />
          {/* Physical Bottom Edge */}
          <div
            aria-hidden="true"
            className="ga-slab-edge right-0 bottom-0 left-0 h-[10px]"
            style={{
              transform: 'translateY(5px) rotateX(-90deg)',
              background: rarity.glowSecondary,
            }}
          />

          {/* Front Collector Plate (+5px Z) */}
          <div className="ga-slab-face" style={{ transform: 'translateZ(5px)' }}>
            <BeatmapGachaCard
              beatmapset={card}
              faceDown={false}
              target={target}
              activeTask={activeTaskBySet.get(card.id)}
              isPlaying={isPlaying && playingSetId === card.id}
              className="h-full w-full"
              onTogglePlay={onTogglePlay}
              onDownload={onDownload}
              onOpenDetail={onOpenDetail}
            />
            <div
              ref={sheenRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 rounded-[3px] mix-blend-screen"
            />
          </div>

          {/* Back Celestial Cloak (+5px Z along rotated back) */}
          <div
            className="ga-slab-face overflow-hidden rounded-[3px]"
            style={{ transform: 'rotateY(180deg) translateZ(5px)' }}
          >
            <PaimonStarfieldBack seed={card.id} className="h-full w-full" />
          </div>
        </div>
      </div>

      {/* Bottom Interactive Inspection Controls */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/12 px-4 py-2.5 text-white">
        <span className="font-mono text-[0.6875rem] text-white/60">
          {t('鼠标拖拽 360° 旋转 · 滚轮缩放 · 双击复位', 'Drag for 360° 3D rotation · Scroll to zoom · Double-click to reset')}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {cards.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => (i - 1 + cards.length) % cards.length)}
                className="inline-flex h-8 items-center gap-1 rounded-[2px] border border-white/20 bg-white/8 px-2.5 text-[0.75rem] font-semibold hover:bg-white/18"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{t('上一张', 'Prev')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => (i + 1) % cards.length)}
                className="inline-flex h-8 items-center gap-1 rounded-[2px] border border-white/20 bg-white/8 px-2.5 text-[0.75rem] font-semibold hover:bg-white/18"
              >
                <span>{t('下一张', 'Next')}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={flipSlab}
            className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-white/20 bg-white/8 px-3 text-[0.75rem] font-semibold hover:bg-white/18"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{t('正反翻转 (F)', 'Flip 180° (F)')}</span>
          </button>

          <button
            type="button"
            onClick={resetPose}
            className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-white/20 bg-white/8 px-3 text-[0.75rem] font-semibold hover:bg-white/18"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('复位视角 (R)', 'Reset (R)')}</span>
          </button>

          <button
            type="button"
            onClick={() => onTogglePlay(card)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-white/20 bg-white/8 px-3 text-[0.75rem] font-semibold hover:bg-white/18"
          >
            {isPlaying && playingSetId === card.id ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{isPlaying && playingSetId === card.id ? t('暂停', 'Pause') : t('试听', 'Preview')}</span>
          </button>

          <button
            type="button"
            onClick={() => onDownload(card, target)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[2px] bg-[var(--t-osu)] px-3 text-[0.75rem] font-bold text-white hover:brightness-110"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('下载谱面', 'Download')}</span>
          </button>

          {onOpenDetail && (
            <button
              type="button"
              onClick={() => {
                onOpenDetail(card, summary.featuredDiff?.id ?? null);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-[2px] border border-white/20 bg-white/8 px-3 text-[0.75rem] font-semibold hover:bg-white/18"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>{t('详情', 'Details')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
