const { contextBridge } = require('electron');

// Expose a simple flag to the renderer process to identify the Electron environment.
// This is a secure way to let your React app know it's running in Electron.
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
});