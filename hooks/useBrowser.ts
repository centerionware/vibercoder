import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { BrowserControls } from '../types';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AideBrowserPlugin {
  open(options: { url: string; bounds: Bounds }): Promise<void>;
  close(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  updateBounds(options: { bounds: Bounds }): Promise<void>;
  executeScript<T>(options: { code: string }): Promise<{ value: T }>;
  removeAllListeners(): Promise<void>;
}

const AideBrowser = registerPlugin<AideBrowserPlugin>('AideBrowser');

interface BrowserState {
  isInitialized: boolean;
  isVisible: boolean;
  currentUrl: string;
}

export const useBrowser = () => {
  const [state, setState] = useState<BrowserState>({
    isInitialized: false,
    isVisible: false,
    currentUrl: 'about:blank',
  });
  const containerRef = useRef<HTMLElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isPluginAvailable = Capacitor.isNativePlatform();

  const updateBounds = useCallback(async () => {
    if (!isPluginAvailable || !containerRef.current || !state.isInitialized) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const bounds = {
      x: rect.left * dpr,
      y: rect.top * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr,
    };
    try {
        await AideBrowser.updateBounds({ bounds });
    } catch(e) {
        console.error("Failed to update browser bounds:", e);
    }
  }, [isPluginAvailable, state.isInitialized]);

  useEffect(() => {
    if (containerRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => {
        updateBounds();
      });
      resizeObserverRef.current.observe(containerRef.current);
    } else {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    }
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [updateBounds]);

  const setContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    if (element) {
        updateBounds();
    }
  }, [updateBounds]);

  const open = useCallback(async (url: string, container: HTMLElement) => {
    if (!isPluginAvailable) {
      throw new Error("The native browser is only available in a Capacitor environment.");
    }
    containerRef.current = container;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const bounds = {
        x: rect.left * dpr,
        y: rect.top * dpr,
        width: rect.width * dpr,
        height: rect.height * dpr,
    };
    await AideBrowser.open({ url, bounds });
    setState({ isInitialized: true, isVisible: true, currentUrl: url });
  }, [isPluginAvailable]);

  const close = useCallback(async () => {
    if (!isPluginAvailable || !state.isInitialized) return;
    await AideBrowser.close();
    setState({ isInitialized: false, isVisible: false, currentUrl: 'about:blank' });
  }, [isPluginAvailable, state.isInitialized]);

  const show = useCallback(async () => {
    if (!isPluginAvailable || !state.isInitialized || state.isVisible) return;
    await updateBounds(); // Ensure bounds are correct before showing
    await AideBrowser.show();
    setState(prev => ({ ...prev, isVisible: true }));
  }, [isPluginAvailable, state.isInitialized, state.isVisible, updateBounds]);

  const hide = useCallback(async () => {
    if (!isPluginAvailable || !state.isInitialized || !state.isVisible) return;
    await AideBrowser.hide();
    setState(prev => ({ ...prev, isVisible: false }));
  }, [isPluginAvailable, state.isInitialized, state.isVisible]);
  
  const executeScript = useCallback(async <T,>(code: string): Promise<T> => {
    if (!isPluginAvailable() || !state.isInitialized) {
      throw new Error("Cannot execute script: browser is not initialized.");
    }
    const { value } = await AideBrowser.executeScript<T>({ code });
    return value;
  }, [state.isInitialized]);

  const getPageContent = useCallback(async (): Promise<string> => {
    return await executeScript<string>("document.body.innerHTML");
  }, [executeScript]);
  
  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
     const escapedSelector = selector.replace(/'/g, "\\'");
     const escapedValue = value?.replace(/'/g, "\\'") || '';
     const script = `
        (() => {
            try {
                const el = document.querySelector('${escapedSelector}');
                if (!el) return 'Error: Element with selector "${escapedSelector}" not found';
                if ('${action}' === 'click') {
                    const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
                    el.dispatchEvent(clickEvent);
                } else if ('${action}' === 'type') {
                    if (typeof el.value === 'undefined') return 'Error: Element does not have a value property.';
                    el.focus();
                    el.value = '${escapedValue}';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.blur();
                } else {
                    return 'Error: Unsupported action "${action}"';
                }
                return 'Success';
            } catch (e) { 
                return 'Error: ' + e.message;
            }
        })();
     `;
     const result = await executeScript<string>(script);
     if (result.startsWith('Error:')) {
         throw new Error(result.substring(7));
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
                    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
                }
                const canvas = await html2canvas(document.body, { useCORS: true, allowTaint: true });
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

  const controls: BrowserControls = { open, close, show, hide, getPageContent, interactWithPage, captureBrowserScreenshot, setContainer };

  return { state, controls };
};
