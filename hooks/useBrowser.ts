
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
    if (isPluginAvailable && containerRef.current) {
      const element = containerRef.current;
      resizeObserverRef.current = new ResizeObserver(() => {
        updateBounds();
      });
      resizeObserverRef.current.observe(element);
    }
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [isPluginAvailable, updateBounds]);

  const setContainer = useCallback((element: HTMLElement | null) => {
    if (element) {
      containerRef.current = element;
      updateBounds();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.observe(element);
      }
    } else {
      if (containerRef.current && resizeObserverRef.current) {
        resizeObserverRef.current.unobserve(containerRef.current);
      }
      containerRef.current = null;
    }
  }, [updateBounds]);

  const open = useCallback(async (url: string, container: HTMLElement) => {
    if (!isPluginAvailable) return;
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
    if (!isPluginAvailable || !state.isInitialized) return;
    await AideBrowser.show();
    setState(s => ({ ...s, isVisible: true }));
  }, [isPluginAvailable, state.isInitialized]);

  const hide = useCallback(async () => {
    if (!isPluginAvailable || !state.isInitialized) return;
    await AideBrowser.hide();
    setState(s => ({ ...s, isVisible: false }));
  }, [isPluginAvailable, state.isInitialized]);

  const executeScript = useCallback(async <T>(code: string): Promise<{ value: T } | null> => {
    if (!isPluginAvailable || !state.isInitialized) {
      console.warn('Cannot execute script, browser not available or initialized.');
      return null;
    }
    return AideBrowser.executeScript({ code });
  }, [isPluginAvailable, state.isInitialized]);

  const getPageContent = useCallback(async () => {
    const result = await executeScript<string>(`
      (function() {
        return document.body.innerHTML;
      })();
    `);
    return result?.value || '';
  }, [executeScript]);

  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string) => {
    const script = `
      (function() {
        const el = document.querySelector('${selector}');
        if (!el) return 'Error: Element not found.';
        try {
          if ('${action}' === 'click') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } else if ('${action}' === 'type') {
            el.focus();
            el.value = '${value || ''}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
          }
          return 'Success';
        } catch(e) {
          return 'Error: ' + e.message;
        }
      })();
    `;
    const result = await executeScript<string>(script);
    return result?.value || 'Error: Script execution failed.';
  }, [executeScript]);
  
  const captureBrowserScreenshot = useCallback(async () => {
    const result = await executeScript<string>(`
      (function() {
        return new Promise((resolve, reject) => {
          try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            script.onload = () => {
              html2canvas(document.body, { useCORS: true, allowTaint: true }).then(canvas => {
                resolve(canvas.toDataURL('image/jpeg', 0.8));
              }).catch(reject);
            };
            script.onerror = reject;
            document.head.appendChild(script);
          } catch(e) { reject(e); }
        });
      })();
    `);
    // The result from a promise in JS is just the promise object itself. We need to handle this differently.
    // For now, this is a placeholder for a more robust implementation.
    // Let's assume for now the native side needs to be enhanced for this.
    // A simplified placeholder:
    if (result && typeof result.value === 'string' && result.value.startsWith('data:image')) {
        return result.value.split(',')[1];
    }
    // Let's assume there is a native implementation for screenshots later.
    // This is a known limitation for now.
    return '';
  }, [executeScript]);

  useEffect(() => {
    return () => {
      if (isPluginAvailable) {
        AideBrowser.removeAllListeners();
        close();
      }
    };
  }, [isPluginAvailable, close]);
  
  const controls: BrowserControls = {
    open,
    close,
    show,
    hide,
    setContainer,
    getPageContent,
    interactWithPage,
    captureBrowserScreenshot
  };

  return { state, controls };
};
