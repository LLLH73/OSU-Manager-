import fs from 'node:fs';

const DIFFICULTY_MULTIPLIER = 0.018;
const SECTION_LENGTH = 400;
const DECAY_WEIGHT = 0.9;
const INDIVIDUAL_DECAY_BASE = 0.125;
const OVERALL_DECAY_BASE = 0.3;
const RELEASE_THRESHOLD = 30;
const MAX_CACHE_ENTRIES = 4000;

interface ParsedManiaNote {
  startTime: number;
  endTime: number;
  column: number;
  order: number;
}

interface ManiaDifficultyObject {
  startTime: number;
  endTime: number;
  deltaTime: number;
  column: number;
  perColumnObjects: Array<ManiaDifficultyObject | null>;
}

const rateSrCache = new Map<string, number>();

export function clearManiaStarRatingCache(): void {
  rateSrCache.clear();
}

function cacheSet(key: string, value: number): void {
  if (rateSrCache.has(key)) {
    rateSrCache.delete(key);
  } else if (rateSrCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = rateSrCache.keys().next().value;
    if (oldestKey !== undefined) {
      rateSrCache.delete(oldestKey);
    }
  }
  rateSrCache.set(key, value);
}

/**
 * Matches C# `Math.Round(double)` midpoint-to-even (banker's rounding) used by `ppy/osu`
 * when sorting Mania hit objects by StartTime.
 */
function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function applyDecay(value: number, deltaTime: number, decayBase: number): number {
  return value * Math.pow(decayBase, deltaTime / 1000);
}

function evaluateIndividualStrain(dobj: ManiaDifficultyObject): number {
  const prevs = dobj.perColumnObjects;
  for (let i = 0; i < prevs.length; i += 1) {
    const prev = prevs[i];
    if (prev !== null && prev.endTime > dobj.endTime + 1 && dobj.startTime > prev.startTime + 1) {
      return 2.0 * 1.25;
    }
  }
  return 2.0;
}

function evaluateOverallStrain(dobj: ManiaDifficultyObject): number {
  let isOverlapping = false;
  let holdFactor = 1.0;
  let closestEndTime = Math.abs(dobj.endTime - dobj.startTime);

  const prevs = dobj.perColumnObjects;
  for (let i = 0; i < prevs.length; i += 1) {
    const prev = prevs[i];
    if (prev === null) continue;
    isOverlapping ||=
      prev.endTime > dobj.startTime + 1 &&
      dobj.endTime > prev.endTime + 1 &&
      dobj.startTime > prev.startTime + 1;
    if (prev.endTime > dobj.endTime + 1 && dobj.startTime > prev.startTime + 1) {
      holdFactor = 1.25;
    }
    const diff = Math.abs(dobj.endTime - prev.endTime);
    if (diff < closestEndTime) closestEndTime = diff;
  }

  const holdAddition = isOverlapping ? 1 / (1 + Math.exp(0.27 * (RELEASE_THRESHOLD - closestEndTime))) : 0;
  return (1 + holdAddition) * holdFactor;
}

function parseManiaOsuContent(osuText: string): {
  mode: number;
  totalColumns: number;
  notes: ParsedManiaNote[];
} {
  const clean = osuText.charCodeAt(0) === 0xfeff ? osuText.slice(1) : osuText;
  const lines = clean.split(/\r?\n/);

  let mode = 0;
  let cs = 4;
  let section = '';
  const rawObjects: Array<{ x: number; startTime: number; endTime: number; order: number }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      section = trimmed;
      continue;
    }

    if (section === '[General]') {
      const colon = trimmed.indexOf(':');
      if (colon > 0 && trimmed.slice(0, colon).trim() === 'Mode') {
        const parsedMode = Number(trimmed.slice(colon + 1).trim());
        if (Number.isFinite(parsedMode)) mode = parsedMode;
      }
      continue;
    }

    if (section === '[Difficulty]') {
      const colon = trimmed.indexOf(':');
      if (colon > 0 && trimmed.slice(0, colon).trim() === 'CircleSize') {
        const parsedCs = Number(trimmed.slice(colon + 1).trim());
        if (Number.isFinite(parsedCs)) cs = parsedCs;
      }
      continue;
    }

    if (section === '[HitObjects]') {
      const parts = trimmed.split(',');
      if (parts.length < 4) continue;
      const x = Number(parts[0]);
      const startTime = Number(parts[2]);
      const type = Number(parts[3]);
      if (!Number.isFinite(x) || !Number.isFinite(startTime) || !Number.isFinite(type)) continue;

      let endTime = startTime;
      if ((type & 128) !== 0 && parts.length >= 6) {
        const colon = parts[5].indexOf(':');
        const parsedEnd = Number(colon >= 0 ? parts[5].slice(0, colon) : parts[5]);
        if (Number.isFinite(parsedEnd) && parsedEnd > startTime) {
          endTime = parsedEnd;
        }
      }

      rawObjects.push({
        x,
        startTime,
        endTime,
        order: rawObjects.length,
      });
    }
  }

  const totalColumns = Math.max(1, roundHalfToEven(cs));
  const notes: ParsedManiaNote[] = new Array(rawObjects.length);
  for (let i = 0; i < rawObjects.length; i += 1) {
    const obj = rawObjects[i];
    const column = Math.max(0, Math.min(totalColumns - 1, Math.floor((obj.x * totalColumns) / 512)));
    notes[i] = {
      startTime: obj.startTime,
      endTime: obj.endTime,
      column,
      order: obj.order,
    };
  }

  notes.sort((a, b) => {
    const diff = roundHalfToEven(a.startTime) - roundHalfToEven(b.startTime);
    return diff !== 0 ? diff : a.order - b.order;
  });

  return { mode, totalColumns, notes };
}

/**
 * Exact TypeScript port of `ppy/osu` `ManiaDifficultyCalculator` (`Version => 20241007`)
 * computing official Mania Star Rating at any `clockRate` (HT = 0.75, NM = 1.0, DT = 1.5, etc.).
 */
export function calculateManiaStarRatingFromOsu(osuText: string, clockRate = 1): number {
  const { mode, totalColumns, notes } = parseManiaOsuContent(osuText);
  if (mode !== 3 || notes.length < 2) return 0;

  const safeRate = Math.max(0.1, Number.isFinite(clockRate) ? clockRate : 1);
  const lastObjectOfColumn: Array<ManiaDifficultyObject | null> = new Array(totalColumns).fill(null);

  const startTimes = new Float64Array(totalColumns);
  const individualStrains = new Float64Array(totalColumns);
  let overallStrain = 1;
  let highestIndividualStrain = 0;

  const strainPeaks: number[] = [];
  let currentSectionPeak = 0;
  let currentSectionEnd = 0;
  let prevDobj: ManiaDifficultyObject | null = null;

  for (let i = 1; i < notes.length; i += 1) {
    const cur = notes[i];
    const last = notes[i - 1];
    const dobj: ManiaDifficultyObject = {
      startTime: cur.startTime / safeRate,
      endTime: cur.endTime / safeRate,
      deltaTime: (cur.startTime - last.startTime) / safeRate,
      column: cur.column,
      perColumnObjects: lastObjectOfColumn.slice(),
    };
    lastObjectOfColumn[cur.column] = dobj;

    if (i === 1) {
      currentSectionEnd = Math.ceil(dobj.startTime / SECTION_LENGTH) * SECTION_LENGTH;
    } else {
      while (dobj.startTime > currentSectionEnd) {
        strainPeaks.push(currentSectionPeak);
        const decayDelta = currentSectionEnd - prevDobj!.startTime;
        currentSectionPeak =
          applyDecay(highestIndividualStrain, decayDelta, INDIVIDUAL_DECAY_BASE) +
          applyDecay(overallStrain, decayDelta, OVERALL_DECAY_BASE);
        currentSectionEnd += SECTION_LENGTH;
      }
    }

    const col = dobj.column;
    individualStrains[col] =
      applyDecay(individualStrains[col], dobj.startTime - startTimes[col], INDIVIDUAL_DECAY_BASE) +
      evaluateIndividualStrain(dobj);

    highestIndividualStrain =
      dobj.deltaTime <= 1
        ? Math.max(highestIndividualStrain, individualStrains[col])
        : individualStrains[col];

    startTimes[col] = dobj.startTime;

    overallStrain = applyDecay(overallStrain, dobj.deltaTime, OVERALL_DECAY_BASE) + evaluateOverallStrain(dobj);

    const currentStrain = highestIndividualStrain + overallStrain;
    if (currentStrain > currentSectionPeak) {
      currentSectionPeak = currentStrain;
    }

    prevDobj = dobj;
  }

  strainPeaks.push(currentSectionPeak);

  const positivePeaks = strainPeaks.filter((p) => p > 0).sort((a, b) => b - a);
  let difficulty = 0;
  let weight = 1;
  for (let i = 0; i < positivePeaks.length; i += 1) {
    difficulty += positivePeaks[i] * weight;
    weight *= DECAY_WEIGHT;
  }

  return difficulty * DIFFICULTY_MULTIPLIER;
}

/**
 * Computes and caches exact `ppy/osu` (`20241007`) Mania Star Rating directly from a local `.osu` file.
 */
export function calculateManiaStarRatingFromFile(
  filePath: string,
  clockRate = 1,
  cacheKey?: string,
): number | null {
  if (!filePath) return null;
  const safeRate = Math.max(0.1, Number.isFinite(clockRate) ? clockRate : 1);
  const fullKey = `${cacheKey || filePath}|${safeRate.toFixed(4)}`;
  const cached = rateSrCache.get(fullKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const sr = calculateManiaStarRatingFromOsu(content, safeRate);
    cacheSet(fullKey, sr);
    return sr;
  } catch {
    return null;
  }
}
