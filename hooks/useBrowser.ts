import { useCallback, useRef, useEffect } from 'react';
import { BrowserControls } from '../types';
import html2canvas from 'html2canvas';

export const useBrowser = (): BrowserControls => {
  const browserRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const currentOpenPromise = useRef<{ resolve: () => void, reject: (e: Error) => void } | null>(null);

  const onLoadStart = useCallback(() => {
    console.log('InAppBrowser load started.');
    isReadyRef.current = false;
  }, []);

  const onLoadStop = useCallback(() => {
    console.log('InAppBrowser load finished.');
    isReadyRef.current = true;
    if (currentOpenPromise.current) {
      currentOpenPromise.current.resolve();
      currentOpenPromise.current = null;
    }
  }, []);

  const onLoadError = useCallback((params: any) => {
    console.error('InAppBrowser load error:', params.message);
    isReadyRef.current = false; // Page did not load correctly
    if (currentOpenPromise.current) {
      currentOpenPromise.current.reject(new Error(params.message || 'Failed to load URL in browser.'));
      currentOpenPromise.current = null;
    }
  }, []);
  
  // FIX: Moved onExit declaration to be after its dependencies but before functions that use it. Removed the circular self-reference from the useCallback dependency array to resolve the "used before its declaration" error. The callback function can still correctly reference itself to remove the event listener.
  const onExit = useCallback(() => {
    console.log('InAppBrowser exited.');
    
    if (currentOpenPromise.current) {
      currentOpenPromise.current.reject(new Error("Browser was closed during navigation."));
      currentOpenPromise.current = null;
    }

    if (browserRef.current) {
      // Explicitly remove all listeners to prevent memory leaks and ensure a clean state
      browserRef.current.removeEventListener('loadstart', onLoadStart);
      browserRef.current.removeEventListener('loadstop', onLoadStop);
      browserRef.current.removeEventListener('loaderror', onLoadError);
      browserRef.current.removeEventListener('exit', onExit);
      browserRef.current = null;
    }
    
    isReadyRef.current = false;
  }, [onLoadStart, onLoadStop, onLoadError]);

  useEffect(() => {
    return () => {
      if (browserRef.current) {
        browserRef.current.close();
      }
    };
  }, []);

  const openUrl = useCallback((url: string) => {
    return new Promise<void>((resolve, reject) => {
      if (currentOpenPromise.current) {
        currentOpenPromise.current.reject(new Error("A new navigation was initiated before the previous one completed."));
      }
      currentOpenPromise.current = { resolve, reject };

      const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
      if (!inAppBrowserPlugin?.open) {
        return reject(new Error("InAppBrowser plugin not available. This feature is only supported in the native mobile app."));
      }

      if (browserRef.current) {
        isReadyRef.current = false;
        browserRef.current.executeScript({ code: `window.location.href = "${url}"` });
      } else {
        isReadyRef.current = false;
        const newBrowser = inAppBrowserPlugin.open(url, '_blank', 'location=yes');
        browserRef.current = newBrowser;
        
        newBrowser.addEventListener('loadstart', onLoadStart);
        newBrowser.addEventListener('loadstop', onLoadStop);
        newBrowser.addEventListener('loaderror', onLoadError);
        newBrowser.addEventListener('exit', onExit);
      }
    });
  }, [onLoadStart, onLoadStop, onLoadError, onExit]);

  const closeBrowser = useCallback(() => {
    if (browserRef.current) {
      browserRef.current.close();
    }
  }, []);

  const waitForReady = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
        const browser = browserRef.current;
        if (!browser) {
            return reject(new Error("Browser is not open."));
        }

        let attempts = 0;
        const maxAttempts = 20; // 10 seconds
        const interval = setInterval(() => {
            if (!browserRef.current) { // Check if browser was closed during polling
                clearInterval(interval);
                reject(new Error("Browser was closed while waiting for it to be ready."));
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                reject(new Error("Timed out waiting for browser page to become ready."));
                return;
            }
            attempts++;
            
            // Inject script to check document.readyState
            browser.executeScript({ code: "document.readyState" }, (result: any[]) => {
                if (result && result[0] === 'complete') {
                    clearInterval(interval);
                    isReadyRef.current = true; // Sync the flag
                    resolve();
                }
            });
        }, 500);
    });
  }, []);
  
  const getPageContent = useCallback(async (): Promise<string> => {
    await waitForReady();
    const browser = browserRef.current;
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
            document.querySelectorAll('p, li, blockquote, article, main').forEach(p => {
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

        try {
            const content = extractContent();
            window.__page_content_result = content;
        } catch (e) {
            window.__page_content_error = e.message || 'Unknown extraction error';
        } finally {
             window.__get_content_in_progress = false;
        }
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
          if (!pollResult || pollResult.inProgress) return;
  
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
  }, [waitForReady]);

  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    await waitForReady();
    const browser = browserRef.current;
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
                if (typeof el.value !== 'undefined') {
                    el.value = '${(value || '').replace(/'/g, "\\'")}';
                } else if (el.isContentEditable) {
                    el.textContent = '${(value || '').replace(/'/g, "\\'")}';
                }
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
  }, [waitForReady]);
  
  const captureBrowserScreenshot = useCallback(async (): Promise<string> => {
    await waitForReady();
    const browser = browserRef.current;
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
  
        function loadScript(url, callback) {
            if (document.querySelector('script[src="' + url + '"]')) {
                callback();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.onload = callback;
            script.onerror = () => {
                window.__capture_error = 'Failed to load html2canvas script.';
                window.__capture_in_progress = false;
            };
            document.head.appendChild(script);
        }
  
        if (typeof window.html2canvas === 'function') {
            capture();
        } else {
            loadScript('https://aistudiocdn.com/html2canvas@^1.4.1', capture);
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
          if (!pollResult || pollResult.inProgress) return;
  
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
  }, [waitForReady]);

  return { openUrl, closeBrowser, getPageContent, interactWithPage, captureBrowserScreenshot };
};
