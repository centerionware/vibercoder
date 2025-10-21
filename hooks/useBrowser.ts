import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { InAppBrowser, InAppBrowserEvent } from '@capacitor/inappbrowser';
import { BrowserTab, BrowserControls } from '../types';
import { safeLocalStorage } from '../utils/environment';

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
  const browserRef = useRef<InAppBrowser | null>(null);

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

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates, lastUpdated: Date.now() } : tab
      )
    );
  }, []);

  const openBrowserInstance = useCallback(async (url: string, tabId: string) => {
    if (browserRef.current) {
      await browserRef.current.close();
      browserRef.current = null;
    }

    updateTab(tabId, { isLoading: true });

    try {
      const browser = await InAppBrowser.create(url, {
        presentationStyle: 'fullscreen',
        toolbar: true,
      });
      browserRef.current = browser;

      browser.on('urlChanged').subscribe((event: InAppBrowserEvent) => {
        updateTab(tabId, { url: event.url, favicon: getFaviconUrl(event.url) });
      });

      browser.on('pageLoaded').subscribe(async () => {
        const title = await browser.getTitle();
        updateTab(tabId, { title: title || 'Untitled', isLoading: false });
      });

      browser.on('closed').subscribe(() => {
        browserRef.current = null;
        // Optionally, you could set activeTabId to null if the user closing the browser should feel like closing the tab
      });

    } catch (error) {
      console.error("Error creating InAppBrowser:", error);
      updateTab(tabId, { isLoading: false, title: 'Failed to load' });
    }
  }, [updateTab]);

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
    openBrowserInstance(url, newTab.id);
    return newTab.id;
  }, [openBrowserInstance]);

  const switchToTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && tabId !== activeTabId) {
      setActiveTabId(tabId);
      openBrowserInstance(tab.url, tabId);
    }
  }, [tabs, activeTabId, openBrowserInstance]);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const remainingTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        if (browserRef.current) {
          browserRef.current.close();
          browserRef.current = null;
        }
        const newActiveTab = remainingTabs.sort((a,b) => b.lastUpdated - a.lastUpdated)[0];
        if (newActiveTab) {
          switchToTab(newActiveTab.id);
        } else {
          setActiveTabId(null);
        }
      }
      return remainingTabs;
    });
  }, [activeTabId, switchToTab]);
  
  const navigateTo = (tabId: string, url: string) => {
      updateTab(tabId, { url, favicon: getFaviconUrl(url) });
      if (tabId === activeTabId) {
        openBrowserInstance(url, tabId);
      }
  };

  const goBack = async (tabId: string) => { if (tabId === activeTabId && browserRef.current) await browserRef.current.goBack(); };
  const goForward = async (tabId: string) => { if (tabId === activeTabId && browserRef.current) await browserRef.current.goForward(); };
  const reload = async (tabId: string) => { if (tabId === activeTabId && browserRef.current) await browserRef.current.reload(); };

  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = async (tabId: string): Promise<string> => {
    if (tabId !== activeTabId || !browserRef.current) {
        throw new Error("Cannot get page content: The specified tab is not active in the browser view.");
    }
    const result = await browserRef.current.executeScript({ code: "document.body.innerText" });
    return result[0] || '';
  };

  const interactWithPage = async (tabId: string, selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
    if (tabId !== activeTabId || !browserRef.current) {
        throw new Error("Cannot interact with page: The specified tab is not active in the browser view.");
    }
    const safeSelector = selector.replace(/"/g, '\\"');
    let code = '';
    switch(action) {
        case 'click':
            code = `document.querySelector("${safeSelector}").click(); "Clicked element."`;
            break;
        case 'type':
            const safeValue = value?.replace(/"/g, '\\"') || '';
            code = `
                const el = document.querySelector("${safeSelector}");
                el.value = "${safeValue}";
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                "Typed value into element."
            `;
            break;
    }
    const result = await browserRef.current.executeScript({ code });
    return result[0] || `Action '${action}' performed on '${selector}'.`;
  };

  return {
    tabs,
    activeTabId,
    isTabBarCollapsed,
    openNewTab,
    closeTab,
    switchToTab,
    navigateTo,
    goBack,
    goForward,
    reload,
    toggleTabBar,
    getPageContent,
    interactWithPage,
  };
};