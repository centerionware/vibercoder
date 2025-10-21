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
  const browserInstances = useRef<Record<string, InAppBrowser>>({});
  const browserElements = useRef<Record<string, HTMLElement>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState({}); // To trigger re-renders for layout effects

  // Load tabs from localStorage on initial mount
  useEffect(() => {
    try {
      const savedTabs = safeLocalStorage.getItem(BROWSER_TABS_KEY);
      const savedActiveTabId = safeLocalStorage.getItem(ACTIVE_TAB_ID_KEY);
      if (savedTabs) {
        const parsedTabs = JSON.parse(savedTabs);
        if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
            setTabs(parsedTabs);
            if (savedActiveTabId && parsedTabs.some((t: BrowserTab) => t.id === savedActiveTabId)) {
            setActiveTabId(savedActiveTabId);
            } else {
            setActiveTabId(parsedTabs[0].id);
            }
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
      // FIX: Explicitly type `el` as HTMLElement to allow calling the .remove() method.
      Object.values(browserElements.current).forEach((el: HTMLElement) => el.remove());
    };
  }, []);

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, ...updates, lastUpdated: Date.now() } : tab
      )
    );
  }, []);

  const findAndAssociateElement = useCallback((tabId: string, attempt = 0) => {
    if (attempt > 20) { // Give up after 2 seconds
        console.error(`Could not find browser element for tab ${tabId}`);
        return;
    }
    // Find all iframes not belonging to our app UI
    const allIframes = Array.from(document.querySelectorAll('iframe:not(#preview-iframe)'));
    const knownElements = Object.values(browserElements.current);
    // FIX: Explicitly type `el` as HTMLElement to allow calling .querySelector().
    const knownIframes = knownElements.map((el: HTMLElement) => el.querySelector('iframe')).filter(Boolean);
    const newIframe = allIframes.find(iframe => !knownIframes.includes(iframe));

    if (newIframe) {
        let wrapper = newIframe.parentElement;
        // The cordova-plugin-inappbrowser on web platform creates a div wrapper that is a direct child of body
        while(wrapper && wrapper.parentElement !== document.body) {
            wrapper = wrapper.parentElement;
        }
        if (wrapper && wrapper.tagName === 'DIV') {
            console.log(`Associated browser DOM element for tab ${tabId}`);
            browserElements.current[tabId] = wrapper;
            forceUpdate({}); // Trigger layout effect to position it
        } else {
            setTimeout(() => findAndAssociateElement(tabId, attempt + 1), 100);
        }
    } else {
        setTimeout(() => findAndAssociateElement(tabId, attempt + 1), 100);
    }
  }, []);
  
  // Effect to manage the browser instances themselves (creating/destroying)
  useEffect(() => {
      // Cleanup: Close instances for tabs that no longer exist
      const openTabIds = new Set(tabs.map(t => t.id));
      Object.keys(browserInstances.current).forEach(tabId => {
          if (!openTabIds.has(tabId)) {
              browserInstances.current[tabId]?.close();
              browserElements.current[tabId]?.remove();
              delete browserInstances.current[tabId];
              delete browserElements.current[tabId];
          }
      });

      const activeTab = tabs.find(t => t.id === activeTabId);

      if (activeTab && !browserInstances.current[activeTab.id]) {
          if (!window.cordova || !window.cordova.InAppBrowser) {
              console.error("Cordova InAppBrowser plugin not found. Browser functionality is disabled.");
              updateTab(activeTab.id, { isLoading: false, title: "Error: Plugin not found" });
              return;
          }

          updateTab(activeTab.id, { isLoading: true });
          
          const iab = window.cordova.InAppBrowser.open(activeTab.url, '_blank', 'location=no,toolbar=no,zoom=no,hidden=yes');
          browserInstances.current[activeTab.id] = iab;
          findAndAssociateElement(activeTab.id);

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
      
  }, [tabs, activeTabId, updateTab, findAndAssociateElement]);

  // Main layout effect for DOM manipulation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeElement = activeTabId ? browserElements.current[activeTabId] : null;

    // Hide all browser elements first
    // FIX: Explicitly type `el` as HTMLElement to allow accessing the .style property.
    Object.values(browserElements.current).forEach((el: HTMLElement) => {
        el.style.display = 'none';
    });

    if (activeElement && isBrowserViewActive) {
        // This is the element we want to show. Move it into our container.
        if (activeElement.parentElement !== container) {
            container.appendChild(activeElement);
        }
        
        // Force styles to make it behave
        Object.assign(activeElement.style, {
            position: 'relative',
            top: '0', left: '0',
            width: '100%', height: '100%',
            zIndex: '1',
            display: 'block'
        });

        // Also style the iframe within it
        const iframe = activeElement.querySelector('iframe');
        if (iframe) {
            Object.assign(iframe.style, {
                width: '100%',
                height: '100%',
                border: 'none'
            });
        }
    }
  }, [activeTabId, isBrowserViewActive, tabs, containerRef.current]);


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
      // Re-create the instance to navigate, which is how IAB works
      const instance = browserInstances.current[tabId];
      if (instance) {
        instance.close();
        delete browserInstances.current[tabId];
      }
      const element = browserElements.current[tabId];
      if(element) {
        element.remove();
        delete browserElements.current[tabId];
      }
      
      updateTab(tabId, { url, title: 'Loading...', favicon: getFaviconUrl(url), isLoading: true });

      if (tabId !== activeTabId) setActiveTabId(tabId);
      else forceUpdate({}); // Force re-creation if already active
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