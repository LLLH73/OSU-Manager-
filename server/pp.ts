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

function computeManiaCustomAccuracy(
  rawAcc: number,
  misses: number,
  totalHits: number,
  maRatio: number | null,
  classic: boolean,
): number {
  const m = totalHits > 0 ? Math.min(1, Math.max(0, misses) / totalHits) : 0;
  if (maRatio === null || !Number.isFinite(maRatio) || maRatio < 0) {
    return Math.min(rawAcc, Math.max(0, 1 - m));
  }
  const base = classic ? 300 : 305;
  const wTopBase = (base * maRatio + 300) / (maRatio + 1);
  const wTop320 = (320 * maRatio + 300) / (maRatio + 1);
  const maxPossibleAcc = (wTopBase / base) * Math.max(0, 1 - m);
  const effAcc = Math.min(rawAcc, maxPossibleAcc);
  const pTop = Math.min(
    Math.max(0, 1 - m),
    Math.max(0, (base * effAcc - 200) / (wTopBase - 200)),
  );
  return Math.min(1, Math.max(0, (base * effAcc + (wTop320 - wTopBase) * pTop) / 320));
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
    // Lazer judges both hold-note head & tail; Classic/Stable judges hold-note once
    const maniaTotalHits = Math.max(
      1,
      mods.classic ? rawTotalHits : beatmap.countCircles + beatmap.countSliders * 2 + beatmap.countSpinners,
    );
    const maniaMisses = Math.min(maniaTotalHits, Math.max(0, Math.round(Number(input.misses ?? 0))));
    const lengthBonus = 1 + 0.1 * Math.min(1, maniaTotalHits / 1500);
    // Official ppy/osu ManiaPerformanceCalculator uses base 1.0 and only NF (0.75) / EZ (0.5); Classic has no PP penalty
    const modMultiplier = (mods.nf ? 0.75 : 1) * (mods.ez ? 0.5 : 1);

    const customAcc = computeManiaCustomAccuracy(
      rawAcc,
      maniaMisses,
      maniaTotalHits,
      maRatio,
      mods.classic,
    );
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
    const modMult = (scenario.mods.nf ? 0.75 : 1) * (scenario.mods.ez ? 0.5 : 1);
    const rawAcc = Math.min(100, Math.max(0, scenario.accuracy)) / 100;
    const customAccMax = computeManiaCustomAccuracy(
      rawAcc,
      0,
      100000,
      scenario.maRatio,
      scenario.mods.classic,
    );
    const accFactorMax = Math.max(0, 5 * customAccMax - 4);
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
    if (maxPp != null) {
      // Safe lower bound of post-miss custom accuracy for beatmaps with >= 50 objects
      const customAccMin =
        scenario.misses > 0
          ? computeManiaCustomAccuracy(rawAcc, scenario.misses, 50, scenario.maRatio, scenario.mods.classic)
          : customAccMax;
      const accFactorMin = Math.max(0, 5 * customAccMin - 4);
      if (accFactorMin > 0.05) {
        const kMin = 8.0 * accFactorMin * 1.0 * modMult;
        if (kMin > 1e-6) {
          const effSrMax = 0.15 + Math.pow((maxPp + 0.5) / kMin, 1 / 2.2);
          maxStars = Math.ceil((effSrMax / rateFactor + 0.06) * 100) / 100;
        }
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
