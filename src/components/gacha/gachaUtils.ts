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

export interface GachaPackMeta {
  id: GachaPackId;
  code: string;
  name: string;
  tagline: string;
  badge: string;
  foilGradient: string;
  accentHex: string;
  glowHex: string;
  starRangeLabel: string;
}

export function getGachaPacks(lang: UiLanguage = getCurrentLang()): GachaPackMeta[] {
  const isEn = lang === 'en';
  return [
    {
      id: 'standard',
      code: '01',
      name: isEn ? 'Starlight Classic' : '星辉经典包',
      tagline: isEn
        ? 'Balanced leaderboard maps across all star ratings'
        : '全分段排行榜热图均衡抽取，惊喜开包首选',
      badge: isEn ? 'ALL-ROUND' : '全分段',
      foilGradient: 'linear-gradient(145deg, #1b285c 0%, #2d3d8e 42%, #131b46 100%)',
      accentHex: '#60a5fa',
      glowHex: '#93c5fd',
      starRangeLabel: '1.5★ – 10★+',
    },
    {
      id: 'pp_farm',
      code: '02',
      name: isEn ? 'Ranked PP Boost' : 'PP 冲分补给包',
      tagline: isEn
        ? 'Ranked maps tuned for sweet-spot 3.5★–7.2★ PP climbing'
        : '聚焦 3.5★–7.2★ Ranked 冲分甜点谱面',
      badge: 'RANKED PP',
      foilGradient: 'linear-gradient(145deg, #431757 0%, #7c2d96 45%, #230c33 100%)',
      accentHex: '#e879f9',
      glowHex: '#f0abfc',
      starRangeLabel: '3.5★ – 7.2★',
    },
    {
      id: 'high_star',
      code: '03',
      name: isEn ? 'Mythic Overdrive' : '魔王高星秘匣',
      tagline: isEn
        ? '6.0★+ high-density & boss charts for brave climbers'
        : '6.0★+ 高星魔王与高强度压迫练习图集',
      badge: '6.0★+ BOSS',
      foilGradient: 'linear-gradient(145deg, #451524 0%, #8f1d3e 45%, #230913 100%)',
      accentHex: '#fbbf24',
      glowHex: '#fde047',
      starRangeLabel: '6.0★+',
    },
    {
      id: 'rice_stream',
      code: '04',
      name: isEn ? 'Pure Rice & Stream' : '单键切菜军火库',
      tagline: isEn
        ? 'Crisp Rice, Jumpstream & Handstream focus (LN <= 18%)'
        : '专注于高手感单键交互、跳串与手串 (LN <= 18%)',
      badge: 'RICE <=18%',
      foilGradient: 'linear-gradient(145deg, #0b3c49 0%, #0e7490 46%, #07222b 100%)',
      accentHex: '#22d3ee',
      glowHex: '#67e8f9',
      starRangeLabel: 'LN <= 18%',
    },
    {
      id: 'ln_tech',
      code: '05',
      name: isEn ? 'Long-Note Weaver' : '长条技巧秘典',
      tagline: isEn
        ? 'Technical LN & Inverse challenge charts (LN >= 42%)'
        : '专攻松手时机与长条读谱技巧 (LN >= 42%)',
      badge: 'LN >=42%',
      foilGradient: 'linear-gradient(145deg, #0d3b2e 0%, #059669 45%, #062119 100%)',
      accentHex: '#34d399',
      glowHex: '#6ee7b7',
      starRangeLabel: 'LN >= 42%',
    },
    {
      id: 'loved_chaos',
      code: '06',
      name: isEn ? 'Loved Gems Sanctuary' : 'Loved 社区遗珠',
      tagline: isEn
        ? 'Unranked community favorites with iconic gimmick charts'
        : '玩家票选精华 Loved 名曲与演出佳作',
      badge: 'LOVED',
      foilGradient: 'linear-gradient(145deg, #4f173c 0%, #be185d 45%, #280a1e 100%)',
      accentHex: '#f472b6',
      glowHex: '#f9a8d4',
      starRangeLabel: 'Loved',
    },
    {
      id: 'current_filter',
      code: '07',
      name: isEn ? 'Custom Filter Pack' : '当前筛选定制包',
      tagline: isEn
        ? 'Draws strictly from your active Browse search & filter rules'
        : '严格继承你当前搜图页的筛选与场景条件随机抽选',
      badge: isEn ? 'CUSTOM' : '当前筛选',
      foilGradient: 'linear-gradient(145deg, #27272a 0%, #4b5563 45%, #18181b 100%)',
      accentHex: '#f59e0b',
      glowHex: '#fcd34d',
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
  shortTag: string;
  detailLabel: string;
}

export function pickGuessScenario(
  seed: number,
  lang: UiLanguage = getCurrentLang(),
): GuessScenarioChoice {
  const presets: Array<{ id: string; input: PpScenarioInput; zhDesc: string; enDesc: string }> = [
    {
      id: 'nm98',
      input: { accuracy: 98, misses: 0, rate: 1, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: '原速 NM · 98.0% · 0 Miss',
      enDesc: 'NM 1.0× · 98.0% · 0 Miss',
    },
    {
      id: 'nm99',
      input: { accuracy: 99, misses: 0, rate: 1, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: '原速 NM · 99.0% 高准度 · 0 Miss',
      enDesc: 'NM 1.0× · 99.0% High Acc · 0 Miss',
    },
    {
      id: 'dt98',
      input: { accuracy: 98, misses: 0, rate: 1.5, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: 'DT 1.5× 加速 · 98.0% · 0 Miss',
      enDesc: 'DT 1.5× Speed · 98.0% · 0 Miss',
    },
    {
      id: 'ht98',
      input: { accuracy: 98, misses: 0, rate: 0.75, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: 'HT 0.75× 减速 · 98.0% · 0 Miss',
      enDesc: 'HT 0.75× Slow · 98.0% · 0 Miss',
    },
    {
      id: 'rate12',
      input: { accuracy: 98, misses: 0, rate: 1.2, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: 'Rate 1.2× 练图 · 98.0% · 0 Miss',
      enDesc: 'Rate 1.2× Practice · 98.0% · 0 Miss',
    },
    {
      id: 'nm95',
      input: { accuracy: 95, misses: 0, rate: 1, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: '原速 NM · 95.0% · 0 Miss',
      enDesc: 'NM 1.0× · 95.0% · 0 Miss',
    },
    {
      id: 'nmss',
      input: { accuracy: 100, misses: 0, rate: 1, mods: { ...DEFAULT_PP_MODS }, maRatio: null },
      zhDesc: '原速 NM · 理论满分 100% SS',
      enDesc: 'NM 1.0× · 100% SS Theoretical',
    },
  ];
  const idx = Math.abs(Math.floor(seed)) % presets.length;
  const picked = presets[idx];
  return {
    id: picked.id,
    input: picked.input,
    shortTag: formatPpScenarioShort(picked.input, lang),
    detailLabel: tx(picked.zhDesc, picked.enDesc, lang),
  };
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
