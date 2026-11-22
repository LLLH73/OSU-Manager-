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
});
