import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FolderOpen,
  Gamepad2,
  Inbox,
  Loader2,
  Play,
  RotateCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { formatBytes, getTargetMeta } from '../constants';
import { useI18n } from '../i18n';
import { DownloadTask, LocalLibraryStatus } from '../types';

interface DownloadDrawerProps {
  open: boolean;
  tasks: DownloadTask[];
  library: LocalLibraryStatus | null;
  onClose: () => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClearFinished: () => void;
  onImportAllLazer: () => void;
  onClearLazerPending: () => void;
  onOpenLazerImportFolder: () => void;
  onPreviewBeatmap?: (beatmapsetId: number, title?: string) => void;
  onLoadIntoGame?: (beatmapsetId: number) => void;
}

function isTaskActive(task: DownloadTask): boolean {
  return (
    task.status === 'queued' ||
    task.status === 'downloading' ||
    task.status === 'verifying' ||
    task.status === 'installing'
  );
}

function meterBackground(task: DownloadTask): string {
  if (task.status === 'failed') return '#e11d48';
  if (task.status === 'completed' || task.status === 'queued_lazer') return '#10b981';
  if (task.target === 'lazer') return '#a855f7';
  if (task.target === 'stable') return '#0284c7';
  return 'linear-gradient(90deg, #ff66aa 0%, #a855f7 100%)';
}

export function DownloadDrawer({
  open,
  tasks,
  library,
  onClose,
  onCancel,
  onRetry,
  onClearFinished,
  onImportAllLazer,
  onClearLazerPending,
  onOpenLazerImportFolder,
  onPreviewBeatmap,
  onLoadIntoGame,
}: DownloadDrawerProps) {
  const { lang, t } = useI18n();
  if (!open) return null;

  const targetMeta = getTargetMeta(lang);
  const pendingLazer = library?.lazerPendingFiles || [];
  const activeCount = tasks.filter(isTaskActive).length;

  return (
    <div className="modal-backdrop flex justify-end" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('下载队列与 Lazer 导入中心', 'Downloads & Lazer Import Center')}
        className="animate-drawer-in flex h-full w-full max-w-lg flex-col border-l border-hairline-strong bg-surface-2 shadow-[-24px_0_80px_-20px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface-2/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-osu" />
              <h2 className="font-display truncate text-[1rem] font-bold text-ink">
                {t('下载队列与 Lazer 导入中心', 'Downloads & Lazer Import Center')}
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[0.75rem] font-medium text-ink-3">
              <span className="font-mono flex items-center gap-1.5 tabular-nums">
                <span className={activeCount > 0 ? 'live-dot' : 'idle-dot'} />
                <span className="font-semibold text-ink">{activeCount}</span> {t('进行中', 'active')}
                <span className="text-ink-4">/</span>
                <span className="font-semibold text-ink">{tasks.length}</span> {t('总任务', 'total')}
              </span>
              <span className="text-ink-4">·</span>
              <span className="truncate">{t('支持镜像自动故障转移与双端自动安装', 'Auto mirror failover & dual-client install')}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {tasks.length > 0 && (
              <button type="button" onClick={onClearFinished} className="btn btn-sm">
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('清理已完成', 'Clear Finished')}</span>
              </button>
            )}
            <button type="button" onClick={onClose} title={t('关闭', 'Close')} className="btn btn-icon">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Lazer Pending Queue Card */}
          <div className="rounded-[14px] border border-lazer/30 bg-lazer/8 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[0.875rem] font-bold text-lazer-soft">
                    {t('osu!lazer 待导入队列', 'osu!lazer Import Queue')}
                  </span>
                  <span className={`chip font-mono ${targetMeta.lazer.chipCls}`}>
                    {t(`${pendingLazer.length} 个 .osz`, `${pendingLazer.length} .osz`)}
                  </span>
                  {library?.lazerRunning && (
                    <span className="flex items-center gap-1 text-[0.71875rem] font-semibold text-ok">
                      <span className="live-dot" /> {t('运行中', 'Running')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[0.75rem] font-medium leading-relaxed text-ink-2">
                  {library?.lazerRunning
                    ? t(
                        '检测到 Lazer 正在运行，新下载谱面会自动导入；下方历史队列可一键补导入',
                        'Lazer is running — new maps auto-import; import any remaining files below',
                      )
                    : t(
                        'Lazer 当前未启动，下载的 Lazer 谱面已保存在队列中，点击一键启动并全部导入',
                        'Lazer is not running — queued .osz files are stored here. Launch & import all at once',
                      )}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={pendingLazer.length === 0}
                onClick={onImportAllLazer}
                className="btn btn-sm btn-lazer"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>
                  {library?.lazerRunning
                    ? t('立即全部导入 Lazer', 'Import All to Lazer')
                    : t('启动 Lazer 并批量导入', 'Launch Lazer & Import All')}
                </span>
              </button>
              <button type="button" onClick={onOpenLazerImportFolder} className="btn btn-sm">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>{t('打开文件夹', 'Open Folder')}</span>
              </button>
              {pendingLazer.length > 0 && (
                <button type="button" onClick={onClearLazerPending} className="btn btn-sm btn-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t('清空 .osz 缓存', 'Clear .osz Queue')}</span>
                </button>
              )}
            </div>

            {pendingLazer.length > 0 && (
              <div className="mt-3 max-h-28 space-y-0.5 overflow-y-auto border-t border-lazer/20 pt-2">
                {pendingLazer.map((f) => (
                  <div
                    key={f.filename}
                    className="flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 text-[0.75rem] text-ink-2 hover:bg-tint"
                  >
                    <span className="truncate font-mono text-[0.71875rem]">{f.filename}</span>
                    <span className="font-mono shrink-0 text-ink-3 tabular-nums">{formatBytes(f.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Download Tasks List */}
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-hairline-strong py-14 text-center">
              <Inbox className="h-7 w-7 text-ink-4" strokeWidth={1.5} />
              <p className="max-w-[260px] text-[0.8125rem] font-medium text-ink-3">
                {t(
                  '暂无下载任务，点击任意谱面卡片的下载按钮即可开始。',
                  'No downloads yet. Click Download on any beatmap card to begin.',
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="overline px-0.5">{t('任务列表', 'Task Queue')}</div>
              {tasks.map((task) => {
                const isActive = isTaskActive(task);
                const meta = targetMeta[task.target];
                const isDone = task.status === 'completed' || task.status === 'queued_lazer';
                return (
                  <div
                    key={task.id}
                    className="panel-flat px-3 py-2.5 transition-colors hover:border-hairline-strong"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display truncate text-[0.875rem] font-semibold text-ink">{task.title}</div>
                        <div className="truncate text-[0.75rem] font-medium text-ink-2">
                          {task.artist}
                          <span className="mx-1 text-ink-4">·</span>
                          <span className="font-mono tabular-nums">#{task.beatmapsetId}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={`chip font-stat ${meta.chipCls}`}>{meta.label}</span>
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => onCancel(task.id)}
                            className="btn btn-sm btn-icon h-6 w-6 border-transparent bg-transparent text-ink-3 hover:text-bad"
                            title={t('取消任务', 'Cancel task')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(task.status === 'failed' || task.status === 'cancelled') && (
                          <button
                            type="button"
                            onClick={() => onRetry(task.id)}
                            className="btn btn-sm btn-icon h-6 w-6 border-transparent bg-transparent text-ink-2 hover:text-stable"
                            title={t('重试', 'Retry')}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="meter mt-2.5">
                      <span
                        style={{
                          width: `${task.progress}%`,
                          backgroundColor: meterBackground(task).startsWith('#')
                            ? meterBackground(task)
                            : undefined,
                          backgroundImage: meterBackground(task).startsWith('#')
                            ? undefined
                            : meterBackground(task),
                        }}
                      />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.75rem] font-medium">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {isActive && <Loader2 className={`h-3 w-3 shrink-0 animate-spin ${meta.textCls}`} />}
                        {isDone && <CheckCircle2 className="h-3 w-3 shrink-0 text-ok" />}
                        {task.status === 'failed' && <AlertCircle className="h-3 w-3 shrink-0 text-bad" />}
                        {task.status === 'cancelled' && <XCircle className="h-3 w-3 shrink-0 text-ink-3" />}
                        <span className={`truncate ${task.status === 'failed' ? 'text-bad' : 'text-ink-2'}`}>
                          {task.error || task.message}
                        </span>
                      </div>

                      <div className="font-mono flex shrink-0 items-center gap-1.5 text-ink-3 tabular-nums">
                        {task.activeMirror && (
                          <span className="chip min-h-[19px] px-1.5 text-[0.6875rem] font-medium">{task.activeMirror}</span>
                        )}
                        <span>
                          {task.status === 'downloading' && task.speedBps > 0
                            ? `${formatBytes(task.speedBps)}/s`
                            : task.totalBytes
                              ? `${formatBytes(task.downloadedBytes)} / ${formatBytes(task.totalBytes)}`
                              : `${task.progress}%`}
                        </span>
                      </div>
                    </div>

                    {isDone && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-hairline pt-2">
                        <div>
                          {task.autoLoadedInGame && (
                            <span className="chip border-emerald-500/40 bg-emerald-500/12 text-ok">
                              <Gamepad2 className="h-3 w-3" />
                              {t(
                                `已在 ${
                                  task.loadTargetClient === 'both'
                                    ? 'Stable & Lazer'
                                    : task.loadTargetClient === 'stable'
                                      ? 'Stable'
                                      : 'Lazer'
                                } 加载`,
                                `Loaded in ${
                                  task.loadTargetClient === 'both'
                                    ? 'Stable & Lazer'
                                    : task.loadTargetClient === 'stable'
                                      ? 'Stable'
                                      : 'Lazer'
                                }`,
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(library?.lazerRunning || library?.stableRunning) && onLoadIntoGame && (
                            <button
                              type="button"
                              onClick={() => onLoadIntoGame(task.beatmapsetId)}
                              className="btn btn-sm min-h-[26px] px-2 text-[0.71875rem] text-lazer-soft"
                              title={t('向运行中的游戏发送导入加载请求', 'Send import/load request to running game')}
                            >
                              <Gamepad2 className="h-3 w-3" />
                              <span>{t('再次加载', 'Load Again')}</span>
                            </button>
                          )}
                          {onPreviewBeatmap && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onPreviewBeatmap(task.beatmapsetId, task.title);
                              }}
                              className="btn btn-sm min-h-[26px] border-osu/45 bg-osu/12 px-2 text-[0.71875rem] text-osu-soft hover:bg-osu/20"
                            >
                              <Eye className="h-3 w-3" />
                              <span>{t('预览谱面', 'Preview Chart')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
