import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { BrowserControls } from '../types';

// 1. Define the interface for our native plugin
interface AideBrowserPlugin {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
  executeScript<T>(options: { code: string }): Promise<{ value: T }>;
  addListener(eventName: 'pageLoaded', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listenerFunc: () => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// 2. Register the plugin with Capacitor. This is the bridge to our native code.
const AideBrowser = registerPlugin<AideBrowserPlugin>('AideBrowser');

interface BrowserState {
  isOpen: boolean;
  currentUrl: string;
  isLoading: boolean;
}

export const useBrowser = () => {
  const [state, setState] = useState<BrowserState>({
    isOpen: false,
    currentUrl: 'about:blank',
    isLoading: false,
  });
  const listenersRef = useRef<PluginListenerHandle[]>([]);

  const isPluginAvailable = () => Capacitor.isNativePlatform();

  const removeAllListeners = useCallback(async () => {
    // Remove listeners from the web side
    for(const listener of listenersRef.current) {
        await listener.remove();
    }
    listenersRef.current = [];
    // Also ask the native plugin to clean up its side to prevent leaks
    if (isPluginAvailable()) {
        try {
            await AideBrowser.removeAllListeners();
        } catch (e) {
            console.warn("Could not ask plugin to remove all listeners; it may not be initialized yet.", e);
        }
    }
  }, []);

  // Ensure listeners are cleaned up when the hook unmounts
  useEffect(() => {
    return () => {
      removeAllListeners();
    };
  }, [removeAllListeners]);

  const openUrl = useCallback(async (url: string): Promise<void> => {
    if (!isPluginAvailable()) {
      throw new Error("The native browser tool is only available in the Capacitor mobile app.");
    }

    // Clean up any existing listeners before opening a new instance
    await removeAllListeners();

    setState({ isOpen: true, isLoading: true, currentUrl: url });

    // Set up new listeners for the new browser instance
    const pageLoadedHandle = await AideBrowser.addListener('pageLoaded', () => {
        setState(prev => ({ ...prev, isLoading: false }));
    });
    const closedHandle = await AideBrowser.addListener('closed', () => {
        setState({ isOpen: false, isLoading: false, currentUrl: 'about:blank' });
        removeAllListeners(); // Clean up everything after the browser is confirmed closed
    });
    listenersRef.current.push(pageLoadedHandle, closedHandle);

    try {
        await AideBrowser.open({ url });
    } catch (e) {
        // If the native `open` call fails, clean up the state and listeners immediately
        setState({ isOpen: false, isLoading: false, currentUrl: 'about:blank' });
        await removeAllListeners();
        throw e; // Re-throw the error for the tool orchestrator to handle
    }
  }, [removeAllListeners]);

  const closeBrowser = useCallback(async () => {
    if (!isPluginAvailable() || !state.isOpen) return;
    await AideBrowser.close();
    // The 'closed' event listener handles the actual state cleanup, ensuring a consistent state.
  }, [state.isOpen]);

  const executeScript = useCallback(async <T,>(code: string): Promise<T> => {
    if (!isPluginAvailable() || !state.isOpen) {
      throw new Error("Cannot execute script: browser is not open.");
    }
    // The native plugin will return an object like { value: ... }
    const { value } = await AideBrowser.executeScript<T>({ code });
    return value;
  }, [state.isOpen]);

  const getPageContent = useCallback(async (): Promise<string> => {
    return await executeScript<string>("document.body.innerText");
  }, [executeScript]);
  
  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
     const escapedSelector = selector.replace(/'/g, "\\'");
     const escapedValue = value?.replace(/'/g, "\\'") || '';

     // This more robust script simulates user events more accurately.
     const script = `
        (() => { // Wrap in an IIFE to avoid polluting global scope
            try {
                const el = document.querySelector('${escapedSelector}');
                if (!el) {
                    return 'Error: Element with selector "${escapedSelector}" not found';
                }

                if ('${action}' === 'click') {
                    // Dispatching a real MouseEvent is more reliable than .click()
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    el.dispatchEvent(clickEvent);
                } else if ('${action}' === 'type') {
                    if (typeof el.value === 'undefined') {
                        return 'Error: Element does not have a value property to type into.';
                    }
                    el.focus();
                    el.value = '${escapedValue}';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.blur();
                } else {
                    return 'Error: Unsupported action "${action}"';
                }
                
                return 'Success'; // Return a success message
            } catch (e) { 
                return 'Error: ' + e.message; // Return a descriptive error message
            }
        })(); // Immediately execute
     `;
     const result = await executeScript<string>(script);
     if (result.startsWith('Error:')) {
         throw new Error(result.substring(7)); // Remove 'Error: ' prefix and throw
     }
     return result;
  }, [executeScript]);

  const captureBrowserScreenshot = useCallback(async (): Promise<string> => {
     const script = `
        (async () => {
            try {
                if (typeof html2canvas === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://aistudiocdn.com/html2canvas@^1.4.1';
                    document.head.appendChild(script);
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = () => reject(new Error('Failed to load html2canvas library into browser context'));
                    });
                }
                const canvas = await html2canvas(document.body, { useCORS: true, allowTaint: true });
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