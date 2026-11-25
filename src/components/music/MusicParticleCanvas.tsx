import { useEffect, useRef } from 'react';
import { useMusicPlayer, type MusicRhythmIntensity } from './MusicPlayerContext';
import { computeBeatState, extractAudioBands } from './rhythmEngine';

export interface MusicParticleColors {
  primary: string;
  accent: string;
  secondary: string;
}

interface MusicParticleCanvasProps {
  isPlaying: boolean;
  isDark: boolean;
  zenMode: boolean;
  rhythmFollow: MusicRhythmIntensity;
  playbackRate: number;
  customColors?: MusicParticleColors;
  className?: string;
}

type ParticleKind = 'dot' | 'diamond' | 'cross';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  phase: number;
  rot: number;
  vRot: number;
  kind: ParticleKind;
  colorSlot: 0 | 1 | 2;
}

const RHYTHM_MULT: Record<MusicRhythmIntensity, number> = {
  off: 0,
  subtle: 0.45,
  standard: 1.0,
  kinetic: 1.6,
};

function readParticleColors(
  el: HTMLElement | null,
  custom?: MusicParticleColors,
): MusicParticleColors {
  if (custom) return custom;
  if (!el) {
    return {
      primary: '#111111',
      accent: '#d62828',
      secondary: '#b58338',
    };
  }
  const st = getComputedStyle(el);
  return {
    primary: st.getPropertyValue('--mp-ink').trim() || '#111111',
    accent: st.getPropertyValue('--mp-signal').trim() || '#d62828',
    secondary: st.getPropertyValue('--mp-ochre').trim() || '#b58338',
  };
}

function createParticlePool(w: number, h: number, zenMode: boolean): Particle[] {
  const baseCount = zenMode ? 76 : 46;
  const areaScale = Math.max(0.7, Math.min(1.25, Math.sqrt((w * h) / (1100 * 640))));
  const count = Math.round(baseCount * areaScale);
  const pool: Particle[] = new Array(count);

  for (let i = 0; i < count; i += 1) {
    const r = Math.random();
    const kind: ParticleKind = r < 0.64 ? 'dot' : r < 0.86 ? 'diamond' : 'cross';
    const cPick = Math.random();
    const colorSlot: 0 | 1 | 2 = cPick < 0.65 ? 0 : cPick < 0.88 ? 1 : 2;
    pool[i] = {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -(0.22 + Math.random() * 0.55),
      size:
        kind === 'dot'
          ? 1.3 + Math.random() * 2.1
          : kind === 'diamond'
            ? 2.2 + Math.random() * 2.0
            : 2.5 + Math.random() * 1.6,
      baseAlpha: zenMode ? 0.28 + Math.random() * 0.44 : 0.18 + Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.024,
      kind,
      colorSlot,
    };
  }
  return pool;
}

export function MusicParticleCanvas({
  isPlaying,
  isDark,
  zenMode,
  rhythmFollow,
  playbackRate,
  customColors,
  className = '',
}: MusicParticleCanvasProps) {
  const { analyserRef, audioRef, audioContextRef, rhythmDataRef, currentTrack } = useMusicPlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 900, h: 520, dpr: 1 });
  const particlesRef = useRef<Particle[]>([]);
  const colorsRef = useRef<MusicParticleColors>(readParticleColors(null, customColors));
  const smoothRef = useRef({ bass: 0, high: 0, lowEnergy: 0, pulse: 0 });
  const customColorsRef = useRef(customColors);
  customColorsRef.current = customColors;

  const colorSig = customColors
    ? `${customColors.primary}|${customColors.accent}|${customColors.secondary}`
    : '';

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      colorsRef.current = readParticleColors(canvasRef.current, customColorsRef.current);
    });
    return () => window.cancelAnimationFrame(id);
  }, [isDark, zenMode, colorSig]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(160, Math.round(rect.width));
      const h = Math.max(120, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      sizeRef.current = { w, h, dpr };
      colorsRef.current = readParticleColors(canvas, customColorsRef.current);
      if (particlesRef.current.length === 0) {
        particlesRef.current = createParticlePool(w, h, zenMode);
      } else {
        // Rebalance particle count softly if viewport or mode changed significantly
        const expected = createParticlePool(w, h, zenMode);
        if (Math.abs(expected.length - particlesRef.current.length) > 10) {
          particlesRef.current = expected;
        }
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [zenMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastTs = performance.now();
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;

    const renderFrame = (now: number) => {
      if (document.hidden) {
        rafId = 0;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.004, (now - lastTs) / 1000));
      lastTs = now;
      const frameScale = dt * 60;

      const { w, h, dpr } = sizeRef.current;
      if (particlesRef.current.length === 0) {
        particlesRef.current = createParticlePool(w, h, zenMode);
      }

      const analyser = analyserRef.current;
      const audioEl = audioRef.current;
      const sampleRate = audioContextRef.current?.sampleRate ?? 44100;
      const rMult = reducedMotion ? 0.25 : RHYTHM_MULT[rhythmFollow];

      let bass = 0;
      let high = 0;
      let lowEnergy = 0;

      if (analyser) {
        if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(analyser.frequencyBinCount);
        }
        if (isPlaying) {
          analyser.getByteFrequencyData(freqBuf);
          const metrics = extractAudioBands(freqBuf, sampleRate, smoothRef.current.lowEnergy);
          bass = metrics.subBass * 0.55 + metrics.bass * 0.45;
          high = metrics.high;
          lowEnergy = metrics.lowEnergy;
        }
      }

      const sm = smoothRef.current;
      sm.bass = sm.bass * 0.78 + bass * 0.22;
      sm.high = sm.high * 0.76 + high * 0.24;
      sm.lowEnergy = lowEnergy;

      const curMs = (audioEl?.currentTime ?? 0) * 1000;
      const beat = computeBeatState(
        curMs,
        playbackRate,
        rhythmDataRef.current,
        currentTrack?.bpm ?? 120,
      );
      const livePulse = isPlaying ? beat.beatPulse * rMult : 0;
      sm.pulse = sm.pulse * 0.68 + livePulse * 0.32;

      const downbeatBoost =
        isPlaying && beat.beatInBar === 0 && beat.beatPulse > 0.7 ? beat.beatPulse * rMult : 0;
      const kiaiMult = isPlaying && beat.isKiai ? 1.24 : 1.0;

      const motionFactor = isPlaying
        ? (0.75 + sm.bass * 2.1 * rMult + sm.pulse * 1.45) * kiaiMult * (reducedMotion ? 0.35 : 1)
        : 0.26 * (reducedMotion ? 0.4 : 1);

      const colors = colorsRef.current;
      const paletteArr = [colors.primary, colors.accent, colors.secondary];
      const pool = particlesRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const timeSec = now * 0.001;

      for (let i = 0; i < pool.length; i += 1) {
        const pt = pool[i];
        const sway = Math.sin(timeSec * 1.2 + pt.phase) * (0.2 + sm.bass * 0.55 * rMult);
        pt.x += (pt.vx + sway) * frameScale * (0.55 + motionFactor * 0.45);
        pt.y += pt.vy * frameScale * motionFactor;
        pt.rot += pt.vRot * frameScale * (0.6 + sm.high * 2.0 * rMult);

        if (pt.y < -16) {
          pt.y = h + 14;
          pt.x = Math.random() * w;
        } else if (pt.y > h + 16) {
          pt.y = -14;
        }
        if (pt.x < -16) pt.x = w + 14;
        else if (pt.x > w + 16) pt.x = -14;

        const pulseScale =
          1 + (pt.colorSlot !== 0 ? sm.pulse * 0.45 + downbeatBoost * 0.35 : sm.bass * 0.28 * rMult);
        const r = pt.size * pulseScale;

        let alpha = pt.baseAlpha;
        if (isPlaying) {
          const twinkle =
            pt.kind === 'cross'
              ? sm.high * 0.38 * rMult
              : sm.bass * 0.24 * rMult + downbeatBoost * 0.22;
          alpha = Math.min(0.92, alpha + twinkle);
        }

        // During Kiai or strong downbeats, let more particles flash in accent hue
        const useColor =
          beat.isKiai && isPlaying && pt.colorSlot === 0 && (i & 3) === 0
            ? paletteArr[1]
            : paletteArr[pt.colorSlot];

        ctx.fillStyle = useColor;
        ctx.strokeStyle = useColor;

        if (pt.kind === 'dot') {
          if (zenMode) {
            ctx.globalAlpha = alpha * 0.22;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r * 2.35, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (pt.kind === 'diamond') {
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.rot);
          ctx.globalAlpha = alpha * 0.9;
          if (pt.colorSlot === 0) {
            ctx.lineWidth = 1.1;
            ctx.strokeRect(-r, -r, r * 2, r * 2);
          } else {
            ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
          }
          ctx.restore();
        } else {
          const arm = r * 1.35;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(pt.x - arm, pt.y);
          ctx.lineTo(pt.x + arm, pt.y);
          ctx.moveTo(pt.x, pt.y - arm);
          ctx.lineTo(pt.x, pt.y + arm);
          ctx.stroke();
        }
      }

      ctx.restore();
      rafId = window.requestAnimationFrame(renderFrame);
    };

    const startLoop = () => {
      if (!rafId && !document.hidden) {
        lastTs = performance.now();
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden && rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!document.hidden) {
        startLoop();
      }
    };

    startLoop();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    analyserRef,
    audioContextRef,
    audioRef,
    currentTrack?.bookKey,
    currentTrack?.bpm,
    isPlaying,
    playbackRate,
    rhythmDataRef,
    rhythmFollow,
    zenMode,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  );
}
