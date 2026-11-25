import { getCurrentLang, tx, type UiLanguage } from '../i18n';
import { NormalizedBeatmap, NormalizedBeatmapset, SearchFilters } from '../types';

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

export interface PpScenarioPatch {
  ppAccuracy: number;
  ppRate: number;
  ppMisses: number;
  ppMaRatio: number | undefined;
  ppClassic: boolean;
  ppEz: boolean;
  ppNf: boolean;
}

export type PpScenarioCategory = 'nm' | 'dt' | 'ht' | 'rate' | 'custom';
export type PpCategoryTone = 'lazer' | 'osu' | 'stable' | 'warn';

export interface PpScenarioPreset {
  id: string;
  category: Exclude<PpScenarioCategory, 'custom'>;
  label: string;
  primaryText: string;
  secondaryText: string;
  desc: string;
  patch: PpScenarioPatch;
}

export interface SavedPpScenario {
  id: string;
  name: string;
  patch: PpScenarioPatch;
  createdAt: number;
}

export const SAVED_PP_SCENARIOS_KEY = 'osu4k-saved-pp-scenarios';
export const SAVED_PP_SCENARIOS_EVENT = 'osu4k-pp-scenarios-changed';

export function getPpScenarioCategoryMeta(
  lang: UiLanguage = getCurrentLang(),
): Record<
  PpScenarioCategory,
  { code: string; label: string; short: string; subtitle: string; tone: PpCategoryTone }
> {
  const isEn = lang === 'en';
  return {
    nm: { code: 'NM', label: isEn ? 'NM 1.0x' : 'NM 常速', short: 'NM', subtitle: isEn ? '1.0x Normal' : '1.0x 常速', tone: 'lazer' },
    dt: { code: 'DT', label: 'DT 1.5x', short: 'DT', subtitle: isEn ? '1.5x Speedup' : '1.5x 加速', tone: 'osu' },
    ht: { code: 'HT', label: 'HT 0.75x', short: 'HT', subtitle: isEn ? '0.75x Halftime' : '0.75x 减速', tone: 'stable' },
    rate: { code: 'Rate', label: isEn ? 'Custom Rate' : '变速 Rate', short: isEn ? 'Rate' : '变速', subtitle: '0.85–1.4x', tone: 'warn' },
    custom: { code: isEn ? 'Custom' : '自定义', label: isEn ? 'Custom' : '自定义', short: isEn ? 'Custom' : '自定义', subtitle: isEn ? 'Saved presets' : '已保存组合', tone: 'lazer' },
  };
}

export const PP_SCENARIO_CATEGORY_META = getPpScenarioCategoryMeta('zh');

const mkPreset = (
  id: string,
  category: Exclude<PpScenarioCategory, 'custom'>,
  label: string,
  desc: string,
  opts: {
    acc: number;
    rate: number;
    misses?: number;
    maRatio?: number;
    classic?: boolean;
    ez?: boolean;
    nf?: boolean;
  },
  lang: UiLanguage = 'zh',
): PpScenarioPreset => {
  const isEn = lang === 'en';
  const misses = opts.misses ?? 0;
  const primaryText =
    category === 'rate'
      ? `${opts.rate}x`
      : opts.acc === 100
        ? '100% SS'
        : `${opts.acc}%`;
  const secondaryText =
    category === 'rate'
      ? `${opts.acc}% · ${opts.maRatio != null ? `${opts.maRatio}:1 · ` : ''}${misses}M`
      : `${opts.maRatio != null ? `${opts.maRatio}:1` : opts.acc === 100 ? (isEn ? 'MAX/SS' : '全彩/SS') : (isEn ? 'Direct' : '直算')} · ${misses}M`;

  return {
    id,
    category,
    label,
    primaryText,
    secondaryText,
    desc,
    patch: {
      ppAccuracy: opts.acc,
      ppRate: opts.rate,
      ppMisses: misses,
      ppMaRatio: opts.maRatio,
      ppClassic: Boolean(opts.classic),
      ppEz: Boolean(opts.ez),
      ppNf: Boolean(opts.nf),
    },
  };
};

export function getPpScenarioPresets(lang: UiLanguage = getCurrentLang()): PpScenarioPreset[] {
  const isEn = lang === 'en';
  const ratioDesc = (base: string, ratio: number, misses: number) =>
    isEn ? `${base} · MA ${ratio}:1 · ${misses} Miss` : `${base} · 黄彩比 ${ratio}:1 · ${misses} Miss`;
  return [
    // NM 1.0x — 9 presets
    mkPreset('nm-95-2-5m', 'nm', 'NM 95%·2:1·5M', ratioDesc('NM 1.0x 95%', 2, 5), {
      acc: 95,
      rate: 1,
      maRatio: 2,
      misses: 5,
    }, lang),
    mkPreset('nm-965-2-3m', 'nm', 'NM 96.5%·2:1·3M', ratioDesc('NM 1.0x 96.5%', 2, 3), {
      acc: 96.5,
      rate: 1,
      maRatio: 2,
      misses: 3,
    }, lang),
    mkPreset('nm-975-25-2m', 'nm', 'NM 97.5%·2.5:1·2M', ratioDesc('NM 1.0x 97.5%', 2.5, 2), {
      acc: 97.5,
      rate: 1,
      maRatio: 2.5,
      misses: 2,
    }, lang),
    mkPreset('nm-98', 'nm', 'NM 98%', isEn ? 'Default NM 1.0x 98% · 0 Miss (Direct)' : '默认 NM 1.0x 98% · 0 Miss（直算）', {
      acc: 98,
      rate: 1,
    }, lang),
    mkPreset('nm-98-3', 'nm', 'NM 98%·3:1', ratioDesc('NM 1.0x 98%', 3, 0), {
      acc: 98,
      rate: 1,
      maRatio: 3,
    }, lang),
    mkPreset('nm-985-35-1m', 'nm', 'NM 98.5%·3.5:1·1M', ratioDesc('NM 1.0x 98.5%', 3.5, 1), {
      acc: 98.5,
      rate: 1,
      maRatio: 3.5,
      misses: 1,
    }, lang),
    mkPreset('nm-99-5', 'nm', 'NM 99%·5:1', ratioDesc('NM 1.0x 99%', 5, 0), {
      acc: 99,
      rate: 1,
      maRatio: 5,
    }, lang),
    mkPreset('nm-995-8', 'nm', 'NM 99.5%·8:1', ratioDesc('NM 1.0x 99.5%', 8, 0), {
      acc: 99.5,
      rate: 1,
      maRatio: 8,
    }, lang),
    mkPreset('nm-ss', 'nm', 'NM SS 100%', 'NM 1.0x 100% SS · 0 Miss', {
      acc: 100,
      rate: 1,
    }, lang),

    // DT 1.5x — 9 presets
    mkPreset('dt-94-15-8m', 'dt', 'DT 94%·1.5:1·8M', ratioDesc('DT 1.5x 94%', 1.5, 8), {
      acc: 94,
      rate: 1.5,
      maRatio: 1.5,
      misses: 8,
    }, lang),
    mkPreset('dt-95-2-5m', 'dt', 'DT 95%·2:1·5M', ratioDesc('DT 1.5x 95%', 2, 5), {
      acc: 95,
      rate: 1.5,
      maRatio: 2,
      misses: 5,
    }, lang),
    mkPreset('dt-965-2-3m', 'dt', 'DT 96.5%·2:1·3M', ratioDesc('DT 1.5x 96.5%', 2, 3), {
      acc: 96.5,
      rate: 1.5,
      maRatio: 2,
      misses: 3,
    }, lang),
    mkPreset('dt-975-25-2m', 'dt', 'DT 97.5%·2.5:1·2M', ratioDesc('DT 1.5x 97.5%', 2.5, 2), {
      acc: 97.5,
      rate: 1.5,
      maRatio: 2.5,
      misses: 2,
    }, lang),
    mkPreset('dt-98', 'dt', 'DT 98%', isEn ? 'DT 1.5x 98% · 0 Miss (Direct)' : 'DT 1.5x 98% · 0 Miss（直算）', {
      acc: 98,
      rate: 1.5,
    }, lang),
    mkPreset('dt-98-3-1m', 'dt', 'DT 98%·3:1·1M', ratioDesc('DT 1.5x 98%', 3, 1), {
      acc: 98,
      rate: 1.5,
      maRatio: 3,
      misses: 1,
    }, lang),
    mkPreset('dt-985-35', 'dt', 'DT 98.5%·3.5:1', ratioDesc('DT 1.5x 98.5%', 3.5, 0), {
      acc: 98.5,
      rate: 1.5,
      maRatio: 3.5,
    }, lang),
    mkPreset('dt-99-5', 'dt', 'DT 99%·5:1', ratioDesc('DT 1.5x 99%', 5, 0), {
      acc: 99,
      rate: 1.5,
      maRatio: 5,
    }, lang),
    mkPreset('dt-ss', 'dt', 'DT SS 100%', 'DT 1.5x 100% SS · 0 Miss', {
      acc: 100,
      rate: 1.5,
    }, lang),

    // HT 0.75x — 9 presets
    mkPreset('ht-94-15-8m', 'ht', 'HT 94%·1.5:1·8M', ratioDesc('HT 0.75x 94%', 1.5, 8), {
      acc: 94,
      rate: 0.75,
      maRatio: 1.5,
      misses: 8,
    }, lang),
    mkPreset('ht-95-2-5m', 'ht', 'HT 95%·2:1·5M', ratioDesc('HT 0.75x 95%', 2, 5), {
      acc: 95,
      rate: 0.75,
      maRatio: 2,
      misses: 5,
    }, lang),
    mkPreset('ht-965-25-3m', 'ht', 'HT 96.5%·2.5:1·3M', ratioDesc('HT 0.75x 96.5%', 2.5, 3), {
      acc: 96.5,
      rate: 0.75,
      maRatio: 2.5,
      misses: 3,
    }, lang),
    mkPreset('ht-975-3-2m', 'ht', 'HT 97.5%·3:1·2M', ratioDesc('HT 0.75x 97.5%', 3, 2), {
      acc: 97.5,
      rate: 0.75,
      maRatio: 3,
      misses: 2,
    }, lang),
    mkPreset('ht-98', 'ht', 'HT 98%', isEn ? 'HT 0.75x 98% · 0 Miss (Direct)' : 'HT 0.75x 98% · 0 Miss（直算）', {
      acc: 98,
      rate: 0.75,
    }, lang),
    mkPreset('ht-98-3-1m', 'ht', 'HT 98%·3:1·1M', ratioDesc('HT 0.75x 98%', 3, 1), {
      acc: 98,
      rate: 0.75,
      maRatio: 3,
      misses: 1,
    }, lang),
    mkPreset('ht-99-5', 'ht', 'HT 99%·5:1', ratioDesc('HT 0.75x 99%', 5, 0), {
      acc: 99,
      rate: 0.75,
      maRatio: 5,
    }, lang),
    mkPreset('ht-995-8', 'ht', 'HT 99.5%·8:1', ratioDesc('HT 0.75x 99.5%', 8, 0), {
      acc: 99.5,
      rate: 0.75,
      maRatio: 8,
    }, lang),
    mkPreset('ht-ss', 'ht', 'HT SS 100%', 'HT 0.75x 100% SS · 0 Miss', {
      acc: 100,
      rate: 0.75,
    }, lang),

    // Custom Rate (0.85x–1.4x) — 8 presets
    mkPreset('rate-085-97-25-3m', 'rate', '0.85x 97%·2.5:1·3M', ratioDesc('0.85x 97%', 2.5, 3), {
      acc: 97,
      rate: 0.85,
      maRatio: 2.5,
      misses: 3,
    }, lang),
    mkPreset('rate-090-98-3-1m', 'rate', '0.9x 98%·3:1·1M', ratioDesc('0.9x 98%', 3, 1), {
      acc: 98,
      rate: 0.9,
      maRatio: 3,
      misses: 1,
    }, lang),
    mkPreset('rate-105-985-35-1m', 'rate', '1.05x 98.5%·3.5:1·1M', ratioDesc('1.05x 98.5%', 3.5, 1), {
      acc: 98.5,
      rate: 1.05,
      maRatio: 3.5,
      misses: 1,
    }, lang),
    mkPreset('rate-110-98-3-1m', 'rate', '1.1x 98%·3:1·1M', ratioDesc('1.1x 98%', 3, 1), {
      acc: 98,
      rate: 1.1,
      maRatio: 3,
      misses: 1,
    }, lang),
    mkPreset('rate-115-975-25-2m', 'rate', '1.15x 97.5%·2.5:1·2M', ratioDesc('1.15x 97.5%', 2.5, 2), {
      acc: 97.5,
      rate: 1.15,
      maRatio: 2.5,
      misses: 2,
    }, lang),
    mkPreset('rate-120-98-3-1m', 'rate', '1.2x 98%·3:1·1M', ratioDesc('1.2x 98%', 3, 1), {
      acc: 98,
      rate: 1.2,
      maRatio: 3,
      misses: 1,
    }, lang),
    mkPreset('rate-130-965-2-3m', 'rate', '1.3x 96.5%·2:1·3M', ratioDesc('1.3x 96.5%', 2, 3), {
      acc: 96.5,
      rate: 1.3,
      maRatio: 2,
      misses: 3,
    }, lang),
    mkPreset('rate-140-955-2-5m', 'rate', '1.4x 95.5%·2:1·5M', ratioDesc('1.4x 95.5%', 2, 5), {
      acc: 95.5,
      rate: 1.4,
      maRatio: 2,
      misses: 5,
    }, lang),
  ];
}

export const PP_SCENARIO_PRESETS: PpScenarioPreset[] = getPpScenarioPresets('zh');

export function inferScenarioCategory(
  scenario?: Partial<PpScenarioInput>,
): Exclude<PpScenarioCategory, 'custom'> {
  const rate = scenario?.rate ?? 1;
  if (Math.abs(rate - 1.5) < 0.03) return 'dt';
  if (Math.abs(rate - 0.75) < 0.03) return 'ht';
  if (Math.abs(rate - 1) >= 0.01) return 'rate';
  return 'nm';
}

export function matchesScenarioPatch(
  scenario: Partial<PpScenarioInput>,
  patch: PpScenarioPatch,
): boolean {
  const sMa = scenario.maRatio ?? null;
  const pMa = patch.ppMaRatio ?? null;
  const maMatch =
    sMa === null && pMa === null
      ? true
      : sMa !== null && pMa !== null
        ? Math.abs(sMa - pMa) < 0.05
        : false;
  return (
    Math.abs((scenario.accuracy ?? 98) - patch.ppAccuracy) < 0.05 &&
    Math.abs((scenario.rate ?? 1) - patch.ppRate) < 0.01 &&
    maMatch &&
    (scenario.misses ?? 0) === patch.ppMisses &&
    Boolean(scenario.mods?.classic) === Boolean(patch.ppClassic) &&
    Boolean(scenario.mods?.ez) === Boolean(patch.ppEz) &&
    Boolean(scenario.mods?.nf) === Boolean(patch.ppNf)
  );
}

export function scenarioInputToPatch(scenario: Partial<PpScenarioInput>): PpScenarioPatch {
  const acc = Math.min(100, Math.max(0, Number(scenario.accuracy ?? 98)));
  const rate = Math.min(2, Math.max(0.5, Number(scenario.rate ?? 1)));
  const misses = Math.max(0, Math.round(Number(scenario.misses ?? 0)));
  const rawMa = scenario.maRatio ?? null;
  const maRatio =
    rawMa !== null && Number.isFinite(rawMa) && rawMa >= 0
      ? Math.min(1000, Math.round(rawMa * 100) / 100)
      : undefined;

  return {
    ppAccuracy: Math.round(acc * 10) / 10,
    ppRate: Math.round(rate * 100) / 100,
    ppMisses: misses,
    ppMaRatio: maRatio,
    ppClassic: Boolean(scenario.mods?.classic),
    ppEz: Boolean(scenario.mods?.ez),
    ppNf: Boolean(scenario.mods?.nf),
  };
}

export function loadSavedPpScenarios(): SavedPpScenario[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_PP_SCENARIOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: SavedPpScenario[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !item.patch || typeof item.id !== 'string') {
        continue;
      }
      const p = item.patch as Record<string, unknown>;
      const acc = Number(p.ppAccuracy);
      const rate = Number(p.ppRate);
      if (!Number.isFinite(acc) || !Number.isFinite(rate)) continue;
      const misses = Number.isFinite(Number(p.ppMisses))
        ? Math.max(0, Math.round(Number(p.ppMisses)))
        : 0;
      const maRaw = p.ppMaRatio != null ? Number(p.ppMaRatio) : undefined;
      const ppMaRatio =
        maRaw !== undefined && Number.isFinite(maRaw) && maRaw >= 0 ? maRaw : undefined;
      const cleanPatch: PpScenarioPatch = {
        ppAccuracy: Math.min(100, Math.max(0, acc)),
        ppRate: Math.min(2, Math.max(0.5, rate)),
        ppMisses: misses,
        ppMaRatio,
        ppClassic: Boolean(p.ppClassic),
        ppEz: Boolean(p.ppEz),
        ppNf: Boolean(p.ppNf),
      };
      const name =
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim().slice(0, 48)
          : formatPpScenarioShort({
              accuracy: cleanPatch.ppAccuracy,
              rate: cleanPatch.ppRate,
              misses: cleanPatch.ppMisses,
              maRatio: cleanPatch.ppMaRatio ?? null,
              mods: {
                classic: cleanPatch.ppClassic,
                ez: cleanPatch.ppEz,
                nf: cleanPatch.ppNf,
              },
            });
      valid.push({
        id: item.id,
        name,
        patch: cleanPatch,
        createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now(),
      });
    }
    return valid.slice(0, 24);
  } catch {
    return [];
  }
}

function persistSavedPpScenarios(list: SavedPpScenario[]): SavedPpScenario[] {
  const capped = list.slice(0, 24);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SAVED_PP_SCENARIOS_KEY, JSON.stringify(capped));
      window.dispatchEvent(new Event(SAVED_PP_SCENARIOS_EVENT));
    } catch {
      // Ignore storage error
    }
  }
  return capped;
}

export function saveCustomPpScenario(
  scenario: Partial<PpScenarioInput>,
  customName?: string,
): { list: SavedPpScenario[]; saved: SavedPpScenario } {
  const patch = scenarioInputToPatch(scenario);
  const normalizedInput: PpScenarioInput = {
    accuracy: patch.ppAccuracy,
    rate: patch.ppRate,
    misses: patch.ppMisses,
    maRatio: patch.ppMaRatio ?? null,
    mods: {
      classic: patch.ppClassic,
      ez: patch.ppEz,
      nf: patch.ppNf,
    },
  };
  const name = customName?.trim()
    ? customName.trim().slice(0, 48)
    : formatPpScenarioShort(normalizedInput);

  const existing = loadSavedPpScenarios();
  const deduped = existing.filter((item) => !matchesScenarioPatch(normalizedInput, item.patch));
  const saved: SavedPpScenario = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    patch,
    createdAt: Date.now(),
  };
  const list = persistSavedPpScenarios([saved, ...deduped]);
  return { list, saved };
}

export function deleteSavedPpScenario(id: string): SavedPpScenario[] {
  const existing = loadSavedPpScenarios();
  return persistSavedPpScenarios(existing.filter((item) => item.id !== id));
}

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

export function getQuickPpSummary(
  beatmap: NormalizedBeatmap,
  rate = 1,
  baseScenario?: Partial<PpScenarioInput>,
): QuickPpSummary {
  const maRatio = beatmap.modeInt === 3 ? (baseScenario?.maRatio ?? null) : null;
  const misses = baseScenario?.misses ?? 0;
  const mods = baseScenario?.mods;
  return {
    pp95: calculateBeatmapPp(beatmap, { accuracy: 95, rate, maRatio, misses, mods }).pp,
    pp98: calculateBeatmapPp(beatmap, { accuracy: 98, rate, maRatio, misses, mods }).pp,
    pp99: calculateBeatmapPp(beatmap, { accuracy: 99, rate, maRatio, misses, mods }).pp,
    pp100: calculateBeatmapPp(beatmap, { accuracy: 100, rate, misses: 0, maRatio: null, mods }).pp,
    pp98Dt: calculateBeatmapPp(beatmap, { accuracy: 98, rate: 1.5, maRatio, misses, mods }).pp,
    pp98Ht: calculateBeatmapPp(beatmap, { accuracy: 98, rate: 0.75, maRatio, misses, mods }).pp,
  };
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

export function isDefaultPpScenario(s?: Partial<PpScenarioInput>): boolean {
  const acc = s?.accuracy ?? 98;
  const rate = s?.rate ?? 1;
  const misses = s?.misses ?? 0;
  const maRatio = s?.maRatio ?? null;
  return (
    Math.abs(acc - 98) < 0.01 &&
    Math.abs(rate - 1) < 0.005 &&
    misses === 0 &&
    (maRatio === undefined || maRatio === null) &&
    !s?.mods?.classic &&
    !s?.mods?.ez &&
    !s?.mods?.nf
  );
}

export function formatPpScenarioShort(
  s?: Partial<PpScenarioInput>,
  lang: UiLanguage = getCurrentLang(),
): string {
  const acc = s?.accuracy ?? 98;
  const rate = s?.rate ?? 1;
  const misses = s?.misses ?? 0;
  const maRatio = s?.maRatio ?? null;

  const rateTag =
    Math.abs(rate - 1) < 0.005
      ? 'NM'
      : Math.abs(rate - 1.5) < 0.005
        ? 'DT'
        : Math.abs(rate - 0.75) < 0.005
          ? 'HT'
          : `${Number(rate.toFixed(2))}x`;

  const accTag =
    Math.abs(acc - 100) < 0.01 && maRatio === null && misses === 0
      ? 'SS'
      : `${Number(acc.toFixed(1))}%`;

  const parts = [`${rateTag} ${accTag}`];
  if (maRatio !== null && Number.isFinite(maRatio) && maRatio >= 0) {
    parts.push(maRatio >= 999 ? tx('全彩', 'MAX', lang) : `${Number(maRatio.toFixed(1))}:1`);
  }
  if (misses > 0) parts.push(`${misses}M`);
  if (s?.mods?.classic) parts.push('CL');
  if (s?.mods?.ez) parts.push('EZ');
  if (s?.mods?.nf) parts.push('NF');
  return parts.join('·');
}

export function getBeatmapsetPpBadge(
  beatmapset: NormalizedBeatmapset,
  scenario?: Partial<PpScenarioInput>,
  lang: UiLanguage = getCurrentLang(),
): { label: string; tooltip: string; focusDiffId: number } | null {
  if (!isRankedForPp(beatmapset.status) || beatmapset.beatmaps.length === 0) return null;

  const matching = beatmapset.beatmaps.filter((b) => b.matchesFilter !== false);
  const pool = matching.length > 0 ? matching : beatmapset.beatmaps;
  const sorted = [...pool].sort((a, b) => a.difficultyRating - b.difficultyRating);
  const highest = sorted[sorted.length - 1];

  const hasCustomScenario = Boolean(scenario && !isDefaultPpScenario(scenario));
  const effectiveScenario: Partial<PpScenarioInput> = hasCustomScenario
    ? scenario!
    : { accuracy: 98, rate: 1 };

  const pps = sorted.map((b) => Math.round(calculateBeatmapPp(b, effectiveScenario).pp));
  const minPp = Math.min(...pps);
  const maxPp = Math.max(...pps);
  const label =
    sorted.length === 1 || minPp === maxPp
      ? `~${formatPp(maxPp)}pp`
      : `~${formatPp(minPp)}–${formatPp(maxPp)}pp`;

  const q = getQuickPpSummary(highest, 1);
  const keyTag = highest.modeInt === 3 ? `${Math.round(highest.cs)}K ` : '';
  const isEn = lang === 'en';
  const lines = [
    isEn
      ? `Highest match: ${keyTag}${highest.difficultyRating.toFixed(2)}★ (${highest.version})`
      : `最高匹配难度: ${keyTag}${highest.difficultyRating.toFixed(2)}★ (${highest.version})`,
  ];
  if (hasCustomScenario) {
    const customHighestPp = calculateBeatmapPp(highest, effectiveScenario).pp;
    lines.push(
      isEn
        ? `Current scenario (${formatPpScenarioShort(effectiveScenario, lang)}): ~${formatPp(customHighestPp)}pp`
        : `当前筛选情景 (${formatPpScenarioShort(effectiveScenario, lang)}): ~${formatPp(customHighestPp)}pp`,
    );
  }
  lines.push(
    `NM 95%: ~${formatPp(q.pp95)}pp · 98%: ~${formatPp(q.pp98)}pp · 99%: ~${formatPp(q.pp99)}pp · SS: ~${formatPp(q.pp100)}pp`,
    `DT(1.5x) 98%: ~${formatPp(q.pp98Dt)}pp · HT(0.75x) 98%: ~${formatPp(q.pp98Ht)}pp`,
    isEn ? 'Click to open PP Scenario Calculator' : '点击打开 PP 情景计算器',
  );

  return {
    label,
    tooltip: lines.join('\n'),
    focusDiffId: highest.id,
  };
}
