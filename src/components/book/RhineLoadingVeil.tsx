import { useEffect, useState } from 'react';

export type RhineVeilMode = 'enter' | 'theme' | 'refresh';

interface RhineLoadingVeilProps {
  visible: boolean;
  mode: RhineVeilMode;
  isDark: boolean;
  progress: number;
  statusText: string;
  detailText?: string;
}

const MODE_META: Record<RhineVeilMode, { tag: string; heading: string }> = {
  enter: {
    tag: 'ACCESSING REPOSITORY',
    heading: 'INDEXING LOCAL ARCHIVE',
  },
  theme: {
    tag: 'OPTICAL CALIBRATION',
    heading: 'CALIBRATING OPTICAL THEME',
  },
  refresh: {
    tag: 'SYNCING DATABASES',
    heading: 'RESCANNING LOCAL LIBRARY',
  },
};

export function RhineLoadingVeil({
  visible,
  mode,
  isDark,
  progress,
  statusText,
  detailText,
}: RhineLoadingVeilProps) {
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }
    const timer = window.setTimeout(() => setRendered(false), 260);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!rendered) return null;

  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const progressLabel = `${String(clamped).padStart(2, '0')}%`;
  const meta = MODE_META[mode];

  return (
    <div
      data-rhine-dark={isDark ? 'true' : 'false'}
      data-veil-mode={mode}
      aria-hidden={!visible}
      className={`rhine-book-root absolute inset-0 z-40 flex flex-col justify-between overflow-hidden px-6 py-5 transition-opacity duration-250 sm:px-9 sm:py-7 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{
        backgroundColor: 'var(--rb-paper)',
        backgroundImage: isDark
          ? 'radial-gradient(ellipse at 50% 48%, rgba(197, 161, 107, 0.08) 0%, rgba(17, 24, 27, 0.96) 62%, #0e1417 100%)'
          : 'radial-gradient(ellipse at 50% 48%, rgba(166, 125, 72, 0.09) 0%, rgba(234, 229, 225, 0.94) 64%, #e2dcd5 100%)',
      }}
    >
      {/* Subtle architectural frame lines & corner registration ticks */}
      <div className="pointer-events-none absolute inset-4 border border-[var(--rb-line)]/45 sm:inset-5" />
      <div className="pointer-events-none absolute top-4 left-4 h-3 w-3 border-t-2 border-l-2 border-[var(--rb-ink)]/70 sm:top-5 sm:left-5" />
      <div className="pointer-events-none absolute top-4 right-4 h-3 w-3 border-t-2 border-r-2 border-[var(--rb-ink)]/70 sm:top-5 sm:right-5" />
      <div className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b-2 border-l-2 border-[var(--rb-ink)]/70 sm:bottom-5 sm:left-5" />
      <div className="pointer-events-none absolute right-4 bottom-4 h-3 w-3 border-r-2 border-b-2 border-[var(--rb-ink)]/70 sm:right-5 sm:bottom-5" />

      {/* Top Stamp Header */}
      <div className="relative z-10 flex items-center justify-between gap-4 font-mono text-[0.6875rem] tracking-[0.16em] text-[var(--rb-muted)] uppercase">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 bg-[var(--rb-accent)]" />
          <span className="font-bold text-[var(--rb-ink)]">LOCAL ARCHIVE // OSU!</span>
          <span className="hidden h-3 w-px bg-[var(--rb-line)] sm:inline-block" />
          <span className="hidden sm:inline">{meta.tag}</span>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span>RHINE.FOLIO.3D</span>
          <span className="inline-block h-1 w-4 bg-[var(--rb-line)]" />
        </div>
      </div>

      {/* Center Concentric Calibration Rings + Heading + Progress */}
      <div className="relative z-10 mx-auto flex w-full max-w-[480px] flex-col items-center text-center">
        <div className="relative flex h-44 w-44 items-center justify-center sm:h-48 sm:w-48">
          <svg
            viewBox="0 0 220 220"
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {/* Static Outer Reference Track */}
            <circle
              cx="110"
              cy="110"
              r="98"
              fill="none"
              stroke="var(--rb-line)"
              strokeOpacity="0.45"
              strokeWidth="1"
            />
            {/* Crosshair Reticle */}
            <line
              x1="110"
              y1="2"
              x2="110"
              y2="18"
              stroke="var(--rb-line)"
              strokeWidth="1.2"
            />
            <line
              x1="110"
              y1="202"
              x2="110"
              y2="218"
              stroke="var(--rb-line)"
              strokeWidth="1.2"
            />
            <line
              x1="2"
              y1="110"
              x2="18"
              y2="110"
              stroke="var(--rb-line)"
              strokeWidth="1.2"
            />
            <line
              x1="202"
              y1="110"
              x2="218"
              y2="110"
              stroke="var(--rb-line)"
              strokeWidth="1.2"
            />

            {/* Ring 1: Outer CW Ring + Warm Amber Orbital Node */}
            <g className="rhine-scan-ring-1" style={{ transformOrigin: '110px 110px' }}>
              <circle
                cx="110"
                cy="110"
                r="88"
                fill="none"
                stroke="var(--rb-ink)"
                strokeOpacity="0.58"
                strokeWidth="1.75"
                strokeDasharray="190 92 42 54"
              />
              <circle
                cx="110"
                cy="22"
                r="4.2"
                fill="var(--rb-accent)"
                style={{
                  filter: 'drop-shadow(0 0 7px rgba(197, 161, 107, 0.85))',
                }}
              />
            </g>

            {/* Ring 2: Mid CCW Ring */}
            <g className="rhine-scan-ring-2" style={{ transformOrigin: '110px 110px' }}>
              <circle
                cx="110"
                cy="110"
                r="70"
                fill="none"
                stroke="var(--rb-muted)"
                strokeOpacity="0.72"
                strokeWidth="2.2"
                strokeDasharray="88 76 34 48"
              />
              <circle
                cx="180"
                cy="110"
                r="2.6"
                fill="var(--rb-ink)"
              />
            </g>

            {/* Ring 3: Inner Dashed Fine Circle */}
            <g className="rhine-scan-ring-3" style={{ transformOrigin: '110px 110px' }}>
              <circle
                cx="110"
                cy="110"
                r="52"
                fill="none"
                stroke="var(--rb-accent)"
                strokeOpacity="0.65"
                strokeWidth="1.25"
                strokeDasharray="12 10"
              />
            </g>

            {/* Inner Geometric Frame */}
            <rect
              x="96"
              y="96"
              width="28"
              height="28"
              fill="none"
              stroke="var(--rb-line)"
              strokeOpacity="0.55"
              strokeWidth="1"
              transform="rotate(45 110 110)"
            />
          </svg>

          {/* Center Numeric Progress */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-stat text-[1.45rem] leading-none font-semibold tracking-tight text-[var(--rb-ink)] tabular-nums">
              {progressLabel}
            </span>
            <span className="mt-1 font-mono text-[0.5625rem] tracking-[0.18em] text-[var(--rb-accent)] uppercase">
              SYNC
            </span>
          </div>
        </div>

        {/* Heading & Chinese Status Line */}
        <h2 className="mt-4 font-display text-[1.1rem] font-extrabold tracking-[0.14em] text-[var(--rb-ink)] uppercase sm:text-[1.25rem]">
          {meta.heading}
        </h2>
        <p className="mt-2 text-[0.8125rem] font-medium text-[var(--rb-ink)]/85">
          {statusText}
        </p>
        {detailText && (
          <p className="mt-0.5 font-mono text-[0.6875rem] tracking-[0.06em] text-[var(--rb-muted)]">
            {detailText}
          </p>
        )}

        {/* Architectural 2px Horizontal Progress Hairline */}
        <div className="mt-5 w-full max-w-[300px]">
          <div className="relative h-[2px] w-full overflow-hidden bg-[var(--rb-line)]/50">
            <div
              className="h-full bg-[var(--rb-accent)] transition-[width] duration-150 ease-out"
              style={{ width: `${clamped}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[0.5625rem] tracking-[0.14em] text-[var(--rb-muted)] uppercase">
            <span>BUFFER ALLOCATION</span>
            <span>{progressLabel}</span>
          </div>
        </div>
      </div>

      {/* Bottom Terminal Prompt */}
      <div className="relative z-10 flex items-center justify-between gap-4 font-mono text-[0.6875rem] tracking-[0.12em] text-[var(--rb-muted)] uppercase">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--rb-ink)]">START PROCESSING...</span>
          <i className="rhine-cursor-blink inline-block h-3.5 w-[2.5px] bg-[var(--rb-ink)]" />
        </div>
        <span className="hidden text-[0.625rem] sm:inline">AUTHORIZED INDEX INTERFACE</span>
      </div>
    </div>
  );
}

interface RhineFilterTransitionHudProps {
  active: boolean;
  label: string;
  countText?: string;
}

export function RhineFilterTransitionHud({
  active,
  label,
  countText,
}: RhineFilterTransitionHudProps) {
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-25 flex flex-col items-center">
      {/* Top 2px RhineLab Scan Sweep Beam */}
      <div className="relative h-[2px] w-full overflow-hidden bg-[var(--rb-line)]/25">
        <div className="rhine-filter-scanline h-full w-1/3" />
      </div>

      {/* Centered-Top Frosted Telemetry Pill */}
      <div className="mt-2.5 flex items-center gap-2.5 border border-[var(--rb-line)] bg-[var(--rb-paper)]/92 px-3 py-1 font-mono text-[0.6875rem] tracking-[0.1em] text-[var(--rb-ink)] shadow-sm backdrop-blur-md">
        <svg viewBox="0 0 18 18" className="rhine-scan-ring-2 h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <circle
            cx="9"
            cy="9"
            r="6.5"
            fill="none"
            stroke="var(--rb-accent)"
            strokeWidth="1.6"
            strokeDasharray="14 6 6 6"
          />
        </svg>
        <span className="font-semibold uppercase">FILTER SYNC // {label}</span>
        {countText && (
          <>
            <span className="h-2.5 w-px bg-[var(--rb-line)]" />
            <span className="text-[var(--rb-muted)]">{countText}</span>
          </>
        )}
      </div>
    </div>
  );
}
