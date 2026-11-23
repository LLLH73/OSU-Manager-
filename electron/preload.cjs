const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setBackgroundColor: (color) =>
    ipcRenderer.invoke('window:setBackgroundColor', color),
  onMaximizedChange: (cb) => {
    const handler = (_event, val) => cb(Boolean(val));
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
  selectDirectory: (defaultPath) =>
    ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
  selectFile: (defaultPath, filters) =>
    ipcRenderer.invoke('dialog:selectFile', defaultPath, filters),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Overlay APIs
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  openOverlay: () => ipcRenderer.invoke('overlay:open'),
  closeOverlay: () => ipcRenderer.invoke('overlay:close'),
  isOverlayOpen: () => ipcRenderer.invoke('overlay:isOpen'),
  setOverlayOpacity: (opacity) => ipcRenderer.invoke('overlay:setOpacity', opacity),
  setOverlayNativeTheme: (theme) => ipcRenderer.invoke('overlay:setNativeTheme', theme),
  setOverlayAlwaysOnTop: (flag) => ipcRenderer.invoke('overlay:setAlwaysOnTop', flag),
  setOverlayCompact: (compact) => ipcRenderer.invoke('overlay:setCompact', compact),
  setOverlayHotkey: (hotkey) => ipcRenderer.invoke('overlay:setHotkey', hotkey),
  showMainWindow: () => ipcRenderer.invoke('overlay:showMain'),
  openPreviewInMain: (payload) => ipcRenderer.invoke('overlay:openPreviewInMain', payload),
  onOverlayStateChange: (cb) => {
    const handler = (_event, val) => cb(Boolean(val));
    ipcRenderer.on('overlay:state', handler);
    return () => ipcRenderer.removeListener('overlay:state', handler);
  },
  onOpenPreviewInMain: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('main:openPreview', handler);
    return () => ipcRenderer.removeListener('main:openPreview', handler);
  },
});
