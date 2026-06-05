const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let rendererReady = false;
// A .ecp path the OS asked us to open before the renderer was ready to receive it.
let pendingFilePath = null;

// macOS delivers file opens via this event, which can fire before `ready`.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  handleFileOpen(filePath);
});

function isEcpPath(p) {
  return typeof p === 'string' && p.toLowerCase().endsWith('.ecp');
}

// Pick the first .ecp argument out of a process argv array (Windows/Linux).
function ecpPathFromArgv(argv) {
  return (argv || []).find(arg => isEcpPath(arg)) || null;
}

function handleFileOpen(filePath) {
  if (!isEcpPath(filePath)) return;
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  deliverFile(filePath);
}

function deliverFile(filePath) {
  // Send to the renderer once it has registered its listener; otherwise queue it.
  if (mainWindow && rendererReady) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error('Failed to read .ecp file:', err);
      return;
    }
    mainWindow.webContents.send('open-ecp-file', { name: path.basename(filePath), content });
  } else {
    pendingFilePath = filePath;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    icon: path.join(__dirname, 'ecp-logo.png'), // taskbar/window icon on Windows/Linux
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');

  // Allow the "display" window opened via window.open('media.html', ...) to render.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));

  // A reload resets the renderer; require a fresh ready signal before pushing files.
  mainWindow.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) rendererReady = false;
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  return mainWindow;
}

// Ensure a single instance so a second "open .ecp" reuses the running window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = ecpPathFromArgv(argv);
    if (filePath) handleFileOpen(filePath);
    else if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  // The renderer tells us when its open-preset listener is wired up.
  ipcMain.on('ecp-renderer-ready', () => {
    rendererReady = true;
    if (pendingFilePath) {
      const filePath = pendingFilePath;
      pendingFilePath = null;
      deliverFile(filePath);
    }
  });

  app.whenReady().then(() => {
    // Grant microphone / device-enumeration access used by the intercom and audio
    // output-device selection, instead of leaving an unanswerable in-page prompt.
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'media' || permission === 'audioCapture') {
        callback(true);
        return;
      }
      callback(false);
    });

    createWindow();

    // Cold start on Windows/Linux: a .ecp passed on the command line.
    const initialFile = ecpPathFromArgv(process.argv.slice(1));
    if (initialFile) pendingFilePath = initialFile;

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
