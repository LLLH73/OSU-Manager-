import type { BookRhythmData, BookTimingPoint } from '../../types';

export interface LiveBeatState {
  bpm: number;
  effectiveBpm: number;
  meter: number;
  beatIndex: number;
  beatInBar: number;
  measureIndex: number;
  beatPhase: number;
  beatPulse: number;
  isKiai: boolean;
  hasExactTiming: boolean;
}

export interface AudioBandMetrics {
  subBass: number;
  bass: number;
  mid: number;
  high: number;
  rms: number;
  onsetImpulse: number;
  lowEnergy: number;
}

function findActiveTimingPoint(
  points: BookTimingPoint[],
  currentTimeMs: number,
  fallbackBpm: number,
): BookTimingPoint {
  if (!points || points.length === 0) {
    const safeBpm = fallbackBpm > 0 && Number.isFinite(fallbackBpm) ? fallbackBpm : 120;
    return {
      timeMs: 0,
      beatLengthMs: 60000 / safeBpm,
      bpm: safeBpm,
      meter: 4,
    };
  }

  if (currentTimeMs <= points[0].timeMs) {
    return points[0];
  }

  let lo = 0;
  let hi = points.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timeMs <= currentTimeMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return points[idx];
}

export function computeBeatState(
  currentTimeMs: number,
  playbackRate: number,
  rhythmData: BookRhythmData | null,
  fallbackBpm = 120,
): LiveBeatState {
  const safeRate = playbackRate > 0 && Number.isFinite(playbackRate) ? playbackRate : 1;
  const tp = findActiveTimingPoint(rhythmData?.timingPoints ?? [], currentTimeMs, fallbackBpm);
  const beatLengthMs = tp.beatLengthMs > 10 ? tp.beatLengthMs : 500;
  const meter = tp.meter >= 1 ? tp.meter : 4;

  const beatDelta = (currentTimeMs - tp.timeMs) / beatLengthMs;
  const beatIndex = Math.floor(beatDelta);
  const beatPhase = ((beatDelta % 1) + 1) % 1;
  const beatPulse = Math.pow(Math.max(0, 1 - beatPhase * 1.65), 2.15);
  const beatInBar = ((beatIndex % meter) + meter) % meter;
  const measureIndex = Math.floor(beatIndex / meter);

  let isKiai = false;
  if (rhythmData?.kiaiRanges && rhythmData.kiaiRanges.length > 0) {
    for (let i = 0; i < rhythmData.kiaiRanges.length; i += 1) {
      const r = rhythmData.kiaiRanges[i];
      if (currentTimeMs >= r.startMs && currentTimeMs <= r.endMs) {
        isKiai = true;
        break;
      }
      if (r.startMs > currentTimeMs) break;
    }
  }

  return {
    bpm: tp.bpm,
    effectiveBpm: Math.round(tp.bpm * safeRate * 10) / 10,
    meter,
    beatIndex,
    beatInBar,
    measureIndex,
    beatPhase,
    beatPulse,
    isKiai,
    hasExactTiming: Boolean(rhythmData?.hasExactTiming),
  };
}

export function extractAudioBands(
  freqData: Uint8Array,
  sampleRate: number,
  prevLowEnergy = 0,
): AudioBandMetrics {
  const len = freqData.length;
  if (len === 0) {
    return {
      subBass: 0,
      bass: 0,
      mid: 0,
      high: 0,
      rms: 0,
      onsetImpulse: 0,
      lowEnergy: 0,
    };
  }

  const nyquist = (sampleRate > 0 ? sampleRate : 44100) / 2;
  const hzPerBin = nyquist / len;

  let subSum = 0;
  let subCnt = 0;
  let bassSum = 0;
  let bassCnt = 0;
  let midSum = 0;
  let midCnt = 0;
  let highSum = 0;
  let highCnt = 0;
  let totalSq = 0;

  for (let i = 0; i < len; i += 1) {
    const val = freqData[i] / 255;
    totalSq += val * val;
    const hz = i * hzPerBin;
    if (hz >= 20 && hz < 95) {
      subSum += val;
      subCnt += 1;
    } else if (hz >= 95 && hz < 260) {
      bassSum += val;
      bassCnt += 1;
    } else if (hz >= 260 && hz < 2600) {
      midSum += val;
      midCnt += 1;
    } else if (hz >= 2600 && hz <= 15000) {
      highSum += val;
      highCnt += 1;
    }
  }

  const subBass = subCnt > 0 ? subSum / subCnt : 0;
  const bass = bassCnt > 0 ? bassSum / bassCnt : 0;
  const mid = midCnt > 0 ? midSum / midCnt : 0;
  const high = highCnt > 0 ? highSum / highCnt : 0;
  const rms = Math.sqrt(totalSq / len);

  const lowEnergy = subBass * 0.62 + bass * 0.38;
  const delta = Math.max(0, lowEnergy - prevLowEnergy);
  const onsetImpulse = Math.min(1, delta * 3.6);

  return {
    subBass,
    bass,
    mid,
    high,
    rms,
    onsetImpulse,
    lowEnergy,
  };
}
