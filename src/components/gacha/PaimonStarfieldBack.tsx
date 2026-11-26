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
          'radial-gradient(ellipse at 50% 34%, #1c296b 0%, #0d153e 46%, #060a22 86%, #040614 100%)',
      }}
    >
      {/* Drifting Paimon-Cloak Nebula Veil */}
      <div
        aria-hidden="true"
        className="paimon-nebula pointer-events-none absolute -inset-[18%]"
        style={{
          background:
            'radial-gradient(circle at 26% 24%, rgba(56, 189, 248, 0.24), transparent 46%), radial-gradient(circle at 76% 68%, rgba(167, 139, 250, 0.24), transparent 48%), radial-gradient(circle at 48% 52%, rgba(251, 191, 36, 0.14), transparent 40%)',
        }}
      />

      {/* Constellation Drafting Layer + Twinkling Stars */}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 420"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id={`paimon-glow-${seed}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(253, 230, 138, 0.34)" />
            <stop offset="60%" stopColor="rgba(147, 197, 253, 0.08)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
        </defs>

        {/* Central golden-indigo celestial aura */}
        <circle cx="150" cy="210" r="108" fill={`url(#paimon-glow-${seed})`} />

        {/* Broken drafting coordinate axes */}
        <path
          d={sketch.crossAxes}
          fill="none"
          stroke="rgba(186, 230, 253, 0.14)"
          strokeWidth="0.7"
          strokeDasharray="3 5"
        />

        {/* Printmaker inner corner registration ticks */}
        <path
          d={sketch.cornerCrops}
          fill="none"
          stroke="rgba(199, 210, 254, 0.24)"
          strokeWidth="0.75"
        />

        {/* Tilted celestial halo oval (double-inked offset pass) */}
        <path
          d={sketch.tiltedHalo}
          fill="none"
          stroke="rgba(253, 230, 138, 0.28)"
          strokeWidth="0.9"
        />
        <path
          d={sketch.tiltedHalo}
          transform="translate(1.4 1.0)"
          fill="none"
          stroke="rgba(147, 197, 253, 0.14)"
          strokeWidth="0.9"
        />

        {/* Bowed constellation thread connecting diamond vertices */}
        {sketch.constellLinks.map((lk, idx) => (
          <path
            key={idx}
            d={lk}
            fill="none"
            stroke="rgba(199, 210, 254, 0.26)"
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
          fill="rgba(191, 219, 254, 0.42)"
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
          fill="rgba(253, 230, 138, 0.36)"
          fontSize="6.5"
          fontFamily="Consolas, monospace"
          letterSpacing="1.6"
        >
          4K // CELESTIAL
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
              stroke="rgba(253, 230, 138, 0.48)"
              strokeWidth="0.95"
            />
            <path
              d={sketch.outerAstrolabe}
              transform="translate(1.4 1.0)"
              fill="none"
              stroke="rgba(165, 243, 252, 0.22)"
              strokeWidth="0.95"
            />
            <path
              d={sketch.innerAstrolabe}
              fill="none"
              stroke="rgba(165, 243, 252, 0.36)"
              strokeWidth="0.7"
              strokeDasharray="4 3"
            />
            <path
              d={sketch.dialTicks}
              fill="none"
              stroke="rgba(253, 230, 138, 0.26)"
              strokeWidth="0.65"
            />
            <path d={sketch.northStar} fill="#fde68a" />
            <circle cx="70" cy="128" r="1.9" fill="#93c5fd" opacity="0.88" />
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
                color: '#fef3c7',
                textShadow:
                  '0 0 18px rgba(251, 191, 36, 0.45), 0 0 32px rgba(147, 197, 253, 0.32)',
                paddingLeft: '0.2em',
              }}
            >
              osu!
            </span>
            <span
              className="mt-0.5 font-mono text-[0.52rem] tracking-[0.28em] uppercase"
              style={{ color: 'rgba(191, 219, 254, 0.68)', paddingLeft: '0.28em' }}
            >
              CELESTIAL DECK
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
