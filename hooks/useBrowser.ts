import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BrowserTab, BrowserControls } from '../types';
import { safeLocalStorage } from '../utils/environment';

const BROWSER_TABS_KEY = 'vibecode_browserTabs';
const ACTIVE_TAB_ID_KEY = 'vibecode_activeTabId';
const DEFAULT_URL = 'https://www.google.com/search?q=VibeCode+AI';

const getFaviconUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch (e) {
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
};

export const useBrowser = (isBrowserViewActive: boolean): BrowserControls => {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isTabBarCollapsed, setIsTabBarCollapsed] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const activeBrowserInstance = useRef<any>(null);
  const activeBrowserWrapperRef = useRef<HTMLElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // --- State Persistence ---
  useEffect(() => {
    try {
      const savedTabs = safeLocalStorage.getItem(BROWSER_TABS_KEY);
      const savedActiveTabId = safeLocalStorage.getItem(ACTIVE_TAB_ID_KEY);
      if (savedTabs) {
        const parsedTabs: BrowserTab[] = JSON.parse(savedTabs);
        if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
            setTabs(parsedTabs.map(t => ({...t, isLoading: false })));
            if (savedActiveTabId && parsedTabs.some(t => t.id === savedActiveTabId)) {
              setActiveTabId(savedActiveTabId);
            } else {
              setActiveTabId(parsedTabs[0].id);
            }
        }
      }
    } catch (e) { console.error("Failed to load browser tabs from localStorage", e); }
  }, []);

  useEffect(() => {
    try {
      const tabsToSave = tabs.map(({ id, url, title, favicon, lastUpdated }) => ({ id, url, title, favicon, lastUpdated, isLoading: false }));
      safeLocalStorage.setItem(BROWSER_TABS_KEY, JSON.stringify(tabsToSave));
      if (activeTabId) {
        safeLocalStorage.setItem(ACTIVE_TAB_ID_KEY, activeTabId);
      }
    } catch (e) { console.error("Failed to save browser tabs to localStorage", e); }
  }, [tabs, activeTabId]);
  
  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates, lastUpdated: Date.now() } : tab
      )
    );
  }, []);

  const updateBrowserPosition = useCallback(() => {
    if (activeBrowserWrapperRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        Object.assign(activeBrowserWrapperRef.current.style, {
            position: 'absolute',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            zIndex: '40', // Below modals (z-50) but above most UI
        });
    }
  }, []);
  
  const closeCurrentBrowser = useCallback(() => {
    if (activeBrowserInstance.current) {
        try {
            activeBrowserInstance.current.close();
        } catch(e) {
            console.warn("Error closing InAppBrowser instance.", e);
        }
        activeBrowserInstance.current = null;
        activeBrowserWrapperRef.current = null;
    }
  }, []);

  const openBrowserForTab = useCallback((tab: BrowserTab) => {
    closeCurrentBrowser();
    
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!containerRef.current || !inAppBrowserPlugin?.open) {
        return;
    }
    
    if (typeof tab.url !== 'string') {
        console.error(`Cannot open browser tab. Expected URL to be a string, but got:`, tab.url);
        updateTab(tab.id, { isLoading: false, title: 'Invalid URL' });
        return;
    }

    const browser = inAppBrowserPlugin.open(tab.url, '_blank', 'hidden=yes,location=no');
    activeBrowserInstance.current = browser;

    const observer = new MutationObserver((mutations, obs) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                const element = node as HTMLElement;
                if (element.parentElement === document.body && element.querySelector('iframe')) {
                    activeBrowserWrapperRef.current = element;
                    updateBrowserPosition();
                    browser.show();
                    obs.disconnect();
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true });

    browser.addEventListener('loadstop', (params: any) => {
        updateTab(tab.id, { isLoading: false, url: params.url, favicon: getFaviconUrl(params.url) });
        try { new URL(params.url); updateTab(tab.id, { title: new URL(params.url).hostname }); }
        catch (e) { updateTab(tab.id, { title: params.url }); }
    });

    browser.addEventListener('loaderror', (params: any) => {
        console.error('InAppBrowser load error:', params);
        updateTab(tab.id, { isLoading: false, title: 'Failed to load page' });
    });
    
    browser.addEventListener('exit', () => {
        if (activeBrowserInstance.current === browser) {
            activeBrowserInstance.current = null;
            activeBrowserWrapperRef.current = null;
        }
    });

  }, [closeCurrentBrowser, updateTab, updateBrowserPosition]);
  
  const closeTab = useCallback((tabId: string) => {
    if (tabId === activeTabId) {
        closeCurrentBrowser();
    }
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        const newActive = remaining.sort((a, b) => b.lastUpdated - a.lastUpdated)[0];
        setActiveTabId(newActive ? newActive.id : null);
      }
      return remaining;
    });
  }, [activeTabId, closeCurrentBrowser]);

  useEffect(() => {
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();

    if (isBrowserViewActive && containerRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => {
            updateBrowserPosition();
        });
        resizeObserverRef.current.observe(containerRef.current);
    }
    
    if (!isBrowserViewActive) {
      closeCurrentBrowser();
    } else {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
          openBrowserForTab(activeTab);
        } else {
          closeCurrentBrowser();
        }
    }
    
    return () => {
        if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
    };
  }, [activeTabId, isBrowserViewActive, tabs, openBrowserForTab, closeCurrentBrowser, updateBrowserPosition]);
  
  const openNewTab = useCallback((url: string = DEFAULT_URL): string => {
    const newTab: BrowserTab = { id: uuidv4(), url, title: 'New Tab', favicon: getFaviconUrl(url), isLoading: true, lastUpdated: Date.now() };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, []);
  
  const switchToTab = useCallback((tabId: string) => {
    if (tabId !== activeTabId) {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, lastUpdated: Date.now() } : t));
        setActiveTabId(tabId);
    }
  }, [activeTabId]);

  const navigateTo = (tabId: string, url: string) => {
    updateTab(tabId, { url, title: 'Loading...', favicon: getFaviconUrl(url), isLoading: true });
    if (tabId === activeTabId) {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) openBrowserForTab({ ...tab, url });
    }
  };
  
  const goBack = () => {
    if (activeBrowserInstance.current) {
        (activeBrowserInstance.current as any).executeScript({ code: "history.back();" });
    }
  };
  const goForward = () => {
      if (activeBrowserInstance.current) {
        (activeBrowserInstance.current as any).executeScript({ code: "history.forward();" });
    }
  };
  const reload = (tabId: string) => {
      if (tabId === activeTabId) {
          const tab = tabs.find(t => t.id === tabId);
          if (tab) openBrowserForTab(tab);
      }
  };
  
  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = async (tabId: string): Promise<string> => {
    const browser = activeBrowserInstance.current;
    if (!browser || tabId !== activeTabId) return Promise.reject("Target tab is not active.");
    
    return new Promise((resolve, reject) => {
        browser.executeScript({ code: "document.body.innerText" }, (result: any) => {
            if (result && result[0]) resolve(result[0]);
            else reject("Could not retrieve page content.");
        });
    });
  };

  const interactWithPage = async (tabId: string, selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    const browser = activeBrowserInstance.current;
    if (!browser || tabId !== activeTabId) return Promise.reject("Target tab is not active.");

    const code = `(function() { try { const el = document.querySelector('${selector}'); if (!el) return 'Error: Element not found'; if ('${action}' === 'click') el.click(); else if ('${action}' === 'type') el.value = '${value || ''}'; return 'Success'; } catch(e) { return 'Error: ' + e.message; } })();`;

    return new Promise((resolve, reject) => {
        browser.executeScript({ code }, (result: any) => {
            if (result && result[0]) {
                if (result[0].startsWith('Error:')) reject(new Error(result[0]));
                else resolve(result[0]);
            } else {
                reject(new Error("Failed to execute interaction script."));
            }
        });
    });
  };

  return { tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab, switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar, getPageContent, interactWithPage, containerRef };
};
