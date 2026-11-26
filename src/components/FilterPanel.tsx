import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BookmarkPlus,
  Calculator,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  QUICK_PRACTICE_TAGS,
  getOsuGenres,
  getOsuLanguages,
  getSortFields,
  getStatusOptions,
} from '../constants';
import { useI18n } from '../i18n';
import { InstalledFilter, SearchFilters, SearchMode, SearchSource, SearchStatus } from '../types';
import {
  PpScenarioCategory,
  SAVED_PP_SCENARIOS_EVENT,
  SavedPpScenario,
  deleteSavedPpScenario,
  extractPpScenarioFromFilters,
  formatPpScenarioShort,
  inferScenarioCategory,
  isDefaultPpScenario,
  loadSavedPpScenarios,
  matchesScenarioPatch,
  saveCustomPpScenario,
} from '../utils/pp';
import { PpRangeSlider } from './PpRangeSlider';
import { PpScenarioLibrary } from './PpScenarioLibrary';
import { SelectField } from './SelectField';
import { StarRangeSlider } from './StarRangeSlider';

interface FilterPanelProps {
  filters: SearchFilters;
  loading: boolean;
  collapsed?: boolean;
  floatingAdvanced?: boolean;
  onToggleCollapsed?: () => void;
  onOpenSaveArchive?: () => void;
  onChange: (next: SearchFilters, autoSearch?: boolean) => void;
  onSearch: (overrideFilters?: SearchFilters) => void;
  onReset: () => void;
}

const PP_RATE_QUICK_CHIPS: Array<{ label: string; value: number }> = [
  { label: 'HT 0.75x', value: 0.75 },
  { label: '0.9x', value: 0.9 },
  { label: 'NM 1.0x', value: 1 },
  { label: '1.1x', value: 1.1 },
  { label: '1.2x', value: 1.2 },
  { label: '1.3x', value: 1.3 },
  { label: 'DT 1.5x', value: 1.5 },
];

const PP_ACC_QUICK_CHIPS: Array<{ label: string; value: number }> = [
  { label: '94%', value: 94 },
  { label: '95%', value: 95 },
  { label: '97%', value: 97 },
  { label: '98%', value: 98 },
  { label: '99%', value: 99 },
  { label: '99.5%', value: 99.5 },
  { label: 'SS', value: 100 },
];

const PP_MISS_QUICK_CHIPS = [0, 1, 2, 3, 5, 8, 10];

function RangeInput({
  label,
  minVal,
  maxVal,
  step = 'any',
  minPlaceholder,
  maxPlaceholder,
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
  const { t } = useI18n();
  const effectiveMinPlaceholder = minPlaceholder ?? t('最小', 'Min');
  const effectiveMaxPlaceholder = maxPlaceholder ?? t('最大', 'Max');
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
          placeholder={effectiveMinPlaceholder}
          onChange={(e) => onChangeMin(parse(e.target.value))}
          className="field font-mono text-[0.78125rem] tabular-nums"
        />
        <span className="text-[0.75rem] text-ink-4">–</span>
        <input
          type="number"
          step={step}
          value={maxVal ?? ''}
          placeholder={effectiveMaxPlaceholder}
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
  onOpenSaveArchive,
  onChange,
  onSearch,
  onReset,
}: FilterPanelProps) {
  const { lang, isEn, t } = useI18n();
  const osuGenres = useMemo(() => getOsuGenres(lang), [lang]);
  const osuLanguages = useMemo(() => getOsuLanguages(lang), [lang]);
  const sortFields = useMemo(() => getSortFields(lang), [lang]);
  const statusOptions = useMemo(() => getStatusOptions(lang), [lang]);
  const ppRangePresets = useMemo<Array<{ label: string; minPp?: number; maxPp?: number }>>(
    () => [
      { label: t('不限', 'Any') },
      { label: '<200', maxPp: 200 },
      { label: '200–350', minPp: 200, maxPp: 350 },
      { label: '350–500', minPp: 350, maxPp: 500 },
      { label: '500–700', minPp: 500, maxPp: 700 },
      { label: '700–1000', minPp: 700, maxPp: 1000 },
      { label: '1000+', minPp: 1000 },
    ],
    [t],
  );
  const ppMaQuickChips = useMemo<Array<{ label: string; value: number | undefined }>>(
    () => [
      { label: t('直算', 'Direct'), value: undefined },
      { label: '1:1', value: 1 },
      { label: '2:1', value: 2 },
      { label: '3:1', value: 3 },
      { label: '4:1', value: 4 },
      { label: '5:1', value: 5 },
      { label: '8:1', value: 8 },
      { label: t('全彩', 'MAX'), value: 1000 },
    ],
    [t],
  );

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ppPopoverOpen, setPpPopoverOpen] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedPpScenario[]>(loadSavedPpScenarios);
  const [scenarioTab, setScenarioTab] = useState<PpScenarioCategory>(() =>
    inferScenarioCategory(extractPpScenarioFromFilters(filters)),
  );
  const [customScenarioName, setCustomScenarioName] = useState('');
  const [popoverPos, setPopoverPos] = useState<{
    openUpward: boolean;
    maxHeight: number;
    maxWidth: number;
  }>({
    openUpward: false,
    maxHeight: 540,
    maxWidth: 560,
  });
  const panelRef = useRef<HTMLElement | null>(null);
  const ppPopoverRef = useRef<HTMLDivElement | null>(null);
  const prevPopoverOpenRef = useRef(false);

  useEffect(() => {
    const sync = () => setSavedScenarios(loadSavedPpScenarios());
    window.addEventListener(SAVED_PP_SCENARIOS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_PP_SCENARIOS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

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
    const recalc = () => {
      const rect = ppPopoverRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 14;
      const spaceAbove = rect.top - 52;
      const openUpward = spaceBelow < 320 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(230, Math.min(620, openUpward ? spaceAbove : spaceBelow));
      const maxWidth = Math.min(
        560,
        window.innerWidth - 28,
        Math.max(320, Math.floor(rect.right - 12)),
      );
      setPopoverPos({ openUpward, maxHeight, maxWidth });
    };
    recalc();
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
    window.addEventListener('resize', recalc);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', recalc);
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
  const ppScenarioLabel = formatPpScenarioShort(ppScenario, lang);
  const hasStarFilter = filters.minStars != null || filters.maxStars != null;
  const hasPpFilter = filters.minPp != null || filters.maxPp != null;

  useEffect(() => {
    if (ppPopoverOpen && !prevPopoverOpenRef.current) {
      const matchedSaved = savedScenarios.some((s) => matchesScenarioPatch(ppScenario, s.patch));
      setScenarioTab(matchedSaved ? 'custom' : inferScenarioCategory(ppScenario));
    }
    prevPopoverOpenRef.current = ppPopoverOpen;
  }, [ppPopoverOpen, ppScenario, savedScenarios]);

  const maLiveReadout = (() => {
    if (ppScenario.maRatio === null) {
      return t('直算模式（不区分黄/彩 300）', 'Direct mode (no 320:300 split)');
    }
    const r = ppScenario.maRatio;
    const maxPct = ((r / (r + 1)) * 100).toFixed(1);
    const factor = (320 * r + 300) / (320 * (r + 1));
    const effAcc = (ppScenario.accuracy * factor).toFixed(2);
    return t(`彩占 ${maxPct}% · 折算 ${effAcc}%`, `MAX ${maxPct}% · Eff. ${effAcc}%`);
  })();

  const modeSummary =
    filters.mode === '3'
      ? `Mania ${filters.keys && filters.keys !== 'any' ? `${filters.keys}K` : t('全部键数', 'All Keys')}`
      : filters.mode === '0'
        ? 'Standard'
        : filters.mode === '1'
          ? 'Taiko'
          : filters.mode === '2'
            ? 'Catch'
            : t('全模式', 'All Modes');
  const rawStatusLabel = statusOptions.find((s) => s.value === (filters.status || 'leaderboard'))?.label;
  const statusSummary = rawStatusLabel
    ? isEn
      ? rawStatusLabel
      : rawStatusLabel.split(' ')[0]
    : t('排行榜', 'Leaderboard');
  const sortSummary =
    sortFields.find((s) => s.value === sortField)?.label ?? t('上架时间', 'Ranked Date');

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
              placeholder={t(
                '快速搜索曲名、艺术家、谱师或粘贴谱面链接...',
                'Search title, artist, mapper, or paste beatmap URL...',
              )}
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
                ~{filters.minPp ?? 0}–{filters.maxPp ?? '∞'}pp · {ppScenarioLabel}
              </span>
            )}
            {!hasPpFilter && ppScenarioCustomized && (
              <span className="chip border-lazer/35 bg-lazer/12 text-lazer-soft">
                {t(`情景 ${ppScenarioLabel}`, `PP ${ppScenarioLabel}`)}
              </span>
            )}
            {advancedCount > 0 && (
              <span className="chip border-osu/40 bg-osu/12 text-osu-soft">
                {t(`+${advancedCount} 高级`, `+${advancedCount} Adv`)}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-sm min-h-[32px] rounded-[8px] px-3"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{loading ? t('搜索中', 'Searching') : t('搜索', 'Search')}</span>
          </button>

          {onOpenSaveArchive && (
            <button
              type="button"
              onClick={onOpenSaveArchive}
              title={t('保存当前筛选与搜索状态到右侧存档栏', 'Save current filters & state to Archives')}
              className="btn btn-sm min-h-[32px] rounded-[8px] px-2.5 text-ink-2 hover:border-osu/45 hover:text-osu-soft"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-osu" />
              <span className="hidden xl:inline">{t('存档', 'Save')}</span>
            </button>
          )}

          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={t('展开完整搜索与筛选面板', 'Expand full search & filter panel')}
              className="btn btn-sm min-h-[32px] rounded-[8px] px-3"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-osu" />
              <span>{t('展开筛选', 'Filters')}</span>
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
            placeholder={t(
              '搜索曲名、艺术家、谱师、Tags，或直接粘贴 Beatmapset ID / osu.ppy.sh 链接...',
              'Search title, artist, mapper, tags, or paste Beatmapset ID / osu.ppy.sh URL...',
            )}
            className="field field-lg pl-10 pr-4"
          />
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={loading} className="btn btn-primary min-h-[40px] rounded-[8px] px-5 text-[0.84375rem]">
            <Search className="h-4 w-4" />
            <span>{loading ? t('搜索中…', 'Searching…') : t('搜索谱面', 'Search')}</span>
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
            <span>{t('高级筛选', 'Advanced')}</span>
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
            title={t('重置为 Mania 4K 默认筛选', 'Reset to Mania 4K defaults')}
            className="btn min-h-[40px] rounded-[8px] px-3 text-ink-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t('重置', 'Reset')}</span>
          </button>
          {onOpenSaveArchive && (
            <button
              type="button"
              onClick={onOpenSaveArchive}
              title={t('保存当前筛选与搜索状态到右侧存档栏', 'Save current filters & state to Archives')}
              className="btn min-h-[40px] rounded-[8px] px-3 text-ink-2 hover:border-osu/45 hover:text-osu-soft"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-osu" />
              <span className="hidden md:inline">{t('存档', 'Archive')}</span>
            </button>
          )}
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={t('收起搜索与筛选栏', 'Collapse filter panel')}
              className="btn min-h-[40px] rounded-[8px] px-2.5 text-ink-2"
            >
              <ChevronUp className="h-4 w-4" />
              <span className="hidden lg:inline">{t('收起', 'Hide')}</span>
            </button>
          )}
        </div>
      </form>

      {/* Quick Mania Practice Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="overline mr-1">{t('高频词条', 'Quick Tags')}</span>
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
          <label className="field-label">{t('游戏模式 (Mode)', 'Mode')}</label>
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
            <option value="any">{t('全部模式 (Any)', 'All Modes')}</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">{t('键数 (Keys)', 'Keys')}</label>
          <SelectField
            disabled={filters.mode !== '3'}
            value={filters.mode === '3' ? filters.keys || '4' : 'any'}
            onChange={(val) => update({ keys: val }, true)}
          >
            <option value="4">{t('4K (默认)', '4K (Default)')}</option>
            <option value="5">5K</option>
            <option value="6">6K</option>
            <option value="7">7K</option>
            <option value="8">8K</option>
            <option value="9">9K</option>
            <option value="10">10K</option>
            <option value="other">{t('其他键数', 'Other')}</option>
            <option value="any">{t('全部键数', 'All Keys')}</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">{t('谱面状态 (Categories)', 'Status')}</label>
          <SelectField
            value={filters.status || 'leaderboard'}
            onChange={(val) => update({ status: val as SearchStatus }, true)}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">{t('排序方式 (Sort)', 'Sort')}</label>
          <div className="flex min-w-0 items-center gap-1">
            <SelectField
              value={sortField}
              onChange={(val) => update({ sort: `${val}:${sortDir || 'desc'}` }, true)}
              className="flex-1"
            >
              {sortFields.map((s) => (
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
              title={
                sortDir === 'asc'
                  ? t('当前升序，点击切换降序', 'Ascending — click for descending')
                  : t('当前降序，点击切换升序', 'Descending — click for ascending')
              }
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
          <label className="field-label">{t('本地查重过滤', 'Library Filter')}</label>
          <SelectField
            value={filters.installedFilter || 'all'}
            onChange={(val) => update({ installedFilter: val as InstalledFilter }, true)}
          >
            <option value="all">{t('显示全部谱面', 'Show All')}</option>
            <option value="hide_lazer">{t('隐藏 Lazer 已有', 'Hide In Lazer')}</option>
            <option value="hide_stable">{t('隐藏 Stable 已有', 'Hide In Stable')}</option>
            <option value="hide_any">{t('仅看双端均未装', 'Not Installed')}</option>
          </SelectField>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="field-label">{t('搜索引擎来源', 'Search Engine')}</label>
          <SelectField
            value={filters.source || 'auto'}
            onChange={(val) => update({ source: val as SearchSource }, true)}
          >
            <option value="auto">{t('自动 (osu.direct + 故障转移)', 'Auto (osu.direct + Failover)')}</option>
            <option value="osudirect">{t('osu.direct 全量筛选', 'osu.direct (Full Filters)')}</option>
            <option value="sayobot">{t('小夜镜像 (国内直连)', 'Sayobot Mirror')}</option>
          </SelectField>
        </div>
      </div>

      {/* Row 3: Lazer Star Range Slider + Scenario PP Range Slider */}
      <div className="mt-2 grid grid-cols-1 gap-2 border-t border-hairline pt-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.22fr)]">
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
                title={t(
                  `当前 PP 筛选情景: ${ppScenarioLabel}（点击配置 DT/HT/准度/黄彩比/Miss）`,
                  `PP Scenario: ${ppScenarioLabel} (click to configure Rate/Acc/MA/Miss)`,
                )}
                className={`btn btn-sm min-h-[26px] max-w-[152px] shrink-0 px-2 text-[0.71875rem] 2xl:max-w-[210px] ${
                  ppPopoverOpen || ppScenarioCustomized
                    ? 'border-lazer/50 bg-lazer/14 text-lazer-soft'
                    : ''
                }`}
              >
                <Calculator className="h-3 w-3 shrink-0" />
                <span className="truncate">{ppScenarioLabel}</span>
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
            <div
              style={{
                maxHeight: `${popoverPos.maxHeight}px`,
                maxWidth: `${popoverPos.maxWidth}px`,
              }}
              className={`panel-flat animate-fade-in absolute right-0 z-40 w-[min(94vw,560px)] space-y-2.5 overflow-y-auto overscroll-contain rounded-[14px] border border-hairline-strong bg-surface-2 p-3 shadow-2xl ${
                popoverPos.openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5 text-lazer-soft" />
                  <span className="font-display text-[0.84375rem] font-bold text-ink">
                    {t('PP 筛选范围与情景设定', 'PP Range & Scenario')}
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
                  {t('重置情景', 'Reset')}
                </button>
              </div>

              {/* Quick PP Range Presets */}
              <div className="space-y-1.5">
                <span className="field-label block">{t('常用 PP 区间', 'Quick PP Ranges')}</span>
                <div className="flex flex-wrap gap-1">
                  {ppRangePresets.map((p) => {
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

              {/* Master-Detail Scenario Library (Left Primary Mode Rail / Right Secondary Presets) */}
              <div className="space-y-1.5 border-t border-hairline pt-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="field-label">{t('情景预设库', 'Scenario Presets')}</span>
                  <span className="text-[0.6875rem] text-ink-3">
                    {t('左侧选主模式 · 右侧选副词条', 'Mode on left · Presets on right')}
                  </span>
                </div>
                <PpScenarioLibrary
                  variant="compact"
                  scenarioTab={scenarioTab}
                  onChangeTab={setScenarioTab}
                  currentScenario={ppScenario}
                  savedScenarios={savedScenarios}
                  onApplyPatch={(patch) => update(patch, hasPpFilter)}
                  onDeleteSaved={(id) => setSavedScenarios(deleteSavedPpScenario(id))}
                />
              </div>

              {/* Custom Scenario Parameters */}
              <div className="space-y-2.5 border-t border-hairline pt-2.5">
                {/* Rate / Mode */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[0.71875rem]">
                    <span className="font-semibold text-ink-2">
                      {t('模式与倍速 (HT / NM / DT)', 'Rate / Speed (HT / NM / DT)')}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={ppScenario.rate}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) {
                            update({
                              ppRate: Math.min(2, Math.max(0.5, Math.round(v * 100) / 100)),
                            });
                          }
                        }}
                        aria-label={t('筛选倍速数值', 'Filter rate value')}
                        className="field font-mono min-h-[24px] w-16 px-1.5 py-0 text-right text-[0.75rem]"
                      />
                      <span className="font-mono text-ink-3">x</span>
                    </div>
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
                    aria-label={t('筛选倍速滑块', 'Filter rate slider')}
                  />
                  <div className="flex flex-wrap gap-1">
                    {PP_RATE_QUICK_CHIPS.map((c) => {
                      const active = Math.abs(ppScenario.rate - c.value) < 0.01;
                      const activeCls =
                        Math.abs(c.value - 0.75) < 0.01
                          ? 'border-stable/60 bg-stable/16 text-stable-soft'
                          : Math.abs(c.value - 1) < 0.01
                            ? 'border-lazer/60 bg-lazer/18 text-lazer-soft'
                            : Math.abs(c.value - 1.5) < 0.01
                              ? 'border-osu/60 bg-osu/16 text-osu-soft'
                              : 'border-amber-500/60 bg-amber-500/16 text-warn';
                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => update({ ppRate: c.value })}
                          className={`btn btn-sm font-stat min-h-[22px] px-1.5 text-[0.6875rem] ${
                            active ? activeCls : ''
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accuracy */}
                <div className="space-y-1.5 border-t border-hairline/60 pt-2">
                  <div className="flex items-center justify-between gap-2 text-[0.71875rem]">
                    <span className="font-semibold text-ink-2">{t('准度 (Accuracy)', 'Accuracy')}</span>
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
                        aria-label={t('筛选准度数值', 'Filter accuracy value')}
                        className="field font-mono min-h-[24px] w-16 px-1.5 py-0 text-right text-[0.75rem]"
                      />
                      <span className="font-mono text-ink-3">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={100}
                    step={0.1}
                    value={Math.max(80, Math.min(100, ppScenario.accuracy))}
                    onChange={(e) => update({ ppAccuracy: Number(e.target.value) })}
                    style={
                      {
                        '--fill': `${Math.min(100, Math.max(0, ((ppScenario.accuracy - 80) / 20) * 100))}%`,
                      } as CSSProperties
                    }
                    className="slim-range w-full"
                    aria-label={t('筛选准度滑块', 'Filter accuracy slider')}
                  />
                  <div className="flex flex-wrap gap-1">
                    {PP_ACC_QUICK_CHIPS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => update({ ppAccuracy: c.value })}
                        className={`btn btn-sm font-stat min-h-[22px] px-1.5 text-[0.6875rem] ${
                          Math.abs(ppScenario.accuracy - c.value) < 0.05
                            ? 'border-osu/60 bg-osu/15 text-osu-soft'
                            : ''
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom MA Ratio */}
                <div className="space-y-1.5 border-t border-hairline/60 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[0.71875rem]">
                    <div className="min-w-0">
                      <span className="font-semibold text-ink-2">
                        {t('黄彩比 (彩300 : 黄300)', 'MA Ratio (320 : 300)')}
                      </span>
                      <span className="font-mono ml-1.5 text-[0.6875rem] text-ink-3 tabular-nums">
                        {maLiveReadout}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={0.1}
                        value={ppScenario.maRatio !== null ? ppScenario.maRatio : ''}
                        placeholder={t('直算', 'Direct')}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === '') {
                            update({ ppMaRatio: undefined });
                            return;
                          }
                          const v = Number(raw);
                          if (Number.isFinite(v)) {
                            update({
                              ppMaRatio: Math.min(999, Math.max(0, Math.round(v * 100) / 100)),
                            });
                          }
                        }}
                        aria-label={t('筛选黄彩比数值', 'Filter MA ratio value')}
                        className="field font-mono min-h-[24px] w-16 px-1.5 py-0 text-right text-[0.75rem]"
                      />
                      <span className="font-mono text-ink-3">: 1</span>
                      {ppScenario.maRatio !== null && (
                        <button
                          type="button"
                          onClick={() => update({ ppMaRatio: undefined })}
                          className="btn btn-sm min-h-[22px] px-1.5 text-[0.6875rem] text-ink-3"
                        >
                          {t('直算', 'Direct')}
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
                    aria-label={t('筛选黄彩比滑块', 'Filter MA ratio slider')}
                  />
                  <div className="flex flex-wrap gap-1">
                    {ppMaQuickChips.map((c) => {
                      const active =
                        c.value === undefined
                          ? ppScenario.maRatio === null
                          : ppScenario.maRatio !== null && Math.abs(ppScenario.maRatio - c.value) < 0.05;
                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => update({ ppMaRatio: c.value })}
                          className={`btn btn-sm font-mono min-h-[22px] px-1.5 text-[0.6875rem] ${
                            active ? 'border-lazer/60 bg-lazer/18 text-lazer-soft' : ''
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Misses & Mods */}
                <div className="space-y-1.5 border-t border-hairline/60 pt-2">
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
                        aria-label={t('筛选失误数', 'Filter miss count')}
                        className="field font-mono min-h-[24px] w-14 px-1.5 py-0 text-center text-[0.75rem]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => update({ ppClassic: !ppScenario.mods.classic })}
                        title={t('Classic / Stable 300 制准度与单次 LN 判定 vs Lazer 305 制与 LN 头尾双判', 'Classic / Stable (300-base + 1x LN) vs Lazer (305-base + LN head/tail)')}
                        className={`btn btn-sm min-h-[24px] px-2 text-[0.71875rem] ${
                          ppScenario.mods.classic
                            ? 'border-stable/60 bg-stable/16 text-stable-soft'
                            : 'border-lazer/45 bg-lazer/12 text-lazer-soft'
                        }`}
                      >
                        {ppScenario.mods.classic ? 'Classic (300)' : 'Lazer (305)'}
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
                  <div className="flex flex-wrap gap-1">
                    {PP_MISS_QUICK_CHIPS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => update({ ppMisses: m })}
                        className={`btn btn-sm font-mono min-h-[22px] px-1.5 text-[0.6875rem] ${
                          ppScenario.misses === m
                            ? 'border-osu/60 bg-osu/15 text-osu-soft'
                            : ''
                        }`}
                      >
                        {m}M
                      </button>
                    ))}
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
                  <span>{t('含未上架谱面（按模拟上架 PP 筛选）', 'Include unranked maps (If Ranked PP)')}</span>
                </label>

                {/* Save Current Scenario Bar */}
                <div className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-surface-1/65 p-2">
                  <input
                    type="text"
                    maxLength={48}
                    value={customScenarioName}
                    onChange={(e) => setCustomScenarioName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const { list } = saveCustomPpScenario(ppScenario, customScenarioName);
                        setSavedScenarios(list);
                        setCustomScenarioName('');
                        setScenarioTab('custom');
                      }
                    }}
                    placeholder={t('保存当前组合名称（留空自动生成）', 'Custom scenario name (auto if blank)')}
                    aria-label={t('自定义 PP 情景名称', 'Custom PP scenario name')}
                    className="field min-h-[26px] flex-1 px-2 py-0.5 text-[0.75rem]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const { list } = saveCustomPpScenario(ppScenario, customScenarioName);
                      setSavedScenarios(list);
                      setCustomScenarioName('');
                      setScenarioTab('custom');
                    }}
                    className="btn btn-sm min-h-[26px] shrink-0 border-lazer/45 bg-lazer/14 px-2.5 text-[0.71875rem] text-lazer-soft hover:bg-lazer/22"
                  >
                    <BookmarkPlus className="h-3 w-3 shrink-0" />
                    <span>+ {t('存为自定义', 'Save Preset')}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
                <span className="text-[0.6875rem] text-ink-3">
                  {t('自动推算星数区间并精确过滤', 'Auto-estimates star range & filters precisely')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onSearch();
                    setPpPopoverOpen(false);
                  }}
                  className="btn btn-primary btn-sm px-3.5"
                >
                  {t('应用并筛选', 'Apply & Search')}
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
              <label className="field-label">{t('曲风 (Genre)', 'Genre')}</label>
              <SelectField
                value={filters.genre ?? 0}
                onChange={(val) => update({ genre: Number(val) || undefined })}
              >
                {osuGenres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">{t('语言 (Language)', 'Language')}</label>
              <SelectField
                value={filters.language ?? 0}
                onChange={(val) => update({ language: Number(val) || undefined })}
              >
                {osuLanguages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">{t('谱师 (Mapper / Creator)', 'Mapper / Creator')}</label>
              <input
                type="text"
                value={filters.creator || ''}
                placeholder={t('精确匹配谱师 ID 名', 'Exact mapper username')}
                onChange={(e) => update({ creator: e.target.value || undefined })}
                className="field"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <label className="field-label">{t('LN 长条占比速选 (4K)', 'LN Ratio Quick Pick (4K)')}</label>
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
              label={t('时长 (秒)', 'Length (s)')}
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
              label={t('AR (其他模式)', 'AR (Other Modes)')}
              minVal={filters.minAr}
              maxVal={filters.maxAr}
              step="0.5"
              minPlaceholder="0"
              maxPlaceholder="10"
              onChangeMin={(v) => update({ minAr: v })}
              onChangeMax={(v) => update({ maxAr: v })}
            />
            <RangeInput
              label={t('LN 面率 (%)', 'LN Ratio (%)')}
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
                <span>{t('含背景视频 (Has Video)', 'Has Video')}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.storyboard)}
                  onChange={(e) => update({ storyboard: e.target.checked || undefined })}
                  className="check"
                />
                <span>{t('含故事板 (Has Storyboard)', 'Has Storyboard')}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.featured)}
                  onChange={(e) => update({ featured: e.target.checked || undefined })}
                  className="check"
                />
                <span>{t('精选艺术家 (Featured Artists)', 'Featured Artists')}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.spotlight)}
                  onChange={(e) => update({ spotlight: e.target.checked || undefined })}
                  className="check"
                />
                <span>{t('官方精选集 (Spotlight)', 'Spotlight')}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.includeConverts)}
                  onChange={(e) => update({ includeConverts: e.target.checked || undefined })}
                  className="check"
                />
                <span>{t('包含转谱 (Converts)', 'Include Converts')}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(filters.nsfw)}
                  onChange={(e) => update({ nsfw: e.target.checked })}
                  className="check"
                />
                <span>{t('包含成人内容 (Explicit/NSFW)', 'Explicit / NSFW')}</span>
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
              {t('应用高级筛选', 'Apply Filters')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
