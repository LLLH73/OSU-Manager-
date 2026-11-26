import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { CACHE_DIR } from './config.js';
import { fetchSmart, isProxyListening } from './network.js';
import { RoutePolicy } from './types.js';

const COVERS_DIR = path.join(CACHE_DIR, 'covers');
const COVERS_HD_DIR = path.join(CACHE_DIR, 'covers-hd');
const PREVIEWS_DIR = path.join(CACHE_DIR, 'previews');
const inFlightCovers = new Map<number, Promise<string | null>>();
const inFlightHdCovers = new Map<number, Promise<string | null>>();
const inFlightPreviews = new Map<number, Promise<string | null>>();

function trimCacheDir(dir: string, maxFiles: number): void {
  try {
    const files = fs.readdirSync(dir);
    if (files.length <= maxFiles) return;
    const stats = files
      .map((name) => {
        const fullPath = path.join(dir, name);
        return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);
    const removeCount = stats.length - Math.floor(maxFiles * 0.8);
    for (let i = 0; i < removeCount; i++) {
      fs.unlinkSync(stats[i].fullPath);
    }
  } catch {
    // Ignore cache cleanup errors
  }
}

async function fetchMediaToFile(
  candidates: Array<{ url: string; policy: RoutePolicy }>,
  outPath: string,
  expectedPrefix: string,
  minSize: number,
): Promise<string | null> {
  for (const { url, policy } of candidates) {
    try {
      const { response } = await fetchSmart(url, { timeoutMs: 8000 }, policy);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (ct && !ct.startsWith(expectedPrefix) && !ct.includes('octet-stream')) {
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const arr = Buffer.from(await response.arrayBuffer());
      if (arr.length < minSize) continue;

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const tmp = `${outPath}.part`;
      fs.writeFileSync(tmp, arr);
      fs.renameSync(tmp, outPath);
      return outPath;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export async function serveCover(setId: number, res: Response, hd = false): Promise<void> {
  const dir = hd ? COVERS_HD_DIR : COVERS_DIR;
  const inflightMap = hd ? inFlightHdCovers : inFlightCovers;
  const filePath = path.join(dir, `${setId}.jpg`);
  if (fs.existsSync(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.type('image/jpeg').sendFile(filePath);
    return;
  }

  let task = inflightMap.get(setId);
  if (!task) {
    task = (async () => {
      const proxyOpen = await isProxyListening();
      const candidates: Array<{ url: string; policy: RoutePolicy }> = hd
        ? proxyOpen
          ? [
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/fullsize.jpg`, policy: 'global_first' },
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/cover@2x.jpg`, policy: 'global_first' },
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/card@2x.jpg`, policy: 'global_first' },
              { url: `https://cdn.sayobot.cn:25225/beatmaps/${setId}/covers/cover.jpg`, policy: 'cn_first' },
            ]
          : [
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/fullsize.jpg`, policy: 'direct_only' },
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/cover@2x.jpg`, policy: 'direct_only' },
              { url: `https://cdn.sayobot.cn:25225/beatmaps/${setId}/covers/cover.jpg`, policy: 'cn_first' },
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/card@2x.jpg`, policy: 'direct_only' },
            ]
        : proxyOpen
          ? [
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/card@2x.jpg`, policy: 'global_first' },
              { url: `https://cdn.sayobot.cn:25225/beatmaps/${setId}/covers/cover.jpg`, policy: 'cn_first' },
              { url: `https://osu.direct/api/media/background/set/${setId}`, policy: 'global_first' },
            ]
          : [
              { url: `https://cdn.sayobot.cn:25225/beatmaps/${setId}/covers/cover.jpg`, policy: 'cn_first' },
              { url: `https://assets.ppy.sh/beatmaps/${setId}/covers/card@2x.jpg`, policy: 'direct_only' },
              { url: `https://osu.direct/api/media/background/set/${setId}`, policy: 'direct_only' },
            ];
      const resPath = await fetchMediaToFile(candidates, filePath, 'image/', hd ? 2048 : 512);
      if (resPath) trimCacheDir(dir, hd ? 400 : 600);
      return resPath;
    })().finally(() => {
      inflightMap.delete(setId);
    });
    inflightMap.set(setId, task);
  }

  const saved = await task;
  if (saved && fs.existsSync(saved)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.type('image/jpeg').sendFile(saved);
    return;
  }

  res.status(404).json({ error: 'Cover not found' });
}

export async function servePreview(setId: number, req: Request, res: Response): Promise<void> {
  const filePath = path.join(PREVIEWS_DIR, `${setId}.mp3`);

  if (!fs.existsSync(filePath)) {
    let task = inFlightPreviews.get(setId);
    if (!task) {
      task = (async () => {
        const proxyOpen = await isProxyListening();
        const candidates: Array<{ url: string; policy: RoutePolicy }> = [
          { url: `https://cdn.sayobot.cn:25225/preview/${setId}.mp3`, policy: 'cn_first' },
          {
            url: `https://b.ppy.sh/preview/${setId}.mp3`,
            policy: proxyOpen ? 'global_first' : 'direct_only',
          },
          {
            url: `https://osu.direct/api/media/preview/set/${setId}`,
            policy: proxyOpen ? 'global_first' : 'direct_only',
          },
        ];
        const resPath = await fetchMediaToFile(candidates, filePath, 'audio/', 2048);
        if (resPath) trimCacheDir(PREVIEWS_DIR, 250);
        return resPath;
      })().finally(() => {
        inFlightPreviews.delete(setId);
      });
      inFlightPreviews.set(setId, task);
    }
    const saved = await task;
    if (!saved || !fs.existsSync(saved)) {
      res.status(404).json({ error: 'Audio preview not available' });
      return;
    }
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=604800');

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
