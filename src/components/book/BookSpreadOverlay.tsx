import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Disc3,
  Eye,
  FolderOpen,
  Gamepad2,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Trophy,
  Volume2,
} from 'lucide-react';
import { OsuMusicMark } from '../music/OsuMusicMark';
import { formatDuration, getLnCategory, getStarColor, getStatusBadge } from '../../constants';
import {
  BookDetail,
  BookDifficultyRecord,
  BookGrade,
  BookScoreRecord,
  BookSummary,
} from '../../types';
import { openStableSongFolder } from '../../api';
import { SelectField } from '../SelectField';

type SpreadTab = 'difficulties' | 'scores' | 'archive';
type ScoreSourceFilter = 'all' | 'stable' | 'lazer';
type ScoreSortMode = 'recent' | 'pp' | 'accuracy' | 'score';

interface BookSpreadOverlayProps {
  visible: boolean;
  closing: boolean;
  bookSummary: BookSummary | null;
  bookDetail: BookDetail | null;
  loadingDetail: boolean;
  bookIndex: number;
  totalBooks: number;
  canLoadIntoGame: boolean;
  onClose: () => void;
  onStepBook: (delta: -1 | 1) => void;
  onPlayInMusicPlayer?: (book: BookSummary) => void;
  onPauseBackgroundMusic?: () => void;
  onPreviewBeatmap?: (beatmapsetId: number, beatmapId?: number | null, title?: string) => void;
  onLoadIntoGame?: (beatmapsetId: number) => void;
  onFilterByTag?: (tag: string) => void;
  onNotify?: (msg: string) => void;
}

const GRADE_STYLE: Record<BookGrade, string> = {
  XH: 'border-[#cbd5e1] bg-[#f8fafc] text-[#0f172a]',
  X: 'border-[#eab308] bg-[#fef08a] text-[#713f12]',
  SH: 'border-[#94a3b8] bg-[#e2e8f0] text-[#1e293b]',
  S: 'border-[#f59e0b] bg-[#fde68a] text-[#78350f]',
  A: 'border-[#10b981]/60 bg-[#10b981]/18 text-[#059669]',
  B: 'border-[#3b82f6]/55 bg-[#3b82f6]/15 text-[#2563eb]',
  C: 'border-[#a855f7]/55 bg-[#a855f7]/15 text-[#7e22ce]',
  D: 'border-[#ef4444]/55 bg-[#ef4444]/15 text-[#dc2626]',
  F: 'border-neutral-400/50 bg-neutral-500/15 text-neutral-500',
};

const GRADE_ORDER: BookGrade[] = ['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F'];

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '未记录';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未记录';
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatBookNo(idx: number): string {
  return `NO.${String(Math.max(1, idx + 1)).padStart(3, '0')}`;
}

export const BookSpreadOverlay = memo(function BookSpreadOverlay({
  visible,
  closing,
  bookSummary,
  bookDetail,
  loadingDetail,
  bookIndex,
  totalBooks,
  canLoadIntoGame,
  onClose,
  onStepBook,
  onPlayInMusicPlayer,
  onPauseBackgroundMusic,
  onPreviewBeatmap,
  onLoadIntoGame,
  onFilterByTag,
  onNotify,
}: BookSpreadOverlayProps) {
  const [activeTab, setActiveTab] = useState<SpreadTab>('difficulties');
  const [diffFilter, setDiffFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<ScoreSourceFilter>('all');
  const [scoreSort, setScoreSort] = useState<ScoreSortMode>('recent');

  // Inline local audio preview
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0.55);
  const [audioError, setAudioError] = useState(false);
  const jumpedToPreviewRef = useRef(false);

  // Tab underline indicator
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const tabBtnRefs = useRef<Record<SpreadTab, HTMLButtonElement | null>>({
    difficulties: null,
    scores: null,
    archive: null,
  });
  const [indicatorStyle, setIndicatorStyle] = useState<{ x: number; width: number }>({
    x: 0,
    width: 64,
  });

  const book = bookDetail ?? bookSummary;

  // Reset tab filters & stop audio when changing books or closing
  useEffect(() => {
    setDiffFilter('all');
    setSourceFilter('all');
    setScoreSort('recent');
    setAudioPlaying(false);
    setAudioTime(0);
    setAudioDuration(0);
    setAudioError(false);
    jumpedToPreviewRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  }, [bookSummary?.bookKey]);

  useEffect(() => {
    if (!visible || closing) {
      setAudioPlaying(false);
      audioRef.current?.pause();
    }
  }, [visible, closing]);

  useEffect(() => {
    const updateIndicator = () => {
      const container = tabsRef.current;
      const btn = tabBtnRefs.current[activeTab];
      if (!container || !btn) return;
      setIndicatorStyle({
        x: btn.offsetLeft,
        width: btn.offsetWidth,
      });
    };
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab, visible, book?.bookKey]);

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el || !book) return;
    if (audioPlaying) {
      el.pause();
      setAudioPlaying(false);
      return;
    }
    onPauseBackgroundMusic?.();
    setAudioError(false);
    if (!el.src || !el.src.includes(encodeURIComponent(book.bookKey))) {
      el.src = book.audioUrl;
    }
    el.volume = audioVolume;
    el.play()
      .then(() => {
        setAudioPlaying(true);
      })
      .catch(() => {
        setAudioError(true);
        setAudioPlaying(false);
      });
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = audioVolume;
  }, [audioVolume]);

  const difficulties = bookDetail?.difficulties ?? [];
  const scores = bookDetail?.scores ?? [];

  const filteredScores = useMemo(() => {
    let list = scores;
    if (diffFilter !== 'all') {
      list = list.filter((s) => s.difficultyName === diffFilter);
    }
    if (sourceFilter !== 'all') {
      list = list.filter((s) => s.source === sourceFilter);
    }
    const copy = [...list];
    copy.sort((a, b) => {
      if (scoreSort === 'pp') return (b.pp ?? -1) - (a.pp ?? -1);
      if (scoreSort === 'accuracy') return b.accuracy - a.accuracy;
      if (scoreSort === 'score') return b.score - a.score;
      const ta = a.playedAt ? Date.parse(a.playedAt) : 0;
      const tb = b.playedAt ? Date.parse(b.playedAt) : 0;
      return tb - ta;
    });
    return copy;
  }, [scores, diffFilter, sourceFilter, scoreSort]);

  if (!visible || !book) return null;

  const statusBadge = getStatusBadge(book.status === 'local' ? 'graveyard' : book.status);
  const statusLabel = book.status === 'local' ? 'Local' : statusBadge.label;
  const maxDifficultyPlays = Math.max(1, ...difficulties.map((d) => d.playCount));
  const bestManiaDiff =
    difficulties.find((d) => d.modeInt === 3 && d.keyCount === 4) ??
    difficulties.find((d) => d.modeInt === 3) ??
    null;

  const handleOpenFolder = async () => {
    if (!book.stableFolder) return;
    try {
      await openStableSongFolder(book.stableFolder);
      onNotify?.(`已打开本地曲目文件夹：${book.stableFolder}`);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : '打开文件夹失败');
    }
  };

  return (
    <div
      className={`rhine-spread-backdrop absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-5 lg:p-6 ${
        closing ? 'is-closing' : 'is-open'
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${book.titleUnicode} 曲目档案详情`}
        className={`rhine-book-spread relative flex h-[min(92%,760px)] w-full max-w-[1240px] flex-col overflow-hidden ${
          closing ? 'is-closing' : 'is-open'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <audio
          ref={audioRef}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setAudioDuration(el.duration || 0);
            if (!jumpedToPreviewRef.current && book.previewTimeMs > 0 && el.duration > 2) {
              const targetSec = Math.min(el.duration - 1.5, book.previewTimeMs / 1000);
              if (targetSec > 0) el.currentTime = targetSec;
              jumpedToPreviewRef.current = true;
            }
          }}
          onTimeUpdate={(e) => setAudioTime(e.currentTarget.currentTime)}
          onEnded={() => setAudioPlaying(false)}
          onError={() => {
            setAudioError(true);
            setAudioPlaying(false);
          }}
        />

        {/* Top Architectural Folio Bar */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rb-line)] px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rhine-btn-ghost inline-flex items-center gap-2 text-[0.78125rem] font-semibold tracking-[0.06em]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>合上并放回档案库</span>
              <kbd className="border border-[var(--rb-line)] px-1.5 py-0.5 text-[0.625rem] tracking-[0.08em] text-[var(--rb-muted)]">
                ESC
              </kbd>
            </button>
          </div>

          <div className="hidden items-center gap-2 font-mono text-[0.71875rem] tracking-[0.14em] text-[var(--rb-muted)] md:flex">
            <span>{formatBookNo(bookIndex)}</span>
            <span>/</span>
            <span>{String(totalBooks).padStart(3, '0')}</span>
            <span>·</span>
            <span>OPEN ARCHIVE FOLIO</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onStepBook(-1)}
              disabled={totalBooks <= 1}
              title="上一本 Book"
              className="rhine-btn-outline inline-flex h-8 items-center gap-1 px-2.5 text-[0.75rem] disabled:opacity-35"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">上一本</span>
            </button>
            <button
              type="button"
              onClick={() => onStepBook(1)}
              disabled={totalBooks <= 1}
              title="下一本 Book"
              className="rhine-btn-outline inline-flex h-8 items-center gap-1 px-2.5 text-[0.75rem] disabled:opacity-35"
            >
              <span className="hidden sm:inline">下一本</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Two-Page Open Book Body */}
        <div className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Center Spine Gutter Shadow on Desktop */}
          <div className="rhine-spine-crease pointer-events-none hidden lg:block" aria-hidden="true" />

          {/* LEFT PAGE: Cover, Song Identity, Play Count / PP Summary & Local Playback */}
          <section className="flex min-h-0 flex-col overflow-y-auto border-b border-[var(--rb-line)] px-5 py-4 sm:px-7 sm:py-5 lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-[var(--rb-muted)] uppercase">
              <span className="flex items-center gap-2 font-mono">
                <span className="inline-block h-1.5 w-1.5 bg-[var(--rb-accent)]" />
                <span>{formatBookNo(bookIndex)}</span>
                {book.beatmapsetId && <span>· SET #{book.beatmapsetId}</span>}
              </span>
              <div className="flex items-center gap-1.5">
                {book.inStable && (
                  <span className="rhine-tag-stable border px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider">
                    STABLE
                  </span>
                )}
                {book.inLazer && (
                  <span className="rhine-tag-lazer border px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider">
                    LAZER
                  </span>
                )}
                <span className="border border-[var(--rb-line)] px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider text-[var(--rb-ink)]">
                  {statusLabel.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Cover Plate with Rhine Lab Corner Registration */}
            <div className="relative mt-3 overflow-hidden border border-[var(--rb-line)] bg-black/10">
              <div className="aspect-[16/8.2] w-full overflow-hidden">
                <img
                  key={book.bookKey}
                  src={book.coverUrl}
                  alt={book.titleUnicode}
                  className={`rhine-spread-cover-img h-full w-full object-cover ${
                    closing ? 'is-closing' : ''
                  }`}
                />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
              <div className="absolute right-2.5 bottom-2 left-2.5 flex items-end justify-between gap-2 text-white">
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.6875rem]">
                  <span className="bg-black/65 px-2 py-0.5 backdrop-blur-xs">
                    {book.difficultyCount} 难度
                  </span>
                  <span className="bg-black/65 px-2 py-0.5 backdrop-blur-xs">
                    {book.bpm} BPM
                  </span>
                  <span className="bg-black/65 px-2 py-0.5 backdrop-blur-xs">
                    {formatDuration(book.lengthSec)}
                  </span>
                  {book.keyCounts.length > 0 && (
                    <span className="bg-black/65 px-2 py-0.5 backdrop-blur-xs">
                      {book.keyCounts.map((k) => `${k}K`).join('/')}
                    </span>
                  )}
                </div>
                {book.bestGrade && (
                  <span
                    className={`border px-2 py-0.5 font-mono text-[0.75rem] font-bold ${GRADE_STYLE[book.bestGrade]}`}
                  >
                    BEST {book.bestGrade}
                  </span>
                )}
              </div>
            </div>

            {/* Title, Artist, Mapper & 2px Rule */}
            <div className="mt-4">
              <h2 className="font-display text-[1.45rem] leading-tight font-bold tracking-tight text-[var(--rb-ink)] sm:text-[1.65rem]">
                {book.titleUnicode || book.title}
              </h2>
              {book.title && book.title !== book.titleUnicode && (
                <p className="mt-0.5 text-[0.8125rem] text-[var(--rb-muted)]">{book.title}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.84375rem] text-[var(--rb-muted)]">
                <span>
                  曲师 <strong className="font-semibold text-[var(--rb-ink)]">{book.artistUnicode || book.artist}</strong>
                </span>
                <span>
                  谱师 <strong className="font-semibold text-[var(--rb-ink)]">{book.creator}</strong>
                </span>
                {book.source && (
                  <span>
                    来源 <strong className="font-semibold text-[var(--rb-ink)]">{book.source}</strong>
                  </span>
                )}
              </div>
              <div className="mt-3.5 h-[2px] w-full bg-[var(--rb-ink)]" />
            </div>

            {/* 2x2 Rhine Lab Key Record Grid: Play Count / PP / Best Score / Last Played */}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="border-l-2 border-[var(--rb-accent)] pl-3">
                <dt className="font-mono text-[0.65625rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                  PLAY COUNT / 游玩次数
                </dt>
                <dd className="mt-1 flex items-baseline gap-2">
                  <span className="font-stat text-[1.4rem] leading-none font-bold text-[var(--rb-ink)] tabular-nums">
                    {book.playCount}
                  </span>
                  <span className="text-[0.75rem] text-[var(--rb-muted)]">次记录</span>
                </dd>
                <dd className="mt-0.5 font-mono text-[0.6875rem] text-[var(--rb-muted)]">
                  Stable {book.stablePlayCount} · Lazer {book.lazerPlayCount}
                </dd>
              </div>

              <div className="border-l-2 border-[var(--rb-ink)] pl-3">
                <dt className="font-mono text-[0.65625rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                  PERFORMANCE / 拿到 PP
                </dt>
                <dd className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-stat text-[1.4rem] leading-none font-bold text-[var(--rb-ink)] tabular-nums">
                    {book.bestPp !== null ? `${book.bestPp.toFixed(1)}` : '—'}
                  </span>
                  {book.bestPp !== null && (
                    <span className="font-mono text-[0.75rem] font-bold text-[var(--rb-accent)]">
                      pp
                    </span>
                  )}
                </dd>
                <dd className="mt-0.5 text-[0.6875rem] text-[var(--rb-muted)]">
                  {book.bestPp === null
                    ? '暂无历史成绩'
                    : book.bestPpSource === 'recorded'
                      ? 'Lazer 实录 PP'
                      : book.bestPpIsRanked
                        ? 'Ranked 公式折算 PP'
                        : 'Unranked 练习估算 PP'}
                </dd>
              </div>

              <div>
                <dt className="font-mono text-[0.65625rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                  BEST ACCURACY / 最高准度
                </dt>
                <dd className="mt-1 flex items-center gap-2">
                  {book.bestGrade && (
                    <span
                      className={`border px-1.5 py-px font-mono text-[0.71875rem] font-bold ${GRADE_STYLE[book.bestGrade]}`}
                    >
                      {book.bestGrade}
                    </span>
                  )}
                  <span className="font-stat text-[1.05rem] font-bold text-[var(--rb-ink)] tabular-nums">
                    {book.bestAccuracy !== null ? `${book.bestAccuracy.toFixed(2)}%` : '—'}
                  </span>
                </dd>
                {book.bestScore !== null && (
                  <dd className="mt-0.5 font-mono text-[0.6875rem] text-[var(--rb-muted)] tabular-nums">
                    最高分 {book.bestScore.toLocaleString()}
                  </dd>
                )}
              </div>

              <div>
                <dt className="font-mono text-[0.65625rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                  LAST PLAYED / 最近游玩
                </dt>
                <dd className="mt-1 flex items-center gap-1.5 text-[0.875rem] font-semibold text-[var(--rb-ink)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--rb-muted)]" />
                  <span>{formatShortDate(book.lastPlayedAt)}</span>
                </dd>
                <dd className="mt-0.5 font-mono text-[0.6875rem] text-[var(--rb-muted)]">
                  ★ {book.minStars.toFixed(2)} – {book.maxStars.toFixed(2)}
                  {book.lnRatioAvg !== null ? ` · LN ${book.lnRatioAvg}%` : ''}
                </dd>
              </div>
            </dl>

            {/* Inline Local Audio Preview + Quick Actions */}
            <div className="mt-auto space-y-2.5 pt-5">
              <div className="flex items-center gap-3 border border-[var(--rb-line)] bg-[var(--rb-panel)] px-3 py-2">
                <button
                  type="button"
                  onClick={toggleAudio}
                  className="rhine-solid-btn inline-flex h-8 shrink-0 items-center gap-2 px-3 text-[0.75rem] font-semibold"
                >
                  {audioPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{audioPlaying ? '暂停音频' : '试听本地音源'}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={audioDuration > 0 ? audioDuration : 100}
                    step={0.1}
                    value={audioTime}
                    disabled={!audioDuration}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setAudioTime(val);
                      if (audioRef.current) audioRef.current.currentTime = val;
                    }}
                    className="h-1 w-full cursor-pointer accent-[var(--rb-accent)]"
                  />
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[0.625rem] text-[var(--rb-muted)] tabular-nums">
                    <span>{audioError ? '未找到可用音频' : formatDuration(audioTime)}</span>
                    <span>{audioDuration > 0 ? formatDuration(audioDuration) : '--:--'}</span>
                  </div>
                </div>
                <div className="hidden items-center gap-1.5 sm:flex">
                  <Volume2 className="h-3.5 w-3.5 text-[var(--rb-muted)]" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioVolume}
                    aria-label="试听音量"
                    onChange={(e) => setAudioVolume(Number(e.target.value))}
                    className="h-1 w-14 cursor-pointer accent-[var(--rb-accent)]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onPlayInMusicPlayer && (
                  <button
                    type="button"
                    onClick={() => onPlayInMusicPlayer(book)}
                    className="rhine-solid-btn inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-semibold"
                  >
                    <OsuMusicMark className="h-3.5 w-3.5" active />
                    <span>在音乐台中播放</span>
                  </button>
                )}

                {book.beatmapsetId && bestManiaDiff && onPreviewBeatmap && (
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewBeatmap(
                        book.beatmapsetId!,
                        bestManiaDiff.beatmapId,
                        book.titleUnicode || book.title,
                      )
                    }
                    className="rhine-btn-outline inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-semibold"
                  >
                    <Eye className="h-3.5 w-3.5 text-[var(--rb-accent)]" />
                    <span>Mania 谱面预览</span>
                  </button>
                )}

                {book.beatmapsetId && canLoadIntoGame && onLoadIntoGame && (
                  <button
                    type="button"
                    onClick={() => onLoadIntoGame(book.beatmapsetId!)}
                    className="rhine-btn-outline inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-semibold"
                  >
                    <Gamepad2 className="h-3.5 w-3.5 text-[var(--rb-accent)]" />
                    <span>加载到游戏</span>
                  </button>
                )}

                {book.stableFolder && (
                  <button
                    type="button"
                    onClick={() => void handleOpenFolder()}
                    className="rhine-btn-outline inline-flex h-8 items-center gap-1.5 px-3 text-[0.75rem] font-semibold"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-[var(--rb-muted)]" />
                    <span>打开本地目录</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT PAGE: Tabs (Difficulties / Score History / Archive Meta & Breakdown) */}
          <section className="flex min-h-0 flex-col px-5 py-4 sm:px-7 sm:py-5">
            {/* Tab Header with Rhine Lab 180ms Underline Indicator */}
            <div
              ref={tabsRef}
              role="tablist"
              aria-label="档案详页分页"
              className="relative flex shrink-0 items-center gap-6 border-b border-[var(--rb-line)]"
            >
              {(
                [
                  { id: 'difficulties', code: '01', label: `难度一览 (${difficulties.length})` },
                  { id: 'scores', code: '02', label: `历史成绩 (${scores.length})` },
                  { id: 'archive', code: '03', label: '曲目详档' },
                ] as Array<{ id: SpreadTab; code: string; label: string }>
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabBtnRefs.current[tab.id] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative pb-3 text-left transition-colors ${
                      active ? 'text-[var(--rb-ink)]' : 'text-[var(--rb-muted)] hover:text-[var(--rb-ink)]'
                    }`}
                  >
                    <span className="font-mono text-[0.6875rem] opacity-70">{tab.code}</span>{' '}
                    <span className="text-[0.84375rem] font-semibold">{tab.label}</span>
                  </button>
                );
              })}
              <span
                className="pointer-events-none absolute bottom-[-1px] left-0 h-[2px] bg-[var(--rb-ink)] transition-transform duration-180 ease-out"
                style={{
                  width: `${indicatorStyle.width}px`,
                  transform: `translateX(${indicatorStyle.x}px)`,
                }}
              />
            </div>

            {/* Tab Content Area */}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {loadingDetail && !bookDetail ? (
                <div className="flex h-full items-center justify-center gap-2 text-[0.84375rem] text-[var(--rb-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--rb-accent)]" />
                  <span>正在读取难度与本地历史成绩…</span>
                </div>
              ) : activeTab === 'difficulties' ? (
                <div className="space-y-2 pb-2">
                  {difficulties.length === 0 ? (
                    <div className="py-12 text-center text-[0.84375rem] text-[var(--rb-muted)]">
                      该书目暂无解析到可用难度。
                    </div>
                  ) : (
                    difficulties.map((diff: BookDifficultyRecord) => {
                      const starColor = getStarColor(diff.starRating);
                      const lnInfo = getLnCategory(diff.lnRatio);
                      return (
                        <div
                          key={diff.key}
                          onClick={() => {
                            setDiffFilter(diff.version);
                            setActiveTab('scores');
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setDiffFilter(diff.version);
                              setActiveTab('scores');
                            }
                          }}
                          className="group flex cursor-pointer items-center justify-between gap-3 border border-[var(--rb-line)] bg-[var(--rb-panel)] px-3 py-2.5 transition-colors hover:border-[var(--rb-accent)]"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[0.71875rem] font-bold tabular-nums"
                                style={{
                                  backgroundColor: starColor.bg,
                                  color: starColor.text,
                                  borderColor: starColor.border,
                                }}
                              >
                                ★ {diff.starRating.toFixed(2)}
                              </span>
                              <span className="border border-[var(--rb-line)] px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-[var(--rb-ink)]">
                                {diff.modeInt === 3 && diff.keyCount
                                  ? `${diff.keyCount}K`
                                  : diff.mode.toUpperCase()}
                              </span>
                              <span className="truncate text-[0.875rem] font-bold text-[var(--rb-ink)] group-hover:text-[var(--rb-accent)]">
                                {diff.version}
                              </span>
                              {lnInfo && (
                                <span
                                  className="border border-[var(--rb-line)] px-1.5 py-0.5 font-mono text-[0.65625rem] text-[var(--rb-muted)]"
                                  title={lnInfo.tooltip}
                                >
                                  {lnInfo.fullLabel}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[0.6875rem] text-[var(--rb-muted)]">
                              <span>OD {diff.od}</span>
                              <span>HP {diff.hp}</span>
                              {diff.totalObjects > 0 && <span>{diff.totalObjects} objs</span>}
                              <span>{diff.bpm} BPM</span>
                              <span>{formatDuration(diff.lengthSec)}</span>
                              <span>
                                {diff.inStable && diff.inLazer
                                  ? 'Stable+Lazer'
                                  : diff.inLazer
                                    ? 'Lazer'
                                    : 'Stable'}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            <div className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {diff.bestGrade && (
                                  <span
                                    className={`border px-1 py-px font-mono text-[0.65625rem] font-bold ${GRADE_STYLE[diff.bestGrade]}`}
                                  >
                                    {diff.bestGrade}
                                  </span>
                                )}
                                <span className="font-stat text-[0.9375rem] font-bold text-[var(--rb-ink)] tabular-nums">
                                  {diff.bestPp !== null
                                    ? `${diff.bestPp.toFixed(1)}pp`
                                    : `~${diff.estimated98Pp.toFixed(0)}pp`}
                                </span>
                              </div>
                              <div className="font-mono text-[0.6875rem] text-[var(--rb-muted)] tabular-nums">
                                {diff.playCount > 0
                                  ? `${diff.playCount}次 · ${diff.bestAccuracy?.toFixed(2)}%`
                                  : '未游玩 · 98%参考'}
                              </div>
                            </div>

                            {book.beatmapsetId && diff.modeInt === 3 && onPreviewBeatmap && (
                              <button
                                type="button"
                                title="打开 Mania 轨道预览"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPreviewBeatmap(
                                    book.beatmapsetId!,
                                    diff.beatmapId,
                                    `${book.titleUnicode} [${diff.version}]`,
                                  );
                                }}
                                className="rhine-btn-outline flex h-8 w-8 items-center justify-center"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : activeTab === 'scores' ? (
                <div className="flex min-h-0 flex-col space-y-2.5 pb-2">
                  {/* Score Filters Row (using SelectField component) */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <SelectField
                      value={diffFilter}
                      onChange={setDiffFilter}
                      title="按难度筛选历史成绩"
                      className="text-[0.75rem]"
                    >
                      <option value="all">全部难度 ({scores.length})</option>
                      {difficulties.map((d) => (
                        <option key={d.key} value={d.version}>
                          {d.version} ({d.playCount})
                        </option>
                      ))}
                    </SelectField>

                    <SelectField
                      value={sourceFilter}
                      onChange={(v) => setSourceFilter(v as ScoreSourceFilter)}
                      title="按客户端来源筛选"
                      className="text-[0.75rem]"
                    >
                      <option value="all">全部客户端</option>
                      <option value="stable">仅 osu!stable ({book.stablePlayCount})</option>
                      <option value="lazer">仅 osu!lazer ({book.lazerPlayCount})</option>
                    </SelectField>

                    <SelectField
                      value={scoreSort}
                      onChange={(v) => setScoreSort(v as ScoreSortMode)}
                      title="历史成绩排序"
                      className="text-[0.75rem]"
                    >
                      <option value="recent">按游玩时间</option>
                      <option value="pp">按 PP 最高</option>
                      <option value="accuracy">按准度最高</option>
                      <option value="score">按分数最高</option>
                    </SelectField>
                  </div>

                  {filteredScores.length === 0 ? (
                    <div className="flex flex-col items-center justify-center border border-dashed border-[var(--rb-line)] py-12 text-center">
                      <Trophy className="mb-2 h-6 w-6 text-[var(--rb-muted)] opacity-60" />
                      <p className="text-[0.84375rem] font-semibold text-[var(--rb-ink)]">
                        暂无符合筛选条件的历史成绩
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-[var(--rb-muted)]">
                        在 osu!stable 或 osu!lazer 游玩该谱面后将自动记录在这里
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredScores.map((sc: BookScoreRecord) => (
                        <div
                          key={sc.id}
                          className="border border-[var(--rb-line)] bg-[var(--rb-panel)] px-3 py-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span
                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border font-mono text-[0.875rem] font-bold ${GRADE_STYLE[sc.grade]}`}
                              >
                                {sc.grade}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate text-[0.84375rem] font-bold text-[var(--rb-ink)]">
                                    {sc.difficultyName}
                                  </span>
                                  <span
                                    className={`border px-1.5 py-px font-mono text-[0.625rem] font-bold uppercase ${
                                      sc.source === 'lazer'
                                        ? 'rhine-tag-lazer'
                                        : 'rhine-tag-stable'
                                    }`}
                                  >
                                    {sc.source}
                                  </span>
                                  {sc.mods.length > 0 ? (
                                    sc.mods.map((m) => (
                                      <span
                                        key={m}
                                        className="border border-[var(--rb-accent)]/50 bg-[var(--rb-accent)]/12 px-1.5 py-px font-mono text-[0.625rem] font-bold text-[var(--rb-ink)]"
                                      >
                                        {m}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="font-mono text-[0.625rem] text-[var(--rb-muted)]">
                                      NM
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 font-mono text-[0.6875rem] text-[var(--rb-muted)]">
                                  <span>{formatDateTime(sc.playedAt)}</span>
                                  <span>{sc.player}</span>
                                  <span>{sc.maxCombo}x</span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="flex items-baseline justify-end gap-1">
                                <span className="font-stat text-[1.05rem] font-bold text-[var(--rb-ink)] tabular-nums">
                                  {sc.pp !== null ? sc.pp.toFixed(1) : '—'}
                                </span>
                                <span className="font-mono text-[0.6875rem] font-bold text-[var(--rb-accent)]">
                                  pp
                                </span>
                                <span className="text-[0.625rem] text-[var(--rb-muted)]">
                                  ({sc.ppSource === 'recorded' ? '实录' : sc.isRankedPp ? '估算' : '模拟'})
                                </span>
                              </div>
                              <div className="font-mono text-[0.71875rem] text-[var(--rb-ink)] tabular-nums">
                                <strong>{sc.accuracy.toFixed(2)}%</strong> ·{' '}
                                <span className="text-[var(--rb-muted)]">
                                  {sc.score.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Mania Judgement Strip */}
                          {sc.countMax + sc.count300 + sc.count200 + sc.count100 + sc.count50 + sc.countMiss > 0 && (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rb-line)]/70 pt-1.5 font-mono text-[0.65625rem] text-[var(--rb-muted)] tabular-nums">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                {sc.modeInt === 3 && (
                                  <span className="text-sky-500">MAX {sc.countMax}</span>
                                )}
                                <span className="text-amber-500">300 {sc.count300}</span>
                                {sc.modeInt === 3 && (
                                  <span className="text-emerald-500">200 {sc.count200}</span>
                                )}
                                <span className="text-blue-500">100 {sc.count100}</span>
                                <span className="text-purple-500">50 {sc.count50}</span>
                                <span className={sc.countMiss > 0 ? 'text-rose-500 font-bold' : ''}>
                                  MISS {sc.countMiss}
                                </span>
                              </div>
                              {sc.maRatio !== null && (
                                <span className="font-semibold text-[var(--rb-ink)]">
                                  MA {sc.maRatio.toFixed(2)}:1
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 pb-2">
                  {/* Grade & Play Breakdown */}
                  <div className="border border-[var(--rb-line)] bg-[var(--rb-panel)] p-3.5">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="shrink-0 font-mono text-[0.6875rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                        GRADE DISTRIBUTION / 评级分布
                      </span>
                      {bookDetail?.avgAccuracy !== null && bookDetail?.avgAccuracy !== undefined && (
                        <span className="font-mono text-[0.71875rem] text-[var(--rb-ink)]">
                          均准度 {bookDetail.avgAccuracy.toFixed(2)}% · 累计击打{' '}
                          {bookDetail.totalNotesPlayed.toLocaleString()} Note
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
                      {GRADE_ORDER.map((g) => {
                        const cnt = bookDetail?.gradeCounts[g] ?? 0;
                        return (
                          <div
                            key={g}
                            className={`flex flex-col items-center border px-1.5 py-1.5 ${
                              cnt > 0
                                ? GRADE_STYLE[g]
                                : 'border-[var(--rb-line)] opacity-45'
                            }`}
                          >
                            <span className="font-mono text-[0.75rem] font-bold">{g}</span>
                            <span className="font-stat text-[0.875rem] font-bold tabular-nums">
                              {cnt}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Per-Difficulty Play Share Bars */}
                  {difficulties.length > 0 && (
                    <div className="border border-[var(--rb-line)] bg-[var(--rb-panel)] p-3.5">
                      <div className="mb-2.5 font-mono text-[0.6875rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                        DIFFICULTY PLAY SHARE / 各难度游玩次数占比
                      </div>
                      <div className="space-y-2">
                        {difficulties.map((d) => {
                          const pct =
                            d.playCount > 0 ? Math.max(4, (d.playCount / maxDifficultyPlays) * 100) : 0;
                          return (
                            <div key={d.key} className="space-y-0.5">
                              <div className="flex items-center justify-between text-[0.75rem]">
                                <span className="truncate font-semibold text-[var(--rb-ink)]">
                                  {d.version}
                                </span>
                                <span className="font-mono text-[0.6875rem] text-[var(--rb-muted)] tabular-nums">
                                  {d.playCount} 次
                                  {d.bestPp !== null ? ` · ${d.bestPp.toFixed(1)}pp` : ''}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-[var(--rb-line)]/40">
                                <div
                                  className="h-full bg-[var(--rb-accent)] transition-[width] duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Metadata & Clickable Tags */}
                  <div className="border border-[var(--rb-line)] bg-[var(--rb-panel)] p-3.5 text-[0.78125rem]">
                    <div className="mb-2 flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.1em] text-[var(--rb-muted)] uppercase">
                      <Disc3 className="h-3.5 w-3.5" />
                      <span>REPOSITORY METADATA / 曲库档案元信息</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 text-[var(--rb-muted)] sm:grid-cols-2">
                      <div>
                        档案标识：<code className="font-mono text-[var(--rb-ink)]">{book.bookKey}</code>
                      </div>
                      <div>
                        加入时间：<span className="text-[var(--rb-ink)]">{formatShortDate(book.dateAdded)}</span>
                      </div>
                      {book.stableFolder && (
                        <div className="truncate sm:col-span-2" title={book.stableFolder}>
                          Stable 目录：<span className="font-mono text-[var(--rb-ink)]">{book.stableFolder}</span>
                        </div>
                      )}
                    </div>

                    {book.tags.length > 0 && (
                      <div className="mt-3 border-t border-[var(--rb-line)] pt-2.5">
                        <div className="mb-1.5 flex items-center gap-1 font-mono text-[0.65625rem] text-[var(--rb-muted)]">
                          <Sparkles className="h-3 w-3 text-[var(--rb-accent)]" />
                          <span>TAGS (点击按标签筛选档案库)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {book.tags.slice(0, 24).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                onClose();
                                onFilterByTag?.(tag);
                              }}
                              className="border border-[var(--rb-line)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--rb-muted)] transition-colors hover:border-[var(--rb-accent)] hover:text-[var(--rb-ink)]"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
});
