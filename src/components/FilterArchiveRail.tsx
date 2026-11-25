import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  Check,
  Clock,
  Loader2,
  MapPin,
  Music,
  PanelRightClose,
  Pencil,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { FilterArchive, SearchFilters, SongViewMode } from '../types';
import {
  ArchiveSummaryTag,
  buildAutoArchiveName,
  formatArchiveTime,
  summarizeFilterArchive,
} from '../utils/filterArchive';

export interface CurrentBrowsePreview {
  id: number;
  title: string;
  artist: string;
  coverUrl?: string;
  index: number;
  totalLoaded: number;
  viewMode: SongViewMode;
}

interface FilterArchiveRailProps {
  archives: FilterArchive[];
  activeArchiveId: string | null;
  restoringArchiveId: string | null;
  currentFilters: SearchFilters;
  currentBrowsePreview: CurrentBrowsePreview | null;
  saveInputFocusNonce: number;
  onSaveNew: (payload: { name: string; savePosition: boolean }) => Promise<void>;
  onRestore: (archive: FilterArchive, options?: { ignorePosition?: boolean }) => void;
  onOverwrite: (archive: FilterArchive, savePosition: boolean) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onTogglePin: (archive: FilterArchive) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

function tagClass(tone?: ArchiveSummaryTag['tone']): string {
  switch (tone) {
    case 'osu':
      return 'border-osu/35 bg-osu/10 text-osu-soft';
    case 'lazer':
      return 'border-lazer/35 bg-lazer/12 text-lazer-soft';
    case 'stable':
      return 'border-stable/35 bg-stable/12 text-stable-soft';
    case 'warn':
      return 'border-amber-500/35 bg-amber-500/12 text-warn';
    default:
      return '';
  }
}

export function FilterArchiveRail({
  archives,
  activeArchiveId,
  restoringArchiveId,
  currentFilters,
  currentBrowsePreview,
  saveInputFocusNonce,
  onSaveNew,
  onRestore,
  onOverwrite,
  onRename,
  onTogglePin,
  onDelete,
  onClose,
}: FilterArchiveRailProps) {
  const { lang, t } = useI18n();
  const [nameInput, setNameInput] = useState('');
  const [savePosition, setSavePosition] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusNonceRef = useRef(0);

  useEffect(() => {
    if (saveInputFocusNonce > 0 && saveInputFocusNonce !== lastFocusNonceRef.current) {
      lastFocusNonceRef.current = saveInputFocusNonce;
      window.setTimeout(() => {
        if (nameInputRef.current && nameInputRef.current.getClientRects().length > 0) {
          nameInputRef.current.focus();
          nameInputRef.current.select();
        }
      }, 60);
    }
  }, [saveInputFocusNonce]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  const viewModeBadge: Record<SongViewMode, string> = useMemo(
    () => ({
      lazer: 'Lazer',
      list: t('列表', 'List'),
      grid: t('卡片', 'Grid'),
    }),
    [t],
  );
  const autoName = useMemo(() => buildAutoArchiveName(currentFilters, lang), [currentFilters, lang]);
  const currentSummary = useMemo(
    () => summarizeFilterArchive(currentFilters, lang),
    [currentFilters, lang],
  );
  const activeArchive = useMemo(
    () => archives.find((a) => a.id === activeArchiveId) ?? null,
    [archives, activeArchiveId],
  );

  const filteredArchives = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return archives;
    return archives.filter((a) => {
      if (a.name.toLowerCase().includes(q)) return true;
      if (a.filters.q && a.filters.q.toLowerCase().includes(q)) return true;
      if (a.browsePosition?.anchorTitle.toLowerCase().includes(q)) return true;
      if (a.browsePosition?.anchorArtist.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [archives, searchFilter]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveNew({
        name: nameInput.trim() || autoName,
        savePosition: savePosition && Boolean(currentBrowsePreview),
      });
      setNameInput('');
    } finally {
      setSaving(false);
    }
  };

  const handleCommitRename = async (id: string) => {
    const trimmed = editingName.trim();
    setEditingId(null);
    if (!trimmed) return;
    setBusyActionId(id);
    try {
      await onRename(id, trimmed);
    } finally {
      setBusyActionId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Bookmark className="h-4 w-4 shrink-0 text-osu" />
          <span className="font-display truncate text-[0.875rem] font-bold text-ink">
            {t('Filter 存档', 'Filter Archives')}
          </span>
          <span className="font-mono rounded-full border border-hairline bg-tint px-1.5 py-px text-[0.6875rem] font-semibold text-ink-3 tabular-nums">
            {archives.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title={t('收起 Filter 存档右侧栏', 'Close Filter Archives')}
          aria-label={t('收起 Filter 存档右侧栏', 'Close Filter Archives')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-tint-hover hover:text-ink"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Save Current Search State Card */}
      <div className="shrink-0 space-y-2 border-b border-hairline bg-surface-1/45 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="overline">{t('保存当前搜索状态', 'Save Current Search')}</span>
          {currentSummary.query && (
            <span className="font-mono max-w-[140px] truncate text-[0.6875rem] text-osu-soft">
              “{currentSummary.query}”
            </span>
          )}
        </div>

        <input
          ref={nameInputRef}
          type="text"
          maxLength={60}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSave();
            }
          }}
          placeholder={t(`名称（留空: ${autoName}）`, `Name (auto: ${autoName})`)}
          aria-label={t('Filter 存档名称', 'Archive name')}
          className="field min-h-[30px] px-2.5 py-1 text-[0.78125rem]"
        />

        {/* Current Filter Chips Preview */}
        <div className="flex flex-wrap items-center gap-1">
          {currentSummary.tags.slice(0, 4).map((t, idx) => (
            <span
              key={`${t.label}-${idx}`}
              className={`chip min-h-[18px] px-1.5 py-0 text-[0.65625rem] ${tagClass(t.tone)}`}
            >
              {t.label}
            </span>
          ))}
          {currentSummary.tags.length > 4 && (
            <span className="text-[0.65625rem] font-semibold text-ink-3">
              +{currentSummary.tags.length - 4}
            </span>
          )}
        </div>

        {/* Optional Browse Position Capture Toggle + Live Anchor Preview */}
        <div className="space-y-1.5 rounded-[9px] border border-hairline bg-surface-2/65 p-2">
          <label
            className={`flex items-center gap-2 text-[0.75rem] font-semibold ${
              currentBrowsePreview ? 'cursor-pointer text-ink-2' : 'cursor-not-allowed text-ink-4'
            }`}
          >
            <input
              type="checkbox"
              disabled={!currentBrowsePreview}
              checked={Boolean(currentBrowsePreview) && savePosition}
              onChange={(e) => setSavePosition(e.target.checked)}
              className="check"
            />
            <MapPin className="h-3.5 w-3.5 shrink-0 text-lazer-soft" />
            <span className="truncate">{t('保存当前浏览位置与上下文', 'Save browse position & context')}</span>
          </label>

          {currentBrowsePreview ? (
            savePosition ? (
              <div className="flex items-center gap-2 rounded-[7px] border border-hairline/70 bg-surface-1/80 px-2 py-1">
                {currentBrowsePreview.coverUrl ? (
                  <img
                    src={currentBrowsePreview.coverUrl}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-[5px] object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-surface-2 text-ink-4">
                    <Music className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.71875rem] leading-tight font-bold text-ink">
                    {currentBrowsePreview.title}
                  </div>
                  <div className="truncate text-[0.65625rem] leading-tight text-ink-3">
                    {currentBrowsePreview.artist}
                  </div>
                </div>
                <span className="font-mono shrink-0 rounded bg-tint px-1.5 py-0.5 text-[0.625rem] font-semibold text-ink-2 tabular-nums">
                  #{currentBrowsePreview.index + 1}/{currentBrowsePreview.totalLoaded}
                </span>
              </div>
            ) : (
              <p className="text-[0.6875rem] text-ink-3">
                {t(
                  '仅保存搜索词与筛选条件，恢复时将从第 1 页开始。',
                  'Saves query & filters only; restores from page 1.',
                )}
              </p>
            )
          ) : (
            <p className="text-[0.6875rem] text-ink-3">
              {t('当前无搜索结果，仅保存搜索词与筛选条件。', 'No active results; saves query & filters only.')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="btn btn-primary btn-sm min-h-[30px] flex-1 justify-center text-[0.75rem]"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            <span>{saving ? t('保存中…', 'Saving…') : t('保存当前状态', 'Save Current')}</span>
          </button>

          {activeArchive && (
            <button
              type="button"
              disabled={saving || busyActionId === activeArchive.id}
              title={t(
                `将当前搜索状态覆盖更新到「${activeArchive.name}」`,
                `Overwrite "${activeArchive.name}" with current state`,
              )}
              onClick={() => {
                setBusyActionId(activeArchive.id);
                void onOverwrite(
                  activeArchive,
                  savePosition && Boolean(currentBrowsePreview),
                ).finally(() => setBusyActionId(null));
              }}
              className="btn btn-sm min-h-[30px] shrink-0 px-2.5 text-[0.71875rem]"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t('覆盖当前', 'Overwrite')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Saved Archives Search Bar (when >= 4 archives) */}
      {archives.length >= 4 && (
        <div className="shrink-0 border-b border-hairline px-3.5 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('过滤存档名称、搜索词或曲名...', 'Filter archives by name, query, or song...')}
              aria-label={t('过滤已保存的 Filter 存档', 'Filter saved archives')}
              className="field min-h-[28px] pr-7 pl-8 text-[0.75rem]"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                aria-label={t('清空存档搜索', 'Clear archive search')}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-3 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Saved Archives List */}
      <div className="flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto px-3.5 py-2.5">
        {archives.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-hairline px-3 py-6 text-center">
            <Bookmark className="mx-auto mb-2 h-6 w-6 text-ink-4" />
            <p className="text-[0.8125rem] font-semibold text-ink-2">
              {t('暂无 Filter 存档', 'No Filter Archives Yet')}
            </p>
            <p className="mt-1 text-[0.71875rem] leading-relaxed text-ink-3">
              {t(
                '可将常用的搜索关键词、筛选参数与当前浏览的歌曲位置保存于此，随时一键跳转继续找图。',
                'Save your search query, filters, and scroll position here to jump back in anytime.',
              )}
            </p>
          </div>
        ) : filteredArchives.length === 0 ? (
          <p className="py-6 text-center text-[0.75rem] text-ink-3">
            {t('没有匹配的存档记录', 'No matching archives')}
          </p>
        ) : (
          filteredArchives.map((archive) => {
            const isActive = activeArchiveId === archive.id;
            const isRestoring = restoringArchiveId === archive.id;
            const isBusy = busyActionId === archive.id;
            const summary = summarizeFilterArchive(archive.filters, lang);
            const timeMeta = formatArchiveTime(archive.createdAt);
            const pos = archive.browsePosition;
            const isEditing = editingId === archive.id;
            const isConfirmingDelete = confirmDeleteId === archive.id;

            return (
              <article
                key={archive.id}
                className={`rounded-[12px] border p-2.5 transition-colors ${
                  isActive
                    ? 'border-osu/50 bg-surface-2 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.18)]'
                    : 'border-hairline bg-surface-1/65 hover:border-hairline-strong'
                }`}
              >
                {/* Top row: Title + Pin + Delete */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          maxLength={60}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleCommitRename(archive.id);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          className="field min-h-[24px] flex-1 px-1.5 py-0 text-[0.75rem]"
                          aria-label={t('编辑存档名称', 'Edit archive name')}
                        />
                        <button
                          type="button"
                          onClick={() => void handleCommitRename(archive.id)}
                          title={t('确认重命名', 'Confirm rename')}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-osu/40 bg-osu/12 text-osu-soft"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {isActive && (
                          <span
                            title={t('当前正在使用此存档', 'Currently active archive')}
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-osu"
                          />
                        )}
                        <h4
                          title={archive.name}
                          className="font-display truncate text-[0.8125rem] font-bold text-ink"
                        >
                          {archive.name}
                        </h4>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setBusyActionId(archive.id);
                        void onTogglePin(archive).finally(() => setBusyActionId(null));
                      }}
                      title={archive.pinned ? t('取消置顶', 'Unpin') : t('置顶该存档', 'Pin archive')}
                      aria-label={archive.pinned ? t('取消置顶', 'Unpin') : t('置顶', 'Pin')}
                      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                        archive.pinned
                          ? 'text-osu hover:bg-osu/12'
                          : 'text-ink-3 hover:bg-tint-hover hover:text-ink'
                      }`}
                    >
                      {archive.pinned ? (
                        <PinOff className="h-3 w-3" />
                      ) : (
                        <Pin className="h-3 w-3" />
                      )}
                    </button>

                    {isConfirmingDelete ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setBusyActionId(archive.id);
                          void onDelete(archive.id).finally(() => setBusyActionId(null));
                        }}
                        className="rounded border border-bad/50 bg-bad/15 px-1.5 py-0.5 text-[0.65625rem] font-bold text-bad"
                      >
                        {t('确认删', 'Confirm')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(archive.id)}
                        title={t('删除此存档', 'Delete archive')}
                        aria-label={t(`删除存档 ${archive.name}`, `Delete archive ${archive.name}`)}
                        className="flex h-6 w-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-bad/15 hover:text-bad"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Created Time Row */}
                <div
                  title={t(`创建于 ${timeMeta.full}`, `Created ${timeMeta.full}`)}
                  className="font-mono mt-1 flex items-center gap-1 text-[0.65625rem] font-medium text-ink-3 tabular-nums"
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{timeMeta.short}</span>
                  {archive.updatedAt - archive.createdAt > 5000 && (
                    <span className="text-ink-4">{t('· 已更新', '· Updated')}</span>
                  )}
                </div>

                {/* Search Box Content + Filter Chips */}
                <div className="mt-2 space-y-1.5">
                  {summary.query && (
                    <div className="flex items-center gap-1.5 rounded-[7px] border border-osu/30 bg-osu/8 px-2 py-1 text-[0.71875rem] font-semibold text-osu-soft">
                      <Search className="h-3 w-3 shrink-0" />
                      <span className="truncate">“{summary.query}”</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {summary.tags.map((tag, idx) => (
                      <span
                        key={`${tag.label}-${idx}`}
                        className={`chip min-h-[18px] px-1.5 py-0 text-[0.65625rem] ${tagClass(tag.tone)}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Saved Browse Position Card */}
                {pos && (
                  <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-lazer/25 bg-lazer/8 px-2 py-1.5">
                    {pos.anchorCoverUrl ? (
                      <img
                        src={pos.anchorCoverUrl}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-[4px] object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-surface-2 text-ink-4">
                        <MapPin className="h-3 w-3 text-lazer-soft" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.71875rem] leading-tight font-bold text-ink">
                        {pos.anchorTitle}
                      </div>
                      <div className="truncate text-[0.65625rem] leading-tight text-ink-3">
                        {pos.anchorArtist || `#${pos.anchorBeatmapsetId}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="font-mono text-[0.625rem] font-bold text-lazer-soft tabular-nums">
                        #{pos.anchorIndex + 1}
                      </span>
                      <span className="text-[0.59375rem] font-semibold text-ink-3">
                        {viewModeBadge[pos.viewMode]}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="mt-2 flex items-center gap-1 border-t border-hairline/70 pt-2">
                  {pos ? (
                    <>
                      <button
                        type="button"
                        disabled={isRestoring}
                        onClick={() => onRestore(archive)}
                        className="btn btn-sm btn-lazer min-h-[26px] flex-1 justify-center px-2 text-[0.71875rem]"
                      >
                        {isRestoring ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <MapPin className="h-3 w-3" />
                        )}
                        <span>{isRestoring ? t('定位中…', 'Locating…') : t('恢复并定位', 'Restore & Locate')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isRestoring}
                        title={t('仅恢复搜索词与筛选条件，从第 1 页开始搜索', 'Restore filters only & search from page 1')}
                        onClick={() => onRestore(archive, { ignorePosition: true })}
                        className="btn btn-sm min-h-[26px] shrink-0 px-2 text-[0.6875rem]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>{t('从头搜', 'From Top')}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isRestoring}
                      onClick={() => onRestore(archive, { ignorePosition: true })}
                      className="btn btn-sm btn-primary min-h-[26px] flex-1 justify-center px-2 text-[0.71875rem]"
                    >
                      {isRestoring ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                      <span>{t('应用此筛选', 'Apply Filters')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isBusy}
                    title={t('将当前筛选与位置覆盖保存到此存档', 'Overwrite this archive with current state')}
                    aria-label={t('覆盖更新存档', 'Overwrite archive')}
                    onClick={() => {
                      setBusyActionId(archive.id);
                      void onOverwrite(
                        archive,
                        savePosition && Boolean(currentBrowsePreview),
                      ).finally(() => setBusyActionId(null));
                    }}
                    className="btn btn-sm btn-icon min-h-[26px] w-[26px] shrink-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    title={t('重命名此存档', 'Rename archive')}
                    aria-label={t('重命名存档', 'Rename archive')}
                    onClick={() => {
                      setEditingId(archive.id);
                      setEditingName(archive.name);
                    }}
                    className="btn btn-sm btn-icon min-h-[26px] w-[26px] shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
