import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);

  // This ref holds the URL for the *next* browser to be opened.
  // This ensures that if openUrl is called multiple times while a browser is closing,
  // only the *last* requested URL is opened, preventing a race condition.
  const pendingUrlRef = useRef<string | null>(null);

  const openUrl = useCallback((url: string) => {
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!inAppBrowserPlugin?.open) {
      console.error("InAppBrowser plugin is not available. Cannot open URL.");
      alert("Browser functionality is not available in this environment.");
      return;
    }

    // Set the latest requested URL. This will be opened when the coast is clear.
    pendingUrlRef.current = url;

    // If there's already a browser open, just close it.
    // The 'exit' handler is the single source of truth for what happens next.
    if (browserInstanceRef.current) {
      browserInstanceRef.current.close();
      return;
    }
    
    // If no browser is open, and we have a pending URL, we can open it now.
    const urlToOpen = pendingUrlRef.current;
    if (urlToOpen) {
      // Clear the pending URL since we are now handling it.
      pendingUrlRef.current = null;
      
      const browser = inAppBrowserPlugin.open(urlToOpen, '_blank', 'location=yes');
      browserInstanceRef.current = browser;

      browser.addEventListener('exit', () => {
        // When this browser closes, clean up its reference.
        if (browserInstanceRef.current === browser) {
            browserInstanceRef.current = null;
        }

        // IMPORTANT: After this browser has closed, we check if a new URL was requested
        // in the meantime. If so, we trigger the openUrl logic again.
        // This time, browserInstanceRef.current will be null, and it will open directly.
        if (pendingUrlRef.current) {
            openUrl(pendingUrlRef.current);
        }
      });

      browser.addEventListener('loaderror', (params: any) => {
          console.error('InAppBrowser load error:', params);
          alert(`Failed to load URL: ${params.message}`);
      });
    }
  }, []); // `openUrl` is referenced recursively but useCallback's stable reference handles this.

  const closeBrowser = useCallback(() => {
    // If user manually closes, we clear any pending URL to prevent it from reopening unexpectedly.
    pendingUrlRef.current = null;
    if (browserInstanceRef.current) {
      try {
        browserInstanceRef.current.close();
      } catch (e) {
        console.warn("Error closing InAppBrowser instance:", e);
        browserInstanceRef.current = null;
      }
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
