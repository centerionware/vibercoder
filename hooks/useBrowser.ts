import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);

  const openUrl = useCallback(async (url: string) => {
    // 1. If a browser is already open, close it and wait for confirmation.
    if (browserInstanceRef.current) {
      const browserToClose = browserInstanceRef.current;
      
      // Create a promise that resolves when the 'exit' event fires.
      // Using { once: true } ensures this is a clean, one-time listener
      // that won't interfere with other handlers.
      const closePromise = new Promise<void>(resolve => {
        browserToClose.addEventListener('exit', resolve, { once: true });
      });
      
      // Initiate the close operation.
      browserToClose.close();
      
      // Wait for the 'exit' event to confirm the browser is fully closed.
      await closePromise;
    }

    // 2. Now, open the new browser. We are guaranteed the old one is gone.
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!inAppBrowserPlugin?.open) {
      console.error("InAppBrowser plugin not available.");
      return;
    }
    
    const browser = inAppBrowserPlugin.open(url, '_blank', 'location=yes');
    browserInstanceRef.current = browser;

    // 3. Attach a single, persistent 'exit' handler for this new browser instance.
    const onExit = () => {
      // Clean up the listener itself.
      browser.removeEventListener('exit', onExit);
      
      // Only null out the ref if it's still pointing to THIS browser.
      // This prevents a delayed 'exit' event from an old, closed browser
      // from incorrectly nulling out the ref for a newer, active browser.
      if (browserInstanceRef.current === browser) {
        browserInstanceRef.current = null;
      }
    };
    
    const onLoadError = (params: any) => {
      console.error('InAppBrowser load error:', params);
      alert(`Failed to load URL: ${params.message}`);
      browser.removeEventListener('loaderror', onLoadError); // Self-cleanup
    };

    browser.addEventListener('exit', onExit);
    browser.addEventListener('loaderror', onLoadError);

  }, []); // This useCallback has no dependencies and is stable.

  const closeBrowser = useCallback(() => {
    if (browserInstanceRef.current) {
      browserInstanceRef.current.close();
      // The 'onExit' handler attached in openUrl will handle cleaning up the ref.
    }
  }, []);

  const getPageContent = useCallback((): Promise<string> => {
    const browser = browserInstanceRef.current;
    if (!browser) {
      return Promise.reject(new Error("No active browser instance to get content from."));
    }
    
    return new Promise((resolve, reject) => {
        browser.executeScript({ code: "document.body.innerText" }, (result: any) => {
            if (result && result[0]) {
                resolve(result[0]);
            } else {
                reject(new Error("Could not retrieve page content."));
            }
        });
    });
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
