import { getConfig } from './config.js';
import { st } from './i18n.js';
import { getLocalSetsSnapshot } from './library.js';
import { fetchSmart } from './network.js';
import {
  calculateBeatmapPp,
  deriveStarBoundsFromPpFilter,
  extractPpScenarioFromFilters,
  isRankedForPp,
  shouldAllowUnrankedForPpFilter,
} from './pp.js';
import {
  GachaDrawRequest,
  GachaDrawResult,
  GachaPackId,
  LocalBeatmapsetStatus,
  NormalizedBeatmap,
  NormalizedBeatmapset,
  SearchFilters,
  SearchResult,
} from './types.js';

const MODE_NAMES = ['osu', 'taiko', 'fruits', 'mania'] as const;

const VALID_OSUDIRECT_SORTS = new Set([
  'ranked_date',
  'submitted_date',
  'last_updated',
  'play_count',
  'favourite_count',
  'beatmaps.difficulty_rating',
  'bpm',
  'title',
  'artist',
]);

// Cache Sayobot beatmapinfo lookups for 5 minutes to speed up pagination & sorting
const sayobotInfoCache = new Map<number, { data: any; at: number }>();

function extractDirectBeatmapOrSetId(rawQuery?: string): { type: 'set' | 'map'; id: number } | null {
  if (!rawQuery) return null;
  const q = rawQuery.trim();
  if (/^\d{2,9}$/.test(q)) {
    return { type: 'set', id: Number(q) };
  }
  const setMatch = q.match(/osu\.ppy\.sh\/(?:beatmapsets|s)\/(\d+)/i);
  if (setMatch) return { type: 'set', id: Number(setMatch[1]) };
  const mapMatch = q.match(/osu\.ppy\.sh\/(?:beatmaps|b)\/(\d+)/i);
  if (mapMatch) return { type: 'map', id: Number(mapMatch[1]) };
  return null;
}

function normalizeStatusString(rawStatus: unknown): string {
  if (typeof rawStatus === 'string') return rawStatus.toLowerCase();
  const n = Number(rawStatus);
  switch (n) {
    case 1:
      return 'ranked';
    case 2:
      return 'approved';
    case 3:
      return 'qualified';
    case 4:
      return 'loved';
    case 0:
      return 'pending';
    case -1:
      return 'wip';
    case -2:
    default:
      return 'graveyard';
  }
}

function buildLocalStatus(
  setId: number,
  snapshot: ReturnType<typeof getLocalSetsSnapshot>,
): LocalBeatmapsetStatus {
  const folder = snapshot.stableMap.get(setId);
  return {
    inStable: Boolean(folder),
    inLazer: snapshot.lazerIds.has(setId),
    inLazerPending: snapshot.pendingIds.has(setId),
    stableFolder: folder,
  };
}

function normalizeOsuDirectSet(
  raw: any,
  snapshot: ReturnType<typeof getLocalSetsSnapshot>,
): NormalizedBeatmapset {
  const setId = Number(raw.id);
  const beatmapsRaw = Array.isArray(raw.beatmaps) ? raw.beatmaps : [];
  const beatmaps: NormalizedBeatmap[] = beatmapsRaw
    .filter((b: any) => !b.deleted_at)
    .map((b: any) => {
      const modeInt = Number(b.mode_int ?? 0);
      const countCircles = Number(b.count_circles ?? 0);
      const countSliders = Number(b.count_sliders ?? 0);
      const totalNotes = countCircles + countSliders;
      const lnRatio =
        modeInt === 3 && totalNotes > 0 ? Math.round((countSliders / totalNotes) * 100) : null;
      return {
        id: Number(b.id),
        beatmapsetId: setId,
        version: String(b.version || ''),
        modeInt,
        mode: String(b.mode || MODE_NAMES[modeInt] || 'osu'),
        cs: Number(b.cs ?? 0),
        ar: Number(b.ar ?? 0),
        od: Number(b.accuracy ?? 0),
        hp: Number(b.drain ?? 0),
        difficultyRating: Number(b.difficulty_rating ?? 0),
        totalLength: Number(b.total_length ?? 0),
        hitLength: Number(b.hit_length ?? 0),
        bpm: Number(b.bpm ?? raw.bpm ?? 0),
        countCircles,
        countSliders,
        countSpinners: Number(b.count_spinners ?? 0),
        maxCombo: b.max_combo != null ? Number(b.max_combo) : null,
        playcount: Number(b.playcount ?? 0),
        passcount: Number(b.passcount ?? 0),
        convert: Boolean(b.convert),
        status: normalizeStatusString(b.status ?? raw.status),
        lnRatio,
      };
    })
    .sort((a: NormalizedBeatmap, b: NormalizedBeatmap) => a.difficultyRating - b.difficultyRating);

  return {
    id: setId,
    title: String(raw.title || ''),
    titleUnicode: String(raw.title_unicode || raw.title || ''),
    artist: String(raw.artist || ''),
    artistUnicode: String(raw.artist_unicode || raw.artist || ''),
    creator: String(raw.creator || ''),
    userId: raw.user_id != null ? Number(raw.user_id) : null,
    source: String(raw.source || ''),
    tags: String(raw.tags || ''),
    status: normalizeStatusString(raw.status),
    bpm: Number(raw.bpm ?? beatmaps[0]?.bpm ?? 0),
    playCount: Number(raw.play_count ?? 0),
    favouriteCount: Number(raw.favourite_count ?? 0),
    genreId: raw.genre_id != null ? Number(raw.genre_id) : null,
    languageId: raw.language_id != null ? Number(raw.language_id) : null,
    video: Boolean(raw.video),
    storyboard: Boolean(raw.storyboard),
    nsfw: Boolean(raw.nsfw),
    spotlight: Boolean(raw.spotlight),
    featured: Boolean(raw.track_id && Number(raw.track_id) > 0),
    rankedDate: raw.ranked_date ?? null,
    submittedDate: raw.submitted_date ?? null,
    lastUpdated: raw.last_updated ?? null,
    coverUrl: `/api/media/cover/${setId}`,
    previewUrl: `/api/media/preview/${setId}`,
    officialUrl: `https://osu.ppy.sh/beatmapsets/${setId}`,
    beatmaps,
    localStatus: buildLocalStatus(setId, snapshot),
    searchProvider: 'osudirect',
  };
}

function normalizeSayobotSet(
  summary: any,
  info: any | null,
  snapshot: ReturnType<typeof getLocalSetsSnapshot>,
): NormalizedBeatmapset {
  const setId = Number(info?.sid ?? summary.sid);
  const bidData = Array.isArray(info?.bid_data) ? info.bid_data : [];
  const beatmaps: NormalizedBeatmap[] = bidData
    .map((b: any) => {
      const modeInt = Number(b.mode ?? 0);
      const countCircles = Number(b.circles ?? 0);
      const countSliders = Number(b.sliders ?? 0);
      const totalNotes = countCircles + countSliders;
      const lnRatio =
        modeInt === 3 && totalNotes > 0 ? Math.round((countSliders / totalNotes) * 100) : null;
      return {
        id: Number(b.bid),
        beatmapsetId: setId,
        version: String(b.version || ''),
        modeInt,
        mode: MODE_NAMES[modeInt] || 'osu',
        cs: Number(b.CS ?? 0),
        ar: Number(b.AR ?? 0),
        od: Number(b.OD ?? 0),
        hp: Number(b.HP ?? 0),
        difficultyRating: Number(b.star ?? 0),
        totalLength: Number(b.length ?? 0),
        hitLength: Number(b.hit_length ?? b.length ?? 0),
        bpm: Number(info?.bpm ?? summary.bpm ?? 0),
        countCircles,
        countSliders,
        countSpinners: Number(b.spinners ?? 0),
        maxCombo: b.maxcombo != null ? Number(b.maxcombo) : null,
        playcount: Number(b.playcount ?? 0),
        passcount: Number(b.passcount ?? 0),
        convert: false,
        status: normalizeStatusString(info?.approved ?? summary.approved),
        lnRatio,
      };
    })
    .sort((a: NormalizedBeatmap, b: NormalizedBeatmap) => a.difficultyRating - b.difficultyRating);

  const lastUpdateEpoch = Number(info?.last_update ?? summary.lastupdate ?? 0);
  const lastUpdatedIso = lastUpdateEpoch > 0 ? new Date(lastUpdateEpoch * 1000).toISOString() : null;

  return {
    id: setId,
    title: String(info?.title ?? summary.title ?? ''),
    titleUnicode: String(info?.titleU || info?.title || summary.titleU || summary.title || ''),
    artist: String(info?.artist ?? summary.artist ?? ''),
    artistUnicode: String(info?.artistU || info?.artist || summary.artistU || summary.artist || ''),
    creator: String(info?.creator ?? summary.creator ?? ''),
    userId: info?.creator_id != null ? Number(info.creator_id) : null,
    source: String(info?.source ?? ''),
    tags: String(info?.tags ?? ''),
    status: normalizeStatusString(info?.approved ?? summary.approved),
    bpm: Number(info?.bpm ?? summary.bpm ?? 0),
    playCount: Number(info?.play_count ?? summary.play_count ?? 0),
    favouriteCount: Number(info?.favourite_count ?? summary.favourite_count ?? 0),
    genreId: info?.genre != null ? Number(info.genre) : null,
    languageId: info?.language != null ? Number(info.language) : null,
    video: Boolean(info?.video),
    storyboard: Boolean(info?.storyboard),
    nsfw: false,
    spotlight: false,
    featured: false,
    rankedDate: lastUpdatedIso,
    submittedDate: null,
    lastUpdated: lastUpdatedIso,
    coverUrl: `/api/media/cover/${setId}`,
    previewUrl: `/api/media/preview/${setId}`,
    officialUrl: `https://osu.ppy.sh/beatmapsets/${setId}`,
    beatmaps,
    localStatus: buildLocalStatus(setId, snapshot),
    searchProvider: 'sayobot',
  };
}

function beatmapMatchesFilters(bm: NormalizedBeatmap, f: SearchFilters, setStatus?: string): boolean {
  if (f.mode && f.mode !== 'any') {
    const targetMode = Number(f.mode);
    if (targetMode === 3) {
      if (f.includeConverts) {
        if (bm.modeInt !== 3 && bm.modeInt !== 0) return false;
      } else {
        if (bm.modeInt !== 3 || bm.convert) return false;
      }
    } else if (bm.modeInt !== targetMode) {
      return false;
    }
  }

  if (f.mode === '3' && f.keys && f.keys !== 'any') {
    const roundedCs = Math.round(bm.cs);
    if (f.keys === 'other') {
      if (roundedCs >= 4 && roundedCs <= 10) return false;
    } else {
      if (roundedCs !== Number(f.keys)) return false;
    }
  }

  if (f.minStars != null && bm.difficultyRating < f.minStars) return false;
  if (f.maxStars != null && bm.difficultyRating > f.maxStars) return false;
  if (f.minLength != null && bm.totalLength < f.minLength) return false;
  if (f.maxLength != null && bm.totalLength > f.maxLength) return false;
  if (f.minOd != null && bm.od < f.minOd) return false;
  if (f.maxOd != null && bm.od > f.maxOd) return false;
  if (f.minHp != null && bm.hp < f.minHp) return false;
  if (f.maxHp != null && bm.hp > f.maxHp) return false;
  if (f.minAr != null && bm.ar < f.minAr) return false;
  if (f.maxAr != null && bm.ar > f.maxAr) return false;
  if (f.minLn != null && (bm.lnRatio === null || bm.lnRatio < f.minLn)) return false;
  if (f.maxLn != null && (bm.lnRatio === null || bm.lnRatio > f.maxLn)) return false;

  if (f.minPp != null || f.maxPp != null) {
    const effectiveStatus = bm.status || setStatus || '';
    if (!shouldAllowUnrankedForPpFilter(f) && !isRankedForPp(effectiveStatus)) {
      return false;
    }
    const pp = Math.round(calculateBeatmapPp(bm, extractPpScenarioFromFilters(f)).pp);
    if (f.minPp != null && pp < f.minPp) return false;
    if (f.maxPp != null && pp > f.maxPp) return false;
  }

  return true;
}

function beatmapsetMatchesInstalled(set: NormalizedBeatmapset, installedFilter?: SearchFilters['installedFilter']): boolean {
  switch (installedFilter) {
    case 'hide_lazer':
      return !set.localStatus.inLazer;
    case 'hide_stable':
      return !set.localStatus.inStable;
    case 'hide_any':
      return !set.localStatus.inLazer && !set.localStatus.inStable;
    case 'only_missing_lazer':
      return !set.localStatus.inLazer;
    case 'only_missing_stable':
      return !set.localStatus.inStable;
    default:
      return true;
  }
}

function filterAndAnnotateSets(sets: NormalizedBeatmapset[], f: SearchFilters, enforceSetLevel = false): NormalizedBeatmapset[] {
  const out: NormalizedBeatmapset[] = [];
  for (const set of sets) {
    if (!beatmapsetMatchesInstalled(set, f.installedFilter)) continue;

    if (enforceSetLevel) {
      if (f.minBpm != null && set.bpm < f.minBpm) continue;
      if (f.maxBpm != null && set.bpm > f.maxBpm) continue;
      if (f.genre != null && f.genre > 0 && set.genreId != null && set.genreId !== f.genre) continue;
      if (f.language != null && f.language > 0 && set.languageId != null && set.languageId !== f.language) continue;
      if (f.video && !set.video) continue;
      if (f.storyboard && !set.storyboard) continue;
      if (f.creator && !set.creator.toLowerCase().includes(f.creator.toLowerCase())) continue;
    }

    if (set.beatmaps.length > 0) {
      let anyMatch = false;
      const updatedBeatmaps = set.beatmaps.map((bm) => {
        const matches = beatmapMatchesFilters(bm, f, set.status);
        if (matches) anyMatch = true;
        return { ...bm, matchesFilter: matches };
      });
      if (!anyMatch) continue;
      out.push({ ...set, beatmaps: updatedBeatmaps });
    } else if (f.minPp == null && f.maxPp == null) {
      out.push(set);
    }
  }
  return out;
}

function resolveEffectiveSearchBounds(f: SearchFilters): {
  upstreamFilters: SearchFilters;
  impossible: boolean;
} {
  const hasPpFilter = f.minPp != null || f.maxPp != null;
  if (!hasPpFilter) {
    return {
      upstreamFilters: f,
      impossible: f.minStars != null && f.maxStars != null && f.minStars > f.maxStars,
    };
  }

  const derived = deriveStarBoundsFromPpFilter(f);
  if (derived.impossible) {
    return { upstreamFilters: f, impossible: true };
  }

  const minStars =
    f.minStars != null && derived.minStars != null
      ? Math.max(f.minStars, derived.minStars)
      : f.minStars ?? derived.minStars;
  const maxStars =
    f.maxStars != null && derived.maxStars != null
      ? Math.min(f.maxStars, derived.maxStars)
      : f.maxStars ?? derived.maxStars;

  if (minStars != null && maxStars != null && minStars > maxStars) {
    return { upstreamFilters: f, impossible: true };
  }

  let effectiveStatus = f.status;
  if (
    !shouldAllowUnrankedForPpFilter(f) &&
    (!f.status || f.status === 'leaderboard' || f.status === 'any')
  ) {
    effectiveStatus = 'ranked';
  }

  return {
    upstreamFilters: {
      ...f,
      minStars,
      maxStars,
      status: effectiveStatus,
    },
    impossible: false,
  };
}

function mapStatusToOsuDirect(status?: SearchFilters['status']): string | undefined {
  switch (status) {
    case 'leaderboard':
      return '1,2,3,4';
    case 'ranked':
      return '1,2';
    case 'qualified':
      return '3';
    case 'loved':
      return '4';
    case 'pending':
      return '0';
    case 'wip':
      return '-1';
    case 'graveyard':
      return '-2';
    default:
      return undefined;
  }
}

function mapSortToOsuDirect(sort?: string): string {
  if (!sort) return 'ranked_date:desc';
  const [field, dirRaw] = sort.split(':');
  const dir = dirRaw === 'asc' ? 'asc' : 'desc';
  if (VALID_OSUDIRECT_SORTS.has(field)) {
    return `${field}:${dir}`;
  }
  return `ranked_date:${dir}`;
}

function buildOsuDirectQueryString(f: SearchFilters): string {
  const clauses: string[] = [];

  if (f.mode === '3' && f.keys && f.keys !== 'any') {
    if (f.keys === 'other') {
      clauses.push('(beatmaps.cs < 4 OR beatmaps.cs > 10)');
    } else {
      clauses.push(`beatmaps.cs = ${Number(f.keys)}`);
    }
  }
  if (f.minStars != null) clauses.push(`beatmaps.difficulty_rating >= ${f.minStars}`);
  if (f.maxStars != null) clauses.push(`beatmaps.difficulty_rating <= ${f.maxStars}`);
  if (f.minBpm != null) clauses.push(`bpm >= ${f.minBpm}`);
  if (f.maxBpm != null) clauses.push(`bpm <= ${f.maxBpm}`);
  if (f.minLength != null) clauses.push(`beatmaps.total_length >= ${f.minLength}`);
  if (f.maxLength != null) clauses.push(`beatmaps.total_length <= ${f.maxLength}`);
  if (f.minOd != null) clauses.push(`beatmaps.accuracy >= ${f.minOd}`);
  if (f.maxOd != null) clauses.push(`beatmaps.accuracy <= ${f.maxOd}`);
  if (f.minHp != null) clauses.push(`beatmaps.drain >= ${f.minHp}`);
  if (f.maxHp != null) clauses.push(`beatmaps.drain <= ${f.maxHp}`);
  if (f.minAr != null) clauses.push(`beatmaps.ar >= ${f.minAr}`);
  if (f.maxAr != null) clauses.push(`beatmaps.ar <= ${f.maxAr}`);
  if (f.genre != null && f.genre > 0) clauses.push(`genre_id = ${f.genre}`);
  if (f.language != null && f.language > 0) clauses.push(`language_id = ${f.language}`);
  if (f.video) clauses.push('video = true');
  if (f.storyboard) clauses.push('storyboard = true');
  if (f.spotlight) clauses.push('spotlight = true');
  if (f.featured) clauses.push('track_id > 0');
  if (f.nsfw === false) clauses.push('nsfw = false');
  if (f.creator && f.creator.trim()) {
    const safeCreator = f.creator.trim().replace(/"/g, '\\"');
    clauses.push(`creator = "${safeCreator}"`);
  }

  const text = (f.q || '').trim();
  if (clauses.length === 0) return text;
  const bracket = `[${clauses.join(' AND ')}]`;
  return text ? `${bracket} ${text}` : bracket;
}

async function fetchDirectById(idRef: { type: 'set' | 'map'; id: number }, f: SearchFilters): Promise<SearchResult | null> {
  const snapshot = getLocalSetsSnapshot();
  // Try osu.direct first
  try {
    const url =
      idRef.type === 'set'
        ? `https://osu.direct/api/v2/s/${idRef.id}`
        : `https://osu.direct/api/v2/b/${idRef.id}/set`;
    const { response } = await fetchSmart(url, { timeoutMs: 7000 }, 'global_first');
    if (response.ok) {
      const raw = (await response.json()) as any;
      if (raw && raw.id) {
        const normalized = normalizeOsuDirectSet(raw, snapshot);
        const annotated = normalized.beatmaps.map((bm) => ({
          ...bm,
          matchesFilter: beatmapMatchesFilters(bm, f, normalized.status),
        }));
        return {
          beatmapsets: [{ ...normalized, beatmaps: annotated }],
          provider: 'osudirect',
          fallbackUsed: false,
          upstreamOffset: 0,
          nextUpstreamOffset: 1,
          hasMore: false,
          totalMatchedInBatch: 1,
        };
      }
    } else {
      await response.body?.cancel().catch(() => {});
    }
  } catch {
    // Fallback to Sayobot
  }

  // Fallback to Sayobot v2/beatmapinfo
  try {
    const tFlag = idRef.type === 'set' ? 0 : 1;
    const url = `https://api.sayobot.cn/v2/beatmapinfo?K=${idRef.id}&T=${tFlag}`;
    const { response } = await fetchSmart(url, { timeoutMs: 7000 }, 'cn_first');
    if (response.ok) {
      const json = (await response.json()) as any;
      if (json?.status === 0 && json?.data) {
        const normalized = normalizeSayobotSet({ sid: json.data.sid }, json.data, snapshot);
        return {
          beatmapsets: [normalized],
          provider: 'sayobot',
          fallbackUsed: true,
          upstreamOffset: 0,
          nextUpstreamOffset: 1,
          hasMore: false,
          totalMatchedInBatch: 1,
        };
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

async function searchWithOsuDirect(f: SearchFilters): Promise<SearchResult> {
  const limit = Math.min(48, Math.max(12, f.limit || 24));
  let currentOffset = Math.max(0, f.offset || 0);
  const collected: NormalizedBeatmapset[] = [];
  const seenIds = new Set<number>();
  const snapshot = getLocalSetsSnapshot();

  const bounds = resolveEffectiveSearchBounds(f);
  if (bounds.impossible) {
    return {
      beatmapsets: [],
      provider: 'osudirect',
      fallbackUsed: false,
      upstreamOffset: currentOffset,
      nextUpstreamOffset: currentOffset,
      hasMore: false,
      totalMatchedInBatch: 0,
    };
  }

  const upstream = bounds.upstreamFilters;
  const statusParam = mapStatusToOsuDirect(upstream.status);
  const sortParam = mapSortToOsuDirect(upstream.sort);
  const qParam = buildOsuDirectQueryString(upstream);

  const hasPpFilter = f.minPp != null || f.maxPp != null;
  const hasStrictPostFilter =
    hasPpFilter ||
    f.minLn != null ||
    f.maxLn != null ||
    Boolean(f.installedFilter && f.installedFilter !== 'all') ||
    (f.mode === '3' && f.keys && f.keys !== 'any' && (upstream.minStars != null || upstream.maxStars != null || f.minOd != null));

  const chunkAmount = hasStrictPostFilter ? 60 : Math.max(limit, 36);
  const maxChunks = hasPpFilter ? 4 : hasStrictPostFilter ? 3 : 2;
  let lastRawCount = 0;

  for (let round = 0; round < maxChunks && collected.length < limit; round++) {
    const params = new URLSearchParams();
    params.set('amount', String(chunkAmount));
    params.set('offset', String(currentOffset));
    params.set('sort', sortParam);

    if (f.mode && f.mode !== 'any') {
      if (f.mode === '3' && f.includeConverts) {
        params.set('mode', '0,3');
      } else {
        params.set('mode', f.mode);
      }
    }
    if (statusParam) params.set('status', statusParam);
    if (qParam) params.set('q', qParam);

    const url = `https://osu.direct/api/v2/search?${params.toString()}`;
    const { response } = await fetchSmart(url, { timeoutMs: 10000 }, 'global_first');
    if (!response.ok) {
      const errTxt = await response.text().catch(() => '');
      throw new Error(`osu.direct HTTP ${response.status}: ${errTxt.slice(0, 120)}`);
    }

    const rawList = (await response.json()) as any[];
    lastRawCount = Array.isArray(rawList) ? rawList.length : 0;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      break;
    }

    const normalized = rawList.map((item) => normalizeOsuDirectSet(item, snapshot));
    const matched = filterAndAnnotateSets(normalized, f, false);

    for (const item of matched) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        collected.push(item);
      }
    }

    currentOffset += rawList.length;
    if (rawList.length < chunkAmount) {
      break;
    }
  }

  return {
    beatmapsets: collected.slice(0, limit),
    provider: 'osudirect',
    fallbackUsed: false,
    upstreamOffset: f.offset || 0,
    nextUpstreamOffset: currentOffset,
    hasMore: lastRawCount >= chunkAmount || collected.length > limit,
    totalMatchedInBatch: collected.length,
  };
}

function mapModeToSayobotBitmask(mode?: SearchFilters['mode']): number {
  switch (mode) {
    case '0':
      return 1;
    case '1':
      return 2;
    case '2':
      return 4;
    case '3':
      return 8;
    default:
      return 15; // all modes
  }
}

function mapStatusToSayobotClass(status?: SearchFilters['status']): number {
  switch (status) {
    case 'ranked':
      return 1;
    case 'qualified':
      return 2;
    case 'loved':
      return 4;
    case 'leaderboard':
      return 7; // 1 + 2 + 4
    case 'pending':
    case 'wip':
      return 8;
    case 'graveyard':
      return 16;
    default:
      return 31;
  }
}

async function fetchSayobotBeatmapInfo(sid: number): Promise<any | null> {
  const cached = sayobotInfoCache.get(sid);
  if (cached && Date.now() - cached.at < 300_000) {
    return cached.data;
  }
  try {
    const { response } = await fetchSmart(
      `https://api.sayobot.cn/v2/beatmapinfo?K=${sid}&T=0`,
      { timeoutMs: 6000 },
      'cn_first',
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const json = (await response.json()) as any;
    if (json?.status === 0 && json?.data) {
      if (sayobotInfoCache.size > 400) {
        const firstKey = sayobotInfoCache.keys().next().value;
        if (firstKey !== undefined) sayobotInfoCache.delete(firstKey);
      }
      sayobotInfoCache.set(sid, { data: json.data, at: Date.now() });
      return json.data;
    }
  } catch {
    // Ignore single info failure
  }
  return null;
}

async function searchWithSayobot(f: SearchFilters, fallbackReason?: string): Promise<SearchResult> {
  const limit = Math.min(36, Math.max(12, f.limit || 24));
  let currentOffset = Math.max(0, f.offset || 0);
  const snapshot = getLocalSetsSnapshot();

  const bounds = resolveEffectiveSearchBounds(f);
  if (bounds.impossible) {
    return {
      beatmapsets: [],
      provider: 'sayobot',
      fallbackUsed: Boolean(fallbackReason),
      fallbackReason,
      upstreamOffset: currentOffset,
      nextUpstreamOffset: currentOffset,
      hasMore: false,
      totalMatchedInBatch: 0,
      totalReported: 0,
    };
  }

  const upstream = bounds.upstreamFilters;
  const hasPpFilter = f.minPp != null || f.maxPp != null;
  const maxRounds = hasPpFilter ? 2 : 1;

  const keywordParts = [(upstream.q || '').trim()];
  if (upstream.mode === '3' && upstream.keys && upstream.keys !== 'any' && upstream.keys !== 'other' && !keywordParts[0]) {
    keywordParts.push(`${upstream.keys}k`);
  }
  const keyword = keywordParts.filter(Boolean).join(' ');

  const matched: NormalizedBeatmapset[] = [];
  const seenIds = new Set<number>();
  let lastRawCount = 0;
  let totalReported: number | null = null;

  for (let round = 0; round < maxRounds && matched.length < limit; round++) {
    const body = {
      cmd: 'beatmaplist',
      type: keyword ? 'search' : 'new',
      limit,
      offset: currentOffset,
      keyword,
      mode: mapModeToSayobotBitmask(upstream.mode),
      class: mapStatusToSayobotClass(upstream.status),
      stars: [upstream.minStars ?? 0, upstream.maxStars ?? 100],
    };

    const { response } = await fetchSmart(
      'https://api.sayobot.cn/?post',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeoutMs: 8000,
      },
      'cn_first',
    );

    if (!response.ok) {
      throw new Error(`Sayobot HTTP ${response.status}`);
    }

    const json = (await response.json()) as any;
    totalReported = json?.results ?? totalReported;
    const rawList: any[] = Array.isArray(json?.data) ? json.data : [];
    lastRawCount = rawList.length;
    if (rawList.length === 0) break;

    // Enrich with beatmapinfo in parallel (concurrency 6)
    const infos = new Array<any>(rawList.length).fill(null);
    let idx = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, rawList.length) }, async () => {
        while (idx < rawList.length) {
          const myIdx = idx++;
          infos[myIdx] = await fetchSayobotBeatmapInfo(Number(rawList[myIdx].sid));
        }
      }),
    );

    const normalized = rawList.map((item, i) => normalizeSayobotSet(item, infos[i], snapshot));
    const roundMatched = filterAndAnnotateSets(normalized, f, true);
    for (const item of roundMatched) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        matched.push(item);
      }
    }

    currentOffset += rawList.length;
    if (rawList.length < limit) break;
  }

  // Client-side sort for Sayobot results
  if (f.sort) {
    const [field, dirRaw] = f.sort.split(':');
    const mult = dirRaw === 'asc' ? 1 : -1;
    matched.sort((a, b) => {
      switch (field) {
        case 'favourite_count':
          return (a.favouriteCount - b.favouriteCount) * mult;
        case 'play_count':
          return (a.playCount - b.playCount) * mult;
        case 'bpm':
          return (a.bpm - b.bpm) * mult;
        case 'beatmaps.difficulty_rating': {
          const maxA = Math.max(0, ...a.beatmaps.map((m) => m.difficultyRating));
          const maxB = Math.max(0, ...b.beatmaps.map((m) => m.difficultyRating));
          return (maxA - maxB) * mult;
        }
        case 'title':
          return a.title.localeCompare(b.title) * mult;
        case 'artist':
          return a.artist.localeCompare(b.artist) * mult;
        default:
          return 0;
      }
    });
  }

  return {
    beatmapsets: matched.slice(0, limit),
    provider: 'sayobot',
    fallbackUsed: Boolean(fallbackReason),
    fallbackReason,
    upstreamOffset: f.offset || 0,
    nextUpstreamOffset: currentOffset,
    hasMore: lastRawCount >= limit || matched.length > limit,
    totalMatchedInBatch: matched.length,
    totalReported,
  };
}

export async function searchBeatmaps(filters: SearchFilters): Promise<SearchResult> {
  const cfg = getConfig();
  const idRef = extractDirectBeatmapOrSetId(filters.q);
  if (idRef) {
    const exact = await fetchDirectById(idRef, filters);
    if (exact) return exact;
  }

  const chosenSource = filters.source && filters.source !== 'auto' ? filters.source : cfg.preferredSearchSource;

  if (chosenSource === 'sayobot') {
    return searchWithSayobot(filters);
  }

  try {
    return await searchWithOsuDirect(filters);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return await searchWithSayobot(
      filters,
      st(
        `主搜索引擎 osu.direct 暂不可用 (${msg})，已自动切换至小夜国内镜像`,
        `Primary search engine osu.direct is unavailable (${msg}); automatically switched to Sayobot mirror`,
      ),
    );
  }
}

export async function getBeatmapsetDetail(setId: number): Promise<NormalizedBeatmapset | null> {
  const res = await fetchDirectById({ type: 'set', id: setId }, { mode: 'any' });
  return res?.beatmapsets[0] ?? null;
}

const GACHA_SORTS = [
  'ranked_date:desc',
  'play_count:desc',
  'favourite_count:desc',
  'submitted_date:desc',
  'bpm:desc',
] as const;

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildGachaPackFilters(
  packId: GachaPackId,
  base: Partial<SearchFilters> | undefined,
  requireRankedPp: boolean,
): { filters: SearchFilters; maxOffset: number } {
  const mode = base?.mode || '3';
  const keys = base?.keys || '4';
  const includeConverts = Boolean(base?.includeConverts);
  const source = base?.source || 'auto';

  if (packId === 'current_filter') {
    const status = requireRankedPp ? 'ranked' : base?.status || 'leaderboard';
    const hasNarrowQuery = Boolean(
      (base?.q && base.q.trim()) ||
        base?.minPp != null ||
        base?.maxPp != null ||
        base?.minStars != null ||
        base?.maxStars != null ||
        base?.creator,
    );
    return {
      filters: {
        ...base,
        mode,
        keys,
        status,
        includeConverts,
        source,
        installedFilter: 'hide_any',
      },
      maxOffset: hasNarrowQuery ? 48 : 220,
    };
  }

  switch (packId) {
    case 'pp_farm':
      return {
        filters: {
          mode,
          keys,
          includeConverts,
          source,
          status: 'ranked',
          minStars: 3.5,
          maxStars: 7.2,
          nsfw: base?.nsfw ?? false,
          installedFilter: 'hide_any',
        },
        maxOffset: 280,
      };
    case 'high_star':
      return {
        filters: {
          mode,
          keys,
          includeConverts,
          source,
          status: requireRankedPp ? 'ranked' : 'leaderboard',
          minStars: 6.0,
          nsfw: base?.nsfw ?? false,
          installedFilter: 'hide_any',
        },
        maxOffset: 120,
      };
    case 'rice_stream':
      return {
        filters: {
          mode,
          keys,
          includeConverts,
          source,
          status: requireRankedPp ? 'ranked' : 'leaderboard',
          minStars: 2.0,
          maxLn: 18,
          nsfw: base?.nsfw ?? false,
          installedFilter: 'hide_any',
        },
        maxOffset: 240,
      };
    case 'ln_tech':
      return {
        filters: {
          mode,
          keys,
          includeConverts,
          source,
          status: requireRankedPp ? 'ranked' : 'leaderboard',
          minStars: 2.2,
          minLn: 42,
          nsfw: base?.nsfw ?? false,
          installedFilter: 'hide_any',
        },
        maxOffset: 200,
      };
    case 'loved_chaos':
      return {
        filters: {
          mode,
          keys,
          includeConverts,
          source,
          status: requireRankedPp ? 'ranked' : 'loved',
          minStars: 2.0,
          nsfw: base?.nsfw ?? false,
          installedFilter: 'hide_any',
        },
        maxOffset: 110,
      };
    case 'standard':
    default:
      return {
        filters: {
          mode,
          keys,
          includeConverts,
          source,
          status: requireRankedPp ? 'ranked' : 'leaderboard',
          minStars: 1.5,
          nsfw: base?.nsfw ?? false,
          installedFilter: 'hide_any',
        },
        maxOffset: 760,
      };
  }
}

export async function drawRandomBeatmapsets(req: GachaDrawRequest): Promise<GachaDrawResult> {
  const count = Math.min(20, Math.max(1, Math.round(Number(req.count ?? 5) || 5)));
  const packId: GachaPackId = req.packId || 'standard';
  const requireRankedPp = Boolean(req.requireRankedPp);
  const excludeSet = new Set(
    Array.isArray(req.excludeIds)
      ? req.excludeIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [],
  );

  const { filters: packFilters, maxOffset } = buildGachaPackFilters(
    packId,
    req.baseFilters,
    requireRankedPp,
  );

  const sortOrder = shuffleInPlace([...GACHA_SORTS]);
  const probeLimit = Math.max(48, count * 3);
  const probes: Array<{ sort: string; offset: number; limit: number }> = [
    {
      sort: sortOrder[0],
      offset: maxOffset > 0 ? Math.floor(Math.random() * maxOffset) : 0,
      limit: probeLimit,
    },
    {
      sort: sortOrder[1] || 'play_count:desc',
      offset: maxOffset > 48 ? Math.floor(Math.random() * Math.min(96, maxOffset)) : 0,
      limit: probeLimit,
    },
    {
      sort: sortOrder[2] || 'ranked_date:desc',
      offset: 0,
      limit: probeLimit,
    },
  ];

  const pool: NormalizedBeatmapset[] = [];
  const seenIds = new Set<number>();
  const fallbackPool: NormalizedBeatmapset[] = [];
  let provider: 'osudirect' | 'sayobot' = 'osudirect';
  let fallbackUsed = false;
  let fallbackReason: string | undefined;

  const absorbSearchResult = (res: Awaited<ReturnType<typeof searchBeatmaps>>) => {
    provider = res.provider;
    if (res.fallbackUsed) {
      fallbackUsed = true;
      if (!fallbackReason && res.fallbackReason) fallbackReason = res.fallbackReason;
    }
    for (const set of res.beatmapsets) {
      if (set.localStatus.inStable || set.localStatus.inLazer) continue;
      if (
        requireRankedPp &&
        (!isRankedForPp(set.status) ||
          !set.beatmaps.some((bm) => bm.matchesFilter !== false && bm.difficultyRating >= 0.5))
      ) {
        continue;
      }
      if (seenIds.has(set.id)) continue;
      seenIds.add(set.id);
      if (excludeSet.has(set.id)) {
        fallbackPool.push(set);
      } else {
        pool.push(set);
      }
    }
  };

  let firstErr: unknown = null;
  try {
    const firstRes = await searchBeatmaps({
      ...packFilters,
      sort: probes[0].sort,
      offset: probes[0].offset,
      limit: probes[0].limit,
    });
    absorbSearchResult(firstRes);
  } catch (err) {
    firstErr = err;
  }

  // If the primary probe didn't collect enough unowned maps, run fallback probes concurrently
  if (pool.length < count) {
    const rest = await Promise.allSettled(
      probes.slice(1).map((probe) =>
        searchBeatmaps({
          ...packFilters,
          sort: probe.sort,
          offset: probe.offset,
          limit: probe.limit,
        }),
      ),
    );
    for (const entry of rest) {
      if (entry.status === 'fulfilled') {
        absorbSearchResult(entry.value);
      } else if (!firstErr) {
        firstErr = entry.reason;
      }
    }
  }

  if (pool.length === 0 && fallbackPool.length === 0 && firstErr) {
    throw firstErr;
  }

  shuffleInPlace(pool);
  if (pool.length < count && fallbackPool.length > 0) {
    shuffleInPlace(fallbackPool);
    for (const item of fallbackPool) {
      if (pool.length >= count) break;
      pool.push(item);
    }
  }

  return {
    cards: pool.slice(0, count),
    provider,
    fallbackUsed,
    fallbackReason,
    packId,
    totalCandidates: pool.length,
  };
}
