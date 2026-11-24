import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BookSummary } from '../../types';

export type MosaicGridKey = '3x2' | '4x2' | '4x3' | '5x3';

export interface BookMosaicHandle {
  stepPage: (delta: -1 | 1) => void;
  jumpToPage: (nextPage: number) => void;
}

interface BookMosaicViewProps {
  books: BookSummary[];
  page: number;
  gridKey: MosaicGridKey;
  isDark: boolean;
  reducedMotion: boolean;
  spreadOpen: boolean;
  onPageChange: (nextPage: number) => void;
  onOpenBook: (bookIndex: number) => void;
  onHoverChange?: (book: BookSummary | null, bookIndex: number) => void;
}

interface CoverCacheEntry {
  img: HTMLImageElement | null;
  state: 'idle' | 'loading' | 'loaded' | 'error';
  lastUsed: number;
}

// Approved Optical Preset A (Soft Optical Window + Frosted Edge Color Bleed)
const OPTIC_CENTER_RATIO = 0.54;
const OPTIC_BLUR_PX = 38;
const OPTIC_SEAM_BLEED = 0.28;
const OPTIC_FROST_OPACITY = 0.18;
const OPTIC_ROUNDNESS = 0.16;
const OPTIC_GRAIN = 0.024;
const OPTIC_SATURATION = 1.06;
const OPTIC_HOVER_BOOST = 0.12;

const MAX_IMAGE_CACHE = 120;
const MAX_CONCURRENT_IMAGE_LOADS = 12;
const IRIS_CLOSE_MS = 200;
const IRIS_OPEN_MS = 260;

const GRID_DIMS: Record<MosaicGridKey, { cols: number; rows: number }> = {
  '3x2': { cols: 3, rows: 2 },
  '4x2': { cols: 4, rows: 2 },
  '4x3': { cols: 4, rows: 3 },
  '5x3': { cols: 5, rows: 3 },
};

export function getMosaicGridDimensions(
  gridKey: MosaicGridKey,
  totalBooks: number,
): { cols: number; rows: number } {
  const target = GRID_DIMS[gridKey];
  const cap = target.cols * target.rows;
  if (totalBooks <= 0 || totalBooks >= cap) return target;
  if (totalBooks === 1) return { cols: 1, rows: 1 };
  if (totalBooks === 2) return { cols: 2, rows: 1 };
  if (totalBooks <= 4) return { cols: 2, rows: 2 };
  if (totalBooks <= 6) return { cols: 3, rows: 2 };
  if (totalBooks <= 8) return { cols: 4, rows: 2 };
  return { cols: 4, rows: 3 };
}

function hashHue(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) * 0.5;
  const sy = (ih - sh) * 0.5;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawTonalPlaceholder(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  bookKey: string,
  isDark: boolean,
): void {
  const hue = hashHue(bookKey);
  const grad = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
  if (isDark) {
    grad.addColorStop(0, `hsl(${hue}, 24%, 20%)`);
    grad.addColorStop(1, `hsl(${(hue + 44) % 360}, 20%, 14%)`);
  } else {
    grad.addColorStop(0, `hsl(${hue}, 28%, 82%)`);
    grad.addColorStop(1, `hsl(${(hue + 44) % 360}, 22%, 75%)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(dx, dy, dw, dh);
}

export const BookMosaicView = forwardRef<BookMosaicHandle, BookMosaicViewProps>(
  function BookMosaicView(
    {
      books,
      page,
      gridKey,
      isDark,
      reducedMotion,
      spreadOpen,
      onPageChange,
      onOpenBook,
      onHoverChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Latest reactive props stored in refs so WebGL loop stays tear-free
    const booksRef = useRef(books);
    booksRef.current = books;
    const gridKeyRef = useRef(gridKey);
    gridKeyRef.current = gridKey;
    const isDarkRef = useRef(isDark);
    isDarkRef.current = isDark;
    const reducedMotionRef = useRef(reducedMotion);
    reducedMotionRef.current = reducedMotion;
    const spreadOpenRef = useRef(spreadOpen);
    spreadOpenRef.current = spreadOpen;
    const onPageChangeRef = useRef(onPageChange);
    onPageChangeRef.current = onPageChange;
    const onHoverChangeRef = useRef(onHoverChange);
    onHoverChangeRef.current = onHoverChange;

    const renderedPageRef = useRef(page);
    const sizeRef = useRef({ w: 1200, h: 720 });
    const hoverRef = useRef({ col: -1, row: -1, mix: 0, targetMix: 0, lastIdx: -1 });
    const irisAnimRef = useRef<{
      active: boolean;
      start: number;
      targetPage: number;
      swapped: boolean;
    }>({ active: false, start: 0, targetPage: 0, swapped: false });
    const irisScaleRef = useRef(1);
    const dirtySourcesRef = useRef(true);
    const needsDrawRef = useRef(true);

    // LRU Image Cache & Async Decoder Queue
    const imgCacheRef = useRef<Map<string, CoverCacheEntry>>(new Map());
    const loadQueueRef = useRef<Array<{ bookKey: string; coverUrl: string }>>([]);
    const activeLoadsRef = useRef(0);
    const cacheTickRef = useRef(0);
    const activeVisibleKeysRef = useRef<Set<string>>(new Set());
    const unmountedRef = useRef(false);

    // Offscreen compositing canvases
    const buffersRef = useRef<{
      sharp: HTMLCanvasElement;
      seam: HTMLCanvasElement;
      mid: HTMLCanvasElement;
      heavy: HTMLCanvasElement;
      blurStage: HTMLCanvasElement;
      tmpSeam: HTMLCanvasElement;
    } | null>(null);

    if (!buffersRef.current && typeof document !== 'undefined') {
      const sharp = document.createElement('canvas');
      sharp.width = 1200;
      sharp.height = 720;
      const seam = document.createElement('canvas');
      seam.width = 1200;
      seam.height = 720;
      const mid = document.createElement('canvas');
      mid.width = 384;
      mid.height = 230;
      const heavy = document.createElement('canvas');
      heavy.width = 192;
      heavy.height = 115;
      buffersRef.current = {
        sharp,
        seam,
        mid,
        heavy,
        blurStage: document.createElement('canvas'),
        tmpSeam: document.createElement('canvas'),
      };
    }

    // WebGL1 state
    const glStateRef = useRef<{
      gl: WebGLRenderingContext | null;
      prog: WebGLProgram | null;
      texSharp: WebGLTexture | null;
      texMid: WebGLTexture | null;
      texHeavy: WebGLTexture | null;
      buf: WebGLBuffer | null;
      uniforms: Record<string, WebGLUniformLocation | null>;
    }>({
      gl: null,
      prog: null,
      texSharp: null,
      texMid: null,
      texHeavy: null,
      buf: null,
      uniforms: {},
    });

    const getPageSlice = useCallback((targetPage: number) => {
      const curBooks = booksRef.current;
      const g = getMosaicGridDimensions(gridKeyRef.current, curBooks.length);
      const perPage = g.cols * g.rows;
      const totalPages = curBooks.length > 0 ? Math.max(1, Math.ceil(curBooks.length / perPage)) : 1;
      const safePage = ((targetPage % totalPages) + totalPages) % totalPages;
      const start = safePage * perPage;
      const slots: Array<{ book: BookSummary; bookIndex: number }> = [];
      if (curBooks.length > 0) {
        for (let i = 0; i < perPage; i++) {
          const idx = (start + i) % curBooks.length;
          slots.push({ book: curBooks[idx], bookIndex: idx });
        }
      }
      return { g, perPage, totalPages, safePage, slots };
    }, []);

    const pumpImageQueue = useCallback(() => {
      if (unmountedRef.current) return;
      const cache = imgCacheRef.current;
      const queue = loadQueueRef.current;

      while (activeLoadsRef.current < MAX_CONCURRENT_IMAGE_LOADS && queue.length > 0) {
        const job = queue.shift()!;
        const entry = cache.get(job.bookKey);
        if (!entry || entry.state !== 'idle') continue;

        entry.state = 'loading';
        activeLoadsRef.current += 1;

        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          const finalize = () => {
            activeLoadsRef.current = Math.max(0, activeLoadsRef.current - 1);
            const cur = cache.get(job.bookKey);
            if (!unmountedRef.current && cur) {
              cur.img = img;
              cur.state = 'loaded';
              if (activeVisibleKeysRef.current.has(job.bookKey)) {
                dirtySourcesRef.current = true;
              }
            }
            pumpImageQueue();
          };
          if (typeof img.decode === 'function') {
            img.decode().catch(() => {}).finally(finalize);
          } else {
            finalize();
          }
        };
        img.onerror = () => {
          activeLoadsRef.current = Math.max(0, activeLoadsRef.current - 1);
          const cur = cache.get(job.bookKey);
          if (!unmountedRef.current && cur) {
            cur.state = 'error';
          }
          pumpImageQueue();
        };
        img.src = job.coverUrl;
      }
    }, []);

    const requestCover = useCallback(
      (book: BookSummary, priority: boolean): HTMLImageElement | null => {
        const cache = imgCacheRef.current;
        cacheTickRef.current += 1;
        let entry = cache.get(book.bookKey);

        if (!entry) {
          if (cache.size >= MAX_IMAGE_CACHE) {
            let evictKey: string | null = null;
            let oldest = Infinity;
            for (const [k, v] of cache) {
              if (activeVisibleKeysRef.current.has(k)) continue;
              if (v.lastUsed < oldest) {
                oldest = v.lastUsed;
                evictKey = k;
              }
            }
            if (!evictKey) {
              for (const [k, v] of cache) {
                if (v.lastUsed < oldest) {
                  oldest = v.lastUsed;
                  evictKey = k;
                }
              }
            }
            if (evictKey) cache.delete(evictKey);
          }
          entry = { img: null, state: 'idle', lastUsed: cacheTickRef.current };
          cache.set(book.bookKey, entry);
        } else {
          entry.lastUsed = cacheTickRef.current;
        }

        if (entry.state === 'idle') {
          const q = loadQueueRef.current;
          const existingIdx = q.findIndex((item) => item.bookKey === book.bookKey);
          if (existingIdx >= 0) {
            if (priority && existingIdx > 0) {
              const [item] = q.splice(existingIdx, 1);
              q.unshift(item);
            }
          } else {
            if (priority) q.unshift({ bookKey: book.bookKey, coverUrl: book.coverUrl });
            else q.push({ bookKey: book.bookKey, coverUrl: book.coverUrl });
            pumpImageQueue();
          }
        }

        return entry.state === 'loaded' ? entry.img : null;
      },
      [pumpImageQueue],
    );

    const rebuildMosaicSources = useCallback(() => {
      const bufs = buffersRef.current;
      if (!bufs) return;

      const { w: W, h: H } = sizeRef.current;
      if (bufs.sharp.width !== W || bufs.sharp.height !== H) {
        bufs.sharp.width = W;
        bufs.sharp.height = H;
        bufs.seam.width = W;
        bufs.seam.height = H;
        bufs.mid.width = Math.max(240, Math.round(W * 0.34));
        bufs.mid.height = Math.max(144, Math.round(H * 0.34));
        bufs.heavy.width = Math.max(120, Math.round(W * 0.16));
        bufs.heavy.height = Math.max(72, Math.round(H * 0.16));
      }

      const { g, totalPages, safePage, slots } = getPageSlice(renderedPageRef.current);
      const sharpCtx = bufs.sharp.getContext('2d');
      const seamCtx = bufs.seam.getContext('2d');
      if (!sharpCtx || !seamCtx) return;

      sharpCtx.clearRect(0, 0, W, H);
      activeVisibleKeysRef.current.clear();

      if (slots.length === 0) {
        sharpCtx.fillStyle = isDarkRef.current ? '#11181b' : '#eae5e1';
        sharpCtx.fillRect(0, 0, W, H);
      } else {
        const tileW = W / g.cols;
        const tileH = H / g.rows;

        for (let r = 0; r < g.rows; r++) {
          for (let c = 0; c < g.cols; c++) {
            const slot = slots[r * g.cols + c];
            if (!slot) continue;
            activeVisibleKeysRef.current.add(slot.book.bookKey);

            const dx = Math.round(c * tileW);
            const dy = Math.round(r * tileH);
            const dw = Math.round((c + 1) * tileW) - dx;
            const dh = Math.round((r + 1) * tileH) - dy;

            const img = requestCover(slot.book, true);
            if (img) {
              drawCoverFit(sharpCtx, img, dx, dy, dw, dh);
            } else {
              drawTonalPlaceholder(sharpCtx, dx, dy, dw, dh, slot.book.bookKey, isDarkRef.current);
            }
          }
        }

        // Prefetch immediate neighbor pages quietly so iris flips are instantaneous
        if (totalPages > 1) {
          const nextSlice = getPageSlice(safePage + 1);
          const prevSlice = getPageSlice(safePage - 1);
          for (const s of nextSlice.slots) requestCover(s.book, false);
          for (const s of prevSlice.slots) requestCover(s.book, false);
        }

        // Cross-seam edge bleed before multi-tier Gaussian blur so adjacent covers blend with zero seam
        seamCtx.clearRect(0, 0, W, H);
        seamCtx.drawImage(bufs.sharp, 0, 0);

        const bleedDist = Math.max(8, Math.round(Math.min(tileW, tileH) * OPTIC_SEAM_BLEED * 0.44));
        const tCtx = bufs.tmpSeam.getContext('2d');
        if (tCtx && bleedDist > 0) {
          bufs.tmpSeam.width = bleedDist;
          bufs.tmpSeam.height = H;
          for (let c = 1; c < g.cols; c++) {
            const sx = Math.round(c * tileW);
            tCtx.globalCompositeOperation = 'source-over';
            tCtx.clearRect(0, 0, bleedDist, H);
            tCtx.drawImage(bufs.sharp, sx - bleedDist, 0, bleedDist, H, 0, 0, bleedDist, H);
            tCtx.globalCompositeOperation = 'destination-in';
            const gradL = tCtx.createLinearGradient(0, 0, bleedDist, 0);
            gradL.addColorStop(0, 'rgba(0,0,0,0.48)');
            gradL.addColorStop(1, 'rgba(0,0,0,0)');
            tCtx.fillStyle = gradL;
            tCtx.fillRect(0, 0, bleedDist, H);
            seamCtx.drawImage(bufs.tmpSeam, sx, 0);

            tCtx.globalCompositeOperation = 'source-over';
            tCtx.clearRect(0, 0, bleedDist, H);
            tCtx.drawImage(bufs.sharp, sx, 0, bleedDist, H, 0, 0, bleedDist, H);
            tCtx.globalCompositeOperation = 'destination-in';
            const gradR = tCtx.createLinearGradient(0, 0, bleedDist, 0);
            gradR.addColorStop(0, 'rgba(0,0,0,0)');
            gradR.addColorStop(1, 'rgba(0,0,0,0.48)');
            tCtx.fillStyle = gradR;
            tCtx.fillRect(0, 0, bleedDist, H);
            seamCtx.drawImage(bufs.tmpSeam, sx - bleedDist, 0);
          }

          bufs.tmpSeam.width = W;
          bufs.tmpSeam.height = bleedDist;
          for (let r = 1; r < g.rows; r++) {
            const sy = Math.round(r * tileH);
            tCtx.globalCompositeOperation = 'source-over';
            tCtx.clearRect(0, 0, W, bleedDist);
            tCtx.drawImage(bufs.seam, 0, sy - bleedDist, W, bleedDist, 0, 0, W, bleedDist);
            tCtx.globalCompositeOperation = 'destination-in';
            const gradT = tCtx.createLinearGradient(0, 0, 0, bleedDist);
            gradT.addColorStop(0, 'rgba(0,0,0,0.48)');
            gradT.addColorStop(1, 'rgba(0,0,0,0)');
            tCtx.fillStyle = gradT;
            tCtx.fillRect(0, 0, W, bleedDist);
            seamCtx.drawImage(bufs.tmpSeam, 0, sy);

            tCtx.globalCompositeOperation = 'source-over';
            tCtx.clearRect(0, 0, W, bleedDist);
            tCtx.drawImage(bufs.seam, 0, sy, W, bleedDist, 0, 0, W, bleedDist);
            tCtx.globalCompositeOperation = 'destination-in';
            const gradB = tCtx.createLinearGradient(0, 0, 0, bleedDist);
            gradB.addColorStop(0, 'rgba(0,0,0,0)');
            gradB.addColorStop(1, 'rgba(0,0,0,0.48)');
            tCtx.fillStyle = gradB;
            tCtx.fillRect(0, 0, W, bleedDist);
            seamCtx.drawImage(bufs.tmpSeam, 0, sy - bleedDist);
          }
        }
      }

      // Whole-mosaic two-tier Gaussian blur
      const blurStage = (dest: HTMLCanvasElement, stageW: number, stageH: number, blurPx: number) => {
        if (bufs.blurStage.width !== stageW) bufs.blurStage.width = stageW;
        if (bufs.blurStage.height !== stageH) bufs.blurStage.height = stageH;
        const stCtx = bufs.blurStage.getContext('2d');
        const dCtx = dest.getContext('2d');
        if (!stCtx || !dCtx) return;

        stCtx.clearRect(0, 0, stageW, stageH);
        stCtx.imageSmoothingEnabled = true;
        stCtx.imageSmoothingQuality = 'high';
        stCtx.drawImage(bufs.seam, 0, 0, stageW, stageH);

        const dw = dest.width;
        const dh = dest.height;
        dCtx.clearRect(0, 0, dw, dh);
        dCtx.save();
        dCtx.imageSmoothingEnabled = true;
        dCtx.imageSmoothingQuality = 'high';
        if ('filter' in dCtx) {
          dCtx.filter = `blur(${blurPx}px) saturate(1.1)`;
        }
        const pad = Math.ceil(blurPx * 2.2);
        dCtx.drawImage(bufs.blurStage, -pad, -pad, dw + pad * 2, dh + pad * 2);
        dCtx.restore();
      };

      blurStage(bufs.mid, 320, 192, Math.max(1.2, OPTIC_BLUR_PX * 0.14));
      blurStage(bufs.heavy, 128, 76, Math.max(2.2, OPTIC_BLUR_PX * 0.27));

      const gls = glStateRef.current;
      if (gls.gl) {
        const gl = gls.gl;
        const upload = (tex: WebGLTexture | null, src: HTMLCanvasElement) => {
          if (!tex) return;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        };
        upload(gls.texSharp, bufs.sharp);
        upload(gls.texMid, bufs.mid);
        upload(gls.texHeavy, bufs.heavy);
      }
      needsDrawRef.current = true;
    }, [getPageSlice, requestCover]);

    const compositeFrame = useCallback(() => {
      const canvas = canvasRef.current;
      const bufs = buffersRef.current;
      if (!canvas || !bufs) return;

      const { w: W, h: H } = sizeRef.current;
      const g = getMosaicGridDimensions(gridKeyRef.current, booksRef.current.length);
      const dark = isDarkRef.current;
      const frostCol = dark ? [0.067, 0.094, 0.106] : [0.918, 0.898, 0.882];
      const hov = hoverRef.current;
      const iris = irisScaleRef.current;

      const gls = glStateRef.current;
      if (gls.gl && gls.prog) {
        const gl = gls.gl;
        const u = gls.uniforms;
        gl.viewport(0, 0, W, H);
        gl.useProgram(gls.prog);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gls.texSharp);
        gl.uniform1i(u.uSharp, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, gls.texMid);
        gl.uniform1i(u.uMid, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, gls.texHeavy);
        gl.uniform1i(u.uHeavy, 2);

        gl.uniform2f(u.uGrid, g.cols, g.rows);
        gl.uniform2f(u.uRes, W, H);
        gl.uniform1f(u.uCenterRatio, OPTIC_CENTER_RATIO);
        gl.uniform1f(u.uRoundness, OPTIC_ROUNDNESS);
        gl.uniform1f(u.uFrostOpacity, OPTIC_FROST_OPACITY);
        gl.uniform3f(u.uFrostColor, frostCol[0], frostCol[1], frostCol[2]);
        gl.uniform2f(u.uHoverCell, hov.col, hov.row);
        gl.uniform1f(u.uHoverMix, hov.mix);
        gl.uniform1f(u.uIrisScale, iris);
        gl.uniform1f(u.uSaturation, OPTIC_SATURATION);
        gl.uniform1f(u.uGrain, OPTIC_GRAIN);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return;
      }

      // Canvas2D Optical Compositor Fallback
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bufs.heavy, 0, 0, W, H);
      ctx.fillStyle = dark
        ? `rgba(17,24,27,${OPTIC_FROST_OPACITY})`
        : `rgba(234,229,225,${OPTIC_FROST_OPACITY})`;
      ctx.fillRect(0, 0, W, H);

      const tileW = W / g.cols;
      const tileH = H / g.rows;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          const isHov = c === hov.col && r === hov.row;
          const eff = Math.max(
            0,
            Math.min(0.92, (OPTIC_CENTER_RATIO + (isHov ? hov.mix * OPTIC_HOVER_BOOST : 0)) * iris),
          );
          if (eff <= 0.02) continue;
          const cw = tileW * eff;
          const ch = tileH * eff;
          const cx = c * tileW + (tileW - cw) * 0.5;
          const cy = r * tileH + (tileH - ch) * 0.5;
          const rad = OPTIC_ROUNDNESS * Math.min(cw, ch) * 0.5;

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(cx, cy, cw, ch, rad);
          ctx.clip();
          ctx.drawImage(bufs.sharp, cx, cy, cw, ch, cx, cy, cw, ch);
          ctx.restore();
        }
      }
    }, []);

    const triggerIrisTransition = useCallback(
      (targetPage: number) => {
        const { totalPages } = getPageSlice(0);
        if (totalPages <= 1 && targetPage === renderedPageRef.current) return;
        const wrapped = ((targetPage % totalPages) + totalPages) % totalPages;
        if (wrapped === renderedPageRef.current && !irisAnimRef.current.active) return;

        if (reducedMotionRef.current) {
          renderedPageRef.current = wrapped;
          onPageChangeRef.current(wrapped);
          dirtySourcesRef.current = true;
          return;
        }

        irisAnimRef.current = {
          active: true,
          start: performance.now(),
          targetPage: wrapped,
          swapped: false,
        };
      },
      [getPageSlice],
    );

    useImperativeHandle(
      ref,
      () => ({
        stepPage: (delta: -1 | 1) => {
          const { totalPages } = getPageSlice(0);
          if (totalPages <= 1) return;
          triggerIrisTransition(renderedPageRef.current + delta);
        },
        jumpToPage: (nextPage: number) => {
          triggerIrisTransition(nextPage);
        },
      }),
      [getPageSlice, triggerIrisTransition],
    );

    // Cancel in-flight iris animation when dataset or grid layout resets
    useEffect(() => {
      irisAnimRef.current.active = false;
      irisScaleRef.current = 1;
      renderedPageRef.current = page;
      dirtySourcesRef.current = true;
    }, [books, gridKey]);

    // Sync theme or external page changes cleanly when iris transition is idle
    useEffect(() => {
      if (!irisAnimRef.current.active) {
        renderedPageRef.current = page;
        dirtySourcesRef.current = true;
      }
    }, [page, isDark]);

    // Initialize WebGL1 / ResizeObserver / Animation Loop
    useEffect(() => {
      unmountedRef.current = false;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const initGL = () => {
        try {
          const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
          if (!gl) return;

          const vsSrc = `
            attribute vec2 aPos;
            varying vec2 vUv;
            void main() {
              vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
              gl_Position = vec4(aPos, 0.0, 1.0);
            }
          `;
          const fsSrc = `
            precision mediump float;
            varying vec2 vUv;
            uniform sampler2D uSharp;
            uniform sampler2D uMid;
            uniform sampler2D uHeavy;
            uniform vec2 uGrid;
            uniform vec2 uRes;
            uniform float uCenterRatio;
            uniform float uRoundness;
            uniform float uFrostOpacity;
            uniform vec3 uFrostColor;
            uniform vec2 uHoverCell;
            uniform float uHoverMix;
            uniform float uIrisScale;
            uniform float uSaturation;
            uniform float uGrain;

            float sdRoundedBox(vec2 p, vec2 b, float r) {
              vec2 q = abs(p) - b + vec2(r);
              return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
            }

            vec3 applySat(vec3 rgb, float sat) {
              float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
              return mix(vec3(luma), rgb, sat);
            }

            void main() {
              vec2 gridPos = vUv * uGrid;
              vec2 cell = floor(gridPos);
              vec2 local = fract(gridPos) - 0.5;

              vec2 tileAspect = vec2(uRes.x / uGrid.x, uRes.y / uGrid.y);
              tileAspect /= min(tileAspect.x, tileAspect.y);

              float isHov = step(abs(cell.x - uHoverCell.x), 0.1) * step(abs(cell.y - uHoverCell.y), 0.1);
              float effCenter = clamp((uCenterRatio + isHov * uHoverMix * 0.12) * uIrisScale, 0.0, 0.92);

              vec2 p = local * tileAspect;
              vec2 halfBox = vec2(effCenter * 0.5) * tileAspect;
              float cornerR = uRoundness * min(halfBox.x, halfBox.y);
              float sdf = sdRoundedBox(p, halfBox, cornerR);

              float featherSpan = mix(0.22, 0.34, 1.0 - clamp(effCenter, 0.0, 1.0));
              float frostT = uIrisScale < 0.01 ? 1.0 : smoothstep(-0.04, featherSpan, sdf);

              vec3 sharpCol = texture2D(uSharp, vUv).rgb;
              vec3 midCol = texture2D(uMid, vUv).rgb;
              vec3 heavyCol = texture2D(uHeavy, vUv).rgb;

              vec3 baseCol = mix(sharpCol, midCol, smoothstep(0.0, 0.48, frostT));
              baseCol = mix(baseCol, heavyCol, smoothstep(0.42, 1.0, frostT));
              baseCol = mix(baseCol, applySat(baseCol, uSaturation), frostT);

              float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
              float veil = frostT * uFrostOpacity;
              vec3 col = mix(baseCol, uFrostColor, veil) + noise * frostT * uGrain;

              gl_FragColor = vec4(col, 1.0);
            }
          `;

          const compile = (type: number, src: string) => {
            const sh = gl.createShader(type);
            if (!sh) throw new Error('Shader alloc failed');
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
              throw new Error(gl.getShaderInfoLog(sh) || 'Shader error');
            }
            return sh;
          };

          const vs = compile(gl.VERTEX_SHADER, vsSrc);
          const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
          const prog = gl.createProgram();
          if (!prog) throw new Error('Program alloc failed');
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(prog) || 'Program link failed');
          }
          gl.deleteShader(vs);
          gl.deleteShader(fs);

          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
          );
          const loc = gl.getAttribLocation(prog, 'aPos');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

          const makeTex = () => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
          };

          const uniformNames = [
            'uSharp',
            'uMid',
            'uHeavy',
            'uGrid',
            'uRes',
            'uCenterRatio',
            'uRoundness',
            'uFrostOpacity',
            'uFrostColor',
            'uHoverCell',
            'uHoverMix',
            'uIrisScale',
            'uSaturation',
            'uGrain',
          ];
          const uniforms: Record<string, WebGLUniformLocation | null> = {};
          for (const name of uniformNames) {
            uniforms[name] = gl.getUniformLocation(prog, name);
          }

          glStateRef.current = {
            gl,
            prog,
            texSharp: makeTex(),
            texMid: makeTex(),
            texHeavy: makeTex(),
            buf,
            uniforms,
          };
        } catch {
          glStateRef.current.gl = null;
        }
      };

      const syncCanvasSize = () => {
        const cw = Math.max(320, container.clientWidth);
        const ch = Math.max(240, container.clientHeight);
        const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
        const nextW = Math.min(1440, Math.max(640, Math.round(cw * dpr)));
        const nextH = Math.min(900, Math.max(360, Math.round(ch * dpr)));
        if (
          Math.abs(nextW - sizeRef.current.w) >= 8 ||
          Math.abs(nextH - sizeRef.current.h) >= 8 ||
          canvas.width !== nextW ||
          canvas.height !== nextH
        ) {
          sizeRef.current = { w: nextW, h: nextH };
          canvas.width = nextW;
          canvas.height = nextH;
          rebuildMosaicSources();
          compositeFrame();
          dirtySourcesRef.current = false;
          needsDrawRef.current = false;
        }
      };

      initGL();
      syncCanvasSize();
      rebuildMosaicSources();
      compositeFrame();
      dirtySourcesRef.current = false;
      needsDrawRef.current = false;

      const ro = new ResizeObserver(syncCanvasSize);
      ro.observe(container);

      let rafId = 0;
      let lastNow = performance.now();

      const loop = (now: number) => {
        if (unmountedRef.current) return;
        rafId = requestAnimationFrame(loop);

        const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
        lastNow = now;

        // 1. Update frost-iris page transition
        const irisAnim = irisAnimRef.current;
        if (irisAnim.active) {
          const elapsed = now - irisAnim.start;
          if (elapsed < IRIS_CLOSE_MS) {
            const t = elapsed / IRIS_CLOSE_MS;
            irisScaleRef.current = 1 - t * t;
            needsDrawRef.current = true;
          } else {
            if (!irisAnim.swapped) {
              irisAnim.swapped = true;
              renderedPageRef.current = irisAnim.targetPage;
              hoverRef.current.col = -1;
              hoverRef.current.row = -1;
              hoverRef.current.targetMix = 0;
              hoverRef.current.mix = 0;
              hoverRef.current.lastIdx = -1;
              onHoverChangeRef.current?.(null, -1);
              onPageChangeRef.current(irisAnim.targetPage);
              dirtySourcesRef.current = true;
            }
            const tOpen = Math.min(1, (elapsed - IRIS_CLOSE_MS) / IRIS_OPEN_MS);
            irisScaleRef.current = 1 - Math.pow(1 - tOpen, 3);
            needsDrawRef.current = true;

            if (tOpen >= 1) {
              irisScaleRef.current = 1;
              irisAnim.active = false;
            }
          }
        }

        // 2. Smooth hover window expansion spring
        const hov = hoverRef.current;
        const hovDiff = hov.targetMix - hov.mix;
        if (Math.abs(hovDiff) > 0.002) {
          hov.mix += hovDiff * (1 - Math.exp(-dt * 12));
          needsDrawRef.current = true;
        } else if (hov.mix !== hov.targetMix) {
          hov.mix = hov.targetMix;
          needsDrawRef.current = true;
        }

        // 3. Batch source rebuild at most once per frame when images decode/resize
        if (dirtySourcesRef.current) {
          dirtySourcesRef.current = false;
          rebuildMosaicSources();
        }

        // 4. Composite final optical frame
        if (needsDrawRef.current) {
          needsDrawRef.current = false;
          compositeFrame();
        }
      };

      rafId = requestAnimationFrame(loop);

      return () => {
        unmountedRef.current = true;
        cancelAnimationFrame(rafId);
        ro.disconnect();

        const gls = glStateRef.current;
        if (gls.gl) {
          const gl = gls.gl;
          if (gls.texSharp) gl.deleteTexture(gls.texSharp);
          if (gls.texMid) gl.deleteTexture(gls.texMid);
          if (gls.texHeavy) gl.deleteTexture(gls.texHeavy);
          if (gls.buf) gl.deleteBuffer(gls.buf);
          if (gls.prog) gl.deleteProgram(gls.prog);
        }
        glStateRef.current = {
          gl: null,
          prog: null,
          texSharp: null,
          texMid: null,
          texHeavy: null,
          buf: null,
          uniforms: {},
        };
      };
    }, [compositeFrame, rebuildMosaicSources]);

    const resolveTileAtPointer = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(0.9999, (clientY - rect.top) / rect.height));
      const { g, slots } = getPageSlice(renderedPageRef.current);
      if (slots.length === 0) return null;
      const col = Math.max(0, Math.min(g.cols - 1, Math.floor(x * g.cols)));
      const row = Math.max(0, Math.min(g.rows - 1, Math.floor(y * g.rows)));
      const slot = slots[row * g.cols + col];
      return slot ? { col, row, slot } : null;
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (irisAnimRef.current.active || spreadOpenRef.current) return;
      const hit = resolveTileAtPointer(e.clientX, e.clientY);
      if (!hit) return;

      const hov = hoverRef.current;
      if (hit.col !== hov.col || hit.row !== hov.row) {
        hov.col = hit.col;
        hov.row = hit.row;
        hov.mix = reducedMotionRef.current ? 1 : 0.18;
        hov.targetMix = 1;
        needsDrawRef.current = true;
      }
      if (hit.slot.bookIndex !== hov.lastIdx) {
        hov.lastIdx = hit.slot.bookIndex;
        onHoverChangeRef.current?.(hit.slot.book, hit.slot.bookIndex);
      }
    };

    const handlePointerLeave = () => {
      hoverRef.current.targetMix = 0;
      if (hoverRef.current.lastIdx !== -1) {
        hoverRef.current.lastIdx = -1;
        onHoverChangeRef.current?.(null, -1);
      }
    };

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (irisAnimRef.current.active || spreadOpenRef.current) return;
      const hit = resolveTileAtPointer(e.clientX, e.clientY);
      if (hit) {
        onOpenBook(hit.slot.bookIndex);
      }
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      if (spreadOpenRef.current || irisAnimRef.current.active) return;
      if (Math.abs(e.deltaY) < 12) return;
      const { totalPages } = getPageSlice(0);
      if (totalPages <= 1) return;
      triggerIrisTransition(renderedPageRef.current + (e.deltaY > 0 ? 1 : -1));
    };

    const { totalPages } = getPageSlice(page);

    return (
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="group/mosaic relative h-full w-full overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
          className="block h-full w-full cursor-pointer"
        />

        {/* Subtle Edge Page-Turn Triggers (Zero cover obstruction) */}
        {totalPages > 1 && !spreadOpen && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerIrisTransition(renderedPageRef.current - 1);
              }}
              aria-label="上一页封面阵列"
              className="absolute top-1/2 left-3 flex h-11 w-9 -translate-y-1/2 items-center justify-center border border-[var(--rb-line)]/70 bg-[var(--rb-paper)]/72 text-[var(--rb-ink)] opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover/mosaic:opacity-90 hover:border-[var(--rb-accent)] hover:!opacity-100"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerIrisTransition(renderedPageRef.current + 1);
              }}
              aria-label="下一页封面阵列"
              className="absolute top-1/2 right-3 flex h-11 w-9 -translate-y-1/2 items-center justify-center border border-[var(--rb-line)]/70 bg-[var(--rb-paper)]/72 text-[var(--rb-ink)] opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover/mosaic:opacity-90 hover:border-[var(--rb-accent)] hover:!opacity-100"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </>
        )}
      </div>
    );
  },
);
