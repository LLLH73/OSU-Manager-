/**
 * Fast cover palette extractor for Zen Focus Mode.
 * Extracts a harmonized accent palette from an untouched HTMLImageElement
 * using CIE L*a*b* chroma weighting so foreground info plates and the wide
 * spectrum/oscilloscope stay cohesive with the displayed original artwork.
 */

export interface ConstructivistPalette {
  id: string;
  paper: string;
  midtone: string;
  accent: string;
  black: string;
  secondary: string;
  plateBg: string;
  plateBorder: string;
  vizInk: string;
  vizSignal: string;
  vizOchre: string;
  vizLine: string;
  vizMuted: string;
}

const CONSTRUCTIVIST_FAMILIES: ConstructivistPalette[] = [
  {
    id: 'rodchenko-crimson',
    paper: '#ECE3CE',
    midtone: '#CEC1A5',
    accent: '#D22D1E',
    black: '#171614',
    secondary: '#C68E2E',
    plateBg: 'rgba(16, 17, 21, 0.80)',
    plateBorder: 'rgba(236, 227, 206, 0.56)',
    vizInk: '#EFE6D2',
    vizSignal: '#EF4130',
    vizOchre: '#D9A74A',
    vizLine: 'rgba(239, 230, 210, 0.16)',
    vizMuted: 'rgba(239, 230, 210, 0.72)',
  },
  {
    id: 'popova-cobalt',
    paper: '#EAE7DF',
    midtone: '#BCC5D1',
    accent: '#21529E',
    black: '#14181F',
    secondary: '#D23A2C',
    plateBg: 'rgba(16, 17, 21, 0.80)',
    plateBorder: 'rgba(234, 231, 223, 0.56)',
    vizInk: '#EDE9DF',
    vizSignal: '#4E8DF0',
    vizOchre: '#E04D3F',
    vizLine: 'rgba(237, 233, 223, 0.16)',
    vizMuted: 'rgba(237, 233, 223, 0.72)',
  },
  {
    id: 'lissitzky-ochre',
    paper: '#ECE3CC',
    midtone: '#CEBE9E',
    accent: '#C6651A',
    black: '#191714',
    secondary: '#CC2F23',
    plateBg: 'rgba(16, 17, 21, 0.80)',
    plateBorder: 'rgba(236, 227, 204, 0.56)',
    vizInk: '#EFE9D8',
    vizSignal: '#E8832E',
    vizOchre: '#E34B3E',
    vizLine: 'rgba(239, 233, 216, 0.16)',
    vizMuted: 'rgba(239, 233, 216, 0.72)',
  },
  {
    id: 'industrial-emerald',
    paper: '#E7E6DC',
    midtone: '#B9C6BF',
    accent: '#1E6B5C',
    black: '#141917',
    secondary: '#CF392B',
    plateBg: 'rgba(16, 17, 21, 0.80)',
    plateBorder: 'rgba(231, 230, 220, 0.56)',
    vizInk: '#ECE9DE',
    vizSignal: '#3EA88F',
    vizOchre: '#DF5544',
    vizLine: 'rgba(236, 233, 222, 0.16)',
    vizMuted: 'rgba(236, 233, 222, 0.72)',
  },
  {
    id: 'avant-magenta',
    paper: '#EDE4DC',
    midtone: '#CEBDC0',
    accent: '#B5244E',
    black: '#191518',
    secondary: '#C99535',
    plateBg: 'rgba(16, 17, 21, 0.80)',
    plateBorder: 'rgba(237, 228, 220, 0.56)',
    vizInk: '#F0E8E0',
    vizSignal: '#E4466F',
    vizOchre: '#DBAE52',
    vizLine: 'rgba(240, 232, 224, 0.16)',
    vizMuted: 'rgba(240, 232, 224, 0.72)',
  },
  {
    id: 'klutsis-violet',
    paper: '#EAE7EE',
    midtone: '#C1BDD1',
    accent: '#4A3999',
    black: '#16151E',
    secondary: '#D2382D',
    plateBg: 'rgba(16, 17, 21, 0.80)',
    plateBorder: 'rgba(234, 231, 238, 0.56)',
    vizInk: '#EEECF4',
    vizSignal: '#7C6CF2',
    vizOchre: '#E04D3F',
    vizLine: 'rgba(238, 236, 244, 0.16)',
    vizMuted: 'rgba(238, 236, 244, 0.72)',
  },
];

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const rl = lin(r);
  const gl = lin(g);
  const bl = lin(b);
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const FAMILY_AB = CONSTRUCTIVIST_FAMILIES.map((fam) => {
  const r = Number.parseInt(fam.accent.slice(1, 3), 16);
  const g = Number.parseInt(fam.accent.slice(3, 5), 16);
  const b = Number.parseInt(fam.accent.slice(5, 7), 16);
  const [, la, lb] = rgbToLab(r, g, b);
  return { a: la, b: lb, c: Math.max(1e-3, Math.hypot(la, lb)) };
});

export function getFallbackConstructivistPalette(isDark = false): ConstructivistPalette {
  const base = CONSTRUCTIVIST_FAMILIES[0];
  return isDark ? base : { ...base, plateBg: 'rgba(18, 19, 23, 0.82)' };
}

export function extractCoverPaletteFromImage(
  img: HTMLImageElement,
  isDark = false,
): ConstructivistPalette {
  const fallback = getFallbackConstructivistPalette(isDark);
  try {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const scores = new Float64Array(CONSTRUCTIVIST_FAMILIES.length);
    let totalWeight = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.12 || lum > 0.92) continue;
      const [, la, lb] = rgbToLab(r, g, b);
      const c = Math.hypot(la, lb);
      if (c < 14) continue;
      const w = c - 14;
      totalWeight += w;
      for (let f = 0; f < FAMILY_AB.length; f += 1) {
        const ref = FAMILY_AB[f];
        const cosSim = (la * ref.a + lb * ref.b) / (c * ref.c);
        if (cosSim > 0) scores[f] += w * cosSim * cosSim;
      }
    }

    let bestIdx = 0;
    let bestScore = -1;
    if (totalWeight > size * size * 0.65) {
      for (let f = 0; f < scores.length; f += 1) {
        const mult = f === 0 ? 1.08 : 1.0;
        const s = scores[f] * mult;
        if (s > bestScore) {
          bestScore = s;
          bestIdx = f;
        }
      }
    }

    const chosen = CONSTRUCTIVIST_FAMILIES[bestIdx];
    return isDark ? chosen : { ...chosen, plateBg: 'rgba(18, 19, 23, 0.82)' };
  } catch {
    return fallback;
  }
}
