import { NormalizedBeatmap, SearchFilters } from './types.js';

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

export const DEFAULT_PP_MODS: PpMods = {
  ez: false,
  nf: false,
  classic: false,
};

export function isRankedForPp(status: string): boolean {
  return status === 'ranked' || status === 'approved';
}

export function extractPpScenarioFromFilters(filters?: SearchFilters): PpScenarioInput {
  const rawAcc = Number(filters?.ppAccuracy);
  const rawMisses = Number(filters?.ppMisses);
  const rawRate = Number(filters?.ppRate);
  const rawMa = filters?.ppMaRatio != null ? Number(filters.ppMaRatio) : null;

  return {
    accuracy: Number.isFinite(rawAcc) ? Math.min(100, Math.max(0, rawAcc)) : 98,
    misses: Number.isFinite(rawMisses) ? Math.max(0, Math.round(rawMisses)) : 0,
    rate: Number.isFinite(rawRate) ? Math.min(2, Math.max(0.5, rawRate)) : 1,
    mods: {
      ez: Boolean(filters?.ppEz),
      nf: Boolean(filters?.ppNf),
      classic: Boolean(filters?.ppClassic),
    },
    maRatio: rawMa !== null && Number.isFinite(rawMa) && rawMa >= 0 ? rawMa : null,
  };
}

export function shouldAllowUnrankedForPpFilter(f: SearchFilters): boolean {
  if (f.ppIncludeUnranked) return true;
  return (
    f.status === 'qualified' ||
    f.status === 'loved' ||
    f.status === 'pending' ||
    f.status === 'wip' ||
    f.status === 'graveyard'
  );
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
      maRatio !== null && Number.isFinite(maRatio) && maRatio >= 0
        ? (320 * maRatio + 300) / (320 * (maRatio + 1))
        : 1;
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

export interface DerivedStarBounds {
  minStars?: number;
  maxStars?: number;
  impossible?: boolean;
}

export function deriveStarBoundsFromPpFilter(f: SearchFilters): DerivedStarBounds {
  if (f.minPp == null && f.maxPp == null) return {};

  const scenario = extractPpScenarioFromFilters(f);
  const minPp = f.minPp;
  const maxPp = f.maxPp;

  const maniaBounds = (): DerivedStarBounds => {
    const rate = Math.min(2, Math.max(0.5, scenario.rate));
    const rateFactor = Math.abs(rate - 1) > 0.001 ? Math.pow(rate, 0.72) : 1;
    const modMult =
      0.8 *
      (scenario.mods.nf ? 0.75 : 1) *
      (scenario.mods.ez ? 0.5 : 1) *
      (scenario.mods.classic ? 0.96 : 1);
    const maFactor =
      scenario.maRatio !== null && Number.isFinite(scenario.maRatio) && scenario.maRatio >= 0
        ? (320 * scenario.maRatio + 300) / (320 * (scenario.maRatio + 1))
        : 1;
    const rawAcc = Math.min(100, Math.max(0, scenario.accuracy)) / 100;
    const accFactorMax = Math.max(0, 5 * (rawAcc * maFactor) - 4);
    const kMax = 8.0 * accFactorMax * 1.1 * modMult;

    if ((minPp ?? 0) > 0 && kMax <= 1e-6) {
      return { impossible: true };
    }
    if (maxPp != null && maxPp < 0) {
      return { impossible: true };
    }

    let minStars: number | undefined;
    if (minPp != null && minPp > 0) {
      const targetMin = Math.max(0, minPp - 0.5);
      const effSrMin = targetMin > 0 ? 0.15 + Math.pow(targetMin / kMax, 1 / 2.2) : 0;
      minStars = Math.max(0, Math.floor((effSrMin / rateFactor - 0.06) * 100) / 100);
    }

    let maxStars: number | undefined;
    if (maxPp != null && scenario.misses === 0) {
      const kMin = 8.0 * accFactorMax * 1.0 * modMult;
      if (kMin > 1e-6) {
        const effSrMax = 0.15 + Math.pow((maxPp + 0.5) / kMin, 1 / 2.2);
        maxStars = Math.ceil((effSrMax / rateFactor + 0.06) * 100) / 100;
      }
    }

    return { minStars, maxStars };
  };

  const nonManiaBounds = (): DerivedStarBounds => {
    const rate = Math.min(2, Math.max(0.5, scenario.rate));
    const rateFactor = Math.abs(rate - 1) > 0.001 ? Math.pow(rate, 0.68) : 1;
    const modMult = (scenario.mods.nf ? 0.9 : 1) * (scenario.mods.ez ? 0.5 : 1);
    const rawAcc = Math.min(100, Math.max(0, scenario.accuracy)) / 100;
    const accFactor = Math.pow(Math.max(0, rawAcc - 0.5) / 0.5, 2.2);
    const missFactor = Math.pow(0.97, scenario.misses);
    const kMax = 5.2 * accFactor * 1.12 * modMult * missFactor;
    const kMin = 5.2 * accFactor * 1.0 * modMult * missFactor;

    if ((minPp ?? 0) > 0 && kMax <= 1e-6) {
      return { impossible: true };
    }
    if (maxPp != null && maxPp < 0) {
      return { impossible: true };
    }

    let minStars: number | undefined;
    if (minPp != null && minPp > 0) {
      const targetMin = Math.max(0, minPp - 0.5);
      const effSrMin = targetMin > 0 ? Math.pow(targetMin / kMax, 1 / 2.55) : 0;
      minStars = Math.max(0, Math.floor((effSrMin / rateFactor - 0.06) * 100) / 100);
    }

    let maxStars: number | undefined;
    if (maxPp != null && kMin > 1e-6) {
      const effSrMax = Math.pow((maxPp + 0.5) / kMin, 1 / 2.55);
      maxStars = Math.ceil((effSrMax / rateFactor + 0.06) * 100) / 100;
    }

    return { minStars, maxStars };
  };

  if (!f.mode || f.mode === '3') {
    return maniaBounds();
  }
  if (f.mode === '0' || f.mode === '1' || f.mode === '2') {
    return nonManiaBounds();
  }

  const m = maniaBounds();
  const nm = nonManiaBounds();
  if (m.impossible && nm.impossible) return { impossible: true };
  if (m.impossible) return nm;
  if (nm.impossible) return m;

  const minStars =
    m.minStars != null && nm.minStars != null ? Math.min(m.minStars, nm.minStars) : undefined;
  const maxStars =
    m.maxStars != null && nm.maxStars != null ? Math.max(m.maxStars, nm.maxStars) : undefined;
  return { minStars, maxStars };
}
