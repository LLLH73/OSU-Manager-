import { DownloadVariant, MirrorDefinition, MirrorId, UiLanguage } from './types.js';

export const MIRROR_DEFINITIONS: MirrorDefinition[] = [
  {
    id: 'sayobot-auto',
    name: '小夜镜像 · 自动节点 (Sayobot)',
    nameEn: 'Sayobot Mirror · Auto Node',
    shortName: '小夜自动',
    shortNameEn: 'Sayobot Auto',
    region: 'CN',
    routePolicy: 'cn_first',
    supportsVariants: ['novideo', 'full', 'mini'],
    requiresAuth: false,
    description: '国内直连高速镜像，支持无视频 / 完整 / 精简包',
    descriptionEn: 'Fast CN direct mirror with No Video, Full, and Mini variants',
    probeUrl: 'https://api.sayobot.cn/beatmaplist?0=1&1=0&2=1',
    probeMethod: 'GET',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      `https://dl.sayobot.cn/beatmaps/download/${variant}/${setId}`,
  },
  {
    id: 'sayobot-txy',
    name: '小夜镜像 · 腾讯云节点',
    nameEn: 'Sayobot Mirror · Tencent CDN',
    shortName: '小夜腾讯',
    shortNameEn: 'Sayobot TXY',
    region: 'CN',
    routePolicy: 'cn_first',
    supportsVariants: ['novideo', 'full', 'mini'],
    requiresAuth: false,
    description: 'Sayobot 腾讯云 CDN 专线，国内下载稳定高速',
    descriptionEn: 'Sayobot Tencent Cloud CDN route with stable CN speed',
    probeUrl: 'https://txy1.sayobot.cn/beatmaps/download/novideo/243',
    probeMethod: 'HEAD',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      `https://txy1.sayobot.cn/beatmaps/download/${variant}/${setId}`,
  },
  {
    id: 'nekoha',
    name: 'Nekoha 镜像 · 全库无限速',
    nameEn: 'Nekoha Mirror · Unthrottled',
    shortName: 'Nekoha',
    shortNameEn: 'Nekoha',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['full'],
    requiresAuth: false,
    description: '社区全量谱面镜像，冷门坟图 / 新图收录全且无限速',
    descriptionEn: 'Full community mirror covering Graveyard & new maps unthrottled',
    probeUrl: 'https://mirror.nekoha.moe/api4/search?limit=1',
    probeMethod: 'GET',
    buildDownloadUrl: (setId: number) =>
      `https://mirror.nekoha.moe/api4/download/${setId}`,
  },
  {
    id: 'osudirect',
    name: 'osu.direct 镜像 · 同步极快',
    nameEn: 'osu.direct Mirror · Fast Sync',
    shortName: 'osu.direct',
    shortNameEn: 'osu.direct',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['novideo', 'full'],
    requiresAuth: false,
    description: '高同步率国际镜像，支持去视频，新上架图更新及时',
    descriptionEn: 'Fast global mirror with No Video support & rapid ranked sync',
    probeUrl: 'https://osu.direct/api/status',
    probeMethod: 'GET',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      variant === 'full'
        ? `https://osu.direct/api/d/${setId}`
        : `https://osu.direct/api/d/${setId}?noVideo=true`,
  },
  {
    id: 'beatconnect',
    name: 'BeatConnect 镜像 · 国际备用',
    nameEn: 'BeatConnect Mirror · Global Backup',
    shortName: 'BeatConnect',
    shortNameEn: 'BeatConnect',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['full'],
    requiresAuth: false,
    description: '老牌国际镜像源，适合作为海外备用节点',
    descriptionEn: 'Reliable global fallback mirror',
    probeUrl: 'https://beatconnect.io/b/243',
    probeMethod: 'HEAD',
    buildDownloadUrl: (setId: number) => `https://beatconnect.io/b/${setId}`,
  },
  {
    id: 'nerinyan',
    name: 'Nerinyan 镜像 · 国际节点',
    nameEn: 'Nerinyan Mirror · Global Node',
    shortName: 'Nerinyan',
    shortNameEn: 'Nerinyan',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['novideo', 'full'],
    requiresAuth: false,
    description: '高速同步镜像，支持无视频参数（部分地区需走代理）',
    descriptionEn: 'Fast global mirror with No Video option',
    probeUrl: 'https://api.nerinyan.moe/d/243?nv=1',
    probeMethod: 'HEAD',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      variant === 'full'
        ? `https://api.nerinyan.moe/d/${setId}?nv=0`
        : `https://api.nerinyan.moe/d/${setId}?nv=1`,
  },
  {
    id: 'official',
    name: 'osu! 官方源 (osu.ppy.sh)',
    nameEn: 'osu! Official (osu.ppy.sh)',
    shortName: '官方源',
    shortNameEn: 'Official',
    region: 'OFFICIAL',
    routePolicy: 'global_first',
    supportsVariants: ['novideo', 'full'],
    requiresAuth: true,
    description: '官方直下源（需配置 osu_session Cookie；不配置时自动跳过并走镜像）',
    descriptionEn: 'Official server (requires optional osu_session cookie; auto-skipped otherwise)',
    probeUrl: 'https://osu.ppy.sh/beatmapsets/search',
    probeMethod: 'HEAD',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      variant === 'full'
        ? `https://osu.ppy.sh/beatmapsets/${setId}/download`
        : `https://osu.ppy.sh/beatmapsets/${setId}/download?noVideo=1`,
  },
];

export const MIRROR_MAP = new Map<MirrorId, MirrorDefinition>(
  MIRROR_DEFINITIONS.map((m) => [m.id, m]),
);

export function getLocalizedMirrorInfo(
  mirror: MirrorDefinition,
  lang: UiLanguage,
): { name: string; shortName: string; description: string } {
  if (lang === 'en') {
    return {
      name: mirror.nameEn,
      shortName: mirror.shortNameEn,
      description: mirror.descriptionEn,
    };
  }
  return {
    name: mirror.name,
    shortName: mirror.shortName,
    description: mirror.description,
  };
}
