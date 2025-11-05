import { useState, useCallback, useRef, useEffect } from 'react';
import { BrowserControls } from '../types';
import { Capacitor } from '@capacitor/core';

// Add type definitions for the Cordova InAppBrowser plugin to the window object.
declare global {
  interface Window {
    cordova?: {
      InAppBrowser?: {
        open: (url: string, target: string, options: string) => InAppBrowserRef;
      };
    };
  }
  interface InAppBrowserRef {
    addEventListener: (event: string, callback: (event: any) => void) => void;
    removeEventListener: (event: string, callback: (event: any) => void) => void;
    close: () => void;
    executeScript: (details: { code: string }, callback: (result: any[]) => void) => void;
  }
}

interface BrowserState {
  isOpen: boolean;
  currentUrl: string;
  isLoading: boolean;
}

// This hook now orchestrates the native InAppBrowser.
export const useBrowser = () => {
  const [state, setState] = useState<BrowserState>({
    isOpen: false,
    currentUrl: 'about:blank',
    isLoading: false,
  });
  const browserRef = useRef<InAppBrowserRef | null>(null);

  const isPluginAvailable = () => {
    // The plugin is only available in a native Capacitor environment.
    return Capacitor.isNativePlatform() && window.cordova && window.cordova.InAppBrowser;
  }

  const openUrl = useCallback(async (url: string): Promise<void> => {
    if (!isPluginAvailable()) {
      throw new Error("The native browser is not available in this web-only environment. This tool requires the native mobile app.");
    }

    // If a browser is already open, close it before opening a new one.
    if (browserRef.current) {
      browserRef.current.close();
      browserRef.current = null;
    }

    setState({ isOpen: true, isLoading: true, currentUrl: url });

    // Use the InAppBrowser plugin to open a native web view.
    const ref = window.cordova!.InAppBrowser!.open(url, '_blank', 'location=yes,hidenavigationbuttons=yes,hideurlbar=yes,zoom=no');
    browserRef.current = ref;

    const onLoadStop = () => {
      setState(prev => ({ ...prev, isLoading: false }));
    };

    const onExit = () => {
      // Clean up listeners and state when the user closes the browser.
      ref.removeEventListener('loadstop', onLoadStop);
      ref.removeEventListener('exit', onExit);
      browserRef.current = null;
      setState({ isOpen: false, isLoading: false, currentUrl: 'about:blank' });
    };

    ref.addEventListener('loadstop', onLoadStop);
    ref.addEventListener('exit', onExit);
  }, []);

  const closeBrowser = useCallback(() => {
    if (browserRef.current) {
      browserRef.current.close();
      // The 'exit' event listener will handle the state cleanup.
    }
  }, []);

  // Helper to wrap the callback-based executeScript in a Promise.
  const executeScript = useCallback(<T,>(code: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!browserRef.current) {
        return reject(new Error("Cannot execute script: browser is not open."));
      }
      browserRef.current.executeScript({ code }, (result) => {
        // The result from executeScript is always an array.
        if (result && result.length > 0) {
          resolve(result[0] as T);
        } else {
          resolve(null as T); // Resolve with null if there's no return value from the script.
        }
      });
    });
  }, []);

  const getPageContent = useCallback(async (): Promise<string> => {
    if (!isPluginAvailable()) throw new Error("Native browser not available.");
    // Injects a script to get the page's visible text content.
    return await executeScript<string>("document.body.innerText");
  }, [executeScript]);
  
  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
     if (!isPluginAvailable()) throw new Error("Native browser not available.");
     const script = `
        try {
            const el = document.querySelector('${selector}');
            if (!el) throw new Error('Element not found');
            if ('${action}' === 'click') el.click();
            if ('${action}' === 'type') {
                el.value = '${value || ''}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            'Success';
        } catch (e) { e.message }
     `;
     const result = await executeScript<string>(script);
     if (result !== 'Success') throw new Error(result);
     return result;
  }, [executeScript]);

  const captureBrowserScreenshot = useCallback(async (): Promise<string> => {
     if (!isPluginAvailable()) throw new Error("Native browser not available.");
     
     // This script first injects html2canvas if it's not already there,
     // then uses it to capture the page and return the base64 result.
     const script = `
        (async () => {
            try {
                if (typeof html2canvas === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                    document.head.appendChild(script);
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = () => reject('Failed to load html2canvas');
                    });
                }
                const canvas = await html2canvas(document.body, { useCORS: true });
                // Return just the base64 part of the data URL.
                return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            } catch (e) {
                return 'Error: ' + e.message;
            }
        })();
     `;
     const result = await executeScript<string>(script);
     if (result.startsWith('Error:')) {
         throw new Error(`Screenshot failed in browser: ${result}`);
     }
     return result;
  }, [executeScript]);


  const controls: BrowserControls = { openUrl, closeBrowser, getPageContent, interactWithPage, captureBrowserScreenshot };

  return { state, controls };
};