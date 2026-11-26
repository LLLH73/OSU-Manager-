import type { StarRarityTier } from './gachaUtils';

let sharedCtx: AudioContext | null = null;
let sfxMuted = false;

export function setGachaSfxMuted(muted: boolean): void {
  sfxMuted = muted;
}

export function isGachaSfxMuted(): boolean {
  return sfxMuted;
}

function getCtx(): AudioContext | null {
  if (sfxMuted || typeof window === 'undefined') return null;
  try {
    if (!sharedCtx) {
      const AC =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  delay = 0,
): void {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(40, freqStart), now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playPackTearSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    // Crisp metallic rip sweep + celebratory ascending chord
    playTone(ctx, 180, 740, 0.22, 'sawtooth', 0.055, 0);
    playTone(ctx, 392, 523.25, 0.28, 'triangle', 0.07, 0.08);
    playTone(ctx, 523.25, 659.25, 0.34, 'sine', 0.065, 0.14);
    playTone(ctx, 783.99, 1046.5, 0.42, 'sine', 0.055, 0.21);
  } catch {
    // Ignore WebAudio error
  }
}

export function playCardHoverTick(tier: StarRarityTier): void {
  const ctx = getCtx();
  if (!ctx) return;
  const pitch =
    tier === 'mythic'
      ? 987
      : tier === 'legendary'
        ? 880
        : tier === 'epic'
          ? 740
          : tier === 'rare'
            ? 622
            : 523;
  try {
    playTone(ctx, pitch, pitch * 1.12, 0.07, 'sine', 0.025, 0);
  } catch {
    // Ignore WebAudio error
  }
}

export function playCardFlipSound(tier: StarRarityTier): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (tier === 'mythic') {
      playTone(ctx, 523.25, 523.25, 0.45, 'triangle', 0.08, 0);
      playTone(ctx, 659.25, 659.25, 0.48, 'sine', 0.07, 0.05);
      playTone(ctx, 783.99, 1046.5, 0.62, 'sine', 0.085, 0.1);
      playTone(ctx, 1318.5, 1567.98, 0.52, 'triangle', 0.05, 0.16);
    } else if (tier === 'legendary') {
      playTone(ctx, 440, 554.37, 0.38, 'triangle', 0.075, 0);
      playTone(ctx, 659.25, 880, 0.46, 'sine', 0.075, 0.07);
      playTone(ctx, 1108.73, 1318.5, 0.44, 'sine', 0.045, 0.14);
    } else if (tier === 'epic') {
      playTone(ctx, 440, 659.25, 0.28, 'triangle', 0.06, 0);
      playTone(ctx, 659.25, 830.6, 0.32, 'sine', 0.055, 0.07);
    } else if (tier === 'rare') {
      playTone(ctx, 493.88, 659.25, 0.22, 'sine', 0.05, 0);
    } else {
      playTone(ctx, 360, 480, 0.15, 'sine', 0.04, 0);
    }
  } catch {
    // Ignore WebAudio error
  }
}

export function playSwipeSound(action: 'like' | 'pass'): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (action === 'like') {
      playTone(ctx, 523.25, 659.25, 0.16, 'sine', 0.055, 0);
      playTone(ctx, 659.25, 783.99, 0.2, 'sine', 0.05, 0.06);
    } else {
      playTone(ctx, 310, 210, 0.14, 'triangle', 0.045, 0);
    }
  } catch {
    // Ignore WebAudio error
  }
}

export function playGuessRevealSound(score: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (score >= 850) {
      playTone(ctx, 587.33, 880, 0.3, 'sine', 0.07, 0);
      playTone(ctx, 880, 1174.66, 0.36, 'triangle', 0.055, 0.09);
    } else if (score >= 550) {
      playTone(ctx, 440, 659.25, 0.24, 'sine', 0.055, 0);
    } else {
      playTone(ctx, 330, 261.63, 0.22, 'triangle', 0.045, 0);
    }
  } catch {
    // Ignore WebAudio error
  }
}
