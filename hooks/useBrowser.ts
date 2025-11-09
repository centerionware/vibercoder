import { useState, useCallback, useEffect } from 'react';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { BrowserControls } from '../types';

// This interface now matches the simpler API provided by the new native plugin.
interface AideBrowserPlugin {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
  executeScript<T>(options: { code: string }): Promise<{ value: T }>;
  addListener(eventName: 'pageLoaded', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listenerFunc: () => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const AideBrowser = registerPlugin<AideBrowserPlugin>('AideBrowser');

interface BrowserState {
  isInitialized: boolean; // Renamed from isOpen for clarity, represents if the browser activity/vc is active
  isPageLoaded: boolean;
  currentUrl: string;
}

export const useBrowser = () => {
  const [state, setState] = useState<BrowserState>({
    isInitialized: false,
    isPageLoaded: false,
    currentUrl: '',
  });

  const isPluginAvailable = Capacitor.isNativePlatform();

  // Effect to manage native event listeners
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
      setState({ isInitialized: false, isPageLoaded: false, currentUrl: '' });
    }).then(handle => closedHandle = handle);

    return () => {
      pageLoadedHandle?.remove();
      closedHandle?.remove();
    };
  }, [isPluginAvailable]);


  const open = useCallback(async (url: string) => {
    if (!isPluginAvailable) return;
    // The new `open` method doesn't require a container.
    await AideBrowser.open({ url });
    setState({ isInitialized: true, isPageLoaded: false, currentUrl: url });
  }, [isPluginAvailable]);

  const close = useCallback(async () => {
    if (!isPluginAvailable || !state.isInitialized) return;
    await AideBrowser.close();
    // The 'closed' event listener will handle the state change.
  }, [isPluginAvailable, state.isInitialized]);
  
  // These methods are no longer needed for the new native architecture.
  const show = useCallback(async () => { console.warn("show() is deprecated"); }, []);
  const hide = useCallback(async () => { console.warn("hide() is deprecated"); }, []);
  const setContainer = useCallback((element: HTMLElement | null) => { /* Deprecated */ }, []);


  const executeScript = useCallback(async <T>(code: string): Promise<{ value: T } | null> => {
    if (!isPluginAvailable || !state.isInitialized) {
      console.warn('Cannot execute script, browser not available or initialized.');
      return null;
    }
    // The new `executeScript` implementation is simpler.
    return AideBrowser.executeScript({ code });
  }, [isPluginAvailable, state.isInitialized]);

  const getPageContent = useCallback(async () => {
    const result = await executeScript<string>(`document.body.innerHTML`);
    return result?.value || '';
  }, [executeScript]);

  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string) => {
    const script = `
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return 'Error: Element not found.';
        try {
          if ('${action}' === 'click') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } else if ('${action}' === 'type') {
            el.focus();
            el.value = '${(value || '').replace(/'/g, "\\'")}';
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
     // This functionality requires a more complex implementation on the native side.
     // For now, we acknowledge it's not supported by the new architecture.
    console.warn("captureBrowserScreenshot is not fully implemented in this browser architecture.");
    return '';
  }, []);

  const controls: BrowserControls = {
    // The open method now doesn't need a container. We adapt it here.
    open: (url: string, _container: HTMLElement) => open(url),
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
