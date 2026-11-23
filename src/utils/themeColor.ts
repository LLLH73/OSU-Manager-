const DOMINANT_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(hn + 1 / 3) * 255),
    Math.round(hue2rgb(hn) * 255),
    Math.round(hue2rgb(hn - 1 / 3) * 255),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return null;
  const n = parseInt(clean.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
  return rgbToHex(r, g, b);
}

function setCache(url: string, hex: string): void {
  if (DOMINANT_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = DOMINANT_CACHE.keys().next().value;
    if (firstKey !== undefined) DOMINANT_CACHE.delete(firstKey);
  }
  DOMINANT_CACHE.set(url, hex);
}

/**
 * Extracts a vivid, representative dominant hex color from an image URL using
 * 24-bin hue histogram quantization weighted by saturation and balanced lightness.
 */
export function extractDominantColor(imageUrl: string): Promise<string | null> {
  if (!imageUrl || typeof document === 'undefined') return Promise.resolve(null);
  const cached = DOMINANT_CACHE.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const finish = (hex: string | null) => {
      if (hex) setCache(imageUrl, hex);
      resolve(hex);
    };

    img.onload = () => {
      try {
        const w = 48;
        const h = 27;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        const bins = new Float32Array(24);
        const binR = new Float32Array(24);
        const binG = new Float32Array(24);
        const binB = new Float32Array(24);

        let fallbackR = 0;
        let fallbackG = 0;
        let fallbackB = 0;
        let fallbackCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 128) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          fallbackR += r;
          fallbackG += g;
          fallbackB += b;
          fallbackCount += 1;

          const [hue, sat, light] = rgbToHsl(r, g, b);
          if (light < 0.09 || light > 0.92) continue;

          // Weight saturated mid-tone pixels strongly so cover focal hues beat dark/neutral backdrops
          const satWeight = sat < 0.14 ? 0.04 : Math.pow(sat, 1.35);
          const lightWeight = 1 - Math.min(1, Math.abs(light - 0.52) * 1.35);
          const weight = satWeight * Math.max(0.15, lightWeight);

          const bin = Math.min(23, Math.floor((hue / 360) * 24));
          bins[bin] += weight;
          binR[bin] += r * weight;
          binG[bin] += g * weight;
          binB[bin] += b * weight;
        }

        let bestBin = -1;
        let bestWeight = 0;
        for (let b = 0; b < 24; b++) {
          if (bins[b] > bestWeight) {
            bestWeight = bins[b];
            bestBin = b;
          }
        }

        if (bestBin >= 0 && bestWeight > 0) {
          const r = binR[bestBin] / bestWeight;
          const g = binG[bestBin] / bestWeight;
          const b = binB[bestBin] / bestWeight;
          finish(rgbToHex(r, g, b));
          return;
        }

        if (fallbackCount > 0) {
          finish(
            rgbToHex(
              fallbackR / fallbackCount,
              fallbackG / fallbackCount,
              fallbackB / fallbackCount,
            ),
          );
          return;
        }
        finish(null);
      } catch {
        finish(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Derives readable primary/secondary accent tokens and ambient glow tints
 * from a single dominant or user-picked hex color for either dark or light themes.
 */
export function deriveAccentVariables(hexColor: string, isDark: boolean): Record<string, string> | null {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return null;

  const [hue, rawSat] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const sat = rawSat < 0.1 ? clamp(rawSat, 0.08, 0.2) : clamp(rawSat, 0.52, 0.88);
  const altHue = (hue + 26) % 360;
  const altSat = rawSat < 0.1 ? sat : clamp(sat * 0.94, 0.48, 0.86);

  const primaryHex = isDark ? hslToHex(hue, sat, 0.62) : hslToHex(hue, sat, 0.45);
  const primarySoftHex = isDark ? hslToHex(hue, clamp(sat * 0.92, 0.1, 0.9), 0.74) : hslToHex(hue, sat, 0.37);

  const secondaryHex = isDark ? hslToHex(altHue, altSat, 0.6) : hslToHex(altHue, altSat, 0.46);
  const secondarySoftHex = isDark
    ? hslToHex(altHue, clamp(altSat * 0.92, 0.1, 0.9), 0.73)
    : hslToHex(altHue, altSat, 0.38);

  const pRgb = hexToRgb(primaryHex) ?? rgb;
  const sRgb = hexToRgb(secondaryHex) ?? rgb;
  const sSoftRgb = hexToRgb(secondarySoftHex) ?? rgb;

  return {
    '--t-osu': primaryHex,
    '--t-osu-soft': primarySoftHex,
    '--t-lazer': secondaryHex,
    '--t-lazer-soft': secondarySoftHex,
    '--pp-bg': `rgba(${sRgb[0]}, ${sRgb[1]}, ${sRgb[2]}, ${isDark ? 0.16 : 0.1})`,
    '--pp-text': isDark
      ? hslToHex(altHue, clamp(altSat * 0.85, 0.15, 0.9), 0.84)
      : hslToHex(altHue, altSat, 0.34),
    '--pp-border': `rgba(${sSoftRgb[0]}, ${sSoftRgb[1]}, ${sSoftRgb[2]}, ${isDark ? 0.42 : 0.32})`,
    '--t-glow-a': `rgba(${sRgb[0]}, ${sRgb[1]}, ${sRgb[2]}, ${isDark ? 0.11 : 0.06})`,
    '--t-glow-b': `rgba(${pRgb[0]}, ${pRgb[1]}, ${pRgb[2]}, ${isDark ? 0.08 : 0.05})`,
    '--t-glow-c': `rgba(${sRgb[0]}, ${sRgb[1]}, ${sRgb[2]}, ${isDark ? 0.06 : 0.04})`,
  };
}

const ACCENT_PROP_KEYS = [
  '--t-osu',
  '--t-osu-soft',
  '--t-lazer',
  '--t-lazer-soft',
  '--pp-bg',
  '--pp-text',
  '--pp-border',
  '--t-glow-a',
  '--t-glow-b',
  '--t-glow-c',
];

export function clearAccentVariables(): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  for (const key of ACCENT_PROP_KEYS) {
    style.removeProperty(key);
  }
}

export function applyAccentVariables(hexColor: string | null, isDark: boolean): void {
  if (!hexColor) {
    clearAccentVariables();
    return;
  }
  const vars = deriveAccentVariables(hexColor, isDark);
  if (!vars || typeof document === 'undefined') {
    clearAccentVariables();
    return;
  }
  const style = document.documentElement.style;
  for (const [key, val] of Object.entries(vars)) {
    style.setProperty(key, val);
  }
}
