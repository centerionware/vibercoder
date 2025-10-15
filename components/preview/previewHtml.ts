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
      const handleError = (err) => {
        const root = document.querySelector('#root');
        const message = err ? (err.message || String(err)) : 'An unknown error occurred.';
        if (root) {
            root.innerHTML = '<div id="root-error"><h3>Runtime Error</h3><pre>' + message + '</pre></div>';
        }
        console.error('Error in preview:', err);
        window.parent.postMessage({ type: 'runtime-error', error: message }, '*');
      };
      
      window.addEventListener('error', (event) => handleError(event.error));
      window.addEventListener('unhandledrejection', (event) => handleError(event.reason));

      const handleCaptureState = (event) => {
        const videoEl = document.querySelector('video');
        const styles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
                           .map(el => el.outerHTML)
                           .join('');
        const payload = {
            htmlContent: styles + document.body.outerHTML,
            videoFrameDataUrl: null,
            videoFrameRect: null,
        };

        if (videoEl && videoEl.readyState >= 2) { // HAVE_CURRENT_DATA
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                payload.videoFrameDataUrl = canvas.toDataURL();
                // Bounding rect needs to be serialized as it's not a plain object
                payload.videoFrameRect = JSON.parse(JSON.stringify(videoEl.getBoundingClientRect()));
            }
        }
        
        window.parent.postMessage({
            type: 'preview-state-captured',
            requestId: event.data.requestId,
            payload: payload
        }, '*');
      };

      const handleInteraction = (event) => {
        try {
            const { selector, action, value } = event.data.payload;
            const element = document.querySelector(selector);
            if (!element) {
                throw new Error('Element with selector "' + selector + '" not found.');
            }
            switch(action) {
                case 'click':
                    element.click();
                    break;
                case 'type':
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
                    throw new Error('Unsupported action: "' + action + '".');
            }
            window.parent.postMessage({ type: 'interaction-success', requestId: event.data.requestId, message: "Successfully performed '" + action + "' on '" + selector + "'." }, '*');
        } catch (err) {
             window.parent.postMessage({ type: 'interaction-error', requestId: event.data.requestId, message: err.message }, '*');
        }
      };

      window.addEventListener('message', (event) => {
        const rootEl = document.getElementById('root');

        const waitForContentAndRun = (actionFn) => {
            let attempts = 0;
            const maxAttempts = 20; // Try for 2 seconds
            const interval = 100;

            const checkContent = () => {
                // Check if root has children, significant innerHTML, or if an error is displayed
                if (rootEl && (rootEl.children.length > 0 || rootEl.innerHTML.length > 100 || document.getElementById('root-error'))) {
                    actionFn(event);
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(checkContent, interval);
                } else {
                    console.warn('Timed out waiting for preview content, running action anyway.');
                    actionFn(event);
                }
            };
            checkContent();
        };

        if (event.data.type === 'execute') {
            try {
                if(rootEl) rootEl.innerHTML = ''; // Clear previous content/errors
                eval(event.data.code);
            } catch (err) {
                handleError(err);
            }
        } else if (event.data.type === 'capture-preview-state') {
            waitForContentAndRun(handleCaptureState);
        } else if (event.data.type === 'interact-with-element') {
            waitForContentAndRun(handleInteraction);
        }
      }, false);

      // Inform the parent window that the iframe is loaded and ready.
      window.addEventListener('load', () => {
        window.parent.postMessage({ type: 'preview-ready' }, '*');
      });
    </script>
  </body>
</html>
`
