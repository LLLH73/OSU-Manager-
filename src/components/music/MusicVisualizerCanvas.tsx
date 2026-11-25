import { useEffect, useRef } from 'react';
import type { ThemeId } from '../../types';
import { useMusicPlayer, type MusicRhythmIntensity, type MusicVisualizerMode } from './MusicPlayerContext';
import { computeBeatState, extractAudioBands } from './rhythmEngine';

export interface VisualizerPalette {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  signal: string;
  ochre: string;
}

interface MusicVisualizerCanvasProps {
  mode: MusicVisualizerMode;
  isPlaying: boolean;
  isDark: boolean;
  theme?: ThemeId;
  rhythmFollow: MusicRhythmIntensity;
  playbackRate: number;
  customPalette?: Partial<VisualizerPalette>;
  className?: string;
}

function readPalette(el: HTMLElement | null, custom?: Partial<VisualizerPalette>): VisualizerPalette {
  const base: VisualizerPalette = !el
    ? {
        bg: '#f2f0eb',
        ink: '#111111',
        muted: '#666666',
        line: 'rgba(17,17,17,0.16)',
        signal: '#d62828',
        ochre: '#b58338',
      }
    : (() => {
        const st = getComputedStyle(el);
        return {
          bg: st.getPropertyValue('--mp-bg').trim() || '#f2f0eb',
          ink: st.getPropertyValue('--mp-ink').trim() || '#111111',
          muted: st.getPropertyValue('--mp-muted').trim() || '#666666',
          line: st.getPropertyValue('--mp-line').trim() || 'rgba(17,17,17,0.16)',
          signal: st.getPropertyValue('--mp-signal').trim() || '#d62828',
          ochre: st.getPropertyValue('--mp-ochre').trim() || '#b58338',
        };
      })();
  return {
    bg: custom?.bg ?? base.bg,
    ink: custom?.ink ?? base.ink,
    muted: custom?.muted ?? base.muted,
    line: custom?.line ?? base.line,
    signal: custom?.signal ?? base.signal,
    ochre: custom?.ochre ?? base.ochre,
  };
}

const RHYTHM_MULT: Record<MusicRhythmIntensity, number> = {
  off: 0,
  subtle: 0.45,
  standard: 1.0,
  kinetic: 1.55,
};

export function MusicVisualizerCanvas({
  mode,
  isPlaying,
  isDark,
  theme,
  rhythmFollow,
  playbackRate,
  customPalette,
  className = '',
}: MusicVisualizerCanvasProps) {
  const { audioRef, analyserRef, audioContextRef, rhythmDataRef, currentTrack } = useMusicPlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<VisualizerPalette>(readPalette(null, customPalette));
  const peaksRef = useRef<Float32Array>(new Float32Array(200));
  const peakHoldRef = useRef<Float32Array>(new Float32Array(200));
  const smoothBandsRef = useRef({ subBass: 0, bass: 0, mid: 0, high: 0, rms: 0, lowEnergy: 0 });
  const sizeRef = useRef({ w: 640, h: 120, dpr: 1 });
  const drawFrameRef = useRef<(() => void) | null>(null);
  const customPaletteRef = useRef(customPalette);
  customPaletteRef.current = customPalette;

  const customPalSig = customPalette
    ? `${customPalette.bg ?? ''}|${customPalette.ink ?? ''}|${customPalette.signal ?? ''}|${customPalette.ochre ?? ''}|${customPalette.line ?? ''}|${customPalette.muted ?? ''}`
    : '';

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      paletteRef.current = readPalette(canvasRef.current, customPaletteRef.current);
      drawFrameRef.current?.();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isDark, theme, mode, customPalSig]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(120, Math.round(rect.width));
      const h = Math.max(80, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      sizeRef.current = { w, h, dpr };
      paletteRef.current = readPalette(canvas, customPaletteRef.current);
      drawFrameRef.current?.();
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;

    const drawFrame = () => {
      const { w, h, dpr } = sizeRef.current;
      const pal = paletteRef.current;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      const audioEl = audioRef.current;
      const sampleRate = audioContextRef.current?.sampleRate ?? 44100;
      const rMult = reducedMotion ? 0.25 : RHYTHM_MULT[rhythmFollow];

      if (analyser) {
        if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(analyser.frequencyBinCount);
        }
        if (!timeBuf || timeBuf.length !== analyser.fftSize) {
          timeBuf = new Uint8Array(analyser.fftSize);
        }
        if (isPlaying) {
          analyser.getByteFrequencyData(freqBuf);
          analyser.getByteTimeDomainData(timeBuf);
        } else {
          freqBuf.fill(0);
          timeBuf.fill(128);
        }
      }

      const rawBands = freqBuf
        ? extractAudioBands(freqBuf, sampleRate, smoothBandsRef.current.lowEnergy)
        : { subBass: 0, bass: 0, mid: 0, high: 0, rms: 0, onsetImpulse: 0, lowEnergy: 0 };

      const sb = smoothBandsRef.current;
      sb.subBass = sb.subBass * 0.65 + rawBands.subBass * 0.35;
      sb.bass = sb.bass * 0.68 + rawBands.bass * 0.32;
      sb.mid = sb.mid * 0.72 + rawBands.mid * 0.28;
      sb.high = sb.high * 0.72 + rawBands.high * 0.28;
      sb.rms = sb.rms * 0.7 + rawBands.rms * 0.3;
      sb.lowEnergy = rawBands.lowEnergy;

      const curMs = (audioEl?.currentTime ?? 0) * 1000;
      const beat = computeBeatState(
        curMs,
        playbackRate,
        rhythmDataRef.current,
        currentTrack?.bpm ?? 120,
      );
      const pulse = isPlaying ? beat.beatPulse * rMult : 0;

      // Orthogonal Swiss reference lines
      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1;
      for (const ratio of [0.25, 0.5, 0.75]) {
        const y = Math.round(h * ratio) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (mode === 'bars') {
        const padX = 14;
        const padTop = 22;
        const padBottom = h >= 100 ? 18 : 10;
        const availW = Math.max(80, w - padX * 2);
        const availH = Math.max(20, h - padTop - padBottom);
        const barCount = Math.min(168, Math.max(60, Math.floor(availW / 8)));
        const step = availW / barCount;
        const barW = Math.max(2, Math.floor(step - 2));
        const binCount = freqBuf ? freqBuf.length : 1024;
        const nyquist = sampleRate / 2;

        for (let i = 0; i < barCount; i += 1) {
          const t0 = i / barCount;
          const t1 = (i + 1) / barCount;
          const f0 = 32 * Math.pow(16000 / 32, t0);
          const f1 = 32 * Math.pow(16000 / 32, t1);
          const idx0 = Math.max(1, Math.floor((f0 / nyquist) * binCount));
          const idx1 = Math.min(binCount - 1, Math.max(idx0, Math.ceil((f1 / nyquist) * binCount)));

          let val = 0;
          if (freqBuf && isPlaying) {
            let maxV = 0;
            for (let j = idx0; j <= idx1; j += 1) {
              if (freqBuf[j] > maxV) maxV = freqBuf[j];
            }
            val = maxV / 255;
            if (i < Math.round(barCount * 0.22) && pulse > 0.05) {
              val = Math.min(1, val + pulse * 0.14 * (1 - i / (barCount * 0.22)));
            }
          }

          const prev = peaksRef.current[i] || 0;
          const smoothed = val > prev ? val * 0.72 + prev * 0.28 : prev * 0.84;
          peaksRef.current[i] = smoothed;

          if (smoothed >= (peakHoldRef.current[i] || 0)) {
            peakHoldRef.current[i] = smoothed;
          } else {
            peakHoldRef.current[i] = Math.max(0, (peakHoldRef.current[i] || 0) - 0.008);
          }

          const x = Math.round(padX + i * step);
          const barH = Math.max(isPlaying ? 2 : 1.5, Math.round(smoothed * availH));
          const y = h - padBottom - barH;

          const isHot = (i < Math.round(barCount * 0.18) && (smoothed > 0.55 || pulse > 0.6)) || smoothed > 0.8;
          ctx.fillStyle = isHot ? pal.signal : pal.ink;
          ctx.fillRect(x, y, barW, barH);

          const holdH = Math.round((peakHoldRef.current[i] || 0) * availH);
          if (holdH > 3) {
            const capY = h - padBottom - holdH - 2;
            ctx.fillStyle = beat.isKiai ? pal.signal : pal.ochre;
            ctx.fillRect(x, capY, barW, 1.5);
          }
        }

        // Wide-axis Swiss frequency axis calibration ticks
        if (w >= 520 && h >= 100) {
          ctx.fillStyle = pal.muted;
          ctx.font = '600 9px "JetBrains Mono", monospace';
          const freqMarks = [60, 250, 1000, 4000, 12000];
          for (const f of freqMarks) {
            const norm = Math.log(f / 32) / Math.log(16000 / 32);
            const mx = Math.round(padX + norm * availW);
            ctx.fillText(f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`, mx, h - 5);
          }
        }
      } else {
        // Wide-axis Oscilloscope mode with rising zero-crossing lock
        const midY = h * 0.54;
        const padX = 14;
        const availW = Math.max(80, w - padX * 2);

        // Vertical beat subdivision hairlines for wide horizontal axis
        ctx.strokeStyle = pal.line;
        ctx.lineWidth = 1;
        for (const r of [0.25, 0.5, 0.75]) {
          const vx = Math.round(padX + availW * r) + 0.5;
          ctx.beginPath();
          ctx.moveTo(vx, 18);
          ctx.lineTo(vx, h - 8);
          ctx.stroke();
        }

        // Beat phase scanner line
        if (isPlaying) {
          const scanX = padX + beat.beatPhase * availW;
          ctx.strokeStyle = pal.signal;
          ctx.globalAlpha = 0.34 + pulse * 0.45;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(scanX, 16);
          ctx.lineTo(scanX, h - 8);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        let triggerIdx = 0;
        const samples = timeBuf ? timeBuf.length : 128;
        if (timeBuf && isPlaying) {
          const searchEnd = Math.floor(samples * 0.25);
          for (let s = 1; s < searchEnd; s += 1) {
            if (timeBuf[s - 1] < 128 && timeBuf[s] >= 128) {
              triggerIdx = s;
              break;
            }
          }
        }

        ctx.strokeStyle = beat.isKiai ? pal.signal : pal.ink;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        const points = Math.min(960, Math.max(280, Math.floor(availW * 0.85)));
        const spanSamples = Math.max(128, Math.floor(samples * 0.75));
        for (let i = 0; i < points; i += 1) {
          const x = padX + (i / (points - 1)) * availW;
          const idx = Math.min(
            samples - 1,
            triggerIdx + Math.floor((i / points) * spanSamples),
          );
          const norm = timeBuf && isPlaying ? (timeBuf[idx] - 128) / 128 : 0;
          const amp = h * 0.36 * (1 + pulse * 0.14);
          const y = midY + norm * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Top-left Swiss telemetry stamp inside canvas
      ctx.fillStyle = pal.muted;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const label = mode === 'bars' ? 'FFT // SPECTRUM' : 'SCOPE // WAVEFORM';
      ctx.fillText(label, 14, 14);

      ctx.fillStyle = isPlaying && sb.rms > 0.01 ? pal.signal : pal.muted;
      ctx.textAlign = 'right';
      ctx.fillText(
        isPlaying ? `RMS ${Math.round(sb.rms * 100).toString().padStart(2, '0')}%` : 'IDLE',
        w - 14,
        14,
      );
      ctx.textAlign = 'left';

      ctx.restore();
    };

    const tick = () => {
      if (document.hidden) {
        rafId = 0;
        return;
      }
      drawFrame();
      if (isPlaying) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    drawFrameRef.current = drawFrame;
    drawFrame();
    if (isPlaying && !document.hidden) {
      rafId = window.requestAnimationFrame(tick);
    }

    const onVisChange = () => {
      if (!document.hidden && isPlaying && !rafId) {
        rafId = window.requestAnimationFrame(tick);
      } else if (document.hidden && rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      drawFrameRef.current = null;
      document.removeEventListener('visibilitychange', onVisChange);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [mode, isPlaying, isDark, rhythmFollow, playbackRate, currentTrack?.bookKey, analyserRef, audioContextRef, audioRef, rhythmDataRef]);

  return (
    <div
      className={`relative overflow-hidden border border-[var(--mp-line)] bg-[var(--mp-panel)] ${className}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
