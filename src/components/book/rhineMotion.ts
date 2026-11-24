export function smooth(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * clamped * (10 + clamped * (-15 + 6 * clamped));
}

export function bell(x: number, width: number): number {
  const scaled = x / width;
  return Math.exp(-0.5 * scaled * scaled);
}

export interface Spring {
  value: number;
  velocity: number;
}

/** Critically damped spring step matching RhineLabUI motion physics. */
export function damp(s: Spring, target: number, rate: number, dt: number): void {
  const delta = s.value - target;
  const impulse = s.velocity + rate * delta;
  const decay = Math.exp(-rate * dt);
  s.value = target + (delta + impulse * dt) * decay;
  s.velocity = (s.velocity - rate * impulse * dt) * decay;
}

export const ALIGNMENT_EPSILON = 0.001;

export function returnStep(angle: number, dt: number, reduced = false): number {
  const next = angle * Math.exp(-dt * (reduced ? 35 : 7));
  return Math.abs(next) <= ALIGNMENT_EPSILON ? 0 : next;
}

/** Gentle multi-period ambient breathing motion across the book archive. */
export function idleWave(row: number, lane: number, time: number): number {
  return (
    0.052 * Math.sin((time * Math.PI * 2) / 8 + row * 0.3 - lane * 0.45) +
    0.021 * Math.sin((time * Math.PI * 2) / 13 - row * 0.17 + lane * 0.3)
  );
}

/** Outward decaying shoulder ripple when a book returns into its shelf slot. */
export function selectionWave(distance: number, age: number): number {
  if (age < 0 || age > 3.2) return 0;
  return (
    0.72 *
    smooth(age / 0.2) *
    Math.exp(-age * 1.15) *
    Math.cos((distance - age * 8) * 0.58) *
    bell(distance - age * 8, 3.4)
  );
}

/**
 * RhineLabUI-inspired hover extraction field:
 * - Directly hovered book smoothly extracts half-way out (+1.28)
 * - Surrounding books in the same lane follow with Gaussian distance falloff
 * - Adjacent lanes show subtle sympathetic shoulder lift (25%)
 */
export function computeHoverWaveLift(
  row: number,
  lane: number,
  hoverRow: number,
  hoverLane: number,
): number {
  const dl = Math.abs(lane - hoverLane);
  const dr = Math.abs(row - hoverRow);
  if (dl === 0 && dr === 0) return 1.28;
  if (dl === 0 && dr <= 6) return 0.78 * bell(dr, 1.85);
  if (dl === 1 && dr <= 5) return 0.26 * bell(dr, 2.1);
  return 0;
}
