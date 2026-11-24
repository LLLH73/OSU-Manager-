export type ProxyMode = 'auto' | 'proxy' | 'direct';
export type IpFamilyMode = 'auto' | 'ipv6_first' | 'ipv4_first' | 'ipv6_only' | 'ipv4_only';
export type FastBatchRouteStrategy = 'auto' | 'direct_first' | 'direct_only' | 'proxy_only';
export type DownloadTarget = 'lazer' | 'stable' | 'both';
export type DownloadVariant = 'novideo' | 'full' | 'mini';
export type SearchSource = 'auto' | 'osudirect' | 'sayobot';
export type StableInstallMode = 'extract' | 'drop_osz';
export type ThemeId =
  | 'dark'
  | 'stone'
  | 'midnight'
  | 'forest'
  | 'light'
  | 'paper'
  | 'latte'
  | 'sakura';
export type SongViewMode = 'grid' | 'list' | 'lazer';
export type WorkspaceMode = 'browse' | 'book';

export type MirrorId =
  | 'sayobot-auto'
  | 'sayobot-txy'
  | 'nekoha'
  | 'osudirect'
  | 'beatconnect'
  | 'nerinyan'
  | 'official';

export type PreferredMirror = 'auto' | MirrorId;

export interface AppConfig {
  stablePath: string;
  lazerDataPath: string;
  lazerExePath: string;
  lazerImportDir: string;
  proxyMode: ProxyMode;
  proxyHost: string;
  proxyPort: number;
  defaultTarget: DownloadTarget;
  defaultVariant: DownloadVariant;
  preferredSearchSource: SearchSource;
  preferredDownloadSource: PreferredMirror;
  concurrency: number;
  autoImportWhenLazerRunning: boolean;
  stableInstallMode: StableInstallMode;
  officialCookie: string;
  theme: ThemeId;
  viewMode: SongViewMode;
  autoLoadWhenStableRunning: boolean;
  overlayHotkey: string;
  overlayOpacity: number;
  previewSkinId: string;
  previewScrollSpeed: number;
  customBgImage: string;
  customBgOpacity: number;
  dynamicBgFromSong: boolean;
  dynamicThemeFromBg: boolean;
  accentColor: string;
  fontScale: number;
  ipFamily: IpFamilyMode;
}

export interface MirrorHealth {
  id: MirrorId;
  name: string;
  shortName: string;
  region: 'CN' | 'GLOBAL' | 'OFFICIAL';
  requiresAuth: boolean;
  supportsVariants: DownloadVariant[];
  description: string;
  healthy: boolean;
  latencyMs: number | null;
  routeUsed: 'direct' | 'proxy' | null;
  statusCode: number | null;
  lastChecked: string | null;
  error: string | null;
}

export interface NetworkStatus {
  proxyOpen: boolean;
  proxyHost: string;
  proxyPort: number;
  proxyMode: ProxyMode;
  effectiveProxyActive: boolean;
  lastChecked: string | null;
  benchmarking: boolean;
  recommendedMirror: MirrorId | null;
  hasGlobalIpv6: boolean;
  ipFamily: IpFamilyMode;
  mirrors: MirrorHealth[];
}

export type FastBatchJobState = 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';

export type FastBatchItemState =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'queued_lazer'
  | 'failed'
  | 'cancelled';

export interface FastBatchStartOptions {
  filters: SearchFilters;
  targetCount: number;
  target: DownloadTarget;
  variant: DownloadVariant;
  preferredMirror: PreferredMirror;
  concurrency: number;
  ipFamily: IpFamilyMode;
  routeStrategy: FastBatchRouteStrategy;
  skipInstalled: boolean;
  stableDropOsz: boolean;
  lazerBatchImport: boolean;
}

export interface FastBatchItem {
  beatmapsetId: number;
  title: string;
  artist: string;
  creator: string;
  status: string;
  bpm: number;
  diffs: string[];
  state: FastBatchItemState;
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBps: number;
  mirror: MirrorId | null;
  routeUsed: 'direct' | 'proxy' | null;
  ipVersion: 4 | 6 | null;
  error: string | null;
}

export interface FastBatchSnapshot {
  jobId: string | null;
  state: FastBatchJobState;
  options: FastBatchStartOptions | null;
  targetCount: number;
  completedCount: number;
  failedCount: number;
  skippedInstalledCount: number;
  inFlightCount: number;
  queuedCount: number;
  scannedPages: number;
  upstreamOffset: number;
  hasMore: boolean;
  totalBytesDownloaded: number;
  aggregateSpeedBps: number;
  ipv6Hits: number;
  ipv4Hits: number;
  proxyHits: number;
  lazerBatchImportedCount: number;
  lazerPendingCreated: string[];
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
  items: FastBatchItem[];
}

export type SearchMode = 'any' | '0' | '1' | '2' | '3';
export type SearchStatus =
  | 'any'
  | 'leaderboard'
  | 'ranked'
  | 'qualified'
  | 'loved'
  | 'pending'
  | 'wip'
  | 'graveyard';

export type InstalledFilter =
  | 'all'
  | 'hide_lazer'
  | 'hide_stable'
  | 'hide_any'
  | 'only_missing_lazer'
  | 'only_missing_stable';

export interface SearchFilters {
  q?: string;
  mode?: SearchMode;
  keys?: string;
  status?: SearchStatus;
  sort?: string;
  genre?: number;
  language?: number;
  video?: boolean;
  storyboard?: boolean;
  spotlight?: boolean;
  featured?: boolean;
  nsfw?: boolean;
  includeConverts?: boolean;
  minStars?: number;
  maxStars?: number;
  minBpm?: number;
  maxBpm?: number;
  minLength?: number;
  maxLength?: number;
  minOd?: number;
  maxOd?: number;
  minHp?: number;
  maxHp?: number;
  minAr?: number;
  maxAr?: number;
  minLn?: number;
  maxLn?: number;
  minPp?: number;
  maxPp?: number;
  ppAccuracy?: number;
  ppRate?: number;
  ppMisses?: number;
  ppMaRatio?: number;
  ppClassic?: boolean;
  ppEz?: boolean;
  ppNf?: boolean;
  ppIncludeUnranked?: boolean;
  creator?: string;
  installedFilter?: InstalledFilter;
  source?: SearchSource;
  offset?: number;
  limit?: number;
}

export interface NormalizedBeatmap {
  id: number;
  beatmapsetId: number;
  version: string;
  modeInt: number;
  mode: string;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  difficultyRating: number;
  totalLength: number;
  hitLength: number;
  bpm: number;
  countCircles: number;
  countSliders: number;
  countSpinners: number;
  maxCombo: number | null;
  playcount: number;
  passcount: number;
  convert: boolean;
  status: string;
  lnRatio: number | null;
  matchesFilter?: boolean;
}

export interface LocalBeatmapsetStatus {
  inStable: boolean;
  inLazer: boolean;
  inLazerPending: boolean;
  stableFolder?: string;
}

export interface NormalizedBeatmapset {
  id: number;
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  creator: string;
  userId: number | null;
  source: string;
  tags: string;
  status: string;
  bpm: number;
  playCount: number;
  favouriteCount: number;
  genreId: number | null;
  languageId: number | null;
  video: boolean;
  storyboard: boolean;
  nsfw: boolean;
  spotlight: boolean;
  featured: boolean;
  rankedDate: string | null;
  submittedDate: string | null;
  lastUpdated: string | null;
  coverUrl: string;
  previewUrl: string;
  officialUrl: string;
  beatmaps: NormalizedBeatmap[];
  localStatus: LocalBeatmapsetStatus;
  searchProvider: 'osudirect' | 'sayobot';
}

export interface SearchResult {
  beatmapsets: NormalizedBeatmapset[];
  provider: 'osudirect' | 'sayobot';
  fallbackUsed: boolean;
  fallbackReason?: string;
  upstreamOffset: number;
  nextUpstreamOffset: number;
  hasMore: boolean;
  totalMatchedInBatch: number;
  totalReported?: number | null;
}

export type DownloadTaskStatus =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'queued_lazer'
  | 'failed'
  | 'cancelled';

export interface DownloadTask {
  id: string;
  beatmapsetId: number;
  title: string;
  artist: string;
  creator: string;
  target: DownloadTarget;
  variant: DownloadVariant;
  preferredMirror: PreferredMirror;
  activeMirror: MirrorId | null;
  triedMirrors: MirrorId[];
  routeUsed: 'direct' | 'proxy' | null;
  status: DownloadTaskStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBps: number;
  message: string;
  error: string | null;
  stableResultPath?: string;
  lazerResultPath?: string;
  autoLoadedInGame?: boolean;
  loadTargetClient?: 'lazer' | 'stable' | 'both' | null;
  createdAt: string;
  updatedAt: string;
}

export interface LazerPendingFile {
  filename: string;
  fullPath: string;
  beatmapsetId: number | null;
  sizeBytes: number;
  modifiedAt: string;
}

export interface LocalLibraryStatus {
  stablePath: string;
  stableExists: boolean;
  stableCount: number;
  stableRunning: boolean;
  stableExeExists: boolean;
  lazerDataPath: string;
  lazerExists: boolean;
  lazerCount: number;
  lazerDeepScanRunning: boolean;
  lazerRunning: boolean;
  lazerExeExists: boolean;
  lazerImportDir: string;
  lazerPendingCount: number;
  lazerPendingFiles: LazerPendingFile[];
  lastScanned: string | null;
}

export interface LibraryDiffItem {
  beatmapsetId: number;
  label: string;
  folderName?: string;
}

export interface LibraryDiffResult {
  stableOnly: LibraryDiffItem[];
  lazerOnly: LibraryDiffItem[];
  inBothCount: number;
}

export interface PreviewDifficultyItem {
  index: number;
  beatmapId: number | null;
  version: string;
  creator: string;
  keyCount: number;
  od: number;
  hp: number;
  totalLengthMs: number;
  noteCount: number;
  riceCount: number;
  lnCount: number;
  lnRatio: number;
  baseBpm: number;
  hasBackground: boolean;
  hasAudio: boolean;
}

export interface PreviewBeatmapsetResponse {
  beatmapsetId: number;
  sourceType: 'stable_dir' | 'stable_osz' | 'lazer_pending' | 'preview_cache' | 'lazer_files';
  title: string;
  artist: string;
  creator: string;
  difficulties: PreviewDifficultyItem[];
}

export interface ManiaNote {
  col: number;
  time: number;
  endTime: number;
  isHold: boolean;
}

export interface ManiaTimingPoint {
  time: number;
  beatLength: number;
  meter: number;
  uninherited: boolean;
  svMultiplier: number;
}

export interface ManiaBarline {
  time: number;
  isMeasure: boolean;
}

export interface ParsedManiaChart {
  beatmapsetId: number;
  index: number;
  beatmapId: number | null;
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  creator: string;
  version: string;
  keyCount: number;
  od: number;
  hp: number;
  baseBpm: number;
  totalLengthMs: number;
  maxLnDurationMs: number;
  hasFullAudio: boolean;
  audioUrl: string | null;
  backgroundUrl: string | null;
  sourceType: PreviewBeatmapsetResponse['sourceType'];
  notes: ManiaNote[];
  timingPoints: ManiaTimingPoint[];
  barlines: ManiaBarline[];
  densityBins: number[];
  stats: {
    totalNotes: number;
    riceCount: number;
    lnCount: number;
    lnRatio: number;
    maxNps: number;
    avgNps: number;
  };
}

export interface SkinSummary {
  id: string;
  name: string;
  author: string;
  source: 'local' | 'builtin';
  isActiveInStable: boolean;
  hasManiaConfig: boolean;
  supportedKeys: number[];
}

export interface SkinsListResponse {
  activeStableSkin: string | null;
  stableManiaSpeed: number | null;
  skins: SkinSummary[];
}

export interface ManiaSkinAsset {
  url: string;
  width: number;
  height: number;
  originalHeight: number;
  is2x: boolean;
  isCroppedPerCy: boolean;
  frames?: string[];
}

export interface ResolvedManiaSkin {
  skinId: string;
  name: string;
  source: 'local' | 'builtin';
  builtinStyle?: 'bar' | 'circle' | 'arrow';
  keys: number;
  animationFramerate: number;
  lightFramePerSecond: number;
  columnStart: number;
  columnWidth: number[];
  columnSpacing: number[];
  columnLineWidth: number[];
  hitPosition: number;
  lightPosition: number;
  widthForNoteHeightScale: number;
  lightingNWidth: number[];
  lightingLWidth: number[];
  upsideDown: boolean;
  keysUnderNotes: boolean;
  noteBodyStyle: 0 | 1 | 2;
  barlineHeight: number;
  colours: string[];
  colourLights: string[];
  colourBarline: string;
  colourColumnLine: string;
  colourHold: string;
  assets: {
    keys: Array<ManiaSkinAsset | null>;
    keysDown: Array<ManiaSkinAsset | null>;
    notes: Array<ManiaSkinAsset | null>;
    noteHeads: Array<ManiaSkinAsset | null>;
    noteBodies: Array<ManiaSkinAsset | null>;
    noteTails: Array<ManiaSkinAsset | null>;
    stageLeft: ManiaSkinAsset | null;
    stageRight: ManiaSkinAsset | null;
    stageBottom: ManiaSkinAsset | null;
    stageHint: ManiaSkinAsset | null;
    stageLight: ManiaSkinAsset | null;
    lightingN: ManiaSkinAsset | null;
    lightingL: ManiaSkinAsset | null;
  };
}

export interface FilterArchiveBrowsePosition {
  anchorBeatmapsetId: number;
  anchorBeatmapId?: number | null;
  anchorTitle: string;
  anchorArtist: string;
  anchorCreator?: string;
  anchorCoverUrl?: string;
  anchorIndex: number;
  loadedCount: number;
  batchUpstreamOffset: number;
  nextUpstreamOffset: number;
  provider?: 'osudirect' | 'sayobot';
  viewMode: SongViewMode;
  scrollTop?: number;
  contextBeatmapsetIds: number[];
  contextSnapshot?: NormalizedBeatmapset[];
}

export interface FilterArchive {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  filters: SearchFilters;
  browsePosition?: FilterArchiveBrowsePosition | null;
  pinned?: boolean;
}

export type BookGrade = 'XH' | 'X' | 'SH' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface BookScoreRecord {
  id: string;
  source: 'stable' | 'lazer';
  beatmapMd5: string;
  difficultyName: string;
  modeInt: number;
  keyCount: number | null;
  player: string;
  score: number;
  legacyScore: number | null;
  accuracy: number;
  grade: BookGrade;
  maxCombo: number;
  perfect: boolean;
  mods: string[];
  rate: number;
  pp: number | null;
  ppSource: 'recorded' | 'estimated';
  isRankedPp: boolean;
  countMax: number;
  count300: number;
  count200: number;
  count100: number;
  count50: number;
  countMiss: number;
  maRatio: number | null;
  playedAt: string | null;
}

export interface BookDifficultyRecord {
  key: string;
  beatmapId: number | null;
  md5: string;
  version: string;
  modeInt: number;
  mode: string;
  keyCount: number | null;
  starRating: number;
  bpm: number;
  lengthSec: number;
  od: number;
  hp: number;
  ar: number;
  totalObjects: number;
  lnCount: number;
  lnRatio: number | null;
  status: string;
  inStable: boolean;
  inLazer: boolean;
  playCount: number;
  bestPp: number | null;
  bestPpSource: 'recorded' | 'estimated' | null;
  bestAccuracy: number | null;
  bestGrade: BookGrade | null;
  bestScore: number | null;
  lastPlayedAt: string | null;
  estimated98Pp: number;
}

export interface BookSummary {
  bookKey: string;
  beatmapsetId: number | null;
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  creator: string;
  source: string;
  tags: string[];
  status: string;
  inStable: boolean;
  inLazer: boolean;
  stableFolder: string | null;
  modes: number[];
  keyCounts: number[];
  has4k: boolean;
  bpm: number;
  minStars: number;
  maxStars: number;
  lengthSec: number;
  lnRatioAvg: number | null;
  difficultyCount: number;
  playCount: number;
  stablePlayCount: number;
  lazerPlayCount: number;
  bestPp: number | null;
  bestPpIsRanked: boolean;
  bestPpSource: 'recorded' | 'estimated' | null;
  bestAccuracy: number | null;
  bestGrade: BookGrade | null;
  bestScore: number | null;
  lastPlayedAt: string | null;
  dateAdded: string | null;
  previewTimeMs: number;
  coverUrl: string;
  audioUrl: string;
  hasLocalCover: boolean;
  hasLocalAudio: boolean;
}

export interface BookDetail extends BookSummary {
  difficulties: BookDifficultyRecord[];
  scores: BookScoreRecord[];
  gradeCounts: Record<BookGrade, number>;
  totalNotesPlayed: number;
  avgAccuracy: number | null;
}

export interface BooksLibraryResponse {
  books: BookSummary[];
  stats: {
    totalBooks: number;
    stableBooks: number;
    lazerBooks: number;
    bothBooks: number;
    playedBooks: number;
    totalPlays: number;
    stablePlays: number;
    lazerPlays: number;
    highestPp: number | null;
    highestPpTitle: string | null;
    scannedAt: string;
  };
}
