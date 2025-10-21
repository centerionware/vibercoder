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
  executeScript(script: { code: string }, callback: (result: any[]) => void): void;
}
// --- End Type declarations ---


const BROWSER_TABS_KEY = 'vibecode_browserTabs';
const ACTIVE_TAB_ID_KEY = 'vibecode_activeTabId';

const getFaviconUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch (e) {
    // Return a transparent pixel for invalid URLs
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
};

export const useBrowser = (): BrowserControls => {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isTabBarCollapsed, setIsTabBarCollapsed] = useState(false);
  const browserInstances = useRef<Record<string, InAppBrowser>>({});
  
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
      // FIX: Added a type assertion to resolve incorrect type inference of 'unknown'.
      Object.values(browserInstances.current).forEach(instance => (instance as InAppBrowser).close());
    };
  }, []);

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates, lastUpdated: Date.now() } : tab
      )
    );
  }, []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  // Effect to manage opening/closing the native browser window
  useEffect(() => {
    // Close any instances that are no longer the active tab
    Object.entries(browserInstances.current).forEach(([tabId, instance]) => {
      if (tabId !== activeTabId) {
        instance.close();
        delete browserInstances.current[tabId];
      }
    });

    const openBrowserForActiveTab = () => {
      if (activeTab && !browserInstances.current[activeTab.id]) {
        if (!(window as any).cordova || !(window as any).cordova.InAppBrowser) {
          console.error("Cordova InAppBrowser plugin not found. Browser functionality is disabled.");
          updateTab(activeTab.id, { isLoading: false, title: "Error: Plugin not found" });
          return;
        }

        updateTab(activeTab.id, { isLoading: true });

        const iab = (window as any).cordova.InAppBrowser.open(activeTab.url, '_blank', 'hidden=yes,location=no,toolbar=yes');
        browserInstances.current[activeTab.id] = iab;

        const onLoadStop = (event: InAppBrowserEvent) => {
          iab.executeScript({ code: "document.title" }, (values) => {
            const title = values[0] || event.url;
            updateTab(activeTab.id, { isLoading: false, url: event.url, title, favicon: getFaviconUrl(event.url) });
            iab.show();
          });
        };
        const onLoadError = (event: InAppBrowserEvent) => {
          updateTab(activeTab.id, { isLoading: false, title: `Error: ${event.message}` });
        };
        const onExit = () => {
          iab.removeEventListener('loadstop', onLoadStop);
          iab.removeEventListener('loaderror', onLoadError);
          iab.removeEventListener('exit', onExit);
          delete browserInstances.current[activeTab.id];
          setActiveTabId(currentActive => currentActive === activeTab.id ? null : currentActive);
        };
        
        iab.addEventListener('loadstop', onLoadStop);
        iab.addEventListener('loaderror', onLoadError);
        iab.addEventListener('exit', onExit);
      }
    };
    
    openBrowserForActiveTab();
  }, [activeTab, activeTabId, updateTab]);

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
      setActiveTabId(tabId);
    }
  }, [activeTabId]);

  const closeTab = useCallback((tabId: string) => {
    if (browserInstances.current[tabId]) {
      // FIX: Added a type assertion to resolve incorrect type inference of 'unknown'.
      (browserInstances.current[tabId] as InAppBrowser).close();
    }
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
      if (browserInstances.current[tabId]) {
        browserInstances.current[tabId].close();
      }
      updateTab(tabId, { url, title: url, favicon: getFaviconUrl(url), isLoading: true });
      if (tabId !== activeTabId) {
        setActiveTabId(tabId);
      }
  };
  
  const executeScriptOnTab = <T extends any>(tabId: string, script: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const instance = browserInstances.current[tabId];
      if (!instance) {
        return reject(new Error(`No active browser instance for tab ID: ${tabId}`));
      }
      instance.executeScript({ code: script }, (result) => {
        resolve(result?.[0] as T);
      });
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
            case 'click':
              el.click();
              return 'Click action performed.';
            case 'type':
              el.value = '${(value || '').replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return 'Type action performed.';
            default:
              return 'Error: Unknown action.';
          }
        } catch(e) {
          return 'Error: ' + e.message;
        }
      })();
    `;
    return executeScriptOnTab<string>(tabId, script);
  };


  return {
    tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab,
    switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar,
    getPageContent, interactWithPage,
  };
};