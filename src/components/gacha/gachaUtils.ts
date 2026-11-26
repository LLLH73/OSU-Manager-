import { getStarSpectrum } from '../../constants';
import { getCurrentLang, tx, type UiLanguage } from '../../i18n';
import type {
  GachaPackId,
  NormalizedBeatmap,
  NormalizedBeatmapset,
  SearchFilters,
} from '../../types';
import {
  DEFAULT_PP_MODS,
  calculateBeatmapPp,
  formatPp,
  formatPpScenarioShort,
  type PpScenarioInput,
} from '../../utils/pp';

export type GachaPackSigil =
  | 'astrolabe'
  | 'prism'
  | 'crown'
  | 'pulse'
  | 'weave'
  | 'heart'
  | 'filter';

export interface GachaPackMeta {
  id: GachaPackId;
  code: string;
  sigil: GachaPackSigil;
  name: string;
  editorialSub: string;
  tagline: string;
  badge: string;
  foilGradient: string;
  accentHex: string;
  glowHex: string;
  swatches: [string, string, string];
  starRangeLabel: string;
}

export function getGachaPacks(lang: UiLanguage = getCurrentLang()): GachaPackMeta[] {
  const isEn = lang === 'en';
  return [
    {
      id: 'standard',
      code: '01',
      sigil: 'astrolabe',
      name: isEn ? 'Starlight Classic' : '星辉经典包',
      editorialSub: 'CELESTIAL STANDARD',
      tagline: isEn
        ? 'Balanced leaderboard maps across all star ratings'
        : '全分段排行榜热图均衡抽取，惊喜开包首选',
      badge: isEn ? 'ALL-ROUND' : '全分段',
      foilGradient: 'linear-gradient(150deg, #101935 0%, #243e8e 48%, #0a1026 100%)',
      accentHex: '#3a5bc2',
      glowHex: '#8ab4ff',
      swatches: ['#3a5bc2', '#8ab4ff', '#1b2125'],
      starRangeLabel: '1.5★ – 10★+',
    },
    {
      id: 'pp_farm',
      code: '02',
      sigil: 'prism',
      name: isEn ? 'Ranked PP Boost' : 'PP 冲分补给包',
      editorialSub: 'RANKED PP TELEMETRY',
      tagline: isEn
        ? 'Ranked maps tuned for sweet-spot 3.5★–7.2★ PP climbing'
        : '聚焦 3.5★–7.2★ Ranked 冲分甜点谱面',
      badge: 'RANKED PP',
      foilGradient: 'linear-gradient(150deg, #2d0e28 0%, #7d2553 48%, #180716 100%)',
      accentHex: '#b83b74',
      glowHex: '#f08dbb',
      swatches: ['#b83b74', '#3a5bc2', '#1b2125'],
      starRangeLabel: '3.5★ – 7.2★',
    },
    {
      id: 'high_star',
      code: '03',
      sigil: 'crown',
      name: isEn ? 'Mythic Overdrive' : '魔王高星秘匣',
      editorialSub: 'APEX DIFFICULTY',
      tagline: isEn
        ? '6.0★+ high-density & boss charts for brave climbers'
        : '6.0★+ 高星魔王与高强度压迫练习图集',
      badge: '6.0★+ BOSS',
      foilGradient: 'linear-gradient(150deg, #330d15 0%, #8a1f32 48%, #1a060a 100%)',
      accentHex: '#c83e4d',
      glowHex: '#fcd34d',
      swatches: ['#c83e4d', '#d99b26', '#1b2125'],
      starRangeLabel: '6.0★+',
    },
    {
      id: 'rice_stream',
      code: '04',
      sigil: 'pulse',
      name: isEn ? 'Pure Rice & Stream' : '单键切菜军火库',
      editorialSub: 'RICE PRECISION',
      tagline: isEn
        ? 'Crisp Rice, Jumpstream & Handstream focus (LN <= 18%)'
        : '专注于高手感单键交互、跳串与手串 (LN <= 18%)',
      badge: 'RICE <=18%',
      foilGradient: 'linear-gradient(150deg, #072834 0%, #0d5d73 48%, #04171f 100%)',
      accentHex: '#0e7490',
      glowHex: '#67e8f9',
      swatches: ['#0e7490', '#3a5bc2', '#1b2125'],
      starRangeLabel: 'LN <= 18%',
    },
    {
      id: 'ln_tech',
      code: '05',
      sigil: 'weave',
      name: isEn ? 'Long-Note Weaver' : '长条技巧秘典',
      editorialSub: 'LONG-NOTE WEAVE',
      tagline: isEn
        ? 'Technical LN & Inverse challenge charts (LN >= 42%)'
        : '专攻松手时机与长条读谱技巧 (LN >= 42%)',
      badge: 'LN >=42%',
      foilGradient: 'linear-gradient(150deg, #072a25 0%, #0f6b5f 48%, #041815 100%)',
      accentHex: '#0f766e',
      glowHex: '#5eead4',
      swatches: ['#0f766e', '#3a5bc2', '#1b2125'],
      starRangeLabel: 'LN >= 42%',
    },
    {
      id: 'loved_chaos',
      code: '06',
      sigil: 'heart',
      name: isEn ? 'Loved Gems Sanctuary' : 'Loved 社区遗珠',
      editorialSub: 'COMMUNITY SANCTUARY',
      tagline: isEn
        ? 'Unranked community favorites with iconic gimmick charts'
        : '玩家票选精华 Loved 名曲与演出佳作',
      badge: 'LOVED',
      foilGradient: 'linear-gradient(150deg, #360c27 0%, #981b55 48%, #1c0514 100%)',
      accentHex: '#be185d',
      glowHex: '#f9a8d4',
      swatches: ['#be185d', '#6c8eff', '#1b2125'],
      starRangeLabel: 'Loved',
    },
    {
      id: 'current_filter',
      code: '07',
      sigil: 'filter',
      name: isEn ? 'Custom Filter Pack' : '当前筛选定制包',
      editorialSub: 'ACTIVE FILTER POOL',
      tagline: isEn
        ? 'Draws strictly from your active Browse search & filter rules'
        : '严格继承你当前搜图页的筛选与场景条件随机抽选',
      badge: isEn ? 'CUSTOM' : '当前筛选',
      foilGradient: 'linear-gradient(150deg, #1b2029 0%, #374357 48%, #0f131a 100%)',
      accentHex: '#475569',
      glowHex: '#93c5fd',
      swatches: ['#334155', '#3a5bc2', '#d97706'],
      starRangeLabel: isEn ? 'Active Filters' : '跟随筛选',
    },
  ];
}

export type StarRarityTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface StarRarityMeta {
  tier: StarRarityTier;
  label: string;
  /** Primary bright glow color (used on hover perimeter aura & Hearthstone flip flash) */
  glow: string;
  /** Secondary prismatic companion glow */
  glowSecondary: string;
  /** Official spectrum color */
  spectrum: string;
  /** Text badge color */
  badgeBg: string;
  badgeText: string;
  sparkCount: number;
}

export function getStarRarityMeta(
  stars: number,
  lang: UiLanguage = getCurrentLang(),
): StarRarityMeta {
  const safeStars = Number.isFinite(stars) ? Math.max(0, stars) : 0;
  const spectrum = getStarSpectrum(safeStars);
  if (safeStars >= 8.0) {
    return {
      tier: 'mythic',
      label: tx('超新星神话', 'MYTHIC NOVA', lang),
      glow: '#ffd966',
      glowSecondary: '#c084fc',
      spectrum,
      badgeBg: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 55%, #8b5cf6 100%)',
      badgeText: '#ffffff',
      sparkCount: 16,
    };
  }
  if (safeStars >= 6.3) {
    return {
      tier: 'legendary',
      label: tx('传说星耀', 'LEGENDARY', lang),
      glow: '#fbbf24',
      glowSecondary: '#f97316',
      spectrum,
      badgeBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      badgeText: '#1a0f00',
      sparkCount: 12,
    };
  }
  if (safeStars >= 4.8) {
    return {
      tier: 'epic',
      label: tx('史诗流光', 'EPIC', lang),
      glow: '#f43f5e',
      glowSecondary: '#a855f7',
      spectrum,
      badgeBg: 'linear-gradient(135deg, #e11d48 0%, #a855f7 100%)',
      badgeText: '#ffffff',
      sparkCount: 8,
    };
  }
  if (safeStars >= 3.0) {
    return {
      tier: 'rare',
      label: tx('稀有精粹', 'RARE', lang),
      glow: '#34d399',
      glowSecondary: '#facc15',
      spectrum,
      badgeBg: 'linear-gradient(135deg, #10b981 0%, #84cc16 100%)',
      badgeText: '#052e16',
      sparkCount: 5,
    };
  }
  return {
    tier: 'common',
    label: tx('星尘常规', 'STARLIGHT', lang),
    glow: '#38bdf8',
    glowSecondary: '#818cf8',
    spectrum,
    badgeBg: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
    badgeText: '#ffffff',
    sparkCount: 0,
  };
}

export function pickFeaturedBeatmap(
  set: NormalizedBeatmapset,
  filters?: Partial<SearchFilters>,
): NormalizedBeatmap | null {
  if (!set.beatmaps || set.beatmaps.length === 0) return null;
  const matching = set.beatmaps.filter((b) => b.matchesFilter !== false);
  let pool = matching.length > 0 ? matching : set.beatmaps;
  if (filters?.mode && filters.mode !== 'any') {
    const modeNum = Number(filters.mode);
    const sameMode = pool.filter((b) => b.modeInt === modeNum);
    if (sameMode.length > 0) pool = sameMode;
  }
  const sorted = [...pool].sort((a, b) => a.difficultyRating - b.difficultyRating);
  return sorted[sorted.length - 1] ?? null;
}

export interface CardSummaryStats {
  featuredDiff: NormalizedBeatmap | null;
  repStars: number;
  minStars: number;
  maxStars: number;
  keysTag: string | null;
  lengthSec: number;
  ppValue: number;
  ppLabel: string;
}

export function getCardSummaryStats(
  set: NormalizedBeatmapset,
  ppScenario?: Partial<PpScenarioInput>,
  filters?: Partial<SearchFilters>,
): CardSummaryStats {
  const featured = pickFeaturedBeatmap(set, filters);
  const matching = set.beatmaps.filter((b) => b.matchesFilter !== false);
  const pool = matching.length > 0 ? matching : set.beatmaps;
  const starsList = pool
    .map((b) => b.difficultyRating)
    .filter((s) => Number.isFinite(s) && s > 0);
  const minStars = starsList.length > 0 ? Math.min(...starsList) : (featured?.difficultyRating ?? 0);
  const maxStars = starsList.length > 0 ? Math.max(...starsList) : (featured?.difficultyRating ?? 0);
  const repStars = featured?.difficultyRating ?? maxStars;

  const keysTag = featured
    ? featured.modeInt === 3
      ? `${Math.round(featured.cs)}K`
      : featured.mode.toUpperCase()
    : null;
  const lengthSec = featured?.totalLength ?? 0;

  const ppCalc = featured
    ? calculateBeatmapPp(featured, {
        accuracy: ppScenario?.accuracy ?? 98,
        misses: ppScenario?.misses ?? 0,
        rate: ppScenario?.rate ?? 1,
        mods: ppScenario?.mods ?? DEFAULT_PP_MODS,
        maRatio: ppScenario?.maRatio ?? null,
      })
    : null;
  const ppValue = ppCalc ? Math.round(ppCalc.pp) : 0;
  const ppLabel = ppValue > 0 ? `~${formatPp(ppValue)}pp` : '— pp';

  return {
    featuredDiff: featured,
    repStars,
    minStars,
    maxStars,
    keysTag,
    lengthSec,
    ppValue,
    ppLabel,
  };
}

export interface GuessScenarioChoice {
  id: string;
  input: PpScenarioInput;
  rateTag: 'NM' | 'HT' | 'DT';
  maRatioLabel: string;
  shortTag: string;
  detailLabel: string;
}

export function pickGuessScenario(
  seed: number,
  lang: UiLanguage = getCurrentLang(),
): GuessScenarioChoice {
  const mk = (
    id: string,
    rateTag: 'NM' | 'HT' | 'DT',
    acc: number,
    misses: number,
    maRatio: number | null,
    opts?: { ez?: boolean; classic?: boolean },
  ) => {
    const rate = rateTag === 'DT' ? 1.5 : rateTag === 'HT' ? 0.75 : 1;
    const mods = {
      ...DEFAULT_PP_MODS,
      ez: Boolean(opts?.ez),
      classic: Boolean(opts?.classic),
    };
    const input: PpScenarioInput = { accuracy: acc, misses, rate, mods, maRatio };
    const maRatioLabel =
      maRatio === null
        ? tx('直算标准', 'Direct', lang)
        : maRatio >= 999
          ? tx('∞ 全彩 MAX', 'MAX ∞:1', lang)
          : `${maRatio}:1`;
    const modBits = [
      opts?.ez ? 'EZ' : null,
      opts?.classic ? 'Classic' : null,
    ].filter(Boolean);
    const modSuffix = modBits.length > 0 ? ` · ${modBits.join('+')}` : '';
    const detailLabel = tx(
      `${rateTag} ${rate}× · ${acc}% · 黄彩比 ${maRatioLabel} · ${misses}M${modSuffix}`,
      `${rateTag} ${rate}× · ${acc}% · MA ${maRatioLabel} · ${misses}M${modSuffix}`,
      lang,
    );
    return {
      id,
      input,
      rateTag,
      maRatioLabel,
      shortTag: formatPpScenarioShort(input, lang),
      detailLabel,
    };
  };

  // Strictly NM (1.0x), HT (0.75x), or DT (1.5x) — zero custom rates; rich MA ratios & mods
  const scenarios: GuessScenarioChoice[] = [
    mk('nm-95-2', 'NM', 95, 5, 2),
    mk('nm-965-25', 'NM', 96.5, 3, 2.5),
    mk('nm-975-3', 'NM', 97.5, 2, 3),
    mk('nm-98-direct', 'NM', 98, 0, null),
    mk('nm-98-4', 'NM', 98, 1, 4),
    mk('nm-985-5', 'NM', 98.5, 0, 5),
    mk('nm-99-8', 'NM', 99, 0, 8),
    mk('nm-995-12', 'NM', 99.5, 0, 12),
    mk('nm-100-max', 'NM', 100, 0, 999),
    mk('nm-ez-98', 'NM', 98, 1, 3, { ez: true }),
    mk('ht-95-2', 'HT', 95, 4, 2),
    mk('ht-965-25', 'HT', 96.5, 2, 2.5),
    mk('ht-975-3', 'HT', 97.5, 1, 3),
    mk('ht-98-4', 'HT', 98, 0, 4),
    mk('ht-985-5', 'HT', 98.5, 0, 5),
    mk('ht-995-12', 'HT', 99.5, 0, 12),
    mk('ht-100-max', 'HT', 100, 0, 999),
    mk('dt-935-15', 'DT', 93.5, 8, 1.5),
    mk('dt-95-2', 'DT', 95, 5, 2),
    mk('dt-965-25', 'DT', 96.5, 3, 2.5),
    mk('dt-975-3', 'DT', 97.5, 2, 3),
    mk('dt-985-5', 'DT', 98.5, 0, 5),
    mk('dt-99-8', 'DT', 99, 0, 8),
    mk('dt-classic-98', 'DT', 98, 1, 3, { classic: true }),
  ];

  const hashed = Math.abs(Math.imul(Math.floor(seed) + 7, 2654435761)) >>> 0;
  return scenarios[hashed % scenarios.length];
}

export interface StarGuessScoreResult {
  score: number;
  diff: number;
  signedDiff: number;
  grade: 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
  feedback: string;
}

export function scoreStarGuess(
  guess: number,
  actual: number,
  lang: UiLanguage = getCurrentLang(),
): StarGuessScoreResult {
  const signedDiff = guess - actual;
  const diff = Math.abs(signedDiff);
  const score = Math.round(1000 * Math.exp(-(diff * diff) / 0.85));

  if (diff <= 0.15) {
    return {
      score,
      diff,
      signedDiff,
      grade: 'SS',
      feedback: tx('神乎其技！几乎零误差命中真实星数', 'Pinpoint Bullseye! Virtually zero error', lang),
    };
  }
  if (diff <= 0.35) {
    return {
      score,
      diff,
      signedDiff,
      grade: 'S',
      feedback: tx('眼力犀利！与真实星数仅差毫厘', 'Sharp Read! Just a hair away from truth', lang),
    };
  }
  if (diff <= 0.7) {
    return {
      score,
      diff,
      signedDiff,
      grade: 'A',
      feedback: tx('判断稳健，误差在常规浮动范围内', 'Solid Estimate! Right around the ballpark', lang),
    };
  }
  if (diff <= 1.2) {
    return {
      score,
      diff,
      signedDiff,
      grade: 'B',
      feedback: tx('小有偏差，可以多留意 BPM、长度与倍速提示', 'Close-ish — watch BPM, length & rate mod', lang),
    };
  }
  if (diff <= 2.0) {
    return {
      score,
      diff,
      signedDiff,
      grade: 'C',
      feedback: tx('偏差较大，注意不同情景倍率对 PP 的放大作用', 'Off Target — rate & accuracy strongly shift PP', lang),
    };
  }
  return {
    score,
    diff,
    signedDiff,
    grade: 'D',
    feedback: tx('偏离较远，再来一题校准你的 PP 星数直觉', 'Way Off — recalibrate with the next card!', lang),
  };
}
