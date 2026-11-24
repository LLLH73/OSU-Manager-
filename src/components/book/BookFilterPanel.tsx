import { useEffect, useRef } from 'react';
import { Award, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { QUICK_PRACTICE_TAGS } from '../../constants';
import { PpRangeSlider } from '../PpRangeSlider';
import { SelectField } from '../SelectField';
import { StarRangeSlider } from '../StarRangeSlider';
import {
  BookFilters,
  BookGradeFilter,
  BookKeysFilter,
  BookModeFilter,
  BookSourceFilter,
  BookStatusFilter,
  DEFAULT_BOOK_FILTERS,
} from './bookFilters';

interface BookFilterPanelProps {
  open: boolean;
  filters: BookFilters;
  matchedCount: number;
  totalCount: number;
  anchorRef?: React.RefObject<HTMLElement | null>;
  onUpdate: (patch: Partial<BookFilters>, commitWave?: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

const STAR_CHIPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: '不限' },
  { label: '<3★', max: 3 },
  { label: '3–5★', min: 3, max: 5 },
  { label: '5–7★', min: 5, max: 7 },
  { label: '7★+', min: 7 },
];

const BPM_CHIPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: '≤150', max: 150 },
  { label: '150–190', min: 150, max: 190 },
  { label: '190+', min: 190 },
];

const LENGTH_CHIPS: Array<{ label: string; min?: number; max?: number }> = [
  { label: '短曲 ≤90s', max: 90 },
  { label: '90–210s', min: 90, max: 210 },
  { label: '耐力 ≥210s', min: 210 },
];

function RangePair({
  label,
  minVal,
  maxVal,
  step = '1',
  minPlaceholder,
  maxPlaceholder,
  onChangeMin,
  onChangeMax,
  chips,
  onPickChip,
}: {
  label: string;
  minVal?: number;
  maxVal?: number;
  step?: string;
  minPlaceholder: string;
  maxPlaceholder: string;
  onChangeMin: (v: number | undefined) => void;
  onChangeMax: (v: number | undefined) => void;
  chips: Array<{ label: string; min?: number; max?: number }>;
  onPickChip: (min?: number, max?: number) => void;
}) {
  const parse = (raw: string) => {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
          {label}
        </span>
        <div className="flex items-center gap-1">
          {chips.map((c) => {
            const active = (minVal ?? undefined) === c.min && (maxVal ?? undefined) === c.max;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() =>
                  active ? onPickChip(undefined, undefined) : onPickChip(c.min, c.max)
                }
                className={`border px-1.5 py-0.5 font-mono text-[0.625rem] transition-colors ${
                  active
                    ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                    : 'border-[var(--rb-line)] text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          value={minVal ?? ''}
          placeholder={minPlaceholder}
          onChange={(e) => onChangeMin(parse(e.target.value))}
          className="h-8 w-full min-w-0 border border-[var(--rb-line)] bg-[var(--rb-paper)]/65 px-2 font-mono text-[0.75rem] text-[var(--rb-ink)] tabular-nums placeholder:text-[var(--rb-muted)]/60 focus:border-[var(--rb-accent)] focus:outline-none"
        />
        <span className="text-[0.75rem] text-[var(--rb-muted)]">–</span>
        <input
          type="number"
          step={step}
          value={maxVal ?? ''}
          placeholder={maxPlaceholder}
          onChange={(e) => onChangeMax(parse(e.target.value))}
          className="h-8 w-full min-w-0 border border-[var(--rb-line)] bg-[var(--rb-paper)]/65 px-2 font-mono text-[0.75rem] text-[var(--rb-ink)] tabular-nums placeholder:text-[var(--rb-muted)]/60 focus:border-[var(--rb-accent)] focus:outline-none"
        />
      </div>
    </div>
  );
}

export function BookFilterPanel({
  open,
  filters,
  matchedCount,
  totalCount,
  anchorRef,
  onUpdate,
  onReset,
  onClose,
}: BookFilterPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  const isKeysDisabled = filters.mode !== 'all' && filters.mode !== '3';
  const hasAnyFilter =
    JSON.stringify({ ...filters, sortBy: 'recent', sortDir: 'desc' }) !==
    JSON.stringify({ ...DEFAULT_BOOK_FILTERS, sortBy: 'recent', sortDir: 'desc' });

  return (
    <div
      ref={panelRef}
      className="animate-fade-in pointer-events-auto absolute top-full right-4 left-4 z-30 mt-2 max-h-[min(74vh,560px)] space-y-3.5 overflow-y-auto overscroll-contain border border-[var(--rb-line)] bg-[var(--rb-panel)]/96 p-4 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:right-6 sm:left-6"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rb-line)] pb-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--rb-accent)]" />
          <span className="font-mono text-[0.71875rem] font-bold tracking-[0.12em] text-[var(--rb-ink)] uppercase">
            LOCAL ARCHIVE FILTERS // 高级筛选矩阵
          </span>
          <span className="font-mono text-[0.6875rem] text-[var(--rb-muted)] tabular-nums">
            命中 <strong className="text-[var(--rb-ink)]">{matchedCount}</strong> / {totalCount} 本
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasAnyFilter}
            onClick={onReset}
            className="rhine-btn-outline inline-flex h-7 items-center gap-1.5 px-2.5 text-[0.6875rem] font-semibold disabled:opacity-35"
          >
            <RotateCcw className="h-3 w-3" />
            <span>重置筛选</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭筛选面板"
            className="rhine-btn-outline flex h-7 w-7 items-center justify-center"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Practice Tags (Consistent with Download FilterPanel) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[0.65625rem] font-semibold tracking-[0.1em] text-[var(--rb-muted)] uppercase">
          高频词条
        </span>
        {QUICK_PRACTICE_TAGS.map((tag) => {
          const active = filters.q.trim().toLowerCase() === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onUpdate({ q: active ? '' : tag }, true)}
              className={`border px-2 py-0.5 font-mono text-[0.6875rem] transition-colors ${
                active
                  ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                  : 'border-[var(--rb-line)] bg-[var(--rb-paper)]/55 text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>

      {/* Row 1: Core Metadata & Client Dropdowns */}
      <div className="grid grid-cols-2 gap-2.5 border-t border-[var(--rb-line)]/70 pt-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-1">
          <label className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
            本地来源 / 游玩
          </label>
          <SelectField
            value={filters.source}
            onChange={(v) => onUpdate({ source: v as BookSourceFilter }, true)}
            className="h-8 !rounded-none !border-[var(--rb-line)] !bg-[var(--rb-paper)]/75 text-[0.75rem]"
          >
            <option value="all">全部本地曲目</option>
            <option value="stable">仅 osu!stable</option>
            <option value="lazer">仅 osu!lazer</option>
            <option value="both">双端共有</option>
            <option value="played">已有游玩记录</option>
            <option value="unplayed">尚未游玩 (0 Plays)</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
            游戏模式 (Mode)
          </label>
          <SelectField
            value={filters.mode}
            onChange={(v) => {
              const mode = v as BookModeFilter;
              onUpdate(
                { mode, keys: mode === 'all' || mode === '3' ? filters.keys : 'any' },
                true,
              );
            }}
            className="h-8 !rounded-none !border-[var(--rb-line)] !bg-[var(--rb-paper)]/75 text-[0.75rem]"
          >
            <option value="all">全部模式 (Any)</option>
            <option value="3">osu!mania</option>
            <option value="0">osu!standard</option>
            <option value="1">osu!taiko</option>
            <option value="2">osu!catch</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
            键数 (Keys)
          </label>
          <SelectField
            disabled={isKeysDisabled}
            value={isKeysDisabled ? 'any' : filters.keys}
            onChange={(v) => onUpdate({ keys: v as BookKeysFilter }, true)}
            className="h-8 !rounded-none !border-[var(--rb-line)] !bg-[var(--rb-paper)]/75 text-[0.75rem]"
          >
            <option value="any">全部键数</option>
            <option value="4">4K</option>
            <option value="5">5K</option>
            <option value="6">6K</option>
            <option value="7">7K</option>
            <option value="8">8K</option>
            <option value="9">9K</option>
            <option value="10">10K</option>
            <option value="other">其他键数</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
            谱面状态 (Status)
          </label>
          <SelectField
            value={filters.status}
            onChange={(v) => onUpdate({ status: v as BookStatusFilter }, true)}
            className="h-8 !rounded-none !border-[var(--rb-line)] !bg-[var(--rb-paper)]/75 text-[0.75rem]"
          >
            <option value="all">全部状态</option>
            <option value="leaderboard">有排行榜 (Ranked/Loved)</option>
            <option value="ranked">已上架 (Ranked/Approved)</option>
            <option value="loved">社区喜爱 (Loved)</option>
            <option value="qualified">入选 (Qualified)</option>
            <option value="pending">待审核 / WIP</option>
            <option value="graveyard">坟场 (Graveyard)</option>
            <option value="local">纯本地自制 (Local)</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
            最高评级 (Grade)
          </label>
          <SelectField
            value={filters.grade}
            onChange={(v) => onUpdate({ grade: v as BookGradeFilter }, true)}
            className="h-8 !rounded-none !border-[var(--rb-line)] !bg-[var(--rb-paper)]/75 text-[0.75rem]"
          >
            <option value="all">全部评级</option>
            <option value="ss">SS (XH / X)</option>
            <option value="s">S (SH / S)</option>
            <option value="a">A</option>
            <option value="b_or_lower">B / C / D / F</option>
            <option value="none">尚无评级</option>
          </SelectField>
        </div>
      </div>

      {/* Row 2: Star Range Slider & PP Range Slider (Shared with Download UI) */}
      <div className="grid grid-cols-1 gap-3 border-t border-[var(--rb-line)]/70 pt-3 xl:grid-cols-2">
        <div className="space-y-1.5">
          <StarRangeSlider
            minStars={filters.minStars}
            maxStars={filters.maxStars}
            onChange={(minS, maxS, commit) =>
              onUpdate({ minStars: minS, maxStars: maxS }, commit)
            }
          />
          <div className="flex flex-wrap items-center gap-1 pl-1">
            {STAR_CHIPS.map((c) => {
              const active =
                (filters.minStars ?? undefined) === c.min &&
                (filters.maxStars ?? undefined) === c.max;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => onUpdate({ minStars: c.min, maxStars: c.max }, true)}
                  className={`border px-1.5 py-0.5 font-mono text-[0.625rem] transition-colors ${
                    active
                      ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                      : 'border-[var(--rb-line)] text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <PpRangeSlider
            minPp={filters.minPp}
            maxPp={filters.maxPp}
            onChange={(minP, maxP, commit) =>
              onUpdate({ minPp: minP, maxPp: maxP }, commit)
            }
            trailing={
              <button
                type="button"
                onClick={() => onUpdate({ rankedPpOnly: !filters.rankedPpOnly }, true)}
                title="仅显示有 Ranked/Approved 官方 PP 记录的曲目"
                className={`inline-flex h-[24px] shrink-0 items-center gap-1 border px-2 font-mono text-[0.6875rem] font-semibold transition-colors ${
                  filters.rankedPpOnly
                    ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                    : 'border-[var(--rb-line)] text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
                }`}
              >
                <Award className="h-3 w-3" />
                <span>仅 Ranked PP</span>
              </button>
            }
          />
        </div>
      </div>

      {/* Row 3: BPM, Length, LN Ratio + Style Segmented Chips, Mapper */}
      <div className="grid grid-cols-1 gap-3 border-t border-[var(--rb-line)]/70 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <RangePair
          label="BPM 区间"
          minVal={filters.minBpm}
          maxVal={filters.maxBpm}
          minPlaceholder="60"
          maxPlaceholder="300"
          onChangeMin={(v) => onUpdate({ minBpm: v }, false)}
          onChangeMax={(v) => onUpdate({ maxBpm: v }, false)}
          chips={BPM_CHIPS}
          onPickChip={(min, max) => onUpdate({ minBpm: min, maxBpm: max }, true)}
        />

        <RangePair
          label="时长 (秒)"
          minVal={filters.minLength}
          maxVal={filters.maxLength}
          minPlaceholder="30"
          maxPlaceholder="600"
          onChangeMin={(v) => onUpdate({ minLength: v }, false)}
          onChangeMax={(v) => onUpdate({ maxLength: v }, false)}
          chips={LENGTH_CHIPS}
          onPickChip={(min, max) => onUpdate({ minLength: min, maxLength: max }, true)}
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
              LN 面条倾向 (%)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  filters.maxLn === 15 && filters.minLn == null
                    ? onUpdate({ minLn: undefined, maxLn: undefined }, true)
                    : onUpdate({ minLn: undefined, maxLn: 15 }, true)
                }
                className={`border px-1.5 py-0.5 font-mono text-[0.625rem] transition-colors ${
                  filters.maxLn === 15 && filters.minLn == null
                    ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                    : 'border-[var(--rb-line)] text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
                }`}
              >
                Rice ≤15%
              </button>
              <button
                type="button"
                onClick={() =>
                  filters.minLn === 16 && filters.maxLn === 44
                    ? onUpdate({ minLn: undefined, maxLn: undefined }, true)
                    : onUpdate({ minLn: 16, maxLn: 44 }, true)
                }
                className={`border px-1.5 py-0.5 font-mono text-[0.625rem] transition-colors ${
                  filters.minLn === 16 && filters.maxLn === 44
                    ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                    : 'border-[var(--rb-line)] text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
                }`}
              >
                Hybrid
              </button>
              <button
                type="button"
                onClick={() =>
                  filters.minLn === 45 && filters.maxLn == null
                    ? onUpdate({ minLn: undefined, maxLn: undefined }, true)
                    : onUpdate({ minLn: 45, maxLn: undefined }, true)
                }
                className={`border px-1.5 py-0.5 font-mono text-[0.625rem] transition-colors ${
                  filters.minLn === 45 && filters.maxLn == null
                    ? 'border-[var(--rb-accent)] bg-[var(--rb-ink)] text-[var(--rb-paper)]'
                    : 'border-[var(--rb-line)] text-[var(--rb-muted)] hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]'
                }`}
              >
                LN ≥45%
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="5"
              value={filters.minLn ?? ''}
              placeholder="0%"
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = Number(raw);
                onUpdate({ minLn: raw !== '' && Number.isFinite(n) ? n : undefined }, false);
              }}
              className="h-8 w-full min-w-0 border border-[var(--rb-line)] bg-[var(--rb-paper)]/65 px-2 font-mono text-[0.75rem] text-[var(--rb-ink)] tabular-nums placeholder:text-[var(--rb-muted)]/60 focus:border-[var(--rb-accent)] focus:outline-none"
            />
            <span className="text-[0.75rem] text-[var(--rb-muted)]">–</span>
            <input
              type="number"
              step="5"
              value={filters.maxLn ?? ''}
              placeholder="100%"
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = Number(raw);
                onUpdate({ maxLn: raw !== '' && Number.isFinite(n) ? n : undefined }, false);
              }}
              className="h-8 w-full min-w-0 border border-[var(--rb-line)] bg-[var(--rb-paper)]/65 px-2 font-mono text-[0.75rem] text-[var(--rb-ink)] tabular-nums placeholder:text-[var(--rb-muted)]/60 focus:border-[var(--rb-accent)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="font-mono text-[0.65625rem] font-semibold tracking-[0.08em] text-[var(--rb-muted)] uppercase">
            谱师筛选 (Mapper)
          </label>
          <input
            type="text"
            value={filters.creator}
            placeholder="输入谱师 ID 过滤..."
            onChange={(e) => onUpdate({ creator: e.target.value }, false)}
            className="h-8 w-full border border-[var(--rb-line)] bg-[var(--rb-paper)]/65 px-2.5 text-[0.75rem] text-[var(--rb-ink)] placeholder:text-[var(--rb-muted)]/60 focus:border-[var(--rb-accent)] focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
