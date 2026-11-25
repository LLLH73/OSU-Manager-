import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { getConfig } from './config.js';
import { serveCover, servePreview } from './media.js';
import { calculateBeatmapPp, isRankedForPp } from './pp.js';
import { readLazerRealmData } from './realmReader.js';
import {
  BookDetail,
  BookDifficultyRecord,
  BookGrade,
  BookKiaiRange,
  BookRhythmData,
  BookScoreRecord,
  BooksLibraryResponse,
  BookSummary,
  BookTimingPoint,
  NormalizedBeatmap,
} from './types.js';

interface StableBeatmapEntry {
  artist: string;
  artistUnicode: string;
  title: string;
  titleUnicode: string;
  creator: string;
  version: string;
  audioFile: string;
  md5: string;
  osuFile: string;
  rankedStatus: number;
  nCircles: number;
  nSliders: number;
  nSpinners: number;
  ar: number;
  cs: number;
  hp: number;
  od: number;
  starsByMod: Record<number, number>;
  totalTimeMs: number;
  previewTimeMs: number;
  bpm: number;
  beatmapId: number;
  beatmapSetId: number;
  gradeStd: number;
  gradeTaiko: number;
  gradeCtb: number;
  gradeMania: number;
  mode: number;
  source: string;
  tags: string;
  unplayed: boolean;
  lastPlayedAt: string | null;
  folderName: string;
}

interface StableScoreEntry {
  mode: number;
  beatmapMd5: string;
  player: string;
  c300: number;
  c100: number;
  c50: number;
  cGeki: number;
  cKatu: number;
  cMiss: number;
  totalScore: number;
  maxCombo: number;
  perfect: boolean;
  mods: number;
  playedAt: string | null;
}

interface InternalMediaRefs {
  beatmapsetId: number | null;
  stableDir: string | null;
  stableOsuFiles: string[];
  stableBgFiles: string[];
  stableAudioFiles: string[];
  lazerBgPaths: string[];
  lazerAudioPaths: string[];
  lazerOsuPaths: string[];
}

interface CachedLibraryData {
  signature: string;
  response: BooksLibraryResponse;
  detailsByKey: Map<string, BookDetail>;
  mediaByKey: Map<string, InternalMediaRefs>;
  builtAt: number;
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
};

const TICKS_EPOCH_OFFSET = 621355968000000000n;
const EMPTY_GRADE_COUNTS: Record<BookGrade, number> = {
  XH: 0,
  X: 0,
  SH: 0,
  S: 0,
  A: 0,
  B: 0,
  C: 0,
  D: 0,
  F: 0,
};

const GRADE_ORDER: Record<BookGrade, number> = {
  XH: 9,
  X: 8,
  SH: 7,
  S: 6,
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
};

let cachedLibrary: CachedLibraryData | null = null;
const stableBgCache = new Map<string, string>(); // `${folderPath}|${osuFile}` -> bgFile
const rhythmCacheByKey = new Map<string, BookRhythmData>();

export function invalidateBooksCache(): void {
  cachedLibrary = null;
  rhythmCacheByKey.clear();
}

function windowsTicksToIso(ticks: bigint): string | null {
  if (ticks <= TICKS_EPOCH_OFFSET) return null;
  const ms = Number((ticks - TICKS_EPOCH_OFFSET) / 10000n);
  if (!Number.isFinite(ms) || ms <= 0 || ms > 4102444800000) return null;
  return new Date(ms).toISOString();
}

function readBufferLockSafe(filePath: string): Buffer | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath);
  } catch {
    const tmpCopy = path.join(
      os.tmpdir(),
      `osu-book-db-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    try {
      fs.copyFileSync(filePath, tmpCopy);
      return fs.readFileSync(tmpCopy);
    } catch {
      return null;
    } finally {
      try {
        if (fs.existsSync(tmpCopy)) fs.unlinkSync(tmpCopy);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

function createOsuBinaryReader(buf: Buffer) {
  let off = 0;
  return {
    get pos() {
      return off;
    },
    get len() {
      return buf.length;
    },
    u8(): number {
      return buf.readUInt8(off++);
    },
    u16(): number {
      const v = buf.readUInt16LE(off);
      off += 2;
      return v;
    },
    i32(): number {
      const v = buf.readInt32LE(off);
      off += 4;
      return v;
    },
    f32(): number {
      const v = buf.readFloatLE(off);
      off += 4;
      return v;
    },
    f64(): number {
      const v = buf.readDoubleLE(off);
      off += 8;
      return v;
    },
    i64(): bigint {
      const v = buf.readBigInt64LE(off);
      off += 8;
      return v;
    },
    uleb(): number {
      let res = 0;
      let shift = 0;
      while (off < buf.length) {
        const b = buf[off++];
        res |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      return res;
    },
    str(): string {
      if (off >= buf.length) return '';
      const flag = buf[off++];
      if (flag === 0x00) return '';
      if (flag !== 0x0b) {
        throw new Error(`Unexpected osu! string flag 0x${flag.toString(16)} at ${off - 1}`);
      }
      const len = this.uleb();
      const end = Math.min(buf.length, off + len);
      const s = buf.subarray(off, end).toString('utf8');
      off = end;
      return s;
    },
    skip(n: number): void {
      off += n;
    },
  };
}

function parseStableOsuDb(stablePath: string): StableBeatmapEntry[] {
  if (!stablePath) return [];
  const dbPath = path.join(stablePath, 'osu!.db');
  const buf = readBufferLockSafe(dbPath);
  if (!buf || buf.length < 24) return [];

  const entries: StableBeatmapEntry[] = [];
  try {
    const r = createOsuBinaryReader(buf);
    const version = r.i32();
    r.i32(); // folderCount
    r.u8(); // accountUnlocked
    r.i64(); // unlockDate
    r.str(); // playerName
    const numBeatmaps = r.i32();

    for (let i = 0; i < numBeatmaps && r.pos < r.len; i++) {
      if (version < 20191106) r.i32();
      const artist = r.str();
      const artistUnicode = r.str();
      const title = r.str();
      const titleUnicode = r.str();
      const creator = r.str();
      const versionName = r.str();
      const audioFile = r.str();
      const md5 = r.str().toLowerCase();
      const osuFile = r.str();
      const rankedStatus = r.u8();
      const nCircles = r.u16();
      const nSliders = r.u16();
      const nSpinners = r.u16();
      r.i64(); // lastModified
      const ar = version < 20140609 ? r.u8() : r.f32();
      const cs = version < 20140609 ? r.u8() : r.f32();
      const hp = version < 20140609 ? r.u8() : r.f32();
      const od = version < 20140609 ? r.u8() : r.f32();
      r.f64(); // sliderVelocity

      const starsByMod: Record<number, number> = {};
      if (version >= 20140609) {
        for (let m = 0; m < 4; m++) {
          const pairs = r.i32();
          const modeMaps: Record<number, number> = {};
          for (let p = 0; p < pairs; p++) {
            r.u8(); // 0x08
            const mod = r.i32();
            const typeByte = r.u8(); // 0x0c (float32 >= 20250107) or 0x0d (float64)
            const val = typeByte === 0x0c ? r.f32() : r.f64();
            if (Number.isFinite(val)) {
              modeMaps[mod] = val;
            }
          }
          if (m === 3) {
            Object.assign(starsByMod, modeMaps);
          } else {
            // Keep own-mode star ratings provisionally if mode matches later
            (starsByMod as Record<string, unknown>)[`_m${m}`] = modeMaps;
          }
        }
      }

      r.i32(); // drainTime
      const totalTimeMs = r.i32();
      const previewTimeMs = r.i32();

      const tpCount = r.i32();
      let bpm = 0;
      for (let t = 0; t < tpCount; t++) {
        const beatLen = r.f64();
        r.f64(); // offset
        const uninherited = r.u8();
        if (uninherited && bpm === 0 && beatLen > 0) {
          bpm = Math.round((60000 / beatLen) * 10) / 10;
        }
      }

      const beatmapId = r.i32();
      const beatmapSetId = r.i32();
      r.i32(); // threadId
      const gradeStd = r.u8();
      const gradeTaiko = r.u8();
      const gradeCtb = r.u8();
      const gradeMania = r.u8();
      r.u16(); // localOffset
      r.f32(); // stackLeniency
      const mode = r.u8();
      const source = r.str();
      const tags = r.str();
      r.u16(); // onlineOffset
      r.str(); // font
      const unplayed = r.u8() !== 0;
      const lastPlayedTicks = r.i64();
      r.u8(); // isOsz2
      const folderName = r.str();
      r.i64(); // lastChecked
      r.skip(5); // ignoreSound, ignoreSkin, disableStoryboard, disableVideo, visualOverride
      if (version < 20140609) r.u16();
      r.i32(); // lastModificationTime
      r.u8(); // maniaScrollSpeed

      const ownStars =
        mode === 3
          ? starsByMod
          : (((starsByMod as Record<string, unknown>)[`_m${mode}`] as Record<number, number>) ?? {});
      const cleanStars: Record<number, number> = {};
      for (const [k, v] of Object.entries(ownStars)) {
        if (!k.startsWith('_') && typeof v === 'number' && Number.isFinite(v)) {
          cleanStars[Number(k)] = v;
        }
      }

      entries.push({
        artist,
        artistUnicode: artistUnicode || artist,
        title,
        titleUnicode: titleUnicode || title,
        creator,
        version: versionName,
        audioFile,
        md5,
        osuFile,
        rankedStatus,
        nCircles,
        nSliders,
        nSpinners,
        ar,
        cs,
        hp,
        od,
        starsByMod: cleanStars,
        totalTimeMs: Math.max(0, totalTimeMs),
        previewTimeMs: Math.max(0, previewTimeMs),
        bpm: bpm > 0 ? bpm : 120,
        beatmapId,
        beatmapSetId,
        gradeStd,
        gradeTaiko,
        gradeCtb,
        gradeMania,
        mode,
        source,
        tags,
        unplayed,
        lastPlayedAt: windowsTicksToIso(lastPlayedTicks),
        folderName,
      });
    }
  } catch {
    // Return parsed entries so far on partial read error
  }
  return entries;
}

function parseStableScoresDb(stablePath: string): StableScoreEntry[] {
  if (!stablePath) return [];
  const dbPath = path.join(stablePath, 'scores.db');
  const buf = readBufferLockSafe(dbPath);
  if (!buf || buf.length < 12) return [];

  const list: StableScoreEntry[] = [];
  try {
    const r = createOsuBinaryReader(buf);
    r.i32(); // version
    const numMaps = r.i32();
    for (let i = 0; i < numMaps && r.pos < r.len; i++) {
      const md5 = r.str().toLowerCase();
      const count = r.i32();
      for (let j = 0; j < count && r.pos < r.len; j++) {
        const mode = r.u8();
        r.i32(); // scoreVersion
        const mapMd5 = (r.str() || md5).toLowerCase();
        const player = r.str();
        r.str(); // replayMd5
        const c300 = r.u16();
        const c100 = r.u16();
        const c50 = r.u16();
        const cGeki = r.u16();
        const cKatu = r.u16();
        const cMiss = r.u16();
        const totalScore = r.i32();
        const maxCombo = r.u16();
        const perfect = r.u8() !== 0;
        const mods = r.i32();
        r.str(); // hpGraph
        const ticks = r.i64();
        r.i32(); // -1
        r.i64(); // onlineScoreId
        if ((mods & (1 << 23)) !== 0) {
          r.f64(); // TargetPractice additional mod info
        }
        list.push({
          mode,
          beatmapMd5: mapMd5,
          player,
          c300,
          c100,
          c50,
          cGeki,
          cKatu,
          cMiss,
          totalScore,
          maxCombo,
          perfect,
          mods,
          playedAt: windowsTicksToIso(ticks),
        });
      }
    }
  } catch {
    // Return parsed scores so far
  }
  return list;
}

function extractBgFromOsuHeader(folderPath: string, osuFile: string): string {
  const key = `${folderPath}|${osuFile}`;
  const cached = stableBgCache.get(key);
  if (cached !== undefined) return cached;

  let bg = '';
  try {
    const fp = path.join(folderPath, osuFile);
    if (fs.existsSync(fp)) {
      const fd = fs.openSync(fp, 'r');
      try {
        const buf = Buffer.allocUnsafe(4096);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        const head = buf.subarray(0, bytesRead).toString('utf8');
        const m = head.match(/^\s*0\s*,\s*0\s*,\s*"?([^"\r\n,]+)"?/m);
        if (m) bg = m[1].trim();
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    // Ignore unreadable .osu
  }
  stableBgCache.set(key, bg);
  return bg;
}

function parseLightweightOsuHeader(filePath: string): {
  beatmapSetId: number;
  beatmapId: number;
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  creator: string;
  version: string;
  mode: number;
  cs: number;
  od: number;
  hp: number;
  ar: number;
  bpm: number;
  audioFile: string;
  bgFile: string;
  source: string;
  tags: string;
  previewTime: number;
} | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    let head = '';
    try {
      const buf = Buffer.allocUnsafe(8192);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      head = buf.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '');
    } finally {
      fs.closeSync(fd);
    }
    const getVal = (k: string): string => {
      const m = head.match(new RegExp(`^${k}\\s*:\\s*(.*)$`, 'm'));
      return m ? m[1].trim() : '';
    };
    const bgMatch = head.match(/^\s*0\s*,\s*0\s*,\s*"?([^"\r\n,]+)"?/m);
    let bpm = 120;
    const tpIdx = head.indexOf('[TimingPoints]');
    if (tpIdx >= 0) {
      const tpBlock = head.slice(tpIdx, tpIdx + 1200);
      for (const line of tpBlock.split(/\r?\n/)) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const bl = Number(parts[1]);
          const uninherited = parts.length >= 7 ? parts[6].trim() === '1' : bl > 0;
          if (uninherited && Number.isFinite(bl) && bl > 0) {
            bpm = Math.round((60000 / bl) * 10) / 10;
            break;
          }
        }
      }
    }
    return {
      beatmapSetId: Number(getVal('BeatmapSetID')) || -1,
      beatmapId: Number(getVal('BeatmapID')) || -1,
      title: getVal('Title') || path.basename(path.dirname(filePath)),
      titleUnicode: getVal('TitleUnicode') || getVal('Title') || path.basename(path.dirname(filePath)),
      artist: getVal('Artist') || 'Unknown Artist',
      artistUnicode: getVal('ArtistUnicode') || getVal('Artist') || 'Unknown Artist',
      creator: getVal('Creator') || 'Unknown',
      version: getVal('Version') || 'Normal',
      mode: Number(getVal('Mode')) || 0,
      cs: Number(getVal('CircleSize')) || 4,
      od: Number(getVal('OverallDifficulty')) || 7,
      hp: Number(getVal('HPDrainRate')) || 7,
      ar: Number(getVal('ApproachRate')) || 5,
      bpm,
      audioFile: getVal('AudioFilename'),
      bgFile: bgMatch ? bgMatch[1].trim() : '',
      source: getVal('Source'),
      tags: getVal('Tags'),
      previewTime: Math.max(0, Number(getVal('PreviewTime')) || 0),
    };
  } catch {
    return null;
  }
}

function stableStatusToString(status: number): string {
  switch (status) {
    case 4:
      return 'ranked';
    case 5:
      return 'approved';
    case 6:
      return 'qualified';
    case 7:
      return 'loved';
    case 2:
      return 'pending';
    default:
      return 'local';
  }
}

function lazerStatusToString(status: number): string {
  switch (status) {
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
      return 'graveyard';
    default:
      return 'local';
  }
}

function modeIntToName(modeInt: number): string {
  if (modeInt === 3) return 'mania';
  if (modeInt === 1) return 'taiko';
  if (modeInt === 2) return 'fruits';
  return 'osu';
}

function decodeStableMods(mask: number): {
  mods: string[];
  rate: number;
  ez: boolean;
  nf: boolean;
  hdOrFl: boolean;
} {
  const mods: string[] = [];
  if (mask & (1 << 0)) mods.push('NF');
  if (mask & (1 << 1)) mods.push('EZ');
  if (mask & (1 << 3)) mods.push('HD');
  if (mask & (1 << 4)) mods.push('HR');
  if (mask & (1 << 5)) mods.push('SD');
  if (mask & (1 << 9)) mods.push('NC');
  else if (mask & (1 << 6)) mods.push('DT');
  if (mask & (1 << 8)) mods.push('HT');
  if (mask & (1 << 10)) mods.push('FL');
  if (mask & (1 << 14)) mods.push('PF');
  if (mask & (1 << 20)) mods.push('FI');
  if (mask & (1 << 30)) mods.push('MR');

  const hasDt = Boolean(mask & ((1 << 6) | (1 << 9)));
  const hasHt = Boolean(mask & (1 << 8));
  const rate = hasDt ? 1.5 : hasHt ? 0.75 : 1;
  return {
    mods,
    rate,
    ez: Boolean(mask & (1 << 1)),
    nf: Boolean(mask & (1 << 0)),
    hdOrFl: Boolean(mask & ((1 << 3) | (1 << 10) | (1 << 20))),
  };
}

function decodeLazerMods(modsJson: string): {
  mods: string[];
  rate: number;
  ez: boolean;
  nf: boolean;
  classic: boolean;
} {
  if (!modsJson) {
    return { mods: [], rate: 1, ez: false, nf: false, classic: false };
  }
  try {
    const parsed = JSON.parse(modsJson) as Array<{
      acronym?: string;
      settings?: { speed_change?: number };
    }>;
    if (!Array.isArray(parsed)) {
      return { mods: [], rate: 1, ez: false, nf: false, classic: false };
    }
    const mods: string[] = [];
    let rate = 1;
    let ez = false;
    let nf = false;
    let classic = false;
    for (const item of parsed) {
      const ac = String(item?.acronym || '').toUpperCase();
      if (!ac) continue;
      const sc = item?.settings?.speed_change;
      if (ac === 'DT' || ac === 'NC') {
        rate = typeof sc === 'number' && sc > 0 ? sc : 1.5;
        mods.push(typeof sc === 'number' && Math.abs(sc - 1.5) > 0.01 ? `${ac}(${sc.toFixed(2)}x)` : ac);
      } else if (ac === 'HT' || ac === 'DC') {
        rate = typeof sc === 'number' && sc > 0 ? sc : 0.75;
        mods.push(typeof sc === 'number' && Math.abs(sc - 0.75) > 0.01 ? `${ac}(${sc.toFixed(2)}x)` : ac);
      } else {
        mods.push(ac);
      }
      if (ac === 'EZ') ez = true;
      if (ac === 'NF') nf = true;
      if (ac === 'CL') classic = true;
    }
    return { mods, rate, ez, nf, classic };
  } catch {
    return { mods: [], rate: 1, ez: false, nf: false, classic: false };
  }
}

function computeStableAccuracy(
  mode: number,
  cMax: number,
  c300: number,
  c200: number,
  c100: number,
  c50: number,
  cMiss: number,
): number {
  if (mode === 3) {
    const total = cMax + c300 + c200 + c100 + c50 + cMiss;
    if (total <= 0) return 0;
    return ((300 * (cMax + c300) + 200 * c200 + 100 * c100 + 50 * c50) / (300 * total)) * 100;
  }
  if (mode === 1) {
    const total = c300 + c100 + cMiss;
    if (total <= 0) return 0;
    return ((c300 + 0.5 * c100) / total) * 100;
  }
  if (mode === 2) {
    const total = c300 + c100 + c50 + c200 + cMiss;
    if (total <= 0) return 0;
    return ((c300 + c100 + c50) / total) * 100;
  }
  const total = c300 + c100 + c50 + cMiss;
  if (total <= 0) return 0;
  return ((300 * c300 + 100 * c100 + 50 * c50) / (300 * total)) * 100;
}

function computeStableGrade(
  mode: number,
  acc: number,
  c300: number,
  cMax: number,
  c100: number,
  c50: number,
  cMiss: number,
  hdOrFl: boolean,
): BookGrade {
  if (mode === 3) {
    if (acc >= 99.999) return hdOrFl ? 'XH' : 'X';
    if (acc >= 95) return hdOrFl ? 'SH' : 'S';
    if (acc >= 90) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 70) return 'C';
    return 'D';
  }
  if (mode === 0) {
    const total = c300 + c100 + c50 + cMiss;
    if (total <= 0) return 'D';
    const r300 = c300 / total;
    const r50 = c50 / total;
    if (r300 === 1) return hdOrFl ? 'XH' : 'X';
    if (r300 > 0.9 && r50 <= 0.01 && cMiss === 0) return hdOrFl ? 'SH' : 'S';
    if ((r300 > 0.8 && cMiss === 0) || r300 > 0.9) return 'A';
    if ((r300 > 0.7 && cMiss === 0) || r300 > 0.8) return 'B';
    if (r300 > 0.6) return 'C';
    return 'D';
  }
  void cMax;
  if (acc >= 99.999) return hdOrFl ? 'XH' : 'X';
  if (acc >= 95) return hdOrFl ? 'SH' : 'S';
  if (acc >= 90) return 'A';
  if (acc >= 80) return 'B';
  if (acc >= 70) return 'C';
  return 'D';
}

function mapLazerRankToGrade(rank: number): BookGrade {
  switch (rank) {
    case 7:
      return 'XH';
    case 6:
      return 'X';
    case 5:
      return 'SH';
    case 4:
      return 'S';
    case 3:
      return 'A';
    case 2:
      return 'B';
    case 1:
      return 'C';
    case 0:
      return 'D';
    default:
      return 'F';
  }
}

function makeBookKey(beatmapsetId: number | null, artist: string, title: string, fallbackSeed: string): string {
  if (beatmapsetId && beatmapsetId > 0) {
    return `set-${beatmapsetId}`;
  }
  const norm = `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}::${fallbackSeed.trim().toLowerCase()}`;
  const hash = crypto.createHash('sha1').update(norm).digest('hex').slice(0, 12);
  return `loc-${hash}`;
}

function computeManiaScorePp(
  baseSr: number,
  starsByMod: Record<number, number> | undefined,
  rate: number,
  ez: boolean,
  nf: boolean,
  classic: boolean,
  countMax: number,
  count300: number,
  count200: number,
  count100: number,
  count50: number,
  countMiss: number,
  fallbackAccuracyPct: number,
  totalObjectsHint: number,
): number {
  const totalHits = countMax + count300 + count200 + count100 + count50 + countMiss;
  let customAcc = fallbackAccuracyPct / 100;
  let objCount = Math.max(1, totalObjectsHint);

  if (totalHits > 0) {
    objCount = totalHits;
    customAcc =
      (320 * countMax + 300 * count300 + 200 * count200 + 100 * count100 + 50 * count50) /
      (320 * totalHits);
  }

  let effSr = baseSr;
  if (starsByMod) {
    const modKey =
      (Math.abs(rate - 1.5) < 0.05 ? 64 : Math.abs(rate - 0.75) < 0.05 ? 256 : 0) |
      (ez ? 2 : 0);
    if (starsByMod[modKey] && starsByMod[modKey] > 0) {
      effSr = starsByMod[modKey];
    } else if (Math.abs(rate - 1) > 0.001) {
      effSr = baseSr * Math.pow(rate, 0.72);
    }
  } else if (Math.abs(rate - 1) > 0.001) {
    effSr = baseSr * Math.pow(rate, 0.72);
  }

  const lengthBonus = 1 + 0.1 * Math.min(1, objCount / 1500);
  const modMultiplier =
    0.8 * (nf ? 0.75 : 1) * (ez ? 0.5 : 1) * (classic ? 0.96 : 1);
  const accFactor = Math.max(0, 5 * customAcc - 4);
  const pp =
    8.0 *
    Math.pow(Math.max(effSr - 0.15, 0.05), 2.2) *
    accFactor *
    lengthBonus *
    modMultiplier;
  return Math.round(Math.max(0, pp) * 10) / 10;
}

function buildLibrarySignature(stablePath: string, lazerDataPath: string): string {
  const parts: string[] = [stablePath, lazerDataPath];
  const statPaths = [
    stablePath ? path.join(stablePath, 'osu!.db') : '',
    stablePath ? path.join(stablePath, 'scores.db') : '',
    stablePath ? path.join(stablePath, 'Songs') : '',
    lazerDataPath ? path.join(lazerDataPath, 'client.realm') : '',
  ];
  for (const p of statPaths) {
    if (!p) continue;
    try {
      const st = fs.statSync(p);
      parts.push(`${p}:${st.size}:${Math.round(st.mtimeMs)}`);
    } catch {
      parts.push(`${p}:missing`);
    }
  }
  return parts.join('|');
}

function buildLocalBooksData(): CachedLibraryData {
  const cfg = getConfig();
  const signature = buildLibrarySignature(cfg.stablePath, cfg.lazerDataPath);

  const stableEntries = parseStableOsuDb(cfg.stablePath);
  const stableScores = parseStableScoresDb(cfg.stablePath);
  const realm = readLazerRealmData(cfg.lazerDataPath);

  interface MutableBook {
    bookKey: string;
    beatmapsetId: number | null;
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    source: string;
    tags: Set<string>;
    status: string;
    inStable: boolean;
    inLazer: boolean;
    stableFolder: string | null;
    bpm: number;
    lengthSec: number;
    previewTimeMs: number;
    dateAdded: string | null;
    diffsByKey: Map<string, BookDifficultyRecord & { starsByMod?: Record<number, number> }>;
    md5ToDiffKey: Map<string, string>;
    idToDiffKey: Map<number, string>;
    scores: BookScoreRecord[];
    media: InternalMediaRefs;
  }

  const booksByKey = new Map<string, MutableBook>();
  const globalMd5ToBookKey = new Map<string, string>();
  const realmBeatmapKeyToBookKey = new Map<number, { bookKey: string; diffKey: string }>();
  const stableFoldersCovered = new Set<string>();

  const getOrCreateBook = (params: {
    beatmapsetId: number | null;
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    source: string;
    tags: string;
    status: string;
    fallbackSeed: string;
    bpm: number;
    lengthSec: number;
    previewTimeMs: number;
  }): MutableBook => {
    const bookKey = makeBookKey(
      params.beatmapsetId,
      params.artist,
      params.title,
      params.fallbackSeed,
    );
    let book = booksByKey.get(bookKey);
    if (!book) {
      book = {
        bookKey,
        beatmapsetId: params.beatmapsetId && params.beatmapsetId > 0 ? params.beatmapsetId : null,
        title: params.title || 'Untitled',
        titleUnicode: params.titleUnicode || params.title || 'Untitled',
        artist: params.artist || 'Unknown Artist',
        artistUnicode: params.artistUnicode || params.artist || 'Unknown Artist',
        creator: params.creator || 'Unknown',
        source: params.source || '',
        tags: new Set<string>(),
        status: params.status || 'local',
        inStable: false,
        inLazer: false,
        stableFolder: null,
        bpm: params.bpm || 120,
        lengthSec: params.lengthSec || 0,
        previewTimeMs: params.previewTimeMs || 0,
        dateAdded: null,
        diffsByKey: new Map(),
        md5ToDiffKey: new Map(),
        idToDiffKey: new Map(),
        scores: [],
        media: {
          beatmapsetId: params.beatmapsetId && params.beatmapsetId > 0 ? params.beatmapsetId : null,
          stableDir: null,
          stableOsuFiles: [],
          stableBgFiles: [],
          stableAudioFiles: [],
          lazerBgPaths: [],
          lazerAudioPaths: [],
          lazerOsuPaths: [],
        },
      };
      booksByKey.set(bookKey, book);
    } else {
      if (book.status === 'local' && params.status !== 'local') {
        book.status = params.status;
      }
      if (!book.source && params.source) book.source = params.source;
      if (book.previewTimeMs === 0 && params.previewTimeMs > 0) {
        book.previewTimeMs = params.previewTimeMs;
      }
      if (params.lengthSec > book.lengthSec) book.lengthSec = params.lengthSec;
    }

    if (params.tags) {
      for (const t of params.tags.split(/\s+/)) {
        const clean = t.trim();
        if (clean) book.tags.add(clean);
      }
    }
    return book;
  };

  const songsDir = cfg.stablePath ? path.join(cfg.stablePath, 'Songs') : '';

  // 1. Ingest osu!stable osu!.db beatmaps
  for (const bm of stableEntries) {
    const sid = bm.beatmapSetId > 0 ? bm.beatmapSetId : null;
    if (bm.folderName) stableFoldersCovered.add(bm.folderName);

    const status = stableStatusToString(bm.rankedStatus);
    const book = getOrCreateBook({
      beatmapsetId: sid,
      title: bm.title,
      titleUnicode: bm.titleUnicode,
      artist: bm.artist,
      artistUnicode: bm.artistUnicode,
      creator: bm.creator,
      source: bm.source,
      tags: bm.tags,
      status,
      fallbackSeed: bm.folderName || bm.md5,
      bpm: bm.bpm,
      lengthSec: Math.round(bm.totalTimeMs / 1000),
      previewTimeMs: bm.previewTimeMs,
    });

    book.inStable = true;
    if (bm.folderName) {
      book.stableFolder = bm.folderName;
      if (songsDir) {
        const dirPath = path.join(songsDir, bm.folderName);
        book.media.stableDir = dirPath;
        if (bm.audioFile && !book.media.stableAudioFiles.includes(bm.audioFile)) {
          book.media.stableAudioFiles.push(bm.audioFile);
        }
        if (bm.osuFile && book.media.stableOsuFiles.length < 4 && !book.media.stableOsuFiles.includes(bm.osuFile)) {
          book.media.stableOsuFiles.push(bm.osuFile);
        }
      }
    }

    const diffKey = bm.md5
      ? `md5:${bm.md5}`
      : bm.beatmapId > 0
        ? `id:${bm.beatmapId}`
        : `v:${bm.mode}:${bm.version}`;

    const totalObjects = bm.nCircles + bm.nSliders + bm.nSpinners;
    const lnCount = bm.mode === 3 ? bm.nSliders : 0;
    const lnRatio =
      bm.mode === 3 && totalObjects > 0 ? Math.round((lnCount / totalObjects) * 100) : null;
    const baseSr = bm.starsByMod[0] ?? 0;

    const normBm: NormalizedBeatmap = {
      id: bm.beatmapId > 0 ? bm.beatmapId : 0,
      beatmapsetId: sid ?? 0,
      version: bm.version,
      modeInt: bm.mode,
      mode: modeIntToName(bm.mode),
      cs: bm.cs,
      ar: bm.ar,
      od: bm.od,
      hp: bm.hp,
      difficultyRating: baseSr,
      totalLength: Math.round(bm.totalTimeMs / 1000),
      hitLength: Math.round(bm.totalTimeMs / 1000),
      bpm: bm.bpm,
      countCircles: bm.nCircles,
      countSliders: bm.nSliders,
      countSpinners: bm.nSpinners,
      maxCombo: null,
      playcount: 0,
      passcount: 0,
      convert: false,
      status,
      lnRatio,
    };

    const existingDiff = book.diffsByKey.get(diffKey);
    if (!existingDiff) {
      book.diffsByKey.set(diffKey, {
        key: diffKey,
        beatmapId: bm.beatmapId > 0 ? bm.beatmapId : null,
        md5: bm.md5,
        version: bm.version || 'Normal',
        modeInt: bm.mode,
        mode: modeIntToName(bm.mode),
        keyCount: bm.mode === 3 ? Math.max(1, Math.round(bm.cs || 4)) : null,
        starRating: Math.round(baseSr * 100) / 100,
        bpm: bm.bpm,
        lengthSec: Math.round(bm.totalTimeMs / 1000),
        od: Math.round(bm.od * 10) / 10,
        hp: Math.round(bm.hp * 10) / 10,
        ar: Math.round(bm.ar * 10) / 10,
        totalObjects,
        lnCount,
        lnRatio,
        status,
        inStable: true,
        inLazer: false,
        playCount: 0,
        bestPp: null,
        bestPpSource: null,
        bestAccuracy: null,
        bestGrade: null,
        bestScore: null,
        lastPlayedAt: bm.lastPlayedAt,
        estimated98Pp: Math.round(calculateBeatmapPp(normBm, { accuracy: 98 }).pp * 10) / 10,
        starsByMod: bm.starsByMod,
      });
    } else {
      existingDiff.inStable = true;
      if (bm.starsByMod && Object.keys(bm.starsByMod).length > 0) {
        existingDiff.starsByMod = bm.starsByMod;
      }
      if (bm.lastPlayedAt && (!existingDiff.lastPlayedAt || bm.lastPlayedAt > existingDiff.lastPlayedAt)) {
        existingDiff.lastPlayedAt = bm.lastPlayedAt;
      }
    }

    if (bm.md5) {
      book.md5ToDiffKey.set(bm.md5, diffKey);
      globalMd5ToBookKey.set(bm.md5, book.bookKey);
    }
    if (bm.beatmapId > 0) {
      book.idToDiffKey.set(bm.beatmapId, diffKey);
    }
  }

  // 1b. Supplement Stable Songs/ folders not yet indexed in osu!.db
  if (songsDir && fs.existsSync(songsDir)) {
    try {
      const dirEntries = fs.readdirSync(songsDir, { withFileTypes: true });
      for (const de of dirEntries) {
        if (!de.isDirectory() || de.name.startsWith('.tmp-')) continue;
        if (stableFoldersCovered.has(de.name)) continue;

        const folderPath = path.join(songsDir, de.name);
        let osuFiles: string[] = [];
        try {
          osuFiles = fs
            .readdirSync(folderPath)
            .filter((n) => n.toLowerCase().endsWith('.osu'));
        } catch {
          continue;
        }
        if (osuFiles.length === 0) continue;

        const folderSetIdMatch = de.name.match(/^(\d+)\b/);
        const folderSetId = folderSetIdMatch ? Number(folderSetIdMatch[1]) : null;
        const leadMeta = parseLightweightOsuHeader(path.join(folderPath, osuFiles[0]));
        if (!leadMeta) continue;
        const sid =
          leadMeta.beatmapSetId > 0
            ? leadMeta.beatmapSetId
            : folderSetId && folderSetId > 0
              ? folderSetId
              : null;

        const book = getOrCreateBook({
          beatmapsetId: sid,
          title: leadMeta.title,
          titleUnicode: leadMeta.titleUnicode,
          artist: leadMeta.artist,
          artistUnicode: leadMeta.artistUnicode,
          creator: leadMeta.creator,
          source: leadMeta.source,
          tags: leadMeta.tags,
          status: 'local',
          fallbackSeed: de.name,
          bpm: leadMeta.bpm,
          lengthSec: 0,
          previewTimeMs: leadMeta.previewTime,
        });
        book.inStable = true;
        book.stableFolder = de.name;
        book.media.stableDir = folderPath;
        if (leadMeta.audioFile) book.media.stableAudioFiles.push(leadMeta.audioFile);
        if (leadMeta.bgFile) book.media.stableBgFiles.push(leadMeta.bgFile);
        for (const ofn of osuFiles.slice(0, 4)) {
          if (!book.media.stableOsuFiles.includes(ofn)) {
            book.media.stableOsuFiles.push(ofn);
          }
        }

        for (const ofn of osuFiles) {
          const parsed = parseLightweightOsuHeader(path.join(folderPath, ofn));
          if (!parsed) continue;
          const diffKey = parsed.beatmapId > 0 ? `id:${parsed.beatmapId}` : `file:${ofn}`;
          if (!book.diffsByKey.has(diffKey)) {
            book.diffsByKey.set(diffKey, {
              key: diffKey,
              beatmapId: parsed.beatmapId > 0 ? parsed.beatmapId : null,
              md5: '',
              version: parsed.version,
              modeInt: parsed.mode,
              mode: modeIntToName(parsed.mode),
              keyCount: parsed.mode === 3 ? Math.max(1, Math.round(parsed.cs || 4)) : null,
              starRating: 0,
              bpm: parsed.bpm,
              lengthSec: 0,
              od: parsed.od,
              hp: parsed.hp,
              ar: parsed.ar,
              totalObjects: 0,
              lnCount: 0,
              lnRatio: null,
              status: 'local',
              inStable: true,
              inLazer: false,
              playCount: 0,
              bestPp: null,
              bestPpSource: null,
              bestAccuracy: null,
              bestGrade: null,
              bestScore: null,
              lastPlayedAt: null,
              estimated98Pp: 0,
            });
          }
        }
      }
    } catch {
      // Ignore Songs directory scan failure
    }
  }

  // 2. Ingest osu!lazer client.realm BeatmapSets & Beatmaps
  const lazerFilesDir = cfg.lazerDataPath ? path.join(cfg.lazerDataPath, 'files') : '';
  if (realm.loaded) {
    for (const set of realm.sets) {
      const bms = set.beatmapKeys
        .map((k) => realm.beatmaps.get(k))
        .filter((x): x is NonNullable<typeof x> => Boolean(x && !x.hidden));
      if (bms.length === 0) continue;

      const fileMap = new Map<string, string>();
      for (const uk of set.fileUsageKeys) {
        const u = realm.fileUsages.get(uk);
        if (u) fileMap.set(normRelName(u.filename), u.hash);
      }

      const leadBm = bms[0];
      const leadMeta = leadBm.metadataKey !== null ? realm.metadata.get(leadBm.metadataKey) : undefined;
      const authorName =
        leadMeta && leadMeta.authorKey !== null
          ? realm.users.get(leadMeta.authorKey) || 'Unknown'
          : 'Unknown';

      const sid = set.onlineId > 0 ? set.onlineId : null;
      const status = lazerStatusToString(set.status);

      const book = getOrCreateBook({
        beatmapsetId: sid,
        title: leadMeta?.title || `BeatmapSet #${set.key}`,
        titleUnicode: leadMeta?.titleUnicode || leadMeta?.title || `BeatmapSet #${set.key}`,
        artist: leadMeta?.artist || 'Unknown Artist',
        artistUnicode: leadMeta?.artistUnicode || leadMeta?.artist || 'Unknown Artist',
        creator: authorName,
        source: leadMeta?.source || '',
        tags: leadMeta?.tags || '',
        status,
        fallbackSeed: leadBm.md5Hash || String(set.key),
        bpm: Math.round((leadBm.bpm || 120) * 10) / 10,
        lengthSec: Math.round((leadBm.lengthMs || 0) / 1000),
        previewTimeMs: Math.max(0, leadMeta?.previewTime || 0),
      });

      book.inLazer = true;
      if (set.dateAdded && (!book.dateAdded || set.dateAdded > book.dateAdded)) {
        book.dateAdded = set.dateAdded;
      }

      if (lazerFilesDir) {
        for (const bm of bms) {
          const meta = bm.metadataKey !== null ? realm.metadata.get(bm.metadataKey) : undefined;
          if (!meta) continue;
          if (meta.backgroundFile) {
            const h = fileMap.get(normRelName(meta.backgroundFile));
            if (h) {
              const p = path.join(lazerFilesDir, h[0], h.slice(0, 2), h);
              if (!book.media.lazerBgPaths.includes(p)) book.media.lazerBgPaths.push(p);
            }
          }
          if (meta.audioFile) {
            const h = fileMap.get(normRelName(meta.audioFile));
            if (h) {
              const p = path.join(lazerFilesDir, h[0], h.slice(0, 2), h);
              if (!book.media.lazerAudioPaths.includes(p)) book.media.lazerAudioPaths.push(p);
            }
          }
        }
        for (const [fname, h] of fileMap) {
          if (fname.endsWith('.osu') && book.media.lazerOsuPaths.length < 6) {
            const p = path.join(lazerFilesDir, h[0], h.slice(0, 2), h);
            if (!book.media.lazerOsuPaths.includes(p)) book.media.lazerOsuPaths.push(p);
          }
        }
        if (book.media.lazerAudioPaths.length === 0 && book.media.lazerOsuPaths.length > 0) {
          for (const osuPath of book.media.lazerOsuPaths) {
            try {
              const fd = fs.openSync(osuPath, 'r');
              try {
                const headerBuf = Buffer.allocUnsafe(2048);
                const bytesRead = fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
                const header = headerBuf.subarray(0, bytesRead).toString('utf8');
                const afMatch = header.match(/^AudioFilename\s*:\s*(.*)$/m);
                if (afMatch && afMatch[1]) {
                  const h = fileMap.get(normRelName(afMatch[1]));
                  if (h) {
                    const p = path.join(lazerFilesDir, h[0], h.slice(0, 2), h);
                    if (fs.existsSync(p) && !book.media.lazerAudioPaths.includes(p)) {
                      book.media.lazerAudioPaths.push(p);
                      break;
                    }
                  }
                }
              } finally {
                fs.closeSync(fd);
              }
            } catch {
              // Ignore unreadable .osu blob
            }
          }
        }
        if (book.media.lazerAudioPaths.length === 0) {
          let bestPath: string | null = null;
          let bestSize = 0;
          for (const [fname, h] of fileMap) {
            if (!/\.(mp3|ogg|flac|m4a)$/i.test(fname)) continue;
            if (/(?:^|\/)(?:normal|soft|drum|nightcore)-(?:hit|slider|spinner)|(?:^|\/)(?:applause|combobreak|failsound|sectionpass|sectionfail)/i.test(fname)) {
              continue;
            }
            const p = path.join(lazerFilesDir, h[0], h.slice(0, 2), h);
            try {
              const st = fs.statSync(p);
              if (st.isFile() && st.size >= 32768 && st.size > bestSize) {
                bestSize = st.size;
                bestPath = p;
              }
            } catch {
              // Ignore missing blob
            }
          }
          if (bestPath) {
            book.media.lazerAudioPaths.push(bestPath);
          }
        }
      }

      for (const bm of bms) {
        const rs = bm.rulesetKey !== null ? realm.rulesets.get(bm.rulesetKey) : undefined;
        const modeInt = rs?.modeInt ?? 0;
        const diff = bm.difficultyKey !== null ? realm.difficulties.get(bm.difficultyKey) : undefined;
        const cs = diff?.circleSize ?? 4;
        const od = diff?.overallDifficulty ?? 7;
        const hp = diff?.drainRate ?? 7;
        const ar = diff?.approachRate ?? 5;
        const md5 = bm.md5Hash;
        const bmStatus = lazerStatusToString(bm.status);
        const totalObjects = Math.max(0, bm.totalObjectCount);
        const lnCount = modeInt === 3 ? Math.max(0, bm.endTimeObjectCount) : 0;
        const lnRatio =
          modeInt === 3 && totalObjects > 0 ? Math.round((lnCount / totalObjects) * 100) : null;
        const sr = Math.max(0, bm.starRating);

        let diffKey =
          (md5 ? book.md5ToDiffKey.get(md5) : undefined) ||
          (bm.onlineId > 0 ? book.idToDiffKey.get(bm.onlineId) : undefined);

        if (!diffKey) {
          diffKey = md5
            ? `md5:${md5}`
            : bm.onlineId > 0
              ? `id:${bm.onlineId}`
              : `rz:${bm.key}`;
        }

        const existingDiff = book.diffsByKey.get(diffKey);
        if (!existingDiff) {
          const normBm: NormalizedBeatmap = {
            id: bm.onlineId > 0 ? bm.onlineId : 0,
            beatmapsetId: sid ?? 0,
            version: bm.difficultyName,
            modeInt,
            mode: modeIntToName(modeInt),
            cs,
            ar,
            od,
            hp,
            difficultyRating: sr,
            totalLength: Math.round(bm.lengthMs / 1000),
            hitLength: Math.round(bm.lengthMs / 1000),
            bpm: Math.round(bm.bpm * 10) / 10,
            countCircles: Math.max(0, totalObjects - lnCount),
            countSliders: lnCount,
            countSpinners: 0,
            maxCombo: null,
            playcount: 0,
            passcount: 0,
            convert: false,
            status: bmStatus,
            lnRatio,
          };

          book.diffsByKey.set(diffKey, {
            key: diffKey,
            beatmapId: bm.onlineId > 0 ? bm.onlineId : null,
            md5,
            version: bm.difficultyName || 'Normal',
            modeInt,
            mode: modeIntToName(modeInt),
            keyCount: modeInt === 3 ? Math.max(1, Math.round(cs || 4)) : null,
            starRating: Math.round(sr * 100) / 100,
            bpm: Math.round(bm.bpm * 10) / 10,
            lengthSec: Math.round(bm.lengthMs / 1000),
            od: Math.round(od * 10) / 10,
            hp: Math.round(hp * 10) / 10,
            ar: Math.round(ar * 10) / 10,
            totalObjects,
            lnCount,
            lnRatio,
            status: bmStatus,
            inStable: false,
            inLazer: true,
            playCount: 0,
            bestPp: null,
            bestPpSource: null,
            bestAccuracy: null,
            bestGrade: null,
            bestScore: null,
            lastPlayedAt: bm.lastPlayed,
            estimated98Pp: Math.round(calculateBeatmapPp(normBm, { accuracy: 98 }).pp * 10) / 10,
          });
        } else {
          existingDiff.inLazer = true;
          if (existingDiff.starRating <= 0 && sr > 0) {
            existingDiff.starRating = Math.round(sr * 100) / 100;
          }
          if (lnRatio !== null && existingDiff.lnRatio === null) {
            existingDiff.lnCount = lnCount;
            existingDiff.lnRatio = lnRatio;
          }
          if (bm.lastPlayed && (!existingDiff.lastPlayedAt || bm.lastPlayed > existingDiff.lastPlayedAt)) {
            existingDiff.lastPlayedAt = bm.lastPlayed;
          }
        }

        if (md5) {
          book.md5ToDiffKey.set(md5, diffKey);
          globalMd5ToBookKey.set(md5, book.bookKey);
        }
        if (bm.onlineId > 0) {
          book.idToDiffKey.set(bm.onlineId, diffKey);
        }
        realmBeatmapKeyToBookKey.set(bm.key, { bookKey: book.bookKey, diffKey });
      }
    }
  }

  // 3. Ingest osu!stable scores.db
  for (let i = 0; i < stableScores.length; i++) {
    const sc = stableScores[i];
    const bookKey = globalMd5ToBookKey.get(sc.beatmapMd5);
    if (!bookKey) continue;
    const book = booksByKey.get(bookKey);
    if (!book) continue;
    const diffKey = book.md5ToDiffKey.get(sc.beatmapMd5);
    const diff = diffKey ? book.diffsByKey.get(diffKey) : undefined;
    if (!diff) continue;

    const { mods, rate, ez, nf, hdOrFl } = decodeStableMods(sc.mods);
    const modeInt = diff.modeInt;
    const acc = computeStableAccuracy(
      modeInt,
      sc.cGeki,
      sc.c300,
      sc.cKatu,
      sc.c100,
      sc.c50,
      sc.cMiss,
    );
    const grade = computeStableGrade(
      modeInt,
      acc,
      sc.c300,
      sc.cGeki,
      sc.c100,
      sc.c50,
      sc.cMiss,
      hdOrFl,
    );

    const isRanked = isRankedForPp(diff.status);
    let pp = 0;
    if (modeInt === 3) {
      pp = computeManiaScorePp(
        diff.starRating,
        diff.starsByMod,
        rate,
        ez,
        nf,
        true,
        sc.cGeki,
        sc.c300,
        sc.cKatu,
        sc.c100,
        sc.c50,
        sc.cMiss,
        acc,
        diff.totalObjects,
      );
    } else {
      const normBm: NormalizedBeatmap = {
        id: diff.beatmapId ?? 0,
        beatmapsetId: book.beatmapsetId ?? 0,
        version: diff.version,
        modeInt,
        mode: diff.mode,
        cs: diff.keyCount ?? 4,
        ar: diff.ar,
        od: diff.od,
        hp: diff.hp,
        difficultyRating: diff.starRating,
        totalLength: diff.lengthSec,
        hitLength: diff.lengthSec,
        bpm: diff.bpm,
        countCircles: diff.totalObjects,
        countSliders: 0,
        countSpinners: 0,
        maxCombo: null,
        playcount: 0,
        passcount: 0,
        convert: false,
        status: diff.status,
        lnRatio: diff.lnRatio,
      };
      pp =
        Math.round(
          calculateBeatmapPp(normBm, {
            accuracy: acc,
            misses: sc.cMiss,
            rate,
            mods: { ez, nf, classic: true },
          }).pp * 10,
        ) / 10;
    }

    const maRatio =
      modeInt === 3 && sc.c300 > 0
        ? Math.round((sc.cGeki / sc.c300) * 100) / 100
        : modeInt === 3 && sc.cGeki > 0
          ? 99.9
          : null;

    book.scores.push({
      id: `st-${i}-${sc.beatmapMd5.slice(0, 8)}`,
      source: 'stable',
      beatmapMd5: sc.beatmapMd5,
      difficultyName: diff.version,
      modeInt,
      keyCount: diff.keyCount,
      player: sc.player || 'Player',
      score: sc.totalScore,
      legacyScore: sc.totalScore,
      accuracy: Math.round(acc * 100) / 100,
      grade,
      maxCombo: sc.maxCombo,
      perfect: sc.perfect,
      mods,
      rate,
      pp,
      ppSource: 'estimated',
      isRankedPp: isRanked,
      countMax: sc.cGeki,
      count300: sc.c300,
      count200: sc.cKatu,
      count100: sc.c100,
      count50: sc.c50,
      countMiss: sc.cMiss,
      maRatio,
      playedAt: sc.playedAt,
    });
  }

  // 4. Ingest osu!lazer client.realm scores
  if (realm.loaded) {
    for (const sc of realm.scores) {
      let target =
        sc.beatmapKey !== null ? realmBeatmapKeyToBookKey.get(sc.beatmapKey) : undefined;
      if (!target && sc.beatmapHash) {
        const bk = globalMd5ToBookKey.get(sc.beatmapHash);
        if (bk) {
          const b = booksByKey.get(bk);
          const dk = b?.md5ToDiffKey.get(sc.beatmapHash);
          if (dk) target = { bookKey: bk, diffKey: dk };
        }
      }
      if (!target) continue;

      const book = booksByKey.get(target.bookKey);
      const diff = book?.diffsByKey.get(target.diffKey);
      if (!book || !diff) continue;

      const rs = sc.rulesetKey !== null ? realm.rulesets.get(sc.rulesetKey) : undefined;
      const modeInt = rs?.modeInt ?? diff.modeInt;
      const { mods, rate, ez, nf, classic } = decodeLazerMods(sc.modsJson);

      let statsObj: Record<string, number> = {};
      if (sc.statisticsJson) {
        try {
          statsObj = JSON.parse(sc.statisticsJson) as Record<string, number>;
        } catch {
          statsObj = {};
        }
      }
      const countMax = Number(statsObj.perfect || 0);
      const count300 = Number(statsObj.great || 0);
      const count200 = Number(statsObj.good || 0);
      const count100 = Number(statsObj.ok || 0);
      const count50 = Number(statsObj.meh || 0);
      const countMiss = Number(statsObj.miss || 0);
      const accPct = Math.min(100, Math.max(0, sc.accuracy * 100));
      const grade = mapLazerRankToGrade(sc.rank);
      const isRanked = isRankedForPp(diff.status);

      let ppValue: number | null = sc.pp !== null && sc.pp > 0 ? Math.round(sc.pp * 10) / 10 : null;
      let ppSource: 'recorded' | 'estimated' = 'recorded';

      if (ppValue === null) {
        ppSource = 'estimated';
        if (modeInt === 3) {
          ppValue = computeManiaScorePp(
            diff.starRating,
            diff.starsByMod,
            rate,
            ez,
            nf,
            classic || sc.isLegacyScore,
            countMax,
            count300,
            count200,
            count100,
            count50,
            countMiss,
            accPct,
            diff.totalObjects,
          );
        } else {
          const normBm: NormalizedBeatmap = {
            id: diff.beatmapId ?? 0,
            beatmapsetId: book.beatmapsetId ?? 0,
            version: diff.version,
            modeInt,
            mode: diff.mode,
            cs: diff.keyCount ?? 4,
            ar: diff.ar,
            od: diff.od,
            hp: diff.hp,
            difficultyRating: diff.starRating,
            totalLength: diff.lengthSec,
            hitLength: diff.lengthSec,
            bpm: diff.bpm,
            countCircles: diff.totalObjects,
            countSliders: 0,
            countSpinners: 0,
            maxCombo: null,
            playcount: 0,
            passcount: 0,
            convert: false,
            status: diff.status,
            lnRatio: diff.lnRatio,
          };
          ppValue =
            Math.round(
              calculateBeatmapPp(normBm, {
                accuracy: accPct,
                misses: countMiss,
                rate,
                mods: { ez, nf, classic: classic || sc.isLegacyScore },
              }).pp * 10,
            ) / 10;
        }
      }

      const maRatio =
        modeInt === 3 && count300 > 0
          ? Math.round((countMax / count300) * 100) / 100
          : modeInt === 3 && countMax > 0
            ? 99.9
            : null;
      const playerName =
        (sc.userKey !== null ? realm.users.get(sc.userKey) : undefined) || 'Lazer Player';

      // Deduplicate legacy scores imported from Stable (same md5, legacy score & ~same timestamp)
      const scTs = sc.date ? Date.parse(sc.date) : NaN;
      const dupIdx = book.scores.findIndex((existing) => {
        if (existing.source !== 'stable') return false;
        if (existing.beatmapMd5 && sc.beatmapHash && existing.beatmapMd5 !== sc.beatmapHash) return false;
        if (existing.difficultyName !== diff.version) return false;
        const sameLegacy =
          sc.legacyTotalScore !== null &&
          sc.legacyTotalScore > 0 &&
          existing.legacyScore === sc.legacyTotalScore;
        const sameScore = existing.score === sc.totalScore;
        if (!sameLegacy && !sameScore) return false;
        if (!Number.isNaN(scTs) && existing.playedAt) {
          const exTs = Date.parse(existing.playedAt);
          if (!Number.isNaN(exTs) && Math.abs(scTs - exTs) <= 5000) return true;
        }
        return sameLegacy && existing.maxCombo === sc.maxCombo;
      });

      const lazerRecord: BookScoreRecord = {
        id: `lz-${sc.key}`,
        source: 'lazer',
        beatmapMd5: sc.beatmapHash || diff.md5,
        difficultyName: diff.version,
        modeInt,
        keyCount: diff.keyCount,
        player: playerName,
        score: sc.totalScore,
        legacyScore: sc.legacyTotalScore,
        accuracy: Math.round(accPct * 100) / 100,
        grade,
        maxCombo: sc.maxCombo,
        perfect: countMiss === 0 && accPct >= 99.99,
        mods,
        rate,
        pp: ppValue,
        ppSource,
        isRankedPp: isRanked,
        countMax,
        count300,
        count200,
        count100,
        count50,
        countMiss,
        maRatio,
        playedAt: sc.date,
      };

      if (dupIdx >= 0) {
        // Keep Stable's richer hit counts if Lazer legacy entry lacks statistics
        const stPrev = book.scores[dupIdx];
        if (countMax + count300 + count200 + count100 + count50 === 0) {
          lazerRecord.countMax = stPrev.countMax;
          lazerRecord.count300 = stPrev.count300;
          lazerRecord.count200 = stPrev.count200;
          lazerRecord.count100 = stPrev.count100;
          lazerRecord.count50 = stPrev.count50;
          lazerRecord.countMiss = stPrev.countMiss;
          lazerRecord.maRatio = stPrev.maRatio;
          if (stPrev.pp !== null && lazerRecord.ppSource === 'estimated') {
            lazerRecord.pp = stPrev.pp;
          }
        }
        book.scores[dupIdx] = lazerRecord;
      } else {
        book.scores.push(lazerRecord);
      }
    }
  }

  // 5. Finalize Book summaries, details & library telemetry
  const books: BookSummary[] = [];
  const detailsByKey = new Map<string, BookDetail>();
  const mediaByKey = new Map<string, InternalMediaRefs>();

  let stableBooks = 0;
  let lazerBooks = 0;
  let bothBooks = 0;
  let playedBooks = 0;
  let totalPlays = 0;
  let stablePlays = 0;
  let lazerPlays = 0;
  let highestPp: number | null = null;
  let highestPpTitle: string | null = null;

  for (const book of booksByKey.values()) {
    const diffs = Array.from(book.diffsByKey.values()).map(({ starsByMod: _s, ...d }) => d);
    if (diffs.length === 0) continue;

    // Sort diffs by mode (Mania first), keyCount, then starRating
    diffs.sort((a, b) => {
      const am = a.modeInt === 3 ? 0 : 1;
      const bm = b.modeInt === 3 ? 0 : 1;
      if (am !== bm) return am - bm;
      const ak = a.keyCount ?? 0;
      const bk = b.keyCount ?? 0;
      if (ak !== bk) return ak - bk;
      return a.starRating - b.starRating;
    });

    book.scores.sort((a, b) => {
      const ta = a.playedAt ? Date.parse(a.playedAt) : 0;
      const tb = b.playedAt ? Date.parse(b.playedAt) : 0;
      if (tb !== ta) return tb - ta;
      return (b.pp ?? 0) - (a.pp ?? 0);
    });

    const gradeCounts: Record<BookGrade, number> = { ...EMPTY_GRADE_COUNTS };
    let totalNotesPlayed = 0;
    let accSum = 0;
    let bookStablePlays = 0;
    let bookLazerPlays = 0;
    let bookBestPp: number | null = null;
    let bookBestPpIsRanked = false;
    let bookBestPpSource: 'recorded' | 'estimated' | null = null;
    let bookBestAcc: number | null = null;
    let bookBestGrade: BookGrade | null = null;
    let bookBestScore: number | null = null;
    let bookLastPlayed: string | null = null;

    // Aggregate per-difficulty score stats
    const scoresByMd5 = new Map<string, BookScoreRecord[]>();
    const scoresByVer = new Map<string, BookScoreRecord[]>();
    for (const sc of book.scores) {
      gradeCounts[sc.grade] = (gradeCounts[sc.grade] || 0) + 1;
      totalNotesPlayed +=
        sc.countMax + sc.count300 + sc.count200 + sc.count100 + sc.count50;
      accSum += sc.accuracy;
      if (sc.source === 'stable') bookStablePlays += 1;
      else bookLazerPlays += 1;

      if (sc.pp !== null && (bookBestPp === null || sc.pp > bookBestPp)) {
        bookBestPp = sc.pp;
        bookBestPpIsRanked = sc.isRankedPp;
        bookBestPpSource = sc.ppSource;
      }
      if (bookBestAcc === null || sc.accuracy > bookBestAcc) {
        bookBestAcc = sc.accuracy;
      }
      if (bookBestGrade === null || GRADE_ORDER[sc.grade] > GRADE_ORDER[bookBestGrade]) {
        bookBestGrade = sc.grade;
      }
      if (bookBestScore === null || sc.score > bookBestScore) {
        bookBestScore = sc.score;
      }
      if (sc.playedAt && (!bookLastPlayed || sc.playedAt > bookLastPlayed)) {
        bookLastPlayed = sc.playedAt;
      }

      if (sc.beatmapMd5) {
        const arr = scoresByMd5.get(sc.beatmapMd5) || [];
        arr.push(sc);
        scoresByMd5.set(sc.beatmapMd5, arr);
      } else {
        const arr = scoresByVer.get(sc.difficultyName) || [];
        arr.push(sc);
        scoresByVer.set(sc.difficultyName, arr);
      }
    }

    for (const d of diffs) {
      const dScores =
        (d.md5 ? scoresByMd5.get(d.md5) : undefined) ?? scoresByVer.get(d.version) ?? [];
      d.playCount = dScores.length;
      for (const sc of dScores) {
        if (sc.pp !== null && (d.bestPp === null || sc.pp > d.bestPp)) {
          d.bestPp = sc.pp;
          d.bestPpSource = sc.ppSource;
        }
        if (d.bestAccuracy === null || sc.accuracy > d.bestAccuracy) {
          d.bestAccuracy = sc.accuracy;
        }
        if (d.bestGrade === null || GRADE_ORDER[sc.grade] > GRADE_ORDER[d.bestGrade]) {
          d.bestGrade = sc.grade;
        }
        if (d.bestScore === null || sc.score > d.bestScore) {
          d.bestScore = sc.score;
        }
        if (sc.playedAt && (!d.lastPlayedAt || sc.playedAt > d.lastPlayedAt)) {
          d.lastPlayedAt = sc.playedAt;
        }
      }
      if (d.lastPlayedAt && (!bookLastPlayed || d.lastPlayedAt > bookLastPlayed)) {
        bookLastPlayed = d.lastPlayedAt;
      }
    }

    const modes = Array.from(new Set(diffs.map((d) => d.modeInt)));
    const keyCounts = Array.from(
      new Set(diffs.map((d) => d.keyCount).filter((k): k is number => k !== null)),
    ).sort((a, b) => a - b);
    const has4k = diffs.some((d) => d.modeInt === 3 && d.keyCount === 4);
    const stars = diffs.map((d) => d.starRating).filter((s) => s > 0);
    const minStars = stars.length > 0 ? Math.min(...stars) : 0;
    const maxStars = stars.length > 0 ? Math.max(...stars) : 0;
    const lns = diffs.map((d) => d.lnRatio).filter((v): v is number => v !== null);
    const lnRatioAvg =
      lns.length > 0 ? Math.round(lns.reduce((a, b) => a + b, 0) / lns.length) : null;

    const hasLocalCover =
      book.media.lazerBgPaths.length > 0 ||
      book.media.stableBgFiles.length > 0 ||
      book.media.stableOsuFiles.length > 0;
    const hasLocalAudio =
      book.media.lazerAudioPaths.length > 0 || book.media.stableAudioFiles.length > 0;
    const encodedKey = encodeURIComponent(book.bookKey);

    const summary: BookSummary = {
      bookKey: book.bookKey,
      beatmapsetId: book.beatmapsetId,
      title: book.title,
      titleUnicode: book.titleUnicode,
      artist: book.artist,
      artistUnicode: book.artistUnicode,
      creator: book.creator,
      source: book.source,
      tags: Array.from(book.tags).slice(0, 48),
      status: book.status,
      inStable: book.inStable,
      inLazer: book.inLazer,
      stableFolder: book.stableFolder,
      modes,
      keyCounts,
      has4k,
      bpm: book.bpm,
      minStars,
      maxStars,
      lengthSec: book.lengthSec || Math.max(...diffs.map((d) => d.lengthSec), 0),
      lnRatioAvg,
      difficultyCount: diffs.length,
      playCount: book.scores.length,
      stablePlayCount: bookStablePlays,
      lazerPlayCount: bookLazerPlays,
      bestPp: bookBestPp,
      bestPpIsRanked: bookBestPpIsRanked,
      bestPpSource: bookBestPpSource,
      bestAccuracy: bookBestAcc,
      bestGrade: bookBestGrade,
      bestScore: bookBestScore,
      lastPlayedAt: bookLastPlayed,
      dateAdded: book.dateAdded,
      previewTimeMs: book.previewTimeMs,
      coverUrl: `/api/books/${encodedKey}/cover`,
      audioUrl: `/api/books/${encodedKey}/audio`,
      hasLocalCover,
      hasLocalAudio,
    };

    const detail: BookDetail = {
      ...summary,
      difficulties: diffs,
      scores: book.scores,
      gradeCounts,
      totalNotesPlayed,
      avgAccuracy:
        book.scores.length > 0 ? Math.round((accSum / book.scores.length) * 100) / 100 : null,
    };

    books.push(summary);
    detailsByKey.set(book.bookKey, detail);
    mediaByKey.set(book.bookKey, book.media);

    if (summary.inStable) stableBooks += 1;
    if (summary.inLazer) lazerBooks += 1;
    if (summary.inStable && summary.inLazer) bothBooks += 1;
    if (summary.playCount > 0) playedBooks += 1;
    totalPlays += summary.playCount;
    stablePlays += summary.stablePlayCount;
    lazerPlays += summary.lazerPlayCount;
    if (summary.bestPp !== null && (highestPp === null || summary.bestPp > highestPp)) {
      highestPp = summary.bestPp;
      highestPpTitle = summary.titleUnicode || summary.title;
    }
  }

  // Default sort: recently played first, then highest PP, then date added, then title
  books.sort((a, b) => {
    const la = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0;
    const lb = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0;
    if (lb !== la) return lb - la;
    const pa = a.bestPp ?? -1;
    const pb = b.bestPp ?? -1;
    if (pb !== pa) return pb - pa;
    return (a.titleUnicode || a.title).localeCompare(b.titleUnicode || b.title);
  });

  return {
    signature,
    response: {
      books,
      stats: {
        totalBooks: books.length,
        stableBooks,
        lazerBooks,
        bothBooks,
        playedBooks,
        totalPlays,
        stablePlays,
        lazerPlays,
        highestPp,
        highestPpTitle,
        scannedAt: new Date().toISOString(),
      },
    },
    detailsByKey,
    mediaByKey,
    builtAt: Date.now(),
  };
}

function ensureBooksCache(forceRefresh = false): CachedLibraryData {
  const cfg = getConfig();
  const sig = buildLibrarySignature(cfg.stablePath, cfg.lazerDataPath);
  if (!forceRefresh && cachedLibrary && cachedLibrary.signature === sig) {
    return cachedLibrary;
  }
  rhythmCacheByKey.clear();
  cachedLibrary = buildLocalBooksData();
  return cachedLibrary;
}

export function getBooksLibrary(forceRefresh = false): BooksLibraryResponse {
  return ensureBooksCache(forceRefresh).response;
}

export function getBookDetail(bookKey: string): BookDetail | null {
  const cache = ensureBooksCache(false);
  return cache.detailsByKey.get(bookKey) ?? null;
}

function normRelName(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function resolveFileInStableDir(dirPath: string, relFile: string): string | null {
  if (!dirPath || !relFile) return null;
  const clean = relFile.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) return null;
  const base = path.resolve(dirPath);
  const direct = path.resolve(base, clean);
  if (direct.startsWith(base + path.sep) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }
  // Fallback case-insensitive match in root
  try {
    const targetLower = path.basename(clean).toLowerCase();
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase() === targetLower) {
        return path.join(base, entry.name);
      }
    }
  } catch {
    // Ignore dir read failure
  }
  return null;
}

function detectImageMimeFromFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(12);
      const n = fs.readSync(fd, buf, 0, 12, 0);
      if (n >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return 'image/png';
      }
      if (n >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
      }
      if (n >= 3 && buf.subarray(0, 3).toString('ascii') === 'GIF') {
        return 'image/gif';
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Fallback to jpeg
  }
  return 'image/jpeg';
}

function detectAudioMimeFromFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(12);
      const n = fs.readSync(fd, buf, 0, 12, 0);
      if (n >= 4 && buf.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
      if (n >= 4 && buf.subarray(0, 4).toString('ascii') === 'fLaC') return 'audio/flac';
      if (n >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Fallback to mpeg
  }
  return 'audio/mpeg';
}

export async function serveBookCover(bookKey: string, res: Response): Promise<void> {
  const cache = ensureBooksCache(false);
  const media = cache.mediaByKey.get(bookKey);
  if (!media) {
    res.status(404).end();
    return;
  }

  for (const fp of media.lazerBgPaths) {
    if (fs.existsSync(fp)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.type(detectImageMimeFromFile(fp)).sendFile(fp);
      return;
    }
  }

  if (media.stableDir) {
    if (media.stableBgFiles.length === 0 && media.stableOsuFiles.length > 0) {
      for (const osuFile of media.stableOsuFiles) {
        const bg = extractBgFromOsuHeader(media.stableDir, osuFile);
        if (bg && !media.stableBgFiles.includes(bg)) {
          media.stableBgFiles.push(bg);
        }
      }
    }
    for (const rel of media.stableBgFiles) {
      const fp = resolveFileInStableDir(media.stableDir, rel);
      if (fp) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.type(detectImageMimeFromFile(fp)).sendFile(fp);
        return;
      }
    }
    // Fallback: pick first image file inside Stable folder
    try {
      for (const entry of fs.readdirSync(media.stableDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') {
          const fp = path.join(media.stableDir, entry.name);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.type(detectImageMimeFromFile(fp)).sendFile(fp);
          return;
        }
      }
    } catch {
      // Ignore folder scan fallback
    }
  }

  if (media.beatmapsetId && media.beatmapsetId > 0) {
    await serveCover(media.beatmapsetId, res);
    return;
  }

  // Fallback architectural SVG cover so local-only maps without background never trigger 404
  const detail = cache.detailsByKey.get(bookKey);
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const titleText = esc((detail?.titleUnicode || detail?.title || 'LOCAL ARCHIVE').slice(0, 40));
  const artistText = esc((detail?.artistUnicode || detail?.artist || 'OSU! REPOSITORY').slice(0, 44));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e7e1d8"/><stop offset="100%" stop-color="#d7cfc4"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><rect x="34" y="34" width="732" height="382" fill="none" stroke="#a69f92" stroke-width="1.5"/><rect x="34" y="34" width="10" height="382" fill="#a67d48"/><text x="68" y="88" font-family="monospace" font-size="18" font-weight="700" fill="#6f6c64" letter-spacing="3">LOCAL ARCHIVE // SPECIMEN</text><text x="68" y="220" font-family="sans-serif" font-size="34" font-weight="700" fill="#151713">${titleText}</text><text x="68" y="264" font-family="sans-serif" font-size="22" fill="#5b584f">${artistText}</text></svg>`;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('image/svg+xml').send(svg);
}

function streamAudioFileWithRange(
  filePath: string,
  mime: string,
  req: Request,
  res: Response,
): void {
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
}

export async function serveBookAudio(
  bookKey: string,
  req: Request,
  res: Response,
): Promise<void> {
  const cache = ensureBooksCache(false);
  const media = cache.mediaByKey.get(bookKey);
  if (!media) {
    res.status(404).end();
    return;
  }

  if (media.stableDir) {
    for (const rel of media.stableAudioFiles) {
      const fp = resolveFileInStableDir(media.stableDir, rel);
      if (fp) {
        const ext = path.extname(fp).toLowerCase();
        streamAudioFileWithRange(fp, MIME_BY_EXT[ext] || 'audio/mpeg', req, res);
        return;
      }
    }
    for (const osuFile of media.stableOsuFiles) {
      const parsed = parseLightweightOsuHeader(path.join(media.stableDir, osuFile));
      if (parsed?.audioFile) {
        const fp = resolveFileInStableDir(media.stableDir, parsed.audioFile);
        if (fp) {
          const ext = path.extname(fp).toLowerCase();
          streamAudioFileWithRange(fp, MIME_BY_EXT[ext] || 'audio/mpeg', req, res);
          return;
        }
      }
    }
  }

  for (const fp of media.lazerAudioPaths) {
    if (fs.existsSync(fp)) {
      streamAudioFileWithRange(fp, detectAudioMimeFromFile(fp), req, res);
      return;
    }
  }

  if (media.beatmapsetId && media.beatmapsetId > 0) {
    await servePreview(media.beatmapsetId, req, res);
    return;
  }

  res.status(404).json({ error: 'Local audio not found' });
}

interface ParsedRhythmInternal {
  audioFilename: string;
  previewTimeMs: number;
  timingPoints: BookTimingPoint[];
  kiaiRanges: BookKiaiRange[];
  hitTimes: number[];
  maxTimeMs: number;
  baseBpm: number;
}

function parseRhythmFromOsuText(rawText: string): ParsedRhythmInternal {
  const text = rawText.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);

  let section = '';
  let audioFilename = '';
  let previewTimeMs = 0;

  const timingPoints: BookTimingPoint[] = [];
  const rawTimingEvents: Array<{ timeMs: number; kiai: boolean }> = [];
  const hitTimes: number[] = [];
  let maxTimeMs = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }

    if (section === 'General') {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key === 'AudioFilename') audioFilename = val;
      else if (key === 'PreviewTime') {
        const pt = Number(val);
        if (Number.isFinite(pt) && pt > 0) previewTimeMs = Math.round(pt);
      }
      continue;
    }

    if (section === 'TimingPoints') {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const timeMs = Number(parts[0]);
      const beatLengthRaw = Number(parts[1]);
      if (!Number.isFinite(timeMs) || !Number.isFinite(beatLengthRaw)) continue;
      const meter = Math.min(16, Math.max(1, Number.parseInt(parts[2] ?? '4', 10) || 4));
      const uninherited = parts.length >= 7 ? parts[6].trim() === '1' : beatLengthRaw > 0;
      const effects = parts.length >= 8 ? Number.parseInt(parts[7] ?? '0', 10) || 0 : 0;
      rawTimingEvents.push({ timeMs, kiai: (effects & 1) !== 0 });

      if (uninherited && beatLengthRaw > 0) {
        const beatLengthMs = Math.min(10000, Math.max(30, beatLengthRaw));
        const bpm = Math.round((60000 / beatLengthMs) * 100) / 100;
        timingPoints.push({
          timeMs: Math.round(timeMs * 100) / 100,
          beatLengthMs: Math.round(beatLengthMs * 1000) / 1000,
          bpm,
          meter,
        });
      }
      if (timeMs > maxTimeMs) maxTimeMs = timeMs;
      continue;
    }

    if (section === 'HitObjects') {
      const parts = line.split(',');
      if (parts.length < 4) continue;
      const t = Number(parts[2]);
      if (!Number.isFinite(t)) continue;
      const clampedT = Math.max(0, t);
      hitTimes.push(clampedT);
      if (clampedT > maxTimeMs) maxTimeMs = clampedT;
    }
  }

  timingPoints.sort((a, b) => a.timeMs - b.timeMs);
  // Deduplicate identical-timestamp timing points, keeping the later entry
  const dedupedTiming: BookTimingPoint[] = [];
  for (const tp of timingPoints) {
    const prev = dedupedTiming[dedupedTiming.length - 1];
    if (prev && Math.abs(prev.timeMs - tp.timeMs) < 0.5) {
      dedupedTiming[dedupedTiming.length - 1] = tp;
    } else {
      dedupedTiming.push(tp);
    }
  }

  rawTimingEvents.sort((a, b) => a.timeMs - b.timeMs);
  const kiaiRanges: BookKiaiRange[] = [];
  let kiaiOpenStart: number | null = null;
  for (const ev of rawTimingEvents) {
    if (ev.kiai && kiaiOpenStart === null) {
      kiaiOpenStart = Math.max(0, Math.round(ev.timeMs));
    } else if (!ev.kiai && kiaiOpenStart !== null) {
      const endMs = Math.max(kiaiOpenStart, Math.round(ev.timeMs));
      if (endMs > kiaiOpenStart) {
        kiaiRanges.push({ startMs: kiaiOpenStart, endMs });
      }
      kiaiOpenStart = null;
    }
  }
  if (kiaiOpenStart !== null) {
    const fallbackEnd = Math.max(kiaiOpenStart + 5000, Math.round(maxTimeMs + 2000));
    kiaiRanges.push({ startMs: kiaiOpenStart, endMs: fallbackEnd });
  }

  let baseBpm = 120;
  if (dedupedTiming.length > 0) {
    let bestSpan = -1;
    const spanEnd = Math.max(maxTimeMs + 2000, dedupedTiming[dedupedTiming.length - 1].timeMs + 4000);
    for (let i = 0; i < dedupedTiming.length; i += 1) {
      const nextTime = i + 1 < dedupedTiming.length ? dedupedTiming[i + 1].timeMs : spanEnd;
      const span = Math.max(0, nextTime - dedupedTiming[i].timeMs);
      if (span > bestSpan) {
        bestSpan = span;
        baseBpm = dedupedTiming[i].bpm;
      }
    }
  }

  return {
    audioFilename,
    previewTimeMs,
    timingPoints: dedupedTiming,
    kiaiRanges,
    hitTimes,
    maxTimeMs,
    baseBpm,
  };
}

export function getBookRhythm(bookKey: string): BookRhythmData | null {
  const cache = ensureBooksCache(false);
  const cached = rhythmCacheByKey.get(bookKey);
  if (cached) return cached;

  const detail = cache.detailsByKey.get(bookKey);
  const media = cache.mediaByKey.get(bookKey);
  if (!detail) return null;

  const candidatePaths: string[] = [];
  if (media?.stableDir && fs.existsSync(media.stableDir)) {
    for (const rel of media.stableOsuFiles) {
      const fp = resolveFileInStableDir(media.stableDir, rel);
      if (fp && !candidatePaths.includes(fp)) candidatePaths.push(fp);
    }
    if (candidatePaths.length === 0) {
      try {
        for (const entry of fs.readdirSync(media.stableDir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.osu')) {
            candidatePaths.push(path.join(media.stableDir, entry.name));
            if (candidatePaths.length >= 3) break;
          }
        }
      } catch {
        // Ignore directory read error
      }
    }
  }

  if (media) {
    for (const lp of media.lazerOsuPaths) {
      if (candidatePaths.length >= 4) break;
      if (fs.existsSync(lp) && !candidatePaths.includes(lp)) {
        candidatePaths.push(lp);
      }
    }
  }

  let bestParsed: ParsedRhythmInternal | null = null;
  let bestScore = -1;
  const preferredAudioNames = new Set(
    (media?.stableAudioFiles ?? []).map((n) => n.toLowerCase()),
  );

  for (const fp of candidatePaths.slice(0, 3)) {
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      const parsed = parseRhythmFromOsuText(raw);
      const audioMatchBonus =
        parsed.audioFilename && preferredAudioNames.has(parsed.audioFilename.toLowerCase())
          ? 10000
          : 0;
      const score = audioMatchBonus + parsed.hitTimes.length + parsed.timingPoints.length * 10;
      if (score > bestScore) {
        bestScore = score;
        bestParsed = parsed;
      }
    } catch {
      // Ignore single .osu parse failure
    }
  }

  const BINS = 72;
  const densityProfile = new Array<number>(BINS).fill(0);

  if (bestParsed && (bestParsed.timingPoints.length > 0 || bestParsed.hitTimes.length > 0)) {
    const durationMs = Math.max(
      detail.lengthSec * 1000,
      bestParsed.maxTimeMs + 1000,
      10000,
    );
    for (const t of bestParsed.hitTimes) {
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor((t / durationMs) * BINS)));
      densityProfile[bin] += 1;
    }
    const maxBin = Math.max(1, ...densityProfile);
    for (let i = 0; i < BINS; i += 1) {
      densityProfile[i] = Math.round((densityProfile[i] / maxBin) * 1000) / 1000;
    }

    const fallbackBpm = detail.bpm > 0 ? detail.bpm : 120;
    const timingPoints =
      bestParsed.timingPoints.length > 0
        ? bestParsed.timingPoints
        : [
            {
              timeMs: 0,
              beatLengthMs: Math.round((60000 / fallbackBpm) * 1000) / 1000,
              bpm: fallbackBpm,
              meter: 4,
            },
          ];

    const result: BookRhythmData = {
      bookKey,
      baseBpm: bestParsed.timingPoints.length > 0 ? bestParsed.baseBpm : fallbackBpm,
      firstBeatMs: timingPoints[0].timeMs,
      previewTimeMs: bestParsed.previewTimeMs || detail.previewTimeMs || 0,
      timingPoints,
      kiaiRanges: bestParsed.kiaiRanges,
      densityProfile,
      hasExactTiming: bestParsed.timingPoints.length > 0,
    };
    rhythmCacheByKey.set(bookKey, result);
    return result;
  }

  const safeBpm = detail.bpm > 0 && Number.isFinite(detail.bpm) ? detail.bpm : 120;
  const beatMs = Math.round((60000 / safeBpm) * 1000) / 1000;
  const phaseOffset = detail.previewTimeMs > 0 ? Math.round((detail.previewTimeMs % beatMs) * 100) / 100 : 0;
  const fallback: BookRhythmData = {
    bookKey,
    baseBpm: safeBpm,
    firstBeatMs: phaseOffset,
    previewTimeMs: detail.previewTimeMs || 0,
    timingPoints: [
      {
        timeMs: phaseOffset,
        beatLengthMs: beatMs,
        bpm: safeBpm,
        meter: 4,
      },
    ],
    kiaiRanges: [],
    densityProfile,
    hasExactTiming: false,
  };
  rhythmCacheByKey.set(bookKey, fallback);
  return fallback;
}
