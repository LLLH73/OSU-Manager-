import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface PpRangeSliderProps {
  minPp?: number;
  maxPp?: number;
  onChange: (minPp: number | undefined, maxPp: number | undefined, commit: boolean) => void;
  trailing?: ReactNode;
}

const PP_FINITE_MAX = 2000;
const PP_STEP = 10;
const PP_TRACK_SPAN = 2050;
const PP_INF_CUTOFF = 2025;
const THUMB_WIDTH = 24;

function roundPp(v: number): number {
  return Math.round(v / PP_STEP) * PP_STEP;
}

export function PpRangeSlider({ minPp, maxPp, onChange, trailing }: PpRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<'min' | 'max' | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const grabOffsetRef = useRef(0);
  const hitThumbRef = useRef(false);
  const movedRef = useRef(false);
  const initialBoundsRef = useRef<{ min?: number; max?: number }>({ min: minPp, max: maxPp });
  const latestBoundsRef = useRef<{ min?: number; max?: number }>({ min: minPp, max: maxPp });
  latestBoundsRef.current = { min: minPp, max: maxPp };

  const [draggingThumb, setDraggingThumb] = useState<'min' | 'max' | null>(null);
  const [editingBound, setEditingBound] = useState<'min' | 'max' | null>(null);
  const [draftVal, setDraftVal] = useState('');

  const effMin = minPp != null && Number.isFinite(minPp) ? Math.max(0, Math.round(minPp)) : 0;
  const effMax =
    maxPp != null && Number.isFinite(maxPp) ? Math.max(effMin, Math.round(maxPp)) : PP_FINITE_MAX;

  const minTrack = Math.min(PP_FINITE_MAX, effMin);
  const maxTrack =
    maxPp == null ? PP_TRACK_SPAN : Math.min(PP_FINITE_MAX, Math.max(minTrack, Math.round(maxPp)));

  const minPct = (minTrack / PP_TRACK_SPAN) * 100;
  const maxPct = (maxTrack / PP_TRACK_SPAN) * 100;
  const hasFilter = minPp != null || maxPp != null;

  const spanValueFromClientX = (clientX: number): number => {
    const rect = dragRectRef.current ?? trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const usable = Math.max(1, rect.width - THUMB_WIDTH);
    const localX = clientX - rect.left;
    const adjustedCenterX = localX - grabOffsetRef.current;
    const ratio = Math.min(1, Math.max(0, (adjustedCenterX - THUMB_WIDTH / 2) / usable));
    return ratio * PP_TRACK_SPAN;
  };

  const computeThumbBounds = (
    thumb: 'min' | 'max',
    rawSpanVal: number,
    curMin: number | undefined,
    curMax: number | undefined,
  ): { min?: number; max?: number } => {
    if (thumb === 'min') {
      const lowerCap =
        curMax != null && Number.isFinite(curMax)
          ? Math.min(PP_FINITE_MAX, Math.max(0, Math.round(curMax)))
          : PP_FINITE_MAX;
      const clamped = Math.min(Math.max(0, rawSpanVal), lowerCap);
      const nextMin = clamped < 5 ? undefined : roundPp(clamped);
      return { min: nextMin, max: curMax };
    }
    if (rawSpanVal >= PP_INF_CUTOFF) {
      return { min: curMin, max: undefined };
    }
    const lowerCap =
      curMin != null && Number.isFinite(curMin)
        ? Math.min(PP_FINITE_MAX, Math.max(0, Math.round(curMin)))
        : 0;
    const clamped = Math.min(PP_FINITE_MAX, Math.max(lowerCap, rawSpanVal));
    return { min: curMin, max: roundPp(clamped) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    dragRectRef.current = rect;
    initialBoundsRef.current = { min: minPp, max: maxPp };
    latestBoundsRef.current = { min: minPp, max: maxPp };
    movedRef.current = false;

    const usable = Math.max(1, rect.width - THUMB_WIDTH);
    const localX = e.clientX - rect.left;
    const minCenter = THUMB_WIDTH / 2 + (minPct / 100) * usable;
    const maxCenter = THUMB_WIDTH / 2 + (maxPct / 100) * usable;
    const hitRadius = THUMB_WIDTH / 2 + 2;
    const hitMin = Math.abs(localX - minCenter) <= hitRadius;
    const hitMax = Math.abs(localX - maxCenter) <= hitRadius;

    let thumb: 'min' | 'max';
    let hitThumb = false;
    if (hitMin && hitMax) {
      hitThumb = true;
      thumb = localX >= (minCenter + maxCenter) / 2 ? 'max' : 'min';
    } else if (hitMin) {
      hitThumb = true;
      thumb = 'min';
    } else if (hitMax) {
      hitThumb = true;
      thumb = 'max';
    } else {
      thumb = Math.abs(localX - minCenter) <= Math.abs(localX - maxCenter) ? 'min' : 'max';
    }

    hitThumbRef.current = hitThumb;
    grabOffsetRef.current = hitThumb ? localX - (thumb === 'min' ? minCenter : maxCenter) : 0;
    activeThumbRef.current = thumb;
    setDraggingThumb(thumb);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (!hitThumb) {
      const next = computeThumbBounds(thumb, spanValueFromClientX(e.clientX), minPp, maxPp);
      if (next.min !== latestBoundsRef.current.min || next.max !== latestBoundsRef.current.max) {
        latestBoundsRef.current = next;
        onChange(next.min, next.max, false);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const thumb = activeThumbRef.current;
    if (!thumb) return;
    movedRef.current = true;
    const cur = latestBoundsRef.current;
    const next = computeThumbBounds(thumb, spanValueFromClientX(e.clientX), cur.min, cur.max);
    if (next.min !== cur.min || next.max !== cur.max) {
      latestBoundsRef.current = next;
      onChange(next.min, next.max, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const thumb = activeThumbRef.current;
    if (!thumb) return;

    const cur = latestBoundsRef.current;
    const next =
      hitThumbRef.current && !movedRef.current
        ? initialBoundsRef.current
        : computeThumbBounds(thumb, spanValueFromClientX(e.clientX), cur.min, cur.max);

    const wasHitThumb = hitThumbRef.current;
    const didMove = movedRef.current;
    const init = initialBoundsRef.current;

    activeThumbRef.current = null;
    dragRectRef.current = null;
    grabOffsetRef.current = 0;
    hitThumbRef.current = false;
    movedRef.current = false;
    setDraggingThumb(null);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const changedFromInitial = next.min !== init.min || next.max !== init.max;
    const changedFromLatest = next.min !== cur.min || next.max !== cur.max;
    if (!wasHitThumb || didMove || changedFromInitial || changedFromLatest) {
      latestBoundsRef.current = next;
      onChange(next.min, next.max, true);
    }
  };

  const handleKeyDown = (thumb: 'min' | 'max', e: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = PP_STEP;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -PP_STEP;
    else if (e.key === 'PageUp') delta = 50;
    else if (e.key === 'PageDown') delta = -50;
    else if (e.key === 'Home') {
      e.preventDefault();
      const raw = thumb === 'min' ? 0 : minTrack;
      const next = computeThumbBounds(thumb, raw, minPp, maxPp);
      onChange(next.min, next.max, true);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      const raw =
        thumb === 'min'
          ? maxPp != null
            ? Math.min(PP_FINITE_MAX, maxPp)
            : PP_FINITE_MAX
          : PP_TRACK_SPAN;
      const next = computeThumbBounds(thumb, raw, minPp, maxPp);
      onChange(next.min, next.max, true);
      return;
    } else {
      return;
    }

    e.preventDefault();
    if (thumb === 'min') {
      const cap =
        maxPp != null ? Math.min(PP_FINITE_MAX, Math.max(0, Math.round(maxPp))) : PP_FINITE_MAX;
      const raw = Math.max(0, Math.min(cap, roundPp(minTrack + delta)));
      const next = computeThumbBounds('min', raw, minPp, maxPp);
      onChange(next.min, next.max, true);
      return;
    }

    if (maxPp == null) {
      if (delta > 0) return;
      const target = e.key === 'PageDown' ? PP_FINITE_MAX - 50 : PP_FINITE_MAX;
      const next = computeThumbBounds('max', Math.max(minTrack, target), minPp, maxPp);
      onChange(next.min, next.max, true);
      return;
    }

    const curFinite = Math.min(PP_FINITE_MAX, Math.max(minTrack, Math.round(maxPp)));
    if (curFinite >= PP_FINITE_MAX && delta > 0) {
      const next = computeThumbBounds('max', PP_TRACK_SPAN, minPp, maxPp);
      onChange(next.min, next.max, true);
      return;
    }

    const nextFinite = Math.max(minTrack, Math.min(PP_FINITE_MAX, roundPp(curFinite + delta)));
    const next = computeThumbBounds('max', nextFinite, minPp, maxPp);
    onChange(next.min, next.max, true);
  };

  const beginEdit = (bound: 'min' | 'max') => {
    setEditingBound(bound);
    if (bound === 'min') {
      setDraftVal(minPp != null ? String(minPp) : '');
    } else {
      setDraftVal(maxPp != null ? String(maxPp) : '');
    }
  };

  const commitEdit = (bound: 'min' | 'max') => {
    setEditingBound(null);
    const trimmed = draftVal.trim();
    if (trimmed === '') {
      if (bound === 'min') {
        onChange(undefined, maxPp, true);
      } else {
        onChange(minPp, undefined, true);
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const clean = Math.max(0, Math.min(PP_FINITE_MAX, Math.round(parsed)));
    if (bound === 'min') {
      const nextMin = clean <= 0 ? undefined : clean;
      const nextMax = maxPp != null && nextMin != null && nextMin > maxPp ? nextMin : maxPp;
      onChange(nextMin, nextMax, true);
    } else {
      const nextMax = clean;
      const nextMin = minPp != null && nextMax < minPp ? nextMax : minPp;
      onChange(nextMin, nextMax, true);
    }
  };

  const minThumbLeft = `calc(${minPct.toFixed(4)}% - ${((minPct / 100) * THUMB_WIDTH).toFixed(2)}px)`;
  const maxThumbLeft = `calc(${maxPct.toFixed(4)}% - ${((maxPct / 100) * THUMB_WIDTH).toFixed(2)}px)`;
  const clipLeft = `calc(${minPct.toFixed(2)}% - ${((minPct / 100) * THUMB_WIDTH).toFixed(2)}px)`;
  const clipRight = `calc(${(100 - maxPct).toFixed(2)}% - ${(((100 - maxPct) / 100) * THUMB_WIDTH).toFixed(2)}px)`;

  return (
    <div className="flex h-full min-w-0 items-center gap-1.5 rounded-[10px] border border-hairline bg-surface-1/65 px-2.5 py-1">
      <span className="field-label shrink-0">PP</span>

      {/* Lower Bound Pill / Click-to-edit (fixed width prevents flex-1 track shift) */}
      {editingBound === 'min' ? (
        <input
          type="number"
          step={10}
          min={0}
          max={PP_FINITE_MAX}
          autoFocus
          value={draftVal}
          onChange={(e) => setDraftVal(e.target.value)}
          onBlur={() => commitEdit('min')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit('min');
            } else if (e.key === 'Escape') {
              setEditingBound(null);
            }
          }}
          aria-label="编辑 PP 下界"
          className="field font-mono min-h-[24px] w-[4.15rem] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('min')}
          title="点击输入精确 PP 下界"
          className={`font-stat inline-flex min-h-[24px] w-[4.15rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 text-[0.75rem] font-bold tabular-nums transition-colors ${
            minPp != null
              ? 'border-lazer/45 bg-lazer/14 text-lazer-soft'
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {effMin}pp
        </button>
      )}

      {/* Thick Dual-Thumb PP Track with 24x14 Flat Rounded Solid Thumbs */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative flex h-7 min-w-[96px] flex-1 cursor-pointer touch-none items-center select-none"
      >
        <div className="h-[12px] w-full rounded-[6px] bg-tint-hover" />

        <div
          className="pointer-events-none absolute right-0 left-0 h-[12px] rounded-[6px] bg-lazer/45"
          style={{
            clipPath: `inset(0 ${clipRight} 0 ${clipLeft} round 6px)`,
          }}
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="PP 下界"
          aria-valuemin={0}
          aria-valuemax={Math.min(PP_FINITE_MAX, maxTrack)}
          aria-valuenow={minTrack}
          aria-valuetext={`${minTrack} pp`}
          onKeyDown={(e) => handleKeyDown('min', e)}
          style={{ left: minThumbLeft }}
          className={`absolute top-1/2 h-[14px] w-[24px] -translate-y-1/2 rounded-[4px] bg-lazer transition-transform duration-100 ${
            draggingThumb === 'min' ? 'z-20 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="PP 上界"
          aria-valuemin={minTrack}
          aria-valuemax={PP_TRACK_SPAN}
          aria-valuenow={maxTrack}
          aria-valuetext={maxPp == null ? '不限上限' : `${effMax} pp`}
          onKeyDown={(e) => handleKeyDown('max', e)}
          style={{ left: maxThumbLeft }}
          className={`absolute top-1/2 h-[14px] w-[24px] -translate-y-1/2 rounded-[4px] bg-lazer transition-transform duration-100 ${
            draggingThumb === 'max' ? 'z-20 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />
      </div>

      {/* Upper Bound Pill / Click-to-edit */}
      {editingBound === 'max' ? (
        <input
          type="number"
          step={10}
          min={0}
          max={PP_FINITE_MAX}
          autoFocus
          value={draftVal}
          onChange={(e) => setDraftVal(e.target.value)}
          onBlur={() => commitEdit('max')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit('max');
            } else if (e.key === 'Escape') {
              setEditingBound(null);
            }
          }}
          aria-label="编辑 PP 上界"
          className="field font-mono min-h-[24px] w-[4.15rem] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('max')}
          title="点击输入精确 PP 上界（上限 2000pp，清空表示不限 ∞）"
          className={`font-stat inline-flex min-h-[24px] w-[4.15rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 text-[0.75rem] font-bold tabular-nums transition-colors ${
            maxPp != null
              ? 'border-lazer/45 bg-lazer/14 text-lazer-soft'
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {maxPp != null ? `${maxPp}pp` : '∞'}
        </button>
      )}

      {/* Permanent slot keeps track width completely invariant during drag */}
      <button
        type="button"
        disabled={!hasFilter}
        tabIndex={hasFilter ? 0 : -1}
        onClick={() => onChange(undefined, undefined, true)}
        title="清除 PP 范围"
        aria-label="清除 PP 范围"
        className={`btn btn-sm btn-icon h-[24px] w-[24px] shrink-0 transition-opacity ${
          hasFilter ? 'text-ink-3 opacity-100 hover:text-osu' : 'pointer-events-none invisible opacity-0'
        }`}
      >
        <RotateCcw className="h-3 w-3" />
      </button>

      {trailing}
    </div>
  );
}
