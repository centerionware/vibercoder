
import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);

  const openUrl = useCallback((url: string): Promise<void> => {
    // This promise wrapper handles the async nature of opening/navigating the browser.
    return new Promise<void>((resolve, reject) => {
      const existingBrowser = browserInstanceRef.current;

      // Define event handlers for this specific operation.
      const cleanupListeners = (browser: any) => {
        browser.removeEventListener('loadstop', onLoadStop);
        browser.removeEventListener('loaderror', onLoadError);
        browser.removeEventListener('exit', onExitDuringLoad);
      };

      const onLoadStop = (event: any) => {
        console.log(`InAppBrowser finished loading: ${event.url}`);
        cleanupListeners(event.target);
        resolve(); // Resolve immediately. Content readiness is getPageContent's job.
      };

      const onLoadError = (params: any) => {
        console.error('InAppBrowser load error:', params);
        cleanupListeners(params.target);
        if (!existingBrowser) { // If it was a new browser that failed
            params.target.close();
            browserInstanceRef.current = null;
        }
        reject(new Error(`Failed to load URL: ${params.message}`));
      };

      // Handles the case where the user closes the browser *during* this specific load operation.
      const onExitDuringLoad = (event: any) => {
          console.log('InAppBrowser exited before load completed.');
          cleanupListeners(event.target);
          if (browserInstanceRef.current === event.target) {
              browserInstanceRef.current = null;
          }
          reject(new Error("Browser was closed before the page finished loading."));
      };

      if (existingBrowser) {
        // --- Case 1: Browser already open, just navigate ---
        console.log(`Navigating existing InAppBrowser to: ${url}`);
        existingBrowser.addEventListener('loadstop', onLoadStop);
        existingBrowser.addEventListener('loaderror', onLoadError);
        existingBrowser.addEventListener('exit', onExitDuringLoad);
        existingBrowser.executeScript({ code: `window.location.href = "${url}"` });
      } else {
        // --- Case 2: No browser open, create a new one ---
        const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
        if (!inAppBrowserPlugin?.open) {
          return reject(new Error("InAppBrowser plugin not available."));
        }
        
        console.log(`Opening new InAppBrowser for URL: ${url}`);
        const newBrowser = inAppBrowserPlugin.open(url, '_blank', 'location=yes');
        browserInstanceRef.current = newBrowser;

        // Attach listeners for this initial load operation
        newBrowser.addEventListener('loadstop', onLoadStop);
        newBrowser.addEventListener('loaderror', onLoadError);
        newBrowser.addEventListener('exit', onExitDuringLoad);

        // Attach a SINGLE, PERSISTENT listener for when the browser is closed at any time.
        newBrowser.addEventListener('exit', () => {
            console.log('InAppBrowser was closed.');
            // Check if the ref still holds this instance before nullifying.
            if (browserInstanceRef.current === newBrowser) {
                browserInstanceRef.current = null;
            }
        });
      }
    });
  }, []);

  const closeBrowser = useCallback(() => {
    if (browserInstanceRef.current) {
      browserInstanceRef.current.close();
      // The 'exit' event handler will nullify the ref.
    }
  }, []);

  const getPageContent = useCallback((): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to get content from."));
    }

    const injectionScript = `
    (function() {
        if (window.__get_content_in_progress) return;
        window.__get_content_in_progress = true;
        delete window.__page_content_result;
        delete window.__page_content_error;

        function extractContent() {
            let content = '';
            if (document.title) {
                content += 'Page Title: ' + document.title + '\\n\\n';
            }
            const getCleanText = (node) => (node.innerText || '').trim().replace(/\\s{2,}/g, ' ');
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
                const text = getCleanText(h);
                if (text) {
                    const level = parseInt(h.tagName.substring(1), 10);
                    content += '#'.repeat(level) + ' ' + text + '\\n';
                }
            });
            document.querySelectorAll('p, li, blockquote').forEach(p => {
                const text = getCleanText(p);
                if (text) content += text + '\\n\\n';
            });
            document.querySelectorAll('a[href]').forEach(a => {
                const text = getCleanText(a);
                const href = a.href;
                if (text && href && href.startsWith('http')) {
                    content += '[Link: ' + text + '](' + href + ')\\n';
                }
            });
            if (!content.trim() && document.body) {
                content = getCleanText(document.body);
            }
            return content;
        }

        let attempts = 0;
        const maxAttempts = 5;
        const interval = 500;

        function tryExtract() {
            try {
                const content = extractContent();
                if (content && content.trim().length > 100) {
                    window.__page_content_result = content;
                    window.__get_content_in_progress = false;
                } else {
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(tryExtract, interval);
                    } else {
                        window.__page_content_result = content; // Store whatever was found
                        window.__get_content_in_progress = false;
                    }
                }
            } catch (e) {
                window.__page_content_error = e.message || 'Unknown extraction error';
                window.__get_content_in_progress = false;
            }
        }
        
        tryExtract();
    })();`;
  
    const pollScript = `(function() { return { result: window.__page_content_result, error: window.__page_content_error, inProgress: window.__get_content_in_progress }; })();`;
  
    return new Promise((resolve, reject) => {
      browser.executeScript({ code: injectionScript });
  
      const maxRetries = 15; // ~7.5 seconds timeout
      let retries = 0;
      const pollInterval = setInterval(() => {
        if (retries >= maxRetries) {
          clearInterval(pollInterval);
          reject(new Error("Timeout waiting for page content from browser."));
          return;
        }
        retries++;
  
        browser.executeScript({ code: pollScript }, (result: any) => {
          const pollResult = result && result[0];
          if (!pollResult || pollResult.inProgress) return; // Keep polling if no result object yet or still in progress
  
          if (pollResult.error) {
            clearInterval(pollInterval);
            reject(new Error(`Content extraction failed inside browser: ${pollResult.error}`));
          } else if (typeof pollResult.result === 'string') {
            clearInterval(pollInterval);
            resolve(pollResult.result);
          }
        });
      }, 500);
    });
  }, []);

  const interactWithPage = useCallback((selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to interact with."));
    }

    const code = `
    (function() {
        function deepQuerySelector(sel, root = document) {
            let found = root.querySelector(sel);
            if (found) return found;
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                if (el.shadowRoot) {
                    found = deepQuerySelector(sel, el.shadowRoot);
                    if (found) return found;
                }
            }
            return null;
        }
        try {
            const el = deepQuerySelector('${selector.replace(/'/g, "\\'")}');
            if (!el) return 'Error: Element not found with selector: ${selector.replace(/'/g, "\\'")}';
            if ('${action}' === 'click') {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            } else if ('${action}' === 'type') {
                el.value = '${(value || '').replace(/'/g, "\\'")}';
                el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
            return 'Success';
        } catch(e) {
            return 'Error: ' + e.message;
        }
    })();`;

    return new Promise((resolve, reject) => {
        browser.executeScript({ code }, (result: any[]) => {
            if (result && result[0]) {
                if (result[0].startsWith('Error:')) {
                    reject(new Error(result[0]));
                } else {
                    resolve(result[0]);
                }
            } else {
                reject(new Error("Failed to execute interaction script. The script returned no result."));
            }
        });
    });
  }, []);
  
  const captureBrowserScreenshot = useCallback((): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to capture."));
    }
  
    const injectionScript = `
    (function() {
        if (window.__capture_in_progress) return;
        window.__capture_in_progress = true;
        delete window.__capture_result;
        delete window.__capture_error;
  
        function capture() {
            const options = {
                useCORS: true,
                allowTaint: true,
                backgroundColor: window.getComputedStyle(document.body).backgroundColor || '#1a1b26'
            };
            window.html2canvas(document.documentElement, options).then(canvas => {
                window.__capture_result = canvas.toDataURL('image/jpeg', 0.8);
            }).catch(err => {
                window.__capture_error = err.message || 'Unknown capture error';
            }).finally(() => {
                window.__capture_in_progress = false;
            });
        }
  
        function loadScript(url) {
            const script = document.createElement('script');
            script.src = url;
            script.onload = capture;
            script.onerror = () => {
                window.__capture_error = 'Failed to load html2canvas script.';
                window.__capture_in_progress = false;
            };
            document.head.appendChild(script);
        }
  
        if (typeof window.html2canvas === 'function') {
            capture();
        } else {
            loadScript('https://aistudiocdn.com/html2canvas@^1.4.1');
        }
    })();`;
  
    const pollScript = `(function() { return { result: window.__capture_result, error: window.__capture_error, inProgress: window.__capture_in_progress }; })();`;
  
    return new Promise((resolve, reject) => {
      browser.executeScript({ code: injectionScript });
  
      const maxRetries = 10; // 5 seconds timeout
      let retries = 0;
      const pollInterval = setInterval(() => {
        if (retries >= maxRetries) {
          clearInterval(pollInterval);
          reject(new Error("Timeout waiting for screenshot from browser."));
          return;
        }
        retries++;
  
        browser.executeScript({ code: pollScript }, (result: any) => {
          const pollResult = result && result[0];
          if (!pollResult) return;
  
          if (pollResult.error) {
            clearInterval(pollInterval);
            reject(new Error(`Screenshot failed inside browser: ${pollResult.error}`));
          } else if (pollResult.result) {
            clearInterval(pollInterval);
            const base64 = pollResult.result.split(',')[1];
            resolve(base64);
          }
        });
      }, 500);
    });
  }, []);

  return { openUrl, closeBrowser, getPageContent, interactWithPage, captureBrowserScreenshot };
};
