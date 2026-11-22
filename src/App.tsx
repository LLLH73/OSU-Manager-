import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  Download,
  Layers,
  Loader2,
  Music,
  Square,
} from 'lucide-react';
import {
  cancelDownloadTask,
  clearFinishedDownloadTasks,
  clearLazerPending,
  enqueueBatchDownloads,
  enqueueDownload,
  fetchConfig,
  fetchDownloads,
  fetchLibraryStatus,
  fetchNetworkStatus,
  importLazerPending,
  openLocalFolder,
  retryDownloadTask,
  runNetworkBenchmark,
  searchBeatmapsets,
  updateConfig,
} from './api';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { BeatmapCard } from './components/BeatmapCard';
import { BeatmapDetailModal } from './components/BeatmapDetailModal';
import { DownloadDrawer } from './components/DownloadDrawer';
import { FilterPanel } from './components/FilterPanel';
import { LibrarySyncModal } from './components/LibrarySyncModal';
import { SettingsModal } from './components/SettingsModal';
import { SideRail } from './components/SideRail';
import { TitleBar } from './components/TitleBar';
import { DEFAULT_FILTERS, THEME_OPTIONS, WorkflowPreset } from './constants';
import {
  AppConfig,
  DownloadTarget,
  DownloadTask,
  DownloadVariant,
  LocalLibraryStatus,
  NetworkStatus,
  NormalizedBeatmapset,
  PreferredMirror,
  SearchFilters,
  SearchResult,
  ThemeId,
} from './types';

function readInitialTheme(): ThemeId {
  try {
    const stored = localStorage.getItem('osu4k-theme');
    if (stored === 'dark' || stored === 'light' || stored === 'latte') return stored;
  } catch {
    // Ignore storage error
  }
  return 'dark';
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [network, setNetwork] = useState<NetworkStatus | null>(null);
  const [library, setLibrary] = useState<LocalLibraryStatus | null>(null);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);

  const [theme, setTheme] = useState<ThemeId>(readInitialTheme);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [target, setTarget] = useState<DownloadTarget>('lazer');
  const [variant, setVariant] = useState<DownloadVariant>('novideo');

  const [results, setResults] = useState<NormalizedBeatmapset[]>([]);
  const [searchMeta, setSearchMeta] = useState<Omit<SearchResult, 'beatmapsets'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [playingSet, setPlayingSet] = useState<NormalizedBeatmapset | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [navOpen, setNavOpen] = useState(false);
  const [detailSet, setDetailSet] = useState<NormalizedBeatmapset | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [librarySyncOpen, setLibrarySyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const applyTheme = useCallback((nextTheme: ThemeId, persistBackend = true) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem('osu4k-theme', nextTheme);
    } catch {
      // Ignore storage error
    }
    const meta = THEME_OPTIONS.find((t) => t.id === nextTheme);
    if (meta) {
      void window.electronAPI?.setBackgroundColor?.(meta.electronBg);
    }
    if (persistBackend) {
      void updateConfig({ theme: nextTheme })
        .then((cfg) => setConfig(cfg))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = THEME_OPTIONS.find((t) => t.id === theme);
    if (meta) {
      void window.electronAPI?.setBackgroundColor?.(meta.electronBg);
    }
  }, [theme]);

  const runSearch = useCallback(async (f: SearchFilters, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setSearchError(null);
    try {
      const res = await searchBeatmapsets(f);
      const { beatmapsets, ...meta } = res;
      setSearchMeta(meta);
      setResults((prev) => {
        if (!append) return beatmapsets;
        const existingIds = new Set(prev.map((x) => x.id));
        return [...prev, ...beatmapsets.filter((x) => !existingIds.has(x.id))];
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [cfg, net, lib, dls] = await Promise.all([
          fetchConfig(),
          fetchNetworkStatus(false),
          fetchLibraryStatus(false),
          fetchDownloads(),
        ]);
        setConfig(cfg);
        setTarget(cfg.defaultTarget);
        setVariant(cfg.defaultVariant);
        if (cfg.theme && (cfg.theme === 'dark' || cfg.theme === 'light' || cfg.theme === 'latte')) {
          let hasLocal = false;
          try {
            hasLocal = Boolean(localStorage.getItem('osu4k-theme'));
          } catch {
            hasLocal = false;
          }
          if (!hasLocal) applyTheme(cfg.theme, false);
        }
        setNetwork(net);
        setLibrary(lib);
        setDownloads(dls);
      } catch {
        // SSE or retries will recover
      }
      void runSearch(DEFAULT_FILTERS, false);
    })();

    const es = new EventSource('/api/events');
    es.addEventListener('downloads', (ev) => {
      try {
        setDownloads(JSON.parse(ev.data) as DownloadTask[]);
      } catch {
        // Ignore parse error
      }
    });
    es.addEventListener('network', (ev) => {
      try {
        setNetwork(JSON.parse(ev.data) as NetworkStatus);
      } catch {
        // Ignore
      }
    });
    es.addEventListener('library', (ev) => {
      try {
        setLibrary(JSON.parse(ev.data) as LocalLibraryStatus);
      } catch {
        // Ignore
      }
    });

    return () => es.close();
  }, [applyTheme, runSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (settingsOpen) setSettingsOpen(false);
      else if (librarySyncOpen) setLibrarySyncOpen(false);
      else if (detailSet) setDetailSet(null);
      else if (downloadsOpen) setDownloadsOpen(false);
      else if (navOpen) setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen, librarySyncOpen, detailSet, downloadsOpen, navOpen]);

  const completedCount = useMemo(
    () => downloads.filter((d) => d.status === 'completed' || d.status === 'queued_lazer').length,
    [downloads],
  );
  useEffect(() => {
    if (completedCount === 0) return;
    setResults((prev) =>
      prev.map((item) => {
        const doneTasks = downloads.filter(
          (d) =>
            d.beatmapsetId === item.id &&
            (d.status === 'completed' || d.status === 'queued_lazer'),
        );
        if (doneTasks.length === 0) return item;
        let inStable = item.localStatus.inStable;
        let inLazer = item.localStatus.inLazer;
        let inLazerPending = item.localStatus.inLazerPending;
        for (const t of doneTasks) {
          if (t.target === 'stable' || t.target === 'both') inStable = true;
          if (t.target === 'lazer' || t.target === 'both') {
            if (t.status === 'completed') inLazer = true;
            else inLazerPending = true;
          }
        }
        return {
          ...item,
          localStatus: { ...item.localStatus, inStable, inLazer, inLazerPending },
        };
      }),
    );
  }, [completedCount, downloads]);

  const activeTaskBySet = useMemo(() => {
    const map = new Map<number, DownloadTask>();
    for (const t of downloads) {
      if (
        !map.has(t.beatmapsetId) &&
        (t.status === 'queued' ||
          t.status === 'downloading' ||
          t.status === 'verifying' ||
          t.status === 'installing')
      ) {
        map.set(t.beatmapsetId, t);
      }
    }
    return map;
  }, [downloads]);

  const handleBenchmark = async () => {
    notify('正在检测代理 6174 与全部镜像源延迟...');
    const st = await runNetworkBenchmark();
    setNetwork(st);
    const best = st.mirrors.find((m) => m.id === st.recommendedMirror);
    notify(
      best
        ? `测速完成：最优源 ${best.shortName} (${best.latencyMs ?? '?'}ms)`
        : '测速完成，请检查网络或代理设置',
    );
  };

  const handleSelectPreset = (preset: WorkflowPreset) => {
    setActivePresetId(preset.id);
    const next: SearchFilters = { ...DEFAULT_FILTERS, ...preset.filters, offset: 0 };
    setFilters(next);
    if (preset.suggestedTarget) {
      setTarget(preset.suggestedTarget);
    }
    setNavOpen(false);
    void runSearch(next, false);
  };

  const handleFilterChange = (next: SearchFilters, autoSearch = false) => {
    setActivePresetId(null);
    setFilters(next);
    if (autoSearch) {
      void runSearch(next, false);
    }
  };

  const handleResetFilters = () => {
    setActivePresetId(null);
    setFilters(DEFAULT_FILTERS);
    void runSearch(DEFAULT_FILTERS, false);
  };

  const handleTogglePlay = (set: NormalizedBeatmapset) => {
    if (playingSet?.id === set.id) {
      setIsPlaying((p) => !p);
    } else {
      setPlayingSet(set);
      setIsPlaying(true);
    }
  };

  const handleDownload = async (
    set: NormalizedBeatmapset,
    chosenTarget: DownloadTarget,
    chosenVariant: DownloadVariant = variant,
    chosenMirror: PreferredMirror = config?.preferredDownloadSource || 'auto',
  ) => {
    await enqueueDownload({
      beatmapsetId: set.id,
      title: set.title,
      artist: set.artist,
      creator: set.creator,
      target: chosenTarget,
      variant: chosenVariant,
      preferredMirror: chosenMirror,
    });
    const label =
      chosenTarget === 'lazer' ? 'Lazer' : chosenTarget === 'stable' ? 'Stable' : '双端';
    notify(`已加入下载队列 (${label}): ${set.title}`);
  };

  const handleBatchDownload = async () => {
    const picked = results.filter((r) => selectedIds.has(r.id));
    if (picked.length === 0) return;
    await enqueueBatchDownloads({
      items: picked.map((p) => ({
        beatmapsetId: p.id,
        title: p.title,
        artist: p.artist,
        creator: p.creator,
      })),
      target,
      variant,
      preferredMirror: config?.preferredDownloadSource || 'auto',
    });
    notify(`已批量加入 ${picked.length} 首谱面到下载队列`);
    setSelectedIds(new Set());
    setBatchMode(false);
    setDownloadsOpen(true);
  };

  const handleImportAllLazer = async () => {
    const res = await importLazerPending();
    notify(res.message);
    setLibrary(await fetchLibraryStatus(true));
  };

  const handleClearLazerPending = async () => {
    const res = await clearLazerPending();
    notify(`已清理 ${res.deletedCount} 个待导入 .osz 文件`);
    setLibrary(await fetchLibraryStatus(false));
  };

  const handleSaveConfig = async (patch: Partial<AppConfig>) => {
    const updated = await updateConfig(patch);
    setConfig(updated);
    setTarget(updated.defaultTarget);
    setVariant(updated.defaultVariant);
    notify('设置已保存，正在刷新网络与本地曲库...');
    const [net, lib] = await Promise.all([runNetworkBenchmark(), fetchLibraryStatus(true)]);
    setNetwork(net);
    setLibrary(lib);
  };

  return (
    <div className="app-canvas flex h-screen flex-col overflow-hidden text-ink">
      <TitleBar
        network={network}
        theme={theme}
        onChangeTheme={(t) => applyTheme(t, true)}
        onBenchmark={handleBenchmark}
        onToggleNav={() => setNavOpen((v) => !v)}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Left Navigation Rail */}
        <aside className="hidden w-[264px] shrink-0 border-r border-hairline bg-surface-0/85 backdrop-blur-xl lg:block">
          <SideRail
            target={target}
            variant={variant}
            activePresetId={activePresetId}
            library={library}
            downloads={downloads}
            onChangeTarget={setTarget}
            onChangeVariant={setVariant}
            onSelectPreset={handleSelectPreset}
            onOpenLibrarySync={() => setLibrarySyncOpen(true)}
            onOpenDownloads={() => setDownloadsOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </aside>

        {/* Narrow Viewport Drawer Rail */}
        {navOpen && (
          <div className="modal-backdrop flex lg:hidden" onClick={() => setNavOpen(false)}>
            <aside
              className="animate-rail-in h-full w-[264px] border-r border-hairline-strong bg-surface-0 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <SideRail
                target={target}
                variant={variant}
                activePresetId={activePresetId}
                library={library}
                downloads={downloads}
                onChangeTarget={setTarget}
                onChangeVariant={setVariant}
                onSelectPreset={handleSelectPreset}
                onOpenLibrarySync={() => {
                  setNavOpen(false);
                  setLibrarySyncOpen(true);
                }}
                onOpenDownloads={() => {
                  setNavOpen(false);
                  setDownloadsOpen(true);
                }}
                onOpenSettings={() => {
                  setNavOpen(false);
                  setSettingsOpen(true);
                }}
              />
            </aside>
          </div>
        )}

        {/* Main Workspace */}
        <main className={`flex-1 overflow-y-auto px-4 pt-4 sm:px-5 ${playingSet ? 'pb-28' : 'pb-8'}`}>
          <div className="mx-auto max-w-[1440px] space-y-4">
            <FilterPanel
              filters={filters}
              loading={loading}
              onChange={handleFilterChange}
              onSearch={(override) => void runSearch(override || filters, false)}
              onReset={handleResetFilters}
            />

            {/* Status & Batch Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[12px] text-ink-2">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  当前显示 <strong className="font-stat font-bold text-ink">{results.length}</strong> 套谱面
                </span>
                {searchMeta && (
                  <span className="chip">
                    搜索源: {searchMeta.provider === 'osudirect' ? 'osu.direct' : '小夜镜像 (Sayobot)'}
                  </span>
                )}
                {searchMeta?.fallbackUsed && searchMeta.fallbackReason && (
                  <span className="chip border-amber-500/40 bg-amber-500/12 text-warn">
                    <AlertTriangle className="h-3 w-3" />
                    {searchMeta.fallbackReason}
                  </span>
                )}
                {searchError && <span className="text-bad">错误: {searchError}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBatchMode((v) => !v);
                    setSelectedIds(new Set());
                  }}
                  className={`btn btn-sm ${
                    batchMode
                      ? 'border-amber-500/45 bg-amber-500/15 text-warn'
                      : ''
                  }`}
                >
                  {batchMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                  <span>{batchMode ? '退出批量' : '批量选择'}</span>
                </button>

                {batchMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedIds.size === results.length && results.length > 0) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(results.map((r) => r.id)));
                        }
                      }}
                      className="btn btn-sm"
                    >
                      <Square className="h-3.5 w-3.5" />
                      <span>{selectedIds.size === results.length && results.length > 0 ? '取消全选' : '全选本页'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={() => void handleBatchDownload()}
                      className="btn btn-sm btn-primary font-stat"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>下载已选 ({selectedIds.size})</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Grid Results */}
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="panel h-[284px] animate-pulse opacity-60"
                  />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="panel-flat flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-hairline bg-surface-2 text-ink-3">
                  <Music className="h-6 w-6" />
                </div>
                <p className="font-display text-[14px] font-semibold text-ink">没有找到符合当前筛选条件的谱面</p>
                <p className="mt-1 text-[12px] text-ink-3">
                  可以放宽星数 / LN% / 状态限制，或切换至「全部状态 (Any)」搜索更多练习图
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {results.map((set) => (
                    <BeatmapCard
                      key={set.id}
                      beatmapset={set}
                      activeTarget={target}
                      isPlaying={isPlaying && playingSet?.id === set.id}
                      activeTask={activeTaskBySet.get(set.id)}
                      batchMode={batchMode}
                      selected={selectedIds.has(set.id)}
                      onToggleSelect={(id) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                      onTogglePlay={handleTogglePlay}
                      onDownload={(s, t) => void handleDownload(s, t)}
                      onOpenDetail={(s) => setDetailSet(s)}
                    />
                  ))}
                </div>

                {searchMeta?.hasMore && (
                  <div className="flex justify-center pt-3">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() =>
                        void runSearch({ ...filters, offset: searchMeta.nextUpstreamOffset }, true)
                      }
                      className="btn h-9 px-6 text-[13px]"
                    >
                      {loadingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin text-osu" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-osu" />
                      )}
                      <span>{loadingMore ? '加载中…' : '加载更多谱面'}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Floating Audio Preview Dock */}
      <AudioPlayerBar
        beatmapset={playingSet}
        playing={isPlaying}
        activeTarget={target}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStop={() => {
          setIsPlaying(false);
          setPlayingSet(null);
        }}
        onDownload={(s, t) => void handleDownload(s, t)}
      />

      {/* Detail Modal */}
      <BeatmapDetailModal
        beatmapset={detailSet}
        network={network}
        defaultTarget={target}
        defaultVariant={variant}
        isPlaying={Boolean(detailSet && isPlaying && playingSet?.id === detailSet.id)}
        onClose={() => setDetailSet(null)}
        onTogglePlay={handleTogglePlay}
        onSearchTag={(tag) => {
          const next = { ...filters, q: tag, offset: 0 };
          setFilters(next);
          void runSearch(next, false);
        }}
        onDownload={(s, t, v, m) => void handleDownload(s, t, v, m)}
      />

      {/* Download Queue & Lazer Import Drawer */}
      <DownloadDrawer
        open={downloadsOpen}
        tasks={downloads}
        library={library}
        onClose={() => setDownloadsOpen(false)}
        onCancel={(id) => void cancelDownloadTask(id)}
        onRetry={(id) => void retryDownloadTask(id)}
        onClearFinished={() => void clearFinishedDownloadTasks()}
        onImportAllLazer={() => void handleImportAllLazer()}
        onClearLazerPending={() => void handleClearLazerPending()}
        onOpenLazerImportFolder={() => void openLocalFolder('lazerImport')}
      />

      {/* Dual-Client Library Sync Modal */}
      <LibrarySyncModal
        open={librarySyncOpen}
        library={library}
        onClose={() => setLibrarySyncOpen(false)}
        onLibraryUpdated={setLibrary}
        onNotify={notify}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        config={config}
        network={network}
        theme={theme}
        onChangeTheme={(t) => applyTheme(t, true)}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
        onBenchmark={handleBenchmark}
      />

      {/* Toast */}
      {toast && (
        <div className="glass animate-toast-in fixed top-12 right-4 z-[60] rounded-xl border-osu/35 px-4 py-2.5 text-[12px] font-medium text-ink">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
