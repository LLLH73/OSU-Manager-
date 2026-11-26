import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Calculator,
  Check,
  Clock,
  Download,
  ExternalLink,
  Eye,
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
  formatCount,
  formatDuration,
  getLnCategory,
  getStarColor,
  getStatusBadge,
  getTargetMeta,
  openExternalLink,
} from '../constants';
import { useI18n } from '../i18n';
import {
  DownloadTarget,
  DownloadVariant,
  NetworkStatus,
  NormalizedBeatmapset,
  PreferredMirror,
} from '../types';
import { PpScenarioInput, formatPp, getQuickPpSummary, isRankedForPp } from '../utils/pp';
import { PpCalculatorPanel } from './PpCalculatorPanel';
import { SelectField } from './SelectField';

interface BeatmapDetailModalProps {
  beatmapset: NormalizedBeatmapset | null;
  initialDiffId?: number | null;
  focusPp?: boolean;
  ppScenario?: Partial<PpScenarioInput>;
  network: NetworkStatus | null;
  defaultTarget: DownloadTarget;
  defaultVariant: DownloadVariant;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay: (set: NormalizedBeatmapset) => void;
  onSearchTag: (tag: string) => void;
  onPreviewBeatmap?: (set: NormalizedBeatmapset, beatmapId?: number) => void;
  onDownload: (
    set: NormalizedBeatmapset,
    target: DownloadTarget,
    variant: DownloadVariant,
    mirror: PreferredMirror,
  ) => void;
}

const TARGET_ORDER: DownloadTarget[] = ['lazer', 'stable', 'both'];

export function BeatmapDetailModal({
  beatmapset,
  initialDiffId = null,
  focusPp = false,
  ppScenario,
  network,
  defaultTarget,
  defaultVariant,
  isPlaying,
  onClose,
  onTogglePlay,
  onSearchTag,
  onPreviewBeatmap,
  onDownload,
}: BeatmapDetailModalProps) {
  const { lang, t } = useI18n();
  const allTargetMeta = useMemo(() => getTargetMeta(lang), [lang]);
  const [target, setTarget] = useState<DownloadTarget>(defaultTarget);
  const [variant, setVariant] = useState<DownloadVariant>(defaultVariant);
  const [mirror, setMirror] = useState<PreferredMirror>('auto');
  const [imgError, setImgError] = useState(false);
  const [selectedDiffId, setSelectedDiffId] = useState<number | null>(initialDiffId);
  const ppSectionRef = useRef<HTMLDivElement | null>(null);

  const defaultBestDiffId = useMemo(() => {
    if (!beatmapset || beatmapset.beatmaps.length === 0) return null;
    const matching = beatmapset.beatmaps.filter((b) => b.matchesFilter !== false);
    const pool = matching.length > 0 ? matching : beatmapset.beatmaps;
    const sorted = [...pool].sort((a, b) => a.difficultyRating - b.difficultyRating);
    return sorted[sorted.length - 1]?.id ?? null;
  }, [beatmapset]);

  useEffect(() => {
    setTarget(defaultTarget);
    setVariant(defaultVariant);
    setImgError(false);
    setSelectedDiffId(initialDiffId ?? defaultBestDiffId);
  }, [beatmapset?.id, defaultTarget, defaultVariant, initialDiffId, defaultBestDiffId]);

  useEffect(() => {
    if (!beatmapset || !focusPp) return;
    const timer = window.setTimeout(() => {
      ppSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [beatmapset?.id, focusPp]);

  if (!beatmapset) return null;

  const rankedForPp = isRankedForPp(beatmapset.status);
  const hasLocalSource =
    beatmapset.localStatus.inStable ||
    beatmapset.localStatus.inLazer ||
    beatmapset.localStatus.inLazerPending;
  const hasManiaDiff = beatmapset.beatmaps.some((b) => b.modeInt === 3);

  const statusBadge = getStatusBadge(beatmapset.status);
  const tags = beatmapset.tags
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 18);

  const targetSegLabel: Record<DownloadTarget, string> = {
    lazer: 'Lazer',
    stable: 'Stable',
    both: t('双端同步', 'Both'),
  };
  const targetTitle: Record<DownloadTarget, string> = {
    lazer: t('安装到 Lazer', 'Install to Lazer'),
    stable: t('安装到 Stable', 'Install to Stable'),
    both: t('同时安装到 Stable + Lazer', 'Install to Stable + Lazer'),
  };

  const stats: Array<{ key: string; label: string; value: string; icon: typeof Heart; cls: string }> = [
    { key: 'bpm', label: 'BPM', value: String(beatmapset.bpm), icon: Activity, cls: 'text-ink' },
    {
      key: 'fav',
      label: t('收藏数', 'Favourites'),
      value: formatCount(beatmapset.favouriteCount),
      icon: Heart,
      cls: 'text-osu-soft',
    },
    {
      key: 'play',
      label: t('总游玩', 'Plays'),
      value: formatCount(beatmapset.playCount),
      icon: PlayCircle,
      cls: 'text-stable-soft',
    },
    {
      key: 'diffs',
      label: t('难度数量', 'Difficulties'),
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
        className="modal-surface flex max-h-[88vh] w-full max-w-[960px] flex-col overflow-hidden"
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
            title={t('关闭', 'Close')}
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
                    <Film className="h-3 w-3" /> {t('含视频', 'Video')}
                  </span>
                )}
                {beatmapset.spotlight && (
                  <span className="chip border-amber-300/45 bg-amber-500/25 text-amber-200 backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" /> Spotlight
                  </span>
                )}
                {beatmapset.localStatus.inLazer && (
                  <span className="chip chip-gold backdrop-blur-sm">
                    <Check className="h-3 w-3" strokeWidth={3} /> {t('Lazer 已装', 'In Lazer')}
                  </span>
                )}
                {beatmapset.localStatus.inStable && (
                  <span className="chip chip-gold backdrop-blur-sm">
                    <Check className="h-3 w-3" strokeWidth={3} /> {t('Stable 已装', 'In Stable')}
                  </span>
                )}
                {beatmapset.localStatus.inLazerPending && !beatmapset.localStatus.inLazer && (
                  <span className="chip border-amber-300/50 bg-black/70 text-amber-200 backdrop-blur-sm">
                    <Clock className="h-3 w-3" /> {t('Lazer 待导入', 'Lazer Pending')}
                  </span>
                )}
              </div>
              <h2 className="font-display truncate text-[1.25rem] font-bold text-white drop-shadow-sm">
                {beatmapset.title}
              </h2>
              <p className="mt-0.5 truncate text-[0.875rem] font-medium text-slate-200 drop-shadow-sm">
                {beatmapset.artist}
                <span className="mx-1.5 text-slate-400">·</span>
                {t('谱师', 'Mapped by')} <span className="font-semibold text-pink-300">{beatmapset.creator}</span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {hasLocalSource && hasManiaDiff && onPreviewBeatmap && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPreviewBeatmap(beatmapset, selectedDiffId ?? undefined);
                  }}
                  className="btn border-white/25 bg-black/55 text-white backdrop-blur-md hover:border-osu/80 hover:bg-osu/90 hover:text-white"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t('预览谱面', 'Preview')}</span>
                </button>
              )}
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
                <span>{isPlaying ? t('暂停试听', 'Pause') : t('试听音频', 'Preview Audio')}</span>
              </button>
              <a
                href={beatmapset.officialUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => openExternalLink(e, beatmapset.officialUrl)}
                className="btn border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-black/70 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{t('官网', 'Web')}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5"
          style={{ transform: 'translateZ(0)', willChange: 'scroll-position' }}
        >
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map(({ key, label, value, icon: Icon, cls }) => (
              <div key={key} className="panel-flat px-3.5 py-3">
                <div className="overline flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  {label}
                </div>
                <div className={`font-stat mt-1 text-[1.25rem] font-bold tracking-tight ${cls}`}>
                  {value}
                  {key === 'diffs' && (
                    <span className="ml-1 font-sans text-[0.8125rem] font-semibold text-ink-3">
                      {t('个难度', 'diffs')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Difficulties Table */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="overline">{t('难度列表', 'Difficulties')}</span>
              <span className="text-[0.78125rem] font-medium text-ink-3">
                {t('点击任意难度行可在下方模拟多情景 PP', 'Click any difficulty row to simulate PP scenarios below')}
              </span>
            </div>
            <div className="panel-flat overflow-x-auto">
              <table className="data-table [&_th]:!px-2.5 [&_td]:!px-2.5">
                <thead>
                  <tr>
                    <th>{t('难度名', 'Difficulty')}</th>
                    <th>{t('模式 / 键数', 'Mode / Keys')}</th>
                    <th>{t('星数', 'Stars')}</th>
                    <th>{t('大致 PP (98%/SS)', 'Est. PP (98%/SS)')}</th>
                    <th>{t('时长', 'Length')}</th>
                    <th>OD / HP</th>
                    <th>{t('单键 / 长条 (LN%)', 'Rice / LN (LN%)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {beatmapset.beatmaps.map((bm) => {
                    const color = getStarColor(bm.difficultyRating);
                    const lnInfo = getLnCategory(bm.lnRatio, lang);
                    const ppQuick = rankedForPp ? getQuickPpSummary(bm, 1) : null;
                    const isPicked = selectedDiffId === bm.id;
                    return (
                      <tr
                        key={bm.id}
                        onClick={() => setSelectedDiffId(bm.id)}
                        className={`cursor-pointer ${
                          isPicked ? 'bg-lazer/12' : ''
                        } ${bm.matchesFilter === false ? 'opacity-45' : ''}`}
                      >
                        <td
                          title={bm.version}
                          className="font-display max-w-[170px] font-semibold text-ink"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{bm.version}</span>
                            {hasLocalSource && bm.modeInt === 3 && onPreviewBeatmap && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClose();
                                  onPreviewBeatmap(beatmapset, bm.id);
                                }}
                                title={t('使用此难度打开 Mania 谱面预览', 'Preview this Mania difficulty')}
                                className="btn btn-sm min-h-[22px] shrink-0 px-1.5 text-[0.71875rem] font-semibold text-osu-soft"
                              >
                                <Eye className="h-2.5 w-2.5" />
                                <span>{t('预览', 'Preview')}</span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap font-medium text-ink-2">
                          {bm.modeInt === 3 ? (
                            <span className="chip font-stat">Mania {Math.round(bm.cs)}K</span>
                          ) : (
                            `${bm.mode} (CS ${bm.cs})`
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          <span
                            style={{
                              backgroundColor: color.bg,
                              color: color.text,
                              borderColor: color.border,
                            }}
                            className="font-stat inline-flex min-h-[24px] shrink-0 items-center gap-1 rounded-full border px-2 text-[0.75rem] leading-none font-bold whitespace-nowrap"
                          >
                            <span>★</span>
                            <span>{bm.difficultyRating.toFixed(2)}</span>
                          </span>
                        </td>
                        <td className="font-stat whitespace-nowrap tabular-nums">
                          {ppQuick ? (
                            <span className="inline-flex items-center gap-1 text-[0.8125rem] font-bold text-lazer-soft">
                              <Calculator className="h-3 w-3 opacity-80" />
                              ~{formatPp(ppQuick.pp98)} / {formatPp(ppQuick.pp100)}pp
                            </span>
                          ) : (
                            <span className="text-[0.78125rem] font-medium text-ink-3">
                              {t('未上架', 'Unranked')}
                            </span>
                          )}
                        </td>
                        <td className="font-mono whitespace-nowrap text-ink-2">
                          {formatDuration(bm.totalLength)}
                        </td>
                        <td className="font-mono whitespace-nowrap text-ink-2">
                          <span className="text-ink-3">OD</span> {bm.od}
                          <span className="mx-1.5 text-ink-4">·</span>
                          <span className="text-ink-3">HP</span> {bm.hp}
                        </td>
                        <td>
                          {bm.modeInt === 3 ? (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="font-mono text-ink-2">
                                {bm.countCircles} / {bm.countSliders}
                              </span>
                              {lnInfo && (
                                <span title={lnInfo.tooltip} className={`chip font-mono ${lnInfo.cls}`}>
                                  {lnInfo.fullLabel}
                                </span>
                              )}
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

          {/* Interactive PP Scenario Calculator */}
          <div ref={ppSectionRef}>
            <PpCalculatorPanel
              beatmaps={beatmapset.beatmaps}
              selectedDiffId={selectedDiffId}
              onSelectDiff={(id) => setSelectedDiffId(id)}
              status={beatmapset.status}
              bpm={beatmapset.bpm}
              beatmapsetId={beatmapset.id}
              initialScenario={ppScenario}
            />
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <div className="overline mb-2 flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> {t('标签', 'Tags')}
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
              <div className="field-label mb-1">{t('安装目标', 'Install Target')}</div>
              <div className="segmented">
                {TARGET_ORDER.map((tgt) => (
                  <button
                    key={tgt}
                    type="button"
                    title={targetTitle[tgt]}
                    onClick={() => setTarget(tgt)}
                    className={target === tgt ? allTargetMeta[tgt].activeSegCls : ''}
                  >
                    {targetSegLabel[tgt]}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-[148px]">
              <div className="field-label mb-1">{t('包类型', 'Package')}</div>
              <SelectField
                value={variant}
                onChange={(val) => setVariant(val as DownloadVariant)}
              >
                <option value="novideo">{t('无视频 (推荐)', 'No Video (Default)')}</option>
                <option value="full">{t('完整包 (含视频)', 'Full (With Video)')}</option>
                <option value="mini">{t('精简 Mini 包', 'Mini (Compact)')}</option>
              </SelectField>
            </div>

            <div className="min-w-[210px]">
              <div className="field-label mb-1">{t('下载源', 'Mirror')}</div>
              <SelectField
                value={mirror}
                onChange={(val) => setMirror(val as PreferredMirror)}
                className="font-mono tabular-nums"
              >
                <option value="auto">{t('自动选择最快镜像', 'Auto (Fastest Mirror)')}</option>
                {network?.mirrors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.shortName} {m.latencyMs != null ? `(${m.latencyMs}ms)` : ''}
                    {!m.healthy ? t(' [不可用]', ' [Offline]') : ''}
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
            className={`btn min-h-[38px] px-4 text-[0.875rem] font-semibold ${allTargetMeta[target].btnCls}`}
          >
            <Download className="h-4 w-4" />
            <span>{t('立即下载并安装', 'Download & Install')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
