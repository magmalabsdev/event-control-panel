const { contextBridge, ipcRenderer } = require('electron');

// Minimal, read-only bridge: lets the renderer receive a .ecp file that the OS
// asked the app to open (double-click in a file explorer / "open with").
contextBridge.exposeInMainWorld('ecpBridge', {
  onOpenPreset(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('open-ecp-file', (_event, payload) => callback(payload));
    // Tell main the renderer is listening, so any file queued before load is flushed.
    ipcRenderer.send('ecp-renderer-ready');
  },
});

// Marks the renderer as the packaged desktop app and surfaces its STATIC build-time
// version (app.getVersion()), so the version tag shows the frozen build number rather
// than the web app's live commit-derived version.
contextBridge.exposeInMainWorld('ecpDesktop', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('get-app-version'),
});
