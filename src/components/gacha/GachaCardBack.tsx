import { memo, useMemo, type CSSProperties } from 'react';
import { rng } from './gachaSketch';

interface GachaCardBackProps {
  seed?: number;
  compact?: boolean;
  className?: string;
}

interface LaneBlock {
  lane: number;
  y: number;
  h: number;
  accent: boolean;
}

/**
 * Dynamic Swiss / Constructivist × osu! kinetic card back:
 * - Deep matte slate-charcoal foil infused dynamically with active global `--t-osu`
 * - Bauhaus diagonal accent geometry & drifting metallic specular sheen
 * - Twin live-scrolling osu!mania 4K graphic rhythm strips
 * - Center rotating vernier caliper rings + rhythmic contracting osu! Approach Circle
 */
export const GachaCardBack = memo(function GachaCardBack({
  seed = 1,
  compact = false,
  className = '',
}: GachaCardBackProps) {
  const layout = useMemo(() => {
    const rand = rng((seed | 0) * 97 + 31);
    const makeLaneBlocks = (): LaneBlock[] => {
      const items: LaneBlock[] = [];
      for (let i = 0; i < 8; i += 1) {
        const lane = Math.floor(rand() * 4);
        const y = i * 25 + Math.floor(rand() * 8);
        const isLn = rand() > 0.62;
        const h = isLn ? 13 + Math.floor(rand() * 9) : 4;
        const accent = rand() > 0.55;
        items.push({ lane, y, h, accent });
      }
      return items;
    };
    const leftNotes = makeLaneBlocks();
    const rightNotes = makeLaneBlocks();
    const serial = String(((Math.abs(seed) % 999) + 1000) % 1000).padStart(3, '0');
    const barHeights = Array.from({ length: 12 }, () => 4 + Math.floor(rand() * 14));
    const speedSec = (4.6 + rand() * 1.8).toFixed(2);
    return { leftNotes, rightNotes, serial, barHeights, speedSec };
  }, [seed]);

  const laneStyle = {
    '--ga-lane-dur': `${layout.speedSec}s`,
  } as CSSProperties;

  return (
    <div
      className={`relative h-full w-full overflow-hidden border-0 select-none ${className}`}
      style={{
        background:
          'linear-gradient(158deg, color-mix(in srgb, var(--t-osu, #e03a82) 22%, #131622) 0%, #0b0d14 50%, color-mix(in srgb, var(--t-osu, #e03a82) 16%, #07090e) 100%)',
      }}
    >
      {/* Bauhaus Geometric Corner Cuts + Diagonal Constructivist Structural Bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--t-osu, #e03a82) 86%, #ffffff) 0%, color-mix(in srgb, var(--t-osu, #e03a82) 48%, #111520) 100%)',
          clipPath: 'polygon(0 0, 56% 0, 0 27%)',
          opacity: 0.72,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(315deg, color-mix(in srgb, var(--ga-crimson, var(--t-osu, #e03a82)) 78%, var(--t-osu, #e03a82)) 0%, color-mix(in srgb, var(--t-osu, #e03a82) 34%, #0d1018) 100%)',
          clipPath: 'polygon(100% 75%, 100% 100%, 48% 100%)',
          opacity: 0.68,
        }}
      />

      {/* Ambient Center Theme Glow & Editorial Halftone Corner */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--t-osu, #e03a82) 28%, transparent) 0%, color-mix(in srgb, var(--t-osu, #e03a82) 10%, transparent) 42%, transparent 72%)',
        }}
      />
      <div
        aria-hidden="true"
        className="ga-halftone pointer-events-none absolute top-0 right-0 h-28 w-28 opacity-20"
        style={{
          color: 'var(--t-osu, #e03a82)',
          maskImage: 'radial-gradient(circle at top right, black 12%, transparent 74%)',
        }}
      />

      {/* Animated Specular Metallic Foil Sweep */}
      <div aria-hidden="true" className="ga-card-foil-sweep pointer-events-none absolute -inset-1/2" />

      {/* Crisp Hairline Architectural Registration Frame & Diagonal Structural Line */}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 420"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <line
          x1="0"
          y1="332"
          x2="300"
          y2="88"
          stroke="color-mix(in srgb, var(--t-osu, #e03a82) 55%, #ffffff)"
          strokeOpacity="0.28"
          strokeWidth="1.2"
        />
        <line
          x1="0"
          y1="342"
          x2="300"
          y2="98"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="0.6"
        />
        <rect
          x="10"
          y="10"
          width="280"
          height="400"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="0.8"
        />
        {/* Corner Calibration Crop Marks */}
        <path
          d="M10 24 V10 H24 M276 10 H290 V24 M10 396 V410 H24 M276 410 H290 V396"
          fill="none"
          stroke="color-mix(in srgb, var(--t-osu, #e03a82) 72%, #ffffff)"
          strokeWidth="1.4"
        />
      </svg>

      {/* Left & Right Live-Scrolling osu!mania 4K Graphic Strips */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-11 bottom-11 left-3.5 overflow-hidden border-x border-white/12 ${
          compact ? 'w-3.5' : 'w-4.5'
        }`}
      >
        <div className="ga-back-lane-scroll relative h-[200%] w-full" style={laneStyle}>
          {[0, 1].map((dup) => (
            <svg
              key={dup}
              viewBox="0 0 24 200"
              preserveAspectRatio="none"
              className="h-1/2 w-full"
            >
              {[6, 12, 18].map((lx) => (
                <line key={lx} x1={lx} y1="0" x2={lx} y2="200" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
              ))}
              {layout.leftNotes.map((n, idx) => (
                <rect
                  key={idx}
                  x={n.lane * 6 + 0.8}
                  y={n.y}
                  width="4.4"
                  height={n.h}
                  rx="0.8"
                  fill={n.accent ? 'var(--t-osu, #e03a82)' : 'rgba(255,255,255,0.82)'}
                  fillOpacity={n.accent ? '0.88' : '0.45'}
                />
              ))}
            </svg>
          ))}
        </div>
      </div>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-11 right-3.5 bottom-11 overflow-hidden border-x border-white/12 ${
          compact ? 'w-3.5' : 'w-4.5'
        }`}
      >
        <div
          className="ga-back-lane-scroll relative h-[200%] w-full"
          style={{ ...laneStyle, animationDirection: 'reverse' }}
        >
          {[0, 1].map((dup) => (
            <svg
              key={dup}
              viewBox="0 0 24 200"
              preserveAspectRatio="none"
              className="h-1/2 w-full"
            >
              {[6, 12, 18].map((lx) => (
                <line key={lx} x1={lx} y1="0" x2={lx} y2="200" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
              ))}
              {layout.rightNotes.map((n, idx) => (
                <rect
                  key={idx}
                  x={n.lane * 6 + 0.8}
                  y={n.y}
                  width="4.4"
                  height={n.h}
                  rx="0.8"
                  fill={n.accent ? 'var(--t-osu, #e03a82)' : 'rgba(255,255,255,0.82)'}
                  fillOpacity={n.accent ? '0.88' : '0.45'}
                />
              ))}
            </svg>
          ))}
        </div>
      </div>

      {/* Top & Bottom Editorial Metadata Bars */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[1px] bg-black/55 px-1.5 py-0.5 font-mono text-[0.5625rem] font-bold tracking-[0.18em] text-white/90">
            <span
              className="h-1.5 w-1.5 rounded-[1px]"
              style={{ background: 'var(--t-osu, #e03a82)' }}
            />
            <span>NO.{layout.serial}</span>
          </span>
          <span className="font-mono text-[0.5625rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
            PROUN // 4K
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex h-3.5 items-end gap-[2px] opacity-55">
            {layout.barHeights.map((bh, i) => (
              <span
                key={i}
                className="w-[1.5px] rounded-t-[1px]"
                style={{
                  height: `${Math.round((bh / 18) * 100)}%`,
                  background: i % 3 === 0 ? 'var(--t-osu, #e03a82)' : 'rgba(255,255,255,0.65)',
                }}
              />
            ))}
          </div>
          <span className="font-mono text-[0.5625rem] font-bold tracking-[0.2em] text-white/55">
            OSU!MANAGER
          </span>
        </div>
      </div>

      {/* Center Kinetic Swiss Vernier Dial + Rhythmic osu! Approach Ring */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`relative flex items-center justify-center ${
            compact ? 'h-26 w-26' : 'h-40 w-40'
          }`}
        >
          {/* Outer Rotating Segmented Caliper Ring */}
          <svg
            aria-hidden="true"
            viewBox="0 0 160 160"
            className="ga-back-spin-cw absolute inset-0 h-full w-full"
          >
            <circle
              cx="80"
              cy="80"
              r="72"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="0.9"
              strokeDasharray="16 8 4 8"
            />
            <circle
              cx="80"
              cy="80"
              r="65"
              fill="none"
              stroke="color-mix(in srgb, var(--t-osu, #e03a82) 72%, #ffffff)"
              strokeOpacity="0.65"
              strokeWidth="1.2"
              strokeDasharray="34 86"
            />
            <line x1="80" y1="2" x2="80" y2="11" stroke="var(--t-osu, #e03a82)" strokeWidth="1.5" />
            <line x1="80" y1="149" x2="80" y2="158" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
            <line x1="2" y1="80" x2="11" y2="80" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
            <line x1="149" y1="80" x2="158" y2="80" stroke="var(--t-osu, #e03a82)" strokeWidth="1.5" />
          </svg>

          {/* Counter-Rotating Dashed Architecture Ring */}
          <svg
            aria-hidden="true"
            viewBox="0 0 160 160"
            className="ga-back-spin-ccw absolute inset-0 h-full w-full"
          >
            <circle
              cx="80"
              cy="80"
              r="55"
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="0.85"
              strokeDasharray="3 5"
            />
            <polygon points="80,21 83,27 77,27" fill="color-mix(in srgb, var(--t-osu, #e03a82) 85%, #ffffff)" />
          </svg>

          {/* Contracting osu! Approach Circle */}
          <div
            aria-hidden="true"
            className="ga-back-approach absolute h-[64%] w-[64%] rounded-full border-2"
            style={{
              borderColor: 'color-mix(in srgb, var(--t-osu, #e03a82) 86%, #ffffff)',
              boxShadow: '0 0 18px color-mix(in srgb, var(--t-osu, #e03a82) 55%, transparent)',
            }}
          />

          {/* Solid Precision Hit Circle Badge */}
          <div
            className="relative flex h-[58%] w-[58%] flex-col items-center justify-center rounded-full border border-white/60 bg-[#0b0d15]/88 shadow-lg"
            style={{
              boxShadow:
                '0 0 24px -4px color-mix(in srgb, var(--t-osu, #e03a82) 52%, transparent), inset 0 0 0 2px color-mix(in srgb, var(--t-osu, #e03a82) 32%, transparent)',
            }}
          >
            <span
              className={`font-display leading-none text-white select-none ${
                compact ? 'text-[1.2rem]' : 'text-[1.85rem]'
              }`}
              style={{ fontWeight: 200, letterSpacing: '0.16em', paddingLeft: '0.16em' }}
            >
              osu!
            </span>
            <span
              className={`mt-1 font-mono font-bold tracking-[0.22em] uppercase ${
                compact ? 'text-[0.4375rem]' : 'text-[0.53125rem]'
              }`}
              style={{ color: 'color-mix(in srgb, var(--t-osu, #e03a82) 75%, #ffffff)' }}
            >
              ARCHIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
