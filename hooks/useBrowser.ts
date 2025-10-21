import { useState, useCallback, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { InAppBrowser, PluginListenerHandle } from '@capacitor/inappbrowser';
import { BrowserTab, BrowserControls } from '../types';
import { safeLocalStorage } from '../utils/environment';

// The plugin docs show this event data interface, but it's likely not exported.
// We'll define it locally to satisfy TypeScript.
interface BrowserPageNavigationCompletedEventData {
  url: string;
}

const BROWSER_TABS_KEY = 'vibecode_browserTabs';
const ACTIVE_TAB_ID_KEY = 'vibecode_activeTabId';

const getFaviconUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch (e) {
    return 'about:blank';
  }
};

export const useBrowser = (): BrowserControls => {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isTabBarCollapsed, setIsTabBarCollapsed] = useState(false);
  
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
      } else if (safeLocalStorage.getItem(ACTIVE_TAB_ID_KEY)) { // Check before removing
        localStorage.removeItem(ACTIVE_TAB_ID_KEY);
      }
    } catch (e) {
      console.error("Failed to save browser tabs to localStorage", e);
    }
  }, [tabs, activeTabId]);

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates, lastUpdated: Date.now() } : tab
      )
    );
  }, []);
  
  // Setup listeners once
  useEffect(() => {
    const setupListeners = async () => {
        const closedHandle = await InAppBrowser.addListener('browserClosed', () => {
            setActiveTabId(null);
        });

        const loadedHandle = await InAppBrowser.addListener('browserPageLoaded', () => {
            setActiveTabId(currentActiveId => {
                if (currentActiveId) {
                    // Title is not available via this API, so we have to make do.
                    updateTab(currentActiveId, { isLoading: false, title: "Page Loaded" });
                }
                return currentActiveId;
            });
        });

        // The 'urlChanged' event from the original code doesn't exist in the docs.
        // 'browserPageNavigationCompleted' is the documented equivalent for WebView.
        const navHandle = await InAppBrowser.addListener('browserPageNavigationCompleted', (data: BrowserPageNavigationCompletedEventData) => {
            setActiveTabId(currentActiveId => {
                if (currentActiveId) {
                    // We can't get the title, so we update the URL and favicon.
                    updateTab(currentActiveId, { url: data.url, title: data.url, favicon: getFaviconUrl(data.url) });
                }
                return currentActiveId;
            });
        });

        return [closedHandle, loadedHandle, navHandle];
    };

    let handles: PluginListenerHandle[] = [];
    setupListeners().then(h => handles = h);
    
    return () => {
        handles.forEach(h => h.remove());
        // Ensure browser is closed on unmount
        InAppBrowser.close();
    };
  }, [updateTab]);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  // Effect to open/close the browser view based on the active tab
  useEffect(() => {
    const openOrCloseBrowser = async () => {
        // Always close any existing browser instance before opening a new one.
        // This handles tab switching.
        await InAppBrowser.close();

        if (activeTab) {
            updateTab(activeTab.id, { isLoading: true });
            try {
                // Use the documented openInWebView method.
                // It's fire-and-forget; it does not return a browser instance.
                await InAppBrowser.openInWebView({
                    url: activeTab.url,
                    options: {
                        showURL: true,
                        showToolbar: true,
                        showNavigationButtons: true, // This will show native nav buttons.
                    }
                });
            } catch (error) {
                console.error("Error opening InAppBrowser:", error);
                updateTab(activeTab.id, { isLoading: false, title: 'Failed to load' });
            }
        }
    };
    
    openOrCloseBrowser();
  }, [activeTab, updateTab]);

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
      updateTab(tabId, { url, title: url, favicon: getFaviconUrl(url), isLoading: true });
      if (tabId !== activeTabId) {
        setActiveTabId(tabId);
      }
  };

  // --- Unsupported Functions ---
  // The documented API for @capacitor/inappbrowser does not support these actions.
  const goBack = async (tabId: string) => { console.warn("goBack is not programmatically supported by this InAppBrowser plugin version."); };
  const goForward = async (tabId: string) => { console.warn("goForward is not programmatically supported by this InAppBrowser plugin version."); };
  const reload = async (tabId: string) => { console.warn("reload is not programmatically supported by this InAppBrowser plugin version."); };
  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = async (tabId: string): Promise<string> => {
    throw new Error("getPageContent (executeScript) is not supported by this InAppBrowser plugin version.");
  };

  const interactWithPage = async (tabId: string, selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    throw new Error("interactWithPage (executeScript) is not supported by this InAppBrowser plugin version.");
  };

  return {
    tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab,
    switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar,
    getPageContent, interactWithPage,
  };
};
