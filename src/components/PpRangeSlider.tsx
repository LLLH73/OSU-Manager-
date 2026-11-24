import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface PpRangeSliderProps {
  minPp?: number;
  maxPp?: number;
  onChange: (minPp: number | undefined, maxPp: number | undefined, commit: boolean) => void;
  trailing?: ReactNode;
}

const PP_TRACK_MAX = 1000;
const PP_STEP = 10;

function roundPp(v: number): number {
  return Math.round(v / PP_STEP) * PP_STEP;
}

function clampTrackPp(v: number): number {
  return Math.min(PP_TRACK_MAX, Math.max(0, roundPp(v)));
}

export function PpRangeSlider({ minPp, maxPp, onChange, trailing }: PpRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<'min' | 'max' | null>(null);

  const [draggingThumb, setDraggingThumb] = useState<'min' | 'max' | null>(null);
  const [editingBound, setEditingBound] = useState<'min' | 'max' | null>(null);
  const [draftVal, setDraftVal] = useState('');

  const effMin = minPp != null && Number.isFinite(minPp) ? Math.max(0, Math.round(minPp)) : 0;
  const effMax =
    maxPp != null && Number.isFinite(maxPp) ? Math.max(effMin, Math.round(maxPp)) : PP_TRACK_MAX;

  const minTrack = Math.min(PP_TRACK_MAX, effMin);
  const maxTrack =
    maxPp == null ? PP_TRACK_MAX : Math.min(PP_TRACK_MAX, Math.max(minTrack, maxPp));

  const minPct = (minTrack / PP_TRACK_MAX) * 100;
  const maxPct = (maxTrack / PP_TRACK_MAX) * 100;
  const hasFilter = minPp != null || maxPp != null;

  const valueFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clampTrackPp(ratio * PP_TRACK_MAX);
  };

  const applyThumbValue = (thumb: 'min' | 'max', rawPp: number, commit: boolean) => {
    let nextMin = minPp;
    let nextMax = maxPp;

    if (thumb === 'min') {
      const clamped = Math.min(rawPp, maxTrack);
      nextMin = clamped <= 5 ? undefined : roundPp(clamped);
    } else {
      const clamped = Math.max(rawPp, minTrack);
      nextMax = clamped >= PP_TRACK_MAX - 5 ? undefined : roundPp(clamped);
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
    if (Math.abs(dMin - dMax) < 8) {
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
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = PP_STEP;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -PP_STEP;
    else if (e.key === 'PageUp') delta = 50;
    else if (e.key === 'PageDown') delta = -50;
    else if (e.key === 'Home') {
      e.preventDefault();
      applyThumbValue(thumb, thumb === 'min' ? 0 : minTrack, true);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      applyThumbValue(thumb, thumb === 'min' ? maxTrack : PP_TRACK_MAX, true);
      return;
    } else {
      return;
    }

    e.preventDefault();
    const cur = thumb === 'min' ? minTrack : maxTrack;
    applyThumbValue(thumb, clampTrackPp(cur + delta), true);
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
    const clean = Math.max(0, Math.min(5000, Math.round(parsed)));
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

  return (
    <div className="flex h-full min-w-0 items-center gap-1.5 rounded-[10px] border border-hairline bg-surface-1/65 px-2.5 py-1">
      <span className="field-label shrink-0">PP</span>

      {/* Lower Bound Pill / Click-to-edit */}
      {editingBound === 'min' ? (
        <input
          type="number"
          step={10}
          min={0}
          max={5000}
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
          className="field font-mono min-h-[24px] w-[62px] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('min')}
          title="点击输入精确 PP 下界"
          className={`font-stat inline-flex min-h-[24px] min-w-[54px] shrink-0 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold tabular-nums transition-colors ${
            minPp != null
              ? 'border-lazer/45 bg-lazer/14 text-lazer-soft'
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {effMin}pp
        </button>
      )}

      {/* Thick Dual-Thumb PP Track */}
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
            clipPath: `inset(0 ${(100 - maxPct).toFixed(2)}% 0 ${minPct.toFixed(2)}% round 6px)`,
          }}
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="PP 下界"
          aria-valuemin={0}
          aria-valuemax={maxTrack}
          aria-valuenow={minTrack}
          aria-valuetext={`${minTrack} pp`}
          onKeyDown={(e) => handleKeyDown('min', e)}
          style={{ left: `${minPct}%` }}
          className={`absolute top-1/2 h-[20px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-lazer transition-transform duration-100 ${
            draggingThumb === 'min' ? 'z-20 scale-x-110 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="PP 上界"
          aria-valuemin={minTrack}
          aria-valuemax={PP_TRACK_MAX}
          aria-valuenow={maxTrack}
          aria-valuetext={maxPp == null ? '不限上限' : `${effMax} pp`}
          onKeyDown={(e) => handleKeyDown('max', e)}
          style={{ left: `${maxPct}%` }}
          className={`absolute top-1/2 h-[20px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-lazer transition-transform duration-100 ${
            draggingThumb === 'max' ? 'z-20 scale-x-110 scale-y-115' : 'z-10 hover:scale-y-110'
          }`}
        />
      </div>

      {/* Upper Bound Pill / Click-to-edit */}
      {editingBound === 'max' ? (
        <input
          type="number"
          step={10}
          min={0}
          max={5000}
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
          className="field font-mono min-h-[24px] w-[62px] shrink-0 px-1.5 py-0 text-center text-[0.75rem] tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={() => beginEdit('max')}
          title="点击输入精确 PP 上界（清空表示不限 ∞）"
          className={`font-stat inline-flex min-h-[24px] min-w-[54px] shrink-0 items-center justify-center rounded-full border px-2 text-[0.75rem] font-bold tabular-nums transition-colors ${
            maxPp != null
              ? 'border-lazer/45 bg-lazer/14 text-lazer-soft'
              : 'border-hairline bg-surface-2/80 text-ink-3 hover:border-hairline-strong hover:text-ink'
          }`}
        >
          {maxPp != null ? `${maxPp}pp` : '∞'}
        </button>
      )}

      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange(undefined, undefined, true)}
          title="清除 PP 范围"
          aria-label="清除 PP 范围"
          className="btn btn-sm btn-icon h-[24px] w-[24px] shrink-0 text-ink-3 hover:text-osu"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}

      {trailing}
    </div>
  );
}
