import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BrowserTab, BrowserControls } from '../types';
import { safeLocalStorage } from '../utils/environment';


// --- Type declarations for Cordova InAppBrowser plugin ---
// This avoids needing a global .d.ts file and keeps the types local to this hook.
declare global {
  interface Window {
    cordova: {
      InAppBrowser: InAppBrowserStatic;
    }
  }
}

interface InAppBrowserStatic {
  open(url: string, target: string, options?: string): InAppBrowser;
}

interface InAppBrowserEvent extends Event {
  type: 'loadstart' | 'loadstop' | 'loaderror' | 'exit';
  url: string;
  code: number;
  message: string;
}

interface InAppBrowser {
  addEventListener(type: string, callback: (event: InAppBrowserEvent) => void): void;
  removeEventListener(type: string, callback: (event: InAppBrowserEvent) => void): void;
  close(): void;
  show(): void;
  hide(): void;
  executeScript(script: { code: string }, callback: (result: any[]) => void): void;
}
// --- End Type declarations ---

const BROWSER_TABS_KEY = 'vibecode_browserTabs';
const ACTIVE_TAB_ID_KEY = 'vibecode_activeTabId';
const STYLE_OVERRIDE_ID = 'inappbrowser-style-override';

const getFaviconUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch (e) {
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
};

const updateBrowserStyles = (containerEl: HTMLElement | null, isActive: boolean) => {
    let styleEl = document.getElementById(STYLE_OVERRIDE_ID);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_OVERRIDE_ID;
        document.head.appendChild(styleEl);
    }
    
    if (containerEl && isActive) {
        const rect = containerEl.getBoundingClientRect();
        // The plugin creates a div wrapper around the iframe. We must target this wrapper.
        // It often has a high z-index and fixed position.
        // This selector is a bit brittle but targets the likely wrapper div.
        styleEl.innerHTML = `
            div[style*="z-index: 20"] {
                position: fixed !important;
                top: ${rect.top}px !important;
                left: ${rect.left}px !important;
                width: ${rect.width}px !important;
                height: ${rect.height}px !important;
                z-index: 1 !important; /* Lower z-index to be below headers */
                display: block !important;
            }
        `;
    } else {
        // Hide the browser when not active or if the container doesn't exist.
        styleEl.innerHTML = `div[style*="z-index: 20"] { display: none !important; }`;
    }
};


export const useBrowser = (isBrowserViewActive: boolean): BrowserControls => {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isTabBarCollapsed, setIsTabBarCollapsed] = useState(false);
  const browserInstances = useRef<Record<string, InAppBrowser>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Load tabs from localStorage on initial mount
  useEffect(() => {
    try {
      const savedTabs = safeLocalStorage.getItem(BROWSER_TABS_KEY);
      const savedActiveTabId = safeLocalStorage.getItem(ACTIVE_TAB_ID_KEY);
      if (savedTabs) {
        const parsedTabs = JSON.parse(savedTabs);
        setTabs(parsedTabs);
        if (savedActiveTabId && parsedTabs.some((t: BrowserTab) => t.id === savedActiveTabId)) {
          setActiveTabId(savedActiveTabId);
        } else if (parsedTabs.length > 0) {
          setActiveTabId(parsedTabs[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load browser tabs from localStorage", e);
    }
  }, []);

  // Save tabs to localStorage whenever they change
  useEffect(() => {
    try {
      safeLocalStorage.setItem(BROWSER_TABS_KEY, JSON.stringify(tabs));
      if (activeTabId) {
        safeLocalStorage.setItem(ACTIVE_TAB_ID_KEY, activeTabId);
      }
    } catch (e) {
      console.error("Failed to save browser tabs to localStorage", e);
    }
  }, [tabs, activeTabId]);
  
  // Cleanup browser instances on unmount
  useEffect(() => {
    return () => {
      // FIX: The Object.values method was returning an array of 'unknown' type. Explicitly typing the instance to the 'InAppBrowser' interface resolves the type error and allows access to the 'close' method.
      Object.values(browserInstances.current).forEach((instance: InAppBrowser) => instance.close());
      const styleEl = document.getElementById(STYLE_OVERRIDE_ID);
      if (styleEl) styleEl.remove();
    };
  }, []);

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates, lastUpdated: Date.now() } : tab
      )
    );
  }, []);

  // Effect to manage the position and visibility of the browser view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // This observer will automatically update the browser's position when the layout changes.
    const resizeObserver = new ResizeObserver(() => {
        updateBrowserStyles(container, isBrowserViewActive);
    });

    resizeObserver.observe(container);
    updateBrowserStyles(container, isBrowserViewActive);

    return () => {
      resizeObserver.unobserve(container);
      // Hide the browser when the component unmounts
      updateBrowserStyles(null, false);
    };
  }, [isBrowserViewActive]);
  
  // Effect to manage the browser instances themselves (creating/destroying)
  useEffect(() => {
      // Cleanup: Close instances for tabs that no longer exist
      const openTabIds = new Set(tabs.map(t => t.id));
      Object.keys(browserInstances.current).forEach(tabId => {
          if (!openTabIds.has(tabId)) {
              browserInstances.current[tabId].close();
              delete browserInstances.current[tabId];
          }
      });

      const activeTab = tabs.find(t => t.id === activeTabId);

      // Create instance for active tab if it doesn't exist
      if (activeTab && !browserInstances.current[activeTab.id]) {
          if (!window.cordova || !window.cordova.InAppBrowser) {
              console.error("Cordova InAppBrowser plugin not found. Browser functionality is disabled.");
              updateTab(activeTab.id, { isLoading: false, title: "Error: Plugin not found" });
              return;
          }

          updateTab(activeTab.id, { isLoading: true });
          
          // 'hidden=no' is important. We control visibility with our CSS override.
          const iab = window.cordova.InAppBrowser.open(activeTab.url, '_blank', 'location=no,toolbar=no,zoom=no');
          browserInstances.current[activeTab.id] = iab;

          const onLoadStart = (event: InAppBrowserEvent) => updateTab(activeTab.id, { isLoading: true, url: event.url });
          const onLoadStop = (event: InAppBrowserEvent) => {
              iab.executeScript({ code: "document.title" }, (values) => {
                  const title = values[0] || event.url;
                  updateTab(activeTab.id, { isLoading: false, url: event.url, title, favicon: getFaviconUrl(event.url) });
              });
          };
          const onLoadError = (event: InAppBrowserEvent) => updateTab(activeTab.id, { isLoading: false, title: `Error: ${event.message}` });
          
          iab.addEventListener('loadstart', onLoadStart);
          iab.addEventListener('loadstop', onLoadStop);
          iab.addEventListener('loaderror', onLoadError);
      }
      
      // We no longer call show/hide here; it's all handled by the style override logic.

  }, [tabs, activeTabId, updateTab]);


  const openNewTab = useCallback((url: string = 'https://google.com') => {
    const newTab: BrowserTab = {
      id: uuidv4(),
      url,
      title: 'New Tab',
      favicon: getFaviconUrl(url),
      isLoading: true,
      lastUpdated: Date.now(),
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, []);

  const switchToTab = useCallback((tabId: string) => {
    if (tabId !== activeTabId) {
      // Hide old instance before switching, to prevent flicker.
      const oldInstance = browserInstances.current[activeTabId!];
      if (oldInstance) oldInstance.hide();
      
      setActiveTabId(tabId);
    }
  }, [activeTabId]);

  const closeTab = useCallback((tabId: string) => {
    const instance = browserInstances.current[tabId];
    if (instance) instance.close();
    // The instance removal from the ref is handled by the main useEffect
    setTabs(prev => {
      const remainingTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        const newActiveTab = remainingTabs.sort((a, b) => b.lastUpdated - a.lastUpdated)[0];
        setActiveTabId(newActiveTab ? newActiveTab.id : null);
      }
      return remainingTabs;
    });
  }, [activeTabId]);
  
  const navigateTo = (tabId: string, url: string) => {
      const instance = browserInstances.current[tabId];
      if (instance) instance.close();
      
      updateTab(tabId, { url, title: 'Loading...', favicon: getFaviconUrl(url), isLoading: true });

      if (tabId !== activeTabId) setActiveTabId(tabId);
  };
  
  const executeScriptOnTab = <T extends any>(tabId: string, script: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const instance = browserInstances.current[tabId];
      if (!instance) return reject(new Error(`No active browser instance for tab ID: ${tabId}`));
      instance.executeScript({ code: script }, (result) => resolve(result?.[0] as T));
    });
  };
  
  const goBack = async (tabId: string) => { await executeScriptOnTab(tabId, 'history.back();'); };
  const goForward = async (tabId: string) => { await executeScriptOnTab(tabId, 'history.forward();'); };
  const reload = async (tabId: string) => { await executeScriptOnTab(tabId, 'location.reload();'); };
  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = async (tabId: string): Promise<string> => {
    return executeScriptOnTab<string>(tabId, 'document.body.innerText');
  };

  const interactWithPage = async (tabId: string, selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    const script = `
      (function() {
        try {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return 'Error: Element not found with selector: ${selector.replace(/'/g, "\\'")}';
          
          switch('${action}') {
            case 'click': el.click(); return 'Click action performed.';
            case 'type':
              el.value = '${(value || '').replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return 'Type action performed.';
            default: return 'Error: Unknown action.';
          }
        } catch(e) { return 'Error: ' + e.message; }
      })();
    `;
    return executeScriptOnTab<string>(tabId, script);
  };


  return {
    tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab,
    switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar,
    getPageContent, interactWithPage, containerRef,
  };
};