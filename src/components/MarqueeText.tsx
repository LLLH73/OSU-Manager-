import { CSSProperties, memo, useCallback, useEffect, useRef, useState } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
  /** 'always' scrolls whenever overflowing; 'group-hover' scrolls on .group:hover or :hover */
  mode?: 'always' | 'group-hover';
  /** Reading speed in px/s (default 30) */
  speed?: number;
  title?: string;
}

const observerCallbacks = new WeakMap<Element, () => void>();
let sharedResizeObserver: ResizeObserver | null = null;

function getSharedResizeObserver(): ResizeObserver | null {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
    return null;
  }
  if (!sharedResizeObserver) {
    sharedResizeObserver = new ResizeObserver((entries) => {
      const invoked = new Set<() => void>();
      for (const entry of entries) {
        const cb = observerCallbacks.get(entry.target);
        if (cb && !invoked.has(cb)) {
          invoked.add(cb);
          cb();
        }
      }
    });
  }
  return sharedResizeObserver;
}

/**
 * Single-line text that smoothly ping-pong scrolls whenever it overflows its container.
 * Uses a single shared ResizeObserver to avoid layout-thrashing overhead inside long song lists.
 */
export const MarqueeText = memo(function MarqueeText({
  text,
  className = '',
  mode = 'always',
  speed = 30,
  title,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const delta = Math.ceil(content.scrollWidth - container.clientWidth);
    const nextOverflow = delta > 2 ? delta : 0;
    setOverflowPx((prev) => (prev === nextOverflow ? prev : nextOverflow));
  }, []);

  useEffect(() => {
    measure();

    const container = containerRef.current;
    const content = contentRef.current;
    const ro = getSharedResizeObserver();
    if (ro && container && content) {
      observerCallbacks.set(container, measure);
      observerCallbacks.set(content, measure);
      ro.observe(container);
      ro.observe(content);
    }

    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      if (ro) {
        if (container) {
          observerCallbacks.delete(container);
          ro.unobserve(container);
        }
        if (content) {
          observerCallbacks.delete(content);
          ro.unobserve(content);
        }
      }
    };
  }, [text, measure]);

  const isOverflowing = overflowPx > 0;
  let trackStyle: CSSProperties | undefined;
  if (isOverflowing) {
    const distance = overflowPx + 14;
    const duration = Math.min(22, Math.max(5.5, Number((distance / speed / 0.3).toFixed(2))));
    trackStyle = {
      '--marquee-distance': `${distance}px`,
      '--marquee-duration': `${duration}s`,
    } as CSSProperties;
  }

  return (
    <span
      ref={containerRef}
      title={title ?? (isOverflowing ? text : undefined)}
      data-overflowing={isOverflowing ? 'true' : 'false'}
      className={`marquee-viewport ${isOverflowing ? 'marquee-fade-right' : ''} ${className}`}
    >
      <span
        ref={contentRef}
        style={trackStyle}
        className={`marquee-track ${
          isOverflowing ? (mode === 'always' ? 'marquee-run' : 'marquee-run-on-hover') : ''
        }`}
      >
        {text}
      </span>
    </span>
  );
});
