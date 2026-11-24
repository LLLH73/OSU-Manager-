import { useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getStarColor, getStarSpectrum } from '../constants';

interface StarRangeSliderProps {
  minStars?: number;
  maxStars?: number;
  onChange: (minStars: number | undefined, maxStars: number | undefined, commit: boolean) => void;
}

const STAR_TRACK_MAX = 10;

const SPECTRUM_GRADIENT = (() => {
  const stops: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const star = (i / 20) * STAR_TRACK_MAX;
    const pct = (i / 20) * 100;
    stops.push(`${getStarSpectrum(star)} ${pct.toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
})();

function roundStar(v: number): number {
  return Math.round(v * 10) / 10;
}

function clampTrackStar(v: number): number {
  return Math.min(STAR_TRACK_MAX, Math.max(0, roundStar(v)));
}

export function StarRangeSlider({ minStars, maxStars, onChange }: StarRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<'min' | 'max' | null>(null);

  const [draggingThumb, setDraggingThumb] = useState<'min' | 'max' | null>(null);
  const [editingBound, setEditingBound] = useState<'min' | 'max' | null>(null);
  const [draftVal, setDraftVal] = useState('');

  const effMin = minStars != null && Number.isFinite(minStars) ? Math.max(0, minStars) : 0;
  const effMax = maxStars != null && Number.isFinite(maxStars) ? Math.max(effMin, maxStars) : STAR_TRACK_MAX;

  const minTrack = Math.min(STAR_TRACK_MAX, effMin);
  const maxTrack = maxStars == null ? STAR_TRACK_MAX : Math.min(STAR_TRACK_MAX, Math.max(minTrack, maxStars));

  const minPct = (minTrack / STAR_TRACK_MAX) * 100;
  const maxPct = (maxTrack / STAR_TRACK_MAX) * 100;
  const hasFilter = minStars != null || maxStars != null;

  const valueFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clampTrackStar(ratio * STAR_TRACK_MAX);
  };

  const applyThumbValue = (thumb: 'min' | 'max', rawStar: number, commit: boolean) => {
    let nextMin = minStars;
    let nextMax = maxStars;

    if (thumb === 'min') {
      const clamped = Math.min(rawStar, maxTrack);
      nextMin = clamped <= 0.05 ? undefined : roundStar(clamped);
    } else {
      const clamped = Math.max(rawStar, minTrack);
      nextMax = clamped >= STAR_TRACK_MAX - 0.05 ? undefined : roundStar(clamped);
    }

    onChange(nextMin, nextMax, commit);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const val = valueFromClientX(e.clientX);
    const dMin = Math.abs(val - minTrack);
    const dMax = Math.abs(val - maxTrack);

    let thumb: 'min' | 'max';
    if (Math.abs(dMin - dMax) < 0.08) {
      thumb = val >= maxTrack ? 'max' : 'min';
    } else {
      thumb = dMin <= dMax ? 'min' : 'max';
    }

    activeThumbRef.current = thumb;
    setDraggingThumb(thumb);
    e.currentTarget.setPointerCapture(e.pointerId);
    applyThumbValue(thumb, val, false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const thumb = activeThumbRef.current;
    if (!thumb) return;
    const val = valueFromClientX(e.clientX);
    applyThumbValue(thumb, val, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const thumb = activeThumbRef.current;
    if (!thumb) return;
    const val = valueFromClientX(e.clientX);
    activeThumbRef.current = null;
    setDraggingThumb(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    applyThumbValue(thumb, val, true);
  };

  const handleKeyDown = (thumb: 'min' | 'max', e: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 0.1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -0.1;
    else if (e.key === 'PageUp') delta = 0.5;
    else if (e.key === 'PageDown') delta = -0.5;
    else if (e.key === 'Home') {
      e.preventDefault();
      applyThumbValue(thumb, thumb === 'min' ? 0 : minTrack, true);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      applyThumbValue(thumb, thumb === 'min' ? maxTrack : STAR_TRACK_MAX, true);
      return;
    } else {
      return;
    }

    e.preventDefault();
    const cur = thumb === 'min' ? minTrack : maxTrack;
    applyThumbValue(thumb, clampTrackStar(cur + delta), true);
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
    const clean = Math.max(0, Math.min(20, Math.round(parsed * 100) / 100));
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
    () => getStarColor(maxStars != null ? maxStars : 9.5),
    [maxStars],
  );

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-hairline bg-surface-1/65 px-2.5 py-1">
      <span className="field-label shrink-0">星数</span>

      {/* Lower Bound Badge / Click-to-edit */}
      {editingBound === 'min' ? (
        <input
          type="number"
          step={0.1}
          min={0}
          max={20}
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
          className="field font-mono min-h-[24px] w-[58px] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
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
          className={`font-stat inline-flex min-h-[24px] min-w-[54px] shrink-0 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold tabular-nums transition-colors ${
            minStars != null
              ? ''
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {effMin.toFixed(1)}★
        </button>
      )}

      {/* Lazer-Style Spectrum Track + Dual Thumbs */}
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
          className="h-[12px] w-full rounded-[6px] opacity-25"
          style={{ background: SPECTRUM_GRADIENT }}
        />

        {/* Vivid Active Window Clipped Without Shifting Stops */}
        <div
          className="pointer-events-none absolute right-0 left-0 h-[12px] rounded-[6px] opacity-90"
          style={{
            background: SPECTRUM_GRADIENT,
            clipPath: `inset(0 ${(100 - maxPct).toFixed(2)}% 0 ${minPct.toFixed(2)}% round 6px)`,
          }}
        />

        {/* Lower Bound Thumb */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="星数下界"
          aria-valuemin={0}
          aria-valuemax={maxTrack}
          aria-valuenow={minTrack}
          aria-valuetext={`${minTrack.toFixed(1)} 星`}
          onKeyDown={(e) => handleKeyDown('min', e)}
          style={{ left: `${minPct}%` }}
          className={`absolute top-1/2 h-[20px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-osu transition-transform duration-100 ${
            draggingThumb === 'min' ? 'z-20 scale-x-110 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />

        {/* Upper Bound Thumb */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="星数上界"
          aria-valuemin={minTrack}
          aria-valuemax={STAR_TRACK_MAX}
          aria-valuenow={maxTrack}
          aria-valuetext={maxStars == null ? '不限上限' : `${effMax.toFixed(1)} 星`}
          onKeyDown={(e) => handleKeyDown('max', e)}
          style={{ left: `${maxPct}%` }}
          className={`absolute top-1/2 h-[20px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-osu transition-transform duration-100 ${
            draggingThumb === 'max' ? 'z-20 scale-x-110 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />
      </div>

      {/* Upper Bound Badge / Click-to-edit */}
      {editingBound === 'max' ? (
        <input
          type="number"
          step={0.1}
          min={0}
          max={20}
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
          className="field font-mono min-h-[24px] w-[58px] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('max')}
          title="点击输入精确星数上界（清空表示不限 ∞）"
          style={
            maxStars != null
              ? {
                  backgroundColor: maxColor.bg,
                  color: maxColor.text,
                  borderColor: maxColor.border,
                }
              : undefined
          }
          className={`font-stat inline-flex min-h-[24px] min-w-[54px] shrink-0 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold tabular-nums transition-colors ${
            maxStars != null
              ? ''
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {maxStars != null ? `${maxStars.toFixed(1)}★` : '∞'}
        </button>
      )}

      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange(undefined, undefined, true)}
          title="清除星数区间"
          aria-label="清除星数区间"
          className="btn btn-sm btn-icon h-[24px] w-[24px] shrink-0 text-ink-3 hover:text-osu"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
