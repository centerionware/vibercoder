const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fetch } = require('undici'); // A modern fetch API for Node.js

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

app.whenReady().then(() => {
  // This IPC handler acts as a secure CORS proxy for isomorphic-git.
  // The renderer process sends an HTTP request object here, and this handler
  // executes it in the unrestricted Node.js environment.
  ipcMain.handle('git-http-request', async (event, request) => {
    try {
      // Security: Only proxy requests to GitHub to prevent abuse.
      if (!request.url.startsWith('https://github.com')) {
        throw new Error('Proxy is limited to github.com requests only.');
      }

      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        // The body from the renderer is base64 encoded.
        body: request.body ? Buffer.from(request.body, 'base64') : undefined,
        redirect: 'manual', // isomorphic-git handles redirects itself.
      });

      const body = await response.arrayBuffer();
      
      const headers = {};
      response.headers.forEach((value, key) => (headers[key] = value));

      // Return a response object that matches isomorphic-git's expected format.
      return {
        url: response.url,
        statusCode: response.status,
        statusMessage: response.statusText,
        headers,
        // Send the body back as base64 to ensure it's serializable.
        body: Buffer.from(body).toString('base64'),
      };
    } catch (error) {
      console.error('Git HTTP request failed in main process:', error);
      // Re-throw a serializable error so the renderer can handle it.
      throw {
        message: error.message,
        name: error.name,
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