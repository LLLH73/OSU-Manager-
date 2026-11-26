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

  // Keep scenario label synchronized cleanly if UI language toggles mid-round
  useEffect(() => {
    setScenario(pickGuessScenario(roundNum + (currentCard?.id ?? 0), lang));
  }, [lang, roundNum, currentCard?.id]);

  // Refill background queue seamlessly
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
  const sliderPct = Math.min(100, Math.max(0, ((guessStars - 0.5) / 11.5) * 100));
  const guessColor = getStarSpectrum(guessStars);
  const actualBadge = getStarColor(actualStars);

  const clueBanner = currentCard && featuredDiff && (
    <div className="rounded-xl bg-black/65 px-3 py-2 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 text-[0.6875rem] font-semibold text-amber-300">
        <span className="truncate">{scenario.shortTag}</span>
        <span className="font-mono shrink-0 text-white/75">
          {t('目标难度', 'Target')}: {featuredDiff.version}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="font-stat text-[1.25rem] font-extrabold text-emerald-300 tabular-nums">
          {formatPp(scenarioPp)} PP
        </span>
        <span className="font-mono text-[0.6875rem] text-white/70 tabular-nums">
          OD {featuredDiff.od.toFixed(1)} ·{' '}
          {featuredDiff.lnRatio !== null ? `LN ${featuredDiff.lnRatio}%` : `HP ${featuredDiff.hp.toFixed(1)}`}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4 lg:flex-row lg:overflow-hidden">
      {/* Left: Mystery Card Stage */}
      <div className="flex shrink-0 flex-col items-center justify-center lg:w-[370px] xl:w-[400px]">
        <div className="mb-2 flex w-full items-center justify-between gap-2">
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
            onClick={() => void fetchBatch(packId, true)}
            className="btn btn-sm h-8 gap-1.5 text-[0.75rem]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('换一组题目', 'Reload Pool')}</span>
          </button>
        </div>

        <div className="flex h-[440px] w-[min(100%,340px)] items-center justify-center sm:h-[470px]">
          {loading && !currentCard ? (
            <div className="flex flex-col items-center gap-3 text-ink-2">
              <Loader2 className="h-8 w-8 animate-spin text-osu" />
              <span className="text-[0.84375rem] font-semibold">
                {t('正在抽取 Ranked 竞猜题目…', 'Drawing ranked challenge map…')}
              </span>
            </div>
          ) : error && !currentCard ? (
            <div className="space-y-3 text-center">
              <p className="text-[0.84375rem] text-bad">{error}</p>
              <button
                type="button"
                onClick={() => void fetchBatch(packId, true)}
                className="btn btn-primary btn-sm"
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

      {/* Right: Telemetry Clue, Star Rating Slider & Scoreboard */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-3 overflow-y-auto rounded-2xl border border-hairline bg-surface-1/85 p-4 sm:p-5">
        {/* Session Stats Header */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-xl border border-hairline bg-surface-2/80 px-3 py-2">
            <div className="text-[0.6875rem] font-semibold text-ink-3">{t('总分', 'Score')}</div>
            <div className="font-stat text-[1.125rem] font-extrabold text-osu tabular-nums">
              {totalScore}
            </div>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2/80 px-3 py-2">
            <div className="text-[0.6875rem] font-semibold text-ink-3">{t('当前题号', 'Round')}</div>
            <div className="font-stat text-[1.125rem] font-extrabold text-ink tabular-nums">
              #{roundNum}
            </div>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2/80 px-3 py-2">
            <div className="text-[0.6875rem] font-semibold text-ink-3">{t('平均误差', 'Avg Δ★')}</div>
            <div className="font-stat text-[1.125rem] font-extrabold text-ink tabular-nums">
              {avgErr === '—' ? '—' : `±${avgErr}★`}
            </div>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2/80 px-3 py-2">
            <div className="text-[0.6875rem] font-semibold text-ink-3">{t('精准连击', 'Streak')}</div>
            <div className="font-stat text-[1.125rem] font-extrabold text-emerald-400 tabular-nums">
              {streak}🔥
            </div>
          </div>
          <div className="col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 sm:col-span-1">
            <div className="flex items-center gap-1 text-[0.6875rem] font-semibold text-amber-500">
              <Trophy className="h-3 w-3" />
              <span>{t('历史最高', 'Best')}</span>
            </div>
            <div className="font-stat text-[1.125rem] font-extrabold text-amber-400 tabular-nums">
              {bestScore}
            </div>
          </div>
        </div>

        {/* Scenario Riddle Details */}
        {currentCard && featuredDiff && (
          <div className="space-y-2 rounded-xl border border-hairline bg-surface-2/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-bold text-ink">
                <HelpCircle className="h-4 w-4 text-osu" />
                <span>
                  {t('根据下方情景 PP、曲风封面与参数，猜测真实星数！', 'Estimate the true Star Rating from the scenario PP & chart telemetry!')}
                </span>
              </span>
              <span className="chip font-mono text-[0.71875rem]">{scenario.detailLabel}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[0.78125rem] sm:grid-cols-4">
              <div className="rounded-lg bg-surface-1 px-2.5 py-1.5">
                <span className="text-ink-3">{t('情景 PP', 'Scenario PP')}: </span>
                <strong className="font-stat text-ok tabular-nums">{formatPp(scenarioPp)}pp</strong>
              </div>
              <div className="rounded-lg bg-surface-1 px-2.5 py-1.5">
                <span className="text-ink-3">BPM: </span>
                <strong className="font-stat text-ink tabular-nums">
                  {Math.round(currentCard.bpm * scenario.input.rate)}
                </strong>
              </div>
              <div className="rounded-lg bg-surface-1 px-2.5 py-1.5">
                <span className="text-ink-3">LN%: </span>
                <strong className="font-stat text-ink tabular-nums">
                  {featuredDiff.lnRatio !== null ? `${featuredDiff.lnRatio}%` : '—'}
                </strong>
              </div>
              <div className="rounded-lg bg-surface-1 px-2.5 py-1.5">
                <span className="text-ink-3">{t('键数', 'Keys')}: </span>
                <strong className="font-stat text-ink tabular-nums">
                  {featuredDiff.modeInt === 3 ? `${Math.round(featuredDiff.cs)}K` : featuredDiff.mode}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Guess Input OR Reveal Scorecard */}
        {!revealed ? (
          <div className="space-y-4 rounded-xl border border-hairline bg-surface-2/75 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.875rem] font-bold text-ink">
                {t('你的猜测星数', 'Your Star Rating Guess')}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="font-stat inline-flex items-center gap-1 rounded-full px-3 py-1 text-[1.0625rem] font-black shadow-sm tabular-nums"
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
                  className="field font-stat w-20 text-center text-[0.875rem] font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2">
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
                className="h-3.5 w-full cursor-pointer appearance-none rounded-full outline-none"
                aria-label={t('猜测星数滑块', 'Guess star rating slider')}
              />
              <div className="flex justify-between font-mono text-[0.6875rem] text-ink-3 tabular-nums">
                <span>0.50★ ({sliderPct.toFixed(0)}%)</span>
                <span>3.5★</span>
                <span>6.0★</span>
                <span>9.0★</span>
                <span>12.00★</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[-0.5, -0.1, 0.1, 0.5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() =>
                      setGuessStars((prev) =>
                        Math.round(Math.min(12, Math.max(0.5, prev + delta)) * 100) / 100,
                      )
                    }
                    className="btn btn-sm font-mono text-[0.75rem]"
                  >
                    {delta > 0 ? `+${delta}` : delta}★
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!currentCard}
                  onClick={handleNextCard}
                  className="btn btn-sm text-[0.78125rem]"
                >
                  {t('跳过换题', 'Skip')}
                </button>
                <button
                  type="button"
                  disabled={!currentCard || !featuredDiff}
                  onClick={handleSubmitGuess}
                  className="btn btn-primary gap-1.5 px-5 text-[0.875rem]"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{t('锁定并揭晓结果', 'Lock & Reveal')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in space-y-3 rounded-xl border border-osu/40 bg-osu/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-osu font-stat text-[1.125rem] font-black text-white shadow">
                  {revealed.grade}
                </span>
                <div>
                  <div className="font-stat text-[1.0625rem] font-extrabold text-ink">
                    +{revealed.score} {t('分', 'pts')}
                  </div>
                  <div className="text-[0.78125rem] font-medium text-ink-2">{revealed.feedback}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {currentCard && (
                  <>
                    <button
                      type="button"
                      onClick={() => onDownload(currentCard, target)}
                      className="btn btn-sm gap-1.5 text-[0.78125rem]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{t('下载谱面', 'Download')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(currentCard, featuredDiff?.id ?? null)}
                      className="btn btn-sm gap-1 text-[0.78125rem]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>{t('详情', 'Details')}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleNextCard}
                  className="btn btn-primary gap-1.5 px-4 text-[0.84375rem]"
                >
                  <span>{t('下一张卡牌', 'Next Card')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-1 px-2.5 py-2">
                <div className="text-[0.6875rem] text-ink-3">{t('你的猜测', 'Your Guess')}</div>
                <div className="font-stat text-[1rem] font-bold text-ink tabular-nums">
                  ★ {guessStars.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-surface-1 px-2.5 py-2">
                <div className="text-[0.6875rem] text-ink-3">{t('真实星数', 'Actual SR')}</div>
                <div className="mt-0.5 flex justify-center">
                  <span
                    className="font-stat inline-flex rounded-full px-2.5 py-0.5 text-[0.875rem] font-extrabold tabular-nums"
                    style={{ backgroundColor: actualBadge.bg, color: actualBadge.text }}
                  >
                    ★ {actualStars.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-surface-1 px-2.5 py-2">
                <div className="text-[0.6875rem] text-ink-3">{t('偏差值', 'Error Δ')}</div>
                <div className="font-stat text-[1rem] font-bold text-osu tabular-nums">
                  {revealed.signedDiff >= 0 ? '+' : ''}
                  {revealed.signedDiff.toFixed(2)}★
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Scoring Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2 text-[0.71875rem] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <Award className="h-3.5 w-3.5 text-amber-400" />
            <span>
              {t('评分规则：误差越小分越高，±0.15★ 内即获 SS 评级 (~975+分)', 'Scoring: Closer guess = exponentially higher score (<=0.15★ = SS rank)')}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
            <span>{t('所有题目均来自本地未下载谱面', 'Non-local ranked maps only')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
