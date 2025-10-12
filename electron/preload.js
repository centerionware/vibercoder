const { contextBridge, ipcRenderer } = require('electron');

// Expose a simple flag to the renderer process to identify the Electron environment.
// This is a secure way to let your React app know it's running in Electron.
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  // Expose a function to proxy git HTTP requests to the main process.
  // This is the bridge that allows the renderer to bypass CORS.
  gitHttpRequest: (options) => ipcRenderer.invoke('git-http-request', options),
});
