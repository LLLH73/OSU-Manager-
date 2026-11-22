import { DownloadTarget, DownloadVariant, SearchFilters, SongViewMode, ThemeId } from './types';

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
  swatchBg: string;
  swatchRing: string;
  electronBg: string;
}

export const THEME_OPTIONS: ThemeMeta[] = [
  {
    id: 'dark',
    label: '曜石黑',
    desc: '深邃暗夜对比，音游护眼',
    swatchBg: '#12141f',
    swatchRing: '#a855f7',
    electronBg: '#0b0c12',
  },
  {
    id: 'light',
    label: '瓷器白',
    desc: '通透清简，日间高对比度',
    swatchBg: '#f8f9fc',
    swatchRing: '#e03a82',
    electronBg: '#f3f5f9',
  },
  {
    id: 'latte',
    label: '浅咖啡',
    desc: '温润燕麦拿铁纸感配色',
    swatchBg: '#efe4d4',
    swatchRing: '#b87e14',
    electronBg: '#f2ebe1',
  },
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
    id: 'lazer-pp',
    label: 'Lazer 刷PP',
    badge: '刷PP',
    description: '高热度 Ranked 4K 谱面，目标自动切换至 Lazer',
    suggestedTarget: 'lazer',
    filters: {
      ...DEFAULT_FILTERS,
      mode: '3',
      keys: '4',
      status: 'ranked',
      sort: 'play_count:desc',
    },
  },
  {
    id: 'stable-practice',
    label: 'Stable 日常练习',
    badge: '日常',
    description: '包含 Unranked/Graveyard 练习图，目标切换至 Stable',
    suggestedTarget: 'stable',
    filters: {
      ...DEFAULT_FILTERS,
      mode: '3',
      keys: '4',
      status: 'any',
      sort: 'favourite_count:desc',
    },
  },
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
  sub: string;
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
    sub: '刷PP',
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
    sub: '日常练习',
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
    sub: '同步',
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

export function getLnCategory(lnRatio: number | null): { label: string; cls: string } | null {
  if (lnRatio === null) return null;
  if (lnRatio <= 15) return { label: `Rice ${lnRatio}%`, cls: 'ln-rice' };
  if (lnRatio < 45) return { label: `Hybrid ${lnRatio}%`, cls: 'ln-hybrid' };
  return { label: `LN ${lnRatio}%`, cls: 'ln-heavy' };
}
