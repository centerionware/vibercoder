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
  
  const closeCurrentBrowser = useCallback(() => {
    if (activeBrowserInstance.current) {
        try {
            activeBrowserInstance.current.close();
        } catch(e) {
            console.warn("Error closing InAppBrowser instance. It might have been already closed or in an invalid state.", e);
        }
        activeBrowserInstance.current = null;
    }
    // Clean our container that holds the iframe
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
                if ((node as HTMLElement).parentElement === document.body) {
                    const wrapperDiv = node as HTMLElement;
                    const iframe = wrapperDiv.querySelector('iframe');

                    // We found the plugin's wrapper div containing the iframe
                    if (iframe) {
                        // Move just the iframe into our container
                        targetContainer.appendChild(iframe);

                        // Restyle the iframe to fill the container
                        Object.assign(iframe.style, {
                            position: 'absolute', top: '0', left: '0',
                            width: '100%', height: '100%', border: 'none'
                        });

                        // Hide the plugin's original wrapper div to prevent it from overlaying the screen
                        wrapperDiv.style.display = 'none';

                        browser.show();
                        obs.disconnect(); // We're done
                        return;
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true });

    browser.addEventListener('loadstop', (params: any) => {
        updateTab(tab.id, { isLoading: false, url: params.url, favicon: getFaviconUrl(params.url) });
        // The plugin's web implementation does not allow getting the title.
        // We'll try to infer it from the URL or leave it as is.
        try {
            const url = new URL(params.url);
            updateTab(tab.id, { title: url.hostname });
        } catch (e) {
            updateTab(tab.id, { title: params.url });
        }
    });

    browser.addEventListener('loaderror', (params: any) => {
        console.error('InAppBrowser load error:', params);
        updateTab(tab.id, { isLoading: false, title: 'Failed to load page' });
    });
    
    browser.addEventListener('exit', () => {
        if (activeBrowserInstance.current === browser) {
            activeBrowserInstance.current = null;
        }
    });

  }, [closeCurrentBrowser, updateTab]);
  
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
  // This effect should re-run when the active tab or view status changes.
  // The functions are wrapped in useCallback to be stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, isBrowserViewActive]);
  
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
    const newTitle = 'Loading...';
    try {
        const urlObj = new URL(url);
        // newTitle = urlObj.hostname;
    } catch(e) {/* use default */}
    
    updateTab(tabId, { url, title: newTitle, favicon: getFaviconUrl(url), isLoading: true });
    
    if (tabId === activeTabId) {
        const activeTab = tabs.find(t => t.id === tabId);
        if (activeTab) {
            // Re-create the browser instance for the new URL
            openBrowserForTab({ ...activeTab, url });
        }
    }
  };
  
  // The plugin's web implementation does not support history back/forward.
  const goBack = (tabId: string) => {
    if (activeBrowserInstance.current) {
        (activeBrowserInstance.current as any).executeScript({ code: "history.back();" });
    }
  };
  const goForward = (tabId: string) => {
      if (activeBrowserInstance.current) {
        (activeBrowserInstance.current as any).executeScript({ code: "history.forward();" });
    }
  };
  const reload = (tabId: string) => {
      if (tabId === activeTabId) {
          const activeTab = tabs.find(t => t.id === tabId);
          if (activeTab) openBrowserForTab(activeTab);
      }
  };
  
  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = async (tabId: string): Promise<string> => {
    if (!activeBrowserInstance.current) {
        return "Error: No active browser instance.";
    }
    return new Promise((resolve, reject) => {
        (activeBrowserInstance.current as any).executeScript({ code: "document.body.innerText" }, (result: any) => {
            if (result && result[0]) {
                resolve(result[0]);
            } else {
                reject("Could not retrieve page content.");
            }
        });
    });
  };

  const interactWithPage = async (tabId: string, selector: string, action: 'click' | 'type', value?: string): Promise<string> => {
     if (!activeBrowserInstance.current) {
        return Promise.reject(new Error("No active browser instance."));
    }
    const code = `(function() {
        const el = document.querySelector('${selector}');
        if (!el) return 'Error: Element not found for selector: ${selector}';
        try {
            if ('${action}' === 'click') {
                el.click();
                return 'Success: Clicked element.';
            } else if ('${action}' === 'type') {
                el.value = '${value || ''}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return 'Success: Typed into element.';
            }
            return 'Error: Unknown action.';
        } catch(e) {
            return 'Error: ' + e.message;
        }
    })();`;

    return new Promise((resolve, reject) => {
        (activeBrowserInstance.current as any).executeScript({ code }, (result: any) => {
            if (result && result[0]) {
                if (result[0].startsWith('Error:')) {
                    reject(new Error(result[0]));
                } else {
                    resolve(result[0]);
                }
            } else {
                reject(new Error("Failed to execute interaction script."));
            }
        });
    });
  };

  return { tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab, switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar, getPageContent, interactWithPage, containerRef };
};
