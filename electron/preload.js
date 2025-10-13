const { contextBridge, ipcRenderer } = require('electron');
const { Buffer } = require('buffer');

// Expose a secure API to the renderer process. This API provides a custom
// HTTP client that isomorphic-git can use to bypass CORS in Electron.
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  git: {
    // This `request` function matches the interface required by isomorphic-git's `http` parameter.
    async request(request) {
      // The request body from isomorphic-git is an async iterable (a stream).
      // We must convert it to a serializable format (base64 string) to send over the IPC bridge.
      let bodyBase64 = null;
      if (request.body) {
        const chunks = [];
        for await (const chunk of request.body) {
          chunks.push(chunk);
        }
        bodyBase64 = Buffer.concat(chunks).toString('base64');
      }

      // Invoke the handler in the main process.
      const response = await ipcRenderer.invoke('git-http-request', {
        ...request,
        body: bodyBase64,
      });

      // The response body comes back as a base64 string. We must convert it
      // back into an async iterable for isomorphic-git to consume.
      const responseBodyBuffer = Buffer.from(response.body, 'base64');
      response.body = (async function* () {
        yield responseBodyBuffer;
      })();

      return response;
    }
  }
});