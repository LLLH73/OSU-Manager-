import { useMemo } from 'react';
import { BookmarkPlus, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  PpCategoryTone,
  PpScenarioCategory,
  PpScenarioInput,
  PpScenarioPatch,
  SavedPpScenario,
  formatPpScenarioShort,
  getPpScenarioCategoryMeta,
  getPpScenarioPresets,
  inferScenarioCategory,
  matchesScenarioPatch,
} from '../utils/pp';

interface PpScenarioLibraryProps {
  scenarioTab: PpScenarioCategory;
  onChangeTab: (tab: PpScenarioCategory) => void;
  currentScenario: Partial<PpScenarioInput>;
  savedScenarios: SavedPpScenario[];
  onApplyPatch: (patch: PpScenarioPatch) => void;
  onDeleteSaved: (id: string) => void;
  /** Optional inline save footer (used inside PpCalculatorPanel) */
  customName?: string;
  onCustomNameChange?: (name: string) => void;
  onSaveCustom?: () => void;
  variant?: 'compact' | 'wide';
}

const CATEGORY_ORDER: PpScenarioCategory[] = ['nm', 'dt', 'ht', 'rate', 'custom'];

const TONE_CLASSES: Record<
  PpCategoryTone,
  {
    railBar: string;
    dot: string;
    badge: string;
    tileActive: string;
    tileHover: string;
  }
> = {
  lazer: {
    railBar: 'bg-lazer',
    dot: 'bg-lazer',
    badge: 'border-lazer/40 bg-lazer/14 text-lazer-soft',
    tileActive: 'border-lazer/60 bg-lazer/14 text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-lazer)_28%,transparent)]',
    tileHover: 'hover:border-lazer/40 hover:bg-lazer/8',
  },
  osu: {
    railBar: 'bg-osu',
    dot: 'bg-osu',
    badge: 'border-osu/40 bg-osu/14 text-osu-soft',
    tileActive: 'border-osu/60 bg-osu/14 text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-osu)_28%,transparent)]',
    tileHover: 'hover:border-osu/40 hover:bg-osu/8',
  },
  stable: {
    railBar: 'bg-stable',
    dot: 'bg-stable',
    badge: 'border-stable/40 bg-stable/14 text-stable-soft',
    tileActive: 'border-stable/60 bg-stable/14 text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-stable)_28%,transparent)]',
    tileHover: 'hover:border-stable/40 hover:bg-stable/8',
  },
  warn: {
    railBar: 'bg-amber-500',
    dot: 'bg-amber-500',
    badge: 'border-amber-500/40 bg-amber-500/14 text-warn',
    tileActive: 'border-amber-500/60 bg-amber-500/14 text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--t-warn)_28%,transparent)]',
    tileHover: 'hover:border-amber-500/40 hover:bg-amber-500/8',
  },
};

export function PpScenarioLibrary({
  scenarioTab,
  onChangeTab,
  currentScenario,
  savedScenarios,
  onApplyPatch,
  onDeleteSaved,
  customName = '',
  onCustomNameChange,
  onSaveCustom,
  variant = 'compact',
}: PpScenarioLibraryProps) {
  const { lang, t } = useI18n();
  const categoryMeta = useMemo(() => getPpScenarioCategoryMeta(lang), [lang]);
  const presets = useMemo(() => getPpScenarioPresets(lang), [lang]);
  const activeModeCategory = inferScenarioCategory(currentScenario);
  const matchedSaved = savedScenarios.some((s) => matchesScenarioPatch(currentScenario, s.patch));
  const activeMeta = categoryMeta[scenarioTab];
  const activeTone = TONE_CLASSES[activeMeta.tone];
  const tabPresets =
    scenarioTab === 'custom'
      ? []
      : presets.filter((preset) => preset.category === scenarioTab);

  return (
    <div
      className={`grid overflow-hidden rounded-[12px] border border-hairline bg-surface-1/50 ${
        variant === 'wide'
          ? 'grid-cols-[118px_minmax(0,1fr)] sm:grid-cols-[140px_minmax(0,1fr)]'
          : 'grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[124px_minmax(0,1fr)]'
      }`}
    >
      {/* Left Primary Mode Rail */}
      <div
        role="tablist"
        aria-label={t('PP 主情景模式分类', 'PP scenario mode categories')}
        aria-orientation="vertical"
        className="flex flex-col gap-1 border-r border-hairline bg-surface-1/85 p-1.5"
      >
        <span className="overline px-1.5 pt-0.5 pb-1 text-[0.625rem]">
          {t('主模式分类', 'Mode Category')}
        </span>
        {CATEGORY_ORDER.map((cat) => {
          const meta = categoryMeta[cat];
          const tone = TONE_CLASSES[meta.tone];
          const selected = scenarioTab === cat;
          const isCurrentActive =
            cat === 'custom' ? matchedSaved : !matchedSaved && activeModeCategory === cat;
          const subtitleText =
            cat === 'custom'
              ? t(`已存 ${savedScenarios.length} 组`, `${savedScenarios.length} saved`)
              : meta.subtitle;

          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChangeTab(cat)}
              className={`group relative flex items-center gap-2 rounded-[8px] border py-1.5 pr-1.5 pl-2 text-left transition-all ${
                selected
                  ? 'border-hairline-strong/80 bg-surface-2 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'border-transparent text-ink-2 hover:bg-tint hover:text-ink'
              }`}
            >
              {/* Left 3px vertical mode accent bar */}
              <span
                aria-hidden="true"
                className={`h-6 w-[3px] shrink-0 rounded-full transition-colors ${
                  selected ? tone.railBar : 'bg-transparent group-hover:bg-hairline-strong'
                }`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-stat truncate text-[0.8125rem] leading-tight font-bold">
                    {meta.code}
                  </span>
                  {isCurrentActive && (
                    <span
                      title={t('当前正应用此主模式的参数', 'Currently using this mode')}
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                    />
                  )}
                </div>
                <div className="truncate text-[0.65625rem] leading-tight font-medium text-ink-3">
                  {subtitleText}
                </div>
              </div>

              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 transition-all ${
                  selected
                    ? 'translate-x-0 text-ink-2 opacity-100'
                    : '-translate-x-1 text-ink-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-60'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Right Secondary Presets Detail Pane */}
      <div className="flex min-w-0 flex-col gap-2 bg-surface-2/85 p-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-hairline/70 pb-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`font-stat inline-flex shrink-0 items-center rounded-[5px] border px-1.5 py-0.5 text-[0.6875rem] font-bold ${activeTone.badge}`}
            >
              {activeMeta.label}
            </span>
            <span className="truncate text-[0.71875rem] font-medium text-ink-3">
              {scenarioTab === 'custom'
                ? t('已保存组合列表', 'Saved scenarios')
                : t(`${activeMeta.subtitle} · 副词条预设`, `${activeMeta.subtitle} · Presets`)}
            </span>
          </div>
          <span className="font-mono shrink-0 text-[0.6875rem] font-semibold text-ink-3 tabular-nums">
            {scenarioTab === 'custom'
              ? t(`${savedScenarios.length} 组`, `${savedScenarios.length}`)
              : t(`${tabPresets.length} 组`, `${tabPresets.length}`)}
          </span>
        </div>

        {scenarioTab !== 'custom' ? (
          <div
            className={`grid gap-1.5 ${
              variant === 'wide' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {tabPresets.map((preset) => {
              const active = matchesScenarioPatch(currentScenario, preset.patch);
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.desc}
                  onClick={() => onApplyPatch(preset.patch)}
                  className={`flex min-w-0 items-center justify-between gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-left transition-colors ${
                    active
                      ? activeTone.tileActive
                      : `border-hairline bg-surface-1/75 text-ink-2 ${activeTone.tileHover} hover:text-ink`
                  }`}
                >
                  <span className="font-stat shrink-0 text-[0.78125rem] font-bold text-ink tabular-nums">
                    {preset.primaryText}
                  </span>
                  <span className="font-mono truncate text-right text-[0.65625rem] font-medium text-ink-3 tabular-nums">
                    {preset.secondaryText}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-between gap-2">
            {savedScenarios.length === 0 ? (
              <p className="rounded-[9px] border border-dashed border-hairline px-2.5 py-3 text-[0.71875rem] leading-relaxed text-ink-3">
                {t(
                  '尚未保存自定义情景 — 可调整下方倍速、准度、黄彩比与 Miss 后输入名称存为自定义组合。',
                  'No saved custom scenarios — adjust Rate, Accuracy, MA ratio & Miss below, then enter a name to save.',
                )}
              </p>
            ) : (
              <div
                className={`grid gap-1.5 ${
                  variant === 'wide' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
                }`}
              >
                {savedScenarios.map((item) => {
                  const active = matchesScenarioPatch(currentScenario, item.patch);
                  const shortSummary = formatPpScenarioShort(
                    {
                      accuracy: item.patch.ppAccuracy,
                      rate: item.patch.ppRate,
                      misses: item.patch.ppMisses,
                      maRatio: item.patch.ppMaRatio ?? null,
                      mods: {
                        classic: item.patch.ppClassic,
                        ez: item.patch.ppEz,
                        nf: item.patch.ppNf,
                      },
                    },
                    lang,
                  );
                  return (
                    <div
                      key={item.id}
                      className={`flex min-w-0 items-stretch rounded-[8px] border transition-colors ${
                        active
                          ? activeTone.tileActive
                          : 'border-hairline bg-surface-1/75 text-ink-2 hover:border-hairline-strong'
                      }`}
                    >
                      <button
                        type="button"
                        title={t(`应用情景 (${shortSummary})`, `Apply scenario (${shortSummary})`)}
                        onClick={() => onApplyPatch(item.patch)}
                        className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-1.5 text-left"
                      >
                        <span className="font-stat truncate text-[0.75rem] leading-tight font-bold text-ink">
                          {item.name}
                        </span>
                        <span className="font-mono mt-0.5 truncate text-[0.65625rem] font-medium text-ink-3 tabular-nums">
                          {shortSummary}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={t('删除该自定义情景', 'Delete custom scenario')}
                        aria-label={t(`删除自定义情景 ${item.name}`, `Delete scenario ${item.name}`)}
                        onClick={() => onDeleteSaved(item.id)}
                        className="flex w-6 shrink-0 items-center justify-center rounded-r-[8px] border-l border-hairline/70 text-ink-3 transition-colors hover:bg-bad/15 hover:text-bad"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {onSaveCustom && (
              <div className="flex items-center gap-1.5 border-t border-hairline/70 pt-2">
                <input
                  type="text"
                  maxLength={48}
                  value={customName}
                  onChange={(e) => onCustomNameChange?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSaveCustom();
                    }
                  }}
                  placeholder={t(
                    '情景名称（留空自动命名，如 DT 96.5%·2:1·3M）',
                    'Scenario name (auto if blank, e.g. DT 96.5%·2:1·3M)',
                  )}
                  aria-label={t('保存计算器情景名称', 'Custom scenario name')}
                  className="field min-h-[26px] flex-1 px-2 py-0.5 text-[0.75rem]"
                />
                <button
                  type="button"
                  onClick={onSaveCustom}
                  className="btn btn-sm min-h-[26px] shrink-0 border-lazer/45 bg-lazer/14 px-2.5 text-[0.71875rem] text-lazer-soft hover:bg-lazer/22"
                >
                  <BookmarkPlus className="h-3 w-3" />
                  <span>+ {t('存为自定义', 'Save Custom')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
