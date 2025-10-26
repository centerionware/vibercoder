

import { useCallback, useRef, useEffect } from 'react';
import { BrowserControls } from '../types';
import html2canvas from 'html2canvas';

export const useBrowser = (): BrowserControls => {
  const browserRef = useRef<any>(null);
  const isReadyRef = useRef(false);
  const currentOpenPromise = useRef<{ resolve: () => void, reject: (e: Error) => void } | null>(null);
  // NEW: A ref to hold the resolver for anyone waiting for the next page load.
  const pageLoadResolverRef = useRef<{ resolve: () => void, reject: (e: Error) => void } | null>(null);

  const onLoadStart = useCallback(() => {
    console.log('InAppBrowser load started.');
    isReadyRef.current = false;
  }, []);

  const onLoadStop = useCallback(() => {
    console.log('InAppBrowser load finished.');
    isReadyRef.current = true;
    // Resolve the promise for the specific openUrl call, if it exists
    if (currentOpenPromise.current) {
      currentOpenPromise.current.resolve();
      currentOpenPromise.current = null;
    }
    // Resolve the promise for any generic waitForReady call
    if (pageLoadResolverRef.current) {
      pageLoadResolverRef.current.resolve();
      pageLoadResolverRef.current = null;
    }
  }, []);

  const onLoadError = useCallback((params: any) => {
    const error = new Error(params.message || 'Failed to load URL in browser.');
    console.error('InAppBrowser load error:', error.message);
    isReadyRef.current = false;
    // Reject the promise for the specific openUrl call, if it exists
    if (currentOpenPromise.current) {
      currentOpenPromise.current.reject(error);
      currentOpenPromise.current = null;
    }
    // Reject the promise for any generic waitForReady call
    if (pageLoadResolverRef.current) {
      pageLoadResolverRef.current.reject(error);
      pageLoadResolverRef.current = null;
    }
  }, []);
  
  const onExit = useCallback(() => {
    console.log('InAppBrowser exited.');
    const error = new Error("Browser was closed by the user.");
    
    // Reject any outstanding promises
    if (currentOpenPromise.current) {
      currentOpenPromise.current.reject(error);
      currentOpenPromise.current = null;
    }
    if (pageLoadResolverRef.current) {
      pageLoadResolverRef.current.reject(error);
      pageLoadResolverRef.current = null;
    }

    if (browserRef.current) {
      browserRef.current.removeEventListener('loadstart', onLoadStart);
      browserRef.current.removeEventListener('loadstop', onLoadStop);
      browserRef.current.removeEventListener('loaderror', onLoadError);
      browserRef.current.removeEventListener('exit', onExit); // Self-removal but good to be explicit
      browserRef.current = null;
    }
    
    isReadyRef.current = false;
  }, [onLoadStart, onLoadStop, onLoadError]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (browserRef.current) {
        browserRef.current.close();
      }
    };
  }, []);

  const openUrl = useCallback((url: string) => {
    return new Promise<void>((resolve, reject) => {
      // Reject any previous, unfinished openUrl promise
      if (currentOpenPromise.current) {
        currentOpenPromise.current.reject(new Error("A new navigation was initiated before the previous one completed."));
      }
      currentOpenPromise.current = { resolve, reject };

      const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
      if (!inAppBrowserPlugin?.open) {
        return reject(new Error("InAppBrowser plugin not available. This feature is only supported in the native mobile app."));
      }
      
      // If we are about to navigate in an existing browser, there might be something waiting on pageLoadResolverRef.
      // We should reject it because we are starting a new navigation.
      if (browserRef.current && pageLoadResolverRef.current) {
        pageLoadResolverRef.current.reject(new Error("A new `openUrl` call cancelled the wait for the previous page load."));
        pageLoadResolverRef.current = null;
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
      // The onExit handler will do the rest of the cleanup.
    }
  }, []);

  const waitForReady = useCallback((): Promise<void> => {
    if (!browserRef.current) {
        return Promise.reject(new Error("Browser is not open."));
    }

    // If it's already ready, resolve immediately.
    if (isReadyRef.current) {
        return Promise.resolve();
    }

    // If another waitForReady is already pending, reject it. Only one can wait at a time.
    if (pageLoadResolverRef.current) {
        pageLoadResolverRef.current.reject(new Error("A new wait was initiated before the previous one completed."));
    }

    // Otherwise, create a new promise and store its handlers to be called by the event listeners.
    return new Promise((resolve, reject) => {
      pageLoadResolverRef.current = { resolve, reject };
      
      // Add a timeout to prevent infinite waiting
      const timeoutId = setTimeout(() => {
          if (pageLoadResolverRef.current?.resolve === resolve) { // Check if we are still the one waiting
              pageLoadResolverRef.current = null;
              reject(new Error("Timed out waiting for browser page to load."));
          }
      }, 15000); // 15 second timeout
    });
  }, []);
  
  const getPageContent = useCallback(async (): Promise<string> => {
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
  }, []);

  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
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
  }, []);
  
  const captureBrowserScreenshot = useCallback(async (): Promise<string> => {
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
  }, []);

  return { openUrl, closeBrowser, getPageContent, interactWithPage, captureBrowserScreenshot };
};
