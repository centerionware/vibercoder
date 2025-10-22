import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BrowserTab, BrowserControls } from '../types';
import { safeLocalStorage } from '../utils/environment';

const BROWSER_TABS_KEY = 'vibecode_browserTabs';
const ACTIVE_TAB_ID_KEY = 'vibecode_activeTabId';
const DEFAULT_URL = 'https://www.google.com/search?q=VibeCode+AI';

// A helper to get a favicon URL from a service
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
      safeLocalStorage.setItem(BROWSER_TABS_KEY, JSON.stringify(tabs));
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

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        const newActive = remaining.sort((a, b) => b.lastUpdated - a.lastUpdated)[0];
        setActiveTabId(newActive ? newActive.id : null);
      }
      return remaining;
    });
  }, [activeTabId]);

  const closeCurrentBrowser = useCallback(() => {
    if (activeBrowserInstance.current) {
        activeBrowserInstance.current.close();
        activeBrowserInstance.current = null;
    }
    if (containerRef.current) {
        containerRef.current.innerHTML = '';
    }
  }, []);

  const openBrowserForTab = useCallback((tab: BrowserTab) => {
    closeCurrentBrowser();
    
    const targetContainer = containerRef.current;
    const inAppBrowserPlugin = (window as any).cordova?.InAppBrowser;
    if (!targetContainer || !inAppBrowserPlugin?.open) {
        console.warn('InAppBrowser plugin not available or container not ready.');
        return;
    }

    const browser = inAppBrowserPlugin.open(tab.url, '_blank', 'hidden=yes,location=no');
    activeBrowserInstance.current = browser;

    const observer = new MutationObserver((mutations, obs) => {
        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                // The plugin adds a DIV wrapper to the body. This is our target.
                if ((node as HTMLElement).parentElement === document.body && (node as HTMLElement).querySelector('iframe')) {
                    const browserViewNode = node as HTMLElement;
                    
                    targetContainer.appendChild(browserViewNode);

                    // Aggressively restyle the wrapper to be contained
                    Object.assign(browserViewNode.style, {
                        position: 'absolute', top: '0', left: '0',
                        width: '100%', height: '100%', zIndex: '1',
                    });
                    
                    const iframe = browserViewNode.querySelector('iframe');
                    if (iframe) {
                        Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none' });
                    }
                    
                    browser.show();
                    obs.disconnect();
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true });

    browser.addEventListener('loadstop', () => {
        // Can't get title due to cross-origin, but we can stop the loading indicator.
        updateTab(tab.id, { isLoading: false });
    });

    browser.addEventListener('loaderror', (params: any) => {
        console.error('InAppBrowser load error:', params);
        updateTab(tab.id, { isLoading: false, title: 'Failed to load page' });
    });
    
    browser.addEventListener('exit', () => {
        if (activeBrowserInstance.current === browser) {
            activeBrowserInstance.current = null;
            closeTab(tab.id);
        }
    });

  }, [closeCurrentBrowser, updateTab, closeTab]);

  useEffect(() => {
    if (!isBrowserViewActive) {
      closeCurrentBrowser();
      return;
    }
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
      openBrowserForTab(activeTab);
    } else {
      closeCurrentBrowser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, isBrowserViewActive]);
  
  const openNewTab = useCallback((url: string = DEFAULT_URL) => {
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
        const activeTab = tabs.find(t => t.id === tabId);
        if (activeTab) {
            // Re-create the browser instance for the new URL
            openBrowserForTab({ ...activeTab, url });
        }
    }
  };
  
  // The plugin's web implementation does not support history back/forward.
  // We can simulate reload by re-opening.
  const goBack = (tabId: string) => console.warn('InAppBrowser web implementation does not support goBack()');
  const goForward = (tabId: string) => console.warn('InAppBrowser web implementation does not support goForward()');
  const reload = (tabId: string) => {
      if (tabId === activeTabId) {
          const activeTab = tabs.find(t => t.id === tabId);
          if (activeTab) openBrowserForTab(activeTab);
      }
  };
  
  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = async (tabId: string): Promise<string> => {
    return Promise.resolve('Error: Cannot access cross-origin iframe content due to browser security policies.');
  };

  const interactWithPage = async (tabId: string, selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    return Promise.reject(new Error("Interacting with web pages is not supported."));
  };

  return { tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab, switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar, getPageContent, interactWithPage, containerRef };
};
