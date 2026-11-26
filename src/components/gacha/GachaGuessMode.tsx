import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Download,
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { drawGachaBeatmapsets } from '../../api';
import { getStarColor, getStarSpectrum } from '../../constants';
import { useI18n } from '../../i18n';
import type {
  DownloadTarget,
  DownloadTask,
  GachaPackId,
  NormalizedBeatmapset,
  SearchFilters,
} from '../../types';
import { calculateBeatmapPp, formatPp } from '../../utils/pp';
import { SelectField } from '../SelectField';
import { BeatmapGachaCard } from './BeatmapGachaCard';
import { ScrambleText } from './GachaAtmosphere';
import { playGuessRevealSound } from './gachaSound';
import {
  getGachaPacks,
  pickFeaturedBeatmap,
  pickGuessScenario,
  scoreStarGuess,
  type GuessScenarioChoice,
  type StarGuessScoreResult,
} from './gachaUtils';

interface GachaGuessModeProps {
  baseFilters: SearchFilters;
  target: DownloadTarget;
  activeTaskBySet: Map<number, DownloadTask>;
  playingSetId: number | null;
  isPlaying: boolean;
  onTogglePlaySet: (set: NormalizedBeatmapset) => void;
  onDownload: (set: NormalizedBeatmapset, target: DownloadTarget) => void;
  onOpenDetail: (set: NormalizedBeatmapset, diffId?: number | null) => void;
  onTriggerEffect: (intensity?: number, hexColor?: string) => void;
}

const BEST_SCORE_STORAGE_KEY = 'osu4k-gacha-guess-best';

function readBestScore(): number {
  try {
    const n = Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  } catch {
    return 0;
  }
}

export function GachaGuessMode({
  baseFilters,
  target,
  activeTaskBySet,
  playingSetId,
  isPlaying,
  onTogglePlaySet,
  onDownload,
  onOpenDetail,
  onTriggerEffect,
}: GachaGuessModeProps) {
  const { lang, t } = useI18n();
  const packs = getGachaPacks(lang).filter((p) => p.id !== 'loved_chaos');

  const [packId, setPackId] = useState<GachaPackId>('pp_farm');
  const [queue, setQueue] = useState<NormalizedBeatmapset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundNum, setRoundNum] = useState(1);
  const [scenario, setScenario] = useState<GuessScenarioChoice>(() =>
    pickGuessScenario(Math.floor(Math.random() * 100), lang),
  );
  const [guessStars, setGuessStars] = useState(4.5);
  const [revealed, setRevealed] = useState<StarGuessScoreResult | null>(null);
  const [revealCount, setRevealCount] = useState(0);

  const [totalScore, setTotalScore] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalError, setTotalError] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestScore, setBestScore] = useState<number>(readBestScore);

  const seenIdsRef = useRef<Set<number>>(new Set());

  const fetchBatch = useCallback(
    async (chosenPack: GachaPackId, reset = false) => {
      setLoading(true);
      setError(null);
      if (reset) {
        seenIdsRef.current.clear();
        setQueue([]);
        setRevealed(null);
      }
      try {
        const res = await drawGachaBeatmapsets({
          count: 8,
          packId: chosenPack,
          baseFilters,
          excludeIds: Array.from(seenIdsRef.current).slice(-140),
          requireRankedPp: true,
        });
        for (const c of res.cards) seenIdsRef.current.add(c.id);
        setQueue((prev) => {
          const base = reset ? [] : prev;
          const baseIds = new Set(base.map((x) => x.id));
          return [...base, ...res.cards.filter((c) => !baseIds.has(c.id))];
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('获取竞猜谱面失败', 'Failed to draw ranked maps'));
      } finally {
        setLoading(false);
      }
    },
    [baseFilters, t],
  );

  useEffect(() => {
    void fetchBatch(packId, true);
  }, [packId]);

  const currentCard = queue[0] ?? null;
  const featuredDiff = currentCard ? pickFeaturedBeatmap(currentCard, baseFilters) : null;
  const actualStars = featuredDiff?.difficultyRating ?? 0;

  useEffect(() => {
    setScenario(pickGuessScenario(roundNum + (currentCard?.id ?? 0), lang));
  }, [lang, roundNum, currentCard?.id]);

  useEffect(() => {
    if (!loading && queue.length > 0 && queue.length <= 2) {
      void fetchBatch(packId, false);
    }
  }, [queue.length, loading, packId, fetchBatch]);

  const scenarioPp = featuredDiff
    ? Math.round(calculateBeatmapPp(featuredDiff, scenario.input).pp)
    : 0;

  const handleSubmitGuess = () => {
    if (!currentCard || !featuredDiff || revealed) return;
    const res = scoreStarGuess(guessStars, actualStars, lang);
    setRevealed(res);
    setRevealCount((c) => c + 1);
    playGuessRevealSound(res.score);

    if (res.grade === 'SS' || res.grade === 'S') {
      onTriggerEffect(0.75, getStarSpectrum(actualStars));
    }

    const nextTotal = totalScore + res.score;
    setTotalScore(nextTotal);
    setAnsweredCount((n) => n + 1);
    setTotalError((e) => e + res.diff);
    setStreak((s) => (res.diff <= 0.6 ? s + 1 : 0));

    if (nextTotal > bestScore) {
      setBestScore(nextTotal);
      try {
        localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(nextTotal));
      } catch {
        // Ignore storage error
      }
    }
  };

  const handleNextCard = () => {
    const nextRound = roundNum + 1;
    setQueue((prev) => prev.slice(1));
    setRevealed(null);
    setRoundNum(nextRound);
    setGuessStars(4.5);
  };

  const avgErr = answeredCount > 0 ? (totalError / answeredCount).toFixed(2) : '—';
  const toRulerPct = (sr: number) => Math.min(100, Math.max(0, ((sr - 0.5) / 11.5) * 100));
  const sliderPct = toRulerPct(guessStars);
  const actualPct = toRulerPct(actualStars);
  const guessColor = getStarSpectrum(guessStars);
  const actualBadge = getStarColor(actualStars);

  const clueBanner = currentCard && featuredDiff && (
    <div className="rounded-[2px] border-l-2 border-emerald-400 bg-black/75 px-3 py-2 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 text-[0.6875rem] font-semibold text-amber-300">
        <span className="truncate">{scenario.shortTag}</span>
        <span className="ga-mono shrink-0 text-white/75">
          {t('目标难度', 'Target')}: {featuredDiff.version}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="font-stat text-[1.25rem] font-extrabold text-emerald-300 tabular-nums">
          {formatPp(scenarioPp)} PP
        </span>
        <span className="ga-mono text-[0.6875rem] text-white/70 tabular-nums">
          OD {featuredDiff.od.toFixed(1)} ·{' '}
          {featuredDiff.lnRatio !== null ? `LN ${featuredDiff.lnRatio}%` : `HP ${featuredDiff.hp.toFixed(1)}`}
        </span>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5 lg:flex-row lg:overflow-hidden">
      {/* Left: Crop-Framed Specimen Stage */}
      <div className="flex shrink-0 flex-col items-center justify-center lg:w-[385px] xl:w-[415px]">
        <div className="mb-2.5 flex w-full items-center justify-between gap-2">
          <div className="w-44">
            <SelectField
              value={packId}
              onChange={(v) => setPackId(v as GachaPackId)}
              className="h-8 text-[0.78125rem]"
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          </div>
          <button
            type="button"
            disabled={loading}
            data-ga-cursor={t('换题目', 'RELOAD POOL')}
            onClick={() => void fetchBatch(packId, true)}
            className="ga-line-btn h-8 px-3 text-[0.75rem]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('换一组题目', 'Reload Pool')}</span>
          </button>
        </div>

        {/* Printmaker Crop-Framed Specimen Mount */}
        <div className="relative flex h-[456px] w-[min(100%,352px)] flex-col items-center justify-center rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel)] p-4 backdrop-blur-sm sm:h-[490px]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 left-1.5 h-3.5 w-3.5 border-t-2 border-l-2 border-[var(--ga-cobalt)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 h-3.5 w-3.5 border-t-2 border-r-2 border-[var(--ga-cobalt)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1.5 left-1.5 h-3.5 w-3.5 border-b-2 border-l-2 border-[var(--ga-cobalt)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 bottom-1.5 h-3.5 w-3.5 border-r-2 border-b-2 border-[var(--ga-cobalt)]"
          />

          <div className="ga-mono mb-2 flex w-full items-center justify-between text-[0.625rem] font-bold tracking-[0.16em] text-[var(--ga-ink-3)] uppercase">
            <span>SPECIMEN #{String(roundNum).padStart(2, '0')}</span>
            <span className={revealed ? 'text-emerald-500' : 'text-[var(--ga-cobalt)]'}>
              {revealed ? 'VERIFIED' : 'SR MASKED'}
            </span>
          </div>

          <div className="min-h-0 w-full flex-1">
            {loading && !currentCard ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--ga-ink-2)]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--ga-cobalt)]" />
                <span className="text-[0.84375rem] font-semibold">
                  {t('正在抽取 Ranked 竞猜题目…', 'Drawing ranked challenge map…')}
                </span>
              </div>
            ) : error && !currentCard ? (
              <div className="flex h-full flex-col items-center justify-center space-y-3 text-center">
                <p className="text-[0.84375rem] text-rose-500">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchBatch(packId, true)}
                  className="ga-solid-btn px-4 py-1.5 text-[0.8125rem]"
                >
                  {t('重试', 'Retry')}
                </button>
              </div>
            ) : currentCard ? (
              <BeatmapGachaCard
                beatmapset={currentCard}
                ppScenario={scenario.input}
                faceDown={false}
                revealTrigger={revealCount}
                maskStars={!revealed}
                clueBanner={clueBanner}
                target={target}
                activeTask={activeTaskBySet.get(currentCard.id)}
                isPlaying={isPlaying && playingSetId === currentCard.id}
                className="h-full w-full"
                onTogglePlay={onTogglePlaySet}
                onDownload={onDownload}
                onOpenDetail={(s, diffId) => onOpenDetail(s, diffId)}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Right: Precision Calibration Console */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-3.5 overflow-y-auto rounded-[3px] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] p-4 backdrop-blur-md sm:p-5">
        {/* Top Hairline-Divided Telemetry Matrix */}
        <div className="grid grid-cols-2 border border-[var(--ga-line)] bg-[var(--ga-panel)] sm:grid-cols-5 sm:divide-x sm:divide-[var(--ga-line)]">
          <div className="px-3 py-2">
            <div className="ga-mono text-[0.625rem] font-semibold tracking-wider text-[var(--ga-ink-3)] uppercase">
              {t('总分 SCORE', 'SCORE')}
            </div>
            <div className="ga-serif text-[1.35rem] font-bold text-[var(--ga-cobalt)] tabular-nums">
              {totalScore}
            </div>
          </div>
          <div className="px-3 py-2">
            <div className="ga-mono text-[0.625rem] font-semibold tracking-wider text-[var(--ga-ink-3)] uppercase">
              {t('题号 ROUND', 'ROUND')}
            </div>
            <div className="ga-serif text-[1.35rem] font-bold text-[var(--ga-ink)] tabular-nums">
              #{String(roundNum).padStart(2, '0')}
            </div>
          </div>
          <div className="px-3 py-2">
            <div className="ga-mono text-[0.625rem] font-semibold tracking-wider text-[var(--ga-ink-3)] uppercase">
              {t('平均误差', 'AVG Δ★')}
            </div>
            <div className="ga-serif text-[1.35rem] font-bold text-[var(--ga-ink)] tabular-nums">
              {avgErr === '—' ? '—' : `±${avgErr}★`}
            </div>
          </div>
          <div className="px-3 py-2">
            <div className="ga-mono text-[0.625rem] font-semibold tracking-wider text-[var(--ga-ink-3)] uppercase">
              {t('精准连击', 'STREAK')}
            </div>
            <div className="ga-serif text-[1.35rem] font-bold text-emerald-500 tabular-nums">
              {streak}🔥
            </div>
          </div>
          <div className="col-span-2 bg-[color-mix(in_srgb,var(--ga-cobalt)_8%,transparent)] px-3 py-2 sm:col-span-1">
            <div className="ga-mono flex items-center gap-1 text-[0.625rem] font-bold tracking-wider text-amber-500 uppercase">
              <Trophy className="h-3 w-3" />
              <span>{t('历史最高', 'BEST')}</span>
            </div>
            <div className="ga-serif text-[1.35rem] font-bold text-amber-500 tabular-nums">
              {bestScore}
            </div>
          </div>
        </div>

        {/* Scenario Dossier Strip */}
        {currentCard && featuredDiff && (
          <div className="space-y-2.5 border-l-2 border-[var(--ga-cobalt)] bg-[var(--ga-panel)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-bold text-[var(--ga-ink)]">
                <HelpCircle className="h-4 w-4 text-[var(--ga-cobalt)]" />
                <span>
                  {t(
                    '根据下方情景 PP、曲风封面与参数，推演真实星数！',
                    'Estimate the true Star Rating from the scenario PP & chart telemetry!',
                  )}
                </span>
              </span>
              <span className="ga-mono rounded-[2px] border border-[var(--ga-line)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--ga-cobalt)]">
                {scenario.detailLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[0.78125rem] sm:grid-cols-4">
              <div className="border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-2.5 py-1.5">
                <span className="ga-mono text-[0.65625rem] text-[var(--ga-ink-3)]">
                  {t('情景 PP', 'SCENARIO PP')}:{' '}
                </span>
                <strong className="ga-mono text-emerald-500 tabular-nums">
                  {formatPp(scenarioPp)}pp
                </strong>
              </div>
              <div className="border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-2.5 py-1.5">
                <span className="ga-mono text-[0.65625rem] text-[var(--ga-ink-3)]">BPM: </span>
                <strong className="ga-mono text-[var(--ga-ink)] tabular-nums">
                  {Math.round(currentCard.bpm * scenario.input.rate)}
                </strong>
              </div>
              <div className="border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-2.5 py-1.5">
                <span className="ga-mono text-[0.65625rem] text-[var(--ga-ink-3)]">LN%: </span>
                <strong className="ga-mono text-[var(--ga-ink)] tabular-nums">
                  {featuredDiff.lnRatio !== null ? `${featuredDiff.lnRatio}%` : '—'}
                </strong>
              </div>
              <div className="border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] px-2.5 py-1.5">
                <span className="ga-mono text-[0.65625rem] text-[var(--ga-ink-3)]">
                  {t('键数', 'KEYS')}:{' '}
                </span>
                <strong className="ga-mono text-[var(--ga-ink)] tabular-nums">
                  {featuredDiff.modeInt === 3 ? `${Math.round(featuredDiff.cs)}K` : featuredDiff.mode}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Guess Optical Calibration Ruler OR Analytical Scorecard */}
        {!revealed ? (
          <div className="space-y-4 border border-[var(--ga-line)] bg-[var(--ga-panel)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="ga-mono text-[0.625rem] tracking-[0.18em] text-[var(--ga-ink-3)] uppercase">
                  OPTICAL CALIBRATION // ★ 0.50 – 12.00
                </div>
                <span className="ga-cn-serif text-[0.9375rem] font-bold text-[var(--ga-ink)]">
                  {t('你的猜测星数', 'Your Star Rating Guess')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="ga-serif inline-flex items-center gap-1 rounded-[2px] px-3 py-1 text-[1.25rem] font-bold shadow-sm tabular-nums"
                  style={{
                    backgroundColor: guessColor,
                    color: guessStars >= 6.5 ? '#ffd966' : '#090b10',
                  }}
                >
                  ★ {guessStars.toFixed(2)}
                </span>
                <input
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.05}
                  value={guessStars}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setGuessStars(Math.min(12, Math.max(0.5, n)));
                  }}
                  className="field ga-mono w-20 text-center text-[0.875rem] font-bold tabular-nums"
                />
              </div>
            </div>

            {/* Spectrum Track + Architectural Graduated Calibration Ruler */}
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  type="range"
                  min={0.5}
                  max={12.0}
                  step={0.01}
                  value={guessStars}
                  onChange={(e) => setGuessStars(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(90deg, #4290fb 0%, #4fffd5 18%, #7cff4f 34%, #f6f05c 48%, #ff4e6f 64%, #c645b8 80%, #18158e 100%)`,
                  }}
                  className="h-3 w-full cursor-pointer appearance-none rounded-[2px] outline-none"
                  aria-label={t('猜测星数滑块', 'Guess star rating slider')}
                />
              </div>

              {/* Calibrated Ruler Ticks */}
              <div className="relative h-5 border-t border-[var(--ga-line)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 h-3.5 w-[2px] -translate-x-1/2 bg-[var(--ga-cobalt)]"
                  style={{ left: `${sliderPct}%` }}
                />
                <div className="flex justify-between pt-1.5 font-mono text-[0.65625rem] text-[var(--ga-ink-3)] tabular-nums">
                  <span>0.50★</span>
                  <span>3.5★</span>
                  <span>6.0★</span>
                  <span>9.0★</span>
                  <span>12.00★</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[-0.5, -0.1, 0.1, 0.5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    data-ga-cursor={`${delta > 0 ? '+' : ''}${delta}★`}
                    onClick={() =>
                      setGuessStars((prev) =>
                        Math.round(Math.min(12, Math.max(0.5, prev + delta)) * 100) / 100,
                      )
                    }
                    className="ga-line-btn h-8 px-2.5 font-mono text-[0.75rem]"
                  >
                    {delta > 0 ? `+${delta}` : delta}★
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!currentCard}
                  data-ga-cursor="SKIP"
                  onClick={handleNextCard}
                  className="ga-line-btn h-9 px-3.5 text-[0.78125rem]"
                >
                  {t('跳过换题', 'Skip')}
                </button>
                <button
                  type="button"
                  disabled={!currentCard || !featuredDiff}
                  data-ga-cursor="REVEAL"
                  onClick={handleSubmitGuess}
                  className="ga-solid-btn h-9 px-5 text-[0.84375rem]"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{t('锁定并揭晓结果', 'Lock & Reveal')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-3 border border-[var(--ga-cobalt)] bg-[color-mix(in_srgb,var(--ga-cobalt)_8%,var(--ga-panel))] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="ga-serif flex h-11 w-11 items-center justify-center rounded-[2px] bg-[var(--ga-cobalt)] text-[1.25rem] font-bold text-white shadow">
                  {revealed.grade}
                </span>
                <div>
                  <div className="ga-serif text-[1.25rem] font-bold text-[var(--ga-ink)]">
                    <ScrambleText
                      text={`+${revealed.score} ${t('分', 'pts')}`}
                      triggerKey={revealCount}
                    />
                  </div>
                  <div className="text-[0.78125rem] font-medium text-[var(--ga-ink-2)]">
                    {revealed.feedback}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {currentCard && (
                  <>
                    <button
                      type="button"
                      data-ga-cursor="DOWNLOAD"
                      onClick={() => onDownload(currentCard, target)}
                      className="ga-line-btn h-9 px-3 text-[0.78125rem]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{t('下载谱面', 'Download')}</span>
                    </button>
                    <button
                      type="button"
                      data-ga-cursor="DETAILS"
                      onClick={() => onOpenDetail(currentCard, featuredDiff?.id ?? null)}
                      className="ga-line-btn h-9 px-3 text-[0.78125rem]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>{t('详情', 'Details')}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  data-ga-cursor="NEXT CARD"
                  onClick={handleNextCard}
                  className="ga-solid-btn h-9 px-4 text-[0.84375rem]"
                >
                  <span>{t('下一张卡牌', 'Next Card')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Visual Guess vs Actual Comparison Ruler */}
            <div className="space-y-1.5 border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] p-2.5">
              <div className="ga-mono flex justify-between text-[0.625rem] text-[var(--ga-ink-3)] uppercase">
                <span>DELTA SPECTRUM COMPARISON</span>
                <span>
                  {revealed.signedDiff >= 0 ? '+' : ''}
                  {revealed.signedDiff.toFixed(2)}★
                </span>
              </div>
              <div className="relative h-3 w-full rounded-[2px] bg-[var(--ga-line)]">
                {/* Error Span Highlight */}
                <div
                  className="absolute top-0 bottom-0 bg-[var(--ga-cobalt)]/35"
                  style={{
                    left: `${Math.min(sliderPct, actualPct)}%`,
                    width: `${Math.max(1.5, Math.abs(actualPct - sliderPct))}%`,
                  }}
                />
                {/* Guess Pin */}
                <div
                  title={`Guess: ${guessStars.toFixed(2)}★`}
                  className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 bg-[var(--ga-ink)]"
                  style={{ left: `${sliderPct}%` }}
                />
                {/* Actual Pin */}
                <div
                  title={`Actual: ${actualStars.toFixed(2)}★`}
                  className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 bg-amber-400 shadow-[0_0_8px_#fbbf24]"
                  style={{ left: `${actualPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-[var(--ga-line)] border border-[var(--ga-line)] bg-[var(--ga-panel-strong)] text-center">
              <div className="px-2.5 py-2">
                <div className="ga-mono text-[0.625rem] text-[var(--ga-ink-3)] uppercase">
                  {t('你的猜测', 'YOUR GUESS')}
                </div>
                <div className="ga-mono text-[1rem] font-bold text-[var(--ga-ink)] tabular-nums">
                  ★ {guessStars.toFixed(2)}
                </div>
              </div>
              <div className="px-2.5 py-2">
                <div className="ga-mono text-[0.625rem] text-[var(--ga-ink-3)] uppercase">
                  {t('真实星数', 'ACTUAL SR')}
                </div>
                <div className="mt-0.5 flex justify-center">
                  <span
                    className="ga-mono inline-flex rounded-[2px] px-2.5 py-0.5 text-[0.875rem] font-extrabold tabular-nums"
                    style={{ backgroundColor: actualBadge.bg, color: actualBadge.text }}
                  >
                    ★ {actualStars.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-2">
                <div className="ga-mono text-[0.625rem] text-[var(--ga-ink-3)] uppercase">
                  {t('偏差值', 'ERROR Δ')}
                </div>
                <div className="ga-mono text-[1rem] font-bold text-[var(--ga-cobalt)] tabular-nums">
                  {revealed.signedDiff >= 0 ? '+' : ''}
                  {revealed.signedDiff.toFixed(2)}★
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footnote Rules Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ga-line)] pt-2 text-[0.71875rem] text-[var(--ga-ink-3)]">
          <span className="inline-flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-amber-500" />
            <span>
              {t(
                '评分规则：误差越小分越高，±0.15★ 内即获 SS 评级 (~975+分)',
                'Scoring: Closer guess = exponentially higher score (<=0.15★ = SS rank)',
              )}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('所有题目均来自本地未下载谱面', 'Non-local ranked maps only')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
