import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RealmBeatmapSetRow {
  key: number;
  onlineId: number;
  status: number;
  dateAdded: string | null;
  beatmapKeys: number[];
  fileUsageKeys: number[];
}

export interface RealmBeatmapRow {
  key: number;
  difficultyName: string;
  rulesetKey: number | null;
  difficultyKey: number | null;
  metadataKey: number | null;
  beatmapSetKey: number | null;
  status: number;
  onlineId: number;
  lengthMs: number;
  bpm: number;
  starRating: number;
  md5Hash: string;
  endTimeObjectCount: number;
  totalObjectCount: number;
  lastPlayed: string | null;
  hidden: boolean;
}

export interface RealmMetadataRow {
  key: number;
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  authorKey: number | null;
  source: string;
  tags: string;
  previewTime: number;
  audioFile: string;
  backgroundFile: string;
}

export interface RealmDifficultyRow {
  key: number;
  drainRate: number;
  circleSize: number;
  overallDifficulty: number;
  approachRate: number;
}

export interface RealmScoreRow {
  key: number;
  beatmapKey: number | null;
  beatmapHash: string;
  rulesetKey: number | null;
  userKey: number | null;
  totalScore: number;
  legacyTotalScore: number | null;
  maxCombo: number;
  accuracy: number;
  date: string | null;
  pp: number | null;
  modsJson: string;
  statisticsJson: string;
  rank: number;
  isLegacyScore: boolean;
}

export interface LazerRealmSnapshot {
  loaded: boolean;
  sets: RealmBeatmapSetRow[];
  beatmaps: Map<number, RealmBeatmapRow>;
  metadata: Map<number, RealmMetadataRow>;
  difficulties: Map<number, RealmDifficultyRow>;
  rulesets: Map<number, { shortName: string; modeInt: number }>;
  users: Map<number, string>;
  fileUsages: Map<number, { filename: string; hash: string }>;
  scores: RealmScoreRow[];
}

interface NodeHeader {
  ref: number;
  isInner: boolean;
  hasRefs: boolean;
  ctxFlag: boolean;
  wtype: number;
  width: number;
  size: number;
  dataOff: number;
}

function readRealmBuffer(realmPath: string): Buffer | null {
  if (!fs.existsSync(realmPath)) return null;
  try {
    return fs.readFileSync(realmPath);
  } catch {
    const tmpCopy = path.join(
      os.tmpdir(),
      `osu-book-realm-${Date.now()}-${Math.random().toString(36).slice(2)}.realm`,
    );
    try {
      fs.copyFileSync(realmPath, tmpCopy);
      return fs.readFileSync(tmpCopy);
    } catch {
      return null;
    } finally {
      try {
        if (fs.existsSync(tmpCopy)) fs.unlinkSync(tmpCopy);
      } catch {
        // Ignore temp cleanup errors
      }
    }
  }
}

function rulesetShortNameToMode(shortName: string): number {
  const s = shortName.toLowerCase();
  if (s === 'osu') return 0;
  if (s === 'taiko') return 1;
  if (s === 'fruits' || s === 'catch') return 2;
  if (s === 'mania') return 3;
  return 0;
}

export function readLazerRealmData(lazerDataPath: string): LazerRealmSnapshot {
  const empty: LazerRealmSnapshot = {
    loaded: false,
    sets: [],
    beatmaps: new Map(),
    metadata: new Map(),
    difficulties: new Map(),
    rulesets: new Map(),
    users: new Map(),
    fileUsages: new Map(),
    scores: [],
  };

  if (!lazerDataPath) return empty;
  const realmPath = path.join(lazerDataPath, 'client.realm');
  const buf = readRealmBuffer(realmPath);
  if (!buf || buf.length < 32) return empty;

  // Verify T-DB magic header
  if (buf.subarray(16, 20).toString('ascii') !== 'T-DB') {
    return empty;
  }

  const hdr = (ref: number): NodeHeader | null => {
    if (!ref || ref < 24 || ref + 8 > buf.length || (ref & 1) !== 0) return null;
    if (
      buf[ref] !== 0x41 ||
      buf[ref + 1] !== 0x41 ||
      buf[ref + 2] !== 0x41 ||
      buf[ref + 3] !== 0x41
    ) {
      return null;
    }
    const h = buf[ref + 4];
    const isInner = (h & 0x80) !== 0;
    const hasRefs = (h & 0x40) !== 0;
    const ctxFlag = (h & 0x20) !== 0;
    const wtype = (h >> 3) & 0x03;
    const wexp = h & 0x07;
    const width = wtype === 2 ? 1 : wexp === 0 ? 0 : 1 << (wexp - 1);
    const size = (buf[ref + 5] << 16) | (buf[ref + 6] << 8) | buf[ref + 7];
    return { ref, isInner, hasRefs, ctxFlag, wtype, width, size, dataOff: ref + 8 };
  };

  const getUInt = (n: NodeHeader | null, i: number): number => {
    if (!n || n.width === 0 || i < 0 || i >= n.size) return 0;
    if (n.wtype === 0 && n.width < 8) {
      const bp = i * n.width;
      const byteOff = n.dataOff + (bp >> 3);
      if (byteOff >= buf.length) return 0;
      return (buf[byteOff] >> (bp & 7)) & ((1 << n.width) - 1);
    }
    const stride = n.wtype === 0 ? n.width >> 3 : n.width;
    const off = n.dataOff + i * stride;
    if (off + stride > buf.length) return 0;
    if (stride === 1) return buf.readUInt8(off);
    if (stride === 2) return buf.readUInt16LE(off);
    if (stride === 4) return buf.readUInt32LE(off);
    if (stride === 8) return Number(buf.readBigUInt64LE(off));
    return 0;
  };

  const getSInt = (n: NodeHeader | null, i: number): number => {
    if (!n || n.width === 0 || i < 0 || i >= n.size) return 0;
    if (n.wtype === 0 && n.width < 8) {
      const bp = i * n.width;
      const byteOff = n.dataOff + (bp >> 3);
      if (byteOff >= buf.length) return 0;
      return (buf[byteOff] >> (bp & 7)) & ((1 << n.width) - 1);
    }
    const stride = n.wtype === 0 ? n.width >> 3 : n.width;
    const off = n.dataOff + i * stride;
    if (off + stride > buf.length) return 0;
    if (stride === 1) return buf.readInt8(off);
    if (stride === 2) return buf.readInt16LE(off);
    if (stride === 4) return buf.readInt32LE(off);
    if (stride === 8) return Number(buf.readBigInt64LE(off));
    return 0;
  };

  const getBigInt = (n: NodeHeader | null, i: number, unsigned = false): bigint => {
    if (!n || n.width === 0 || i < 0 || i >= n.size) return 0n;
    const stride = n.wtype === 0 ? n.width >> 3 : n.width;
    if (stride === 8) {
      const off = n.dataOff + i * 8;
      if (off + 8 > buf.length) return 0n;
      return unsigned || n.hasRefs ? buf.readBigUInt64LE(off) : buf.readBigInt64LE(off);
    }
    return BigInt(unsigned ? getUInt(n, i) : getSInt(n, i));
  };

  const readStrings = (ref: number): Array<string | null> => {
    const n = hdr(ref);
    if (!n) return [];
    if (n.wtype === 1 && !n.hasRefs) {
      const out: Array<string | null> = [];
      for (let i = 0; i < n.size; i++) {
        const start = n.dataOff + i * n.width;
        if (start + n.width > buf.length) {
          out.push(null);
          continue;
        }
        const last = buf[start + n.width - 1];
        if (last === n.width) {
          out.push(null);
          continue;
        }
        const len = n.width - 1 - last;
        if (len >= 0 && len < n.width) {
          out.push(buf.subarray(start, start + len).toString('utf8'));
        } else {
          const s = buf.subarray(start, start + n.width);
          const z = s.indexOf(0);
          out.push(s.subarray(0, z >= 0 ? z : n.width).toString('utf8'));
        }
      }
      return out;
    }
    if (n.hasRefs && !n.ctxFlag && n.size >= 2 && n.size <= 3) {
      const offsets = hdr(getUInt(n, 0));
      const blobs = hdr(getUInt(n, 1));
      const nulls = n.size === 3 && getUInt(n, 2) ? hdr(getUInt(n, 2)) : null;
      if (!offsets || !blobs) return [];
      const out: Array<string | null> = [];
      let prev = 0;
      for (let i = 0; i < offsets.size; i++) {
        const end = getUInt(offsets, i);
        if (nulls && getUInt(nulls, i)) {
          out.push(null);
        } else if (end > prev && blobs.dataOff + end - 1 <= buf.length) {
          out.push(buf.subarray(blobs.dataOff + prev, blobs.dataOff + end - 1).toString('utf8'));
        } else {
          out.push('');
        }
        prev = end;
      }
      return out;
    }
    if (n.hasRefs && n.ctxFlag) {
      const out: Array<string | null> = [];
      for (let i = 0; i < n.size; i++) {
        const bref = getUInt(n, i);
        const bn = bref ? hdr(bref) : null;
        if (!bn || bn.dataOff + Math.max(0, bn.size - 1) > buf.length) {
          out.push(null);
        } else {
          out.push(buf.subarray(bn.dataOff, bn.dataOff + Math.max(0, bn.size - 1)).toString('utf8'));
        }
      }
      return out;
    }
    return [];
  };

  const readCol = (colRef: number, colType: number, colAttr: number, nrows: number): unknown[] => {
    const isNullable = (colAttr & 16) !== 0;
    const isList = (colAttr & 32) !== 0;
    if (!colRef) return new Array(nrows).fill(null);

    if (isList) {
      const arr = hdr(colRef);
      if (!arr) return new Array(nrows).fill([]);
      const out: number[][] = [];
      for (let i = 0; i < nrows; i++) {
        const subRef = getUInt(arr, i);
        const sub = subRef ? hdr(subRef) : null;
        if (!sub) {
          out.push([]);
          continue;
        }
        const items: number[] = [];
        const walkList = (node: NodeHeader | null) => {
          if (!node) return;
          if (node.isInner) {
            for (let c = 3; c < node.size; c++) {
              walkList(hdr(getUInt(node, c)));
            }
          } else {
            for (let j = 0; j < node.size; j++) {
              items.push(getUInt(node, j));
            }
          }
        };
        walkList(sub);
        out.push(items);
      }
      return out;
    }

    if (colType === 2) {
      return readStrings(colRef);
    }

    if (colType === 12) {
      const n = hdr(colRef);
      if (!n) return new Array(nrows).fill(null);
      const out: Array<number | null> = [];
      for (let i = 0; i < nrows; i++) {
        const v = getUInt(n, i);
        out.push(v === 0 ? null : v - 1);
      }
      return out;
    }

    if (colType === 0 || colType === 1) {
      const n = hdr(colRef);
      if (!n) return new Array(nrows).fill(null);
      if (isNullable && n.size === nrows + 1) {
        const nullVal = getBigInt(n, 0, colType === 1);
        const out: Array<number | boolean | null> = [];
        for (let i = 0; i < nrows; i++) {
          const v = getBigInt(n, i + 1, colType === 1);
          out.push(v === nullVal ? null : colType === 1 ? v !== 0n : Number(v));
        }
        return out;
      }
      const out: Array<number | boolean | null> = [];
      for (let i = 0; i < nrows; i++) {
        if (colType === 1) {
          out.push(getUInt(n, i) !== 0);
        } else {
          out.push(getSInt(n, i));
        }
      }
      return out;
    }

    if (colType === 9 || colType === 10) {
      const n = hdr(colRef);
      if (!n) return new Array(nrows).fill(null);
      const stride = colType === 9 ? 4 : 8;
      const out: Array<number | null> = [];
      for (let i = 0; i < nrows; i++) {
        const off = n.dataOff + i * stride;
        if (off + stride > buf.length) {
          out.push(null);
          continue;
        }
        const v = colType === 9 ? buf.readFloatLE(off) : buf.readDoubleLE(off);
        out.push(Number.isFinite(v) ? v : null);
      }
      return out;
    }

    if (colType === 8) {
      const n = hdr(colRef);
      if (!n || n.size < 2) return new Array(nrows).fill(null);
      const secNode = hdr(getUInt(n, 0));
      if (!secNode) return new Array(nrows).fill(null);
      const hasNull = secNode.size === nrows + 1;
      const nullVal = hasNull ? getBigInt(secNode, 0) : null;
      const out: Array<string | null> = [];
      for (let i = 0; i < nrows; i++) {
        const v = getBigInt(secNode, hasNull ? i + 1 : i);
        if (hasNull && v === nullVal) {
          out.push(null);
        } else {
          const ms = Number(v) * 1000;
          out.push(Number.isFinite(ms) ? new Date(ms).toISOString() : null);
        }
      }
      return out;
    }

    return new Array(nrows).fill(null);
  };

  try {
    const flags = buf[23];
    const topRef = Number((flags & 1) === 0 ? buf.readBigUInt64LE(0) : buf.readBigUInt64LE(8));
    const top = hdr(topRef);
    if (!top) return empty;

    const tableNames = readStrings(getUInt(top, 0));
    const tablesNode = hdr(getUInt(top, 1));
    if (!tablesNode) return empty;

    const readTable = (tableName: string, wantCols?: Set<string>): Map<number, Record<string, unknown>> => {
      const idx = tableNames.indexOf(tableName);
      if (idx < 0) return new Map();
      const t = hdr(getUInt(tablesNode, idx));
      if (!t || t.size < 3) return new Map();
      const spec = hdr(getUInt(t, 0));
      if (!spec || spec.size < 6) return new Map();

      const colTypes = hdr(getUInt(spec, 0));
      const colNames = readStrings(getUInt(spec, 1));
      const colAttrs = hdr(getUInt(spec, 2));
      const colKeys = hdr(getUInt(spec, 5));
      if (!colTypes || !colAttrs || !colKeys) return new Map();

      const colMeta: Array<{ name: string; type: number; attr: number; leafSlot: number }> = [];
      for (let i = 0; i < colNames.length; i++) {
        const name = colNames[i];
        if (!name) continue;
        if (wantCols && !wantCols.has(name)) continue;
        const stride = colKeys.wtype === 0 ? colKeys.width >> 3 : colKeys.width;
        const off = colKeys.dataOff + i * stride;
        const ck = stride === 8 ? buf.readBigInt64LE(off) : BigInt(getUInt(colKeys, i));
        const leafColIdx = Number(ck & 0xffffn);
        colMeta.push({
          name,
          type: getUInt(colTypes, i),
          attr: getUInt(colAttrs, i),
          leafSlot: 1 + leafColIdx,
        });
      }

      const rows = new Map<number, Record<string, unknown>>();
      const walk = (ref: number, keyOffset: number) => {
        const c = hdr(ref);
        if (!c) return;
        if (c.isInner) {
          const keysArr = getUInt(c, 0) ? hdr(getUInt(c, 0)) : null;
          for (let i = 0; i < c.size - 3; i++) {
            const childOff = keysArr && i < keysArr.size ? keyOffset + getUInt(keysArr, i) : keyOffset;
            walk(getUInt(c, 3 + i), childOff);
          }
          return;
        }
        const k0 = getUInt(c, 0);
        const keys: number[] = [];
        if ((k0 & 1) === 1) {
          const nr = k0 >> 1;
          for (let i = 0; i < nr; i++) keys.push(keyOffset + i);
        } else if (k0) {
          const kn = hdr(k0);
          if (kn) {
            for (let i = 0; i < kn.size; i++) keys.push(keyOffset + getUInt(kn, i));
          }
        }
        if (keys.length === 0) return;
        const cols: Record<string, unknown[]> = {};
        for (const cm of colMeta) {
          if (cm.leafSlot < c.size) {
            cols[cm.name] = readCol(getUInt(c, cm.leafSlot), cm.type, cm.attr, keys.length);
          }
        }
        for (let r = 0; r < keys.length; r++) {
          const obj: Record<string, unknown> = { _key: keys[r] };
          for (const cm of colMeta) {
            obj[cm.name] = cols[cm.name]?.[r];
          }
          rows.set(keys[r], obj);
        }
      };

      walk(getUInt(t, 2), 0);
      return rows;
    };

    const rawRulesets = readTable(
      'class_Ruleset',
      new Set(['ShortName', 'OnlineID']),
    );
    const rulesets = new Map<number, { shortName: string; modeInt: number }>();
    for (const [key, r] of rawRulesets) {
      const shortName = String(r.ShortName || 'osu');
      rulesets.set(key, { shortName, modeInt: rulesetShortNameToMode(shortName) });
    }

    const rawUsers = readTable('class_RealmUser', new Set(['Username']));
    const users = new Map<number, string>();
    for (const [key, u] of rawUsers) {
      if (u.Username) users.set(key, String(u.Username));
    }

    const rawFiles = readTable('class_File', new Set(['Hash']));
    const filesMap = new Map<number, string>();
    for (const [key, f] of rawFiles) {
      if (typeof f.Hash === 'string' && f.Hash.length >= 64) {
        filesMap.set(key, f.Hash.toLowerCase());
      }
    }

    const rawUsages = readTable('class_RealmNamedFileUsage', new Set(['File', 'Filename']));
    const fileUsages = new Map<number, { filename: string; hash: string }>();
    for (const [key, u] of rawUsages) {
      const fileKey = typeof u.File === 'number' ? u.File : null;
      const hash = fileKey !== null ? filesMap.get(fileKey) : undefined;
      const filename = typeof u.Filename === 'string' ? u.Filename : '';
      if (hash && filename) {
        fileUsages.set(key, { filename, hash });
      }
    }

    const rawMetas = readTable(
      'class_BeatmapMetadata',
      new Set([
        'Title',
        'TitleUnicode',
        'Artist',
        'ArtistUnicode',
        'Author',
        'Source',
        'Tags',
        'PreviewTime',
        'AudioFile',
        'BackgroundFile',
      ]),
    );
    const metadata = new Map<number, RealmMetadataRow>();
    for (const [key, m] of rawMetas) {
      metadata.set(key, {
        key,
        title: String(m.Title || m.TitleUnicode || ''),
        titleUnicode: String(m.TitleUnicode || m.Title || ''),
        artist: String(m.Artist || m.ArtistUnicode || ''),
        artistUnicode: String(m.ArtistUnicode || m.Artist || ''),
        authorKey: typeof m.Author === 'number' ? m.Author : null,
        source: String(m.Source || ''),
        tags: String(m.Tags || ''),
        previewTime: typeof m.PreviewTime === 'number' ? m.PreviewTime : 0,
        audioFile: String(m.AudioFile || ''),
        backgroundFile: String(m.BackgroundFile || ''),
      });
    }

    const rawDiffs = readTable(
      'class_BeatmapDifficulty',
      new Set(['DrainRate', 'CircleSize', 'OverallDifficulty', 'ApproachRate']),
    );
    const difficulties = new Map<number, RealmDifficultyRow>();
    for (const [key, d] of rawDiffs) {
      difficulties.set(key, {
        key,
        drainRate: typeof d.DrainRate === 'number' ? d.DrainRate : 5,
        circleSize: typeof d.CircleSize === 'number' ? d.CircleSize : 4,
        overallDifficulty: typeof d.OverallDifficulty === 'number' ? d.OverallDifficulty : 7,
        approachRate: typeof d.ApproachRate === 'number' ? d.ApproachRate : 5,
      });
    }

    const rawSets = readTable(
      'class_BeatmapSet',
      new Set(['OnlineID', 'DateAdded', 'Beatmaps', 'Files', 'Status', 'DeletePending']),
    );
    const sets: RealmBeatmapSetRow[] = [];
    for (const [key, s] of rawSets) {
      if (s.DeletePending) continue;
      sets.push({
        key,
        onlineId: typeof s.OnlineID === 'number' ? s.OnlineID : -1,
        status: typeof s.Status === 'number' ? s.Status : -3,
        dateAdded: typeof s.DateAdded === 'string' ? s.DateAdded : null,
        beatmapKeys: Array.isArray(s.Beatmaps) ? (s.Beatmaps as number[]) : [],
        fileUsageKeys: Array.isArray(s.Files) ? (s.Files as number[]) : [],
      });
    }

    const rawBeatmaps = readTable(
      'class_Beatmap',
      new Set([
        'DifficultyName',
        'Ruleset',
        'Difficulty',
        'Metadata',
        'BeatmapSet',
        'Status',
        'OnlineID',
        'Length',
        'BPM',
        'StarRating',
        'MD5Hash',
        'EndTimeObjectCount',
        'TotalObjectCount',
        'LastPlayed',
        'Hidden',
      ]),
    );
    const beatmaps = new Map<number, RealmBeatmapRow>();
    for (const [key, b] of rawBeatmaps) {
      beatmaps.set(key, {
        key,
        difficultyName: String(b.DifficultyName || 'Normal'),
        rulesetKey: typeof b.Ruleset === 'number' ? b.Ruleset : null,
        difficultyKey: typeof b.Difficulty === 'number' ? b.Difficulty : null,
        metadataKey: typeof b.Metadata === 'number' ? b.Metadata : null,
        beatmapSetKey: typeof b.BeatmapSet === 'number' ? b.BeatmapSet : null,
        status: typeof b.Status === 'number' ? b.Status : -3,
        onlineId: typeof b.OnlineID === 'number' ? b.OnlineID : -1,
        lengthMs: typeof b.Length === 'number' ? b.Length : 0,
        bpm: typeof b.BPM === 'number' ? b.BPM : 120,
        starRating: typeof b.StarRating === 'number' ? b.StarRating : 0,
        md5Hash: String(b.MD5Hash || '').toLowerCase(),
        endTimeObjectCount: typeof b.EndTimeObjectCount === 'number' ? b.EndTimeObjectCount : 0,
        totalObjectCount: typeof b.TotalObjectCount === 'number' ? b.TotalObjectCount : 0,
        lastPlayed: typeof b.LastPlayed === 'string' ? b.LastPlayed : null,
        hidden: Boolean(b.Hidden),
      });
    }

    const rawScores = readTable(
      'class_Score',
      new Set([
        'BeatmapInfo',
        'BeatmapHash',
        'Ruleset',
        'DeletePending',
        'TotalScore',
        'LegacyTotalScore',
        'MaxCombo',
        'Accuracy',
        'Date',
        'PP',
        'User',
        'Mods',
        'Statistics',
        'Rank',
        'IsLegacyScore',
      ]),
    );
    const scores: RealmScoreRow[] = [];
    for (const [key, sc] of rawScores) {
      if (sc.DeletePending) continue;
      scores.push({
        key,
        beatmapKey: typeof sc.BeatmapInfo === 'number' ? sc.BeatmapInfo : null,
        beatmapHash: String(sc.BeatmapHash || '').toLowerCase(),
        rulesetKey: typeof sc.Ruleset === 'number' ? sc.Ruleset : null,
        userKey: typeof sc.User === 'number' ? sc.User : null,
        totalScore: typeof sc.TotalScore === 'number' ? sc.TotalScore : 0,
        legacyTotalScore: typeof sc.LegacyTotalScore === 'number' ? sc.LegacyTotalScore : null,
        maxCombo: typeof sc.MaxCombo === 'number' ? sc.MaxCombo : 0,
        accuracy: typeof sc.Accuracy === 'number' ? sc.Accuracy : 0,
        date: typeof sc.Date === 'string' ? sc.Date : null,
        pp: typeof sc.PP === 'number' && Number.isFinite(sc.PP) ? sc.PP : null,
        modsJson: typeof sc.Mods === 'string' ? sc.Mods : '',
        statisticsJson: typeof sc.Statistics === 'string' ? sc.Statistics : '',
        rank: typeof sc.Rank === 'number' ? sc.Rank : 0,
        isLegacyScore: Boolean(sc.IsLegacyScore),
      });
    }

    return {
      loaded: true,
      sets,
      beatmaps,
      metadata,
      difficulties,
      rulesets,
      users,
      fileUsages,
      scores,
    };
  } catch {
    return empty;
  }
}
