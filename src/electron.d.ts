export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenPreviewPayload {
  beatmapsetId: number;
  beatmapId?: number | null;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setBackgroundColor: (color: string) => Promise<void>;
  hideToTray?: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  selectDirectory: (defaultPath?: string) => Promise<string | null>;
  selectFile: (defaultPath?: string, filters?: FileDialogFilter[]) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  setLanguage?: (lang: 'zh' | 'en') => Promise<void>;

  // Overlay APIs
  toggleOverlay: () => Promise<boolean>;
  openOverlay: () => Promise<boolean>;
  closeOverlay: () => Promise<boolean>;
  isOverlayOpen: () => Promise<boolean>;
  setOverlayOpacity: (opacity: number) => Promise<void>;
  setOverlayNativeTheme: (theme: string) => Promise<void>;
  setOverlayAlwaysOnTop: (flag: boolean) => Promise<void>;
  setOverlayCompact: (compact: boolean) => Promise<void>;
  setOverlayHotkey: (hotkey: string) => Promise<{ ok: boolean; error?: string }>;
  showMainWindow: () => Promise<void>;
  openPreviewInMain: (payload: OpenPreviewPayload) => Promise<void>;
  onOverlayStateChange: (cb: (open: boolean) => void) => () => void;
  onOpenPreviewInMain: (cb: (payload: OpenPreviewPayload) => void) => () => void;
  onMusicCommand?: (cb: (cmd: 'toggle' | 'prev' | 'next') => void) => () => void;
}

declare global {
  const __APP_VERSION__: string;
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
