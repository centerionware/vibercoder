import { useState, useCallback, useEffect, useRef } from 'react';
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
  const openingTabIdRef = useRef<string | null>(null);

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
    } catch (e) { console.error("Failed to load browser tabs from localStorage", e); }
  }, []);

  // Save tabs to localStorage whenever they change
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
  
  const applyLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeElement = activeTabId ? browserElements.current[activeTabId] : null;

    // Hide all browser elements that aren't the active one (or if the browser view is inactive)
    Object.entries(browserElements.current).forEach(([tabId, el]) => {
      const shouldBeVisible = tabId === activeTabId && isBrowserViewActive;
      (el as HTMLElement).style.display = shouldBeVisible ? 'block' : 'none';
    });

    // If there's an active element that should be visible, ensure it's in the container and styled correctly.
    if (activeElement && isBrowserViewActive) {
      if (activeElement.parentElement !== container) {
        container.appendChild(activeElement);
      }
      activeElement.setAttribute('style', `
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        display: block !important;
        position: relative !important;
        top: auto !important;
        left: auto !important;
      `);
    }
  }, [activeTabId, isBrowserViewActive]);

  // This effect just calls the layout function when the active state changes.
  useEffect(() => {
    applyLayout();
  }, [activeTabId, isBrowserViewActive, applyLayout]);
  
  // This effect sets up the MutationObserver to hijack the plugin's DOM element.
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          // Check if the added node is the one we're looking for.
          if (node instanceof HTMLElement && node.classList.contains('inappbrowser_wrapper')) {
            const newTabId = openingTabIdRef.current;
            if (newTabId) {
              const iframe = node.querySelector('iframe');
              if (iframe) {
                console.log(`[MutationObserver] Hijacked iframe for new tab ${newTabId}`);
                // Store the IFRAME element itself, not the wrapper
                browserElements.current[newTabId] = iframe;
                
                // Hide the original wrapper to prevent it from creating an overlay
                node.style.display = 'none';

                openingTabIdRef.current = null; // Reset the flag
                
                // Immediately apply the correct layout to this new element.
                applyLayout();
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [applyLayout]);

  // This effect manages the actual InAppBrowser instances.
  useEffect(() => {
    // Cleanup instances for closed tabs
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

    // Create a new instance if one doesn't exist for the active tab
    if (activeTab && !browserInstances.current[activeTab.id]) {
        if (!window.cordova?.InAppBrowser) { return; }
        
        updateTab(activeTab.id, { isLoading: true });
        
        // Set a flag so the MutationObserver knows which tab this new element belongs to.
        openingTabIdRef.current = activeTab.id;

        const iab = window.cordova.InAppBrowser.open(activeTab.url, '_blank', 'location=no,toolbar=no,zoom=no,hidden=yes');
        browserInstances.current[activeTab.id] = iab;

        iab.addEventListener('loadstart', (e) => updateTab(activeTab.id, { isLoading: true, url: e.url }));
        iab.addEventListener('loadstop', (e) => {
            iab.executeScript({ code: "document.title" }, (values) => {
                const title = values[0] || e.url;
                updateTab(activeTab.id, { isLoading: false, url: e.url, title, favicon: getFaviconUrl(e.url) });
            });
        });
        iab.addEventListener('loaderror', (e) => updateTab(activeTab.id, { isLoading: false, title: `Error: ${e.message}` }));
        
        // This triggers the plugin to add its element to the DOM, which our MutationObserver will then catch.
        iab.show();
    }
  }, [tabs, activeTabId, updateTab]);

  const openNewTab = useCallback((url: string = 'https://google.com') => {
    const newTab: BrowserTab = { id: uuidv4(), url, title: 'New Tab', favicon: getFaviconUrl(url), isLoading: true, lastUpdated: Date.now() };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
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

  const switchToTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const navigateTo = (tabId: string, url: string) => {
    browserInstances.current[tabId]?.close();
    browserElements.current[tabId]?.remove();
    delete browserInstances.current[tabId];
    delete browserElements.current[tabId];

    updateTab(tabId, { url, title: 'Loading...', favicon: getFaviconUrl(url), isLoading: true });
    setActiveTabId(tabId);
  };
  
  const executeScriptOnTab = <T extends any>(tabId: string, script: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const instance = browserInstances.current[tabId];
      if (!instance) return reject(new Error(`No instance for tab ${tabId}`));
      instance.executeScript({ code: script }, (result) => resolve(result?.[0] as T));
    });
  };
  
  const goBack = async (tabId: string) => executeScriptOnTab(tabId, 'history.back();');
  const goForward = async (tabId: string) => executeScriptOnTab(tabId, 'history.forward();');
  const reload = async (tabId: string) => executeScriptOnTab(tabId, 'location.reload();');
  const toggleTabBar = () => setIsTabBarCollapsed(p => !p);

  const getPageContent = (tabId: string) => executeScriptOnTab<string>(tabId, 'document.body.innerText');

  const interactWithPage = (tabId: string, selector: string, action: 'click' | 'type', value?: string) => {
    const script = `(function(){try{const el=document.querySelector('${selector.replace(/'/g, "\\'")}');if(!el)return'Error: Element not found';switch('${action}'){case'click':el.click();return'Click performed.';case'type':el.value='${(value||'').replace(/'/g,"\\'")}',el.dispatchEvent(new Event('input',{bubbles:true})),el.dispatchEvent(new Event('change',{bubbles:true}));return'Type performed.';default:return'Error: Unknown action.'}}catch(e){return'Error: '+e.message}})()`;
    return executeScriptOnTab<string>(tabId, script);
  };

  return { tabs, activeTabId, isTabBarCollapsed, openNewTab, closeTab, switchToTab, navigateTo, goBack, goForward, reload, toggleTabBar, getPageContent, interactWithPage, containerRef };
};
