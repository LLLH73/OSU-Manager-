import { DownloadVariant, MirrorDefinition, MirrorId } from './types.js';

export const MIRROR_DEFINITIONS: MirrorDefinition[] = [
  {
    id: 'sayobot-auto',
    name: '小夜镜像 · 自动节点 (Sayobot)',
    shortName: '小夜自动',
    region: 'CN',
    routePolicy: 'cn_first',
    supportsVariants: ['novideo', 'full', 'mini'],
    requiresAuth: false,
    description: '国内直连高速镜像，支持无视频 / 完整 / 精简包',
    probeUrl: 'https://api.sayobot.cn/beatmaplist?0=1&1=0&2=1',
    probeMethod: 'GET',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      `https://dl.sayobot.cn/beatmaps/download/${variant}/${setId}`,
  },
  {
    id: 'sayobot-txy',
    name: '小夜镜像 · 腾讯云节点',
    shortName: '小夜腾讯',
    region: 'CN',
    routePolicy: 'cn_first',
    supportsVariants: ['novideo', 'full', 'mini'],
    requiresAuth: false,
    description: 'Sayobot 腾讯云 CDN 专线，国内下载稳定高速',
    probeUrl: 'https://txy1.sayobot.cn/beatmaps/download/novideo/243',
    probeMethod: 'HEAD',
    buildDownloadUrl: (setId: number, variant: DownloadVariant) =>
      `https://txy1.sayobot.cn/beatmaps/download/${variant}/${setId}`,
  },
  {
    id: 'nekoha',
    name: 'Nekoha 镜像 · 全库无限速',
    shortName: 'Nekoha',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['full'],
    requiresAuth: false,
    description: '社区全量谱面镜像，冷门坟图 / 新图收录全且无限速',
    probeUrl: 'https://mirror.nekoha.moe/api4/search?limit=1',
    probeMethod: 'GET',
    buildDownloadUrl: (setId: number) =>
      `https://mirror.nekoha.moe/api4/download/${setId}`,
  },
  {
    id: 'osudirect',
    name: 'osu.direct 镜像 · 同步极快',
    shortName: 'osu.direct',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['novideo', 'full'],
    requiresAuth: false,
    description: '高同步率国际镜像，支持去视频，新上架图更新及时',
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
    shortName: 'BeatConnect',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['full'],
    requiresAuth: false,
    description: '老牌国际镜像源，适合作为海外备用节点',
    probeUrl: 'https://beatconnect.io/b/243',
    probeMethod: 'HEAD',
    buildDownloadUrl: (setId: number) => `https://beatconnect.io/b/${setId}`,
  },
  {
    id: 'nerinyan',
    name: 'Nerinyan 镜像 · 国际节点',
    shortName: 'Nerinyan',
    region: 'GLOBAL',
    routePolicy: 'global_first',
    supportsVariants: ['novideo', 'full'],
    requiresAuth: false,
    description: '高速同步镜像，支持无视频参数（部分地区需走代理）',
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
    shortName: '官方源',
    region: 'OFFICIAL',
    routePolicy: 'global_first',
    supportsVariants: ['novideo', 'full'],
    requiresAuth: true,
    description: '官方直下源（需配置 osu_session Cookie；不配置时自动跳过并走镜像）',
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
