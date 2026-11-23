import { useEffect, useId, useState } from 'react';
import { Gauge, Loader2, Menu, Minus, PictureInPicture2, Square, X } from 'lucide-react';
import { THEME_OPTIONS } from '../constants';
import { NetworkStatus, ThemeId } from '../types';

interface TitleBarProps {
  network: NetworkStatus | null;
  theme: ThemeId;
  overlayOpen?: boolean;
  overlayHotkey?: string;
  onToggleOverlay: () => void;
  onChangeTheme: (t: ThemeId) => void;
  onBenchmark: () => void;
  onToggleNav: () => void;
}

/** 4K key-lane emblem: four lanes with staggered notes + a hold note, osu! pink -> lazer violet. */
export function LaneEmblem({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  const gid = `lane-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff66aa" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5" fill={`url(#${gid})`} />
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.75" />
      <g stroke="rgba(9,10,16,0.26)" strokeWidth="0.8">
        <line x1="8" y1="4" x2="8" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="16" y1="4" x2="16" y2="20" />
      </g>
      <g fill="#fff">
        <rect x="4.6" y="12.5" width="2.8" height="2" rx="0.8" />
        <rect x="8.6" y="6.2" width="2.8" height="2" rx="0.8" />
        <rect x="12.6" y="7.5" width="2.8" height="8.5" rx="1" opacity="0.92" />
        <rect x="16.6" y="10" width="2.8" height="2" rx="0.8" />
      </g>
      <rect x="4" y="17.6" width="16" height="1.3" rx="0.65" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}

export function TitleBar({
  network,
  theme,
  overlayOpen = false,
  overlayHotkey = 'Alt+Shift+O',
  onToggleOverlay,
  onChangeTheme,
  onBenchmark,
  onToggleNav,
}: TitleBarProps) {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isElectron = Boolean(api?.isElectron);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api?.isElectron) return;
    let disposed = false;
    void api.isMaximized().then((v) => {
      if (!disposed) setMaximized(v);
    });
    const unsubscribe = api.onMaximizedChange((v) => setMaximized(v));
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api]);

  const recommended = network?.mirrors.find((m) => m.id === network.recommendedMirror);
  const proxyPort = network?.proxyPort ?? 6174;
  const proxyOpen = Boolean(network?.proxyOpen);
  const latency = recommended?.latencyMs ?? null;
  const latencyCls =
    latency == null
      ? 'text-ink-3'
      : latency < 300
        ? 'text-ok'
        : latency < 1000
          ? 'text-warn'
          : 'text-bad';

  return (
    <header className="app-drag relative z-40 flex h-[40px] shrink-0 items-center border-b border-hairline bg-surface-0/90 backdrop-blur-xl">
      {/* Left: nav toggle + emblem + title */}
      <div className="flex h-full min-w-0 items-center gap-2.5 pl-2.5 lg:pl-3.5">
        <button
          type="button"
          onClick={onToggleNav}
          title="打开导航"
          className="app-no-drag flex h-7 w-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <LaneEmblem />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-display truncate text-[13px] font-bold text-ink">
            osu! 4K 谱面工坊
          </span>
          <span className="font-stat hidden text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase sm:inline">
            Desktop
          </span>
        </div>
      </div>

      {/* Draggable spacer */}
      <div className="h-full flex-1" />

      {/* Right: overlay button + theme switcher + status pills */}
      <div className="flex h-full items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onToggleOverlay}
          title={`切换游戏内磨砂浮窗模式 (全局热键 ${overlayHotkey})`}
          className={`app-no-drag flex h-[25px] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
            overlayOpen
              ? 'border-osu/60 bg-osu/18 text-osu-soft shadow-[0_0_0_1px_color-mix(in_srgb,var(--t-osu)_25%,transparent)]'
              : 'border-hairline bg-tint text-ink-2 hover:border-hairline-strong hover:bg-tint-hover hover:text-ink'
          }`}
        >
          <PictureInPicture2 className="h-3.5 w-3.5 text-osu" />
          <span className="hidden sm:inline">浮窗模式</span>
        </button>

        {/* Minimalist 3-theme switcher */}
        <div
          className="app-no-drag flex h-[25px] items-center gap-1 rounded-full border border-hairline bg-tint px-1.5"
          title="切换界面主题：曜石黑 / 瓷器白 / 浅咖啡"
        >
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeTheme(opt.id)}
                title={`${opt.label} · ${opt.desc}`}
                className={`flex h-[19px] items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium transition-colors ${
                  active
                    ? 'bg-surface-2 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_0_0_1px_var(--t-hairline-strong)]'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20"
                  style={{
                    backgroundColor: opt.swatchBg,
                    boxShadow: active ? `0 0 0 1.5px ${opt.swatchRing}` : undefined,
                  }}
                />
                <span className="hidden md:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onBenchmark}
          title={`本地代理 ${network?.proxyHost ?? '127.0.0.1'}:${proxyPort} · 点击重新检测代理与镜像测速`}
          className="app-no-drag flex h-[25px] items-center gap-1.5 rounded-full border border-hairline bg-tint px-2.5 text-[11px] text-ink-2 transition-colors hover:border-hairline-strong hover:bg-tint-hover"
        >
          {network?.benchmarking ? (
            <Loader2 className="h-3 w-3 animate-spin text-warn" />
          ) : proxyOpen ? (
            <span className="live-dot" />
          ) : (
            <span className="idle-dot" />
          )}
          <span className="text-ink-3">Proxy</span>
          <span className="font-mono text-ink">{proxyPort}</span>
          <span className={proxyOpen ? 'text-ok font-medium' : 'text-ink-3'}>
            {proxyOpen ? '在线' : '离线'}
          </span>
        </button>

        <button
          type="button"
          onClick={onBenchmark}
          disabled={network?.benchmarking}
          title="当前最快镜像 · 点击立即测速"
          className="app-no-drag hidden h-[25px] items-center gap-1.5 rounded-full border border-hairline bg-tint px-2.5 text-[11px] text-ink-2 transition-colors hover:border-osu/40 hover:bg-osu/10 disabled:opacity-60 sm:flex"
        >
          <Gauge className={`h-3 w-3 ${network?.benchmarking ? 'animate-pulse text-warn' : 'text-osu'}`} />
          <span className="max-w-[120px] truncate text-ink">
            {network?.benchmarking ? '测速中…' : recommended?.shortName ?? '未测速'}
          </span>
          {!network?.benchmarking && latency != null && (
            <span className={`font-mono ${latencyCls}`}>{latency}ms</span>
          )}
        </button>

        {isElectron && <div className="mx-0.5 h-4 w-px bg-hairline" />}
      </div>

      {/* Window controls (Electron only) */}
      {isElectron && api && (
        <div className="app-no-drag flex h-full items-stretch">
          <button
            type="button"
            onClick={() => void api.minimize()}
            title="最小化"
            className="flex w-[44px] items-center justify-center text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => void api.toggleMaximize().then((v) => setMaximized(v))}
            title={maximized ? '还原' : '最大化'}
            className="flex w-[44px] items-center justify-center text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink"
          >
            {maximized ? (
              <svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.1">
                <rect x="1.5" y="3.5" width="7" height="7" rx="1" />
                <path d="M3.5 3.5V2.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
              </svg>
            ) : (
              <Square className="h-[11px] w-[11px]" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={() => void api.close()}
            title="关闭"
            className="flex w-[46px] items-center justify-center text-ink-2 transition-colors hover:bg-[#e81123] hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </header>
  );
}
