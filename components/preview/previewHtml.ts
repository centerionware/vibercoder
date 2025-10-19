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
    "esbuild-wasm": "https://aistudiocdn.com/esbuild-wasm@^0.25.11",
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
      body { margin: 0; background-color: #1a1b26; color: #c0caf5; font-family: sans-serif; }
      #root-error { color: white; padding: 1rem; }
      #root-error h3 { color: #f87171; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
    (function() {
      const root = document.querySelector('#root');
      const parentWindow = window.parent;

      const postLog = (level, message) => {
        parentWindow.postMessage({ type: 'console-message', payload: { type: level, timestamp: Date.now(), message } }, '*');
      };

      const handleError = (err) => {
        const message = err ? (err.stack || err.message || String(err)) : 'An unknown error occurred.';
        if (root) {
            root.innerHTML = '<div id="root-error"><h3>Runtime Error</h3><pre>' + message + '</pre></div>';
        }
        console.error('Error in preview:', err);
      };
      
      // --- Console Capture ---
      const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console),
      };

      const safeStringify = (obj) => {
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) return '[Circular Reference]';
                cache.add(value);
            }
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 2);
      };

      const captureConsole = (level, ...args) => {
        originalConsole[level](...args);
        
        const message = args.map(arg => {
            try {
                if (arg instanceof Error) return \`\${arg.message}\n\${arg.stack}\`;
                if (typeof arg === 'object' && arg !== null) return safeStringify(arg);
                return String(arg);
            } catch (e) {
                return '[Unserializable object]';
            }
        }).join(' ');
        
        postLog(level, message);
      };

      console.log = (...args) => captureConsole('log', ...args);
      console.warn = (...args) => captureConsole('warn', ...args);
      console.error = (...args) => captureConsole('error', ...args);
      console.info = (...args) => captureConsole('log', ...args); // Treat info as log
      
      window.addEventListener('error', (event) => {
          const message = event.error ? (event.error.stack || event.error.message) : event.message;
          postLog('error', message);
      });
      window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason;
          const message = reason ? (reason.stack || reason.message || String(reason)) : 'Unhandled promise rejection';
          postLog('error', \`Unhandled Rejection: \${message}\`);
      });

      // --- Fetch Hijacking ---
      const hijackFetch = (win) => {
          if (win.fetch.name === 'proxiedFetch') { return; }
          const original = win.fetch;

          win.fetch = async function proxiedFetch(resource, options) {
              const url = resource instanceof Request ? resource.url : resource;

              if (typeof url !== 'string' || !url.startsWith('http')) {
                  return original.apply(win, arguments);
              }

              try {
                  const requestId = 'proxy-' + Math.random().toString(36).substr(2, 9);
                  
                  const responsePromise = new Promise((resolve, reject) => {
                      const timeout = setTimeout(() => {
                        window.removeEventListener('message', messageHandler);
                        reject(new Error(\`Proxy fetch timed out for \${url}\`));
                      }, 20000);

                      const messageHandler = (event) => {
                          const { type, requestId: responseId, payload, error } = event.data;
                          if (responseId !== requestId) return;
                          
                          clearTimeout(timeout);
                          window.removeEventListener('message', messageHandler);

                          if (type === 'proxy-fetch-response') resolve(payload);
                          else if (type === 'proxy-fetch-error') reject(new Error(error));
                      };
                      window.addEventListener('message', messageHandler);
                  });
                  
                  let bodyToSend = options?.body;
                  const transferable = [];
                  if (bodyToSend instanceof Blob) {
                      bodyToSend = await bodyToSend.arrayBuffer();
                  }
                  if (bodyToSend instanceof ArrayBuffer) {
                      transferable.push(bodyToSend);
                  }

                  parentWindow.postMessage({
                      type: 'proxy-fetch',
                      requestId,
                      payload: { url, options: { ...options, body: bodyToSend } }
                  }, '*', transferable);

                  const responseData = await responsePromise;
                  return new Response(responseData.body, {
                      status: responseData.status,
                      statusText: responseData.statusText,
                      headers: responseData.headers,
                  });
              } catch (err) {
                  postLog('error', \`Fetch proxy failed for \${url}: \${err.message}\`);
                  throw err;
              }
          };
      };

      try {
        hijackFetch(window);
      } catch(e) {
        postLog('error', \`Failed to hijack top-level fetch: \${e.message}\`);
      }

      const observer = new MutationObserver((mutationsList) => {
          for (const mutation of mutationsList) {
              if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(node => {
                      if (node.tagName === 'IFRAME') {
                          const iframeNode = node;
                          const attemptHijack = () => {
                            try {
                                if (iframeNode.contentWindow) {
                                    hijackFetch(iframeNode.contentWindow);
                                    postLog('log', \`Hijacked fetch in new iframe: \${iframeNode.src || '(no src)'}\`);
                                }
                            } catch (e) {
                                postLog('warn', \`Could not hijack fetch in cross-origin iframe: \${e.message}\`);
                            }
                          };
                          iframeNode.addEventListener('load', attemptHijack);
                          if(iframeNode.contentWindow) attemptHijack();
                      }
                  });
              }
          }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });


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