import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  Download,
  FolderOpen,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  enqueueBatchDownloads,
  fetchLibraryDiff,
  openLocalFolder,
  rescanLocalLibrary,
  syncStableToLazer,
} from '../api';
import { TARGET_META } from '../constants';
import { LibraryDiffResult, LocalLibraryStatus } from '../types';

interface LibrarySyncModalProps {
  open: boolean;
  library: LocalLibraryStatus | null;
  onClose: () => void;
  onLibraryUpdated: (lib: LocalLibraryStatus) => void;
  onNotify: (msg: string) => void;
}

export function LibrarySyncModal({
  open,
  library,
  onClose,
  onLibraryUpdated,
  onNotify,
}: LibrarySyncModalProps) {
  const [tab, setTab] = useState<'stableToLazer' | 'lazerToStable'>('stableToLazer');
  const [diff, setDiff] = useState<LibraryDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadDiff = async () => {
    setLoading(true);
    try {
      const d = await fetchLibraryDiff();
      setDiff(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      void loadDiff();
    }
  }, [open]);

  const activeItems = useMemo(() => {
    if (!diff) return [];
    const list = tab === 'stableToLazer' ? diff.stableOnly : diff.lazerOnly;
    const kw = filterText.trim().toLowerCase();
    if (!kw) return list;
    return list.filter(
      (x) =>
        x.label.toLowerCase().includes(kw) || String(x.beatmapsetId).includes(kw),
    );
  }, [diff, tab, filterText]);

  if (!open) return null;

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (activeItems.length === 0) return;
    const allSelected = activeItems.every((i) => selectedIds.has(i.beatmapsetId));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeItems.slice(0, 100).map((i) => i.beatmapsetId)));
    }
  };

  const handleRescan = async () => {
    setLoading(true);
    try {
      const updated = await rescanLocalLibrary();
      onLibraryUpdated(updated);
      await loadDiff();
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSyncing(true);
    try {
      if (tab === 'stableToLazer') {
        const res = await syncStableToLazer(ids);
        onNotify(
          res.triggeredIpc
            ? `已零流量本地打包 ${res.syncedCount} 张谱面并发送给运行中的 Lazer`
            : `已零流量本地打包 ${res.syncedCount} 张谱面至 Lazer 待导入队列`,
        );
      } else {
        const res = await enqueueBatchDownloads({
          items: ids.map((id) => ({ beatmapsetId: id })),
          target: 'stable',
        });
        onNotify(`已加入 ${res.count} 个任务从镜像下载到 Stable`);
      }
      setSelectedIds(new Set());
      await loadDiff();
    } finally {
      setSyncing(false);
    }
  };

  const destMeta = tab === 'stableToLazer' ? TARGET_META.lazer : TARGET_META.stable;
  const checkedRowCls =
    tab === 'stableToLazer'
      ? 'border-lazer/45 bg-lazer/12 text-ink'
      : 'border-stable/45 bg-stable/12 text-ink';
  const checkedBoxCls =
    tab === 'stableToLazer'
      ? 'border-lazer bg-lazer text-white'
      : 'border-stable bg-stable text-white';

  return (
    <div
      className="modal-backdrop flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="双端曲库扫描与零流量同步"
        className="modal-surface flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-hairline bg-surface-3">
              <ArrowRightLeft className="h-4 w-4 text-stable" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[14.5px] font-bold text-ink">
                双端曲库扫描与零流量同步
              </h2>
              <p
                className="truncate text-[11px] text-ink-3"
                title={`${library?.stablePath ?? ''} · ${library?.lazerDataPath ?? ''}`}
              >
                自动比对 Stable (<span className="font-mono text-ink-2">{library?.stablePath}</span>) 与 Lazer (
                <span className="font-mono text-ink-2">{library?.lazerDataPath}</span>)
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleRescan}
              disabled={loading}
              className="btn btn-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>重新扫描</span>
            </button>
            <button type="button" onClick={onClose} className="btn btn-icon" aria-label="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-1 gap-2.5 border-b border-hairline bg-surface-1/60 p-4 sm:grid-cols-3">
          <div className="panel-flat relative overflow-hidden px-3.5 py-3">
            <span className="absolute inset-y-0 left-0 w-[2.5px] bg-stable" />
            <div className="flex items-center justify-between gap-2">
              <span className="overline text-stable-soft">osu!stable · 日常练习</span>
              <button
                type="button"
                onClick={() => openLocalFolder('stableSongs')}
                className="inline-flex items-center gap-1 text-[10.5px] text-ink-2 transition-colors hover:text-stable-soft"
              >
                <FolderOpen className="h-3 w-3" /> Songs
              </button>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-stat text-[24px] leading-none font-bold text-ink">
                {library?.stableCount ?? 0}
              </span>
              <span className="text-[11px] text-ink-3">套</span>
            </div>
          </div>

          <div className="panel-flat relative overflow-hidden px-3.5 py-3">
            <span className="absolute inset-y-0 left-0 w-[2.5px] bg-lazer" />
            <div className="flex items-center justify-between gap-2">
              <span className="overline text-lazer-soft">osu!lazer · 刷PP</span>
              <button
                type="button"
                onClick={() => openLocalFolder('lazerImport')}
                className="inline-flex items-center gap-1 text-[10.5px] text-ink-2 transition-colors hover:text-lazer-soft"
              >
                <FolderOpen className="h-3 w-3" /> 导入目录
              </button>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-stat text-[24px] leading-none font-bold text-ink">
                {library?.lazerCount ?? 0}
              </span>
              <span className="text-[11px] text-ink-3">套</span>
              {library?.lazerDeepScanRunning && (
                <span className="chip ml-auto self-center border-lazer/35 bg-lazer/12 text-lazer-soft">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  深度扫描中...
                </span>
              )}
            </div>
          </div>

          <div className="panel-flat relative overflow-hidden px-3.5 py-3">
            <span className="absolute inset-y-0 left-0 w-[2.5px] bg-emerald-500" />
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-ok" />
              <span className="overline text-ok">双端共有谱面</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-stat text-[24px] leading-none font-bold text-ink">
                {diff?.inBothCount ?? '—'}
              </span>
              <span className="text-[11px] text-ink-3">套</span>
            </div>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-hairline px-4 py-3">
          <div className="segmented w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setTab('stableToLazer');
                setSelectedIds(new Set());
              }}
              className={`px-3 ${tab === 'stableToLazer' ? TARGET_META.lazer.activeSegCls : ''}`}
            >
              Stable 有 · Lazer 缺{' '}
              <span className="font-mono ml-1 tabular-nums opacity-75">{diff?.stableOnly.length ?? 0}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('lazerToStable');
                setSelectedIds(new Set());
              }}
              className={`px-3 ${tab === 'lazerToStable' ? TARGET_META.stable.activeSegCls : ''}`}
            >
              Lazer 有 · Stable 缺{' '}
              <span className="font-mono ml-1 tabular-nums opacity-75">{diff?.lazerOnly.length ?? 0}</span>
            </button>
          </div>

          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="筛选谱面 ID 或名称..."
              className="field pl-8"
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-[180px] flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-[12px] text-ink-2">
              <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
              <span>正在分析双端差异...</span>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-[12px] text-ink-3">
              <Check className="h-5 w-5 text-ink-4" />
              <span>没有符合条件的差异谱面</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {activeItems.slice(0, 200).map((item) => {
                const checked = selectedIds.has(item.beatmapsetId);
                return (
                  <button
                    key={item.beatmapsetId}
                    type="button"
                    onClick={() => toggleId(item.beatmapsetId)}
                    aria-pressed={checked}
                    className={`group flex h-9 items-center gap-2.5 rounded-[9px] border px-2.5 text-left text-[12px] transition-colors ${
                      checked
                        ? checkedRowCls
                        : 'border-transparent bg-tint text-ink-2 hover:border-hairline hover:bg-tint-hover hover:text-ink'
                    }`}
                  >
                    <span
                      className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                        checked
                          ? checkedBoxCls
                          : 'border-hairline-strong bg-surface-2 group-hover:border-ink-3'
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 stroke-[3.5]" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="font-mono shrink-0 text-[10.5px] text-ink-3 tabular-nums">
                      {item.beatmapsetId}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface-1/75 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={selectAllVisible} className="btn btn-sm">
              全选前 100 项
            </button>
            <span className="text-[11.5px] text-ink-2">
              已选{' '}
              <span className={`font-mono font-semibold tabular-nums ${selectedIds.size > 0 ? destMeta.textCls : 'text-ink'}`}>
                {selectedIds.size}
              </span>{' '}
              项
            </span>
          </div>

          <button
            type="button"
            disabled={selectedIds.size === 0 || syncing}
            onClick={handleSync}
            className={`btn ${destMeta.btnCls}`}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>
              {tab === 'stableToLazer'
                ? '本地打包同步到 Lazer (零流量)'
                : '从镜像补全下载到 Stable'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
