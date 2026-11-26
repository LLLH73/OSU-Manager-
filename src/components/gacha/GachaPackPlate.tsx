import { memo, useMemo } from 'react';
import {
  blade,
  brokenAxis,
  brush,
  constellationData,
  crops,
  ring,
  rng,
  rule,
  sparkle,
  sweepPts,
  ticks,
} from './gachaSketch';
import type { GachaPackMeta } from './gachaUtils';

interface GachaPackPlateProps {
  pack: GachaPackMeta;
  cardCount: number;
  blueprint: boolean;
  tearing: boolean;
  pointer: { x: number; y: number };
  dragProximity?: number;
  isDropTarget?: boolean;
  isDragging?: boolean;
}

/**
 * Multi-layered Swiss / Constructivist Altar Drop Well plate:
 * - Centered circular registration dial & dotted pack drop silhouette
 * - Smoothly intensifies glow, halo scale, and lock-on chevrons as the pack approaches
 */
export const GachaPackPlate = memo(function GachaPackPlate({
  pack,
  cardCount,
  blueprint,
  tearing,
  pointer,
  dragProximity = 0,
  isDropTarget = false,
  isDragging = false,
}: GachaPackPlateProps) {
  const plate = useMemo(() => {
    const seedNum = pack.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 407);
    const r = rng(seedNum);

    const outerCircleA = ring(340, 290, 224, r, 1.8);
    const outerCircleB = ring(340, 290, 246, r, 1.5);
    const innerCircle = ring(340, 290, 146, r, 1.3);
    const haloRing = ring(340, 124, 128, r, 1.2, 0.21);
    const dialTicks = ticks(340, 290, 206, 72, r);
    const axisH = brokenAxis(68, 290, 612, 290, r, 4);
    const axisV = brokenAxis(340, 56, 340, 524, r, 4);
    const diagSweep = brush(sweepPts(168, 412, 514, 168, 22, 16), 14, 0.55);
    const shards = [
      blade(506, 154, 62, 10, -0.58, r),
      blade(194, 424, 48, 8, 2.45, r),
      blade(534, 372, 38, 6, 0.42, r),
    ];
    const sparks = [
      sparkle(146, 178, 9),
      sparkle(538, 122, 11),
      sparkle(524, 444, 8),
    ];
    const cropPath = crops(54, 48, 626, 532, 26);
    const constell = constellationData(340, 290, 188, 8, r);
    const rulerTicks = Array.from({ length: 16 }, (_, idx) => {
      const y = 136 + idx * 19;
      return { y, major: idx % 5 === 0, idx };
    });
    const rulerStem = rule(96, 124, 96, 446, r, 8, 1.4);

    return {
      outerCircleA,
      outerCircleB,
      innerCircle,
      haloRing,
      dialTicks,
      axisH,
      axisV,
      diagSweep,
      shards,
      sparks,
      cropPath,
      constell,
      rulerTicks,
      rulerStem,
      trackId: `ga-pack-track-${pack.id}`,
    };
  }, [pack.id]);

  const mx = pointer.x;
  const my = pointer.y;
  const activeScale = tearing ? 1.05 : isDropTarget ? 1.04 : 1 + dragProximity * 0.025;
  const ringOpacity = Math.min(0.95, 0.28 + dragProximity * 0.45 + (isDropTarget ? 0.22 : 0));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible transition-transform duration-300"
      style={{ transform: `scale(${activeScale.toFixed(3)})` }}
    >
      {/* Awakening Radial Altar Aura driven by drag proximity / drop-zone lock */}
      <div
        className={`pointer-events-none absolute h-[360px] w-[360px] rounded-full transition-opacity duration-200 ${
          isDragging ? 'ga-altar-pulse' : ''
        }`}
        style={{
          opacity: isDropTarget ? 0.92 : isDragging ? 0.28 + dragProximity * 0.45 : 0.14,
          background:
            'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--ga-cobalt) 42%, transparent) 0%, color-mix(in srgb, var(--ga-crimson) 18%, transparent) 44%, transparent 72%)',
        }}
      />

      {/* Far Depth Layer: Halftone Disc (unified theme accent) */}
      <div
        className="ga-halftone absolute h-[320px] w-[320px] rounded-full transition-transform duration-300"
        style={{
          color: 'var(--ga-cobalt)',
          opacity: blueprint ? 0.09 : isDropTarget ? 0.24 : 0.14 + dragProximity * 0.08,
          transform: `translate3d(${(-mx * 8).toFixed(1)}px, ${(-my * 6).toFixed(1)}px, 0)`,
        }}
      />

      {/* Graphic Vector Altar Plate */}
      <svg
        viewBox="0 0 680 560"
        className="h-full w-full transition-transform duration-300"
        style={{
          transform: `translate3d(${(-mx * 10).toFixed(1)}px, ${(-my * 8).toFixed(1)}px, 0)`,
        }}
      >
        <defs>
          <path id={plate.trackId} d="M 340, 290 m -176, 0 a 176,176 0 1,1 352,0 a 176,176 0 1,1 -352,0" />
        </defs>

        {/* Corner Printmaker Crops */}
        <path
          d={plate.cropPath}
          fill="none"
          stroke="var(--ga-ink)"
          strokeOpacity="0.45"
          strokeWidth="1.2"
        />

        {/* Broken Coordinate Axes */}
        <path
          d={`${plate.axisH}${plate.axisV}`}
          fill="none"
          stroke="var(--ga-ink)"
          strokeOpacity="0.16"
          strokeWidth="0.9"
        />

        {/* Overshooting Double-Inked Construction Rings (brighten on pack approach) */}
        <g style={{ color: 'var(--ga-cobalt)' }}>
          <path
            d={plate.outerCircleA}
            fill="none"
            stroke="currentColor"
            strokeOpacity={ringOpacity}
            strokeWidth={isDropTarget ? '2.2' : '1.3'}
          />
          <path
            d={plate.outerCircleA}
            transform="translate(1.8 1.2)"
            fill="none"
            stroke="currentColor"
            strokeOpacity={ringOpacity * 0.45}
            strokeWidth="1.2"
          />
          <path
            d={plate.outerCircleB}
            fill="none"
            stroke={isDropTarget ? 'var(--ga-crimson)' : 'var(--ga-ink)'}
            strokeOpacity={isDropTarget ? 0.65 : 0.2 + dragProximity * 0.25}
            strokeWidth={isDropTarget ? '1.5' : '0.9'}
            strokeDasharray="6 6"
          />
          <path
            d={plate.innerCircle}
            fill="none"
            stroke="var(--ga-cobalt)"
            strokeOpacity={blueprint ? 0.65 : 0.36 + dragProximity * 0.4}
            strokeWidth={isDropTarget ? '2' : '1.2'}
          />
          {/* Altar Pack Drop Silhouette Rect inside Center Well */}
          <rect
            x="266"
            y="188"
            width="148"
            height="204"
            rx="3"
            fill="color-mix(in srgb, var(--ga-cobalt) 6%, transparent)"
            fillOpacity={isDragging || isDropTarget ? 1 : 0.35}
            stroke={isDropTarget ? 'var(--ga-crimson)' : 'var(--ga-cobalt)'}
            strokeOpacity={isDropTarget ? 0.92 : 0.28 + dragProximity * 0.45}
            strokeWidth={isDropTarget ? '2.2' : '1.2'}
            strokeDasharray={isDropTarget ? 'none' : '7 5'}
          />
        </g>

        {/* Tilted Halo Crown */}
        <g>
          <path
            d={plate.haloRing}
            fill="none"
            stroke="var(--ga-ink)"
            strokeOpacity="0.72"
            strokeWidth="1.5"
          />
          <path
            d={plate.haloRing}
            transform="translate(1.6 1.2)"
            fill="none"
            stroke="var(--ga-cobalt)"
            strokeOpacity="0.42"
            strokeWidth="1.3"
          />
        </g>

        {/* Graduated Dial Ticks */}
        <path
          d={plate.dialTicks}
          fill="none"
          stroke="var(--ga-ink)"
          strokeOpacity="0.28"
          strokeWidth="0.95"
        />

        {/* Circular Epigraph Typography */}
        <text
          fill="var(--ga-ink)"
          fillOpacity="0.46"
          fontSize="9.5"
          fontFamily="var(--ga-mono)"
          letterSpacing="3.8"
        >
          <textPath href={`#${plate.trackId}`} startOffset="6%">
            OSU!MANAGER · PROUN MANIA · POOL {pack.code} ·
          </textPath>
        </text>

        {/* PROUN Diagonal Constructivist Accent Girder + Flanking 4K Vertical Lane Rails */}
        <polygon
          points="74,476 588,92 612,114 98,498"
          fill="var(--ga-crimson)"
          fillOpacity={blueprint ? 0.14 : 0.18}
        />
        <g stroke="var(--ga-cobalt)" strokeOpacity="0.22" strokeWidth="1">
          <line x1="156" y1="126" x2="156" y2="454" strokeDasharray="5 5" />
          <line x1="176" y1="126" x2="176" y2="454" strokeDasharray="5 5" />
          <line x1="504" y1="126" x2="504" y2="454" strokeDasharray="5 5" />
          <line x1="524" y1="126" x2="524" y2="454" strokeDasharray="5 5" />
        </g>

        {/* Diagonal Calligraphic Brush & Flying Light Shards */}
        <path
          d={plate.diagSweep}
          fill="var(--ga-cobalt)"
          fillOpacity={blueprint ? 0.14 : 0.20}
        />
        {plate.shards.map((sd, idx) => (
          <path
            key={idx}
            d={sd}
            fill={idx === 0 ? 'var(--ga-cobalt)' : 'var(--ga-ink)'}
            fillOpacity={idx === 0 ? '0.58' : '0.32'}
          />
        ))}
        {plate.sparks.map((sp, idx) => (
          <path key={idx} d={sp} fill="var(--ga-cobalt)" fillOpacity="0.72" />
        ))}

        {/* Bowed Constellation Thread */}
        {plate.constell.links.map((lk, idx) => (
          <path
            key={idx}
            d={lk}
            fill="none"
            stroke="var(--ga-ink)"
            strokeOpacity="0.24"
            strokeWidth="0.85"
          />
        ))}
        {plate.constell.nodes.map((n, idx) =>
          n.ringPath ? (
            <path
              key={idx}
              d={n.ringPath}
              fill="none"
              stroke="var(--ga-cobalt)"
              strokeOpacity="0.52"
              strokeWidth="1"
            />
          ) : (
            <circle
              key={idx}
              cx={n.x}
              cy={n.y}
              r={n.size}
              fill={idx % 2 === 0 ? 'var(--ga-cobalt)' : 'var(--ga-ink)'}
              fillOpacity={idx % 2 === 0 ? '0.55' : '0.32'}
            />
          ),
        )}

        {/* Left Edge Drafting Y-Ruler */}
        <g>
          <path
            d={plate.rulerStem}
            fill="none"
            stroke="var(--ga-ink)"
            strokeOpacity="0.45"
            strokeWidth="0.9"
          />
          {plate.rulerTicks.map((tk) => (
            <g key={tk.idx}>
              <line
                x1="96"
                y1={tk.y}
                x2={tk.major ? 109 : 102}
                y2={tk.y}
                stroke="var(--ga-ink)"
                strokeOpacity="0.45"
                strokeWidth="0.9"
              />
              {tk.major && (
                <text
                  x="72"
                  y={tk.y + 3}
                  fill="var(--ga-ink)"
                  fillOpacity="0.48"
                  fontSize="8.5"
                  fontFamily="var(--ga-mono)"
                >
                  Y{Math.floor(tk.idx / 5) + 1}
                </text>
              )}
            </g>
          ))}
        </g>

        {/* Collaged UI Mini-Frames (the-masses-travels collage vocabulary) */}
        <g transform={`translate(${(mx * 8).toFixed(1)}, ${(my * 6).toFixed(1)})`}>
          <g transform="translate(108, 128) rotate(-6)">
            <rect
              width="124"
              height="62"
              fill="var(--ga-panel-strong)"
              stroke="var(--ga-cobalt)"
              strokeOpacity="0.65"
              strokeWidth="1"
            />
            <line x1="0" y1="16" x2="124" y2="16" stroke="var(--ga-cobalt)" strokeOpacity="0.45" />
            <text
              x="7"
              y="11"
              fill="var(--ga-ink)"
              fontSize="7.5"
              fontWeight="700"
              fontFamily="var(--ga-mono)"
            >
              RECORD · {pack.code}
            </text>
            <text x="112" y="11" fill="var(--ga-ink)" fontSize="8" fontFamily="var(--ga-mono)">
              ×
            </text>
            <rect x="8" y="25" width="76" height="4" fill="var(--ga-ink)" fillOpacity="0.18" />
            <rect x="8" y="34" width="54" height="4" fill="var(--ga-ink)" fillOpacity="0.14" />
            <rect x="8" y="45" width="92" height="4" fill="var(--ga-cobalt)" fillOpacity="0.65" />
          </g>

          <g transform="translate(442, 386) rotate(4)">
            <rect
              width="136"
              height="66"
              fill="var(--ga-panel-strong)"
              stroke="var(--ga-ink)"
              strokeOpacity="0.55"
              strokeWidth="1"
            />
            <line x1="0" y1="16" x2="136" y2="16" stroke="var(--ga-ink)" strokeOpacity="0.32" />
            <text
              x="7"
              y="11"
              fill="var(--ga-ink)"
              fontSize="7.5"
              fontWeight="700"
              fontFamily="var(--ga-mono)"
            >
              NON-LOCAL ARCHIVE
            </text>
            <text x="124" y="11" fill="var(--ga-ink)" fontSize="8" fontFamily="var(--ga-mono)">
              ×
            </text>
            <text
              x="8"
              y="33"
              fill="var(--ga-cobalt)"
              fontSize="9"
              fontWeight="700"
              fontFamily="var(--ga-mono)"
            >
              {pack.badge}
            </text>
            <text
              x="8"
              y="48"
              fill="var(--ga-ink-2)"
              fontSize="8"
              fontFamily="var(--ga-mono)"
            >
              QTY ×{String(cardCount).padStart(2, '0')} · {pack.starRangeLabel}
            </text>
          </g>
        </g>

        {/* Blueprint Wireframe Dimension Callouts */}
        <g
          style={{
            opacity: blueprint || tearing ? 1 : 0,
            transition: 'opacity 260ms ease',
          }}
        >
          <text
            x="458"
            y="196"
            fill="var(--ga-cobalt)"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="var(--ga-mono)"
          >
            R 206 · 45°
          </text>
          <text
            x="388"
            y="102"
            fill="var(--ga-cobalt)"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="var(--ga-mono)"
          >
            HALO 256 × 54
          </text>
          <text
            x="230"
            y="518"
            fill="var(--ga-cobalt)"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="var(--ga-mono)"
          >
            Ø 448 · UNOWNED SEAL · ×{String(cardCount).padStart(2, '0')}
          </text>
        </g>
      </svg>
    </div>
  );
});
