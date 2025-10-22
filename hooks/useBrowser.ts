import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);

  const closeBrowser = useCallback(() => {
    if (browserInstanceRef.current) {
      try {
        // The 'exit' event listener attached in openUrl will handle nulling the ref.
        browserInstanceRef.current.close();
      } catch (e) {
        console.warn("Error closing InAppBrowser instance:", e);
        // Force nullify if close fails, to prevent a stuck state.
        browserInstanceRef.current = null;
      }
    }
  }, []);

  const openUrl = useCallback((url: string) => {
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!inAppBrowserPlugin?.open) {
      console.error("InAppBrowser plugin is not available. Cannot open URL.");
      alert("Browser functionality is not available in this environment.");
      return;
    }

    const openNewBrowser = (newUrl: string) => {
      const browser = inAppBrowserPlugin.open(newUrl, '_blank', 'location=yes');
      browserInstanceRef.current = browser;

      browser.addEventListener('exit', () => {
        if (browserInstanceRef.current === browser) {
          browserInstanceRef.current = null;
        }
      });

      browser.addEventListener('loaderror', (params: any) => {
          console.error('InAppBrowser load error:', params);
          alert(`Failed to load URL: ${params.message}`);
      });
    };

    if (browserInstanceRef.current) {
      // A browser is already open. We need to close it, and once it's closed, open the new one.
      // The 'exit' event is the signal that it has closed.
      const existingBrowser = browserInstanceRef.current;
      
      // Add a one-time listener to the 'exit' event.
      existingBrowser.addEventListener('exit', () => openNewBrowser(url), { once: true });
      
      // Now, trigger the close.
      existingBrowser.close();
    } else {
      // No browser is open, so we can open one immediately.
      openNewBrowser(url);
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
