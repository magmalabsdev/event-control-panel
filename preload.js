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
