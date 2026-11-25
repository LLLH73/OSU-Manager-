import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Gauge,
  Loader2,
  Menu,
  Minus,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PictureInPicture2,
  Square,
  X,
} from 'lucide-react';
import { THEME_OPTIONS } from '../constants';
import { NetworkStatus, ThemeId } from '../types';

interface TitleBarProps {
  network: NetworkStatus | null;
  theme: ThemeId;
  overlayOpen?: boolean;
  overlayHotkey?: string;
  sidebarCollapsed?: boolean;
  archiveRailCollapsed?: boolean;
  archiveCount?: number;
  activeAccentHex?: string | null;
  onToggleOverlay: () => void;
  onChangeTheme: (t: ThemeId) => void;
  onBenchmark: () => void;
  onToggleNav: () => void;
  onToggleSidebar?: () => void;
  onToggleArchiveRail?: () => void;
}

/** Monochrome bold-stroke minimalist "OM" emblem for OSU!Manager! */
export function LaneEmblem({ className = 'h-[21px] w-[21px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0 text-ink`}
      aria-hidden="true"
    >
      <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="5" strokeWidth="1.9" />
      <circle cx="7.9" cy="12" r="3.1" strokeWidth="2.2" />
      <path d="M13.7 15.1V8.9L16.5 13L19.3 8.9V15.1" strokeWidth="2.2" />
    </svg>
  );
}

export function TitleBar({
  network,
  theme,
  overlayOpen = false,
  overlayHotkey = 'Alt+Shift+O',
  sidebarCollapsed = false,
  archiveRailCollapsed = true,
  archiveCount = 0,
  activeAccentHex = null,
  onToggleOverlay,
  onChangeTheme,
  onBenchmark,
  onToggleNav,
  onToggleSidebar,
  onToggleArchiveRail,
}: TitleBarProps) {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isElectron = Boolean(api?.isElectron);
  const [maximized, setMaximized] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!themeMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setThemeMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [themeMenuOpen]);

  const currentThemeMeta =
    THEME_OPTIONS.find((t) => t.id === theme) ??
    THEME_OPTIONS.find((t) => t.id === 'light') ??
    THEME_OPTIONS[0];
  const darkThemes = THEME_OPTIONS.filter((t) => t.isDark);
  const lightThemes = THEME_OPTIONS.filter((t) => !t.isDark);

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
    <header className="app-drag relative z-40 flex h-[40px] shrink-0 items-center border-b border-hairline bg-surface-0/82 backdrop-blur-xl">
      {/* Left: sidebar toggle + monochrome emblem + OSU!Manager! */}
      <div className="flex h-full min-w-0 items-center gap-2 pl-2.5 lg:pl-3">
        <button
          type="button"
          onClick={onToggleNav}
          title="打开导航"
          className="app-no-drag flex h-7 w-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? '展开左侧栏' : '收起左侧栏'}
            className="app-no-drag hidden h-7 w-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-tint-hover hover:text-ink lg:flex"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}

        <LaneEmblem />
        <span className="font-display truncate text-[0.875rem] font-bold tracking-tight text-ink">
          OSU!Manager!
        </span>
      </div>

      {/* Draggable spacer */}
      <div className="h-full flex-1" />

      {/* Right: overlay button + 8-theme popover + status pills */}
      <div className="flex h-full items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onToggleOverlay}
          title={`切换游戏内磨砂浮窗模式 (全局热键 ${overlayHotkey})`}
          className={`app-no-drag flex min-h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] font-semibold transition-colors ${
            overlayOpen
              ? 'border-osu/60 bg-osu/18 text-osu-soft shadow-[0_0_0_1px_color-mix(in_srgb,var(--t-osu)_25%,transparent)]'
              : 'border-hairline bg-tint text-ink-2 hover:border-hairline-strong hover:bg-tint-hover hover:text-ink'
          }`}
        >
          <PictureInPicture2 className="h-3.5 w-3.5 text-osu" />
          <span className="hidden sm:inline">浮窗模式</span>
        </button>

        {/* Compact 8-theme popover trigger */}
        <div ref={themeMenuRef} className="app-no-drag relative">
          <button
            type="button"
            onClick={() => setThemeMenuOpen((v) => !v)}
            title="切换界面主题（共 8 套配色，可在设置中开启随封面变色）"
            className={`flex min-h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] font-semibold transition-colors ${
              themeMenuOpen
                ? 'border-hairline-strong bg-surface-2 text-ink'
                : 'border-hairline bg-tint text-ink-2 hover:border-hairline-strong hover:bg-tint-hover hover:text-ink'
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/25"
              style={{
                backgroundColor: currentThemeMeta.swatchBg,
                boxShadow: `0 0 0 1.5px ${activeAccentHex || currentThemeMeta.swatchRing}`,
              }}
            />
            <span className="hidden md:inline">{currentThemeMeta.label}</span>
            <Palette className="h-3 w-3 text-ink-3" />
          </button>

          {themeMenuOpen && (
            <div className="animate-fade-in fixed top-[44px] right-3 z-50 w-[264px] rounded-xl border border-hairline-strong bg-surface-2/95 p-2.5 shadow-2xl backdrop-blur-xl sm:absolute sm:top-[32px] sm:right-0">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="overline">暗色主题</span>
                {activeAccentHex && (
                  <span
                    className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-ink-3"
                    title="当前强调色正随背景或自定义强调色联动"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: activeAccentHex }}
                    />
                    动态配色
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {darkThemes.map((opt) => {
                  const active = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeTheme(opt.id);
                        setThemeMenuOpen(false);
                      }}
                      title={opt.desc}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                        active
                          ? 'border-osu/45 bg-surface-3 font-semibold text-ink'
                          : 'border-transparent text-ink-2 hover:bg-tint-hover hover:text-ink'
                      }`}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                        style={{
                          backgroundColor: opt.swatchBg,
                          boxShadow: active ? `0 0 0 1.5px ${opt.swatchRing}` : undefined,
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {active && <Check className="h-3 w-3 shrink-0 text-osu" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 mb-1.5 px-1">
                <span className="overline">浅色与纸感</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {lightThemes.map((opt) => {
                  const active = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeTheme(opt.id);
                        setThemeMenuOpen(false);
                      }}
                      title={opt.desc}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[0.75rem] font-medium transition-colors ${
                        active
                          ? 'border-osu/45 bg-surface-3 font-semibold text-ink'
                          : 'border-transparent text-ink-2 hover:bg-tint-hover hover:text-ink'
                      }`}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                        style={{
                          backgroundColor: opt.swatchBg,
                          boxShadow: active ? `0 0 0 1.5px ${opt.swatchRing}` : undefined,
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {active && <Check className="h-3 w-3 shrink-0 text-osu" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onBenchmark}
          title={`本地代理 ${network?.proxyHost ?? '127.0.0.1'}:${proxyPort} · 点击重新检测代理与镜像测速`}
          className="app-no-drag flex min-h-[26px] items-center gap-1.5 rounded-full border border-hairline bg-tint px-2.5 text-[0.75rem] font-medium text-ink-2 transition-colors hover:border-hairline-strong hover:bg-tint-hover"
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
          <span className={proxyOpen ? 'font-semibold text-ok' : 'text-ink-3'}>
            {proxyOpen ? '在线' : '离线'}
          </span>
        </button>

        <button
          type="button"
          onClick={onBenchmark}
          disabled={network?.benchmarking}
          title="当前最快镜像 · 点击立即测速"
          className="app-no-drag hidden min-h-[26px] items-center gap-1.5 rounded-full border border-hairline bg-tint px-2.5 text-[0.75rem] font-medium text-ink-2 transition-colors hover:border-osu/40 hover:bg-osu/10 disabled:opacity-60 sm:flex"
        >
          <Gauge className={`h-3 w-3 ${network?.benchmarking ? 'animate-pulse text-warn' : 'text-osu'}`} />
          <span className="max-w-[120px] truncate text-ink">
            {network?.benchmarking ? '测速中…' : recommended?.shortName ?? '未测速'}
          </span>
          {!network?.benchmarking && latency != null && (
            <span className={`font-mono ${latencyCls}`}>{latency}ms</span>
          )}
        </button>

        {onToggleArchiveRail && (
          <button
            type="button"
            onClick={onToggleArchiveRail}
            title={archiveRailCollapsed ? '展开 Filter 存档右侧栏' : '收起 Filter 存档右侧栏'}
            aria-pressed={!archiveRailCollapsed}
            className={`app-no-drag flex min-h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] font-semibold transition-colors ${
              !archiveRailCollapsed
                ? 'border-osu/55 bg-osu/15 text-osu-soft'
                : 'border-hairline bg-tint text-ink-2 hover:border-hairline-strong hover:bg-tint-hover hover:text-ink'
            }`}
          >
            {archiveRailCollapsed ? (
              <PanelRightOpen className="h-3.5 w-3.5 text-osu" />
            ) : (
              <PanelRightClose className="h-3.5 w-3.5 text-osu" />
            )}
            <span className="hidden sm:inline">存档</span>
            {archiveCount > 0 && (
              <span className="font-mono rounded-full bg-surface-2 px-1.5 py-px text-[0.65625rem] font-bold text-ink tabular-nums">
                {archiveCount}
              </span>
            )}
          </button>
        )}

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
