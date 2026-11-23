import {
  ManiaNote,
  ManiaSkinAsset,
  ManiaTimingPoint,
  ParsedManiaChart,
  ResolvedManiaSkin,
} from '../types';

export interface ScrollSegment {
  startTime: number;
  startPos: number;
  rate: number;
  bpm: number;
}

export interface ScrollTimeline {
  segments: ScrollSegment[];
  notePosSv: Float64Array;
  noteEndPosSv: Float64Array;
  maxLnPosSpanSv: number;
  getScrollPos: (timeMs: number, respectSv: boolean) => number;
  getBpmAt: (timeMs: number) => number;
}

export function getScrollTimeMs(scrollSpeed: number, hitPosition: number): number {
  const clampedSpeed = Math.min(40, Math.max(1, scrollSpeed));
  const clampedHitPos = Math.min(480, Math.max(200, hitPosition || 402));
  return (13720 / clampedSpeed) * (clampedHitPos / 480);
}

export function buildScrollTimeline(
  timingPoints: ManiaTimingPoint[],
  baseBpm: number,
  notes: ManiaNote[],
): ScrollTimeline {
  const safeBaseBpm = Math.max(1, baseBpm || 120);
  const sorted = [...timingPoints].sort(
    (a, b) =>
      a.time - b.time ||
      (a.uninherited === b.uninherited ? 0 : a.uninherited ? -1 : 1),
  );

  const segments: ScrollSegment[] = [];
  let curBpm = safeBaseBpm;
  let curSv = 1;

  for (const tp of sorted) {
    if (tp.uninherited && tp.beatLength > 0) {
      curBpm = 60000 / tp.beatLength;
      curSv = 1;
    } else if (!tp.uninherited) {
      curSv = Math.min(10, Math.max(0.1, tp.svMultiplier || 1));
    }

    const rate = Math.max(0.05, Math.min(20, (curBpm / safeBaseBpm) * curSv));
    const last = segments[segments.length - 1];
    if (last && Math.abs(last.startTime - tp.time) < 0.5) {
      last.rate = rate;
      last.bpm = curBpm;
    } else {
      const startPos = last
        ? last.startPos + (tp.time - last.startTime) * last.rate
        : tp.time;
      segments.push({
        startTime: tp.time,
        startPos,
        rate,
        bpm: curBpm,
      });
    }
  }

  if (segments.length === 0) {
    segments.push({ startTime: 0, startPos: 0, rate: 1, bpm: safeBaseBpm });
  }

  const findSegIdx = (timeMs: number): number => {
    let lo = 0;
    let hi = segments.length - 1;
    if (timeMs <= segments[0].startTime) return -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].startTime <= timeMs) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, hi);
  };

  const getScrollPos = (timeMs: number, respectSv: boolean): number => {
    if (!respectSv) return timeMs;
    const idx = findSegIdx(timeMs);
    if (idx < 0) return timeMs;
    const seg = segments[idx];
    return seg.startPos + (timeMs - seg.startTime) * seg.rate;
  };

  const getBpmAt = (timeMs: number): number => {
    const idx = findSegIdx(timeMs);
    if (idx < 0) return segments[0].bpm;
    return segments[idx].bpm;
  };

  const notePosSv = new Float64Array(notes.length);
  const noteEndPosSv = new Float64Array(notes.length);
  let maxLnPosSpanSv = 0;

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const sp = getScrollPos(n.time, true);
    const ep = n.isHold ? getScrollPos(n.endTime, true) : sp;
    notePosSv[i] = sp;
    noteEndPosSv[i] = ep;
    const span = ep - sp;
    if (span > maxLnPosSpanSv) maxLnPosSpanSv = span;
  }

  return {
    segments,
    notePosSv,
    noteEndPosSv,
    maxLnPosSpanSv,
    getScrollPos,
    getBpmAt,
  };
}

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function loadSkinTextures(
  skin: ResolvedManiaSkin,
): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>();
  const addAsset = (a: ManiaSkinAsset | null | undefined) => {
    if (!a) return;
    if (a.url) urls.add(a.url);
    if (a.frames && a.frames.length <= 32) {
      for (const f of a.frames) urls.add(f);
    }
  };
  for (const a of skin.assets.keys) addAsset(a);
  for (const a of skin.assets.keysDown) addAsset(a);
  for (const a of skin.assets.notes) addAsset(a);
  for (const a of skin.assets.noteHeads) addAsset(a);
  for (const a of skin.assets.noteBodies) addAsset(a);
  for (const a of skin.assets.noteTails) addAsset(a);
  addAsset(skin.assets.stageLeft);
  addAsset(skin.assets.stageRight);
  addAsset(skin.assets.stageBottom);
  addAsset(skin.assets.stageHint);
  addAsset(skin.assets.stageLight);
  addAsset(skin.assets.lightingN);
  addAsset(skin.assets.lightingL);

  const map = new Map<string, HTMLImageElement>();
  const list = Array.from(urls);
  await Promise.all(
    list.map(async (u) => {
      const img = await loadImg(u);
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        map.set(u, img);
      }
    }),
  );
  return map;
}

export class SkinAnimator {
  private disposed = false;
  private bitmapLru = new Map<string, ImageBitmap>();
  private inFlight = new Set<string>();
  private failed = new Set<string>();
  private activeFetches = 0;
  private pendingQueue: Array<{ url: string; resizeWidth: number }> = [];
  private tintedCache = new Map<string, HTMLCanvasElement>();
  private readonly maxBitmaps = 240;
  private readonly maxConcurrent = 8;

  getFrame(
    asset: ManiaSkinAsset | null | undefined,
    frameIdx: number,
    staticTextures: Map<string, HTMLImageElement>,
  ): { source: CanvasImageSource; key: string } | null {
    if (!asset) return null;
    const frames = asset.frames;
    if (!frames || frames.length < 2) {
      const img = staticTextures.get(asset.url);
      return img ? { source: img, key: asset.url } : null;
    }

    const idx = ((frameIdx % frames.length) + frames.length) % frames.length;
    if (frames.length <= 32) {
      const targetUrl = frames[idx];
      const exact = staticTextures.get(targetUrl);
      if (exact) return { source: exact, key: targetUrl };
      const fallback = staticTextures.get(asset.url);
      return fallback ? { source: fallback, key: asset.url } : null;
    }

    // Large streaming sequence (e.g. 210-frame animated stage-bottom at 60 FPS)
    const resizeWidth =
      frames.length > 64 ? Math.min(asset.width, 960) : Math.min(asset.width, 1200);
    for (let ahead = 0; ahead < 36; ahead++) {
      const u = frames[(idx + ahead) % frames.length];
      this.enqueueBitmap(u, resizeWidth);
    }

    const targetUrl = frames[idx];
    const hit = this.bitmapLru.get(targetUrl);
    if (hit) {
      // Refresh LRU position
      this.bitmapLru.delete(targetUrl);
      this.bitmapLru.set(targetUrl, hit);
      return { source: hit, key: targetUrl };
    }

    // Smoothly fallback to nearest recently decoded frame before frame 0
    for (let back = 1; back <= 12; back++) {
      const prevUrl = frames[(idx - back + frames.length) % frames.length];
      const prevBmp = this.bitmapLru.get(prevUrl);
      if (prevBmp) return { source: prevBmp, key: prevUrl };
    }

    const frame0 = staticTextures.get(asset.url);
    return frame0 ? { source: frame0, key: asset.url } : null;
  }

  private enqueueBitmap(url: string, resizeWidth: number): void {
    if (this.disposed) return;
    if (this.bitmapLru.has(url) || this.inFlight.has(url) || this.failed.has(url)) return;
    this.inFlight.add(url);
    this.pendingQueue.push({ url, resizeWidth });
    this.pumpQueue();
  }

  private pumpQueue(): void {
    while (!this.disposed && this.activeFetches < this.maxConcurrent && this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift()!;
      this.activeFetches += 1;
      void this.decodeFrame(item.url, item.resizeWidth).finally(() => {
        this.activeFetches -= 1;
        this.pumpQueue();
      });
    }
  }

  private async decodeFrame(url: string, resizeWidth: number): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (this.disposed) return;
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(blob, { resizeWidth, resizeQuality: 'medium' });
      } catch {
        bmp = await createImageBitmap(blob);
      }
      if (this.disposed) {
        bmp.close();
        return;
      }
      if (this.bitmapLru.size >= this.maxBitmaps) {
        const oldestKey = this.bitmapLru.keys().next().value;
        if (oldestKey) {
          const oldBmp = this.bitmapLru.get(oldestKey);
          this.bitmapLru.delete(oldestKey);
          oldBmp?.close();
        }
      }
      this.bitmapLru.set(url, bmp);
    } catch {
      this.failed.add(url);
    } finally {
      this.inFlight.delete(url);
    }
  }

  getTintedImage(
    source: CanvasImageSource,
    sourceKey: string,
    rgbaColor: string,
    w: number,
    h: number,
  ): HTMLCanvasElement | null {
    const cacheKey = `${sourceKey}|${rgbaColor}`;
    const existing = this.tintedCache.get(cacheKey);
    if (existing) return existing;
    if (w <= 0 || h <= 0) return null;

    const off = document.createElement('canvas');
    off.width = Math.min(256, Math.max(1, Math.round(w)));
    off.height = Math.min(1024, Math.max(1, Math.round(h)));
    const octx = off.getContext('2d');
    if (!octx) return null;

    octx.drawImage(source, 0, 0, off.width, off.height);
    octx.globalCompositeOperation = 'multiply';
    octx.fillStyle = rgbaColor;
    octx.fillRect(0, 0, off.width, off.height);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(source, 0, 0, off.width, off.height);
    octx.globalCompositeOperation = 'source-over';

    if (this.tintedCache.size >= 32) {
      const oldest = this.tintedCache.keys().next().value;
      if (oldest) this.tintedCache.delete(oldest);
    }
    this.tintedCache.set(cacheKey, off);
    return off;
  }

  dispose(): void {
    this.disposed = true;
    this.pendingQueue.length = 0;
    this.inFlight.clear();
    for (const bmp of this.bitmapLru.values()) {
      bmp.close();
    }
    this.bitmapLru.clear();
    this.tintedCache.clear();
  }
}

export interface PlayfieldRenderParams {
  chart: ParsedManiaChart;
  timeline: ScrollTimeline;
  skin: ResolvedManiaSkin;
  textures: Map<string, HTMLImageElement>;
  animator: SkinAnimator | null;
  bgImage: HTMLImageElement | null;
  currentTimeMs: number;
  animNowMs: number;
  scrollSpeed: number;
  respectSv: boolean;
  upsideDownOverride: 'skin' | 'down' | 'up';
  showBarlines: boolean;
  showKeyLight: boolean;
  bgDim: number;
  stageScale: number;
}

function lowerBoundNotes(
  notes: ManiaNote[],
  posArr: Float64Array,
  respectSv: boolean,
  target: number,
): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const v = respectSv ? posArr[mid] : notes[mid].time;
    if (v < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundNotes(
  notes: ManiaNote[],
  posArr: Float64Array,
  respectSv: boolean,
  target: number,
): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const v = respectSv ? posArr[mid] : notes[mid].time;
    if (v <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function isRealAsset(asset: ManiaSkinAsset | null | undefined): asset is ManiaSkinAsset {
  return Boolean(asset && asset.width > 2 && asset.height > 2);
}

function drawBuiltinNote(
  ctx: CanvasRenderingContext2D,
  style: 'bar' | 'circle' | 'arrow',
  col: number,
  keyCount: number,
  x: number,
  yCenter: number,
  colW: number,
  isHoldHead: boolean,
  isUpsideDown: boolean,
): void {
  const padX = Math.max(2, colW * 0.07);
  const w = colW - padX * 2;
  const cx = x + colW / 2;

  const isInner =
    keyCount === 4
      ? col === 1 || col === 2
      : keyCount % 2 === 1 && col === Math.floor(keyCount / 2)
        ? 'center'
        : col % 2 === 1;

  const primary =
    isInner === 'center'
      ? '#fbbf24'
      : isInner
        ? style === 'arrow'
          ? '#38bdf8'
          : '#ff66aa'
        : '#f8fafc';

  const glow =
    isInner === 'center'
      ? 'rgba(251, 191, 36, 0.4)'
      : isInner
        ? 'rgba(255, 102, 170, 0.35)'
        : 'rgba(148, 163, 184, 0.25)';

  if (style === 'circle') {
    const r = Math.min(w * 0.44, 22);
    ctx.save();
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(cx, yCenter, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, yCenter - r * 0.28, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (style === 'arrow') {
    const r = Math.min(w * 0.4, 18);
    let angle = 0;
    if (keyCount === 4) {
      angle = col === 0 ? Math.PI : col === 1 ? Math.PI / 2 : col === 2 ? -Math.PI / 2 : 0;
    } else {
      angle = (col % 4) * (Math.PI / 2);
    }
    if (isUpsideDown && (angle === Math.PI / 2 || angle === -Math.PI / 2)) {
      angle = -angle;
    }
    ctx.save();
    ctx.translate(cx, yCenter);
    ctx.rotate(angle);
    ctx.fillStyle = primary;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r * 0.9, 0);
    ctx.lineTo(-r * 0.2, -r * 0.85);
    ctx.lineTo(-r * 0.2, -r * 0.38);
    ctx.lineTo(-r * 0.9, -r * 0.38);
    ctx.lineTo(-r * 0.9, r * 0.38);
    ctx.lineTo(-r * 0.2, r * 0.38);
    ctx.lineTo(-r * 0.2, r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const h = Math.max(10, Math.min(20, colW * 0.34));
  const rx = x + padX;
  const ry = yCenter - h / 2;
  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.roundRect(rx - 1, ry - 1, w + 2, h + 2, 5);
  ctx.fill();

  const grad = ctx.createLinearGradient(rx, ry, rx, ry + h);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.28, primary);
  grad.addColorStop(1, primary);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 4);
  ctx.fill();

  if (isHoldHead) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

export function renderManiaPlayfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: PlayfieldRenderParams,
): void {
  const {
    chart,
    timeline,
    skin,
    textures,
    animator,
    bgImage,
    currentTimeMs,
    animNowMs,
    scrollSpeed,
    respectSv,
    upsideDownOverride,
    showBarlines,
    showKeyLight,
    bgDim,
    stageScale,
  } = params;

  ctx.clearRect(0, 0, width, height);

  // 1. Background image + dim overlay
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, width, height);

  if (bgImage && bgImage.naturalWidth > 0) {
    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
    const canvasRatio = width / Math.max(1, height);
    let drawW = width;
    let drawH = height;
    let drawX = 0;
    let drawY = 0;
    if (imgRatio > canvasRatio) {
      drawW = height * imgRatio;
      drawX = (width - drawW) / 2;
    } else {
      drawH = width / imgRatio;
      drawY = (height - drawH) / 2;
    }
    ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
  }

  ctx.fillStyle = `rgba(6, 8, 14, ${Math.min(0.96, Math.max(0.15, bgDim))})`;
  ctx.fillRect(0, 0, width, height);

  // 2. Compute osu! 16:9 (480p layout / 768p texture) scale & column layout
  const keys = chart.keyCount;
  const colWidthsUnits =
    skin.columnWidth.length >= keys
      ? skin.columnWidth.slice(0, keys)
      : new Array<number>(keys).fill(42);
  const colSpacingUnits =
    skin.columnSpacing.length >= Math.max(0, keys - 1)
      ? skin.columnSpacing.slice(0, Math.max(0, keys - 1))
      : new Array<number>(Math.max(0, keys - 1)).fill(0);

  const totalUnits =
    colWidthsUnits.reduce((a, b) => a + b, 0) +
    colSpacingUnits.reduce((a, b) => a + b, 0);

  const rawScale480 = (height / 480) * stageScale;
  const maxFitScale = (width * 0.96) / Math.max(1, totalUnits);
  const scale480 = Math.min(rawScale480, maxFitScale);
  const fitRatio = scale480 / Math.max(0.0001, rawScale480);

  const texScaleFor = (asset: ManiaSkinAsset): number =>
    (height / (asset.is2x ? 1536 : 768)) * stageScale * fitRatio;

  const stageW = totalUnits * scale480;
  const stageLeftX = (width - stageW) / 2;
  const stageCenterX = stageLeftX + stageW / 2;
  const isUpsideDown =
    upsideDownOverride === 'up'
      ? true
      : upsideDownOverride === 'down'
        ? false
        : skin.upsideDown;

  const hitY = isUpsideDown
    ? ((480 - skin.hitPosition) / 480) * height
    : (skin.hitPosition / 480) * height;
  const lightY = isUpsideDown
    ? ((480 - skin.lightPosition) / 480) * height
    : (skin.lightPosition / 480) * height;
  const travelDistance = Math.max(120, isUpsideDown ? height - hitY : hitY);
  const scrollTimeMs = getScrollTimeMs(scrollSpeed, skin.hitPosition);

  const colLeftX = new Float64Array(keys);
  const colWidthPx = new Float64Array(keys);
  let cursorX = stageLeftX;
  for (let c = 0; c < keys; c++) {
    colLeftX[c] = cursorX;
    colWidthPx[c] = colWidthsUnits[c] * scale480;
    cursorX += colWidthPx[c] + (c < keys - 1 ? (colSpacingUnits[c] ?? 0) * scale480 : 0);
  }

  // 3. Stage Left / Right borders (768p virtual texture width, full playfield height)
  if (isRealAsset(skin.assets.stageLeft)) {
    const img = textures.get(skin.assets.stageLeft.url);
    if (img) {
      const w = skin.assets.stageLeft.width * texScaleFor(skin.assets.stageLeft);
      ctx.drawImage(img, stageLeftX - w, 0, w, height);
    }
  }
  if (isRealAsset(skin.assets.stageRight)) {
    const img = textures.get(skin.assets.stageRight.url);
    if (img) {
      const w = skin.assets.stageRight.width * texScaleFor(skin.assets.stageRight);
      ctx.drawImage(img, stageLeftX + stageW, 0, w, height);
    }
  }

  // 4. Column lane backgrounds & separators
  for (let c = 0; c < keys; c++) {
    ctx.fillStyle = skin.colours[c] || 'rgba(10, 12, 18, 0.85)';
    ctx.fillRect(colLeftX[c], 0, colWidthPx[c], height);
  }

  for (let i = 0; i <= keys; i++) {
    const lineW = (skin.columnLineWidth[i] ?? (i === 0 || i === keys ? 2 : 1)) * scale480 * 0.7;
    if (lineW <= 0) continue;
    const lx = i === keys ? colLeftX[keys - 1] + colWidthPx[keys - 1] : colLeftX[i];
    ctx.fillStyle = skin.colourColumnLine || 'rgba(255,255,255,0.22)';
    ctx.fillRect(lx - lineW / 2, 0, lineW, height);
  }

  if (!isRealAsset(skin.assets.stageLeft) && !isRealAsset(skin.assets.stageRight)) {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(stageLeftX, -2, stageW, height + 4);
  }

  // 5. Scroll timeline & autoplay key-down + hit lighting telemetry
  const currentPos = timeline.getScrollPos(currentTimeMs, respectSv);
  const posToY = (targetPos: number): number => {
    const delta = targetPos - currentPos;
    const norm = delta / scrollTimeMs;
    return isUpsideDown ? hitY + norm * travelDistance : hitY - norm * travelDistance;
  };

  const lightingNFps = skin.animationFramerate || 60;
  const lightingNFrames = skin.assets.lightingN?.frames?.length || 1;
  const lightingNDurMs = Math.max(180, (lightingNFrames / lightingNFps) * 1000);

  const keyActive = new Uint8Array(keys);
  const activeHoldStart = new Float64Array(keys).fill(-1);
  const recentHitTime = new Float64Array(keys).fill(-1);

  const hitScanWindow = Math.max(140, lightingNDurMs + 20);
  const hitSearchStart = Math.max(
    0,
    lowerBoundNotes(
      chart.notes,
      timeline.notePosSv,
      false,
      currentTimeMs - chart.maxLnDurationMs - hitScanWindow,
    ),
  );
  const hitSearchEnd = upperBoundNotes(chart.notes, timeline.notePosSv, false, currentTimeMs + 5);

  for (let i = hitSearchStart; i < hitSearchEnd; i++) {
    const n = chart.notes[i];
    const c = n.col;
    if (n.isHold) {
      if (n.time <= currentTimeMs && currentTimeMs < n.endTime) {
        keyActive[c] = 1;
        if (activeHoldStart[c] < 0 || n.time > activeHoldStart[c]) {
          activeHoldStart[c] = n.time;
        }
      } else if (n.endTime <= currentTimeMs && currentTimeMs - n.endTime <= lightingNDurMs) {
        if (n.endTime > recentHitTime[c]) recentHitTime[c] = n.endTime;
      }
    } else if (n.time <= currentTimeMs) {
      if (currentTimeMs - n.time <= 85) {
        keyActive[c] = 1;
      }
      if (currentTimeMs - n.time <= lightingNDurMs && n.time > recentHitTime[c]) {
        recentHitTime[c] = n.time;
      }
    }
  }

  // 6. Stage Light (underneath notes, using real mania-stage-light.png tinted by ColourLight#)
  if (showKeyLight) {
    const stageLightAsset = skin.assets.stageLight;
    const hasRealStageLight = isRealAsset(stageLightAsset);
    if (hasRealStageLight && stageLightAsset) {
      const frameCount = stageLightAsset.frames?.length || 1;
      const frameIdx =
        frameCount >= 2
          ? Math.floor((animNowMs / 1000) * skin.lightFramePerSecond) % frameCount
          : 0;
      const resolvedFrame = animator
        ? animator.getFrame(stageLightAsset, frameIdx, textures)
        : textures.get(stageLightAsset.url)
          ? { source: textures.get(stageLightAsset.url)!, key: stageLightAsset.url }
          : null;
      if (resolvedFrame) {
        const drawH = stageLightAsset.height * texScaleFor(stageLightAsset);
        for (let c = 0; c < keys; c++) {
          if (keyActive[c] !== 1) continue;
          const x = colLeftX[c];
          const w = colWidthPx[c];
          const tinted =
            animator?.getTintedImage(
              resolvedFrame.source,
              resolvedFrame.key,
              skin.colourLights[c] || 'rgba(255,255,255,0.9)',
              stageLightAsset.width,
              stageLightAsset.height,
            ) ?? resolvedFrame.source;
          if (isUpsideDown) {
            ctx.save();
            ctx.translate(x + w / 2, lightY + drawH / 2);
            ctx.scale(1, -1);
            ctx.drawImage(tinted, -w / 2, -drawH / 2, w, drawH);
            ctx.restore();
          } else {
            ctx.drawImage(tinted, x, lightY - drawH, w, drawH);
          }
        }
      }
    } else if (skin.source === 'builtin') {
      for (let c = 0; c < keys; c++) {
        if (keyActive[c] !== 1) continue;
        const x = colLeftX[c];
        const w = colWidthPx[c];
        const grad = isUpsideDown
          ? ctx.createLinearGradient(x, lightY, x, lightY + 130 * scale480)
          : ctx.createLinearGradient(x, lightY, x, lightY - 130 * scale480);
        grad.addColorStop(0, skin.colourLights[c] || 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        if (isUpsideDown) {
          ctx.fillRect(x, lightY, w, 130 * scale480);
        } else {
          ctx.fillRect(x, lightY - 130 * scale480, w, 130 * scale480);
        }
      }
    }
  }

  // 7. Barlines
  if (showBarlines && skin.barlineHeight > 0) {
    const barH = Math.max(1, skin.barlineHeight * scale480);
    const minT = currentTimeMs - scrollTimeMs * 0.2;
    const maxT = currentTimeMs + scrollTimeMs * 3;
    for (let i = 0; i < chart.barlines.length; i++) {
      const b = chart.barlines[i];
      if (b.time < minT) continue;
      if (b.time > maxT && !respectSv) break;
      const bp = timeline.getScrollPos(b.time, respectSv);
      const y = posToY(bp);
      if (y < -4 || y > height + 4) continue;
      ctx.save();
      ctx.globalAlpha = b.isMeasure ? 0.65 : 0.22;
      ctx.fillStyle = skin.colourBarline || 'rgba(255,255,255,0.65)';
      ctx.fillRect(stageLeftX, y - barH / 2, stageW, barH);
      ctx.restore();
    }
  }

  // 8. Helper to draw receptors (KeysUnderNotes aware)
  const drawReceptors = () => {
    if (isRealAsset(skin.assets.stageHint)) {
      const hintImg = textures.get(skin.assets.stageHint.url);
      if (hintImg) {
        const hintH = skin.assets.stageHint.height * texScaleFor(skin.assets.stageHint);
        ctx.drawImage(hintImg, stageLeftX, hitY - hintH / 2, stageW, hintH);
      }
    } else if (!skin.assets.stageHint && skin.source === 'builtin') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(stageLeftX, hitY - 1.5, stageW, 3);
    }

    for (let c = 0; c < keys; c++) {
      const isDown = keyActive[c] === 1;
      const x = colLeftX[c];
      const w = colWidthPx[c];

      const keyAsset = isDown ? skin.assets.keysDown[c] ?? skin.assets.keys[c] : skin.assets.keys[c];
      const keyImg = keyAsset ? textures.get(keyAsset.url) : undefined;

      if (keyImg && isRealAsset(keyAsset)) {
        const drawH = w * (keyImg.naturalHeight / keyImg.naturalWidth);
        if (isUpsideDown) {
          ctx.save();
          ctx.translate(x + w / 2, drawH / 2);
          ctx.scale(1, -1);
          ctx.drawImage(keyImg, -w / 2, -drawH / 2, w, drawH);
          ctx.restore();
        } else {
          ctx.drawImage(keyImg, x, height - drawH, w, drawH);
        }
      } else if (skin.source === 'builtin') {
        const rx = x + Math.max(2, w * 0.08);
        const rw = w - Math.max(4, w * 0.16);
        if (skin.builtinStyle === 'circle') {
          const r = Math.min(rw * 0.44, 22);
          ctx.save();
          ctx.strokeStyle = isDown ? '#ff66aa' : 'rgba(255,255,255,0.5)';
          ctx.lineWidth = isDown ? 3 : 2;
          ctx.beginPath();
          ctx.arc(x + w / 2, hitY, r, 0, Math.PI * 2);
          ctx.stroke();
          if (isDown) {
            ctx.fillStyle = 'rgba(255, 102, 170, 0.25)';
            ctx.fill();
          }
          ctx.restore();
        } else {
          const rh = Math.max(8, 12 * scale480);
          ctx.save();
          ctx.fillStyle = isDown ? 'rgba(255, 102, 170, 0.9)' : 'rgba(255,255,255,0.16)';
          ctx.strokeStyle = isDown ? '#ffffff' : 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.roundRect(rx, hitY - rh / 2, rw, rh, 4);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  };

  if (skin.keysUnderNotes) {
    drawReceptors();
  }

  // 9. Draw visible notes & LNs (O(log N) binary search, disappearing immediately upon hit)
  const posArr = timeline.notePosSv;
  const endPosArr = timeline.noteEndPosSv;
  const maxLnSpan = respectSv ? timeline.maxLnPosSpanSv : chart.maxLnDurationMs;
  const minQueryPos = currentPos - maxLnSpan - scrollTimeMs * 0.4;
  const maxQueryPos = currentPos + scrollTimeMs * 1.45;

  const startIdx = lowerBoundNotes(chart.notes, posArr, respectSv, minQueryPos);
  const endIdx = upperBoundNotes(chart.notes, posArr, respectSv, maxQueryPos);

  for (let i = startIdx; i < endIdx; i++) {
    const n = chart.notes[i];
    const c = n.col;
    const x = colLeftX[c];
    const colW = colWidthPx[c];
    const refW =
      skin.widthForNoteHeightScale > 0 ? skin.widthForNoteHeightScale * scale480 : colW;

    if (!n.isHold) {
      // Single notes vanish immediately at judgement line
      if (n.time <= currentTimeMs) continue;
      const headPos = respectSv ? posArr[i] : n.time;
      const y = posToY(headPos);
      if (y < -120 || y > height + 120) continue;

      const noteAsset = skin.assets.notes[c];
      const noteImg = noteAsset ? textures.get(noteAsset.url) : undefined;
      if (noteImg && isRealAsset(noteAsset)) {
        const drawH = refW * (noteImg.naturalHeight / noteImg.naturalWidth);
        if (isUpsideDown) {
          ctx.drawImage(noteImg, x, y, colW, drawH);
        } else {
          ctx.drawImage(noteImg, x, y - drawH, colW, drawH);
        }
      } else {
        const style = skin.builtinStyle ?? 'bar';
        const centerOffset = style === 'bar' ? (isUpsideDown ? 7 : -7) : 0;
        drawBuiltinNote(ctx, style, c, keys, x, y + centerOffset, colW, false, isUpsideDown);
      }
      continue;
    }

    // Long Note (Hold): vanishes immediately once tail crosses judgement line
    if (n.endTime <= currentTimeMs) continue;
    const rawHeadPos = respectSv ? posArr[i] : n.time;
    const rawTailPos = respectSv ? endPosArr[i] : n.endTime;

    let headY = posToY(rawHeadPos);
    const tailY = posToY(rawTailPos);

    const holdingNow = currentTimeMs >= n.time && currentTimeMs < n.endTime;
    if (holdingNow) {
      headY = hitY;
    }

    const headAsset = skin.assets.noteHeads[c] ?? skin.assets.notes[c];
    const headImg = headAsset ? textures.get(headAsset.url) : undefined;
    const hasRealHead = Boolean(headImg && isRealAsset(headAsset));
    const headH = hasRealHead && headImg ? refW * (headImg.naturalHeight / headImg.naturalWidth) : 0;

    // Resolve tail mode: hidden (1x1 or 128x1 PerCy T.png), custom, or flippedHead (like CANTARELLA)
    const rawTailAsset = skin.assets.noteTails[c];
    const rawTailImg = rawTailAsset ? textures.get(rawTailAsset.url) : undefined;
    let tailMode: 'hidden' | 'custom' | 'flippedHead' = 'hidden';
    let tailDrawImg: HTMLImageElement | undefined;
    let tailH = 0;

    if (rawTailAsset) {
      if (rawTailAsset.height <= 2 || rawTailAsset.width <= 2) {
        tailMode = 'hidden';
      } else if (rawTailImg) {
        tailMode = 'custom';
        tailDrawImg = rawTailImg;
        tailH = refW * (rawTailImg.naturalHeight / rawTailImg.naturalWidth);
      }
    } else if (hasRealHead && headImg) {
      tailMode = 'flippedHead';
      tailDrawImg = headImg;
      tailH = headH;
    }

    // Compute exact LN body span (stops cleanly at head & tail center equators so ball skins never protrude)
    let bodyTopY: number;
    let bodyBotY: number;
    if (!isUpsideDown) {
      bodyBotY = hasRealHead ? headY - headH / 2 : headY;
      bodyTopY = tailMode === 'hidden' ? tailY : tailY - tailH / 2;
    } else {
      bodyTopY = hasRealHead ? headY + headH / 2 : headY;
      bodyBotY = tailMode === 'hidden' ? tailY : tailY + tailH / 2;
    }

    const bodyMinY = Math.min(headY, tailY);
    const bodyMaxY = Math.max(headY, tailY);
    if (bodyMaxY < -140 || bodyMinY > height + 140) continue;

    // Draw LN body if positive span remains between equators
    const bodySpanH = bodyBotY - bodyTopY;
    const bodyAsset = skin.assets.noteBodies[c];
    const bodyFrameCount = bodyAsset?.frames?.length || 1;
    const bodyFrameIdx =
      bodyFrameCount >= 2 && holdingNow
        ? Math.floor(((currentTimeMs - n.time) / 1000) * skin.animationFramerate) % bodyFrameCount
        : 0;
    const bodyResolved = bodyAsset
      ? animator
        ? animator.getFrame(bodyAsset, bodyFrameIdx, textures)
        : textures.get(bodyAsset.url)
          ? { source: textures.get(bodyAsset.url)!, key: bodyAsset.url }
          : null
      : null;

    if (bodySpanH > 0.5) {
      if (bodyResolved && isRealAsset(bodyAsset)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, bodyTopY, colW, bodySpanH);
        ctx.clip();

        if (skin.noteBodyStyle === 0) {
          ctx.drawImage(bodyResolved.source, x, bodyTopY, colW, bodySpanH);
        } else {
          const tileH = Math.max(2, colW * (bodyAsset.height / bodyAsset.width));
          if (isUpsideDown) {
            ctx.translate(x + colW / 2, (bodyTopY + bodyBotY) / 2);
            ctx.scale(1, -1);
            const relMinY = -bodySpanH / 2;
            const relMaxY = bodySpanH / 2;
            if (skin.noteBodyStyle === 1) {
              for (let yCur = relMinY; yCur < relMaxY; yCur += tileH) {
                ctx.drawImage(bodyResolved.source, -colW / 2, yCur, colW, tileH);
              }
            } else {
              for (let yCur = relMaxY - tileH; yCur > relMinY - tileH; yCur -= tileH) {
                ctx.drawImage(bodyResolved.source, -colW / 2, yCur, colW, tileH);
              }
            }
          } else if (skin.noteBodyStyle === 1) {
            for (let yCur = bodyTopY; yCur < bodyBotY; yCur += tileH) {
              ctx.drawImage(bodyResolved.source, x, yCur, colW, tileH);
            }
          } else {
            for (let yCur = bodyBotY - tileH; yCur > bodyTopY - tileH; yCur -= tileH) {
              ctx.drawImage(bodyResolved.source, x, yCur, colW, tileH);
            }
          }
        }
        ctx.restore();
      } else {
        const bw = colW * 0.62;
        const bx = x + (colW - bw) / 2;
        const style = skin.builtinStyle ?? 'bar';
        const centerOffset = style === 'bar' ? (isUpsideDown ? 7 : -7) : 0;
        const biTop = Math.min(headY + centerOffset, tailY + centerOffset);
        const biBot = Math.max(headY + centerOffset, tailY + centerOffset);
        ctx.save();
        ctx.fillStyle = holdingNow ? 'rgba(255, 224, 102, 0.62)' : 'rgba(168, 85, 247, 0.42)';
        ctx.strokeStyle = holdingNow ? 'rgba(255,255,255,0.85)' : 'rgba(192,132,252,0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx, biTop, bw, Math.max(2, biBot - biTop), 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw LN tail cap
    if (tailMode !== 'hidden' && tailDrawImg && tailH > 0) {
      if (tailMode === 'flippedHead') {
        if (!isUpsideDown) {
          ctx.save();
          ctx.translate(x + colW / 2, tailY - tailH / 2);
          ctx.scale(1, -1);
          ctx.drawImage(tailDrawImg, -colW / 2, -tailH / 2, colW, tailH);
          ctx.restore();
        } else {
          ctx.drawImage(tailDrawImg, x, tailY, colW, tailH);
        }
      } else {
        if (!isUpsideDown) {
          ctx.drawImage(tailDrawImg, x, tailY - tailH, colW, tailH);
        } else {
          ctx.save();
          ctx.translate(x + colW / 2, tailY + tailH / 2);
          ctx.scale(1, -1);
          ctx.drawImage(tailDrawImg, -colW / 2, -tailH / 2, colW, tailH);
          ctx.restore();
        }
      }
    }

    // Draw LN head on top
    if (hasRealHead && headImg) {
      if (isUpsideDown) {
        ctx.drawImage(headImg, x, headY, colW, headH);
      } else {
        ctx.drawImage(headImg, x, headY - headH, colW, headH);
      }
    } else {
      const style = skin.builtinStyle ?? 'bar';
      const centerOffset = style === 'bar' ? (isUpsideDown ? 7 : -7) : 0;
      drawBuiltinNote(ctx, style, c, keys, x, headY + centerOffset, colW, true, isUpsideDown);
    }
  }

  if (!skin.keysUnderNotes) {
    drawReceptors();
  }

  // 10. Real Skin Hit Lighting (LightingL during LN hold, LightingN on tap/release burst)
  if (showKeyLight) {
    const lAsset = skin.assets.lightingL;
    const nAsset = skin.assets.lightingN;

    for (let c = 0; c < keys; c++) {
      const colCenterX = colLeftX[c] + colWidthPx[c] / 2;

      if (activeHoldStart[c] >= 0 && isRealAsset(lAsset)) {
        const frameCount = lAsset.frames?.length || 1;
        const elapsed = Math.max(0, currentTimeMs - activeHoldStart[c]);
        const frameIdx =
          frameCount >= 2
            ? Math.floor((elapsed / 1000) * lightingNFps) % frameCount
            : 0;
        const frame = animator
          ? animator.getFrame(lAsset, frameIdx, textures)
          : textures.get(lAsset.url)
            ? { source: textures.get(lAsset.url)!, key: lAsset.url }
            : null;
        if (frame) {
          const drawW =
            skin.lightingLWidth[c] > 0
              ? skin.lightingLWidth[c] * scale480
              : lAsset.width * texScaleFor(lAsset);
          const drawH = drawW * (lAsset.height / lAsset.width);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(frame.source, colCenterX - drawW / 2, hitY - drawH / 2, drawW, drawH);
          ctx.restore();
        }
      } else if (recentHitTime[c] >= 0 && isRealAsset(nAsset)) {
        const elapsed = currentTimeMs - recentHitTime[c];
        if (elapsed >= 0 && elapsed <= lightingNDurMs) {
          const frameCount = nAsset.frames?.length || 1;
          const frameIdx = Math.min(
            frameCount - 1,
            Math.floor((elapsed / 1000) * lightingNFps),
          );
          const frame = animator
            ? animator.getFrame(nAsset, frameIdx, textures)
            : textures.get(nAsset.url)
              ? { source: textures.get(nAsset.url)!, key: nAsset.url }
              : null;
          if (frame) {
            const drawW =
              skin.lightingNWidth[c] > 0
                ? skin.lightingNWidth[c] * scale480
                : nAsset.width * texScaleFor(nAsset);
            const drawH = drawW * (nAsset.height / nAsset.width);
            const progress = elapsed / lightingNDurMs;
            const alpha =
              progress > 0.65 ? Math.max(0, 1 - (progress - 0.65) / 0.35) : 1;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = alpha;
            ctx.drawImage(frame.source, colCenterX - drawW / 2, hitY - drawH / 2, drawW, drawH);
            ctx.restore();
          }
        }
      }
    }
  }

  // 11. Stage Bottom Overlay (Topmost layer, unstretched BottomCentre at 1.50x baseline, forced 60 FPS)
  if (isRealAsset(skin.assets.stageBottom)) {
    const STAGE_BOTTOM_SCALE = 1.5;
    const STAGE_BOTTOM_FPS = 60;
    const sbAsset = skin.assets.stageBottom;
    const sbFrames = sbAsset.frames;
    const sbIdx =
      sbFrames && sbFrames.length >= 2
        ? Math.floor((animNowMs / 1000) * STAGE_BOTTOM_FPS) % sbFrames.length
        : 0;
    const sbFrame = animator
      ? animator.getFrame(sbAsset, sbIdx, textures)
      : textures.get(sbAsset.url)
        ? { source: textures.get(sbAsset.url)!, key: sbAsset.url }
        : null;

    if (sbFrame) {
      const sbScale = texScaleFor(sbAsset) * STAGE_BOTTOM_SCALE;
      const drawW = sbAsset.width * sbScale;
      const drawH = sbAsset.height * sbScale;
      const drawX = stageCenterX - drawW / 2;
      if (isUpsideDown) {
        ctx.save();
        ctx.translate(stageCenterX, drawH / 2);
        ctx.scale(1, -1);
        ctx.drawImage(sbFrame.source, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(sbFrame.source, drawX, height - drawH, drawW, drawH);
      }
    }
  }

  // 12. Minimal Playfield Telemetry (Live Combo, BPM, NPS)
  const hitCountSoFar = upperBoundNotes(chart.notes, timeline.notePosSv, false, currentTimeMs);
  const npsWinStart = lowerBoundNotes(chart.notes, timeline.notePosSv, false, currentTimeMs - 1000);
  const liveNps = Math.max(0, hitCountSoFar - npsWinStart);
  const liveBpm = Math.round(timeline.getBpmAt(currentTimeMs) * 10) / 10;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '700 22px "Space Grotesk", "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 8;
  const comboY = isUpsideDown ? height * 0.68 : height * 0.3;
  if (hitCountSoFar > 0) {
    ctx.fillText(String(hitCountSoFar), stageCenterX, comboY);
  }
  ctx.restore();

  ctx.save();
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(`${liveBpm} BPM · ${liveNps} NPS · ${scrollSpeed} 速`, 14, 24);
  ctx.restore();
}

export interface MinimapRenderParams {
  chart: ParsedManiaChart;
  currentTimeMs: number;
  viewStartMs: number;
  viewEndMs: number;
  scrollSpeed: number;
  hitPosition: number;
}

export function renderManiaMinimap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: MinimapRenderParams,
): void {
  const { chart, currentTimeMs, viewStartMs, viewEndMs, scrollSpeed, hitPosition } = params;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(12, 14, 22, 0.9)';
  ctx.fillRect(0, 0, width, height);

  const spanMs = Math.max(100, viewEndMs - viewStartMs);
  const leftPad = 36;
  const rightPad = 8;
  const laneAreaW = Math.max(40, width - leftPad - rightPad);
  const keys = chart.keyCount;
  const laneW = laneAreaW / keys;

  const timeToY = (t: number): number => ((t - viewStartMs) / spanMs) * height;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= keys; c++) {
    const x = Math.round(leftPad + c * laneW) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  const pxPerSec = height / (spanMs / 1000);
  const stepSec = pxPerSec < 16 ? 10 : 5;
  const firstTickSec = Math.ceil(viewStartMs / 1000 / stepSec) * stepSec;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  for (let s = firstTickSec; s * 1000 <= viewEndMs; s += stepSec) {
    const y = timeToY(s * 1000);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(leftPad, y, laneAreaW, 1);
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    ctx.fillStyle = 'rgba(160, 168, 194, 0.72)';
    ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, 4, Math.min(height - 7, Math.max(7, y)));
  }

  const scrollTimeMs = getScrollTimeMs(scrollSpeed, hitPosition);
  const winTop = timeToY(currentTimeMs);
  const winBot = timeToY(currentTimeMs + scrollTimeMs);
  if (winBot >= 0 && winTop <= height) {
    const clampedTop = Math.max(0, winTop);
    const clampedBot = Math.min(height, winBot);
    ctx.fillStyle = 'rgba(255, 102, 170, 0.12)';
    ctx.fillRect(leftPad, clampedTop, laneAreaW, Math.max(2, clampedBot - clampedTop));
  }

  const minNoteTime = viewStartMs - chart.maxLnDurationMs;
  let lo = 0;
  let hi = chart.notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (chart.notes[mid].time < minNoteTime) lo = mid + 1;
    else hi = mid;
  }

  for (let i = lo; i < chart.notes.length; i++) {
    const n = chart.notes[i];
    if (n.time > viewEndMs) break;
    if (n.endTime < viewStartMs) continue;

    const x = leftPad + n.col * laneW + 2;
    const w = Math.max(3, laneW - 4);
    const isInner =
      keys === 4
        ? n.col === 1 || n.col === 2
        : keys % 2 === 1 && n.col === Math.floor(keys / 2)
          ? 'center'
          : n.col % 2 === 1;
    const color =
      isInner === 'center'
        ? '#fbbf24'
        : isInner
          ? '#ff66aa'
          : '#7dd3fc';

    const y1 = timeToY(n.time);
    if (n.isHold) {
      const y2 = timeToY(n.endTime);
      const top = Math.max(-4, y1);
      const bot = Math.min(height + 4, y2);
      ctx.fillStyle = isInner ? 'rgba(255, 102, 170, 0.55)' : 'rgba(56, 189, 248, 0.55)';
      ctx.fillRect(x + w * 0.18, top, Math.max(2, w * 0.64), Math.max(3, bot - top));
      ctx.fillStyle = color;
      ctx.fillRect(x, y1 - 1.5, w, 3);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y1 - 1.5, w, 3);
    }
  }

  const py = timeToY(currentTimeMs);
  if (py >= -2 && py <= height + 2) {
    ctx.fillStyle = '#ff66aa';
    ctx.fillRect(0, py - 1, width, 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(leftPad - 4, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
