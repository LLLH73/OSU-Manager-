import { memo, useMemo, type CSSProperties } from 'react';
import {
  brokenAxis,
  crops,
  ring,
  rng,
  rule,
  sparkle,
  ticks,
} from './gachaSketch';

interface PaimonStarfieldBackProps {
  seed?: number;
  compact?: boolean;
  className?: string;
}

interface StarPoint {
  x: number;
  y: number;
  r: number;
  kind: 'diamond' | 'dot';
  color: string;
  dur: number;
  delay: number;
}

const COSMIC_COLORS = ['#fff7d6', '#d8e8ff', '#a5f3fc', '#fde68a', '#e0e7ff'];

function seededUnit(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Animated Paimon-cape cosmic starfield cloak combined with `the-masses-travels`
 * hand-drawn overshooting astrolabe rings, double-inked misregistration lines,
 * crop marks & centered minimalist thin-stroke `osu!` identity.
 * Strictly borderless (`border-0`) and GPU-composited with zero per-card rAF.
 */
export const PaimonStarfieldBack = memo(function PaimonStarfieldBack({
  seed = 1,
  compact = false,
  className = '',
}: PaimonStarfieldBackProps) {
  const stars = useMemo<StarPoint[]>(() => {
    const count = compact ? 18 : 26;
    const list: StarPoint[] = [];
    for (let i = 0; i < count; i += 1) {
      const s = seed * 131 + i * 37;
      const x = 18 + seededUnit(s + 1) * 264;
      const y = 20 + seededUnit(s + 2) * 380;
      const isDiamond = i < (compact ? 6 : 9);
      list.push({
        x,
        y,
        r: isDiamond ? 3.2 + seededUnit(s + 3) * 4.2 : 0.9 + seededUnit(s + 4) * 1.5,
        kind: isDiamond ? 'diamond' : 'dot',
        color: COSMIC_COLORS[i % COSMIC_COLORS.length],
        dur: 2.3 + seededUnit(s + 5) * 2.8,
        delay: -(seededUnit(s + 6) * 4.5),
      });
    }
    return list;
  }, [seed, compact]);

  const sketch = useMemo(() => {
    const r = rng(seed * 71 + 19);
    const diamonds = stars.filter((s) => s.kind === 'diamond').slice(0, 6);
    const constellLinks: string[] = [];
    for (let i = 1; i < diamonds.length; i += 1) {
      constellLinks.push(
        rule(diamonds[i - 1].x, diamonds[i - 1].y, diamonds[i].x, diamonds[i].y, r, 4, 2.2),
      );
    }

    const outerAstrolabe = ring(70, 70, 58, r, 1.35);
    const innerAstrolabe = ring(70, 70, 48, r, 1.0);
    const tiltedHalo = ring(150, 122, 72, r, 1.1, 0.22);
    const dialTicks = ticks(70, 70, 52, 36, r);
    const crossAxes = `${brokenAxis(150, 26, 150, 394, r, 3)}${brokenAxis(24, 210, 276, 210, r, 3)}`;
    const cornerCrops = crops(14, 14, 286, 406, 16);
    const northStar = sparkle(70, 12, 6);

    return {
      constellLinks,
      outerAstrolabe,
      innerAstrolabe,
      tiltedHalo,
      dialTicks,
      crossAxes,
      cornerCrops,
      northStar,
    };
  }, [seed, stars]);

  const cardSerial = String(((seed % 99) + 100) % 100).padStart(2, '0');

  return (
    <div
      className={`relative h-full w-full overflow-hidden border-0 select-none ${className}`}
      style={{
        background:
          'radial-gradient(ellipse at 50% 34%, color-mix(in srgb, var(--t-osu, #e03a82) 74%, #0b0b0f) 0%, color-mix(in srgb, var(--t-osu, #e03a82) 46%, #07070a) 46%, color-mix(in srgb, var(--t-osu, #e03a82) 22%, #040406) 82%, #030305 100%)',
      }}
    >
      {/* Drifting Paimon-Cloak Nebula Veil (harmonized with active global --t-osu accent) */}
      <div
        aria-hidden="true"
        className="paimon-nebula pointer-events-none absolute -inset-[18%]"
        style={{
          background:
            'radial-gradient(circle at 26% 24%, color-mix(in srgb, var(--t-osu, #e03a82) 42%, transparent), transparent 48%), radial-gradient(circle at 76% 68%, color-mix(in srgb, var(--t-lazer, var(--t-osu, #e03a82)) 34%, transparent), transparent 50%), radial-gradient(circle at 48% 52%, color-mix(in srgb, var(--t-osu, #fde68a) 26%, rgba(251, 191, 36, 0.12)), transparent 44%)',
        }}
      />

      {/* Central theme-tinted celestial aura (pure CSS gradient for reliable CSS var inheritance) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--t-osu, #e03a82) 40%, transparent) 0%, color-mix(in srgb, var(--t-osu, #e03a82) 16%, transparent) 34%, transparent 64%)',
        }}
      />

      {/* Constellation Drafting Layer + Twinkling Stars */}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 420"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {/* Broken drafting coordinate axes */}
        <path
          d={sketch.crossAxes}
          fill="none"
          stroke="color-mix(in srgb, var(--t-osu, #bae6fd) 42%, #ffffff)"
          strokeOpacity="0.18"
          strokeWidth="0.7"
          strokeDasharray="3 5"
        />

        {/* Printmaker inner corner registration ticks */}
        <path
          d={sketch.cornerCrops}
          fill="none"
          stroke="color-mix(in srgb, var(--t-osu, #c7d2fe) 50%, #ffffff)"
          strokeOpacity="0.28"
          strokeWidth="0.75"
        />

        {/* Tilted celestial halo oval (double-inked offset pass synced to theme accent) */}
        <path
          d={sketch.tiltedHalo}
          fill="none"
          stroke="color-mix(in srgb, var(--t-osu, #fde68a) 72%, #fef3c7)"
          strokeOpacity="0.42"
          strokeWidth="0.9"
        />
        <path
          d={sketch.tiltedHalo}
          transform="translate(1.4 1.0)"
          fill="none"
          stroke="var(--t-osu, #93c5fd)"
          strokeOpacity="0.22"
          strokeWidth="0.9"
        />

        {/* Bowed constellation thread connecting diamond vertices */}
        {sketch.constellLinks.map((lk, idx) => (
          <path
            key={idx}
            d={lk}
            fill="none"
            stroke="rgba(226, 232, 240, 0.24)"
            strokeWidth="0.75"
            strokeLinecap="round"
          />
        ))}

        {/* Twinkling Stars */}
        {stars.map((st, idx) => {
          const style = {
            transformOrigin: `${st.x}px ${st.y}px`,
            '--tw-dur': `${st.dur.toFixed(2)}s`,
            '--tw-delay': `${st.delay.toFixed(2)}s`,
          } as CSSProperties;
          if (st.kind === 'diamond') {
            const r = st.r;
            const d = `M ${st.x} ${st.y - r * 1.45} Q ${st.x} ${st.y} ${st.x + r * 1.45} ${st.y} Q ${st.x} ${st.y} ${st.x} ${st.y + r * 1.45} Q ${st.x} ${st.y} ${st.x - r * 1.45} ${st.y} Q ${st.x} ${st.y} ${st.x} ${st.y - r * 1.45} Z`;
            return (
              <path
                key={idx}
                d={d}
                fill={st.color}
                className="paimon-star"
                style={style}
              />
            );
          }
          return (
            <circle
              key={idx}
              cx={st.x}
              cy={st.y}
              r={st.r}
              fill={st.color}
              className="paimon-star"
              style={style}
            />
          );
        })}

        {/* Micro Archival Registration Indices */}
        <text
          x="22"
          y="30"
          fill="color-mix(in srgb, var(--t-osu, #e03a82) 45%, #e2e8f0)"
          fillOpacity="0.52"
          fontSize="7"
          fontFamily="Consolas, monospace"
          letterSpacing="1.8"
        >
          ARCHIVE NO.{cardSerial}
        </text>
        <text
          x="278"
          y="398"
          textAnchor="end"
          fill="color-mix(in srgb, var(--t-osu, #fde68a) 72%, #ffffff)"
          fillOpacity="0.48"
          fontSize="6.5"
          fontFamily="Consolas, monospace"
          letterSpacing="1.6"
        >
          OSU! // ARCHIVE
        </text>
      </svg>

      {/* Center Hand-Drawn Astrolabe + Minimalist Thin-Stroke `osu!` Emblem */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`relative flex items-center justify-center ${
            compact ? 'h-24 w-24' : 'h-34 w-34'
          }`}
        >
          {/* Slowly Rotating Hand-Drawn Double-Inked Astrolabe Ring */}
          <svg
            aria-hidden="true"
            viewBox="0 0 140 140"
            className="paimon-orbit absolute inset-0 h-full w-full"
          >
            <path
              d={sketch.outerAstrolabe}
              fill="none"
              stroke="color-mix(in srgb, var(--t-osu, #fde68a) 78%, #fef3c7)"
              strokeOpacity="0.62"
              strokeWidth="0.95"
            />
            <path
              d={sketch.outerAstrolabe}
              transform="translate(1.4 1.0)"
              fill="none"
              stroke="color-mix(in srgb, var(--t-osu, #e03a82) 72%, #ffffff)"
              strokeOpacity="0.34"
              strokeWidth="0.95"
            />
            <path
              d={sketch.innerAstrolabe}
              fill="none"
              stroke="color-mix(in srgb, var(--t-osu, #e03a82) 60%, #ffffff)"
              strokeOpacity="0.44"
              strokeWidth="0.7"
              strokeDasharray="4 3"
            />
            <path
              d={sketch.dialTicks}
              fill="none"
              stroke="color-mix(in srgb, var(--t-osu, #fde68a) 68%, #ffffff)"
              strokeOpacity="0.34"
              strokeWidth="0.65"
            />
            <path d={sketch.northStar} fill="color-mix(in srgb, var(--t-osu, #fde68a) 76%, #fef3c7)" />
            <circle cx="70" cy="128" r="1.9" fill="color-mix(in srgb, var(--t-osu, #e03a82) 75%, #ffffff)" opacity="0.9" />
          </svg>

          {/* Centered Minimalist Thin-Stroke `osu!` Emblem */}
          <div className="relative flex flex-col items-center justify-center">
            <span
              className={`font-display select-none ${
                compact ? 'text-[1.4rem]' : 'text-[2.05rem]'
              }`}
              style={{
                fontWeight: 200,
                letterSpacing: '0.2em',
                color: '#fefce8',
                textShadow:
                  '0 0 18px color-mix(in srgb, var(--t-osu, #fbbf24) 70%, transparent), 0 0 34px color-mix(in srgb, var(--t-osu, #93c5fd) 48%, transparent)',
                paddingLeft: '0.2em',
              }}
            >
              osu!
            </span>
            <span
              className="mt-0.5 font-mono text-[0.52rem] tracking-[0.28em] uppercase"
              style={{
                color: 'color-mix(in srgb, var(--t-osu, #bfdbfe) 52%, #e2e8f0)',
                paddingLeft: '0.28em',
              }}
            >
              4K // ARCHIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
