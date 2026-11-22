import { NormalizedBeatmap, NormalizedBeatmapset } from '../types';

export interface PpMods {
  ez: boolean;
  nf: boolean;
  classic: boolean;
}

export interface PpScenarioInput {
  accuracy: number;
  misses: number;
  rate: number;
  mods: PpMods;
  maRatio: number | null;
}

export interface PpResult {
  pp: number;
  effectiveSr: number;
  effectiveBpm: number;
  effectiveAcc: number;
  modMultiplier: number;
  lengthBonus: number;
  isRateEstimated: boolean;
  isExactManiaFormula: boolean;
}

export interface QuickPpSummary {
  pp95: number;
  pp98: number;
  pp99: number;
  pp100: number;
  pp98Dt: number;
  pp98Ht: number;
}

export const DEFAULT_PP_MODS: PpMods = {
  ez: false,
  nf: false,
  classic: false,
};

export const DEFAULT_PP_SCENARIO: PpScenarioInput = {
  accuracy: 98,
  misses: 0,
  rate: 1,
  mods: DEFAULT_PP_MODS,
  maRatio: null,
};

export function isRankedForPp(status: string): boolean {
  return status === 'ranked' || status === 'approved';
}

export function formatPp(pp: number): string {
  if (!Number.isFinite(pp) || pp <= 0) return '0';
  return Math.round(pp).toLocaleString();
}

export function calculateBeatmapPp(
  beatmap: NormalizedBeatmap,
  input: Partial<PpScenarioInput> = {},
): PpResult {
  const rawTotalHits = beatmap.countCircles + beatmap.countSliders + beatmap.countSpinners;
  const totalHits = Math.max(1, rawTotalHits);

  const accuracy = Math.min(100, Math.max(0, Number(input.accuracy ?? 98)));
  const misses = Math.min(totalHits, Math.max(0, Math.round(Number(input.misses ?? 0))));
  const rate = Math.min(2, Math.max(0.5, Number(input.rate ?? 1)));
  const mods: PpMods = {
    ez: Boolean(input.mods?.ez),
    nf: Boolean(input.mods?.nf),
    classic: Boolean(input.mods?.classic),
  };
  const maRatio = input.maRatio ?? null;

  const isRateEstimated = Math.abs(rate - 1) > 0.001;
  const effectiveBpm = beatmap.bpm * rate;
  const rawAcc = accuracy / 100;
  const accAfterMiss = misses > 0 ? Math.max(0, rawAcc - misses / totalHits) : rawAcc;

  if (beatmap.modeInt === 3) {
    const effectiveSr = isRateEstimated
      ? beatmap.difficultyRating * Math.pow(rate, 0.72)
      : beatmap.difficultyRating;
    const lengthBonus = 1 + 0.1 * Math.min(1, totalHits / 1500);
    const modMultiplier =
      0.8 * (mods.nf ? 0.75 : 1) * (mods.ez ? 0.5 : 1) * (mods.classic ? 0.96 : 1);

    const maFactor =
      maRatio !== null && maRatio > 0 ? (320 * maRatio + 300) / (320 * (maRatio + 1)) : 1;
    const customAcc = accAfterMiss * maFactor;
    const accFactor = Math.max(0, 5 * customAcc - 4);
    const difficultyValue =
      8.0 * Math.pow(Math.max(effectiveSr - 0.15, 0.05), 2.2) * accFactor * lengthBonus;
    const pp = Math.max(0, difficultyValue * modMultiplier);

    return {
      pp,
      effectiveSr,
      effectiveBpm,
      effectiveAcc: customAcc * 100,
      modMultiplier,
      lengthBonus,
      isRateEstimated,
      isExactManiaFormula: true,
    };
  }

  // Fallback approximation for non-Mania modes ("全部模式")
  const effectiveSr = isRateEstimated
    ? beatmap.difficultyRating * Math.pow(rate, 0.68)
    : beatmap.difficultyRating;
  const lengthBonus = 1 + 0.12 * Math.min(1, totalHits / 1200);
  const modMultiplier = (mods.nf ? 0.9 : 1) * (mods.ez ? 0.5 : 1);
  const accFactor = Math.pow(Math.max(0, rawAcc - 0.5) / 0.5, 2.2);
  const pp = Math.max(
    0,
    5.2 *
      Math.pow(Math.max(effectiveSr, 0.1), 2.55) *
      accFactor *
      lengthBonus *
      modMultiplier *
      Math.pow(0.97, misses),
  );

  return {
    pp,
    effectiveSr,
    effectiveBpm,
    effectiveAcc: accAfterMiss * 100,
    modMultiplier,
    lengthBonus,
    isRateEstimated,
    isExactManiaFormula: false,
  };
}

export function getQuickPpSummary(beatmap: NormalizedBeatmap, rate = 1): QuickPpSummary {
  return {
    pp95: calculateBeatmapPp(beatmap, { accuracy: 95, rate }).pp,
    pp98: calculateBeatmapPp(beatmap, { accuracy: 98, rate }).pp,
    pp99: calculateBeatmapPp(beatmap, { accuracy: 99, rate }).pp,
    pp100: calculateBeatmapPp(beatmap, { accuracy: 100, rate }).pp,
    pp98Dt: calculateBeatmapPp(beatmap, { accuracy: 98, rate: 1.5 }).pp,
    pp98Ht: calculateBeatmapPp(beatmap, { accuracy: 98, rate: 0.75 }).pp,
  };
}

export function getBeatmapsetPpBadge(
  beatmapset: NormalizedBeatmapset,
): { label: string; tooltip: string; focusDiffId: number } | null {
  if (!isRankedForPp(beatmapset.status) || beatmapset.beatmaps.length === 0) return null;

  const matching = beatmapset.beatmaps.filter((b) => b.matchesFilter !== false);
  const pool = matching.length > 0 ? matching : beatmapset.beatmaps;
  const sorted = [...pool].sort((a, b) => a.difficultyRating - b.difficultyRating);
  const highest = sorted[sorted.length - 1];

  const pps98 = sorted.map((b) => Math.round(calculateBeatmapPp(b, { accuracy: 98, rate: 1 }).pp));
  const minPp = Math.min(...pps98);
  const maxPp = Math.max(...pps98);
  const label =
    sorted.length === 1 || minPp === maxPp
      ? `~${formatPp(maxPp)}pp`
      : `~${formatPp(minPp)}–${formatPp(maxPp)}pp`;

  const q = getQuickPpSummary(highest, 1);
  const keyTag = highest.modeInt === 3 ? `${Math.round(highest.cs)}K ` : '';
  const tooltip = [
    `最高匹配难度: ${keyTag}${highest.difficultyRating.toFixed(2)}★ (${highest.version})`,
    `NM 95%: ~${formatPp(q.pp95)}pp · 98%: ~${formatPp(q.pp98)}pp · 99%: ~${formatPp(q.pp99)}pp · SS: ~${formatPp(q.pp100)}pp`,
    `DT(1.5x) 98%: ~${formatPp(q.pp98Dt)}pp · HT(0.75x) 98%: ~${formatPp(q.pp98Ht)}pp`,
    '点击打开 PP 情景计算器',
  ].join('\n');

  return {
    label,
    tooltip,
    focusDiffId: highest.id,
  };
}
