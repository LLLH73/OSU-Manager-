import { useMemo, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  FolderPlus,
  Heart,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { getStarColor } from '../../constants';
import { useI18n } from '../../i18n';
import type {
  DownloadTarget,
  DownloadTask,
  GachaCollectionsState,
  NormalizedBeatmapset,
} from '../../types';
import { getCardSummaryStats } from './gachaUtils';

interface GachaLikedDrawerProps {
  collections: GachaCollectionsState;
  activeTargetGroupId: string;
  target: DownloadTarget;
  activeTaskBySet: Map<number, DownloadTask>;
  playingSetId: number | null;
  isPlaying: boolean;
  onChangeTargetGroup: (groupId: string) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onClearGroup: (groupId: string) => Promise<void>;
  onSetEntryGroups: (setId: number, groupIds: string[]) => Promise<void>;
  onRemoveEntry: (setId: number, groupId?: string) => Promise<void>;
  onTogglePlaySet: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onBatchDownload: (sets: NormalizedBeatmapset[]) => void;
  onOpenDetail: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onNotify: (msg: string) => void;
  onClose: () => void;
}

export function GachaLikedDrawer({
  collections,
  activeTargetGroupId,
  target,
  activeTaskBySet,
  playingSetId,
  isPlaying,
  onChangeTargetGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onClearGroup,
  onSetEntryGroups,
  onRemoveEntry,
  onTogglePlaySet,
  onDownload,
  onBatchDownload,
  onOpenDetail,
  onNotify,
  onClose,
}: GachaLikedDrawerProps) {
  const { t } = useI18n();
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [assigningSetId, setAssigningSetId] = useState<number | null>(null);

  const effectiveSelectedId =
    selectedGroupId === 'all' || collections.groups.some((g) => g.id === selectedGroupId)
      ? selectedGroupId
      : 'all';

  const selectedGroup =
    effectiveSelectedId === 'all'
      ? null
      : (collections.groups.find((g) => g.id === effectiveSelectedId) ?? null);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of collections.groups) map.set(g.id, g.name);
    return map;
  }, [collections.groups]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of collections.groups) counts.set(g.id, 0);
    for (const entry of collections.entries) {
      for (const gid of entry.groupIds) {
        counts.set(gid, (counts.get(gid) || 0) + 1);
      }
    }
    return counts;
  }, [collections]);

  const visibleEntries = useMemo(() => {
    if (effectiveSelectedId === 'all') return collections.entries;
    return collections.entries.filter((e) => e.groupIds.includes(effectiveSelectedId));
  }, [collections.entries, effectiveSelectedId]);

  const handleCreateSubmit = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    await onCreateGroup(trimmed);
    setNewGroupName('');
    setCreatingGroup(false);
  };

  const handleRenameSubmit = async () => {
    if (!editingGroupId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    await onRenameGroup(editingGroupId, trimmed);
    setEditingGroupId(null);
    setRenameDraft('');
  };

  return (
    <aside
      aria-label={t('心动收藏曲库', 'Liked Collections Drawer')}
      className="animate-fade-in absolute top-3 right-3 bottom-3 z-30 flex w-[min(94vw,382px)] flex-col rounded-[3px] border border-[var(--ga-line-strong)] bg-[var(--ga-panel-strong)] shadow-2xl backdrop-blur-xl sm:right-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ga-line)] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 fill-current text-[var(--ga-cobalt)]" />
          <div>
            <div className="ga-mono text-[0.59375rem] tracking-[0.16em] text-[var(--ga-ink-3)] uppercase">
              PERSISTENT ARCHIVE // {String(collections.entries.length).padStart(2, '0')}
            </div>
            <span className="ga-cn-serif text-[0.875rem] font-bold text-[var(--ga-ink)]">
              {t(
                `心动曲库 (${collections.entries.length})`,
                `Liked Library (${collections.entries.length})`,
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {visibleEntries.length > 0 && (
            <button
              type="button"
              data-ga-cursor={t('批量下载', 'DL GROUP')}
              onClick={() => {
                onBatchDownload(visibleEntries.map((e) => e.beatmapset));
                onNotify(
                  t(
                    `已将「${selectedGroup?.name || '全部心动'}」共 ${visibleEntries.length} 首谱面加入下载队列`,
                    `Queued ${visibleEntries.length} maps from "${selectedGroup?.name || 'All Liked'}"`,
                  ),
                );
              }}
              className="ga-solid-btn h-7 px-2.5 text-[0.6875rem]"
            >
              <Download className="h-3 w-3" />
              <span>{t(`下载 (${visibleEntries.length})`, `Get (${visibleEntries.length})`)}</span>
            </button>
          )}
          <button
            type="button"
            data-ga-cursor={t('收起', 'CLOSE')}
            onClick={onClose}
            title={t('收起心动曲库', 'Collapse liked library')}
            className="ga-line-btn h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Group Tabs + Inline New Group */}
      <div className="space-y-1.5 border-b border-[var(--ga-line)] bg-[var(--ga-panel)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-active={effectiveSelectedId === 'all' ? 'true' : 'false'}
            onClick={() => setSelectedGroupId('all')}
            className="ga-line-btn h-6.5 px-2 text-[0.6875rem]"
          >
            <span>{t('全部', 'All')}</span>
            <span className="ga-mono text-[0.625rem] opacity-75">
              {collections.entries.length}
            </span>
          </button>

          {collections.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              data-active={effectiveSelectedId === g.id ? 'true' : 'false'}
              onClick={() => setSelectedGroupId(g.id)}
              className="ga-line-btn h-6.5 max-w-[140px] px-2 text-[0.6875rem]"
            >
              {activeTargetGroupId === g.id && (
                <Heart className="h-2.5 w-2.5 shrink-0 fill-current text-[var(--ga-cobalt)]" />
              )}
              <span className="truncate">{g.name}</span>
              <span className="ga-mono text-[0.625rem] opacity-75">
                {groupCounts.get(g.id) ?? 0}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              setCreatingGroup((v) => !v);
              setNewGroupName('');
            }}
            title={t('新建自定义分组', 'Create custom group')}
            className="ga-line-btn h-6.5 px-2 text-[0.6875rem]"
          >
            <Plus className="h-3 w-3" />
            <span>{t('新建', 'New')}</span>
          </button>
        </div>

        {creatingGroup && (
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateSubmit();
                if (e.key === 'Escape') setCreatingGroup(false);
              }}
              placeholder={t('输入分组名称（如：刷分精选）', 'Group name (e.g. PP Favorites)')}
              className="h-7 min-w-0 flex-1 rounded-[2px] border border-[var(--ga-cobalt)] bg-[var(--ga-bg)] px-2 text-[0.71875rem] text-[var(--ga-ink)] outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreateSubmit()}
              className="ga-solid-btn h-7 px-2.5 text-[0.6875rem]"
            >
              <Check className="h-3 w-3" />
              <span>{t('创建', 'Add')}</span>
            </button>
          </div>
        )}

        {/* Active Group Actions Strip */}
        {selectedGroup && (
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[0.6875rem]">
            {editingGroupId === selectedGroup.id ? (
              <div className="flex w-full items-center gap-1">
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRenameSubmit();
                    if (e.key === 'Escape') setEditingGroupId(null);
                  }}
                  className="h-6.5 min-w-0 flex-1 rounded-[2px] border border-[var(--ga-cobalt)] bg-[var(--ga-bg)] px-2 text-[0.6875rem] text-[var(--ga-ink)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleRenameSubmit()}
                  className="ga-solid-btn h-6.5 px-2 text-[0.65625rem]"
                >
                  {t('保存', 'Save')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGroupId(null)}
                  className="ga-line-btn h-6.5 px-1.5 text-[0.65625rem]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  data-active={activeTargetGroupId === selectedGroup.id ? 'true' : 'false'}
                  onClick={() => onChangeTargetGroup(selectedGroup.id)}
                  className="ga-line-btn h-6 px-2 text-[0.65625rem]"
                >
                  <Heart
                    className={`h-2.5 w-2.5 ${
                      activeTargetGroupId === selectedGroup.id ? 'fill-current text-[var(--ga-cobalt)]' : ''
                    }`}
                  />
                  <span>
                    {activeTargetGroupId === selectedGroup.id
                      ? t('当前右滑收入此组', 'Active Swipe Target')
                      : t('设为右滑收入组', 'Set Swipe Target')}
                  </span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroupId(selectedGroup.id);
                      setRenameDraft(selectedGroup.name);
                    }}
                    title={t('重命名分组', 'Rename group')}
                    className="ga-line-btn h-6 px-1.5"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {visibleEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onClearGroup(selectedGroup.id)}
                      title={t('清空本组歌曲', 'Clear group songs')}
                      className="ga-line-btn h-6 px-1.5 text-[0.625rem]"
                    >
                      {t('清空', 'Clear')}
                    </button>
                  )}
                  {!selectedGroup.isDefault && (
                    <button
                      type="button"
                      onClick={() => {
                        void onDeleteGroup(selectedGroup.id);
                        setSelectedGroupId('all');
                      }}
                      title={t('删除分组（曲目保留在默认心动）', 'Delete group (songs stay in Default)')}
                      className="ga-line-btn h-6 px-1.5 hover:text-rose-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Persistent Entries List */}
      <div className="min-h-0 flex-1 divide-y divide-[var(--ga-line)] overflow-y-auto">
        {visibleEntries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-[0.78125rem] text-[var(--ga-ink-2)]">
            <p>
              {selectedGroup
                ? t(
                    `「${selectedGroup.name}」暂时没有曲目`,
                    `No maps in "${selectedGroup.name}" yet`,
                  )
                : t(
                    '右滑心动、或在开包/360° 检视点击爱心即可永久收藏到此处',
                    'Swipe right or tap ♥ in Packs / 360° Inspector to save permanently here',
                  )}
            </p>
            <p className="ga-mono mt-1.5 text-[0.65625rem] text-[var(--ga-ink-3)]">
              {t('自动保存至本地 data/gacha-collections.json', 'Persisted to data/gacha-collections.json')}
            </p>
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const item = entry.beatmapset;
            const stats = getCardSummaryStats(item);
            const srStyle = getStarColor(stats.repStars);
            const task = activeTaskBySet.get(item.id);
            const activeBusy = Boolean(
              task &&
                (task.status === 'queued' ||
                  task.status === 'downloading' ||
                  task.status === 'installing'),
            );
            const assigningOpen = assigningSetId === item.id;

            return (
              <div key={item.id} className="px-3 py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--ga-cobalt)_6%,transparent)]">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    data-ga-cursor="PREVIEW"
                    onClick={() => onTogglePlaySet(item)}
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[2px]"
                    title={t('播放试听', 'Preview audio')}
                  >
                    <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                      {isPlaying && playingSetId === item.id ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current" />
                      )}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.8125rem] font-bold text-[var(--ga-ink)]">
                      {item.titleUnicode || item.title}
                    </div>
                    <div className="ga-mono flex flex-wrap items-center gap-1.5 text-[0.65625rem] text-[var(--ga-ink-3)]">
                      <span
                        className="rounded-[2px] px-1 py-px font-bold"
                        style={{ backgroundColor: srStyle.bg, color: srStyle.text }}
                      >
                        {stats.repStars.toFixed(2)}★
                      </span>
                      <span className="tabular-nums">{Math.round(item.bpm)} BPM</span>
                      <span className="font-semibold text-emerald-500 tabular-nums">
                        {stats.ppLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {entry.groupIds.map((gid) => (
                        <span
                          key={gid}
                          className="rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-panel)] px-1 text-[0.59375rem] text-[var(--ga-ink-2)]"
                        >
                          {groupNameById.get(gid) || gid}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      data-active={assigningOpen ? 'true' : 'false'}
                      onClick={() => setAssigningSetId(assigningOpen ? null : item.id)}
                      title={t('归类到自定义分组', 'Assign to groups')}
                      className="ga-line-btn h-7 px-1.5"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={activeBusy}
                      data-ga-cursor="GET"
                      onClick={() => onDownload(item, target)}
                      title={t('下载谱面', 'Download beatmap')}
                      className="ga-line-btn h-7 px-2 text-[0.71875rem]"
                    >
                      {activeBusy ? `${task?.progress ?? 0}%` : <Download className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      data-ga-cursor="DETAIL"
                      onClick={() => onOpenDetail(item)}
                      title={t('详情', 'Details')}
                      className="ga-line-btn h-7 px-1.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void onRemoveEntry(
                          item.id,
                          effectiveSelectedId === 'all' ? undefined : effectiveSelectedId,
                        )
                      }
                      title={
                        effectiveSelectedId === 'all'
                          ? t('从心动曲库移除', 'Remove from liked library')
                          : t('移出此分组', 'Remove from this group')
                      }
                      className="ga-line-btn h-7 px-1.5 text-[var(--ga-ink-3)] hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Multi-group Membership Checkboxes */}
                {assigningOpen && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-[2px] border border-[var(--ga-line)] bg-[var(--ga-bg)] p-2">
                    <span className="ga-mono w-full text-[0.59375rem] font-bold text-[var(--ga-ink-3)] uppercase">
                      {t('勾选所属分组（取消全部将移除收藏）', 'Assign groups (uncheck all to remove)')}
                    </span>
                    {collections.groups.map((g) => {
                      const checked = entry.groupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          data-active={checked ? 'true' : 'false'}
                          onClick={() => {
                            const next = checked
                              ? entry.groupIds.filter((id) => id !== g.id)
                              : [...entry.groupIds, g.id];
                            void onSetEntryGroups(item.id, next);
                          }}
                          className="ga-line-btn h-6 gap-1 px-2 text-[0.65625rem]"
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-[var(--ga-cobalt)]" />}
                          <span>{g.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
