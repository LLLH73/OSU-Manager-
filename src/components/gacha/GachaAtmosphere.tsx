import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

export type GachaBackdropMode = 'dating' | 'pack' | 'guess';

const SCRAMBLE_LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/+<>*';
const SCRAMBLE_WIDE = '▚▞▙▟■□▪◆◇▤▥';

interface ScrambleTextProps {
  text: string;
  triggerKey?: string | number;
  durationMs?: number;
  className?: string;
}

/**
 * Decodes typographic titles out of geometric/alphanumeric noise cleanly (`fx.ts` style).
 */
export function ScrambleText({
  text,
  triggerKey,
  durationMs = 360,
  className = '',
}: ScrambleTextProps) {
  const [rendered, setRendered] = useState(text);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !text) {
      setRendered(text);
      return undefined;
    }

    const chars = Array.from(text);
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      if (p >= 1) {
        setRendered(text);
        return;
      }
      const out = chars
        .map((c, idx) => {
          if (c === ' ' || idx / chars.length < p * 1.18 - 0.14) return c;
          const isWide = /[\u3000-\u9fff]/.test(c);
          const pool = isWide ? SCRAMBLE_WIDE : SCRAMBLE_LATIN;
          return pool[Math.floor(Math.random() * pool.length)];
        })
        .join('');
      setRendered(out);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, triggerKey, durationMs]);

  return <span className={className}>{rendered}</span>;
}

export interface GachaAtmosphereHandle {
  triggerEffect: (intensity?: number, hexColor?: string) => void;
}

interface GachaAtmosphereProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDark: boolean;
  mode: GachaBackdropMode;
  blueprint: boolean;
  accentHex?: string;
  canvasHex?: string;
}

interface BurstState {
  id: number;
  color: string;
  frames: Array<{
    circles: Array<{ cx: number; cy: number; r: number }>;
    links: Array<[number, number, number, number]>;
    dot: { x: number; y: number; n: number };
    cross: { x: number; y: number };
    glyph: { ch: string; x: number; y: number; size: number; flip: boolean };
  }>;
  blocks: Array<{ left: number; top: number; w: number; h: number; bg: string; f: number }>;
}

function buildStopMotionBurst(seed: number, color: string): BurstState {
  let s = (seed * 9301 + 49297) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const glyphs = 'NACTIEVSOKR';
  const frames = [0, 1, 2].map(() => {
    const count = 4 + Math.floor(rand() * 3);
    const circles = Array.from({ length: count }, () => ({
      cx: 8 + rand() * 84,
      cy: 12 + rand() * 74,
      r: 1.6 + rand() * 5.8,
    }));
    const links: Array<[number, number, number, number]> = [];
    for (let i = 1; i < circles.length; i += 1) {
      if (rand() < 0.72) {
        links.push([circles[i - 1].cx, circles[i - 1].cy, circles[i].cx, circles[i].cy]);
      }
    }
    const first = circles[0];
    const last = circles[circles.length - 1];
    return {
      circles,
      links,
      dot: { x: first.cx + 3, y: first.cy - 3, n: 1 + Math.floor(rand() * 9) },
      cross: { x: last.cx, y: last.cy },
      glyph: {
        ch: glyphs[Math.floor(rand() * glyphs.length)],
        x: 8 + rand() * 78,
        y: 22 + rand() * 64,
        size: 7 + rand() * 9,
        flip: rand() < 0.45,
      },
    };
  });

  const blockPalette = ['var(--ga-ink)', 'var(--ga-cobalt)', color, 'rgba(180,192,200,0.45)'];
  const blocks = Array.from({ length: 8 }, () => ({
    left: 20 + rand() * 68,
    top: 8 + rand() * 82,
    w: 1.4 + rand() * 3.2,
    h: 0.7 + rand() * 2.0,
    bg: blockPalette[Math.floor(rand() * blockPalette.length)],
    f: Math.floor(rand() * 3),
  }));

  return { id: seed, color, frames, blocks };
}

interface FieldNode {
  x: number;
  y: number;
  r: number;
  seed: number;
}

const MARGIN_LANE_BLOCKS = [
  { lane: 0, y: 8, h: 12, accent: true },
  { lane: 2, y: 26, h: 28, accent: false },
  { lane: 1, y: 66, h: 10, accent: false },
  { lane: 3, y: 88, h: 34, accent: true },
  { lane: 0, y: 136, h: 10, accent: false },
  { lane: 2, y: 158, h: 24, accent: false },
  { lane: 1, y: 196, h: 10, accent: true },
  { lane: 3, y: 222, h: 30, accent: false },
  { lane: 0, y: 268, h: 12, accent: true },
  { lane: 2, y: 294, h: 18, accent: false },
  { lane: 1, y: 326, h: 10, accent: false },
  { lane: 3, y: 350, h: 28, accent: true },
];

const GHOST_GLYPHS = [
  { char: 'O', left: '4%', top: '14%', size: 'clamp(42px, 5vw, 76px)', depth: 0.35 },
  { char: 'S', left: '92%', top: '18%', size: 'clamp(40px, 4.5vw, 68px)', depth: 0.55 },
  { char: 'U', left: '8%', top: '78%', size: 'clamp(36px, 4vw, 62px)', depth: 0.42 },
  { char: '06', left: '89%', top: '76%', size: 'clamp(46px, 5.2vw, 82px)', depth: 0.28 },
  { char: '✦', left: '49%', top: '8%', size: 'clamp(24px, 2.5vw, 38px)', depth: 0.65 },
];

const RETICLE_SELECTOR = 'button:not(:disabled), a, select, input[type="range"], [data-ga-target]';

/**
 * Full-bleed flat 2D Swiss / Constructivist PROUN × osu! graphic design backdrop:
 * - Zero WebGL / 3D meshes (crisp vector poster geometry + subtle parallax)
 * - Mode-responsive flat geometric compositions (dating / pack / guess)
 * - Far-margin 2D osu!mania 4K editorial rhythm strips
 * - Light NodeField Canvas2D + ghost glyphs + vertical marginalia + Reticle brackets
 */
export const GachaAtmosphere = forwardRef<GachaAtmosphereHandle, GachaAtmosphereProps>(
  function GachaAtmosphere({ containerRef, isDark, mode, blueprint, accentHex }, ref) {
    const nodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const reticleBoxRef = useRef<HTMLDivElement | null>(null);
    const reticleLabelRef = useRef<HTMLSpanElement | null>(null);

    const [pointerShift, setPointerShift] = useState({ x: 0, y: 0 });
    const [burst, setBurst] = useState<BurstState | null>(null);
    const [pulseRing, setPulseRing] = useState<{ id: number; color: string } | null>(null);
    const burstNonceRef = useRef(0);
    const burstTimerRef = useRef<number | null>(null);
    const pulseTimerRef = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        triggerEffect: (_intensity = 1, hexColor?: string) => {
          const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          if (reduced) return;
          burstNonceRef.current += 1;
          const id = burstNonceRef.current;
          const color = hexColor || accentHex || (isDark ? '#6c8eff' : '#3a5bc2');
          setBurst(buildStopMotionBurst(id, color));
          setPulseRing({ id, color });
          if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
          if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
          burstTimerRef.current = window.setTimeout(() => setBurst(null), 640);
          pulseTimerRef.current = window.setTimeout(() => setPulseRing(null), 600);
        },
      }),
      [isDark, accentHex],
    );

    useEffect(() => {
      return () => {
        if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
        if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      };
    }, []);

    // Reticle bracket tracker + subtle drifting architectural NodeField canvas
    useEffect(() => {
      const container = containerRef.current;
      const canvas = nodeCanvasRef.current;
      if (!container) return undefined;

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

      let px = -200;
      let py = -200;
      let visible = false;
      let targetEl: Element | null = null;
      let bx = -200;
      let by = -200;
      let bw = 28;
      let bh = 28;
      let raf = 0;
      let lastTime = performance.now();
      let clock = 0;

      // Seeded sparse node field
      const nodes: FieldNode[] = Array.from({ length: 12 }, (_, i) => ({
        x: 0.08 + ((i * 73) % 86) / 100,
        y: 0.14 + ((i * 41) % 74) / 100,
        r: 2.5 + (i % 3) * 1.4,
        seed: i * 1.7,
      }));

      const ctx = canvas ? canvas.getContext('2d') : null;
      let cw = 0;
      let ch = 0;
      const resizeCanvas = () => {
        if (!canvas || !ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        cw = canvas.clientWidth;
        ch = canvas.clientHeight;
        canvas.width = Math.max(1, Math.floor(cw * dpr));
        canvas.height = Math.max(1, Math.floor(ch * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resizeCanvas();
      const ro = canvas ? new ResizeObserver(resizeCanvas) : null;
      if (canvas && ro) ro.observe(canvas);

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const rect = container.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        px = lx;
        py = ly;

        const nx = (lx / Math.max(1, rect.width) - 0.5) * 2;
        const ny = (ly / Math.max(1, rect.height) - 0.5) * 2;
        setPointerShift({ x: nx, y: ny });

        if (!finePointer) return;
        if (!visible) {
          visible = true;
          bx = lx - 14;
          by = ly - 14;
        }
        const rawHit = (e.target as Element | null)?.closest?.(RETICLE_SELECTOR) ?? null;
        const hit = rawHit?.closest?.('footer') ? null : rawHit;
        if (hit !== targetEl) {
          targetEl = hit;
          if (reticleBoxRef.current) {
            reticleBoxRef.current.setAttribute('data-locked', hit ? 'true' : 'false');
          }
        }
        if (reticleLabelRef.current) {
          const customLabel =
            hit?.getAttribute('data-ga-cursor') || hit?.getAttribute('aria-label') || '';
          reticleLabelRef.current.textContent =
            customLabel && customLabel.length <= 22
              ? customLabel.toUpperCase()
              : `X ${String(Math.round(lx)).padStart(4, '0')} · Y ${String(Math.round(ly)).padStart(4, '0')}`;
        }
      };

      const onPointerLeave = () => {
        visible = false;
        targetEl = null;
        if (reticleBoxRef.current) {
          reticleBoxRef.current.style.opacity = '0';
          reticleBoxRef.current.setAttribute('data-locked', 'false');
        }
        if (reticleLabelRef.current) {
          reticleLabelRef.current.style.opacity = '0';
        }
      };

      const tick = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        clock += dt;

        // Animate Reticle brackets smoothly toward hovered target (hidden when any dialog is open)
        if (finePointer && !reduced && reticleBoxRef.current && reticleLabelRef.current) {
          const hasDialog = Boolean(document.querySelector('[role="dialog"]'));
          if (!visible || hasDialog) {
            reticleBoxRef.current.style.opacity = '0';
            reticleLabelRef.current.style.opacity = '0';
          } else {
            const cRect = container.getBoundingClientRect();
            let tx = px - 13;
            let ty = py - 13;
            let tw = 26;
            let th = 26;
            if (targetEl && !targetEl.isConnected) {
              targetEl = null;
              reticleBoxRef.current.setAttribute('data-locked', 'false');
              reticleLabelRef.current.textContent = `X ${String(Math.round(px)).padStart(4, '0')} · Y ${String(Math.round(py)).padStart(4, '0')}`;
            }
            if (targetEl && targetEl.isConnected) {
              const r = targetEl.getBoundingClientRect();
              if (r.width > 0 && r.width < cRect.width * 0.55 && r.height < cRect.height * 0.45) {
                tx = r.left - cRect.left - 5;
                ty = r.top - cRect.top - 5;
                tw = r.width + 10;
                th = r.height + 10;
              }
            }
            const k = 1 - Math.exp(-dt * 20);
            bx += (tx - bx) * k;
            by += (ty - by) * k;
            bw += (tw - bw) * k;
            bh += (th - bh) * k;
            reticleBoxRef.current.style.opacity = targetEl ? '0.92' : '0.36';
            reticleBoxRef.current.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
            reticleBoxRef.current.style.width = `${bw.toFixed(1)}px`;
            reticleBoxRef.current.style.height = `${bh.toFixed(1)}px`;

            reticleLabelRef.current.style.opacity = targetEl ? '0.92' : '0.52';
            const labelTop = Math.min(cRect.height - 20, by + bh + 5);
            reticleLabelRef.current.style.transform = `translate3d(${Math.max(4, bx).toFixed(1)}px, ${labelTop.toFixed(1)}px, 0)`;
          }
        }

        // Draw subtle drafting NodeField canvas
        if (ctx && cw > 0 && ch > 0 && !document.hidden) {
          ctx.clearRect(0, 0, cw, ch);
          if (!reduced) {
            const cobaltRgb = isDark ? '108, 142, 255' : '58, 91, 194';
            const inkRgb = isDark ? '226, 232, 240' : '27, 33, 37';
            const hx = visible ? px : cw * (0.5 + Math.cos(clock * 0.35) * 0.14);
            const hy = visible ? py : ch * (0.5 + Math.sin(clock * 0.45) * 0.12);

            const resolved = nodes.map((n) => ({
              x: n.x * cw + Math.sin(clock * 0.55 + n.seed) * 10,
              y: n.y * ch + Math.cos(clock * 0.45 + n.seed) * 8,
              r: n.r,
            }));

            ctx.lineWidth = 0.75;
            for (let i = 0; i < resolved.length; i += 1) {
              const p = resolved[i];
              const dHub = Math.hypot(p.x - hx, p.y - hy);
              if (dHub < 240) {
                const alpha = (1 - dHub / 240) * 0.24;
                ctx.strokeStyle = `rgba(${cobaltRgb}, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
              }
              ctx.strokeStyle = `rgba(${inkRgb}, 0.14)`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }

        raf = requestAnimationFrame(tick);
      };

      container.addEventListener('pointermove', onPointerMove, { passive: true });
      container.addEventListener('pointerleave', onPointerLeave, { passive: true });
      if (!reduced) {
        raf = requestAnimationFrame(tick);
      }

      return () => {
        cancelAnimationFrame(raf);
        ro?.disconnect();
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerleave', onPointerLeave);
      };
    }, [containerRef, isDark]);

    return (
      <>
        {/* 1. Pure 2D Flat Swiss / Constructivist PROUN × osu! Poster Composition */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          style={{
            background:
              mode === 'pack'
                ? 'radial-gradient(ellipse at 64% 48%, color-mix(in srgb, var(--ga-cobalt) 10%, transparent) 0%, transparent 56%)'
                : mode === 'guess'
                  ? 'radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--ga-cobalt) 8%, transparent) 0%, transparent 60%)'
                  : 'radial-gradient(ellipse at 38% 48%, color-mix(in srgb, var(--ga-cobalt) 9%, transparent) 0%, transparent 58%)',
          }}
        >
          {/* Subtle Architectural Halftone Field */}
          <div
            className="ga-halftone pointer-events-none absolute right-[8%] top-[10%] h-[360px] w-[360px] rounded-full transition-transform duration-500"
            style={{
              color: 'var(--ga-cobalt)',
              opacity: isDark ? 0.065 : 0.085,
              maskImage: 'radial-gradient(circle, black 12%, transparent 72%)',
              transform: `translate3d(${(-pointerShift.x * 12).toFixed(1)}px, ${(-pointerShift.y * 8).toFixed(1)}px, 0)`,
            }}
          />

          <svg
            viewBox="0 0 1440 900"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full transition-transform duration-500"
            style={{
              transform: `translate3d(${(-pointerShift.x * 8).toFixed(1)}px, ${(-pointerShift.y * 5).toFixed(1)}px, 0)`,
            }}
          >
            {/* Outer Editorial Margin Rules */}
            <rect
              x="24"
              y="22"
              width="1392"
              height="856"
              fill="none"
              stroke="var(--ga-ink)"
              strokeOpacity="0.06"
              strokeWidth="1"
            />
            <line
              x1="24"
              y1="450"
              x2="1416"
              y2="450"
              stroke="var(--ga-ink)"
              strokeOpacity="0.045"
              strokeWidth="0.9"
              strokeDasharray="6 8"
            />
            <line
              x1="720"
              y1="22"
              x2="720"
              y2="878"
              stroke="var(--ga-ink)"
              strokeOpacity="0.045"
              strokeWidth="0.9"
              strokeDasharray="6 8"
            />

            {/* Mode-Specific 2D Flat Geometric Forms */}
            {mode === 'dating' && (
              <g>
                <circle
                  cx="360"
                  cy="450"
                  r="270"
                  fill="color-mix(in srgb, var(--ga-cobalt) 4%, transparent)"
                  stroke="var(--ga-cobalt)"
                  strokeOpacity="0.16"
                  strokeWidth="1.5"
                />
                <circle
                  cx="360"
                  cy="450"
                  r="310"
                  fill="none"
                  stroke="var(--ga-ink)"
                  strokeOpacity="0.08"
                  strokeWidth="1"
                  strokeDasharray="12 10"
                />
                <polygon
                  points="620,860 1420,160 1420,235 695,860"
                  fill="var(--ga-crimson)"
                  fillOpacity={isDark ? '0.09' : '0.07'}
                />
              </g>
            )}

            {mode === 'pack' && (
              <g>
                <circle
                  cx="920"
                  cy="440"
                  r="290"
                  fill="color-mix(in srgb, var(--ga-cobalt) 3.5%, transparent)"
                  stroke="var(--ga-cobalt)"
                  strokeOpacity="0.15"
                  strokeWidth="1.4"
                />
                <circle
                  cx="920"
                  cy="440"
                  r="340"
                  fill="none"
                  stroke="var(--ga-ink)"
                  strokeOpacity="0.08"
                  strokeWidth="0.9"
                  strokeDasharray="6 8"
                />
                <polygon
                  points="90,820 1280,105 1315,138 135,855"
                  fill="var(--ga-cobalt)"
                  fillOpacity={isDark ? '0.08' : '0.065'}
                />
              </g>
            )}

            {mode === 'guess' && (
              <g>
                <circle
                  cx="720"
                  cy="450"
                  r="296"
                  fill="color-mix(in srgb, var(--ga-cobalt) 3.5%, transparent)"
                  stroke="var(--ga-cobalt)"
                  strokeOpacity="0.15"
                  strokeWidth="1.4"
                />
                {/* Horizontal SR Calibration Hairlines */}
                {Array.from({ length: 19 }, (_, idx) => {
                  const x = 180 + idx * 60;
                  const major = idx % 3 === 0;
                  return (
                    <line
                      key={idx}
                      x1={x}
                      y1={major ? 78 : 84}
                      x2={x}
                      y2={94}
                      stroke={major ? 'var(--ga-cobalt)' : 'var(--ga-ink)'}
                      strokeOpacity={major ? '0.32' : '0.14'}
                      strokeWidth={major ? '1.3' : '0.8'}
                    />
                  );
                })}
                <polygon
                  points="60,690 790,120 822,148 92,718"
                  fill="var(--ga-crimson)"
                  fillOpacity={isDark ? '0.085' : '0.07'}
                />
              </g>
            )}

            {/* Shared Constructivist Diagonal Beam & Crisp Circle Crosshair */}
            <line
              x1="-40"
              y1="790"
              x2="960"
              y2="140"
              stroke="var(--ga-cobalt)"
              strokeOpacity="0.18"
              strokeWidth="2.4"
            />
            <line
              x1="40"
              y1="822"
              x2="1000"
              y2="172"
              stroke="var(--ga-ink)"
              strokeOpacity="0.09"
              strokeWidth="0.9"
            />

            {/* Top-Right Flat osu! Approach Circle & 4K Stamp */}
            <g transform="translate(1310, 128)" opacity={isDark ? '0.28' : '0.24'}>
              <circle
                cx="0"
                cy="0"
                r="48"
                fill="none"
                stroke="var(--ga-cobalt)"
                strokeWidth="1.4"
                strokeDasharray="12 6"
              />
              <circle cx="0" cy="0" r="32" fill="none" stroke="var(--ga-ink)" strokeWidth="1.6" />
              <line x1="-56" y1="0" x2="-38" y2="0" stroke="var(--ga-ink)" strokeWidth="1" />
              <line x1="38" y1="0" x2="56" y2="0" stroke="var(--ga-ink)" strokeWidth="1" />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fill="var(--ga-ink)"
                fontSize="11.5"
                fontFamily="var(--ga-mono)"
                fontWeight="700"
                letterSpacing="1.6"
              >
                4K
              </text>
            </g>

            {/* 2D Blueprint Construction Tangents & Protractor (B key) */}
            <g
              style={{
                opacity: blueprint ? 0.55 : 0,
                transition: 'opacity 260ms ease',
              }}
            >
              <line x1="0" y1="0" x2="1440" y2="900" stroke="var(--ga-cobalt)" strokeWidth="0.8" strokeDasharray="5 5" />
              <line x1="1440" y1="0" x2="0" y2="900" stroke="var(--ga-cobalt)" strokeWidth="0.8" strokeDasharray="5 5" />
              <circle cx="720" cy="450" r="390" fill="none" stroke="var(--ga-cobalt)" strokeWidth="0.9" strokeDasharray="3 6" />
              <text x="58" y="848" fill="var(--ga-cobalt)" fontSize="10.5" fontWeight="700" fontFamily="var(--ga-mono)">
                PROUN // 45.0° AXIS · 16:9 ARCHIVE GRID
              </text>
            </g>
          </svg>

          {/* Far-Left & Far-Right Pure 2D osu!mania 4K Graphic Rhythm Strips */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-14 bottom-16 left-5 hidden w-7 overflow-hidden border-x border-[var(--ga-line)] opacity-35 sm:block"
          >
            <div className="ga-bg-note-fall relative h-[200%] w-full">
              {[0, 1].map((dup) => (
                <svg key={dup} viewBox="0 0 28 384" preserveAspectRatio="none" className="h-1/2 w-full">
                  {[7, 14, 21].map((lx) => (
                    <line key={lx} x1={lx} y1="0" x2={lx} y2="384" stroke="var(--ga-ink)" strokeOpacity="0.16" strokeWidth="0.7" />
                  ))}
                  {MARGIN_LANE_BLOCKS.map((n, idx) => (
                    <rect
                      key={idx}
                      x={n.lane * 7 + 1.1}
                      y={n.y}
                      width="4.8"
                      height={n.h}
                      rx="1"
                      fill={n.accent ? 'var(--ga-crimson)' : 'var(--ga-cobalt)'}
                      fillOpacity={n.accent ? '0.68' : '0.52'}
                    />
                  ))}
                </svg>
              ))}
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-14 right-7 bottom-16 hidden w-7 overflow-hidden border-x border-[var(--ga-line)] opacity-35 sm:block"
          >
            <div
              className="ga-bg-note-fall relative h-[200%] w-full"
              style={{ animationDuration: '9.5s', animationDirection: 'reverse' }}
            >
              {[0, 1].map((dup) => (
                <svg key={dup} viewBox="0 0 28 384" preserveAspectRatio="none" className="h-1/2 w-full">
                  {[7, 14, 21].map((lx) => (
                    <line key={lx} x1={lx} y1="0" x2={lx} y2="384" stroke="var(--ga-ink)" strokeOpacity="0.16" strokeWidth="0.7" />
                  ))}
                  {MARGIN_LANE_BLOCKS.map((n, idx) => (
                    <rect
                      key={idx}
                      x={(3 - n.lane) * 7 + 1.1}
                      y={n.y}
                      width="4.8"
                      height={n.h}
                      rx="1"
                      fill={n.accent ? 'var(--ga-cobalt)' : 'var(--ga-ink)'}
                      fillOpacity={n.accent ? '0.62' : '0.32'}
                    />
                  ))}
                </svg>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Mineral Paper / Obsidian Veil */}
        <div aria-hidden="true" className="ga-world-veil pointer-events-none absolute inset-0 z-[1]" />

        {/* 3. Architectural Blueprint Wireframe Grid (activated with Blueprint mode) */}
        <div
          aria-hidden="true"
          className="ga-blueprint-grid pointer-events-none absolute inset-0 z-[2]"
        />

        {/* 2D Effect Expanding Pulse Ring */}
        {pulseRing && (
          <div
            key={pulseRing.id}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center overflow-hidden"
          >
            <div
              className="ga-bg-pulse-ring h-64 w-64 rounded-full border-2"
              style={{
                borderColor: pulseRing.color,
                boxShadow: `0 0 32px -4px ${pulseRing.color}`,
              }}
            />
          </div>
        )}

        {/* 4. Subtle NodeField Canvas2D + Floating Ghost Glyphs */}
        <canvas
          ref={nodeCanvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        />

        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
          {GHOST_GLYPHS.map((g, i) => (
            <span
              key={i}
              className="ga-glyph"
              style={
                {
                  left: g.left,
                  top: g.top,
                  fontSize: g.size,
                  transform: `translate3d(${(-pointerShift.x * g.depth * 26).toFixed(1)}px, ${(-pointerShift.y * g.depth * 18).toFixed(1)}px, 0)`,
                } as CSSProperties
              }
            >
              {g.char}
            </span>
          ))}
        </div>

        {/* 5. Vertical Marginalia + Graduated Edge Ruler */}
        <div
          aria-hidden="true"
          className="ga-mono pointer-events-none absolute top-[54%] left-2 z-[5] hidden -translate-y-1/2 whitespace-nowrap text-[9px] tracking-[0.22em] opacity-40 select-none sm:block"
          style={{ writingMode: 'vertical-rl' }}
        >
          OSU!MANAGER · PROUN MANIA // 4K–10K ARCHIVE
        </div>

        <div aria-hidden="true" className="ga-edge-ruler hidden sm:flex">
          {Array.from({ length: 13 }).map((_, idx) => (
            <i key={idx} />
          ))}
        </div>

        {/* 6. Subtle Paper Fractal Grain */}
        <div aria-hidden="true" className="ga-paper-grain pointer-events-none absolute inset-0 z-[4]" />

        {/* 7. Corner-Bracket Reticle Overlay (does not hide native cursor) */}
        <div
          ref={reticleBoxRef}
          aria-hidden="true"
          data-locked="false"
          style={{ opacity: 0 }}
          className="ga-reticle-box z-[18] hidden lg:block"
        >
          <b />
          <b />
          <b />
          <b />
        </div>
        <span
          ref={reticleLabelRef}
          aria-hidden="true"
          style={{ opacity: 0 }}
          className="ga-reticle-label z-[18] hidden lg:block"
        />

        {/* 8. Stop-Motion Architectural Burst Transition Layer (strictly beneath UI content at z-[4]) */}
        {burst && (
          <div
            key={burst.id}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[4] overflow-hidden opacity-60"
          >
            {burst.frames.map((frame, fIdx) => (
              <svg
                key={fIdx}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ '--ga-f': fIdx } as CSSProperties}
                className="ga-fx-frame absolute inset-0 h-full w-full"
              >
                {frame.links.map(([x1, y1, x2, y2], lIdx) => (
                  <line
                    key={lIdx}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isDark ? '#b8c8ff' : '#2a3034'}
                    strokeOpacity="0.42"
                    strokeWidth="0.14"
                  />
                ))}
                {frame.circles.map((c, cIdx) => (
                  <circle
                    key={cIdx}
                    cx={c.cx}
                    cy={c.cy}
                    r={c.r}
                    fill="none"
                    stroke={isDark ? '#b8c8ff' : '#2a3034'}
                    strokeOpacity="0.58"
                    strokeWidth="0.18"
                  />
                ))}
                <circle
                  cx={frame.dot.x}
                  cy={frame.dot.y}
                  r="1.35"
                  fill={isDark ? '#eef2f8' : '#1b2125'}
                />
                <text
                  x={frame.dot.x}
                  y={frame.dot.y + 0.45}
                  fontSize="1.35"
                  textAnchor="middle"
                  fill={isDark ? '#090c14' : '#ffffff'}
                  fontFamily="Consolas, monospace"
                >
                  {frame.dot.n}
                </text>
                <path
                  d={`M${frame.cross.x - 3.8} ${frame.cross.y}h7.6M${frame.cross.x} ${frame.cross.y - 3.8}v7.6`}
                  stroke={burst.color}
                  strokeWidth="0.24"
                />
                <text
                  x={frame.glyph.x}
                  y={frame.glyph.y}
                  fontSize={frame.glyph.size}
                  fontFamily="Bodoni MT, Georgia, serif"
                  fill={isDark ? '#eef2f8' : '#1b2125'}
                  fillOpacity="0.52"
                  transform={
                    frame.glyph.flip
                      ? `scale(-1 1) translate(${(-2 * frame.glyph.x).toFixed(1)} 0)`
                      : undefined
                  }
                >
                  {frame.glyph.ch}
                </text>
              </svg>
            ))}

            {burst.blocks.map((blk, bIdx) => (
              <i
                key={bIdx}
                className="ga-fx-frame absolute"
                style={
                  {
                    left: `${blk.left.toFixed(1)}%`,
                    top: `${blk.top.toFixed(1)}%`,
                    width: `${blk.w.toFixed(1)}vw`,
                    height: `${blk.h.toFixed(1)}vw`,
                    backgroundColor: blk.bg,
                    '--ga-f': blk.f,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
      </>
    );
  },
);
