import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Calculator,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  OSU_GENRES,
  OSU_LANGUAGES,
  QUICK_PRACTICE_TAGS,
  SORT_FIELDS,
  STATUS_OPTIONS,
} from '../constants';
import { InstalledFilter, SearchFilters, SearchMode, SearchSource, SearchStatus } from '../types';
import {
  extractPpScenarioFromFilters,
  formatPpScenarioShort,
  isDefaultPpScenario,
} from '../utils/pp';
import { PpRangeSlider } from './PpRangeSlider';
import { SelectField } from './SelectField';
import { StarRangeSlider } from './StarRangeSlider';

interface FilterPanelProps {
  filters: SearchFilters;
  loading: boolean;
  collapsed?: boolean;
  floatingAdvanced?: boolean;
  onToggleCollapsed?: () => void;
  onChange: (next: SearchFilters, autoSearch?: boolean) => void;
  onSearch: (overrideFilters?: SearchFilters) => void;
  onReset: () => void;
}

const PP_RANGE_PRESETS: Array<{ label: string; minPp?: number; maxPp?: number }> = [
  { label: '不限' },
  { label: '<200', maxPp: 200 },
  { label: '200–300', minPp: 200, maxPp: 300 },
  { label: '300–400', minPp: 300, maxPp: 400 },
  { label: '400–500', minPp: 400, maxPp: 500 },
  { label: '500–650', minPp: 500, maxPp: 650 },
  { label: '650+', minPp: 650 },
];

const PP_SCENARIO_PRESETS: Array<{
  label: string;
  patch: Partial<SearchFilters>;
}> = [
  {
    label: 'NM 95%',
    patch: { ppAccuracy: 95, ppRate: 1, ppMisses: 0, ppMaRatio: undefined, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: 'NM 98%',
    patch: { ppAccuracy: 98, ppRate: 1, ppMisses: 0, ppMaRatio: undefined, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: 'NM 99%',
    patch: { ppAccuracy: 99, ppRate: 1, ppMisses: 0, ppMaRatio: undefined, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: 'SS 100%',
    patch: { ppAccuracy: 100, ppRate: 1, ppMisses: 0, ppMaRatio: undefined, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: 'DT 1.5x 98%',
    patch: { ppAccuracy: 98, ppRate: 1.5, ppMisses: 0, ppMaRatio: undefined, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: 'HT 0.75x 98%',
    patch: { ppAccuracy: 98, ppRate: 0.75, ppMisses: 0, ppMaRatio: undefined, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: '98% · 3:1',
    patch: { ppAccuracy: 98, ppRate: 1, ppMisses: 0, ppMaRatio: 3, ppClassic: false, ppEz: false, ppNf: false },
  },
  {
    label: '99% · 5:1',
    patch: { ppAccuracy: 99, ppRate: 1, ppMisses: 0, ppMaRatio: 5, ppClassic: false, ppEz: false, ppNf: false },
  },
];

function RangeInput({
  label,
  minVal,
  maxVal,
  step = 'any',
  minPlaceholder = '最小',
  maxPlaceholder = '最大',
  onChangeMin,
  onChangeMax,
}: {
  label: string;
  minVal?: number;
  maxVal?: number;
  step?: string;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  onChangeMin: (v: number | undefined) => void;
  onChangeMax: (v: number | undefined) => void;
}) {
  const parse = (raw: string) => {
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          value={minVal ?? ''}
          placeholder={minPlaceholder}
          onChange={(e) => onChangeMin(parse(e.target.value))}
          className="field font-mono text-[0.78125rem] tabular-nums"
        />
        <span className="text-[0.75rem] text-ink-4">–</span>
        <input
          type="number"
          step={step}
          value={maxVal ?? ''}
          placeholder={maxPlaceholder}
          onChange={(e) => onChangeMax(parse(e.target.value))}
          className="field font-mono text-[0.78125rem] tabular-nums"
        />
      </div>
    </div>
  );
}

export function FilterPanel({
  filters,
  loading,
  collapsed = false,
  floatingAdvanced = false,
  onToggleCollapsed,
  onChange,
  onSearch,
  onReset,
}: FilterPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ppPopoverOpen, setPpPopoverOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const ppPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!floatingAdvanced || !advancedOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAdvancedOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setAdvancedOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [floatingAdvanced, advancedOpen]);

  useEffect(() => {
    if (!ppPopoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ppPopoverRef.current && !ppPopoverRef.current.contains(e.target as Node)) {
        setPpPopoverOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setPpPopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ppPopoverOpen]);

  const [sortField, sortDir] = (filters.sort || 'ranked_date:desc').split(':');

  const advancedCount = [
    filters.genre && filters.genre > 0,
    filters.language && filters.language > 0,
    filters.video,
    filters.storyboard,
    filters.spotlight,
    filters.featured,
    filters.nsfw,
    filters.includeConverts,
    filters.minBpm != null || filters.maxBpm != null,
    filters.minLength != null || filters.maxLength != null,
    filters.minOd != null || filters.maxOd != null,
    filters.minHp != null || filters.maxHp != null,
    filters.minAr != null || filters.maxAr != null,
    filters.minLn != null || filters.maxLn != null,
    Boolean(filters.creator?.trim()),
  ].filter(Boolean).length;

  const update = (patch: Partial<SearchFilters>, triggerSearch = false) => {
    const next = { ...filters, ...patch, offset: 0 };
    onChange(next, triggerSearch);
  };

  const ppScenario = extractPpScenarioFromFilters(filters);
  const ppScenarioCustomized = !isDefaultPpScenario(ppScenario) || Boolean(filters.ppIncludeUnranked);
  const ppScenarioLabel = formatPpScenarioShort(ppScenario);
  const hasStarFilter = filters.minStars != null || filters.maxStars != null;
  const hasPpFilter = filters.minPp != null || filters.maxPp != null;

  const modeSummary =
    filters.mode === '3'
      ? `Mania ${filters.keys && filters.keys !== 'any' ? `${filters.keys}K` : '全部键数'}`
      : filters.mode === '0'
        ? 'Standard'
        : filters.mode === '1'
          ? 'Taiko'
          : filters.mode === '2'
            ? 'Catch'
            : '全模式';
  const statusSummary =
    STATUS_OPTIONS.find((s) => s.value === (filters.status || 'leaderboard'))?.label.split(' ')[0] ??
    '排行榜';
  const sortSummary = SORT_FIELDS.find((s) => s.value === sortField)?.label ?? '上架时间';

  if (collapsed) {
    return (
      <section className="panel shrink-0 px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <input
              type="text"
              value={filters.q || ''}
              onChange={(e) => onChange({ ...filters, q: e.target.value, offset: 0 }, false)}
              placeholder="快速搜索曲名、艺术家、谱师或粘贴谱面链接..."
              className="field min-h-[32px] pl-8.5 pr-3 text-[0.8125rem]"
            />
          </div>

          <div className="hidden items-center gap-1.5 md:flex">
            <span className="chip">{modeSummary}</span>
            <span className="chip">{statusSummary}</span>
            <span className="chip">{sortSummary}</span>
            {hasStarFilter && (
              <span className="chip border-osu/35 bg-osu/10 text-osu-soft">
                {filters.minStars ?? 0}–{filters.maxStars ?? '∞'}★
              </span>
            )}
            {hasPpFilter && (
              <span className="chip border-lazer/35 bg-lazer/12 text-lazer-soft">
                ~{filters.minPp ?? 0}–{filters.maxPp ?? '∞'}pp
              </span>
            )}
            {advancedCount > 0 && (
              <span className="chip border-osu/40 bg-osu/12 text-osu-soft">
                +{advancedCount} 高级
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-sm min-h-[32px] rounded-[8px] px-3"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{loading ? '搜索中' : '搜索'}</span>
          </button>

          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              title="展开完整搜索与筛选面板"
              className="btn btn-sm min-h-[32px] rounded-[8px] px-3"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-osu" />
              <span>展开筛选</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
      </section>
    );
  }

  return (
    <section ref={panelRef} className="panel relative z-30 shrink-0 p-2.5 sm:p-3">
      {/* Row 1: Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            type="text"
            value={filters.q || ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value, offset: 0 }, false)}
            placeholder="搜索曲名、艺术家、谱师、Tags，或直接粘贴 Beatmapset ID / osu.ppy.sh 链接..."
            className="field field-lg pl-10 pr-4"
          />
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={loading} className="btn btn-primary min-h-[40px] rounded-[8px] px-5 text-[0.84375rem]">
            <Search className="h-4 w-4" />
            <span>{loading ? '搜索中…' : '搜索谱面'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPpPopoverOpen(false);
              setAdvancedOpen((v) => !v);
            }}
            className={`btn min-h-[40px] rounded-[8px] px-3.5 ${
              advancedOpen || advancedCount > 0
                ? 'border-osu/45 bg-osu/12 text-osu-soft hover:border-osu/60 hover:bg-osu/18'
                : ''
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>高级筛选</span>
            {advancedCount > 0 && (
              <span className="font-stat flex h-4 min-w-[16px] items-center justify-center rounded-full bg-osu px-1 text-[0.6875rem] font-bold text-white">
                {advancedCount}
              </span>
            )}
            {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onReset}
            title="重置为 Mania 4K 默认筛选"
            className="btn min-h-[40px] rounded-[8px] px-3 text-ink-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">重置</span>
          </button>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              title="收起搜索与筛选栏"
              className="btn min-h-[40px] rounded-[8px] px-2.5 text-ink-2"
            >
              <ChevronUp className="h-4 w-4" />
              <span className="hidden lg:inline">收起</span>
            </button>
          )}
        </div>
      </form>

      {/* Quick Mania Practice Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="overline mr-1">高频词条</span>
        {QUICK_PRACTICE_TAGS.map((tag) => {
          const active = (filters.q || '').trim().toLowerCase() === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => update({ q: tag }, true)}
              className={`chip font-mono transition-colors ${
                active
                  ? 'border-osu/45 bg-osu/15 text-osu-soft'
                  : 'hover:border-osu/35 hover:bg-osu/10 hover:text-osu-soft'
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>

      {/* Row 2: Core Official Filters */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-hairline pt-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">游戏模式 (Mode)</label>
          <SelectField
            value={filters.mode || '3'}
            onChange={(val) => {
              const mode = val as SearchMode;
              update({ mode, keys: mode === '3' ? filters.keys || '4' : 'any' }, true);
            }}
          >
            <option value="3">osu!mania</option>
            <option value="0">osu!standard</option>
            <option value="1">osu!taiko</option>
            <option value="2">osu!catch</option>
            <option value="any">全部模式 (Any)</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">键数 (Keys)</label>
          <SelectField
            disabled={filters.mode !== '3'}
            value={filters.mode === '3' ? filters.keys || '4' : 'any'}
            onChange={(val) => update({ keys: val }, true)}
          >
            <option value="4">4K (默认)</option>
            <option value="5">5K</option>
            <option value="6">6K</option>
            <option value="7">7K</option>
            <option value="8">8K</option>
            <option value="9">9K</option>
            <option value="10">10K</option>
            <option value="other">其他键数</option>
            <option value="any">全部键数</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">谱面状态 (Categories)</label>
          <SelectField
            value={filters.status || 'leaderboard'}
            onChange={(val) => update({ status: val as SearchStatus }, true)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">排序方式 (Sort)</label>
          <div className="flex min-w-0 items-center gap-1">
            <SelectField
              value={sortField}
              onChange={(val) => update({ sort: `${val}:${sortDir || 'desc'}` }, true)}
              className="flex-1"
            >
              {SORT_FIELDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </SelectField>
            <button
              type="button"
              onClick={() =>
                update({ sort: `${sortField}:${sortDir === 'asc' ? 'desc' : 'asc'}` }, true)
              }
              title={sortDir === 'asc' ? '当前升序，点击切换降序' : '当前降序，点击切换升序'}
              className="btn btn-icon shrink-0"
            >
              {sortDir === 'asc' ? (
                <ArrowUpNarrowWide className="h-3.5 w-3.5 text-stable" />
              ) : (
                <ArrowDownWideNarrow className="h-3.5 w-3.5 text-osu" />
              )}
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">本地查重过滤</label>
          <SelectField
            value={filters.installedFilter || 'all'}
            onChange={(val) => update({ installedFilter: val as InstalledFilter }, true)}
          >
            <option value="all">显示全部谱面</option>
            <option value="hide_lazer">隐藏 Lazer 已有</option>
            <option value="hide_stable">隐藏 Stable 已有</option>
            <option value="hide_any">仅看双端均未装</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">搜索引擎来源</label>
          <SelectField
            value={filters.source || 'auto'}
            onChange={(val) => update({ source: val as SearchSource }, true)}
          >
            <option value="auto">自动 (osu.direct + 故障转移)</option>
            <option value="osudirect">osu.direct 全量筛选</option>
            <option value="sayobot">小夜镜像 (国内直连)</option>
          </SelectField>
        </div>
      </div>

      {/* Row 3: Lazer Star Range Slider + Scenario PP Range Slider */}
      <div className="mt-2 grid grid-cols-1 gap-2 border-t border-hairline pt-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
        <StarRangeSlider
          minStars={filters.minStars}
          maxStars={filters.maxStars}
          onChange={(minS, maxS, commit) => update({ minStars: minS, maxStars: maxS }, commit)}
        />

        <div ref={ppPopoverRef} className="relative min-w-0">
          <PpRangeSlider
            minPp={filters.minPp}
            maxPp={filters.maxPp}
            onChange={(minP, maxP, commit) => update({ minPp: minP, maxPp: maxP }, commit)}
            trailing={
              <button
                type="button"
                onClick={() => {
                  setAdvancedOpen(false);
                  setPpPopoverOpen((v) => !v);
                }}
                title="设定或自定义 PP 计算情景（准度 / 倍速 / 黄彩比 / Mod）"
                className={`btn btn-sm min-h-[26px] shrink-0 px-2 text-[0.71875rem] ${
                  ppPopoverOpen || ppScenarioCustomized
                    ? 'border-lazer/50 bg-lazer/14 text-lazer-soft'
                    : ''
                }`}
              >
                <Calculator className="h-3 w-3 shrink-0" />
                <span>{ppScenarioLabel}</span>
                <ChevronDown
                  className={`h-3 w-3 shrink-0 transition-transform ${
                    ppPopoverOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            }
          />

          {/* Floating PP Scenario Configurator Popover */}
          {ppPopoverOpen && (
            <div className="panel-flat animate-fade-in absolute top-full right-0 z-40 mt-2 w-[min(92vw,440px)] space-y-3 rounded-[14px] border border-hairline-strong bg-surface-2 p-3.5 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5 text-lazer-soft" />
                  <span className="font-display text-[0.84375rem] font-bold text-ink">
                    PP 筛选范围与情景设定
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      {
                        minPp: undefined,
                        maxPp: undefined,
                        ppAccuracy: undefined,
                        ppRate: undefined,
                        ppMisses: undefined,
                        ppMaRatio: undefined,
                        ppClassic: undefined,
                        ppEz: undefined,
                        ppNf: undefined,
                        ppIncludeUnranked: undefined,
                      },
                      hasPpFilter,
                    )
                  }
                  className="text-[0.71875rem] font-semibold text-ink-3 hover:text-osu"
                >
                  重置情景
                </button>
              </div>

              {/* Quick PP Range Presets */}
              <div className="space-y-1.5">
                <span className="field-label block">常用 PP 区间</span>
                <div className="flex flex-wrap gap-1">
                  {PP_RANGE_PRESETS.map((p) => {
                    const active =
                      (filters.minPp ?? undefined) === p.minPp &&
                      (filters.maxPp ?? undefined) === p.maxPp;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => update({ minPp: p.minPp, maxPp: p.maxPp }, true)}
                        className={`btn btn-sm font-mono min-h-[25px] px-2 text-[0.71875rem] ${
                          active ? 'border-lazer/60 bg-lazer/18 text-lazer-soft' : ''
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scenario Presets */}
              <div className="space-y-1.5 border-t border-hairline pt-2.5">
                <span className="field-label block">给定情景预设</span>
                <div className="flex flex-wrap gap-1">
                  {PP_SCENARIO_PRESETS.map((p) => {
                    const active =
                      Math.abs((ppScenario.accuracy ?? 98) - (p.patch.ppAccuracy ?? 98)) < 0.05 &&
                      Math.abs((ppScenario.rate ?? 1) - (p.patch.ppRate ?? 1)) < 0.01 &&
                      (ppScenario.maRatio ?? undefined) === p.patch.ppMaRatio &&
                      ppScenario.misses === 0 &&
                      !ppScenario.mods.classic &&
                      !ppScenario.mods.ez &&
                      !ppScenario.mods.nf;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => update(p.patch, hasPpFilter)}
                        className={`btn btn-sm font-stat min-h-[25px] px-2 text-[0.71875rem] ${
                          active ? 'border-osu/60 bg-osu/15 text-osu-soft' : ''
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Scenario Parameters */}
              <div className="space-y-2.5 border-t border-hairline pt-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {/* Accuracy */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[0.71875rem]">
                      <span className="font-semibold text-ink-2">准度</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={50}
                          max={100}
                          step={0.1}
                          value={ppScenario.accuracy}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) {
                              update({ ppAccuracy: Math.min(100, Math.max(0, v)) });
                            }
                          }}
                          className="field font-mono min-h-[24px] w-16 px-1.5 py-0 text-right text-[0.75rem]"
                        />
                        <span className="font-mono text-ink-3">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={100}
                      step={0.5}
                      value={Math.max(80, Math.min(100, ppScenario.accuracy))}
                      onChange={(e) => update({ ppAccuracy: Number(e.target.value) })}
                      style={
                        {
                          '--fill': `${Math.min(100, Math.max(0, ((ppScenario.accuracy - 80) / 20) * 100))}%`,
                        } as CSSProperties
                      }
                      className="slim-range w-full"
                      aria-label="筛选准度滑块"
                    />
                  </div>

                  {/* Rate */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[0.71875rem]">
                      <span className="font-semibold text-ink-2">倍速</span>
                      <span className="font-mono font-bold text-ink tabular-nums">
                        {ppScenario.rate.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={ppScenario.rate}
                      onChange={(e) => update({ ppRate: Number(e.target.value) })}
                      style={
                        {
                          '--fill': `${Math.min(100, Math.max(0, ((ppScenario.rate - 0.5) / 1.5) * 100))}%`,
                        } as CSSProperties
                      }
                      className="slim-range w-full"
                      aria-label="筛选倍速滑块"
                    />
                  </div>
                </div>

                {/* Custom MA Ratio */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[0.71875rem]">
                    <span className="font-semibold text-ink-2">黄彩比 (彩300 : 黄300)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={0.1}
                        value={ppScenario.maRatio !== null ? ppScenario.maRatio : ''}
                        placeholder="直算"
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === '') {
                            update({ ppMaRatio: undefined });
                            return;
                          }
                          const v = Number(raw);
                          if (Number.isFinite(v)) {
                            update({ ppMaRatio: Math.min(999, Math.max(0, Math.round(v * 100) / 100)) });
                          }
                        }}
                        aria-label="筛选黄彩比数值"
                        className="field font-mono min-h-[24px] w-16 px-1.5 py-0 text-right text-[0.75rem]"
                      />
                      <span className="font-mono text-ink-3">: 1</span>
                      {ppScenario.maRatio !== null && (
                        <button
                          type="button"
                          onClick={() => update({ ppMaRatio: undefined })}
                          className="btn btn-sm min-h-[22px] px-1.5 text-[0.6875rem] text-ink-3"
                        >
                          直算
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={0.1}
                    value={ppScenario.maRatio !== null ? Math.min(20, Math.max(0, ppScenario.maRatio)) : 20}
                    onChange={(e) =>
                      update({ ppMaRatio: Math.round(Number(e.target.value) * 10) / 10 })
                    }
                    style={
                      {
                        '--fill': `${ppScenario.maRatio !== null ? Math.min(100, Math.max(0, (ppScenario.maRatio / 20) * 100)) : 100}%`,
                      } as CSSProperties
                    }
                    className={`slim-range w-full ${ppScenario.maRatio === null ? 'opacity-60' : ''}`}
                    aria-label="筛选黄彩比滑块"
                  />
                </div>

                {/* Misses & Mods */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.71875rem] font-semibold text-ink-2">Miss</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={ppScenario.misses}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) {
                          update({ ppMisses: Math.min(100, Math.max(0, Math.round(v))) });
                        }
                      }}
                      aria-label="筛选失误数"
                      className="field font-mono min-h-[24px] w-14 px-1.5 py-0 text-center text-[0.75rem]"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => update({ ppClassic: !ppScenario.mods.classic })}
                      className={`btn btn-sm min-h-[24px] px-2 text-[0.71875rem] ${
                        ppScenario.mods.classic
                          ? 'border-stable/60 bg-stable/16 text-stable-soft'
                          : ''
                      }`}
                    >
                      Classic
                    </button>
                    <button
                      type="button"
                      onClick={() => update({ ppEz: !ppScenario.mods.ez })}
                      className={`btn btn-sm min-h-[24px] px-2 text-[0.71875rem] ${
                        ppScenario.mods.ez ? 'border-emerald-500/60 bg-emerald-500/16 text-ok' : ''
                      }`}
                    >
                      EZ
                    </button>
                    <button
                      type="button"
                      onClick={() => update({ ppNf: !ppScenario.mods.nf })}
                      className={`btn btn-sm min-h-[24px] px-2 text-[0.71875rem] ${
                        ppScenario.mods.nf ? 'border-amber-500/60 bg-amber-500/16 text-warn' : ''
                      }`}
                    >
                      NF
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] font-medium text-ink-2">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.ppIncludeUnranked)}
                    onChange={(e) =>
                      update({ ppIncludeUnranked: e.target.checked || undefined })
                    }
                    className="check check-lazer"
                  />
                  <span>含未上架谱面（按模拟上架 PP 筛选）</span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
                <span className="text-[0.6875rem] text-ink-3">
                  自动推算星数区间并精确过滤
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSearch();
                    setPpPopoverOpen(false);
                  }}
                  className="btn btn-primary btn-sm px-3.5"
                >
                  应用并筛选
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Full Official + Mania 4K Advanced Filters */}
      {advancedOpen && (
        <div
          className={
            floatingAdvanced
              ? 'panel-flat animate-fade-in absolute top-full right-0 left-0 z-30 mt-2 max-h-[calc(100vh-220px)] space-y-3.5 overflow-y-auto rounded-[14px] border border-hairline-strong bg-surface-2/95 p-3.5 shadow-2xl backdrop-blur-xl'
              : 'panel-flat animate-fade-in mt-3 space-y-3.5 p-3.5'
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">曲风 (Genre)</label>
              <SelectField
                value={filters.genre ?? 0}
                onChange={(val) => update({ genre: Number(val) || undefined })}
              >
                {OSU_GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">语言 (Language)</label>
              <SelectField
                value={filters.language ?? 0}
                onChange={(val) => update({ language: Number(val) || undefined })}
              >
                {OSU_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">谱师 (Mapper / Creator)</label>
              <input
                type="text"
                value={filters.creator || ''}
                placeholder="精确匹配谱师 ID 名"
                onChange={(e) => update({ creator: e.target.value || undefined })}
                className="field"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">LN 长条占比速选 (4K)</label>
              <div className="segmented segmented-auto">
                <button
                  type="button"
                  onClick={() => update({ minLn: undefined, maxLn: 15 })}
                  className={
                    filters.maxLn === 15 && filters.minLn == null
                      ? 'ln-rice shadow-[inset_0_0_0_1px_var(--ln-rice-border)]'
                      : ''
                  }
                >
                  Rice ≤15%
                </button>
                <button
                  type="button"
                  onClick={() => update({ minLn: 16, maxLn: 44 })}
                  className={
                    filters.minLn === 16 && filters.maxLn === 44
                      ? 'ln-hybrid shadow-[inset_0_0_0_1px_var(--ln-hybrid-border)]'
                      : ''
                  }
                >
                  Hybrid
                </button>
                <button
                  type="button"
                  onClick={() => update({ minLn: 45, maxLn: undefined })}
                  className={
                    filters.minLn === 45 && filters.maxLn == null
                      ? 'ln-heavy shadow-[inset_0_0_0_1px_var(--ln-heavy-border)]'
                      : ''
                  }
                >
                  LN ≥45%
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            <RangeInput
              label="BPM"
              minVal={filters.minBpm}
              maxVal={filters.maxBpm}
              step="1"
              minPlaceholder="60"
              maxPlaceholder="300"
              onChangeMin={(v) => update({ minBpm: v })}
              onChangeMax={(v) => update({ maxBpm: v })}
            />
            <RangeInput
              label="时长 (秒)"
              minVal={filters.minLength}
              maxVal={filters.maxLength}
              step="1"
              minPlaceholder="30"
              maxPlaceholder="600"
              onChangeMin={(v) => update({ minLength: v })}
              onChangeMax={(v) => update({ maxLength: v })}
            />
            <RangeInput
              label="OD"
              minVal={filters.minOd}
              maxVal={filters.maxOd}
              step="0.5"
              minPlaceholder="0"
              maxPlaceholder="10"
              onChangeMin={(v) => update({ minOd: v })}
              onChangeMax={(v) => update({ maxOd: v })}
            />
            <RangeInput
              label="HP"
              minVal={filters.minHp}
              maxVal={filters.maxHp}
              step="0.5"
              minPlaceholder="0"
              maxPlaceholder="10"
              onChangeMin={(v) => update({ minHp: v })}
              onChangeMax={(v) => update({ maxHp: v })}
            />
            <RangeInput
              label="AR (其他模式)"
              minVal={filters.minAr}
              maxVal={filters.maxAr}
              step="0.5"
              minPlaceholder="0"
              maxPlaceholder="10"
              onChangeMin={(v) => update({ minAr: v })}
              onChangeMax={(v) => update({ maxAr: v })}
            />
            <RangeInput
              label="LN 面率 (%)"
              minVal={filters.minLn}
              maxVal={filters.maxLn}
              step="5"
              minPlaceholder="0%"
              maxPlaceholder="100%"
              onChangeMin={(v) => update({ minLn: v })}
              onChangeMax={(v) => update({ maxLn: v })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.78125rem] font-medium text-ink-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.video)}
                  onChange={(e) => update({ video: e.target.checked || undefined })}
                  className="check"
                />
                <span>含背景视频 (Has Video)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.storyboard)}
                  onChange={(e) => update({ storyboard: e.target.checked || undefined })}
                  className="check"
                />
                <span>含故事板 (Has Storyboard)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.featured)}
                  onChange={(e) => update({ featured: e.target.checked || undefined })}
                  className="check"
                />
                <span>精选艺术家 (Featured Artists)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.spotlight)}
                  onChange={(e) => update({ spotlight: e.target.checked || undefined })}
                  className="check"
                />
                <span>官方精选集 (Spotlight)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.includeConverts)}
                  onChange={(e) => update({ includeConverts: e.target.checked || undefined })}
                  className="check"
                />
                <span>包含转谱 (Converts)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.nsfw)}
                  onChange={(e) => update({ nsfw: e.target.checked })}
                  className="check"
                />
                <span>包含成人内容 (Explicit/NSFW)</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                onSearch();
                if (floatingAdvanced) setAdvancedOpen(false);
              }}
              className="btn btn-primary btn-sm px-4"
            >
              应用高级筛选
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
