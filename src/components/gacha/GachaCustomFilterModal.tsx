import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check, Filter, RotateCcw, Sparkles, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { FilterArchive, SearchFilters, SearchStatus } from '../../types';
import { SelectField } from '../SelectField';

interface GachaCustomFilterModalProps {
  initialFilters: SearchFilters;
  browseFilters: SearchFilters;
  filterArchives: FilterArchive[];
  isDark: boolean;
  onApply: (next: SearchFilters) => void;
  onClose: () => void;
}

const KEY_CHOICES = ['', '4', '5', '6', '7', '8', '9', '10'] as const;

const STATUS_CHOICES: Array<{ value: SearchStatus; labelZh: string; labelEn: string }> = [
  { value: 'any', labelZh: '全部状态', labelEn: 'Any Status' },
  { value: 'ranked', labelZh: 'Ranked 已上架', labelEn: 'Ranked' },
  { value: 'loved', labelZh: 'Loved 社区精选', labelEn: 'Loved' },
  { value: 'qualified', labelZh: 'Qualified 过审中', labelEn: 'Qualified' },
  { value: 'pending', labelZh: 'Pending / WIP', labelEn: 'Pending' },
  { value: 'graveyard', labelZh: 'Graveyard 坟场', labelEn: 'Graveyard' },
];

function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function GachaCustomFilterModal({
  initialFilters,
  browseFilters,
  filterArchives,
  isDark,
  onApply,
  onClose,
}: GachaCustomFilterModalProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<SearchFilters>(() => ({
    mode: '3',
    keys: initialFilters.keys ?? '',
    status: initialFilters.status ?? 'any',
    q: initialFilters.q ?? '',
    minStars: initialFilters.minStars,
    maxStars: initialFilters.maxStars,
    minBpm: initialFilters.minBpm,
    maxBpm: initialFilters.maxBpm,
    minLn: initialFilters.minLn,
    maxLn: initialFilters.maxLn,
    minLength: initialFilters.minLength,
    maxLength: initialFilters.maxLength,
  }));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const syncBrowse = () => {
    setDraft({
      mode: '3',
      q: browseFilters.q ?? '',
      keys: browseFilters.keys ?? '',
      status: browseFilters.status ?? 'any',
      minStars: browseFilters.minStars,
      maxStars: browseFilters.maxStars,
      minBpm: browseFilters.minBpm,
      maxBpm: browseFilters.maxBpm,
      minLn: browseFilters.minLn,
      maxLn: browseFilters.maxLn,
      minLength: browseFilters.minLength,
      maxLength: browseFilters.maxLength,
    });
  };

  const resetDraft = () => {
    setDraft({
      mode: '3',
      q: '',
      keys: '',
      status: 'any',
    });
  };

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('条件自选池配置', 'Custom Filter Pool Settings')}
      data-dark={isDark ? 'true' : 'false'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backgroundColor: isDark ? 'rgba(7, 10, 18, 0.78)' : 'rgba(18, 24, 38, 0.45)',
      }}
      className="gacha-atelier fixed inset-0 z-[48] flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[3px] border border-[var(--ga-line-strong)] bg-[var(--ga-paper)] text-[var(--ga-ink)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--ga-line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--ga-cobalt)]" />
            <div>
              <div className="ga-mono text-[0.625rem] font-bold tracking-[0.16em] text-[var(--ga-cobalt)] uppercase">
                POOL 07 // CUSTOM FILTER RULES
              </div>
              <h3 className="ga-cn-serif text-[1rem] font-bold text-[var(--ga-ink)]">
                {t('条件自选池筛选设置', 'Custom Filter Pool Criteria')}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ga-line-btn h-8 w-8 p-0"
            title={t('关闭 (Esc)', 'Close (Esc)')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sync & Archive Quick Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ga-line)] bg-[var(--ga-panel)] px-4 py-2">
          <button
            type="button"
            onClick={syncBrowse}
            className="ga-line-btn h-7 px-2.5 text-[0.71875rem]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--ga-cobalt)]" />
            <span>{t('同步主搜图条件', 'Sync Browse Filters')}</span>
          </button>

          {filterArchives.length > 0 && (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 shrink-0 text-[var(--ga-ink-3)]" />
              <SelectField
                value=""
                onChange={(archiveId) => {
                  const found = filterArchives.find((a) => a.id === archiveId);
                  if (!found) return;
                  const f = found.filters;
                  setDraft({
                    mode: '3',
                    q: f.q ?? '',
                    keys: f.keys ?? '',
                    status: f.status ?? 'any',
                    minStars: f.minStars,
                    maxStars: f.maxStars,
                    minBpm: f.minBpm,
                    maxBpm: f.maxBpm,
                    minLn: f.minLn,
                    maxLn: f.maxLn,
                    minLength: f.minLength,
                    maxLength: f.maxLength,
                  });
                }}
                className="h-7 flex-1 text-[0.71875rem]"
                aria-label={t('导入筛选存档', 'Import filter archive')}
              >
                <option value="">{t('从筛选存档导入…', 'Import Filter Archive…')}</option>
                {filterArchives.map((ar) => (
                  <option key={ar.id} value={ar.id}>
                    {ar.name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}

          <button
            type="button"
            onClick={resetDraft}
            className="ga-line-btn ml-auto h-7 px-2.5 text-[0.71875rem]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('清空', 'Reset')}</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5 text-[0.78125rem]">
          {/* Keyword + Keys + Status */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1 sm:col-span-3">
              <span className="ga-mono block text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
                {t('关键词 / 曲师 / 谱师', 'Keyword / Artist / Mapper')}
              </span>
              <input
                type="text"
                value={draft.q ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
                placeholder={t('例如：Camellia / chordjack / anime…', 'e.g. Camellia, stream, tech…')}
                className="h-8 w-full rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2.5 text-[0.78125rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
              />
            </label>

            <label className="space-y-1">
              <span className="ga-mono block text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
                {t('键数 (Keys)', 'Key Count')}
              </span>
              <SelectField
                value={draft.keys ?? ''}
                onChange={(v) => setDraft((prev) => ({ ...prev, keys: v }))}
                className="h-8 w-full text-[0.78125rem]"
              >
                {KEY_CHOICES.map((k) => (
                  <option key={k || 'all'} value={k}>
                    {k ? `${k}K` : t('全部键数', 'All Keys')}
                  </option>
                ))}
              </SelectField>
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="ga-mono block text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
                {t('谱面状态 (Status)', 'Ranked Status')}
              </span>
              <SelectField
                value={draft.status ?? 'any'}
                onChange={(v) => setDraft((prev) => ({ ...prev, status: v as SearchStatus }))}
                className="h-8 w-full text-[0.78125rem]"
              >
                {STATUS_CHOICES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {t(st.labelZh, st.labelEn)}
                  </option>
                ))}
              </SelectField>
            </label>
          </div>

          {/* Star Rating */}
          <div className="space-y-1.5 border-t border-[var(--ga-line)] pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="ga-mono text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
                {t('星数范围 (SR ★)', 'Star Rating (★)')}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { label: '< 3.5★', min: undefined, max: 3.5 },
                  { label: '3.5–5.5★', min: 3.5, max: 5.5 },
                  { label: '5.5–7.5★', min: 5.5, max: 7.5 },
                  { label: '7.5★+', min: 7.5, max: undefined },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, minStars: p.min, maxStars: p.max }))
                    }
                    className="ga-line-btn h-5.5 px-1.5 font-mono text-[0.625rem]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="number"
                step="0.1"
                min="0"
                max="15"
                value={draft.minStars ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, minStars: parseOptionalNumber(e.target.value) }))
                }
                placeholder={t('最低星数 (如 3.5)', 'Min SR (e.g. 3.5)')}
                className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2.5 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                max="15"
                value={draft.maxStars ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, maxStars: parseOptionalNumber(e.target.value) }))
                }
                placeholder={t('最高星数 (如 6.5)', 'Max SR (e.g. 6.5)')}
                className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2.5 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
              />
            </div>
          </div>

          {/* LN% + BPM */}
          <div className="grid grid-cols-1 gap-3 border-t border-[var(--ga-line)] pt-2.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="ga-mono text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
                  {t('长条占比 (LN %)', 'LN Ratio (%)')}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, minLn: 0, maxLn: 18 }))}
                    className="ga-line-btn h-5 px-1.5 font-mono text-[0.59375rem]"
                  >
                    Rice
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, minLn: 42, maxLn: 100 }))}
                    className="ga-line-btn h-5 px-1.5 font-mono text-[0.59375rem]"
                  >
                    LN
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.minLn ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, minLn: parseOptionalNumber(e.target.value) }))
                  }
                  placeholder={t('最小 %', 'Min %')}
                  className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.maxLn ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, maxLn: parseOptionalNumber(e.target.value) }))
                  }
                  placeholder={t('最大 %', 'Max %')}
                  className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="ga-mono block text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
                BPM
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="20"
                  max="500"
                  value={draft.minBpm ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, minBpm: parseOptionalNumber(e.target.value) }))
                  }
                  placeholder={t('最低 BPM', 'Min BPM')}
                  className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
                />
                <input
                  type="number"
                  min="20"
                  max="500"
                  value={draft.maxBpm ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, maxBpm: parseOptionalNumber(e.target.value) }))
                  }
                  placeholder={t('最高 BPM', 'Max BPM')}
                  className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
                />
              </div>
            </div>
          </div>

          {/* Map Length (sec) */}
          <div className="space-y-1.5 border-t border-[var(--ga-line)] pt-2.5">
            <span className="ga-mono block text-[0.65625rem] font-bold tracking-wider text-[var(--ga-ink-2)] uppercase">
              {t('单曲时长（秒）', 'Song Length (sec)')}
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="number"
                min="0"
                max="3600"
                value={draft.minLength ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, minLength: parseOptionalNumber(e.target.value) }))
                }
                placeholder={t('最短秒数 (如 60)', 'Min sec (e.g. 60)')}
                className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2.5 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
              />
              <input
                type="number"
                min="0"
                max="3600"
                value={draft.maxLength ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, maxLength: parseOptionalNumber(e.target.value) }))
                }
                placeholder={t('最长秒数 (如 240)', 'Max sec (e.g. 240)')}
                className="h-8 rounded-[2px] border border-[var(--ga-line-strong)] bg-[var(--ga-bg)] px-2.5 font-mono text-[0.75rem] text-[var(--ga-ink)] outline-none focus:border-[var(--ga-cobalt)]"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--ga-line)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="ga-line-btn h-8 px-3 text-[0.78125rem]"
          >
            {t('取消', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="ga-solid-btn h-8 px-4 text-[0.78125rem]"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{t('应用条件到 07 自选池', 'Apply Custom Rules')}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
