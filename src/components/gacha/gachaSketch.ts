export type SketchPoint = [number, number];
export type SketchRng = () => number;

export const TAU = Math.PI * 2;
const f = (n: number) => n.toFixed(1);

/** Deterministic Mulberry32 PRNG so hand-drawn SVG lines never shimmer between renders. */
export function rng(seed: number): SketchRng {
  let state = (Math.floor(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom spline converted into smooth cubic Beziers. */
export function curve(pts: SketchPoint[], closed = false): string {
  const n = pts.length;
  if (n < 2) return '';
  const at = (i: number) =>
    closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = '';
  for (let i = 0; i < (closed ? n : n - 1); i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(
      p2[0] - (p3[0] - p1[0]) / 6,
    )} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

export function path(pts: SketchPoint[], closed = false): string {
  if (pts.length === 0) return '';
  return `M${f(pts[0][0])} ${f(pts[0][1])}${curve(pts, closed)}${closed ? 'Z' : ''}`;
}

export function wobble(r: SketchRng): (t: number) => number {
  const a = r() * TAU;
  const b = r() * TAU;
  const k = 1 + Math.floor(r() * 2);
  const m = 3 + Math.floor(r() * 3);
  return (t: number) => Math.sin(t * k + a) * 0.65 + Math.sin(t * m + b) * 0.35;
}

export function arcPts(
  cx: number,
  cy: number,
  rad: number,
  a0: number,
  a1: number,
  r: SketchRng,
  amp = 1.6,
  sy = 1,
): SketchPoint[] {
  const w = wobble(r);
  const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * rad) / 24));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    const rr = rad + w(a) * amp;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy] as SketchPoint;
  });
}

/** Single-stroke hand-drawn ring that breathes gently and overshoots its closure. */
export function ring(
  cx: number,
  cy: number,
  rad: number,
  r: SketchRng,
  amp = 1.6,
  sy = 1,
): string {
  const a0 = r() * TAU;
  return path(arcPts(cx, cy, rad, a0, a0 + TAU + 0.1 + r() * 0.28, r, amp, sy));
}

export function arc(
  cx: number,
  cy: number,
  rad: number,
  a0: number,
  a1: number,
  r: SketchRng,
  amp = 1.2,
  sy = 1,
): string {
  return path(arcPts(cx, cy, rad, a0, a1, r, amp, sy));
}

/** Drafting rule with subtle bow and strokes running slightly past endpoints. */
export function rule(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: SketchRng,
  over = 10,
  bow = 2.4,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const o1 = over * (0.3 + r());
  const o2 = over * (0.3 + r());
  const b = (r() - 0.5) * 2 * bow;
  return `M${f(x1 - ux * o1)} ${f(y1 - uy * o1)}Q${f((x1 + x2) / 2 - uy * b)} ${f(
    (y1 + y2) / 2 + ux * b,
  )} ${f(x2 + ux * o2)} ${f(y2 + uy * o2)}`;
}

/** Tapered calligraphic brush ribbon outline. */
export function brush(pts: SketchPoint[], width: number, bias = 0.5): string {
  const n = pts.length;
  if (n < 2) return '';
  const left: SketchPoint[] = [];
  const right: SketchPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const t = i / (n - 1);
    const k = Math.pow(Math.sin(Math.PI * Math.pow(t, bias * 2)), 0.75);
    const hw = (width * Math.max(0.03, k)) / 2;
    left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]);
    right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
  }
  right.reverse();
  return `M${f(left[0][0])} ${f(left[0][1])}${curve(left)}L${f(right[0][0])} ${f(
    right[0][1],
  )}${curve(right)}Z`;
}

export function sweepPts(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amp: number,
  n = 14,
): SketchPoint[] {
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const s = Math.sin(t * Math.PI * 1.6) * amp;
    return [x1 + (x2 - x1) * t + (nx / len) * s, y1 + (y2 - y1) * t + (ny / len) * s];
  });
}

/** Curved architectural light-blade shard. */
export function blade(
  cx: number,
  cy: number,
  len: number,
  w: number,
  ang: number,
  r: SketchRng,
): string {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  const s = (r() - 0.3) * 0.5;
  const ax = cx - (ux * len) / 2;
  const ay = cy - (uy * len) / 2;
  const bx = cx + (ux * len) / 2;
  const by = cy + (uy * len) / 2;
  return `M${f(ax)} ${f(ay)}Q${f(cx + ux * len * s + nx * w)} ${f(
    cy + uy * len * s + ny * w,
  )} ${f(bx)} ${f(by)}Q${f(cx + ux * len * s * 0.6 - nx * w * 0.2)} ${f(
    cy + uy * len * s * 0.6 - ny * w * 0.2,
  )} ${f(ax)} ${f(ay)}Z`;
}

/** Four-point diamond sparkle. */
export function sparkle(x: number, y: number, s: number): string {
  return `M${f(x)} ${f(y - s)}Q${f(x)} ${f(y)} ${f(x + s * 0.7)} ${f(y)}Q${f(x)} ${f(
    y,
  )} ${f(x)} ${f(y + s)}Q${f(x)} ${f(y)} ${f(x - s * 0.7)} ${f(y)}Q${f(x)} ${f(y)} ${f(
    x,
  )} ${f(y - s)}Z`;
}

/** Printmaker L-shaped corner crop marks. */
export function crops(x0: number, y0: number, x1: number, y1: number, len = 24): string {
  return `M${f(x0)} ${f(y0 + len)}V${f(y0)}H${f(x0 + len)}M${f(x1 - len)} ${f(
    y0,
  )}H${f(x1)}V${f(y0 + len)}M${f(x1)} ${f(y1 - len)}V${f(y1)}H${f(
    x1 - len,
  )}M${f(x0 + len)} ${f(y1)}H${f(x0)}V${f(y1 - len)}`;
}

/** Graduated radial dial ticks. */
export function ticks(
  cx: number,
  cy: number,
  rad: number,
  count: number,
  r: SketchRng,
): string {
  let d = '';
  const majorMod = Math.max(1, Math.round(count / 12));
  const midMod = Math.max(1, Math.round(count / 24));
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU;
    const baseLen = i % majorMod === 0 ? 18 : i % midMod === 0 ? 10 : 5;
    const len = baseLen * (0.82 + r() * 0.36);
    d += `M${f(cx + Math.cos(a) * rad)} ${f(cy + Math.sin(a) * rad)}L${f(
      cx + Math.cos(a) * (rad + len),
    )} ${f(cy + Math.sin(a) * (rad + len))}`;
  }
  return d;
}

export function brokenAxis(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: SketchRng,
  parts = 4,
): string {
  let d = '';
  for (let i = 0; i < parts; i += 1) {
    const t0 = i / parts + r() * 0.03;
    const t1 = (i + 1) / parts - 0.02 - r() * 0.05;
    d += rule(
      x1 + (x2 - x1) * t0,
      y1 + (y2 - y1) * t0,
      x1 + (x2 - x1) * t1,
      y1 + (y2 - y1) * t1,
      r,
      6,
      1.6,
    );
  }
  return d;
}

export function hexPts(cx: number, cy: number, s: number, r: SketchRng): SketchPoint[] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * TAU - Math.PI / 2;
    return [
      cx + Math.cos(a) * s + (r() - 0.5) * 1.4,
      cy + Math.sin(a) * s + (r() - 0.5) * 1.4,
    ] as SketchPoint;
  });
}

export function poly(pts: SketchPoint[]): string {
  return `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`;
}

export interface ConstellationNode {
  x: number;
  y: number;
  size: number;
  ringPath: string;
}

export function constellationData(
  cx: number,
  cy: number,
  rad: number,
  count: number,
  r: SketchRng,
): { nodes: ConstellationNode[]; links: string[] } {
  const raw = Array.from({ length: count }, () => {
    const a = r() * TAU;
    const dist = rad * (0.28 + r() * 0.72);
    const size = 2.6 + r() * 9.4;
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist * 0.8;
    return { x, y, size };
  }).sort((a, b) => a.x - b.x);

  const links: string[] = [];
  raw.forEach((p, idx) => {
    if (idx > 0) {
      links.push(rule(raw[idx - 1].x, raw[idx - 1].y, p.x, p.y, r, 4, 2.4));
    }
    if (idx > 1 && r() > 0.55) {
      const q = raw[Math.floor(r() * (idx - 1))];
      links.push(rule(q.x, q.y, p.x, p.y, r, 3, 3.2));
    }
  });

  const nodes: ConstellationNode[] = raw.map((n) => ({
    ...n,
    ringPath: n.size >= 5.5 ? ring(n.x, n.y, n.size, r, 0.55) : '',
  }));

  return { nodes, links };
}
