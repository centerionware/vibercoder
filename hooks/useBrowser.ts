import { useCallback, useRef } from 'react';
import { BrowserControls } from '../types';

export const useBrowser = (): BrowserControls => {
  const browserInstanceRef = useRef<any>(null);
  const pendingUrlRef = useRef<string | null>(null);

  // This is the single source of truth for opening a browser.
  // It's called either when openUrl is triggered and no browser is open,
  // or by the 'exit' event listener of a closing browser.
  const openPendingUrl = useCallback(() => {
    const urlToOpen = pendingUrlRef.current;
    if (!urlToOpen || browserInstanceRef.current) {
      // Don't open if there's no pending URL or if a browser is somehow already open.
      return;
    }
    
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!inAppBrowserPlugin?.open) {
      console.error("InAppBrowser plugin not available.");
      return;
    }

    // We are about to handle this URL, so clear it from the pending ref.
    pendingUrlRef.current = null;
    
    const browser = inAppBrowserPlugin.open(urlToOpen, '_blank', 'location=yes');
    browserInstanceRef.current = browser;

    const onExit = () => {
      // Clean up our reference to the closed browser.
      if (browserInstanceRef.current === browser) {
        browserInstanceRef.current = null;
      }
      
      // After closing, immediately check if another URL was requested while this one was open.
      // If so, open it. This creates the reliable "close-then-open" behavior.
      openPendingUrl();
      
      // Make sure to remove the listener to avoid memory leaks
      browser.removeEventListener('exit', onExit);
      browser.removeEventListener('loaderror', onLoadError);
    };

    const onLoadError = (params: any) => {
      console.error('InAppBrowser load error:', params);
      alert(`Failed to load URL: ${params.message}`);
    };

    browser.addEventListener('exit', onExit);
    browser.addEventListener('loaderror', onLoadError);
  }, []); // Empty dependency array means this function is stable.

  const openUrl = useCallback((url: string) => {
    // Always set the latest requested URL.
    pendingUrlRef.current = url;

    if (browserInstanceRef.current) {
      // If a browser is already open, close it. The 'onExit' handler will take care of opening the pending URL.
      browserInstanceRef.current.close();
    } else {
      // If no browser is open, we can proceed to open the pending URL immediately.
      openPendingUrl();
    }
  }, [openPendingUrl]);

  const closeBrowser = useCallback(() => {
    // If the user explicitly closes the browser, we cancel any pending URL that was scheduled to open next.
    pendingUrlRef.current = null;
    if (browserInstanceRef.current) {
      browserInstanceRef.current.close();
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