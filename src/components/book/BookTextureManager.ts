import * as THREE from 'three';
import { BookSummary } from '../../types';

export interface BookFaceTextures {
  topSpine: THREE.CanvasTexture;
  sideSpine: THREE.CanvasTexture;
  frontCover: THREE.CanvasTexture;
}

interface CachedBookEntry {
  bookKey: string;
  book: BookSummary;
  indexNumber: number;
  isDark: boolean;
  topCanvas: HTMLCanvasElement;
  sideCanvas: HTMLCanvasElement;
  frontCanvas: HTMLCanvasElement;
  topTex: THREE.CanvasTexture;
  sideTex: THREE.CanvasTexture;
  frontTex: THREE.CanvasTexture;
  image: HTMLImageElement | null;
  imageState: 'idle' | 'loading' | 'loaded' | 'error';
  lastUsed: number;
}

const MAX_CACHED_BOOKS = 220;
const MAX_CONCURRENT_LOADS = 4;

const AMBER_ACCENT = '#c5a16b';
const AMBER_LIGHT = '#b88b4a';

function hashHue(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

function formatBookNo(idx: number): string {
  const n = Math.max(1, idx + 1);
  return `NO.${String(n).padStart(3, '0')}`;
}

function drawBlurredPlaceholder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bookKey: string,
  isDark: boolean,
): void {
  const hue = hashHue(bookKey);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (isDark) {
    grad.addColorStop(0, `hsl(${hue}, 22%, 22%)`);
    grad.addColorStop(0.55, `hsl(${(hue + 28) % 360}, 18%, 17%)`);
    grad.addColorStop(1, `hsl(${(hue + 52) % 360}, 16%, 24%)`);
  } else {
    grad.addColorStop(0, `hsl(${hue}, 26%, 82%)`);
    grad.addColorStop(0.55, `hsl(${(hue + 28) % 360}, 20%, 88%)`);
    grad.addColorStop(1, `hsl(${(hue + 52) % 360}, 24%, 79%)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function truncateToFit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + '…' : '…';
}

export class BookTextureManager {
  private cache = new Map<string, CachedBookEntry>();
  private loadQueue: string[] = [];
  private activeLoads = 0;
  private activeKeys = new Set<string>();
  private dirtyPaintQueue: string[] = [];
  private dirtyPaintSet = new Set<string>();

  private blurCanvasA = document.createElement('canvas');
  private blurCanvasB = document.createElement('canvas');

  private isDark: boolean;
  private tick = 0;
  private disposed = false;
  private heroReqId = 0;
  private themeJobId = 0;

  readonly pageEdgeTexture: THREE.CanvasTexture;
  readonly backShellTexture: THREE.CanvasTexture;
  readonly heroInnerPageTexture: THREE.CanvasTexture;

  constructor(isDark: boolean) {
    this.isDark = isDark;
    this.pageEdgeTexture = this.createPageEdgeTexture(isDark);
    this.backShellTexture = this.createBackShellTexture(isDark);
    this.heroInnerPageTexture = this.createHeroInnerPageTexture(isDark);
  }

  private createPageEdgeTexture(isDark: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 512;
    this.paintPageEdge(c, isDark);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private paintPageEdge(c: HTMLCanvasElement, isDark: boolean): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = isDark ? '#273136' : '#e7e0d6';
    ctx.fillRect(0, 0, w, h);

    for (let x = 6; x < w - 6; x += 4) {
      ctx.fillStyle = isDark
        ? x % 8 === 0
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(0,0,0,0.16)'
        : x % 8 === 0
          ? 'rgba(255,255,255,0.38)'
          : 'rgba(130,115,96,0.12)';
      ctx.fillRect(x, 0, 1.5, h);
    }

    ctx.fillStyle = isDark ? '#546166' : '#cfc7bc';
    ctx.fillRect(0, 0, 5, h);
    ctx.fillRect(w - 5, 0, 5, h);
  }

  private createBackShellTexture(isDark: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    this.paintBackShell(c, isDark);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private paintBackShell(c: HTMLCanvasElement, isDark: boolean): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = isDark ? '#2b3438' : '#e6e0d8';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = isDark ? 'rgba(224,227,220,0.08)' : 'rgba(40,38,32,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  }

  private createHeroInnerPageTexture(isDark: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    this.paintHeroInnerPage(c, isDark);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private paintHeroInnerPage(c: HTMLCanvasElement, isDark: boolean): void {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = isDark ? '#1a2327' : '#f4f0ea';
    ctx.fillRect(0, 0, w, h);

    const gutter = ctx.createLinearGradient(0, 0, 44, 0);
    gutter.addColorStop(0, isDark ? 'rgba(0,0,0,0.34)' : 'rgba(80,70,58,0.14)');
    gutter.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gutter;
    ctx.fillRect(0, 0, 44, h);

    ctx.strokeStyle = isDark ? 'rgba(166,176,177,0.16)' : 'rgba(120,115,105,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.beginPath();
    ctx.moveTo(42, 74);
    ctx.lineTo(w - 42, 74);
    ctx.stroke();

    ctx.fillStyle = isDark ? 'rgba(166,176,177,0.45)' : 'rgba(110,104,94,0.5)';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText('ARCHIVE FOLIO // SYNTHESIZE INFORMATION', 42, 54);
  }

  /**
   * Two-stage downscale + blur pass for fast, heavy optical frosted glass blur
   * without stalling the main thread on large cover bitmaps.
   */
  private drawHeavyBlurredCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    cropYCenter: number,
    cropHeightFrac: number,
    smallW: number,
    smallH: number,
    smallBlurPx: number,
  ): void {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const targetRatio = w / h;
    let sw = iw;
    let sh = Math.min(ih, Math.max(ih * cropHeightFrac, sw / targetRatio));
    if (sw / sh > targetRatio) {
      sh = Math.min(ih, Math.max(24, ih * cropHeightFrac));
      sw = Math.min(iw, sh * targetRatio);
    } else {
      sw = iw;
      sh = Math.min(ih, sw / targetRatio);
    }
    const sx = Math.max(0, (iw - sw) * 0.5);
    const sy = Math.max(0, Math.min(ih - sh, ih * cropYCenter - sh * 0.5));

    const ca = this.blurCanvasA;
    const cb = this.blurCanvasB;
    if (ca.width !== smallW) ca.width = smallW;
    if (ca.height !== smallH) ca.height = smallH;
    if (cb.width !== smallW) cb.width = smallW;
    if (cb.height !== smallH) cb.height = smallH;

    const ctxA = ca.getContext('2d');
    const ctxB = cb.getContext('2d');
    if (!ctxA || !ctxB) {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return;
    }

    ctxA.clearRect(0, 0, smallW, smallH);
    ctxA.imageSmoothingEnabled = true;
    ctxA.imageSmoothingQuality = 'high';
    ctxA.drawImage(img, sx, sy, sw, sh, 0, 0, smallW, smallH);

    const pad = Math.ceil(smallBlurPx * 2.4);
    ctxB.clearRect(0, 0, smallW, smallH);
    ctxB.save();
    ctxB.imageSmoothingEnabled = true;
    ctxB.imageSmoothingQuality = 'high';
    if (smallBlurPx > 0 && 'filter' in ctxB) {
      ctxB.filter = `blur(${smallBlurPx}px) saturate(1.12)`;
    }
    ctxB.drawImage(ca, -pad, -pad, smallW + pad * 2, smallH + pad * 2);
    ctxB.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cb, 0, 0, smallW, smallH, 0, 0, w, h);
    ctx.restore();
  }

  setActiveKeys(keys: Set<string>): void {
    this.activeKeys = keys;
  }

  getVisualReadyCount(keys: Iterable<string>): { total: number; ready: number } {
    let total = 0;
    let ready = 0;
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      total += 1;
      const entry = this.cache.get(k);
      if (
        entry &&
        entry.isDark === this.isDark &&
        (entry.imageState === 'loaded' || entry.imageState === 'error') &&
        !this.dirtyPaintSet.has(k)
      ) {
        ready += 1;
      }
    }
    return { total, ready };
  }

  setDarkMode(isDark: boolean): void {
    if (this.isDark === isDark || this.disposed) return;
    this.isDark = isDark;
    this.themeJobId += 1;
    this.paintPageEdge(this.pageEdgeTexture.image as HTMLCanvasElement, isDark);
    this.pageEdgeTexture.needsUpdate = true;
    this.paintBackShell(this.backShellTexture.image as HTMLCanvasElement, isDark);
    this.backShellTexture.needsUpdate = true;
    this.paintHeroInnerPage(this.heroInnerPageTexture.image as HTMLCanvasElement, isDark);
    this.heroInnerPageTexture.needsUpdate = true;

    for (const key of this.activeKeys) {
      const entry = this.cache.get(key);
      if (entry) {
        entry.isDark = isDark;
        this.redrawEntry(entry);
        this.dirtyPaintSet.delete(key);
      }
    }
  }

  /**
   * Rebuilds visible cached book textures smoothly across animation frames so
   * theme switching never blocks the UI thread, while leaving off-screen entries
   * to repaint lazily via dirtyPaintQueue on scroll.
   */
  async setDarkModeAsync(
    isDark: boolean,
    prioritizedKeys: string[],
    onProgress?: (p: number) => void,
  ): Promise<void> {
    if (this.disposed) return;
    const jobId = ++this.themeJobId;
    this.isDark = isDark;

    this.paintPageEdge(this.pageEdgeTexture.image as HTMLCanvasElement, isDark);
    this.pageEdgeTexture.needsUpdate = true;
    this.paintBackShell(this.backShellTexture.image as HTMLCanvasElement, isDark);
    this.backShellTexture.needsUpdate = true;
    this.paintHeroInnerPage(this.heroInnerPageTexture.image as HTMLCanvasElement, isDark);
    this.heroInnerPageTexture.needsUpdate = true;

    const seen = new Set<string>();
    const targets: CachedBookEntry[] = [];
    for (const key of prioritizedKeys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = this.cache.get(key);
      if (entry) {
        targets.push(entry);
        this.dirtyPaintSet.delete(key);
      }
    }
    this.dirtyPaintQueue = this.dirtyPaintQueue.filter((k) => !seen.has(k));

    if (targets.length === 0) {
      onProgress?.(1);
      return;
    }

    const BATCH_SIZE = 8;
    let done = 0;

    await new Promise<void>((resolve) => {
      const stepBatch = () => {
        if (this.disposed || jobId !== this.themeJobId) {
          resolve();
          return;
        }
        const end = Math.min(targets.length, done + BATCH_SIZE);
        for (let i = done; i < end; i++) {
          const entry = targets[i];
          entry.isDark = isDark;
          this.redrawEntry(entry);
        }
        done = end;
        onProgress?.(done / targets.length);
        if (done >= targets.length) {
          resolve();
        } else {
          requestAnimationFrame(stepBatch);
        }
      };
      requestAnimationFrame(stepBatch);
    });
  }

  getBookTextures(book: BookSummary, indexNumber: number, prioritizeLoad = false): BookFaceTextures {
    this.tick += 1;
    let entry = this.cache.get(book.bookKey);

    if (!entry) {
      if (this.cache.size >= MAX_CACHED_BOOKS) {
        this.evictLeastRecentlyUsed();
      }
      const topCanvas = document.createElement('canvas');
      topCanvas.width = 512;
      topCanvas.height = 72;
      const sideCanvas = document.createElement('canvas');
      sideCanvas.width = 144;
      sideCanvas.height = 640;
      const frontCanvas = document.createElement('canvas');
      frontCanvas.width = 320;
      frontCanvas.height = 240;

      const topTex = new THREE.CanvasTexture(topCanvas);
      topTex.colorSpace = THREE.SRGBColorSpace;
      topTex.anisotropy = 4;

      const sideTex = new THREE.CanvasTexture(sideCanvas);
      sideTex.colorSpace = THREE.SRGBColorSpace;
      sideTex.anisotropy = 4;

      const frontTex = new THREE.CanvasTexture(frontCanvas);
      frontTex.colorSpace = THREE.SRGBColorSpace;
      frontTex.anisotropy = 4;

      entry = {
        bookKey: book.bookKey,
        book,
        indexNumber,
        isDark: this.isDark,
        topCanvas,
        sideCanvas,
        frontCanvas,
        topTex,
        sideTex,
        frontTex,
        image: null,
        imageState: 'idle',
        lastUsed: this.tick,
      };
      this.cache.set(book.bookKey, entry);
      // Immediately draw lightweight top architectural plate + fast placeholder faces
      this.redrawEntry(entry);
    } else {
      entry.lastUsed = this.tick;
      const metaChanged =
        entry.isDark !== this.isDark ||
        entry.indexNumber !== indexNumber ||
        entry.book !== book;
      if (metaChanged) {
        entry.isDark = this.isDark;
        entry.indexNumber = indexNumber;
        entry.book = book;
        this.drawTopSpine(entry);
        entry.topTex.needsUpdate = true;
        if (entry.image && entry.imageState === 'loaded') {
          this.enqueuePaint(book.bookKey, prioritizeLoad);
        } else {
          this.drawSideSpine(entry);
          this.drawFrontCover(entry);
          entry.sideTex.needsUpdate = true;
          entry.frontTex.needsUpdate = true;
        }
      }
    }

    if (entry.imageState === 'idle') {
      this.enqueueImageLoad(book.bookKey, prioritizeLoad);
    }

    return {
      topSpine: entry.topTex,
      sideSpine: entry.sideTex,
      frontCover: entry.frontTex,
    };
  }

  private enqueuePaint(bookKey: string, priority = false): void {
    if (this.disposed) return;
    if (this.dirtyPaintSet.has(bookKey)) {
      if (priority) {
        this.dirtyPaintQueue = [bookKey, ...this.dirtyPaintQueue.filter((k) => k !== bookKey)];
      }
      return;
    }
    this.dirtyPaintSet.add(bookKey);
    if (priority) this.dirtyPaintQueue.unshift(bookKey);
    else this.dirtyPaintQueue.push(bookKey);
  }

  /**
   * Frame-budgeted canvas blur & texture upload processor so rapid scrolling
   * stays locked at display refresh without hitching.
   */
  processPaintQueue(maxBooks = 2, maxMs = 3.5): number {
    if (this.disposed || this.dirtyPaintQueue.length === 0) return 0;
    const start = performance.now();
    let processed = 0;

    while (processed < maxBooks && this.dirtyPaintQueue.length > 0) {
      if (processed > 0 && performance.now() - start >= maxMs) break;
      const key = this.dirtyPaintQueue.shift()!;
      this.dirtyPaintSet.delete(key);
      const entry = this.cache.get(key);
      if (!entry) continue;

      entry.isDark = this.isDark;
      this.redrawEntry(entry);
      processed += 1;
    }
    return processed;
  }

  private enqueueImageLoad(bookKey: string, front = false): void {
    const entry = this.cache.get(bookKey);
    if (!entry || entry.imageState !== 'idle') return;
    if (this.loadQueue.includes(bookKey)) {
      if (front) {
        this.loadQueue = [bookKey, ...this.loadQueue.filter((k) => k !== bookKey)];
      }
      return;
    }
    if (front) this.loadQueue.unshift(bookKey);
    else this.loadQueue.push(bookKey);
    this.pumpQueue();
  }

  private pumpQueue(): void {
    if (this.disposed) return;
    while (this.activeLoads < MAX_CONCURRENT_LOADS && this.loadQueue.length > 0) {
      const bookKey = this.loadQueue.shift()!;
      const entry = this.cache.get(bookKey);
      if (!entry || entry.imageState !== 'idle') continue;

      entry.imageState = 'loading';
      this.activeLoads += 1;

      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const finalize = () => {
          this.activeLoads = Math.max(0, this.activeLoads - 1);
          const cur = this.cache.get(bookKey);
          if (!this.disposed && cur) {
            cur.image = img;
            cur.imageState = 'loaded';
            this.enqueuePaint(bookKey, this.activeKeys.has(bookKey));
          }
          this.pumpQueue();
        };

        if (typeof img.decode === 'function') {
          img.decode().catch(() => {}).finally(finalize);
        } else {
          finalize();
        }
      };
      img.onerror = () => {
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        const cur = this.cache.get(bookKey);
        if (!this.disposed && cur) {
          cur.imageState = 'error';
        }
        this.pumpQueue();
      };
      img.src = entry.book.coverUrl;
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTick = Infinity;

    for (const [k, v] of this.cache) {
      if (this.activeKeys.has(k)) continue;
      if (v.lastUsed < oldestTick) {
        oldestTick = v.lastUsed;
        oldestKey = k;
      }
    }

    if (!oldestKey) {
      for (const [k, v] of this.cache) {
        if (v.lastUsed < oldestTick) {
          oldestTick = v.lastUsed;
          oldestKey = k;
        }
      }
    }

    if (oldestKey) {
      const item = this.cache.get(oldestKey);
      if (item) {
        item.topTex.dispose();
        item.sideTex.dispose();
        item.frontTex.dispose();
      }
      this.dirtyPaintSet.delete(oldestKey);
      this.cache.delete(oldestKey);
    }
  }

  private redrawEntry(entry: CachedBookEntry): void {
    this.drawTopSpine(entry);
    this.drawSideSpine(entry);
    this.drawFrontCover(entry);
    entry.topTex.needsUpdate = true;
    entry.sideTex.needsUpdate = true;
    entry.frontTex.needsUpdate = true;
  }

  /**
   * Top face: clean RhineLab architectural casing only (cover art removed per spec #3),
   * featuring high-contrast catalog index, enlarged bold title, and performance badge.
   */
  private drawTopSpine(entry: CachedBookEntry): void {
    const c = entry.topCanvas;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    const dark = entry.isDark;
    const book = entry.book;

    ctx.clearRect(0, 0, w, h);

    // Clean matte Rhine Lab porcelain / slate casing
    ctx.fillStyle = dark ? '#202a2f' : '#ede8e0';
    ctx.fillRect(0, 0, w, h);

    // Subtle longitudinal architectural casing grooves
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(16, 4, w - 16, 3);
    ctx.fillRect(16, h - 7, w - 16, 3);

    // Outer frosted hairline rim
    ctx.strokeStyle = dark ? 'rgba(224,227,220,0.2)' : 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Left amber index inlay tab (16px wide)
    const accent = dark ? AMBER_ACCENT : AMBER_LIGHT;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 16, h);

    const ink = dark ? '#eef1ec' : '#111310';
    const muted = dark ? 'rgba(216,222,220,0.78)' : 'rgba(42,40,35,0.76)';

    ctx.fillStyle = muted;
    ctx.font = '800 15px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const noText = formatBookNo(entry.indexNumber);
    ctx.fillText(noText, 28, h * 0.5 + 0.5);

    const noWidth = ctx.measureText(noText).width;
    const rightBadge =
      book.bestPp !== null
        ? `${Math.round(book.bestPp)}PP`
        : book.maxStars > 0
          ? `★${book.maxStars.toFixed(1)}`
          : `${book.difficultyCount}D`;

    ctx.font = '800 15px "JetBrains Mono", monospace';
    const rightWidth = ctx.measureText(rightBadge).width;
    ctx.fillStyle = book.playCount > 0 ? accent : muted;
    ctx.fillText(rightBadge, w - rightWidth - 18, h * 0.5 + 0.5);

    // Divider tick
    ctx.fillStyle = dark ? 'rgba(224,227,220,0.28)' : 'rgba(25,27,22,0.24)';
    ctx.fillRect(28 + noWidth + 12, 16, 2, h - 32);

    const titleX = 28 + noWidth + 24;
    const titleMaxW = Math.max(80, w - titleX - rightWidth - 34);
    ctx.fillStyle = ink;
    ctx.font = '800 21px "Outfit", "Noto Sans SC", system-ui, sans-serif';
    const titleStr = truncateToFit(ctx, book.titleUnicode || book.title, titleMaxW);
    ctx.fillText(titleStr, titleX, h * 0.5 + 1);
  }

  /**
   * Side spine: heavily blurred cropped cover slice + crisp haloed large bold typography.
   */
  private drawSideSpine(entry: CachedBookEntry): void {
    const c = entry.sideCanvas;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    const dark = entry.isDark;
    const book = entry.book;

    ctx.clearRect(0, 0, w, h);

    if (entry.image && entry.imageState === 'loaded') {
      this.drawHeavyBlurredCover(ctx, entry.image, w, h, 0.5, 0.88, 16, 68, 2.0);
    } else {
      drawBlurredPlaceholder(ctx, w, h, book.bookKey, dark);
    }

    // Balanced frosted glaze keeping blurred hues expressive while grounding ink
    ctx.fillStyle = dark ? 'rgba(20, 27, 31, 0.50)' : 'rgba(244, 240, 234, 0.46)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = dark ? 'rgba(224,227,220,0.2)' : 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Top amber index cap
    ctx.fillStyle = dark ? AMBER_ACCENT : AMBER_LIGHT;
    ctx.fillRect(0, 0, w, 28);

    const ink = dark ? '#f3f5f1' : '#10120e';
    const muted = dark ? 'rgba(232,236,232,0.88)' : 'rgba(24,26,21,0.85)';
    const halo = dark ? 'rgba(12,17,20,0.72)' : 'rgba(248,245,240,0.78)';

    ctx.save();
    ctx.translate(w * 0.5, 48);
    ctx.rotate(Math.PI / 2);
    ctx.textBaseline = 'middle';

    ctx.font = '800 22px "JetBrains Mono", monospace';
    const noStr = formatBookNo(entry.indexNumber);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.strokeText(noStr, 0, 0);
    ctx.fillStyle = muted;
    ctx.fillText(noStr, 0, 0);

    const noW = ctx.measureText(noStr).width;
    ctx.fillStyle = dark ? 'rgba(224,227,220,0.34)' : 'rgba(25,27,22,0.28)';
    ctx.fillRect(noW + 10, -13, 2, 26);

    ctx.font = '800 30px "Outfit", "Noto Sans SC", system-ui, sans-serif';
    const titleX = noW + 22;
    const maxTitle = h - 108 - titleX;
    const titleFit = truncateToFit(ctx, book.titleUnicode || book.title, Math.max(70, maxTitle));
    ctx.lineWidth = 4;
    ctx.strokeStyle = halo;
    ctx.strokeText(titleFit, titleX, 0);
    ctx.fillStyle = ink;
    ctx.fillText(titleFit, titleX, 0);
    ctx.restore();

    // Bottom grade or client indicator
    if (book.bestGrade) {
      ctx.font = '800 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = halo;
      ctx.strokeText(book.bestGrade, w * 0.5, h - 28);
      ctx.fillStyle = dark ? AMBER_ACCENT : '#171914';
      ctx.fillText(book.bestGrade, w * 0.5, h - 28);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = book.inLazer ? '#a855f7' : '#0284c7';
      ctx.beginPath();
      ctx.arc(w * 0.5, h - 28, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Front face: heavy downscale-blurred frosted cover visible on the shelf and
   * during the beginning of book extraction before clarifying into the hero cover.
   */
  private drawFrontCover(entry: CachedBookEntry): void {
    const c = entry.frontCanvas;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    const dark = entry.isDark;
    const book = entry.book;

    ctx.clearRect(0, 0, w, h);

    if (entry.image && entry.imageState === 'loaded') {
      this.drawHeavyBlurredCover(ctx, entry.image, w, h, 0.5, 1.0, 26, 20, 2.2);
      ctx.fillStyle = dark ? 'rgba(17, 24, 27, 0.28)' : 'rgba(244, 240, 234, 0.26)';
      ctx.fillRect(0, 0, w, h);
    } else {
      drawBlurredPlaceholder(ctx, w, h, book.bookKey, dark);
    }

    ctx.strokeStyle = dark ? 'rgba(224,227,220,0.24)' : 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Top-left Rhine Lab specimen sticker
    ctx.fillStyle = dark ? 'rgba(17,24,27,0.84)' : 'rgba(246,243,237,0.9)';
    ctx.fillRect(16, 16, 136, 40);
    ctx.strokeStyle = dark ? 'rgba(166,176,177,0.3)' : 'rgba(40,42,36,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 16, 136, 40);

    ctx.fillStyle = dark ? '#e0e3dc' : '#151713';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('LOCAL ARCHIVE // OSU!', 23, 22);
    ctx.font = '800 15px "JetBrains Mono", monospace';
    ctx.fillText(formatBookNo(entry.indexNumber), 23, 35);

    // Top-right amber tab
    ctx.fillStyle = dark ? AMBER_ACCENT : AMBER_LIGHT;
    ctx.fillRect(w - 28, 0, 14, 16);
  }

  /**
   * Paints a crisp unblurred hero cover into a pre-allocated HeroBookRig canvas/texture
   * so opening and swapping books avoids per-click GPU texture allocations.
   */
  paintHeroSharpCover(
    targetCanvas: HTMLCanvasElement,
    targetTex: THREE.CanvasTexture,
    book: BookSummary,
    indexNumber: number,
  ): number {
    const reqId = ++this.heroReqId;
    const ctx = targetCanvas.getContext('2d');

    const paint = (img: HTMLImageElement | null) => {
      if (!ctx || this.disposed || reqId !== this.heroReqId) return;
      const w = targetCanvas.width;
      const h = targetCanvas.height;
      ctx.clearRect(0, 0, w, h);
      if (img) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.max(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(img, (w - dw) * 0.5, (h - dh) * 0.5, dw, dh);
      } else {
        drawBlurredPlaceholder(ctx, w, h, book.bookKey, this.isDark);
      }

      const grad = ctx.createLinearGradient(0, h * 0.58, 0, h);
      grad.addColorStop(0, 'rgba(10,12,14,0)');
      grad.addColorStop(1, 'rgba(10,12,14,0.72)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.58, w, h * 0.42);

      ctx.fillStyle = 'rgba(246,243,237,0.92)';
      ctx.fillRect(26, 26, 224, 62);
      ctx.fillStyle = '#151713';
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('ARCHIVE SPECIMEN // BOOK', 38, 36);
      ctx.font = '800 24px "JetBrains Mono", monospace';
      ctx.fillText(formatBookNo(indexNumber), 38, 55);

      ctx.fillStyle = '#f5f2ed';
      ctx.font = '700 26px "Outfit", "Noto Sans SC", system-ui, sans-serif';
      ctx.fillText(
        truncateToFit(ctx, book.titleUnicode || book.title, w - 60),
        30,
        h - 68,
      );
      ctx.fillStyle = 'rgba(235,230,222,0.84)';
      ctx.font = '500 17px "Outfit", "Noto Sans SC", system-ui, sans-serif';
      ctx.fillText(
        truncateToFit(ctx, `${book.artistUnicode || book.artist}  ·  ${book.creator}`, w - 60),
        30,
        h - 36,
      );

      targetTex.needsUpdate = true;
    };

    const cached = this.cache.get(book.bookKey);
    if (cached?.image && cached.imageState === 'loaded') {
      paint(cached.image);
    } else {
      paint(null);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode().catch(() => {}).finally(() => paint(img));
        } else {
          paint(img);
        }
      };
      img.src = book.coverUrl;
    }

    return reqId;
  }

  dispose(): void {
    this.disposed = true;
    this.themeJobId += 1;
    this.heroReqId += 1;
    this.loadQueue = [];
    this.dirtyPaintQueue = [];
    this.dirtyPaintSet.clear();
    for (const entry of this.cache.values()) {
      entry.topTex.dispose();
      entry.sideTex.dispose();
      entry.frontTex.dispose();
    }
    this.cache.clear();
    this.pageEdgeTexture.dispose();
    this.backShellTexture.dispose();
    this.heroInnerPageTexture.dispose();
  }
}
