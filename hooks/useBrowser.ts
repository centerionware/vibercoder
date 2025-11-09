import { useState, useCallback, useEffect, useRef } from 'react';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { BrowserControls } from '../types';

// This interface defines the new, more advanced API for the native plugin
// that supports a persistent, resizable browser view.
interface AideBrowserPlugin {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  setBounds(options: { x: number; y: number; width: number; height: number; }): Promise<void>;
  executeScript<T>(options: { code: string }): Promise<{ value: T }>;
  addListener(eventName: 'pageLoaded', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listenerFunc: () => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const AideBrowser = registerPlugin<AideBrowserPlugin>('AideBrowser');

interface BrowserState {
  isOpen: boolean; // Represents if the browser instance exists natively
  isVisible: boolean; // Represents if the browser is currently shown to the user
  isPageLoaded: boolean;
  currentUrl: string;
}

export const useBrowser = () => {
  const [state, setState] = useState<BrowserState>({
    isOpen: false,
    isVisible: false,
    isPageLoaded: false,
    currentUrl: '',
  });
  const containerRef = useRef<HTMLElement | null>(null);
  const isPluginAvailable = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isPluginAvailable) return;

    let pageLoadedHandle: PluginListenerHandle | null = null;
    let closedHandle: PluginListenerHandle | null = null;

    AideBrowser.addListener('pageLoaded', () => {
      console.log('[Browser] Native event: pageLoaded');
      setState(s => ({ ...s, isPageLoaded: true }));
    }).then(handle => pageLoadedHandle = handle);

    AideBrowser.addListener('closed', () => {
      console.log('[Browser] Native event: closed');
      setState({ isOpen: false, isVisible: false, isPageLoaded: false, currentUrl: '' });
    }).then(handle => closedHandle = handle);

    return () => {
      pageLoadedHandle?.remove();
      closedHandle?.remove();
    };
  }, [isPluginAvailable]);

  const open = useCallback(async (url: string) => {
    if (!isPluginAvailable) return;
    await AideBrowser.open({ url });
    setState(s => ({ ...s, isOpen: true, isPageLoaded: false, currentUrl: url }));
  }, [isPluginAvailable]);

  const close = useCallback(async () => {
    if (!isPluginAvailable || !state.isOpen) return;
    await AideBrowser.close();
    // The 'closed' event listener will handle the final state change.
    setState(s => ({ ...s, isOpen: false, isVisible: false }));
  }, [isPluginAvailable, state.isOpen]);

  const show = useCallback(async () => {
    if (!isPluginAvailable || !state.isOpen || state.isVisible) return;
    await AideBrowser.show();
    setState(s => ({ ...s, isVisible: true }));
  }, [isPluginAvailable, state.isOpen, state.isVisible]);

  const hide = useCallback(async () => {
    if (!isPluginAvailable || !state.isOpen || !state.isVisible) return;
    await AideBrowser.hide();
    setState(s => ({ ...s, isVisible: false }));
  }, [isPluginAvailable, state.isOpen, state.isVisible]);

  const setContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
  }, []);

  useEffect(() => {
    if (!isPluginAvailable || !containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      if (!entries || entries.length === 0 || !state.isOpen) return;
      const rect = entries[0].target.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      AideBrowser.setBounds({
        x: rect.left * dpr,
        y: rect.top * dpr,
        width: rect.width * dpr,
        height: rect.height * dpr,
      });
    });

    observer.observe(containerRef.current);
    
    // Initial bounds setting
    const rect = containerRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    AideBrowser.setBounds({
        x: rect.left * dpr,
        y: rect.top * dpr,
        width: rect.width * dpr,
        height: rect.height * dpr,
    });


    return () => observer.disconnect();
  }, [isPluginAvailable, state.isOpen]); // Re-observe if the container element itself changes via the ref

  const executeScript = useCallback(async <T extends any>(code: string): Promise<{ value: T } | null> => {
    if (!isPluginAvailable() || !state.isOpen) {
        console.warn('Cannot execute script, browser not available or not open.');
        return null;
    }
    try {
        const result = await AideBrowser.executeScript<T>({ code });
        return result;
    } catch (e) {
        console.error("Error executing browser script:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        // Return an error structure that the AI can understand
        return { value: `Error: ${errorMessage}` as any };
    }
  }, [isPluginAvailable, state.isOpen]);


  const getPageContent = useCallback(async () => {
    const result = await executeScript<{ body: string }>(`document.body.innerHTML`);
    // The native side now returns a JSON string, so we need to handle it properly
    if (typeof result?.value === 'string') {
        return result.value;
    }
    return '';
  }, [executeScript]);

  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string) => {
    const script = `
      (function() {
        try {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) {
            return JSON.stringify({ error: 'Element not found with selector: ${selector.replace(/'/g, "\\'")}' });
          }
          if ('${action}' === 'click') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } else if ('${action}' === 'type') {
            el.focus();
            el.value = '${(value || '').replace(/'/g, "\\'")}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
          }
          return JSON.stringify({ success: true, message: 'Interaction successful.' });
        } catch(e) {
          return JSON.stringify({ error: e.message });
        }
      })();
    `;
    const result = await executeScript<string>(script);
    try {
        if (result?.value) {
            const parsed = JSON.parse(result.value);
            if(parsed.error) return `Error: ${parsed.error}`;
            return parsed.message || 'Success';
        }
    } catch(e) {
        // Fallback for non-JSON string
        return result?.value || 'Error: Script execution failed to return a value.';
    }
    return 'Error: Script execution failed.';
  }, [executeScript]);
  
  const captureBrowserScreenshot = useCallback(async () => {
    console.warn("captureBrowserScreenshot is not implemented for this native view.");
    return '';
  }, []);

  const controls: BrowserControls = {
    open, close, show, hide, setContainer, getPageContent, interactWithPage, captureBrowserScreenshot
  };

  return { state, controls };
};