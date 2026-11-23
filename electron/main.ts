import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  Tray,
  type FileFilter,
} from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverHandle: { port: number; close: () => Promise<void> } | null = null;
let serverPort = Number(process.env.PORT || 3721);

let currentHotkey = 'Alt+Shift+O';
let overlayPinned = true;
let overlayExpandedHeight = 660;
let overlayCompact = false;
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (serverHandle) {
      createWindow(serverHandle.port);
    }
  });
}

function loadInitialOverlayPrefs(): void {
  const dataDir = process.env.OSU_DL_DATA_DIR;
  if (!dataDir) return;
  const cfgPath = path.join(dataDir, 'config.json');
  if (!fs.existsSync(cfgPath)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
      overlayHotkey?: string;
    };
    if (typeof parsed.overlayHotkey === 'string' && parsed.overlayHotkey.trim()) {
      currentHotkey = parsed.overlayHotkey.trim();
    }
  } catch {
    // Ignore unreadable config
  }
}

function notifyOverlayState(isOpen: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay:state', isOpen);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:state', isOpen);
  }
}

function showMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return createWindow(serverPort);
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

function createOverlayWindow(port: number): BrowserWindow {
  const iconPath = path.resolve(__dirname, '..', 'build', 'icon.png');
  const { workArea } = screen.getPrimaryDisplay();
  const width = 440;
  const expandedH = Math.min(Math.max(540, overlayExpandedHeight), workArea.height - 48);
  overlayExpandedHeight = expandedH;
  const height = overlayCompact ? 64 : expandedH;
  const x = Math.max(workArea.x + 12, workArea.x + workArea.width - width - 24);
  const y = Math.max(workArea.y + 12, workArea.y + Math.round((workArea.height - expandedH) / 2));

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 360,
    minHeight: 62,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    roundedCorners: true,
    alwaysOnTop: overlayPinned,
    maximizable: false,
    fullscreenable: false,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlayWindow = win;

  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    if (process.platform === 'win32') {
      try {
        win.setBackgroundMaterial('acrylic');
      } catch {
        // Fallback silently on unsupported Windows builds
      }
    }
    win.setAlwaysOnTop(overlayPinned, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.show();
    notifyOverlayState(true);
  });

  win.on('show', () => notifyOverlayState(true));
  win.on('hide', () => notifyOverlayState(false));

  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
      notifyOverlayState(false);
    }
  });

  win.on('closed', () => {
    if (overlayWindow === win) overlayWindow = null;
    notifyOverlayState(false);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const baseUrl = process.env.ELECTRON_DEV_URL || `http://127.0.0.1:${port}`;
  const overlayUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}mode=overlay`;
  void win.loadURL(overlayUrl);

  return win;
}

function openOverlayWindow(): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow(serverPort);
    return true;
  }
  overlayWindow.show();
  overlayWindow.setAlwaysOnTop(overlayPinned, 'screen-saver');
  overlayWindow.focus();
  notifyOverlayState(true);
  return true;
}

function toggleOverlayWindow(): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow(serverPort);
    return true;
  }
  if (overlayWindow.isVisible() && overlayWindow.isFocused()) {
    overlayWindow.hide();
    notifyOverlayState(false);
    return false;
  }
  return openOverlayWindow();
}

function updateTrayMenu(): void {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: `切换游戏内浮窗 (${currentHotkey})`,
      click: () => {
        toggleOverlayWindow();
      },
    },
    {
      label: '显示主窗口',
      click: () => {
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: '退出 OSU!Downloader!',
      click: () => {
        quitting = true;
        if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
        if (tray) {
          tray.destroy();
          tray = null;
        }
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  if (tray) return;
  const iconPath = path.resolve(__dirname, '..', 'build', 'icon.png');
  if (!fs.existsSync(iconPath)) return;
  const iconImg = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(iconImg);
  tray.setToolTip('OSU!Downloader!');
  tray.on('click', () => {
    toggleOverlayWindow();
  });
  updateTrayMenu();
}

function registerOverlayHotkey(hotkey: string): { ok: boolean; error?: string } {
  const trimmed = hotkey.trim();
  if (!trimmed) {
    return { ok: false, error: '快捷键不能为空' };
  }
  const previous = currentHotkey;
  globalShortcut.unregisterAll();
  let registered = false;
  try {
    registered = globalShortcut.register(trimmed, () => {
      toggleOverlayWindow();
    });
  } catch {
    registered = false;
  }

  if (registered) {
    currentHotkey = trimmed;
    updateTrayMenu();
    return { ok: true };
  }

  if (previous && previous !== trimmed) {
    try {
      globalShortcut.register(previous, () => {
        toggleOverlayWindow();
      });
    } catch {
      // Ignore restore error
    }
  }
  return { ok: false, error: `无法注册全局快捷键 "${trimmed}"（可能与系统或其他软件冲突）` };
}

function registerIpcHandlers(): void {
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    win?.minimize();
  });

  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (!win || win === overlayWindow) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (!win) return;
    if (win === overlayWindow) {
      win.hide();
      notifyOverlayState(false);
    } else {
      win.close();
    }
  });

  ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return win?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setBackgroundColor', (event, color: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (!win || win === overlayWindow) return;
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
      win.setBackgroundColor(color);
    }
  });

  ipcMain.handle('dialog:selectDirectory', async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
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
    async (event, defaultPath?: string, filters?: FileFilter[]) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
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

  // Overlay IPC
  ipcMain.handle('overlay:toggle', () => toggleOverlayWindow());
  ipcMain.handle('overlay:open', () => openOverlayWindow());
  ipcMain.handle('overlay:close', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    notifyOverlayState(false);
    return false;
  });
  ipcMain.handle('overlay:isOpen', () =>
    Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()),
  );
  ipcMain.handle('overlay:setOpacity', (_event, value: number) => {
    // Note: DWM Acrylic composition breaks if win.setOpacity() sets WS_EX_LAYERED;
    // backdrop vibrancy opacity is controlled cleanly in CSS via --mac-tint-alpha.
    void value;
  });
  ipcMain.handle('overlay:setNativeTheme', (_event, theme: string) => {
    const darkSet = new Set(['dark', 'stone', 'midnight', 'forest']);
    nativeTheme.themeSource = darkSet.has(theme) ? 'dark' : 'light';
  });
  ipcMain.handle('overlay:setAlwaysOnTop', (_event, flag: boolean) => {
    overlayPinned = Boolean(flag);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(overlayPinned, 'screen-saver');
    }
  });
  ipcMain.handle('overlay:setCompact', (_event, compact: boolean) => {
    const nextCompact = Boolean(compact);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const bounds = overlayWindow.getBounds();
      if (nextCompact && !overlayCompact && bounds.height > 120) {
        overlayExpandedHeight = bounds.height;
      }
      overlayCompact = nextCompact;
      overlayWindow.setBounds(
        {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: nextCompact ? 64 : Math.max(520, overlayExpandedHeight),
        },
        true,
      );
    } else {
      overlayCompact = nextCompact;
    }
  });
  ipcMain.handle('overlay:setHotkey', (_event, hotkey: string) => {
    return registerOverlayHotkey(String(hotkey || ''));
  });
  ipcMain.handle('overlay:showMain', () => {
    showMainWindow();
  });
  ipcMain.handle(
    'overlay:openPreviewInMain',
    (_event, payload: { beatmapsetId: number; beatmapId?: number | null }) => {
      const existed = Boolean(mainWindow && !mainWindow.isDestroyed());
      const win = showMainWindow();
      if (existed && !win.webContents.isLoadingMainFrame()) {
        win.webContents.send('main:openPreview', payload);
      } else {
        win.webContents.once('did-finish-load', () => {
          win.webContents.send('main:openPreview', payload);
        });
      }
    },
  );
}

function createWindow(port: number): BrowserWindow {
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
    if (mainWindow === win) {
      mainWindow = null;
      quitting = true;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.destroy();
        overlayWindow = null;
      }
      if (tray) {
        tray.destroy();
        tray = null;
      }
    }
  });

  const targetUrl = process.env.ELECTRON_DEV_URL || `http://127.0.0.1:${port}`;
  void win.loadURL(targetUrl);
  return win;
}

app.whenReady().then(async () => {
  if (!gotLock) return;

  if (!process.env.OSU_DL_DATA_DIR) {
    process.env.OSU_DL_DATA_DIR = app.isPackaged
      ? path.join(app.getPath('userData'), 'data')
      : path.resolve(app.getAppPath(), 'data');
  }

  loadInitialOverlayPrefs();
  registerIpcHandlers();

  const serverEntryUrl = pathToFileURL(path.resolve(__dirname, '..', 'dist-server', 'index.js')).href;
  const { startServer } = (await import(serverEntryUrl)) as {
    startServer: (preferredPort?: number) => Promise<{ port: number; close: () => Promise<void> }>;
  };
  const handle = await startServer(Number(process.env.PORT || 3721));
  serverHandle = handle;
  serverPort = handle.port;
  createWindow(handle.port);
  createTray();
  registerOverlayHotkey(currentHotkey);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
      createWindow(serverHandle.port);
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', (event) => {
  quitting = true;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (serverHandle) {
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
