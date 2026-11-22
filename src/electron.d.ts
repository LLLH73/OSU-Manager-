export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setBackgroundColor: (color: string) => Promise<void>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  selectDirectory: (defaultPath?: string) => Promise<string | null>;
  selectFile: (defaultPath?: string, filters?: FileDialogFilter[]) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
