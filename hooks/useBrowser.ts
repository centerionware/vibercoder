
import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);

  const openUrl = useCallback(async (url: string): Promise<void> => {
    // --- Case 1: Browser already open, just navigate ---
    if (browserInstanceRef.current) {
      console.log(`InAppBrowser already open. Navigating to: ${url}`);
      const browser = browserInstanceRef.current;
      
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            browser.removeEventListener('loadstop', onLoadStop);
            browser.removeEventListener('loaderror', onLoadError);
        };

        const onLoadStop = () => {
          console.log(`InAppBrowser finished navigating to: ${url}`);
          cleanup();
          resolve();
        };

        const onLoadError = (params: any) => {
          console.error('InAppBrowser navigation error:', params);
          cleanup();
          reject(new Error(`Failed to navigate to URL: ${params.message}`));
        };
        
        browser.addEventListener('loadstop', onLoadStop);
        browser.addEventListener('loaderror', onLoadError);
        browser.executeScript({ code: `window.location.href = "${url}"` });
      });
    }
    
    // --- Case 2: No browser open, create a new one ---
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!inAppBrowserPlugin?.open) {
      throw new Error("InAppBrowser plugin not available.");
    }
    
    return new Promise((resolve, reject) => {
        console.log(`Opening new InAppBrowser for URL: ${url}`);
        const browser = inAppBrowserPlugin.open(url, '_blank', 'location=yes');
        browserInstanceRef.current = browser;

        const cleanup = () => {
            browser.removeEventListener('loadstop', onLoadStop);
            browser.removeEventListener('loaderror', onLoadError);
            browser.removeEventListener('exit', onEarlyExit);
        };

        // This is the main exit handler for the lifetime of this browser instance.
        // It cleans up the ref.
        const onPersistentExit = () => {
            console.log('InAppBrowser exited.');
            if (browserInstanceRef.current === browser) {
                browserInstanceRef.current = null;
            }
        };

        const onLoadStop = () => {
            console.log(`InAppBrowser loaded initial URL: ${url}`);
            cleanup();
            // Now that it's loaded, attach the persistent exit handler.
            browser.addEventListener('exit', onPersistentExit, { once: true });
            resolve();
        };

        const onLoadError = (params: any) => {
            console.error('InAppBrowser initial load error:', params);
            cleanup();
            // Close the failed browser and clean up the ref
            browser.close(); 
            browserInstanceRef.current = null;
            reject(new Error(`Failed to load URL: ${params.message}`));
        };

        // This handler is ONLY for the case where the user closes the browser *before* it finishes loading.
        const onEarlyExit = () => {
            console.log('InAppBrowser exited before loading completed.');
            cleanup();
            browserInstanceRef.current = null;
            reject(new Error("Browser was closed before the page finished loading."));
        };

        browser.addEventListener('loadstop', onLoadStop);
        browser.addEventListener('loaderror', onLoadError);
        browser.addEventListener('exit', onEarlyExit);
    });
  }, []);

  const closeBrowser = useCallback(() => {
    if (browserInstanceRef.current) {
      browserInstanceRef.current.close();
      // The onPersistentExit handler will take care of nullifying the ref.
    }
  }, []);

  const getPageContent = useCallback((): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to get content from."));
    }

    // This script provides a cleaner text representation by removing scripts/styles.
    const code = `
    (function() {
        try {
            const clone = document.body.cloneNode(true);
            clone.querySelectorAll('script, style, noscript, svg, [aria-hidden="true"]').forEach(el => el.remove());
            return clone.textContent || '';
        } catch (e) {
            // Fallback for simple text content if cloning fails
            return document.body.innerText || '';
        }
    })();`;
    
    const scriptExecutionPromise = new Promise<string>((resolve, reject) => {
        browser.executeScript({ code }, (result: any[]) => {
            if (result && typeof result[0] === 'string') {
                resolve(result[0]);
            } else if (result && result[0] === null) {
                resolve('');
            }
            else {
                reject(new Error("Could not retrieve page content. The script may have failed to execute."));
            }
        });
    });

    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for page content script to execute.")), 5000);
    });

    return Promise.race([scriptExecutionPromise, timeoutPromise]);
  }, []);

  const interactWithPage = useCallback((selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to interact with."));
    }

    // This injected script includes a Shadow DOM-piercing selector and dispatches proper events for robust interaction.
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
            if (!el) {
                return 'Error: Element not found with selector: ${selector.replace(/'/g, "\\'")}';
            }
            
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

  return { openUrl, closeBrowser, getPageContent, interactWithPage };
};
