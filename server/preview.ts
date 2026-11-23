import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Request, Response } from 'express';
import { DATA_DIR, getConfig, PREVIEW_OSZ_CACHE_DIR } from './config.js';
import { getLocalSetsSnapshot, scanStableLibrary } from './library.js';
import { serveCover } from './media.js';
import {
  ManiaBarline,
  ManiaNote,
  ManiaTimingPoint,
  ParsedManiaChart,
  PreviewBeatmapsetResponse,
  PreviewDifficultyItem,
} from './types.js';

interface ResolvedSource {
  sourceType: PreviewBeatmapsetResponse['sourceType'];
  dirPath?: string;
  oszPath?: string;
  lazerOsuPaths?: string[];
}

interface ParsedInternal {
  index: number;
  filename: string;
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
  audioFilename: string;
  bgFilename: string;
  notes: ManiaNote[];
  timingPoints: ManiaTimingPoint[];
  barlines: ManiaBarline[];
  densityBins: number[];
  stats: ParsedManiaChart['stats'];
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

function findMatchingOszInDir(dirPath: string, setId: number): string | null {
  if (!dirPath || !fs.existsSync(dirPath)) return null;
  try {
    const re = new RegExp(`^${setId}\\b.*\\.osz$`, 'i');
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isFile() && re.test(entry.name)) {
        return path.join(dirPath, entry.name);
      }
    }
  } catch {
    // Ignore directory read error
  }
  return null;
}

function findLazerOsuFiles(lazerDataPath: string, setId: number): string[] {
  const cachePath = path.join(DATA_DIR, 'lazer-scan-cache.json');
  const filesDir = path.join(lazerDataPath, 'files');
  if (!fs.existsSync(cachePath) || !fs.existsSync(filesDir)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, number>;
    const paths: string[] = [];
    for (const [hash, sid] of Object.entries(raw)) {
      if (sid === setId && /^[0-9a-f]{64}$/i.test(hash)) {
        const fp = path.join(filesDir, hash[0], hash.slice(0, 2), hash);
        if (fs.existsSync(fp)) {
          paths.push(fp);
        }
      }
    }
    return paths;
  } catch {
    return [];
  }
}

export function resolveBeatmapSource(setId: number): ResolvedSource | null {
  const cfg = getConfig();
  const songsDir = path.join(cfg.stablePath, 'Songs');
  const snapshot = getLocalSetsSnapshot();
  let stableEntryName = snapshot.stableMap.get(setId);

  if (!stableEntryName && fs.existsSync(songsDir)) {
    const freshMap = scanStableLibrary(cfg.stablePath);
    stableEntryName = freshMap.get(setId);
  }

  if (stableEntryName) {
    const full = path.join(songsDir, stableEntryName);
    if (fs.existsSync(full)) {
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        return { sourceType: 'stable_dir', dirPath: full };
      }
      if (st.isFile() && full.toLowerCase().endsWith('.osz')) {
        return { sourceType: 'stable_osz', oszPath: full };
      }
    }
  }

  const pendingOsz = findMatchingOszInDir(cfg.lazerImportDir, setId);
  if (pendingOsz) {
    return { sourceType: 'lazer_pending', oszPath: pendingOsz };
  }

  const cachedOsz = path.join(PREVIEW_OSZ_CACHE_DIR, `${setId}.osz`);
  if (fs.existsSync(cachedOsz)) {
    return { sourceType: 'preview_cache', oszPath: cachedOsz };
  }

  const lazerOsuPaths = findLazerOsuFiles(cfg.lazerDataPath, setId);
  if (lazerOsuPaths.length > 0) {
    return { sourceType: 'lazer_files', lazerOsuPaths };
  }

  return null;
}

function resolveSafeFileInDir(dirPath: string, relFile: string): string | null {
  if (!relFile) return null;
  const clean = relFile.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) return null;

  const base = path.resolve(dirPath);
  const direct = path.resolve(base, clean);
  if (direct.startsWith(base + path.sep) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  // Fallback case-insensitive lookup inside dir
  const targetLower = clean.toLowerCase();
  const stack: Array<{ abs: string; rel: string }> = [{ abs: base, rel: '' }];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const nextRel = cur.rel ? `${cur.rel}/${e.name}` : e.name;
      const nextAbs = path.join(cur.abs, e.name);
      if (e.isDirectory()) {
        if (targetLower.startsWith(nextRel.toLowerCase() + '/')) {
          stack.push({ abs: nextAbs, rel: nextRel });
        }
      } else if (e.isFile() && nextRel.toLowerCase() === targetLower) {
        return nextAbs;
      }
    }
  }
  return null;
}

function findZipEntryCaseInsensitive(zip: AdmZip, relFile: string): AdmZip.IZipEntry | null {
  if (!relFile) return null;
  const target = relFile.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (!target || target.includes('..')) return null;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const norm = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    if (norm === target) return entry;
  }
  return null;
}

export function parseOsuMania(rawText: string, filename: string): ParsedInternal | null {
  const text = rawText.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);

  let section = '';
  let mode = 0;
  let audioFilename = '';
  let title = '';
  let titleUnicode = '';
  let artist = '';
  let artistUnicode = '';
  let creator = '';
  let version = '';
  let beatmapId: number | null = null;
  let circleSize = 4;
  let od = 7;
  let hp = 7;
  let bgFilename = '';

  const timingPoints: ManiaTimingPoint[] = [];
  const rawNotes: ManiaNote[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }

    if (section === 'General' || section === 'Metadata' || section === 'Difficulty') {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (section === 'General') {
        if (key === 'Mode') mode = Number(val) || 0;
        else if (key === 'AudioFilename') audioFilename = val;
      } else if (section === 'Metadata') {
        if (key === 'Title') title = val;
        else if (key === 'TitleUnicode') titleUnicode = val;
        else if (key === 'Artist') artist = val;
        else if (key === 'ArtistUnicode') artistUnicode = val;
        else if (key === 'Creator') creator = val;
        else if (key === 'Version') version = val;
        else if (key === 'BeatmapID') {
          const n = Number(val);
          beatmapId = Number.isFinite(n) && n > 0 ? n : null;
        }
      } else if (section === 'Difficulty') {
        if (key === 'CircleSize') circleSize = Number(val) || 4;
        else if (key === 'OverallDifficulty') od = Number(val) || 7;
        else if (key === 'HPDrainRate') hp = Number(val) || 7;
      }
      continue;
    }

    if (section === 'Events') {
      if (!bgFilename && (line.startsWith('0,0,') || line.startsWith('0, 0,'))) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          bgFilename = parts[2].trim().replace(/^["']|["']$/g, '');
        }
      }
      continue;
    }

    if (section === 'TimingPoints') {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const time = Number(parts[0]);
      const beatLength = Number(parts[1]);
      if (!Number.isFinite(time) || !Number.isFinite(beatLength)) continue;
      const meter = Math.max(1, Number.parseInt(parts[2] ?? '4', 10) || 4);
      const uninherited =
        parts.length >= 7 ? parts[6].trim() === '1' : beatLength > 0;
      if (uninherited) {
        if (beatLength <= 0) continue;
        timingPoints.push({
          time,
          beatLength,
          meter,
          uninherited: true,
          svMultiplier: 1,
        });
      } else {
        const sv = beatLength < 0 ? Math.min(10, Math.max(0.1, 100 / -beatLength)) : 1;
        timingPoints.push({
          time,
          beatLength,
          meter,
          uninherited: false,
          svMultiplier: sv,
        });
      }
      continue;
    }

    if (section === 'HitObjects') {
      const parts = line.split(',');
      if (parts.length < 4) continue;
      const x = Number(parts[0]);
      const time = Number(parts[2]);
      const objType = Number.parseInt(parts[3], 10);
      if (!Number.isFinite(x) || !Number.isFinite(time) || !Number.isFinite(objType)) continue;
      const keyCount = Math.max(1, Math.min(18, Math.round(circleSize || 4)));
      const col = Math.min(keyCount - 1, Math.max(0, Math.floor((x * keyCount) / 512)));
      const isHold = (objType & 128) !== 0;
      let endTime = time;
      if (isHold && parts[5]) {
        const holdEnd = Number(parts[5].split(':')[0]);
        if (Number.isFinite(holdEnd) && holdEnd >= time) {
          endTime = holdEnd;
        }
      }
      rawNotes.push({
        col,
        time,
        endTime,
        isHold,
      });
    }
  }

  if (mode !== 3) return null;

  const keyCount = Math.max(1, Math.min(18, Math.round(circleSize || 4)));
  rawNotes.sort((a, b) => a.time - b.time || a.col - b.col);
  timingPoints.sort((a, b) => a.time - b.time || (a.uninherited === b.uninherited ? 0 : a.uninherited ? -1 : 1));

  let maxNoteEnd = 0;
  let maxLnDurationMs = 0;
  let lnCount = 0;
  for (const n of rawNotes) {
    if (n.endTime > maxNoteEnd) maxNoteEnd = n.endTime;
    if (n.isHold) {
      lnCount += 1;
      const dur = n.endTime - n.time;
      if (dur > maxLnDurationMs) maxLnDurationMs = dur;
    }
  }

  const totalLengthMs = Math.max(10000, maxNoteEnd + 1800);
  const firstNoteTime = rawNotes.length > 0 ? rawNotes[0].time : 0;
  const drainSec = Math.max(1, (Math.max(firstNoteTime + 1000, maxNoteEnd) - firstNoteTime) / 1000);

  const uninherited = timingPoints.filter((tp) => tp.uninherited && tp.beatLength > 0);
  let baseBpm = 120;
  if (uninherited.length > 0) {
    let bestDuration = -1;
    let bestBeatLen = uninherited[0].beatLength;
    for (let i = 0; i < uninherited.length; i++) {
      const start = Math.max(0, uninherited[i].time);
      const end = i + 1 < uninherited.length ? Math.max(start, uninherited[i + 1].time) : totalLengthMs;
      const dur = end - start;
      if (dur > bestDuration) {
        bestDuration = dur;
        bestBeatLen = uninherited[i].beatLength;
      }
    }
    baseBpm = Math.round((60000 / bestBeatLen) * 100) / 100;
  }

  // Generate barlines (measure + beat) capped safely
  const barlines: ManiaBarline[] = [];
  for (let i = 0; i < uninherited.length && barlines.length < 6000; i++) {
    const tp = uninherited[i];
    if (tp.beatLength < 10) continue;
    const end = i + 1 < uninherited.length ? uninherited[i + 1].time : totalLengthMs;
    const meter = Math.max(1, tp.meter || 4);
    let beatIdx = 0;
    let t = tp.time;
    while (t < end && barlines.length < 6000) {
      if (t >= 0) {
        barlines.push({
          time: t,
          isMeasure: beatIdx % meter === 0,
        });
      }
      beatIdx += 1;
      t = tp.time + beatIdx * tp.beatLength;
    }
  }

  // Density histogram (120 bins across totalLengthMs)
  const binCount = 120;
  const binCounts = new Array<number>(binCount).fill(0);
  const binWidthMs = totalLengthMs / binCount;
  for (const n of rawNotes) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(n.time / binWidthMs)));
    binCounts[idx] += 1;
  }
  const binSeconds = Math.max(0.1, binWidthMs / 1000);
  const densityBins = binCounts.map((c) => Math.round((c / binSeconds) * 10) / 10);
  const maxNps = densityBins.reduce((m, v) => (v > m ? v : m), 0);
  const totalNotes = rawNotes.length;
  const riceCount = totalNotes - lnCount;
  const lnRatio = totalNotes > 0 ? Math.round((lnCount / totalNotes) * 100) : 0;
  const avgNps = Math.round((totalNotes / drainSec) * 10) / 10;

  return {
    index: 0,
    filename,
    beatmapId,
    title: title || path.basename(filename, '.osu'),
    titleUnicode: titleUnicode || title || path.basename(filename, '.osu'),
    artist: artist || 'Unknown Artist',
    artistUnicode: artistUnicode || artist || 'Unknown Artist',
    creator: creator || 'Unknown',
    version: version || 'Normal',
    keyCount,
    od,
    hp,
    baseBpm,
    totalLengthMs,
    maxLnDurationMs,
    audioFilename,
    bgFilename,
    notes: rawNotes,
    timingPoints,
    barlines,
    densityBins,
    stats: {
      totalNotes,
      riceCount,
      lnCount,
      lnRatio,
      maxNps,
      avgNps,
    },
  };
}

function loadManiaChartsFromSource(source: ResolvedSource): ParsedInternal[] {
  const parsed: ParsedInternal[] = [];

  if (source.sourceType === 'stable_dir' && source.dirPath) {
    const entries = fs.readdirSync(source.dirPath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.osu')) continue;
      try {
        const text = fs.readFileSync(path.join(source.dirPath, e.name), 'utf8');
        const chart = parseOsuMania(text, e.name);
        if (chart) parsed.push(chart);
      } catch {
        // Skip unreadable .osu
      }
    }
  } else if (source.oszPath) {
    const zip = new AdmZip(source.oszPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.osu')) continue;
      try {
        const text = entry.getData().toString('utf8');
        const chart = parseOsuMania(text, entry.entryName);
        if (chart) parsed.push(chart);
      } catch {
        // Skip unreadable entry
      }
    }
  } else if (source.lazerOsuPaths) {
    for (const fp of source.lazerOsuPaths) {
      try {
        const text = fs.readFileSync(fp, 'utf8');
        const chart = parseOsuMania(text, path.basename(fp));
        if (chart) parsed.push(chart);
      } catch {
        // Skip unreadable Lazer .osu
      }
    }
  }

  parsed.sort(
    (a, b) =>
      a.keyCount - b.keyCount ||
      a.stats.totalNotes - b.stats.totalNotes ||
      a.version.localeCompare(b.version),
  );
  parsed.forEach((p, idx) => {
    p.index = idx;
  });
  return parsed;
}

export function getPreviewBeatmapset(setId: number): PreviewBeatmapsetResponse | null {
  const source = resolveBeatmapSource(setId);
  if (!source) return null;

  const charts = loadManiaChartsFromSource(source);
  if (charts.length === 0) return null;

  const zip = source.oszPath ? new AdmZip(source.oszPath) : null;

  const difficulties: PreviewDifficultyItem[] = charts.map((c) => {
    let hasAudio = false;
    let hasBackground = false;
    if (source.sourceType === 'stable_dir' && source.dirPath) {
      hasAudio = Boolean(c.audioFilename && resolveSafeFileInDir(source.dirPath, c.audioFilename));
      hasBackground = Boolean(c.bgFilename && resolveSafeFileInDir(source.dirPath, c.bgFilename));
    } else if (zip) {
      hasAudio = Boolean(c.audioFilename && findZipEntryCaseInsensitive(zip, c.audioFilename));
      hasBackground = Boolean(c.bgFilename && findZipEntryCaseInsensitive(zip, c.bgFilename));
    }

    return {
      index: c.index,
      beatmapId: c.beatmapId,
      version: c.version,
      creator: c.creator,
      keyCount: c.keyCount,
      od: c.od,
      hp: c.hp,
      totalLengthMs: c.totalLengthMs,
      noteCount: c.stats.totalNotes,
      riceCount: c.stats.riceCount,
      lnCount: c.stats.lnCount,
      lnRatio: c.stats.lnRatio,
      baseBpm: c.baseBpm,
      hasBackground,
      hasAudio,
    };
  });

  const lead = charts[0];
  return {
    beatmapsetId: setId,
    sourceType: source.sourceType,
    title: lead.titleUnicode || lead.title,
    artist: lead.artistUnicode || lead.artist,
    creator: lead.creator,
    difficulties,
  };
}

export function getParsedManiaChart(setId: number, index: number): ParsedManiaChart | null {
  const source = resolveBeatmapSource(setId);
  if (!source) return null;
  const charts = loadManiaChartsFromSource(source);
  const c = charts[index];
  if (!c) return null;

  let hasFullAudio = false;
  if (c.audioFilename) {
    if (source.sourceType === 'stable_dir' && source.dirPath) {
      hasFullAudio = Boolean(resolveSafeFileInDir(source.dirPath, c.audioFilename));
    } else if (source.oszPath) {
      const zip = new AdmZip(source.oszPath);
      hasFullAudio = Boolean(findZipEntryCaseInsensitive(zip, c.audioFilename));
    }
  }

  return {
    beatmapsetId: setId,
    index: c.index,
    beatmapId: c.beatmapId,
    title: c.title,
    titleUnicode: c.titleUnicode,
    artist: c.artist,
    artistUnicode: c.artistUnicode,
    creator: c.creator,
    version: c.version,
    keyCount: c.keyCount,
    od: c.od,
    hp: c.hp,
    baseBpm: c.baseBpm,
    totalLengthMs: c.totalLengthMs,
    maxLnDurationMs: c.maxLnDurationMs,
    hasFullAudio,
    audioUrl: hasFullAudio ? `/api/preview/beatmapset/${setId}/audio/${c.index}` : null,
    backgroundUrl: `/api/preview/beatmapset/${setId}/bg/${c.index}`,
    sourceType: source.sourceType,
    notes: c.notes,
    timingPoints: c.timingPoints,
    barlines: c.barlines,
    densityBins: c.densityBins,
    stats: c.stats,
  };
}

export async function servePreviewAudio(
  setId: number,
  index: number,
  req: Request,
  res: Response,
): Promise<void> {
  const source = resolveBeatmapSource(setId);
  if (!source) {
    res.status(404).end();
    return;
  }

  const charts = loadManiaChartsFromSource(source);
  const chart = charts[index];
  if (!chart || !chart.audioFilename) {
    res.status(404).end();
    return;
  }

  const ext = path.extname(chart.audioFilename).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'audio/mpeg';

  if (source.sourceType === 'stable_dir' && source.dirPath) {
    const filePath = resolveSafeFileInDir(source.dirPath, chart.audioFilename);
    if (!filePath) {
      res.status(404).end();
      return;
    }

    const total = fs.statSync(filePath).size;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
      if (start >= total || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(total));
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (source.oszPath) {
    const zip = new AdmZip(source.oszPath);
    const entry = findZipEntryCaseInsensitive(zip, chart.audioFilename);
    if (!entry) {
      res.status(404).end();
      return;
    }

    const buf = entry.getData();
    const total = buf.length;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
      if (start >= total || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.send(buf.subarray(start, end + 1));
      return;
    }

    res.setHeader('Content-Length', String(total));
    res.send(buf);
    return;
  }

  res.status(404).end();
}

export async function servePreviewBackground(
  setId: number,
  index: number,
  res: Response,
): Promise<void> {
  const source = resolveBeatmapSource(setId);
  if (!source) {
    await serveCover(setId, res);
    return;
  }

  const charts = loadManiaChartsFromSource(source);
  const chart = charts[index];
  if (!chart || !chart.bgFilename) {
    await serveCover(setId, res);
    return;
  }

  const ext = path.extname(chart.bgFilename).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';

  if (source.sourceType === 'stable_dir' && source.dirPath) {
    const filePath = resolveSafeFileInDir(source.dirPath, chart.bgFilename);
    if (filePath) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(mime).sendFile(filePath);
      return;
    }
  } else if (source.oszPath) {
    const zip = new AdmZip(source.oszPath);
    const entry = findZipEntryCaseInsensitive(zip, chart.bgFilename);
    if (entry) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(mime).send(entry.getData());
      return;
    }
  }

  await serveCover(setId, res);
}
