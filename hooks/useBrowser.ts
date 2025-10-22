import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);

  const openUrl = useCallback(async (url: string) => {
    // If a browser is already open, create a promise that resolves when it's closed.
    if (browserInstanceRef.current) {
      const closePromise = new Promise<void>(resolve => {
        const browserToClose = browserInstanceRef.current;
        
        // Define a one-time exit handler for the old browser.
        const onExit = () => {
          browserToClose.removeEventListener('exit', onExit); // Self-cleanup
          // Check if the ref still points to the browser we intended to close.
          if (browserInstanceRef.current === browserToClose) {
            browserInstanceRef.current = null;
          }
          resolve();
        };

        browserToClose.addEventListener('exit', onExit);
        browserToClose.close();
      });
      // Wait for the old browser to fully close before proceeding.
      await closePromise;
    }

    // At this point, we are guaranteed that browserInstanceRef.current is null.
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!inAppBrowserPlugin?.open) {
      console.error("InAppBrowser plugin not available.");
      return;
    }
    
    const browser = inAppBrowserPlugin.open(url, '_blank', 'location=yes');
    browserInstanceRef.current = browser;

    // Define the exit handler for this new browser instance.
    const onExit = () => {
      browser.removeEventListener('exit', onExit); // Self-cleanup
      // When this new browser closes, just null out the ref if it matches.
      if (browserInstanceRef.current === browser) {
        browserInstanceRef.current = null;
      }
    };
    
    // Define an error handler for this new browser instance.
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