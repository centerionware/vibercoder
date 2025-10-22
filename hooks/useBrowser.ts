
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
    
    const scriptExecutionPromise = new Promise<string>((resolve, reject) => {
        browser.executeScript({ code: "document.body.innerText" }, (result: any[]) => {
            // The result is an array. The first element contains the return value of the script.
            if (result && typeof result[0] === 'string') {
                // This correctly handles an empty string for an empty page.
                resolve(result[0]);
            } else if (result && result[0] === null) {
                // This can happen if document.body.innerText is null (unlikely but possible).
                // Treat it as an empty page.
                resolve('');
            }
            else {
                // This case handles script execution failure.
                reject(new Error("Could not retrieve page content. The script may have failed to execute."));
            }
        });
    });

    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for page content script to execute.")), 5000); // 5 second timeout
    });

    return Promise.race([scriptExecutionPromise, timeoutPromise]);
  }, []);

  const interactWithPage = useCallback((selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to interact with."));
    }

    const code = `(function() { try { const el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if (!el) return 'Error: Element not found'; if ('${action}' === 'click') el.click(); else if ('${action}' === 'type') el.value = '${(value || '').replace(/'/g, "\\'")}'; return 'Success'; } catch(e) { return 'Error: ' + e.message; } })();`;

    return new Promise((resolve, reject) => {
        browser.executeScript({ code }, (result: any) => {
            if (result && result[0]) {
                if (result[0].startsWith('Error:')) {
                    reject(new Error(result[0]));
                } else {
                    resolve(result[0]);
                }
            } else {
                reject(new Error("Failed to execute interaction script."));
            }
        });
    });
  }, []);

  return { openUrl, closeBrowser, getPageContent, interactWithPage };
};
