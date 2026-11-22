import { useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
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
import { SelectField } from './SelectField';

interface FilterPanelProps {
  filters: SearchFilters;
  loading: boolean;
  onChange: (next: SearchFilters, autoSearch?: boolean) => void;
  onSearch: (overrideFilters?: SearchFilters) => void;
  onReset: () => void;
}

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
          className="field font-mono text-[11.5px] tabular-nums"
        />
        <span className="text-[11px] text-ink-4">–</span>
        <input
          type="number"
          step={step}
          value={maxVal ?? ''}
          placeholder={maxPlaceholder}
          onChange={(e) => onChangeMax(parse(e.target.value))}
          className="field font-mono text-[11.5px] tabular-nums"
        />
      </div>
    </div>
  );
}

export function FilterPanel({
  filters,
  loading,
  onChange,
  onSearch,
  onReset,
}: FilterPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    filters.minStars != null || filters.maxStars != null,
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

  return (
    <section className="panel p-3.5 sm:p-4">
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
          <button type="submit" disabled={loading} className="btn btn-primary h-[40px] rounded-[11px] px-5 text-[13px]">
            <Search className="h-4 w-4" />
            <span>{loading ? '搜索中…' : '搜索谱面'}</span>
          </button>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className={`btn h-[40px] rounded-[11px] px-3.5 ${
              advancedOpen || advancedCount > 0
                ? 'border-osu/45 bg-osu/12 text-osu-soft hover:border-osu/60 hover:bg-osu/18'
                : ''
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>高级筛选</span>
            {advancedCount > 0 && (
              <span className="font-stat flex h-4 min-w-[16px] items-center justify-center rounded-full bg-osu px-1 text-[10px] font-bold text-white">
                {advancedCount}
              </span>
            )}
            {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onReset}
            title="重置为 Mania 4K 默认筛选"
            className="btn h-[40px] rounded-[11px] px-3 text-ink-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">重置</span>
          </button>
        </div>
      </form>

      {/* Quick Mania Practice Tags */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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
      <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-hairline pt-3 sm:grid-cols-3 xl:grid-cols-6">
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

      {/* Collapsible Full Official + Mania 4K Advanced Filters */}
      {advancedOpen && (
        <div className="panel-flat animate-fade-in mt-3 space-y-3.5 p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="segmented">
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

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-7">
            <RangeInput
              label="星数 (Stars)"
              minVal={filters.minStars}
              maxVal={filters.maxStars}
              step="0.1"
              minPlaceholder="0.0"
              maxPlaceholder="12.0"
              onChangeMin={(v) => update({ minStars: v })}
              onChangeMax={(v) => update({ maxStars: v })}
            />
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-ink-2">
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
              onClick={() => onSearch()}
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
