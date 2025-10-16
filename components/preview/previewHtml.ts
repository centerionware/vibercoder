export const previewHtml = `
<html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              'vibe-bg': '#1a1b26',
              'vibe-bg-deep': '#16161e',
              'vibe-panel': '#24283b',
              'vibe-accent': '#7aa2f7',
              'vibe-accent-hover': '#9ece6a',
              'vibe-text': '#c0caf5',
              'vibe-text-secondary': '#a9b1d6',
              'vibe-comment': '#565f89',
            }
          }
        }
      }
    </script>
<script type="importmap">
{
  "imports": {
    "react-dom/": "https://aistudiocdn.com/react-dom@^19.2.0/",
    "@google/genai": "https://aistudiocdn.com/@google/genai@^1.24.0",
    "react/": "https://aistudiocdn.com/react@^19.2.0/",
    "react": "https://aistudiocdn.com/react@^19.2.0",
    "html2canvas": "https://aistudiocdn.com/html2canvas@^1.4.1",
    "@monaco-editor/react": "https://aistudiocdn.com/@monaco-editor/react@^4.7.0",
    "@vitejs/plugin-react": "https://aistudiocdn.com/@vitejs/plugin-react@^5.0.4",
    "vite": "https://aistudiocdn.com/vite@^7.1.9",
    "monaco-editor": "https://aistudiocdn.com/monaco-editor@^0.54.0",
    "dexie": "https://aistudiocdn.com/dexie@^4.2.1",
    "buffer": "https://aistudiocdn.com/buffer@^6.0.3",
    "esbuild-wasm": "https://aistudiocdn.com/esbuild-wasm@^0.25.10",
    "@capacitor/core": "https://aistudiocdn.com/@capacitor/core@^7.4.3",
    "isomorphic-git/": "https://aistudiocdn.com/isomorphic-git@^1.34.0/",
    "isomorphic-git": "https://aistudiocdn.com/isomorphic-git@^1.34.0",
    "uuid": "https://aistudiocdn.com/uuid@^13.0.0",
    "@isomorphic-git/lightning-fs": "https://aistudiocdn.com/@isomorphic-git/lightning-fs@^4.6.2",
    "path": "https://aistudiocdn.com/path@^0.12.7",
    "fs": "https://aistudiocdn.com/fs@^0.0.1-security",
    "url": "https://aistudiocdn.com/url@^0.11.4",
    "react-dom": "https://aistudiocdn.com/react-dom@^19.2.0"
  }
}
</script>
    <style>
      html, body, #root { height: 100%; width: 100%; }
      body { margin: 0; background-color: #1a1b26; }
      #root-error { color: white; font-family: sans-serif; padding: 1rem; }
      #root-error h3 { color: #f87171; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
    (function() {
      const root = document.querySelector('#root');
      const parentWindow = window.parent;

      const handleError = (err) => {
        const message = err ? (err.message || String(err)) : 'An unknown error occurred.';
        if (root) {
            root.innerHTML = '<div id="root-error"><h3>Runtime Error</h3><pre>' + message + '</pre></div>';
        }
        console.error('Error in preview:', err);
        parentWindow.postMessage({ type: 'runtime-error', error: message }, '*');
      };
      
      window.addEventListener('error', (event) => handleError(event.error));
      window.addEventListener('unhandledrejection', (event) => handleError(event.reason));

      const handleCaptureState = (event) => {
          const { requestId } = event.data;
          try {
              const videoEl = document.querySelector('video');
              const payload = {
                  htmlContent: document.documentElement.outerHTML,
                  videoFrameDataUrl: null,
                  videoFrameRect: null,
              };
              
              if (videoEl) {
                  const canvas = document.createElement('canvas');
                  canvas.width = videoEl.videoWidth;
                  canvas.height = videoEl.videoHeight;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                    payload.videoFrameDataUrl = canvas.toDataURL();
                    payload.videoFrameRect = JSON.parse(JSON.stringify(videoEl.getBoundingClientRect()));
                  }
              }

              parentWindow.postMessage({
                  type: 'preview-state-captured',
                  requestId,
                  payload,
              }, '*');
          } catch (e) {
              parentWindow.postMessage({
                  type: 'preview-state-error',
                  requestId,
                  message: e.message,
              }, '*');
          }
      };
      
      const handleInteraction = (event) => {
          const { requestId, payload } = event.data;
          const { selector, action, value } = payload;
          try {
              const element = document.querySelector(selector);
              if (!element) {
                  throw new Error(\`Element with selector "\${selector}" not found.\`);
              }
              switch (action) {
                  case 'click':
                      element.click();
                      break;
                  case 'type':
                      if (typeof value === 'undefined') throw new Error('A "value" must be provided for the "type" action.');
                      element.value = value;
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                  case 'focus':
                      element.focus();
                      break;
                  case 'blur':
                      element.blur();
                      break;
                  default:
                      throw new Error(\`Unsupported action: "\${action}"\`);
              }
              parentWindow.postMessage({ type: 'interaction-success', requestId, message: \`Action "\${action}" on "\${selector}" was successful.\` }, '*');
          } catch (e) {
              parentWindow.postMessage({ type: 'interaction-error', requestId, message: e.message }, '*');
          }
      };

      // --- Virtualization & Proxy Logic ---
      (function() {
          const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
              const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
          });

          const pendingRequests = new Map();
          window.addEventListener('message', (event) => {
              const { type, requestId, response, error, payload } = event.data;
              if (type === 'proxy-fetch-response' || type === 'virtual-storage-response') {
                  if (pendingRequests.has(requestId)) {
                      const { resolve, reject } = pendingRequests.get(requestId);
                      pendingRequests.delete(requestId);
                      if (error) {
                          reject(new Error(error.message));
                      } else {
                          resolve(response || payload);
                      }
                  }
              }
          });

          function postToParent(type, storageKey, api, payload) {
              return new Promise((resolve, reject) => {
                  const requestId = uuid();
                  pendingRequests.set(requestId, { resolve, reject });
                  parent.postMessage({ type, requestId, storageKey, api, payload }, '*');
              });
          }

          function proxyFetch(input, init) {
              const url = input instanceof Request ? input.url : String(input);
              const absoluteUrl = new URL(url, this.location.href).href;
              if (!absoluteUrl.startsWith('http')) return this._originalFetch.apply(this, arguments);
              
              const serializableInit = init ? {
                  method: init.method,
                  headers: init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers,
                  body: typeof init.body === 'string' ? init.body : undefined,
                  mode: init.mode, credentials: init.credentials, cache: init.cache,
                  redirect: init.redirect, referrerPolicy: init.referrerPolicy,
              } : undefined;

              return postToParent('proxy-fetch', null, null, { url: absoluteUrl, options: serializableInit })
                  .then(response => new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers }));
          }

          function createLocalStorageProxy(storageKey) {
              let storage = {};
              postToParent('virtual-storage-request', storageKey, 'localStorage', { method: 'init' })
                  .then(response => { storage = response.data || {}; console.log(\`[Virtual LS] Initialized for \${storageKey}\`); })
                  .catch(e => console.error(\`[Virtual LS] Init failed for \${storageKey}:\`, e));

              return new Proxy({}, {
                  get(target, prop) {
                      if (prop === 'getItem') return (key) => storage[key] ?? null;
                      if (prop === 'setItem') return (key, value) => {
                          const strValue = String(value);
                          storage[key] = strValue;
                          postToParent('virtual-storage-request', storageKey, 'localStorage', { method: 'setItem', key, value: strValue }).catch(console.error);
                      };
                      if (prop === 'removeItem') return (key) => {
                          delete storage[key];
                          postToParent('virtual-storage-request', storageKey, 'localStorage', { method: 'removeItem', key }).catch(console.error);
                      };
                      if (prop === 'clear') return () => {
                          storage = {};
                          postToParent('virtual-storage-request', storageKey, 'localStorage', { method: 'clear' }).catch(console.error);
                      };
                      if (prop === 'length') return Object.keys(storage).length;
                      if (prop === 'key') return (index) => Object.keys(storage)[index] || null;
                      return storage[prop];
                  },
                  set(target, prop, value) {
                      const strValue = String(value);
                      storage[prop] = strValue;
                      postToParent('virtual-storage-request', storageKey, 'localStorage', { method: 'setItem', key: prop, value: strValue }).catch(console.error);
                      return true;
                  },
                  deleteProperty(target, prop) {
                      delete storage[prop];
                      postToParent('virtual-storage-request', storageKey, 'localStorage', { method: 'removeItem', key: prop }).catch(console.error);
                      return true;
                  },
                  ownKeys() { return Object.keys(storage); },
                  getOwnPropertyDescriptor(target, prop) { return { value: storage[prop], writable: true, enumerable: true, configurable: true }; }
              });
          }

          function createIndexedDBProxy(storageKey) {
            return {
                open: function(dbName, dbVersion) {
                    const mockRequest = new EventTarget();
                    mockRequest.readyState = 'pending';
                    postToParent('virtual-storage-request', storageKey, 'indexedDB', { method: 'open', dbName, dbVersion })
                        .then(response => {
                            if (response.event === 'upgradeneeded') {
                                mockRequest.dispatchEvent(new CustomEvent('upgradeneeded', { detail: response }));
                            }
                            mockRequest.result = { name: response.result.name, version: response.result.version };
                            mockRequest.readyState = 'done';
                            mockRequest.dispatchEvent(new Event('success'));
                        }).catch(e => {
                            mockRequest.error = e;
                            mockRequest.readyState = 'done';
                            mockRequest.dispatchEvent(new Event('error'));
                        });
                    return mockRequest;
                },
                deleteDatabase: function(dbName) { /* Proxy logic here */ }
            };
          }

          function getStorageKeyForIframe(iframe) {
              try {
                  if (iframe.src && iframe.src !== 'about:blank') {
                      return new URL(iframe.src).origin;
                  }
              } catch (e) {
                  // Invalid URL in src, ignore
              }
              return iframe.dataset.vibeId || 'vibe-iframe-unknown-' + uuid();
          }

          function patchWindow(win, storageKey) {
              if (!win || win._vibePatched === storageKey) return;
              win._originalFetch = win.fetch;
              win.fetch = proxyFetch.bind(win);
              Object.defineProperty(win, 'localStorage', { value: createLocalStorageProxy(storageKey), writable: false, configurable: true });
              Object.defineProperty(win, 'indexedDB', { value: createIndexedDBProxy(storageKey), writable: false, configurable: true });
              win._vibePatched = storageKey;
              console.log(\`[Virtualization] Patched window for storage key: \${storageKey}\`);
          }

          function handleIframe(iframe) {
              iframe.dataset.vibeId = iframe.dataset.vibeId || 'vibe-iframe-' + uuid();
              const attemptPatch = () => {
                  try {
                      if (iframe.contentWindow) {
                          const key = getStorageKeyForIframe(iframe);
                          patchWindow(iframe.contentWindow, key);
                      }
                  } catch (e) {
                      console.warn('[Virtualization] Could not patch cross-origin iframe.', iframe.src, e.message);
                  }
              };
              iframe.addEventListener('load', attemptPatch, { once: true });
              if (iframe.contentWindow) attemptPatch(); // Attempt patch immediately if already available
          }

          const originalCreateElement = document.createElement;
          document.createElement = function(tagName) {
              const element = originalCreateElement.apply(document, arguments);
              if (tagName.toLowerCase() === 'iframe') {
                  handleIframe(element);
              }
              return element;
          };

          const observer = new MutationObserver((mutations) => {
              for (const mutation of mutations) {
                  if (mutation.type === 'childList') {
                      mutation.addedNodes.forEach(node => {
                          if (node.tagName === 'IFRAME') {
                              handleIframe(node);
                          }
                      });
                  } else if (mutation.type === 'attributes' && mutation.attributeName === 'src' && mutation.target.tagName === 'IFRAME') {
                      handleIframe(mutation.target);
                  }
              }
          });

          observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
          patchWindow(window, 'vibe-iframe-main');
      })();

      // --- Main Message Listener ---
      window.addEventListener('message', (event) => {
        if (event.data.type === 'execute') {
            try {
                if(root) root.innerHTML = '';
                eval(event.data.code);
            } catch (err) {
                handleError(err);
            }
        } else if (event.data.type === 'capture-preview-state') {
            handleCaptureState(event);
        } else if (event.data.type === 'interact-with-element') {
            handleInteraction(event);
        }
      }, false);

      window.addEventListener('load', () => {
        parentWindow.postMessage({ type: 'preview-ready' }, '*');
      });
    })();
    </script>
  </body>
</html>
`