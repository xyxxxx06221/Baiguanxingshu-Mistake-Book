import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProdServer } from 'vinext/server/prod-server';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let localServer = null;

function getBuildDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.resolve(currentDir, '..', 'dist');
}

async function createWindow() {
  const { server, port } = await startProdServer({
    outDir: getBuildDirectory(),
    host: '127.0.0.1',
    // Keep one origin across launches so localStorage remains persistent.
    port: 43127,
    silent: true,
  });
  localServer = server;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: '百官行述',
    backgroundColor: '#f6f6f8',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.setName('百官行述');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    console.error('百官行述启动失败：', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('before-quit', () => {
  localServer?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
