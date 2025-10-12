const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // It's recommended to keep contextIsolation enabled for security
      contextIsolation: true,
      // sandbox: true, // You might need to disable sandbox for certain node features
    },
  });

  // Load the production build of your web app.
  // The path should point to your 'www' directory.
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));

  // Open the DevTools.
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});