import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  FolderInput,
  Globe,
  Loader2,
  Pause,
  Play,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  clearFastBatch,
  pauseFastBatch,
  resumeFastBatch,
  startFastBatch,
  stopFastBatch,
} from '../api';
import { STATUS_OPTIONS, TARGET_META, formatBytes } from '../constants';
import { extractPpScenarioFromFilters, formatPpScenarioShort } from '../utils/pp';
import {
  AppConfig,
  DownloadTarget,
  DownloadVariant,
  FastBatchItemState,
  FastBatchRouteStrategy,
  FastBatchSnapshot,
  IpFamilyMode,
  LocalLibraryStatus,
  NetworkStatus,
  PreferredMirror,
  SearchFilters,
} from '../types';
import { SelectField } from './SelectField';

interface FastBatchModalProps {
  open: boolean;
  filters: SearchFilters;
  defaultTarget: DownloadTarget;
  defaultVariant: DownloadVariant;
  config: AppConfig | null;
  network: NetworkStatus | null;
  library: LocalLibraryStatus | null;
  snapshot: FastBatchSnapshot | null;
  onClose: () => void;
  onSnapshotChange: (snap: FastBatchSnapshot) => void;
  onImportLazerPending: (filenames?: string[]) => Promise<void>;
  onNotify: (msg: string) => void;
}

const COUNT_PRESETS = [10, 25, 50, 100, 200];
const CONCURRENCY_PRESETS = [4, 6, 8, 10, 12];

function formatElapsed(startedAt: string | null, finishedAt: string | null, tick: number): string {
  if (!startedAt) return '00:00';
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : Date.now() + tick * 0;
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function summarizeFilters(f: SearchFilters): string[] {
  const tags: string[] = [];
  if (f.mode === '3') {
    tags.push(f.keys && f.keys !== 'any' ? `Mania ${f.keys}K` : 'Mania 全键数');
  } else if (f.mode && f.mode !== 'any') {
    tags.push(`模式 #${f.mode}`);
  } else {
    tags.push('全部模式');
  }

  const st = STATUS_OPTIONS.find((s) => s.value === (f.status || 'leaderboard'));
  if (st) tags.push(st.label.split(' ')[0]);

  if (f.minStars != null || f.maxStars != null) {
    tags.push(`${f.minStars ?? 0}–${f.maxStars ?? '∞'}★`);
  }
  if (f.minBpm != null || f.maxBpm != null) {
    tags.push(`${f.minBpm ?? 0}–${f.maxBpm ?? '∞'} BPM`);
  }
  if (f.minLn != null || f.maxLn != null) {
    tags.push(`LN ${f.minLn ?? 0}–${f.maxLn ?? 100}%`);
  }
  if (f.minPp != null || f.maxPp != null) {
    tags.push(
      `~${f.minPp ?? 0}–${f.maxPp ?? '∞'}pp (${formatPpScenarioShort(extractPpScenarioFromFilters(f))})`,
    );
  }
  if (f.q?.trim()) {
    tags.push(`关键词 "${f.q.trim()}"`);
  }
  if (f.creator?.trim()) {
    tags.push(`谱师 ${f.creator.trim()}`);
  }
  return tags;
}

function itemStateBadge(state: FastBatchItemState): { label: string; cls: string } {
  switch (state) {
    case 'queued':
      return { label: '排队', cls: 'border-hairline bg-surface-1 text-ink-3' };
    case 'downloading':
      return { label: '下载中', cls: 'border-osu/40 bg-osu/12 text-osu-soft' };
    case 'verifying':
      return { label: '校验中', cls: 'border-lazer/40 bg-lazer/12 text-lazer-soft' };
    case 'installing':
      return { label: '写入中', cls: 'border-stable/40 bg-stable/12 text-stable-soft' };
    case 'completed':
      return { label: '完成', cls: 'border-emerald-500/35 bg-emerald-500/12 text-ok' };
    case 'queued_lazer':
      return { label: '待导入', cls: 'border-amber-500/35 bg-amber-500/12 text-warn' };
    case 'failed':
      return { label: '失败', cls: 'border-rose-500/35 bg-rose-500/12 text-bad' };
    case 'cancelled':
      return { label: '已停', cls: 'border-hairline bg-surface-1 text-ink-4' };
  }
}

export function FastBatchModal({
  open,
  filters,
  defaultTarget,
  defaultVariant,
  config,
  network,
  library,
  snapshot,
  onClose,
  onSnapshotChange,
  onImportLazerPending,
  onNotify,
}: FastBatchModalProps) {
  const [targetCount, setTargetCount] = useState(50);
  const [target, setTarget] = useState<DownloadTarget>(defaultTarget);
  const [variant, setVariant] = useState<DownloadVariant>(defaultVariant);
  const [concurrency, setConcurrency] = useState(6);
  const [ipFamily, setIpFamily] = useState<IpFamilyMode>(config?.ipFamily || 'auto');
  const [routeStrategy, setRouteStrategy] = useState<FastBatchRouteStrategy>('auto');
  const [preferredMirror, setPreferredMirror] = useState<PreferredMirror>(
    config?.preferredDownloadSource || 'auto',
  );
  const [skipInstalled, setSkipInstalled] = useState(true);
  const [stableDropOsz, setStableDropOsz] = useState(true);
  const [lazerBatchImport, setLazerBatchImport] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTarget(defaultTarget);
    setVariant(defaultVariant);
    if (config?.ipFamily) setIpFamily(config.ipFamily);
    if (config?.preferredDownloadSource) setPreferredMirror(config.preferredDownloadSource);
  }, [open, defaultTarget, defaultVariant, config?.ipFamily, config?.preferredDownloadSource]);

  const jobState = snapshot?.state ?? 'idle';
  const isRunning = jobState === 'running';
  const isPaused = jobState === 'paused';
  const isActive = isRunning || isPaused;

  useEffect(() => {
    if (!open || !isRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [open, isRunning]);

  const filterSummaryTags = useMemo(
    () => summarizeFilters(isActive && snapshot?.options ? snapshot.options.filters : filters),
    [filters, isActive, snapshot?.options],
  );

  if (!open) return null;

  const progressTotal = Math.max(1, snapshot?.targetCount || targetCount);
  const progressDone = snapshot?.completedCount ?? 0;
  const progressPct = Math.min(100, Math.round((progressDone / progressTotal) * 100));
  const pendingLazerFiles = snapshot?.lazerPendingCreated ?? [];
  const canManualImportLazer =
    pendingLazerFiles.length > 0 &&
    !isActive &&
    (snapshot?.lazerBatchImportedCount ?? 0) < pendingLazerFiles.length &&
    Boolean(library?.lazerExeExists);

  const handleStart = async () => {
    setBusyAction(true);
    try {
      const snap = await startFastBatch({
        filters,
        targetCount,
        target,
        variant,
        preferredMirror,
        concurrency,
        ipFamily,
        routeStrategy,
        skipInstalled,
        stableDropOsz,
        lazerBatchImport,
      });
      onSnapshotChange(snap);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '启动快速批量下载失败');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePause = async () => {
    setBusyAction(true);
    try {
      onSnapshotChange(await pauseFastBatch());
    } finally {
      setBusyAction(false);
    }
  };

  const handleResume = async () => {
    setBusyAction(true);
    try {
      onSnapshotChange(await resumeFastBatch());
    } finally {
      setBusyAction(false);
    }
  };

  const handleStop = async () => {
    setBusyAction(true);
    try {
      onSnapshotChange(await stopFastBatch());
    } finally {
      setBusyAction(false);
    }
  };

  const handleClear = async () => {
    setBusyAction(true);
    try {
      onSnapshotChange(await clearFastBatch());
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '清空失败');
    } finally {
      setBusyAction(false);
    }
  };

  const headerStatusLabel = isRunning
    ? '高速下载中'
    : isPaused
      ? '已暂停'
      : jobState === 'completed'
        ? '已完成'
        : jobState === 'stopped'
          ? '已停止'
          : jobState === 'error'
            ? '部分异常'
            : '就绪';

  const headerStatusCls = isRunning
    ? 'border-osu/45 bg-osu/14 text-osu-soft'
    : isPaused
      ? 'border-amber-500/45 bg-amber-500/14 text-warn'
      : jobState === 'completed'
        ? 'border-emerald-500/40 bg-emerald-500/14 text-ok'
        : jobState === 'error'
          ? 'border-rose-500/40 bg-rose-500/14 text-bad'
          : 'border-hairline bg-surface-1 text-ink-3';

  return (
    <div className="modal-backdrop flex items-center justify-center p-3 sm:p-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="快速批量下载"
        onClick={(e) => e.stopPropagation()}
        className="modal-surface flex h-[90vh] max-h-[820px] w-full max-w-5xl flex-col overflow-hidden"
      >
        {/* Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface-1/75 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-osu text-white">
              <Zap className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[1.0625rem] font-bold text-ink">快速批量下载</h2>
                <span className={`chip font-stat ${headerStatusCls}`}>
                  {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                  {headerStatusLabel}
                </span>
                <span
                  className={`chip font-mono ${
                    network?.hasGlobalIpv6
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-ok'
                      : 'border-hairline bg-surface-2 text-ink-3'
                  }`}
                >
                  <Globe className="h-3 w-3" />
                  {network?.hasGlobalIpv6 ? 'IPv6 已就绪' : '仅 IPv4'}
                </span>
              </div>
              <p className="truncate text-[0.75rem] font-medium text-ink-3">
                极简纯文本队列 · 自动跨页扫描补齐目标数量 · 多镜像并发 + 异步尾校验 + IPv6 优选
              </p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="btn btn-icon shrink-0" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Active Search Filter Strip */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-hairline bg-surface-0/70 px-4 py-2 text-[0.75rem]">
          <span className="inline-flex items-center gap-1 font-semibold text-ink-2">
            <SlidersHorizontal className="h-3 w-3 text-osu" />
            <span>当前筛选范围:</span>
          </span>
          {filterSummaryTags.map((tag) => (
            <span key={tag} className="chip font-medium">
              {tag}
            </span>
          ))}
        </div>

        {/* Controls & Configuration */}
        <div className="shrink-0 space-y-3 border-b border-hairline bg-surface-1/40 px-4 py-3">
          {!isActive && (
            <>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Target Count */}
                <div className="space-y-1">
                  <span className="field-label">目标下载数量 (1–500)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      aria-label="目标下载数量"
                      min={1}
                      max={500}
                      value={targetCount}
                      onChange={(e) =>
                        setTargetCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="field font-mono w-[82px] shrink-0 text-center font-bold tabular-nums"
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {COUNT_PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setTargetCount(n)}
                          className={`btn btn-sm font-mono min-h-[26px] px-1.5 text-[0.71875rem] ${
                            targetCount === n ? 'border-osu/55 bg-osu/14 text-osu-soft' : ''
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Target Client & Variant */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">安装目标</span>
                    <SelectField
                      value={target}
                      onChange={(val) => setTarget(val as DownloadTarget)}
                    >
                      <option value="lazer">Lazer</option>
                      <option value="stable">Stable</option>
                      <option value="both">双端</option>
                    </SelectField>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">包体格式</span>
                    <SelectField
                      value={variant}
                      onChange={(val) => setVariant(val as DownloadVariant)}
                    >
                      <option value="novideo">无视频</option>
                      <option value="full">完整包</option>
                      <option value="mini">Mini</option>
                    </SelectField>
                  </div>
                </div>

                {/* Concurrency */}
                <div className="space-y-1">
                  <span className="field-label">高并发线程 (推荐 6–10)</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {CONCURRENCY_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setConcurrency(c)}
                        className={`btn btn-sm font-mono min-h-[30px] flex-1 px-1.5 text-[0.75rem] ${
                          concurrency === c ? 'border-osu/55 bg-osu/14 font-bold text-osu-soft' : ''
                        }`}
                      >
                        {c} 线程
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preferred Mirror */}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="field-label">镜像分配策略</span>
                  <SelectField
                    value={preferredMirror}
                    onChange={(val) => setPreferredMirror(val as PreferredMirror)}
                  >
                    <option value="auto">多镜像自适应负载均衡 (最快)</option>
                    {network?.mirrors.map((m) => (
                      <option key={m.id} value={m.id}>
                        首选 {m.shortName} {m.latencyMs != null ? `(${m.latencyMs}ms)` : ''}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>

              {/* Network IPv6 / Route + Fast Import Speedups */}
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-12">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-span-5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">IPv6 / IPv4 网络栈策略</span>
                    <SelectField
                      value={ipFamily}
                      onChange={(val) => setIpFamily(val as IpFamilyMode)}
                    >
                      <option value="auto">自动双栈 (Happy Eyeballs)</option>
                      <option value="ipv6_first">IPv6 优先 (直连高速回落 IPv4)</option>
                      <option value="ipv6_only">强制仅 IPv6</option>
                      <option value="ipv4_first">IPv4 优先</option>
                      <option value="ipv4_only">强制仅 IPv4</option>
                    </SelectField>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="field-label">批量路由优先</span>
                    <SelectField
                      value={routeStrategy}
                      onChange={(val) => setRouteStrategy(val as FastBatchRouteStrategy)}
                    >
                      <option value="auto">智能分流 (CN 直连 / 海外代理)</option>
                      <option value="direct_first">直连优先 (配合 IPv6 直拉 CDN)</option>
                      <option value="direct_only">全部强制直连 (省代理流量)</option>
                      <option value="proxy_only">全部走本地代理</option>
                    </SelectField>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:col-span-7">
                  <label className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-hairline bg-surface-2/75 px-2.5 py-1.5 text-[0.78125rem] font-medium text-ink-2 hover:text-ink">
                    <input
                      type="checkbox"
                      checked={skipInstalled}
                      onChange={(e) => setSkipInstalled(e.target.checked)}
                      className="check"
                    />
                    <span>跳过本地已装</span>
                  </label>

                  {target !== 'lazer' && (
                    <label
                      title="仅保存 .osz 到 Stable Songs 目录，免除逐文件解压耗时"
                      className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-hairline bg-surface-2/75 px-2.5 py-1.5 text-[0.78125rem] font-medium text-ink-2 hover:text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={stableDropOsz}
                        onChange={(e) => setStableDropOsz(e.target.checked)}
                        className="check"
                      />
                      <span>Stable 直投 .osz (极速)</span>
                    </label>
                  )}

                  {target !== 'stable' && (
                    <label
                      title="每满 15 首批量调用一次 Lazer IPC 导入，避免逐首触发卡顿"
                      className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-hairline bg-surface-2/75 px-2.5 py-1.5 text-[0.78125rem] font-medium text-ink-2 hover:text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={lazerBatchImport}
                        onChange={(e) => setLazerBatchImport(e.target.checked)}
                        className="check check-lazer"
                      />
                      <span>Lazer 合并批量 IPC 导入</span>
                    </label>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Progress Telemetry & Action Strip */}
          <div className="panel-flat space-y-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.8125rem]">
              <div className="flex flex-wrap items-center gap-2 font-medium text-ink-2">
                <span className="font-stat font-bold text-ink tabular-nums">
                  {snapshot ? `${progressDone} / ${progressTotal}` : `待命中 · 目标 ${targetCount} 首`}
                </span>
                {snapshot && snapshot.aggregateSpeedBps > 0 && (
                  <span className="chip font-mono border-osu/35 bg-osu/10 text-osu-soft">
                    {formatBytes(snapshot.aggregateSpeedBps)}/s
                  </span>
                )}
                {snapshot && snapshot.totalBytesDownloaded > 0 && (
                  <span className="font-mono text-[0.75rem] text-ink-3 tabular-nums">
                    已传输 {formatBytes(snapshot.totalBytesDownloaded)}
                  </span>
                )}
                {snapshot?.startedAt && (
                  <span className="font-mono text-[0.75rem] text-ink-3 tabular-nums">
                    耗时 {formatElapsed(snapshot.startedAt, snapshot.finishedAt, tick)}
                  </span>
                )}
                {snapshot && snapshot.skippedInstalledCount > 0 && (
                  <span className="font-mono text-[0.75rem] text-ink-3 tabular-nums">
                    跳过已装 {snapshot.skippedInstalledCount}
                  </span>
                )}
                {snapshot && snapshot.failedCount > 0 && (
                  <span className="font-mono text-[0.75rem] text-bad tabular-nums">
                    失败 {snapshot.failedCount}
                  </span>
                )}
                {snapshot && snapshot.scannedPages > 0 && (
                  <span className="font-mono text-[0.75rem] text-ink-3 tabular-nums">
                    扫描 {snapshot.scannedPages} 页
                  </span>
                )}
              </div>

              {snapshot && (snapshot.ipv6Hits > 0 || snapshot.ipv4Hits > 0 || snapshot.proxyHits > 0) && (
                <div className="flex items-center gap-1.5 text-[0.71875rem]">
                  {snapshot.ipv6Hits > 0 && (
                    <span className="chip font-mono border-emerald-500/35 bg-emerald-500/10 text-ok">
                      IPv6: {snapshot.ipv6Hits}
                    </span>
                  )}
                  {snapshot.ipv4Hits > 0 && (
                    <span className="chip font-mono border-stable/35 bg-stable/10 text-stable-soft">
                      IPv4: {snapshot.ipv4Hits}
                    </span>
                  )}
                  {snapshot.proxyHits > 0 && (
                    <span className="chip font-mono border-lazer/35 bg-lazer/10 text-lazer-soft">
                      代理: {snapshot.proxyHits}
                    </span>
                  )}
                </div>
              )}
            </div>

            {snapshot && (
              <div className="space-y-1">
                <div className="meter h-[6px]">
                  <span
                    style={{
                      width: `${progressPct}%`,
                      backgroundColor: TARGET_META[snapshot.options?.target || target].hex,
                    }}
                  />
                </div>
                <div className="truncate text-[0.75rem] font-medium text-ink-3">{snapshot.message}</div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                {!isActive && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleStart()}
                    className={`btn font-stat ${TARGET_META[target].btnCls}`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>
                      {snapshot && snapshot.items.length > 0
                        ? `重新开始快速下载 (${targetCount} 首)`
                        : `开始快速批量下载 (${targetCount} 首)`}
                    </span>
                  </button>
                )}

                {isRunning && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handlePause()}
                    className="btn"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>暂停</span>
                  </button>
                )}

                {isPaused && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleResume()}
                    className="btn btn-primary"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>继续下载</span>
                  </button>
                )}

                {isActive && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleStop()}
                    className="btn border-rose-500/40 bg-rose-500/12 text-bad hover:bg-rose-500/20"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>停止任务</span>
                  </button>
                )}

                {!isActive && snapshot && snapshot.items.length > 0 && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleClear()}
                    className="btn btn-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>清空列表</span>
                  </button>
                )}
              </div>

              {canManualImportLazer && (
                <button
                  type="button"
                  onClick={() => void onImportLazerPending(pendingLazerFiles)}
                  className="btn btn-sm btn-lazer"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                  <span>一键批量导入 Lazer ({pendingLazerFiles.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* High-Density Pure-Text Queue List */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-2.5">
          {!snapshot || snapshot.items.length === 0 ? (
            <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
              <Zap className="mb-2 h-6 w-6 text-ink-4" />
              <p className="text-[0.875rem] font-semibold text-ink-2">
                仅记录曲目名、难度、编号与传输状态，无封面与试听加载开销
              </p>
              <p className="mt-1 text-[0.75rem] text-ink-3">
                点击「开始快速批量下载」后，将持续按当前搜索筛选条件翻页拉取并自动跳过本地已装曲目，直至达到预设数量
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshot.items.map((item) => {
                const badge = itemStateBadge(item.state);
                return (
                  <div
                    key={item.beatmapsetId}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 48px' }}
                    className="panel-flat flex items-center justify-between gap-2.5 px-3 py-2 text-[0.78125rem]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="shrink-0">
                        {item.state === 'downloading' ||
                        item.state === 'verifying' ||
                        item.state === 'installing' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-osu" />
                        ) : item.state === 'completed' || item.state === 'queued_lazer' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                        ) : item.state === 'failed' ? (
                          <XCircle className="h-3.5 w-3.5 text-bad" />
                        ) : item.state === 'cancelled' ? (
                          <Ban className="h-3.5 w-3.5 text-ink-4" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-ink-3" />
                        )}
                      </span>

                      <span className="font-mono shrink-0 rounded-[5px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-[0.71875rem] font-semibold text-ink-2 tabular-nums">
                        #{item.beatmapsetId}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display truncate font-bold text-ink">
                            {item.title}
                          </span>
                          <span className="hidden truncate text-[0.71875rem] text-ink-3 sm:inline">
                            {item.artist} // {item.creator}
                          </span>
                        </div>
                        {item.diffs.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {item.diffs.map((d) => (
                              <span
                                key={d}
                                className="font-stat rounded-[4px] border border-hairline bg-surface-2 px-1 py-px text-[0.65625rem] font-semibold text-ink-2"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.error && (
                        <span
                          className="hidden max-w-[180px] truncate text-[0.71875rem] text-bad md:inline"
                          title={item.error}
                        >
                          {item.error}
                        </span>
                      )}
                      {item.state === 'downloading' && (
                        <span className="font-mono text-[0.71875rem] font-semibold text-osu-soft tabular-nums">
                          {item.progress}% · {formatBytes(item.speedBps)}/s
                        </span>
                      )}
                      {item.mirror && (
                        <span className="chip font-mono text-[0.6875rem]">{item.mirror}</span>
                      )}
                      {item.routeUsed === 'proxy' ? (
                        <span className="chip font-mono border-lazer/35 bg-lazer/10 text-[0.6875rem] text-lazer-soft">
                          代理
                        </span>
                      ) : item.ipVersion === 6 ? (
                        <span className="chip font-mono border-emerald-500/35 bg-emerald-500/10 text-[0.6875rem] text-ok">
                          IPv6
                        </span>
                      ) : item.ipVersion === 4 ? (
                        <span className="chip font-mono border-stable/35 bg-stable/10 text-[0.6875rem] text-stable-soft">
                          IPv4
                        </span>
                      ) : null}
                      <span className={`chip font-stat text-[0.6875rem] ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
