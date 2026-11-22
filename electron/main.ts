import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell, type FileFilter } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverHandle: { port: number; close: () => Promise<void> } | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setBackgroundColor', (_event, color: string) => {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
      mainWindow?.setBackgroundColor(color);
    }
  });

  ipcMain.handle('dialog:selectDirectory', async (_event, defaultPath?: string) => {
    const win = mainWindow ?? undefined;
    const res = win
      ? await dialog.showOpenDialog(win, {
          defaultPath: defaultPath || undefined,
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          defaultPath: defaultPath || undefined,
          properties: ['openDirectory'],
        });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle(
    'dialog:selectFile',
    async (_event, defaultPath?: string, filters?: FileFilter[]) => {
      const win = mainWindow ?? undefined;
      const opts = {
        defaultPath: defaultPath || undefined,
        filters: filters?.length ? filters : [{ name: 'Executable', extensions: ['exe'] }],
        properties: ['openFile'] as Array<'openFile'>,
      };
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      if (res.canceled || res.filePaths.length === 0) return null;
      return res.filePaths[0];
    },
  );

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('app:version', () => app.getVersion());
}

function createWindow(port: number): void {
  const iconPath = path.resolve(__dirname, '..', 'build', 'icon.png');
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#090a10',
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('maximize', () => {
    win.webContents.send('window:maximized', true);
  });

  win.on('unmaximize', () => {
    win.webContents.send('window:maximized', false);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  const targetUrl = process.env.ELECTRON_DEV_URL || `http://127.0.0.1:${port}`;
  void win.loadURL(targetUrl);
}

app.whenReady().then(async () => {
  if (!gotLock) return;

  if (!process.env.OSU_DL_DATA_DIR) {
    process.env.OSU_DL_DATA_DIR = app.isPackaged
      ? path.join(app.getPath('userData'), 'data')
      : path.resolve(app.getAppPath(), 'data');
  }

  registerIpcHandlers();

  const serverEntryUrl = pathToFileURL(path.resolve(__dirname, '..', 'dist-server', 'index.js')).href;
  const { startServer } = (await import(serverEntryUrl)) as {
    startServer: (preferredPort?: number) => Promise<{ port: number; close: () => Promise<void> }>;
  };
  const handle = await startServer(Number(process.env.PORT || 3721));
  serverHandle = handle;
  createWindow(handle.port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
      createWindow(serverHandle.port);
    }
  });
});

let quitting = false;
app.on('before-quit', (event) => {
  if (serverHandle && !quitting) {
    quitting = true;
    event.preventDefault();
    const handle = serverHandle;
    serverHandle = null;
    void handle.close().finally(() => {
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
