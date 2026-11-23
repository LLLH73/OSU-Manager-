import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Response } from 'express';
import { getConfig } from './config.js';
import { ManiaSkinAsset, ResolvedManiaSkin, SkinSummary, SkinsListResponse } from './types.js';

const BUILTIN_SKINS: SkinSummary[] = [
  {
    id: '__builtin_bar__',
    name: '内置 · 极简条形 (Bar)',
    author: 'osu! 4K Workshop',
    source: 'builtin',
    isActiveInStable: false,
    hasManiaConfig: true,
    supportedKeys: [4, 5, 6, 7, 8, 9, 10],
  },
  {
    id: '__builtin_circle__',
    name: '内置 · 霓虹圆珠 (Circle)',
    author: 'osu! 4K Workshop',
    source: 'builtin',
    isActiveInStable: false,
    hasManiaConfig: true,
    supportedKeys: [4, 5, 6, 7, 8, 9, 10],
  },
  {
    id: '__builtin_arrow__',
    name: '内置 · 炫彩箭头 (Arrow)',
    author: 'osu! 4K Workshop',
    source: 'builtin',
    isActiveInStable: false,
    hasManiaConfig: true,
    supportedKeys: [4, 5, 6, 7, 8, 9, 10],
  },
];

// IEEE 802.3 CRC32 table for PNG chunk rewriting
const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const CROPPED_PNG_CACHE = new Map<string, Buffer>();
const MAX_CROPPED_CACHE = 32;

export function cropPngTopRows(buf: Buffer, maxRows = 2048): Buffer {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    return buf;
  }

  let pos = 8;
  let ihdrData: Buffer | null = null;
  let plteData: Buffer | null = null;
  let trnsData: Buffer | null = null;
  const idats: Buffer[] = [];

  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) break;
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdrData = Buffer.from(data);
    else if (type === 'PLTE') plteData = Buffer.from(data);
    else if (type === 'tRNS') trnsData = Buffer.from(data);
    else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }

  if (!ihdrData || ihdrData.length < 13 || idats.length === 0) return buf;

  const width = ihdrData.readUInt32BE(0);
  const height = ihdrData.readUInt32BE(4);
  const bitDepth = ihdrData[8];
  const colorType = ihdrData[9];
  const interlace = ihdrData[12];

  if (height <= maxRows || interlace !== 0 || bitDepth !== 8) {
    return buf;
  }

  const channelsMap: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsMap[colorType];
  if (!channels) return buf;

  const stride = 1 + width * channels;
  const neededBytes = maxRows * stride;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  if (raw.length < neededBytes) return buf;

  const croppedRaw = raw.subarray(0, neededBytes);
  const compressed = zlib.deflateSync(croppedRaw);
  ihdrData.writeUInt32BE(maxRows, 4);

  const chunks: Buffer[] = [PNG_SIG, makePngChunk('IHDR', ihdrData)];
  if (plteData) chunks.push(makePngChunk('PLTE', plteData));
  if (trnsData) chunks.push(makePngChunk('tRNS', trnsData));
  chunks.push(makePngChunk('IDAT', compressed));
  chunks.push(makePngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function readImageDimensions(filePath: string): { width: number; height: number } {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(24);
      const read = fs.readSync(fd, buf, 0, 24, 0);
      if (read >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
        return {
          width: buf.readUInt32BE(16),
          height: buf.readUInt32BE(20),
        };
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Ignore unreadable dimensions
  }
  return { width: 128, height: 128 };
}

export function detectActiveStableSettings(stablePath: string): {
  activeSkin: string | null;
  maniaSpeed: number | null;
} {
  if (!stablePath || !fs.existsSync(stablePath)) {
    return { activeSkin: null, maniaSpeed: null };
  }
  try {
    const entries = fs.readdirSync(stablePath, { withFileTypes: true });
    const userCfgs = entries
      .filter(
        (e) =>
          e.isFile() &&
          /^osu!\..+\.cfg$/i.test(e.name) &&
          e.name.toLowerCase() !== 'osu!.cfg',
      )
      .map((e) => {
        const full = path.join(stablePath, e.name);
        return { full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (userCfgs.length === 0) return { activeSkin: null, maniaSpeed: null };
    const lines = fs.readFileSync(userCfgs[0].full, 'utf8').split(/\r?\n/);
    let activeSkin: string | null = null;
    let maniaSpeed: number | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      const mSkin = line.match(/^Skin\s*=\s*(.+)$/i);
      if (mSkin) activeSkin = mSkin[1].trim();
      const mSpeed = line.match(/^ManiaSpeed\s*=\s*(\d+)$/i);
      if (mSpeed) maniaSpeed = Number(mSpeed[1]) || null;
    }
    return { activeSkin, maniaSpeed };
  } catch {
    return { activeSkin: null, maniaSpeed: null };
  }
}

function stripIniComment(rawLine: string): string {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith('`') || trimmed.startsWith(';') || trimmed.startsWith('//')) {
    return '';
  }
  // Strip inline // comments while preserving http:// or https://
  let idx = trimmed.indexOf('//');
  while (idx !== -1) {
    if (idx > 0 && trimmed[idx - 1] === ':') {
      idx = trimmed.indexOf('//', idx + 2);
      continue;
    }
    return trimmed.slice(0, idx).trim();
  }
  return trimmed;
}

interface ParsedSkinIni {
  name: string;
  author: string;
  animationFramerate: number;
  maniaBlocks: Map<number, Record<string, string>>;
}

function parseSkinIniFile(skinDir: string): ParsedSkinIni {
  const iniPath = path.join(skinDir, 'skin.ini');
  const result: ParsedSkinIni = {
    name: path.basename(skinDir),
    author: '',
    animationFramerate: 60,
    maniaBlocks: new Map(),
  };
  if (!fs.existsSync(iniPath)) return result;

  try {
    const raw = fs.readFileSync(iniPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    let section = '';
    let currentMania: Record<string, string> | null = null;

    const commitManiaBlock = () => {
      if (!currentMania) return;
      const keysNum = Number.parseInt(currentMania['Keys'] ?? '', 10);
      if (Number.isFinite(keysNum) && keysNum >= 1 && keysNum <= 18 && !result.maniaBlocks.has(keysNum)) {
        result.maniaBlocks.set(keysNum, currentMania);
      }
      currentMania = null;
    };

    for (const rawLine of lines) {
      const line = stripIniComment(rawLine);
      if (!line) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        commitManiaBlock();
        section = line.slice(1, -1).trim().toLowerCase();
        if (section === 'mania') {
          currentMania = {};
        }
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (section === 'general') {
        if (key === 'Name' && val) result.name = val;
        else if (key === 'Author' && val) result.author = val;
        else if (key === 'AnimationFramerate') {
          const fps = Number(val);
          if (Number.isFinite(fps) && fps > 0) {
            result.animationFramerate = Math.min(120, Math.max(1, fps));
          }
        }
      } else if (section === 'mania' && currentMania) {
        currentMania[key] = val;
      }
    }
    commitManiaBlock();
  } catch {
    // Ignore malformed skin.ini
  }
  return result;
}

const SKIN_FILE_INDEX_CACHE = new Map<string, { expiresAt: number; map: Map<string, string> }>();

function getSkinFileMap(skinDir: string): Map<string, string> {
  const now = Date.now();
  const cached = SKIN_FILE_INDEX_CACHE.get(skinDir);
  if (cached && cached.expiresAt > now) {
    return cached.map;
  }

  const map = new Map<string, string>();
  const walk = (dir: string, relPrefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const nextRel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, nextRel);
      } else if (e.isFile()) {
        map.set(nextRel.toLowerCase(), nextRel);
      }
    }
  };
  walk(skinDir, '');
  SKIN_FILE_INDEX_CACHE.set(skinDir, { expiresAt: now + 30_000, map });
  return map;
}

export function listSkins(): SkinsListResponse {
  const cfg = getConfig();
  const { activeSkin, maniaSpeed } = detectActiveStableSettings(cfg.stablePath);
  const skinsRoot = path.join(cfg.stablePath, 'Skins');
  const localSkins: SkinSummary[] = [];

  if (fs.existsSync(skinsRoot)) {
    try {
      const entries = fs.readdirSync(skinsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullDir = path.join(skinsRoot, entry.name);
        const parsed = parseSkinIniFile(fullDir);
        const supportedKeys = Array.from(parsed.maniaBlocks.keys()).sort((a, b) => a - b);
        const isActive = Boolean(
          activeSkin && entry.name.toLowerCase() === activeSkin.toLowerCase(),
        );
        localSkins.push({
          id: entry.name,
          name: parsed.name || entry.name,
          author: parsed.author || '',
          source: 'local',
          isActiveInStable: isActive,
          hasManiaConfig: supportedKeys.length > 0,
          supportedKeys,
        });
      }
    } catch {
      // Ignore unreadable skins root
    }
  }

  localSkins.sort((a, b) => {
    if (a.isActiveInStable !== b.isActiveInStable) return a.isActiveInStable ? -1 : 1;
    if (a.hasManiaConfig !== b.hasManiaConfig) return a.hasManiaConfig ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const activeLocal = localSkins.filter((s) => s.isActiveInStable);
  const otherLocal = localSkins.filter((s) => !s.isActiveInStable);

  return {
    activeStableSkin: activeSkin,
    stableManiaSpeed: maniaSpeed,
    skins: [...activeLocal, ...BUILTIN_SKINS, ...otherLocal],
  };
}

function defaultColumnSlots(keys: number): string[] {
  if (keys === 4) return ['1', '2', '2', '1'];
  if (keys === 5) return ['1', '2', 'S', '2', '1'];
  if (keys === 6) return ['1', '2', '1', '1', '2', '1'];
  if (keys === 7) return ['1', '2', '1', 'S', '1', '2', '1'];
  if (keys === 8) return ['S', '1', '2', '1', '1', '2', '1', 'S'];
  const slots: string[] = [];
  const mid = Math.floor(keys / 2);
  for (let i = 0; i < keys; i++) {
    if (keys % 2 === 1 && i === mid) {
      slots.push('S');
    } else {
      const dist = i < mid ? mid - 1 - i : i - (keys % 2 === 1 ? mid + 1 : mid);
      slots.push(dist % 2 === 0 ? '2' : '1');
    }
  }
  return slots;
}

function parseNumberList(raw: string | undefined, length: number, fallbackVal: number): number[] {
  const out = new Array<number>(length).fill(fallbackVal);
  if (!raw) return out;
  const parts = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  for (let i = 0; i < Math.min(length, parts.length); i++) {
    out[i] = parts[i];
  }
  return out;
}

function parseRgba(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const nums = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 3) return fallback;
  const r = Math.min(255, Math.max(0, Math.round(nums[0])));
  const g = Math.min(255, Math.max(0, Math.round(nums[1])));
  const b = Math.min(255, Math.max(0, Math.round(nums[2])));
  const a = nums.length >= 4 ? Math.min(1, Math.max(0, nums[3] / 255)) : 1;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function buildBuiltinSkin(skinId: string, keys: number): ResolvedManiaSkin {
  const style: 'bar' | 'circle' | 'arrow' =
    skinId === '__builtin_circle__'
      ? 'circle'
      : skinId === '__builtin_arrow__'
        ? 'arrow'
        : 'bar';

  const nameMap = {
    bar: '内置 · 极简条形 (Bar)',
    circle: '内置 · 霓虹圆珠 (Circle)',
    arrow: '内置 · 炫彩箭头 (Arrow)',
  };

  const slots = defaultColumnSlots(keys);
  const colours = slots.map((slot) =>
    slot === 'S'
      ? 'rgba(251, 191, 36, 0.92)'
      : slot === '2'
        ? style === 'arrow'
          ? 'rgba(56, 189, 248, 0.95)'
          : 'rgba(255, 102, 170, 0.95)'
        : 'rgba(241, 245, 249, 0.95)',
  );
  const colourLights = slots.map((slot) =>
    slot === 'S'
      ? 'rgba(251, 191, 36, 0.55)'
      : slot === '2'
        ? 'rgba(56, 189, 248, 0.55)'
        : 'rgba(255, 102, 170, 0.55)',
  );

  return {
    skinId,
    name: nameMap[style],
    source: 'builtin',
    builtinStyle: style,
    keys,
    animationFramerate: 60,
    lightFramePerSecond: 60,
    columnStart: 180,
    columnWidth: new Array<number>(keys).fill(style === 'circle' ? 46 : 44),
    columnSpacing: new Array<number>(Math.max(0, keys - 1)).fill(0),
    columnLineWidth: [2, ...new Array<number>(Math.max(0, keys - 1)).fill(1), 2],
    hitPosition: 412,
    lightPosition: 414,
    widthForNoteHeightScale: 0,
    lightingNWidth: new Array<number>(keys).fill(0),
    lightingLWidth: new Array<number>(keys).fill(0),
    upsideDown: false,
    keysUnderNotes: false,
    noteBodyStyle: 0,
    barlineHeight: 1.5,
    colours,
    colourLights,
    colourBarline: 'rgba(255, 255, 255, 0.45)',
    colourColumnLine: 'rgba(255, 255, 255, 0.16)',
    colourHold: 'rgba(251, 191, 36, 0.95)',
    assets: {
      keys: new Array(keys).fill(null),
      keysDown: new Array(keys).fill(null),
      notes: new Array(keys).fill(null),
      noteHeads: new Array(keys).fill(null),
      noteBodies: new Array(keys).fill(null),
      noteTails: new Array(keys).fill(null),
      stageLeft: null,
      stageRight: null,
      stageBottom: null,
      stageHint: null,
      stageLight: null,
      lightingN: null,
      lightingL: null,
    },
  };
}

function buildAssetUrl(skinId: string, relPath: string): string {
  return `/api/skins/${encodeURIComponent(skinId)}/asset?file=${encodeURIComponent(relPath)}`;
}

function resolveSkinAsset(
  skinId: string,
  skinDir: string,
  fileMap: Map<string, string>,
  candidates: string[],
  allowAnimation = false,
): ManiaSkinAsset | null {
  for (let idx = 0; idx < candidates.length; idx++) {
    const rawCand = candidates[idx];
    if (!rawCand) continue;
    const clean = rawCand.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!clean || clean.includes('..')) continue;
    if (idx === 0 && clean.toLowerCase() === '_blank') {
      return null;
    }

    const hasExt = /\.(png|jpe?g)$/i.test(clean);
    const stem = hasExt ? clean.replace(/\.(png|jpe?g)$/i, '') : clean;

    if (allowAnimation && !hasExt) {
      // Check @2x animation frame sequence first, then @1x animation sequence
      for (const suffix of ['@2x.png', '.png']) {
        const firstRel = fileMap.get(`${stem}-0${suffix}`.toLowerCase());
        if (!firstRel) continue;
        const firstFull = path.join(skinDir, firstRel);
        if (!fs.existsSync(firstFull)) continue;
        const frames: string[] = [buildAssetUrl(skinId, firstRel)];
        for (let f = 1; f < 600; f++) {
          const nextRel = fileMap.get(`${stem}-${f}${suffix}`.toLowerCase());
          if (!nextRel) break;
          frames.push(buildAssetUrl(skinId, nextRel));
        }
        if (frames.length >= 2) {
          const dims = readImageDimensions(firstFull);
          const is2x = suffix.startsWith('@2x');
          const isCroppedPerCy = dims.height > 4096;
          return {
            url: frames[0],
            width: dims.width,
            height: isCroppedPerCy ? 2048 : dims.height,
            originalHeight: dims.height,
            is2x,
            isCroppedPerCy,
            frames,
          };
        }
      }
    }

    const probes = hasExt
      ? [`${stem}@2x.png`, clean, `${stem}-0@2x.png`, `${stem}-0.png`]
      : [`${stem}@2x.png`, `${stem}.png`, `${stem}-0@2x.png`, `${stem}-0.png`, `${stem}@2x.jpg`, `${stem}.jpg`];

    for (const p of probes) {
      const actualRel = fileMap.get(p.toLowerCase());
      if (!actualRel) continue;
      const fullPath = path.join(skinDir, actualRel);
      if (!fs.existsSync(fullPath)) continue;
      const dims = readImageDimensions(fullPath);
      const is2x = /@2x\./i.test(actualRel);
      const isCroppedPerCy = dims.height > 4096;
      const reportedHeight = isCroppedPerCy ? 2048 : dims.height;
      return {
        url: buildAssetUrl(skinId, actualRel),
        width: dims.width,
        height: reportedHeight,
        originalHeight: dims.height,
        is2x,
        isCroppedPerCy,
      };
    }
  }
  return null;
}

function isSafeLocalSkinId(skinId: string): boolean {
  if (!skinId || skinId === '.' || skinId === '..') return false;
  if (skinId.includes('/') || skinId.includes('\\') || skinId.includes('..')) return false;
  return true;
}

export function resolveManiaSkin(skinId: string, keys: number): ResolvedManiaSkin {
  const clampedKeys = Math.max(1, Math.min(18, Math.round(keys || 4)));
  if (!skinId || skinId.startsWith('__builtin_')) {
    return buildBuiltinSkin(skinId || '__builtin_bar__', clampedKeys);
  }

  const cfg = getConfig();
  const skinsRoot = path.resolve(cfg.stablePath, 'Skins');
  if (!isSafeLocalSkinId(skinId)) {
    return buildBuiltinSkin('__builtin_bar__', clampedKeys);
  }

  const skinDir = path.resolve(skinsRoot, skinId);
  if (!skinDir.startsWith(skinsRoot + path.sep) || !fs.existsSync(skinDir) || !fs.statSync(skinDir).isDirectory()) {
    return buildBuiltinSkin('__builtin_bar__', clampedKeys);
  }

  const parsed = parseSkinIniFile(skinDir);
  const block = parsed.maniaBlocks.get(clampedKeys) ?? {};
  const fileMap = getSkinFileMap(skinDir);
  const slots = defaultColumnSlots(clampedKeys);

  const columnStart = Math.max(0, Math.min(500, Number(block['ColumnStart']) || 136));
  const columnWidth = parseNumberList(block['ColumnWidth'], clampedKeys, 36).map((w) =>
    Math.min(160, Math.max(12, w)),
  );
  const columnSpacing = parseNumberList(block['ColumnSpacing'], Math.max(0, clampedKeys - 1), 0).map(
    (s) => Math.min(80, Math.max(0, s)),
  );
  const columnLineWidth = parseNumberList(block['ColumnLineWidth'], clampedKeys + 1, 1);
  if (!block['ColumnLineWidth']) {
    columnLineWidth[0] = 2;
    columnLineWidth[columnLineWidth.length - 1] = 2;
  }

  const hitPosition = Math.min(480, Math.max(200, Number(block['HitPosition']) || 402));
  const lightPosition = Math.min(480, Math.max(200, Number(block['LightPosition']) || 413));
  const widthForNoteHeightScale = Math.max(0, Number(block['WidthForNoteHeightScale']) || 0);
  const lightingNWidth = parseNumberList(block['LightingNWidth'], clampedKeys, 0);
  const lightingLWidth = parseNumberList(block['LightingLWidth'], clampedKeys, 0);
  const rawLightFps = Number(block['LightFramePerSecond']);
  const lightFramePerSecond =
    Number.isFinite(rawLightFps) && rawLightFps > 0
      ? Math.min(120, Math.max(1, rawLightFps))
      : parsed.animationFramerate;
  const upsideDown = block['UpsideDown'] === '1' || block['UpsideDown']?.toLowerCase() === 'true';
  const keysUnderNotes =
    block['KeysUnderNotes'] === '1' || block['KeysUnderNotes']?.toLowerCase() === 'true';
  const barlineHeight = Math.min(8, Math.max(0, Number(block['BarlineHeight'] ?? 1.2) || 0));

  const colours = Array.from({ length: clampedKeys }, (_, i) =>
    parseRgba(block[`Colour${i + 1}`], 'rgba(10, 12, 18, 0.85)'),
  );
  const colourLights = Array.from({ length: clampedKeys }, (_, i) =>
    parseRgba(block[`ColourLight${i + 1}`], 'rgba(255, 255, 255, 0.65)'),
  );
  const colourBarline = parseRgba(block['ColourBarline'], 'rgba(255, 255, 255, 0.68)');
  const colourColumnLine = parseRgba(block['ColourColumnLine'], 'rgba(255, 255, 255, 0.22)');
  const colourHold = parseRgba(block['ColourHold'], 'rgba(255, 210, 80, 0.95)');

  const keyAssets: Array<ManiaSkinAsset | null> = [];
  const keyDownAssets: Array<ManiaSkinAsset | null> = [];
  const noteAssets: Array<ManiaSkinAsset | null> = [];
  const noteHeadAssets: Array<ManiaSkinAsset | null> = [];
  const noteBodyAssets: Array<ManiaSkinAsset | null> = [];
  const noteTailAssets: Array<ManiaSkinAsset | null> = [];

  for (let c = 0; c < clampedKeys; c++) {
    const slot = slots[c];
    keyAssets.push(
      resolveSkinAsset(skinId, skinDir, fileMap, [block[`KeyImage${c}`] ?? '', `mania-key${slot}`]),
    );
    keyDownAssets.push(
      resolveSkinAsset(skinId, skinDir, fileMap, [
        block[`KeyImage${c}D`] ?? '',
        `mania-key${slot}D`,
      ]),
    );
    const noteAsset = resolveSkinAsset(skinId, skinDir, fileMap, [
      block[`NoteImage${c}`] ?? '',
      `mania-note${slot}`,
    ]);
    noteAssets.push(noteAsset);
    noteHeadAssets.push(
      resolveSkinAsset(skinId, skinDir, fileMap, [
        block[`NoteImage${c}H`] ?? '',
        `mania-note${slot}H`,
      ]) ?? noteAsset,
    );
    noteBodyAssets.push(
      resolveSkinAsset(
        skinId,
        skinDir,
        fileMap,
        [block[`NoteImage${c}L`] ?? '', `mania-note${slot}L`],
        true,
      ),
    );
    noteTailAssets.push(
      resolveSkinAsset(skinId, skinDir, fileMap, [
        block[`NoteImage${c}T`] ?? '',
        `mania-note${slot}T`,
      ]),
    );
  }

  let noteBodyStyle: 0 | 1 | 2;
  if (block['NoteBodyStyle'] !== undefined) {
    const rawBodyStyle = Number.parseInt(block['NoteBodyStyle'], 10);
    noteBodyStyle = rawBodyStyle === 0 || rawBodyStyle === 2 ? rawBodyStyle : 1;
  } else {
    noteBodyStyle = noteBodyAssets.some((b) => b?.isCroppedPerCy) ? 1 : 0;
  }

  return {
    skinId,
    name: parsed.name || skinId,
    source: 'local',
    keys: clampedKeys,
    animationFramerate: parsed.animationFramerate,
    lightFramePerSecond,
    columnStart,
    columnWidth,
    columnSpacing,
    columnLineWidth,
    hitPosition,
    lightPosition,
    widthForNoteHeightScale,
    lightingNWidth,
    lightingLWidth,
    upsideDown,
    keysUnderNotes,
    noteBodyStyle,
    barlineHeight,
    colours,
    colourLights,
    colourBarline,
    colourColumnLine,
    colourHold,
    assets: {
      keys: keyAssets,
      keysDown: keyDownAssets,
      notes: noteAssets,
      noteHeads: noteHeadAssets,
      noteBodies: noteBodyAssets,
      noteTails: noteTailAssets,
      stageLeft: resolveSkinAsset(skinId, skinDir, fileMap, [
        block['StageLeft'] ?? '',
        'mania-stage-left',
      ]),
      stageRight: resolveSkinAsset(skinId, skinDir, fileMap, [
        block['StageRight'] ?? '',
        'mania-stage-right',
      ]),
      stageBottom: resolveSkinAsset(
        skinId,
        skinDir,
        fileMap,
        [block['StageBottom'] ?? '', 'mania-stage-bottom'],
        true,
      ),
      stageHint: resolveSkinAsset(skinId, skinDir, fileMap, [
        block['StageHint'] ?? '',
        'mania-stage-hint',
      ]),
      stageLight: resolveSkinAsset(
        skinId,
        skinDir,
        fileMap,
        [block['StageLight'] ?? '', 'mania-stage-light'],
        true,
      ),
      lightingN: resolveSkinAsset(
        skinId,
        skinDir,
        fileMap,
        [block['LightingN'] ?? '', 'lightingN'],
        true,
      ),
      lightingL: resolveSkinAsset(
        skinId,
        skinDir,
        fileMap,
        [block['LightingL'] ?? '', 'lightingL'],
        true,
      ),
    },
  };
}

export function serveSkinAsset(skinId: string, relFile: string, res: Response): void {
  if (!isSafeLocalSkinId(skinId) || !relFile || relFile.includes('..')) {
    res.status(400).end();
    return;
  }

  const cfg = getConfig();
  const skinsRoot = path.resolve(cfg.stablePath, 'Skins');
  const skinDir = path.resolve(skinsRoot, skinId);
  if (!skinDir.startsWith(skinsRoot + path.sep)) {
    res.status(403).end();
    return;
  }

  const cleanRel = relFile.replace(/\\/g, '/').replace(/^\/+/, '');
  const targetPath = path.resolve(skinDir, cleanRel);
  if (!targetPath.startsWith(skinDir + path.sep) || !fs.existsSync(targetPath)) {
    res.status(404).end();
    return;
  }

  const st = fs.statSync(targetPath);
  if (!st.isFile()) {
    res.status(404).end();
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (ext === '.png') {
    const dims = readImageDimensions(targetPath);
    if (dims.height > 4096) {
      const cacheKey = `${targetPath}:${st.mtimeMs}`;
      let cropped = CROPPED_PNG_CACHE.get(cacheKey);
      if (!cropped) {
        const rawBuf = fs.readFileSync(targetPath);
        cropped = cropPngTopRows(rawBuf, 2048);
        if (CROPPED_PNG_CACHE.size >= MAX_CROPPED_CACHE) {
          const oldestKey = CROPPED_PNG_CACHE.keys().next().value;
          if (oldestKey) CROPPED_PNG_CACHE.delete(oldestKey);
        }
        CROPPED_PNG_CACHE.set(cacheKey, cropped);
      }
      res.type('image/png').send(cropped);
      return;
    }
  }

  res.type(mime).sendFile(targetPath);
}
