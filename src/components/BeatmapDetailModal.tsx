import { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Download,
  ExternalLink,
  Film,
  Heart,
  ImageOff,
  Layers,
  Pause,
  Play,
  PlayCircle,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import {
  TARGET_META,
  formatCount,
  formatDuration,
  getLnCategory,
  getStarColor,
  getStatusBadge,
  openExternalLink,
} from '../constants';
import {
  DownloadTarget,
  DownloadVariant,
  NetworkStatus,
  NormalizedBeatmapset,
  PreferredMirror,
} from '../types';
import { SelectField } from './SelectField';

interface BeatmapDetailModalProps {
  beatmapset: NormalizedBeatmapset | null;
  network: NetworkStatus | null;
  defaultTarget: DownloadTarget;
  defaultVariant: DownloadVariant;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onSearchTag: (tag: string) => void;
  onDownload: (
    set: NormalizedBeatmapset,
    target: DownloadTarget,
    variant: DownloadVariant,
    mirror: PreferredMirror,
  ) => void;
}

const TARGET_ORDER: DownloadTarget[] = ['lazer', 'stable', 'both'];

const TARGET_SEG_LABEL: Record<DownloadTarget, string> = {
  lazer: 'Lazer · 刷PP',
  stable: 'Stable · 日常',
  both: '双端同步',
};

const TARGET_TITLE: Record<DownloadTarget, string> = {
  lazer: '安装到 Lazer (刷PP)',
  stable: '安装到 Stable (日常)',
  both: '同时安装到 Stable + Lazer',
};

export function BeatmapDetailModal({
  beatmapset,
  network,
  defaultTarget,
  defaultVariant,
  isPlaying,
  onClose,
  onTogglePlay,
  onSearchTag,
  onDownload,
}: BeatmapDetailModalProps) {
  const [target, setTarget] = useState<DownloadTarget>(defaultTarget);
  const [variant, setVariant] = useState<DownloadVariant>(defaultVariant);
  const [mirror, setMirror] = useState<PreferredMirror>('auto');
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setTarget(defaultTarget);
    setVariant(defaultVariant);
    setImgError(false);
  }, [beatmapset?.id, defaultTarget, defaultVariant]);

  if (!beatmapset) return null;

  const statusBadge = getStatusBadge(beatmapset.status);
  const tags = beatmapset.tags
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 18);

  const stats: Array<{ label: string; value: string; icon: typeof Heart; cls: string }> = [
    { label: 'BPM', value: String(beatmapset.bpm), icon: Activity, cls: 'text-ink' },
    {
      label: '收藏数',
      value: formatCount(beatmapset.favouriteCount),
      icon: Heart,
      cls: 'text-osu-soft',
    },
    {
      label: '总游玩',
      value: formatCount(beatmapset.playCount),
      icon: PlayCircle,
      cls: 'text-stable-soft',
    },
    {
      label: '难度数量',
      value: `${beatmapset.beatmaps.length}`,
      icon: Layers,
      cls: 'text-ink',
    },
  ];

  return (
    <div
      className="modal-backdrop flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={beatmapset.title}
        className="modal-surface flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover Banner (always photo scrim -> white text) */}
        <div className="cover-frame h-48 shrink-0 border-b border-hairline">
          {!imgError ? (
            <img
              src={beatmapset.coverUrl}
              alt={beatmapset.title}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-4">
              <ImageOff className="h-10 w-10" strokeWidth={1.5} />
            </div>
          )}
          <div className="cover-vignette" />

          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="btn btn-icon absolute top-3 right-3 border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-black/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="absolute right-5 bottom-4 left-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className={`chip font-stat uppercase tracking-wide ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
                <span className="chip font-mono border-white/15 bg-black/50 text-slate-200 backdrop-blur-sm">
                  #{beatmapset.id}
                </span>
                {beatmapset.video && (
                  <span className="chip border-white/15 bg-black/50 text-slate-100 backdrop-blur-sm">
                    <Film className="h-3 w-3" /> 含视频
                  </span>
                )}
                {beatmapset.spotlight && (
                  <span className="chip border-amber-300/45 bg-amber-500/25 text-amber-200 backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" /> Spotlight
                  </span>
                )}
                {beatmapset.localStatus.inLazer && (
                  <span className="chip chip-gold backdrop-blur-sm">
                    <Check className="h-3 w-3" strokeWidth={3} /> Lazer 已装
                  </span>
                )}
                {beatmapset.localStatus.inStable && (
                  <span className="chip chip-gold backdrop-blur-sm">
                    <Check className="h-3 w-3" strokeWidth={3} /> Stable 已装
                  </span>
                )}
                {beatmapset.localStatus.inLazerPending && !beatmapset.localStatus.inLazer && (
                  <span className="chip border-amber-300/50 bg-black/70 text-amber-200 backdrop-blur-sm">
                    <Clock className="h-3 w-3" /> Lazer 待导入
                  </span>
                )}
              </div>
              <h2 className="font-display truncate text-xl font-bold text-white drop-shadow-sm">
                {beatmapset.title}
              </h2>
              <p className="mt-0.5 truncate text-[13px] text-slate-200 drop-shadow-sm">
                {beatmapset.artist}
                <span className="mx-1.5 text-slate-400">·</span>
                谱师 <span className="font-semibold text-pink-300">{beatmapset.creator}</span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onTogglePlay(beatmapset)}
                className="btn btn-primary"
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                <span>{isPlaying ? '暂停试听' : '试听音频'}</span>
              </button>
              <a
                href={beatmapset.officialUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => openExternalLink(e, beatmapset.officialUrl)}
                className="btn border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-black/70 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>官网</span>
              </a>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, cls }) => (
              <div key={label} className="panel-flat px-3.5 py-3">
                <div className="overline flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  {label}
                </div>
                <div className={`font-stat mt-1 text-xl font-bold tracking-tight ${cls}`}>
                  {value}
                  {label === '难度数量' && (
                    <span className="ml-1 font-sans text-xs font-medium text-ink-3">个难度</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Difficulties Table */}
          <div>
            <div className="overline mb-2">难度列表</div>
            <div className="panel-flat overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>难度名</th>
                    <th>模式 / 键数</th>
                    <th>星数</th>
                    <th>时长</th>
                    <th>OD / HP</th>
                    <th>单键 / 长条 (LN%)</th>
                  </tr>
                </thead>
                <tbody>
                  {beatmapset.beatmaps.map((bm) => {
                    const color = getStarColor(bm.difficultyRating);
                    const lnInfo = getLnCategory(bm.lnRatio);
                    return (
                      <tr key={bm.id} className={bm.matchesFilter === false ? 'opacity-45' : ''}>
                        <td className="font-display max-w-[220px] truncate font-semibold text-ink">
                          {bm.version}
                        </td>
                        <td className="whitespace-nowrap text-ink-2">
                          {bm.modeInt === 3 ? (
                            <span className="chip font-stat">Mania {Math.round(bm.cs)}K</span>
                          ) : (
                            `${bm.mode} (CS ${bm.cs})`
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              backgroundColor: color.bg,
                              color: color.text,
                              borderColor: color.border,
                            }}
                            className="font-stat inline-flex h-5 items-center gap-0.5 rounded-full border px-2 text-[11px] font-bold"
                          >
                            ★ {bm.difficultyRating.toFixed(2)}
                          </span>
                        </td>
                        <td className="font-mono text-ink-2">{formatDuration(bm.totalLength)}</td>
                        <td className="font-mono whitespace-nowrap text-ink-2">
                          <span className="text-ink-3">OD</span> {bm.od}
                          <span className="mx-1.5 text-ink-4">·</span>
                          <span className="text-ink-3">HP</span> {bm.hp}
                        </td>
                        <td>
                          {bm.modeInt === 3 ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-mono text-ink-2">
                                {bm.countCircles} / {bm.countSliders}
                              </span>
                              {lnInfo && <span className={`chip font-mono ${lnInfo.cls}`}>{lnInfo.label}</span>}
                            </div>
                          ) : (
                            <span className="font-mono whitespace-nowrap text-ink-3">
                              {bm.countCircles}C / {bm.countSliders}S
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <div className="overline mb-2 flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> 标签
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((tag, i) => (
                  <button
                    key={`${tag}-${i}`}
                    type="button"
                    onClick={() => {
                      onSearchTag(tag);
                      onClose();
                    }}
                    className="chip font-mono font-medium transition-colors hover:border-osu/40 hover:bg-osu/10 hover:text-osu-soft"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Download Footer Controls */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-hairline bg-surface-1/75 px-5 py-3.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2.5">
            <div className="min-w-[260px]">
              <div className="field-label mb-1">安装目标</div>
              <div className="segmented">
                {TARGET_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    title={TARGET_TITLE[t]}
                    onClick={() => setTarget(t)}
                    className={target === t ? TARGET_META[t].activeSegCls : ''}
                  >
                    {TARGET_SEG_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-[140px]">
              <div className="field-label mb-1">包类型</div>
              <SelectField
                value={variant}
                onChange={(val) => setVariant(val as DownloadVariant)}
              >
                <option value="novideo">无视频 (推荐)</option>
                <option value="full">完整包 (含视频)</option>
                <option value="mini">精简 Mini 包</option>
              </SelectField>
            </div>

            <div className="w-[200px]">
              <div className="field-label mb-1">下载源</div>
              <SelectField
                value={mirror}
                onChange={(val) => setMirror(val as PreferredMirror)}
                className="font-mono tabular-nums"
              >
                <option value="auto">自动选择最快镜像</option>
                {network?.mirrors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.shortName} {m.latencyMs != null ? `(${m.latencyMs}ms)` : ''}
                    {!m.healthy ? ' [不可用]' : ''}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onDownload(beatmapset, target, variant, mirror);
              onClose();
            }}
            className={`btn h-9 px-4 text-[13px] ${TARGET_META[target].btnCls}`}
          >
            <Download className="h-4 w-4" />
            <span>立即下载并安装</span>
          </button>
        </div>
      </div>
    </div>
  );
}
