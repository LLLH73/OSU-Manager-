interface OsuMusicMarkProps {
  className?: string;
  active?: boolean;
  playing?: boolean;
}

/**
 * Stylized geometric circular osu! emblem tuned for Swiss / Constructivist typography.
 * Keeps `osu!` crisp and upright even at small sidebar/dock sizes.
 */
export function OsuMusicMark({
  className = 'h-4 w-4',
  active = false,
  playing = false,
}: OsuMusicMarkProps) {
  const signalColor = active || playing ? 'var(--mp-signal, #d62828)' : 'currentColor';

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      {/* Outer precision circle + Constructivist top/bottom crosshair ticks */}
      <circle
        cx="12"
        cy="12"
        r="9.75"
        stroke={playing ? 'var(--mp-signal, #d62828)' : 'currentColor'}
        strokeWidth="1.8"
      />
      <path
        d="M12 1.15v1.55M12 21.3v1.55"
        stroke={signalColor}
        strokeWidth="1.6"
        strokeLinecap="square"
      />

      {/* Geometric 'o' */}
      <circle
        cx="6.45"
        cy="12.2"
        r="2.05"
        stroke="currentColor"
        strokeWidth="1.65"
      />

      {/* Geometric 's' */}
      <path
        d="M12.35 10.35h-1.85a.75.75 0 0 0-.75.75v.28a.75.75 0 0 0 .75.75h1.18a.75.75 0 0 1 .75.75v.55a.75.75 0 0 1-.75.75H9.65"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />

      {/* Geometric 'u' */}
      <path
        d="M13.95 10.15v2.95a1.25 1.25 0 0 0 1.25 1.25h.25a1.25 1.25 0 0 0 1.25-1.25v-2.95"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />

      {/* Exclamation '!' (stem + Constructivist signal dot) */}
      <path
        d="M18.45 9.15v3.3"
        stroke={signalColor}
        strokeWidth="1.75"
        strokeLinecap="square"
      />
      <circle cx="18.45" cy="14.55" r="0.95" fill={signalColor} />
    </svg>
  );
}
