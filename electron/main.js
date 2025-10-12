const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const gitHttp = require('isomorphic-git/http/node'); // Use the node client in main process

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
  // Add an IPC handler to proxy git HTTP requests from the renderer.
  // This uses the Node.js-based http client from isomorphic-git, which is not subject to CORS.
  ipcMain.handle('git-http-request', async (event, options) => {
    try {
      const response = await gitHttp.request(options);
      // The body is a stream/iterator; it must be consumed into a Buffer to be sent over IPC.
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(chunks);
      
      // Return a serializable response object to the renderer.
      return {
        url: response.url,
        method: response.method,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        body: bodyBuffer, // The buffer will be correctly handled by Electron's IPC.
        headers: response.headers,
      };
    } catch (error) {
      // Re-throw the error so it can be caught in the renderer process.
      // Serialize the error object to ensure it passes through IPC correctly.
      throw {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }
  });

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
