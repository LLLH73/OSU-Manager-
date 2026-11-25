import { useEffect, useRef, useState } from 'react';
import type { BookSummary } from '../../types';
import {
  extractCoverPaletteFromImage,
  getFallbackConstructivistPalette,
  type ConstructivistPalette,
} from './constructivistRedraw';

interface ConstructivistPosterBgProps {
  track: BookSummary | null;
  isDark: boolean;
  onPaletteChange: (palette: ConstructivistPalette) => void;
}

const PALETTE_CACHE = new Map<string, ConstructivistPalette>();

export function ConstructivistPosterBg({
  track,
  isDark,
  onPaletteChange,
}: ConstructivistPosterBgProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const onPaletteRef = useRef(onPaletteChange);
  onPaletteRef.current = onPaletteChange;

  useEffect(() => {
    setImgFailed(false);
    const fallback = getFallbackConstructivistPalette(isDark);
    if (!track?.coverUrl) {
      onPaletteRef.current(fallback);
      return;
    }
    const cacheKey = `${track.bookKey}:${isDark ? 'd' : 'l'}`;
    const cached = PALETTE_CACHE.get(cacheKey);
    if (cached) {
      onPaletteRef.current(cached);
    }
  }, [track?.bookKey, track?.coverUrl, isDark]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!track) return;
    const cacheKey = `${track.bookKey}:${isDark ? 'd' : 'l'}`;
    const existing = PALETTE_CACHE.get(cacheKey);
    if (existing) {
      onPaletteRef.current(existing);
      return;
    }
    const pal = extractCoverPaletteFromImage(e.currentTarget, isDark);
    if (PALETTE_CACHE.size >= 64) {
      const firstKey = PALETTE_CACHE.keys().next().value;
      if (firstKey) PALETTE_CACHE.delete(firstKey);
    }
    PALETTE_CACHE.set(cacheKey, pal);
    onPaletteRef.current(pal);
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#121316]"
    >
      {track?.coverUrl && !imgFailed ? (
        <img
          key={track.bookKey}
          src={track.coverUrl}
          alt=""
          crossOrigin="anonymous"
          onLoad={handleLoad}
          onError={() => {
            setImgFailed(true);
            onPaletteRef.current(getFallbackConstructivistPalette(isDark));
          }}
          className="h-full w-full object-cover object-center select-none"
        />
      ) : (
        <div
          className="h-full w-full"
          style={{
            background:
              'radial-gradient(circle at 50% 42%, rgba(44, 46, 54, 0.72), rgba(16, 17, 21, 0.98) 72%)',
          }}
        />
      )}

      {/* Subtle edge-only vignette to frame top card and bottom visualizer without dimming center art */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,14,0.28) 0%, rgba(10,10,14,0.03) 28%, rgba(10,10,14,0.06) 68%, rgba(10,10,14,0.52) 100%)',
        }}
      />

      {/* Minimal 1px Swiss corner registration ticks */}
      <div className="absolute top-4 right-4 h-4 w-4 border-t border-r border-white/30" />
      <div className="absolute bottom-4 left-4 h-4 w-4 border-b border-l border-white/30" />
      <div className="absolute right-4 bottom-4 h-4 w-4 border-r border-b border-white/30" />
    </div>
  );
}
