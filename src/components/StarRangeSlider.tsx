import { useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getStarColor, getStarSpectrum } from '../constants';

interface StarRangeSliderProps {
  minStars?: number;
  maxStars?: number;
  onChange: (minStars: number | undefined, maxStars: number | undefined, commit: boolean) => void;
}

const STAR_FINITE_MAX = 15;
const STAR_TRACK_SPAN = 15.4;
const STAR_INF_CUTOFF = 15.2;
const THUMB_WIDTH = 24;

const SPECTRUM_GRADIENT = (() => {
  const stops: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const star = (i / 32) * STAR_TRACK_SPAN;
    const pct = (i / 32) * 100;
    stops.push(`${getStarSpectrum(star)} ${pct.toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
})();

function roundStar(v: number): number {
  return Math.round(v * 10) / 10;
}

export function StarRangeSlider({ minStars, maxStars, onChange }: StarRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<'min' | 'max' | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const grabOffsetRef = useRef(0);
  const hitThumbRef = useRef(false);
  const movedRef = useRef(false);
  const initialBoundsRef = useRef<{ min?: number; max?: number }>({ min: minStars, max: maxStars });
  const latestBoundsRef = useRef<{ min?: number; max?: number }>({ min: minStars, max: maxStars });
  latestBoundsRef.current = { min: minStars, max: maxStars };

  const [draggingThumb, setDraggingThumb] = useState<'min' | 'max' | null>(null);
  const [editingBound, setEditingBound] = useState<'min' | 'max' | null>(null);
  const [draftVal, setDraftVal] = useState('');

  const effMin = minStars != null && Number.isFinite(minStars) ? Math.max(0, minStars) : 0;
  const effMax =
    maxStars != null && Number.isFinite(maxStars) ? Math.max(effMin, maxStars) : STAR_FINITE_MAX;

  const minTrack = Math.min(STAR_FINITE_MAX, effMin);
  const maxTrack =
    maxStars == null ? STAR_TRACK_SPAN : Math.min(STAR_FINITE_MAX, Math.max(minTrack, maxStars));

  const minPct = (minTrack / STAR_TRACK_SPAN) * 100;
  const maxPct = (maxTrack / STAR_TRACK_SPAN) * 100;
  const hasFilter = minStars != null || maxStars != null;

  const spanValueFromClientX = (clientX: number): number => {
    const rect = dragRectRef.current ?? trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const usable = Math.max(1, rect.width - THUMB_WIDTH);
    const localX = clientX - rect.left;
    const adjustedCenterX = localX - grabOffsetRef.current;
    const ratio = Math.min(1, Math.max(0, (adjustedCenterX - THUMB_WIDTH / 2) / usable));
    return ratio * STAR_TRACK_SPAN;
  };

  const computeThumbBounds = (
    thumb: 'min' | 'max',
    rawSpanVal: number,
    curMin: number | undefined,
    curMax: number | undefined,
  ): { min?: number; max?: number } => {
    if (thumb === 'min') {
      const lowerCap =
        curMax != null && Number.isFinite(curMax) ? Math.min(STAR_FINITE_MAX, Math.max(0, curMax)) : STAR_FINITE_MAX;
      const clamped = Math.min(Math.max(0, rawSpanVal), lowerCap);
      const nextMin = clamped < 0.05 ? undefined : roundStar(clamped);
      return { min: nextMin, max: curMax };
    }
    if (rawSpanVal >= STAR_INF_CUTOFF) {
      return { min: curMin, max: undefined };
    }
    const lowerCap =
      curMin != null && Number.isFinite(curMin) ? Math.min(STAR_FINITE_MAX, Math.max(0, curMin)) : 0;
    const clamped = Math.min(STAR_FINITE_MAX, Math.max(lowerCap, rawSpanVal));
    return { min: curMin, max: roundStar(clamped) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    dragRectRef.current = rect;
    initialBoundsRef.current = { min: minStars, max: maxStars };
    latestBoundsRef.current = { min: minStars, max: maxStars };
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
      const next = computeThumbBounds(thumb, spanValueFromClientX(e.clientX), minStars, maxStars);
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
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 0.1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -0.1;
    else if (e.key === 'PageUp') delta = 0.5;
    else if (e.key === 'PageDown') delta = -0.5;
    else if (e.key === 'Home') {
      e.preventDefault();
      const raw = thumb === 'min' ? 0 : minTrack;
      const next = computeThumbBounds(thumb, raw, minStars, maxStars);
      onChange(next.min, next.max, true);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      const raw =
        thumb === 'min'
          ? maxStars != null
            ? Math.min(STAR_FINITE_MAX, maxStars)
            : STAR_FINITE_MAX
          : STAR_TRACK_SPAN;
      const next = computeThumbBounds(thumb, raw, minStars, maxStars);
      onChange(next.min, next.max, true);
      return;
    } else {
      return;
    }

    e.preventDefault();
    if (thumb === 'min') {
      const cap =
        maxStars != null ? Math.min(STAR_FINITE_MAX, Math.max(0, maxStars)) : STAR_FINITE_MAX;
      const raw = Math.max(0, Math.min(cap, roundStar(minTrack + delta)));
      const next = computeThumbBounds('min', raw, minStars, maxStars);
      onChange(next.min, next.max, true);
      return;
    }

    if (maxStars == null) {
      if (delta > 0) return;
      const target = e.key === 'PageDown' ? STAR_FINITE_MAX - 0.5 : STAR_FINITE_MAX;
      const next = computeThumbBounds('max', Math.max(minTrack, target), minStars, maxStars);
      onChange(next.min, next.max, true);
      return;
    }

    const curFinite = Math.min(STAR_FINITE_MAX, Math.max(minTrack, maxStars));
    if (curFinite >= STAR_FINITE_MAX - 0.001 && delta > 0) {
      const next = computeThumbBounds('max', STAR_TRACK_SPAN, minStars, maxStars);
      onChange(next.min, next.max, true);
      return;
    }

    const nextFinite = Math.max(minTrack, Math.min(STAR_FINITE_MAX, roundStar(curFinite + delta)));
    const next = computeThumbBounds('max', nextFinite, minStars, maxStars);
    onChange(next.min, next.max, true);
  };

  const beginEdit = (bound: 'min' | 'max') => {
    setEditingBound(bound);
    if (bound === 'min') {
      setDraftVal(minStars != null ? String(minStars) : '');
    } else {
      setDraftVal(maxStars != null ? String(maxStars) : '');
    }
  };

  const commitEdit = (bound: 'min' | 'max') => {
    setEditingBound(null);
    const trimmed = draftVal.trim();
    if (trimmed === '') {
      if (bound === 'min') {
        onChange(undefined, maxStars, true);
      } else {
        onChange(minStars, undefined, true);
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const clean = Math.max(0, Math.min(STAR_FINITE_MAX, Math.round(parsed * 100) / 100));
    if (bound === 'min') {
      const nextMin = clean <= 0 ? undefined : clean;
      const nextMax = maxStars != null && nextMin != null && nextMin > maxStars ? nextMin : maxStars;
      onChange(nextMin, nextMax, true);
    } else {
      const nextMax = clean;
      const nextMin = minStars != null && nextMax < minStars ? nextMax : minStars;
      onChange(nextMin, nextMax, true);
    }
  };

  const minColor = useMemo(() => getStarColor(effMin), [effMin]);
  const maxColor = useMemo(
    () => getStarColor(maxStars != null ? maxStars : STAR_FINITE_MAX),
    [maxStars],
  );

  const minThumbLeft = `calc(${minPct.toFixed(4)}% - ${((minPct / 100) * THUMB_WIDTH).toFixed(2)}px)`;
  const maxThumbLeft = `calc(${maxPct.toFixed(4)}% - ${((maxPct / 100) * THUMB_WIDTH).toFixed(2)}px)`;
  const clipLeft = `calc(${minPct.toFixed(2)}% - ${((minPct / 100) * THUMB_WIDTH).toFixed(2)}px)`;
  const clipRight = `calc(${(100 - maxPct).toFixed(2)}% - ${(((100 - maxPct) / 100) * THUMB_WIDTH).toFixed(2)}px)`;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-hairline bg-surface-1/65 px-2.5 py-1">
      <span className="field-label shrink-0">星数</span>

      {/* Lower Bound Badge / Click-to-edit (fixed width prevents flex-1 track shift) */}
      {editingBound === 'min' ? (
        <input
          type="number"
          step={0.1}
          min={0}
          max={STAR_FINITE_MAX}
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
          aria-label="编辑星数下界"
          className="field font-mono min-h-[24px] w-[3.65rem] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('min')}
          title="点击输入精确星数下界"
          style={
            minStars != null
              ? {
                  backgroundColor: minColor.bg,
                  color: minColor.text,
                  borderColor: minColor.border,
                }
              : undefined
          }
          className={`font-stat inline-flex min-h-[24px] w-[3.65rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 text-[0.75rem] font-bold tabular-nums transition-colors ${
            minStars != null
              ? ''
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {effMin.toFixed(1)}★
        </button>
      )}

      {/* Lazer-Style Spectrum Track + Wide Flat Rounded Thumbs */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative flex h-7 min-w-[110px] flex-1 cursor-pointer touch-none items-center select-none"
      >
        {/* Dimmed Full Spectrum Track */}
        <div
          className="h-[12px] w-full rounded-[6px] opacity-30 ring-1 ring-inset ring-hairline"
          style={{ background: SPECTRUM_GRADIENT }}
        />

        {/* Vivid Active Window Clipped Between Outer Thumb Edges */}
        <div
          className="pointer-events-none absolute right-0 left-0 h-[12px] rounded-[6px] opacity-90"
          style={{
            background: SPECTRUM_GRADIENT,
            clipPath: `inset(0 ${clipRight} 0 ${clipLeft} round 6px)`,
          }}
        />

        {/* Lower Bound Thumb (24x14 flat rounded rectangle) */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="星数下界"
          aria-valuemin={0}
          aria-valuemax={Math.min(STAR_FINITE_MAX, maxTrack)}
          aria-valuenow={minTrack}
          aria-valuetext={`${minTrack.toFixed(1)} 星`}
          onKeyDown={(e) => handleKeyDown('min', e)}
          style={{ left: minThumbLeft }}
          className={`absolute top-1/2 h-[14px] w-[24px] -translate-y-1/2 rounded-[4px] bg-osu transition-transform duration-100 ${
            draggingThumb === 'min' ? 'z-20 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />

        {/* Upper Bound Thumb (24x14 flat rounded rectangle) */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="星数上界"
          aria-valuemin={minTrack}
          aria-valuemax={STAR_TRACK_SPAN}
          aria-valuenow={maxTrack}
          aria-valuetext={maxStars == null ? '不限上限' : `${effMax.toFixed(1)} 星`}
          onKeyDown={(e) => handleKeyDown('max', e)}
          style={{ left: maxThumbLeft }}
          className={`absolute top-1/2 h-[14px] w-[24px] -translate-y-1/2 rounded-[4px] bg-osu transition-transform duration-100 ${
            draggingThumb === 'max' ? 'z-20 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />
      </div>

      {/* Upper Bound Badge / Click-to-edit */}
      {editingBound === 'max' ? (
        <input
          type="number"
          step={0.1}
          min={0}
          max={STAR_FINITE_MAX}
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
          aria-label="编辑星数上界"
          className="field font-mono min-h-[24px] w-[3.65rem] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('max')}
          title="点击输入精确星数上界（上限 15.0★，清空表示不限 ∞）"
          style={
            maxStars != null
              ? {
                  backgroundColor: maxColor.bg,
                  color: maxColor.text,
                  borderColor: maxColor.border,
                }
              : undefined
          }
          className={`font-stat inline-flex min-h-[24px] w-[3.65rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-1.5 text-[0.75rem] font-bold tabular-nums transition-colors ${
            maxStars != null
              ? ''
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {maxStars != null ? `${maxStars.toFixed(1)}★` : '∞'}
        </button>
      )}

      {/* Permanent slot keeps track width completely invariant during drag */}
      <button
        type="button"
        disabled={!hasFilter}
        tabIndex={hasFilter ? 0 : -1}
        onClick={() => onChange(undefined, undefined, true)}
        title="清除星数区间"
        aria-label="清除星数区间"
        className={`btn btn-sm btn-icon h-[24px] w-[24px] shrink-0 transition-opacity ${
          hasFilter ? 'text-ink-3 opacity-100 hover:text-osu' : 'pointer-events-none invisible opacity-0'
        }`}
      >
        <RotateCcw className="h-3 w-3" />
      </button>
    </div>
  );
}
