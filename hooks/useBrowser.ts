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

  // FIX: Added 'async' keyword. Although the function already returns a promise, making it explicitly async can resolve subtle type inference issues that may cause the reported error.
  const openUrl = useCallback(async (url: string): Promise<void> => {
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
    
    // This IIFE will be executed in the InAppBrowser context and its return value will be passed to the callback.
    const injectionScript = `
    (function() {
        try {
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
            document.querySelectorAll('p, li, blockquote, article, main, pre').forEach(p => {
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
            // Fallback to body text if no structured content was found
            if (!content.trim() && document.body) {
                content = getCleanText(document.body);
            }
            return { result: content };
        } catch (e) {
            return { error: e.message || 'An unknown error occurred during content extraction.' };
        }
    })();`;

    return new Promise((resolve, reject) => {
      // The callback for executeScript receives an array containing the return value of the script.
      browser.executeScript({ code: injectionScript }, (result: any) => {
        if (!result || !result[0]) {
          return reject(new Error("Failed to get page content. The script returned no result."));
        }

        const scriptResult = result[0];
        if (scriptResult.error) {
          return reject(new Error(`Content extraction failed inside browser: ${scriptResult.error}`));
        }
        
        resolve(scriptResult.result);
      });
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
            const el = deepQuerySelector('${selector.replace(/'/g, "\\\\'")}');
            if (!el) return 'Error: Element not found with selector: ${selector.replace(/'/g, "\\\\'")}';
            if ('${action}' === 'click') {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            } else if ('${action}' === 'type') {
                if (typeof el.value !== 'undefined') {
                    el.value = '${(value || '').replace(/'/g, "\\\\'")}';
                } else if (el.isContentEditable) {
                    el.textContent = '${(value || '').replace(/'/g, "\\\\'")}';
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
        // Use a unique key to avoid conflicts if the script is injected multiple times
        const executionKey = 'capture_result_' + Date.now();
        window[executionKey] = { status: 'pending', data: null };

        const finalize = (status, data) => {
            window[executionKey].status = status;
            window[executionKey].data = data;
            // Clean up the script tag
            const scriptTag = document.getElementById('html2canvas_script');
            if (scriptTag) scriptTag.remove();
        };

        const runCapture = () => {
            if (!document.body) {
                return finalize('error', 'Document body not available for capture.');
            }
            try {
                const options = {
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    backgroundColor: window.getComputedStyle(document.body).backgroundColor || '#ffffff'
                };
                // FIX: Cast window to 'any' to access the dynamically loaded html2canvas library, resolving TypeScript errors.
                (window as any).html2canvas(document.documentElement, options).then(canvas => {
                    finalize('success', canvas.toDataURL('image/jpeg', 0.8));
                }).catch(err => {
                    finalize('error', 'html2canvas execution failed: ' + (err.message || 'Unknown error'));
                });
            } catch (e) {
                finalize('error', 'Error initializing html2canvas: ' + e.message);
            }
        };

        // FIX: Cast window to 'any' to access the dynamically loaded html2canvas library, resolving TypeScript errors.
        if (typeof (window as any).html2canvas === 'function') {
            runCapture();
        } else {
            const script = document.createElement('script');
            script.id = 'html2canvas_script';
            script.src = 'https://aistudiocdn.com/html2canvas@^1.4.1';
            script.onload = runCapture;
            script.onerror = () => {
                finalize('error', 'Failed to load html2canvas script from CDN.');
            };
            document.head.appendChild(script);
        }
        
        return executionKey; // Return the key for polling
    })();`;
  
    const pollScript = (key: string) => `(function() { return window['${key}']; })();`;
  
    return new Promise((resolve, reject) => {
      // First, inject the script and get the unique key for this execution.
      browser.executeScript({ code: injectionScript }, (injectionResult: any) => {
        if (!injectionResult || !injectionResult[0]) {
          return reject(new Error("Screenshot script injection failed."));
        }
        const executionKey = injectionResult[0];

        const maxRetries = 20; // 10 seconds timeout
        let retries = 0;
        const pollInterval = setInterval(() => {
          if (retries >= maxRetries) {
            clearInterval(pollInterval);
            // Cleanup the polling property on the window
            browser.executeScript({ code: `delete window['${executionKey}']` });
            return reject(new Error("Timeout waiting for screenshot from browser. The page might have complex content or a strict Content Security Policy."));
          }
          retries++;

          browser.executeScript({ code: pollScript(executionKey) }, (pollResult: any) => {
            const resultObj = pollResult && pollResult[0];
            if (!resultObj || resultObj.status === 'pending') {
              return; // Continue polling
            }

            // Polling is done, clean up
            clearInterval(pollInterval);
            browser.executeScript({ code: `delete window['${executionKey}']` });

            if (resultObj.status === 'error') {
              reject(new Error(`Screenshot failed inside browser: ${resultObj.data}`));
            } else if (resultObj.status === 'success') {
              const base64 = resultObj.data.split(',')[1];
              resolve(base64);
            }
          });
        }, 500);
      });
    });
  }, []);

  return { openUrl, closeBrowser, getPageContent, interactWithPage, captureBrowserScreenshot };
};