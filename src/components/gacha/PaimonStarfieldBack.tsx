import { memo, useMemo, type CSSProperties } from 'react';

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
 * Animated Paimon-cape midnight cosmic starfield card back with twinkling 4-point
 * constellation stars and a minimalist thin-stroke `osu!` center emblem.
 * Built strictly with GPU-composited CSS + inline SVG (zero JS rAF loops) and zero border.
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
      const y = 18 + seededUnit(s + 2) * 384;
      const isDiamond = i < (compact ? 6 : 9);
      list.push({
        x,
        y,
        r: isDiamond ? 3.2 + seededUnit(s + 3) * 4.4 : 0.9 + seededUnit(s + 4) * 1.6,
        kind: isDiamond ? 'diamond' : 'dot',
        color: COSMIC_COLORS[i % COSMIC_COLORS.length],
        dur: 2.3 + seededUnit(s + 5) * 2.8,
        delay: -(seededUnit(s + 6) * 4.5),
      });
    }
    return list;
  }, [seed, compact]);

  const diamondStars = useMemo(() => stars.filter((s) => s.kind === 'diamond'), [stars]);
  const constellationPath = useMemo(() => {
    if (diamondStars.length < 3) return '';
    return diamondStars
      .slice(0, 6)
      .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`)
      .join(' ');
  }, [diamondStars]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden select-none ${className}`}
      style={{
        background:
          'radial-gradient(ellipse at 50% 34%, #1e2a6e 0%, #0e1540 46%, #070b24 85%, #040615 100%)',
      }}
    >
      {/* Drifting Paimon-Cloak Nebula Veil */}
      <div
        aria-hidden="true"
        className="paimon-nebula pointer-events-none absolute -inset-[18%]"
        style={{
          background:
            'radial-gradient(circle at 26% 24%, rgba(56, 189, 248, 0.22), transparent 46%), radial-gradient(circle at 76% 68%, rgba(167, 139, 250, 0.24), transparent 48%), radial-gradient(circle at 48% 52%, rgba(251, 191, 36, 0.14), transparent 40%)',
        }}
      />

      {/* Constellation Lines & Twinkling Stars */}
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

        {/* Subtle golden-indigo inner celestial halos */}
        <circle cx="150" cy="210" r="108" fill={`url(#paimon-glow-${seed})`} />
        <path
          d="M 150 26 L 150 394 M 26 210 L 274 210"
          stroke="rgba(186, 230, 253, 0.10)"
          strokeWidth="0.7"
          strokeDasharray="3 6"
        />

        {/* Delicate constellation thread connecting bright vertices */}
        {constellationPath && (
          <path
            d={constellationPath}
            fill="none"
            stroke="rgba(199, 210, 254, 0.24)"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

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
      </svg>

      {/* Center Minimalist Thin-Stroke Astrolabe + `osu!` Identity */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`relative flex items-center justify-center ${
            compact ? 'h-24 w-24' : 'h-32 w-32'
          }`}
        >
          {/* Rotating Hairline Astrolabe Ring */}
          <svg
            aria-hidden="true"
            viewBox="0 0 140 140"
            className="paimon-orbit absolute inset-0 h-full w-full"
          >
            <circle
              cx="70"
              cy="70"
              r="58"
              fill="none"
              stroke="rgba(253, 230, 138, 0.38)"
              strokeWidth="0.9"
              strokeDasharray="6 4 2 4"
            />
            <circle
              cx="70"
              cy="70"
              r="49"
              fill="none"
              stroke="rgba(165, 243, 252, 0.34)"
              strokeWidth="0.7"
            />
            {/* Top orbital four-point compass star */}
            <path
              d="M 70 6 L 72 11 L 77 12 L 72 13 L 70 18 L 68 13 L 63 12 L 68 11 Z"
              fill="#fde68a"
            />
            <circle cx="70" cy="128" r="2" fill="#93c5fd" opacity="0.85" />
          </svg>

          {/* Inner Thin-Stroke Emblem */}
          <div className="relative flex flex-col items-center justify-center">
            <span
              className={`font-display select-none ${
                compact ? 'text-[1.45rem]' : 'text-[2.1rem]'
              }`}
              style={{
                fontWeight: 200,
                letterSpacing: '0.18em',
                color: '#fef3c7',
                textShadow:
                  '0 0 18px rgba(251, 191, 36, 0.45), 0 0 32px rgba(147, 197, 253, 0.32)',
                paddingLeft: '0.18em',
              }}
            >
              osu!
            </span>
            <span
              className="mt-0.5 font-mono text-[0.55rem] tracking-[0.28em] uppercase"
              style={{ color: 'rgba(191, 219, 254, 0.65)', paddingLeft: '0.28em' }}
            >
              CELESTIAL DECK
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
