import { DownloadTarget, DownloadVariant, SearchFilters, SongViewMode, ThemeId } from './types';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.10.0';
export const PROJECT_REPO_URL = 'https://github.com/LLLH73/OSU-Manager-';

export interface ViewModeMeta {
  id: SongViewMode;
  label: string;
  desc: string;
}

export const VIEW_MODE_OPTIONS: ViewModeMeta[] = [
  { id: 'grid', label: '卡片', desc: '多列封面网格视图' },
  { id: 'list', label: '列表', desc: '高密度紧凑条目视图' },
  { id: 'lazer', label: 'Lazer', desc: 'osu!lazer 弧形选歌轮盘与动效' },
];

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  desc: string;
  isDark: boolean;
  swatchBg: string;
  swatchRing: string;
  electronBg: string;
}

export const THEME_OPTIONS: ThemeMeta[] = [
  {
    id: 'dark',
    label: '曜石黑',
    desc: '深邃暗夜对比，音游护眼',
    isDark: true,
    swatchBg: '#12141f',
    swatchRing: '#a855f7',
    electronBg: '#0b0c12',
  },
  {
    id: 'stone',
    label: '墨石暗夜',
    desc: 'Impeccable 温润炭灰石感',
    isDark: true,
    swatchBg: '#1a1a18',
    swatchRing: '#ec5b8e',
    electronBg: '#131312',
  },
  {
    id: 'midnight',
    label: '深海午夜',
    desc: '沉静靛蓝夜色，长时舒适',
    isDark: true,
    swatchBg: '#0c1526',
    swatchRing: '#38bdf8',
    electronBg: '#070d18',
  },
  {
    id: 'forest',
    label: '松影暗绿',
    desc: '低饱和深松绿，柔和护眼',
    isDark: true,
    swatchBg: '#101c17',
    swatchRing: '#34d399',
    electronBg: '#0a120f',
  },
  {
    id: 'light',
    label: '瓷器白',
    desc: '通透清简，日间高对比度',
    isDark: false,
    swatchBg: '#f8f9fc',
    swatchRing: '#e03a82',
    electronBg: '#f3f5f9',
  },
  {
    id: 'paper',
    label: '暖石纸感',
    desc: 'Impeccable 雪花石膏纸面',
    isDark: false,
    swatchBg: '#f6f4ef',
    swatchRing: '#d6336c',
    electronBg: '#f6f4ef',
  },
  {
    id: 'latte',
    label: '浅咖啡',
    desc: '温润燕麦拿铁纸感配色',
    isDark: false,
    swatchBg: '#efe4d4',
    swatchRing: '#b87e14',
    electronBg: '#f2ebe1',
  },
  {
    id: 'sakura',
    label: '樱雾浅粉',
    desc: '柔和淡樱音游浅色氛围',
    isDark: false,
    swatchBg: '#fdf2f6',
    swatchRing: '#e14b88',
    electronBg: '#fbf1f5',
  },
];

export const VALID_THEMES: ThemeId[] = THEME_OPTIONS.map((t) => t.id);

export const DARK_THEME_IDS: ReadonlySet<ThemeId> = new Set(
  THEME_OPTIONS.filter((t) => t.isDark).map((t) => t.id),
);

export function isValidTheme(val: unknown): val is ThemeId {
  return typeof val === 'string' && VALID_THEMES.includes(val as ThemeId);
}

export function isDarkTheme(id: ThemeId): boolean {
  return DARK_THEME_IDS.has(id);
}

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.25;
export const DEFAULT_FONT_SCALE = 1.2;

export const FONT_SCALE_PRESETS: Array<{ id: string; label: string; value: number }> = [
  { id: 'compact', label: '紧凑', value: 0.9 },
  { id: 'normal', label: '标准', value: 1.0 },
  { id: 'comfortable', label: '偏大', value: 1.1 },
  { id: 'large', label: '大号', value: 1.2 },
];

export function clampFontScale(val: unknown, fallback = DEFAULT_FONT_SCALE): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(n * 100) / 100));
}

export const ACCENT_PRESETS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'osu-pink', label: 'osu! 粉', hex: '#ff66aa' },
  { id: 'lazer-violet', label: 'Lazer 紫', hex: '#a855f7' },
  { id: 'impeccable-rose', label: '玫红', hex: '#d6336c' },
  { id: 'ice-blue', label: '冰海蓝', hex: '#38bdf8' },
  { id: 'mint-teal', label: '薄荷青', hex: '#2dd4bf' },
  { id: 'emerald', label: '翡翠绿', hex: '#34d399' },
  { id: 'amber-gold', label: '琥珀金', hex: '#f59e0b' },
  { id: 'coral-red', label: '珊瑚红', hex: '#fb7185' },
  { id: 'indigo', label: '靛蓝', hex: '#6366f1' },
  { id: 'slate-silver', label: '银石', hex: '#94a3b8' },
];

export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  mode: '3',
  keys: '4',
  status: 'leaderboard',
  sort: 'ranked_date:desc',
  nsfw: false,
  includeConverts: false,
  installedFilter: 'all',
  source: 'auto',
};

export interface WorkflowPreset {
  id: string;
  label: string;
  badge: string;
  description: string;
  suggestedTarget?: DownloadTarget;
  filters: Partial<SearchFilters>;
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'rice-4k',
    label: '4K 单键 Rice',
    badge: 'LN≤15%',
    description: '纯单键 / 极少长条的 4K 切指、爆裂或交互图',
    filters: {
      ...DEFAULT_FILTERS,
      mode: '3',
      keys: '4',
      status: 'any',
      sort: 'favourite_count:desc',
      maxLn: 15,
    },
  },
  {
    id: 'ln-4k',
    label: '4K 长条 LN',
    badge: 'LN≥45%',
    description: '长条占比 ≥ 45% 的 4K LN 专项图',
    filters: {
      ...DEFAULT_FILTERS,
      mode: '3',
      keys: '4',
      status: 'any',
      sort: 'favourite_count:desc',
      minLn: 45,
    },
  },
  {
    id: 'dan-4k',
    label: 'Dan 段位 / 练习包',
    badge: 'Dan',
    description: '搜索 4K Dan 段位与经典练习合集包（含坟图）',
    suggestedTarget: 'stable',
    filters: {
      ...DEFAULT_FILTERS,
      q: 'dan',
      mode: '3',
      keys: '4',
      status: 'any',
      sort: 'favourite_count:desc',
    },
  },
  {
    id: 'all-modes',
    label: '全部模式',
    badge: '全模式',
    description: '显示 Standard / Taiko / Catch / Mania 全模式',
    filters: {
      ...DEFAULT_FILTERS,
      mode: 'any',
      keys: 'any',
      status: 'leaderboard',
      sort: 'ranked_date:desc',
    },
  },
];

export const OSU_GENRES = [
  { id: 0, label: '全部曲风 (Any)' },
  { id: 1, label: '未指定 (Unspecified)' },
  { id: 2, label: '游戏原声 (Video Game)' },
  { id: 3, label: '动漫 (Anime)' },
  { id: 4, label: '摇滚 (Rock)' },
  { id: 5, label: '流行 (Pop)' },
  { id: 6, label: '其他 (Other)' },
  { id: 7, label: '新奇/恶搞 (Novelty)' },
  { id: 9, label: '嘻哈 (Hip Hop)' },
  { id: 10, label: '电子 (Electronic)' },
  { id: 11, label: '金属 (Metal)' },
  { id: 12, label: '古典 (Classical)' },
  { id: 13, label: '民谣 (Folk)' },
  { id: 14, label: '爵士 (Jazz)' },
];

export const OSU_LANGUAGES = [
  { id: 0, label: '全部语言 (Any)' },
  { id: 2, label: '英语 (English)' },
  { id: 3, label: '日语 (Japanese)' },
  { id: 4, label: '中文 (Chinese)' },
  { id: 5, label: '纯音乐 (Instrumental)' },
  { id: 6, label: '韩语 (Korean)' },
  { id: 7, label: '法语 (French)' },
  { id: 8, label: '德语 (German)' },
  { id: 9, label: '瑞典语 (Swedish)' },
  { id: 10, label: '西班牙语 (Spanish)' },
  { id: 11, label: '意大利语 (Italian)' },
  { id: 12, label: '俄语 (Russian)' },
  { id: 13, label: '波兰语 (Polish)' },
  { id: 1, label: '未指定 (Unspecified)' },
  { id: 14, label: '其他 (Other)' },
];

export const STATUS_OPTIONS = [
  { value: 'leaderboard', label: '有排行榜 (Leaderboard)' },
  { value: 'ranked', label: '已上架 (Ranked)' },
  { value: 'qualified', label: '过审 (Qualified)' },
  { value: 'loved', label: '社区喜爱 (Loved)' },
  { value: 'pending', label: '待审核 (Pending)' },
  { value: 'wip', label: '制作中 (WIP)' },
  { value: 'graveyard', label: '坟图 (Graveyard)' },
  { value: 'any', label: '全部状态 (Any)' },
] as const;

export const SORT_FIELDS = [
  { value: 'ranked_date', label: '上架时间' },
  { value: 'submitted_date', label: '提交时间' },
  { value: 'last_updated', label: '更新时间' },
  { value: 'play_count', label: '游玩次数' },
  { value: 'favourite_count', label: '收藏人数' },
  { value: 'beatmaps.difficulty_rating', label: '最高星数' },
  { value: 'bpm', label: 'BPM' },
  { value: 'title', label: '曲名' },
  { value: 'artist', label: '艺术家' },
];

export const QUICK_PRACTICE_TAGS = [
  'dan',
  'stream',
  'jumpstream',
  'handstream',
  'jack',
  'chordjack',
  'tech',
  'speed',
  'camellia',
  'ln',
];

const STAR_DOMAIN = [0.1, 1.25, 2, 2.5, 3.3, 4.2, 4.9, 5.8, 6.7, 7.7, 9];
const STAR_RANGE = [
  '#4290fb',
  '#4fc0ff',
  '#4fffd5',
  '#7cff4f',
  '#f6f05c',
  '#ff8068',
  '#ff4e6f',
  '#c645b8',
  '#6563de',
  '#18158e',
  '#000000',
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function gammaMix(a: number, b: number, t: number, gamma = 2.2): number {
  const ga = Math.pow(a / 255, gamma);
  const gb = Math.pow(b / 255, gamma);
  return Math.round(Math.pow(ga + t * (gb - ga), 1 / gamma) * 255);
}

export function getStarSpectrum(stars: number): string {
  if (!Number.isFinite(stars) || stars < 0.1) return '#aaaaaa';
  if (stars >= 9) return '#000000';
  let i = 0;
  while (i < STAR_DOMAIN.length - 2 && stars > STAR_DOMAIN[i + 1]) i++;
  const t = (stars - STAR_DOMAIN[i]) / (STAR_DOMAIN[i + 1] - STAR_DOMAIN[i]);
  const a = hexToRgb(STAR_RANGE[i]);
  const b = hexToRgb(STAR_RANGE[i + 1]);
  const rgb = [0, 1, 2].map((k) => gammaMix(a[k], b[k], Math.min(1, Math.max(0, t))));
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function getStarColor(stars: number): { bg: string; text: string; border: string } {
  const bg = getStarSpectrum(stars);
  return {
    bg,
    text: stars >= 6.5 ? '#ffd966' : 'rgba(0, 0, 0, 0.82)',
    border: stars >= 6.5 ? 'rgba(255, 217, 102, 0.28)' : 'rgba(0, 0, 0, 0.18)',
  };
}

export interface TargetMeta {
  id: DownloadTarget;
  label: string;
  short: string;
  hex: string;
  textCls: string;
  chipCls: string;
  btnCls: string;
  activeSegCls: string;
}

export const TARGET_META: Record<DownloadTarget, TargetMeta> = {
  lazer: {
    id: 'lazer',
    label: 'Lazer',
    short: 'L',
    hex: '#a855f7',
    textCls: 'text-lazer-soft',
    chipCls: 'border-lazer/35 bg-lazer/12 text-lazer-soft',
    btnCls: 'btn-lazer',
    activeSegCls: 'bg-lazer/18 text-lazer-soft shadow-[inset_0_0_0_1px_rgba(168,85,247,0.45)]',
  },
  stable: {
    id: 'stable',
    label: 'Stable',
    short: 'S',
    hex: '#0284c7',
    textCls: 'text-stable-soft',
    chipCls: 'border-stable/35 bg-stable/10 text-stable-soft',
    btnCls: 'btn-stable',
    activeSegCls: 'bg-stable/16 text-stable-soft shadow-[inset_0_0_0_1px_rgba(2,132,199,0.45)]',
  },
  both: {
    id: 'both',
    label: '双端',
    short: '双',
    hex: '#e03a82',
    textCls: 'text-osu',
    chipCls: 'border-osu/35 bg-osu/10 text-osu-soft',
    btnCls: 'btn-both',
    activeSegCls: 'bg-osu/16 text-osu-soft shadow-[inset_0_0_0_1px_rgba(224,58,130,0.45)]',
  },
};

export const VARIANT_OPTIONS: Array<{ value: DownloadVariant; label: string; hint: string }> = [
  { value: 'novideo', label: '无视频', hint: '省空间 · 推荐' },
  { value: 'full', label: '完整包', hint: '含背景视频' },
  { value: 'mini', label: 'Mini', hint: '小夜精简版' },
];

export function openExternalLink(e: { preventDefault: () => void }, url: string): void {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.isElectron && url) {
    e.preventDefault();
    void api.openExternal(url);
  }
}

export function getStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'ranked':
      return { label: 'Ranked', cls: 'bg-[#64c6ff] text-[#05263a] border-[#64c6ff]' };
    case 'approved':
      return { label: 'Approved', cls: 'bg-[#b3ff66] text-[#1e3305] border-[#b3ff66]' };
    case 'qualified':
      return { label: 'Qualified', cls: 'bg-[#66ffcc] text-[#053325] border-[#66ffcc]' };
    case 'loved':
      return { label: 'Loved', cls: 'bg-[#ff66ab] text-[#3d0a20] border-[#ff66ab]' };
    case 'pending':
      return { label: 'Pending', cls: 'bg-[#ffd966] text-[#3a2d05] border-[#ffd966]' };
    case 'wip':
      return { label: 'WIP', cls: 'bg-[#ff9966] text-[#3a1605] border-[#ff9966]' };
    default:
      return { label: 'Graveyard', cls: 'bg-black/70 text-[#d0d6e4] border-white/15' };
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export interface LnCategoryInfo {
  /** 统一的百分比标签，始终明确标示长条占比，例如 "LN 13%"（不再误写为 "Rice 13%"） */
  label: string;
  /** 纯谱面类型标签（不含百分比），例如 "单键 Rice" / "综合 Hybrid" / "长条 LN" */
  styleTag: string;
  /** 完整无歧义标签（用于详情表等宽敞区域），例如 "Rice · LN 13%" / "Hybrid · LN 24%" / "LN 50%" */
  fullLabel: string;
  /** 悬停说明，同时展示类型、长条占比与单键占比 */
  tooltip: string;
  cls: 'ln-rice' | 'ln-hybrid' | 'ln-heavy';
}

export function getLnCategory(lnRatio: number | null): LnCategoryInfo | null {
  if (lnRatio === null) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(lnRatio)));
  const riceRatio = 100 - clamped;
  if (clamped <= 15) {
    return {
      label: `LN ${clamped}%`,
      styleTag: '单键 Rice',
      fullLabel: `Rice · LN ${clamped}%`,
      tooltip: `单键向 (Rice) · 长条 LN ${clamped}% / 单键 Rice ${riceRatio}%`,
      cls: 'ln-rice',
    };
  }
  if (clamped < 45) {
    return {
      label: `LN ${clamped}%`,
      styleTag: '综合 Hybrid',
      fullLabel: `Hybrid · LN ${clamped}%`,
      tooltip: `综合向 (Hybrid) · 长条 LN ${clamped}% / 单键 Rice ${riceRatio}%`,
      cls: 'ln-hybrid',
    };
  }
  return {
    label: `LN ${clamped}%`,
    styleTag: '长条 LN',
    fullLabel: `LN ${clamped}%`,
    tooltip: `长条向 (LN) · 长条 LN ${clamped}% / 单键 Rice ${riceRatio}%`,
    cls: 'ln-heavy',
  };
}
