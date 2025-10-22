# AIDE Electron Application

This directory contains the necessary files to run AIDE as a standalone desktop application using [Electron](https://www.electronjs.org/).

## Purpose

The Electron application serves as a native desktop wrapper for the AIDE web application. This provides two primary benefits:

1.  **Standalone Experience:** Users can run AIDE as a regular desktop app, complete with an icon, without needing to open a web browser.
2.  **Native Capabilities:** It overcomes browser limitations. The most critical feature is the ability to bypass browser CORS (Cross-Origin Resource Sharing) restrictions for Git operations.

## How CORS is Bypassed

Web browsers have a security feature called the Same-Origin Policy, which prevents a web page from making requests to a different domain than the one it was served from. This means the AIDE web app, running on its own origin, cannot directly make requests to `github.com`.

The Electron app solves this using a secure Inter-Process Communication (IPC) bridge:

1.  **Two Processes:** An Electron app has two main types of processes:
    *   **Main Process (`main.js`):** Runs in a full Node.js environment. It has access to native OS features and is not restricted by CORS.
    *   **Renderer Process (The Web App):** This is the AIDE React application running inside an Electron window (a Chromium instance). It is subject to the same security rules as a regular web page.

2.  **The IPC Bridge (`preload.js`):**
    *   The `preload.js` script is a special script that runs in the renderer process but has access to Node.js APIs.
    *   It uses Electron's `contextBridge` to securely expose a function, `window.electron.gitHttpRequest`, to the React application. This is the *only* bridge between the two worlds.

3.  **The Request Flow:**
    *   The React app's `gitService` detects it's running inside Electron.
    *   When it needs to perform a Git operation (like `clone` or `push`), it calls the exposed `window.electron.gitHttpRequest` function with the request details.
    *   The `preload.js` script receives this call and uses `ipcRenderer` to send the request details to the main process.
    *   The `main.js` process listens for these requests with `ipcMain.handle`.
    *   It executes the HTTP request using `isomorphic-git`'s native **Node.js HTTP client**, which is not subject to CORS.
    *   Once the request to GitHub is complete, `main.js` sends the response back to the renderer process.
    *   The renderer's `gitService` receives the response and completes the Git operation.

This architecture ensures that all sensitive network operations happen in the secure, unrestricted main process, while the web application remains sandboxed and secure in the renderer process.

## File Structure

-   `main.js`: The entry point for the Electron application. It creates the browser window, loads the web app, and sets up the `ipcMain` handler for Git requests.
-   `preload.js`: The secure bridge that exposes the `gitHttpRequest` function from the main process to the renderer process (the web app).
-   `README.md`: This file.

## Build Instructions

To build the desktop application for Windows, macOS, or Linux, please refer to the comprehensive guide in the root of the repository: **[BUILD_NATIVE.md](../BUILD_NATIVE.md)**.