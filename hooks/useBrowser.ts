import { useState, useCallback, useEffect } from 'react';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { BrowserControls } from '../types';
import { safeLocalStorage } from '../utils/environment';

// This interface defines the new, more advanced API for the native plugin
// that supports a persistent, resizable browser view.
interface AideBrowserPlugin {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  setBounds(options: { x: number; y: number; width: number; height: number; }): Promise<void>;
  executeScript<T>(options: { code: string }): Promise<{ value: T }>;
  addListener(eventName: 'pageLoaded', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'closed', listenerFunc: () => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const AideBrowser = registerPlugin<AideBrowserPlugin>('AideBrowser');

interface BrowserState {
  isOpen: boolean; // Represents if the browser instance exists natively
  isVisible: boolean; // Represents if the browser is currently shown to the user
  isPageLoaded: boolean;
  currentUrl: string;
}

const BROWSER_HISTORY_KEY = 'aide_browser_lastUrl';

export const useBrowser = () => {
  const [state, setState] = useState<BrowserState>({
    isOpen: false,
    isVisible: false,
    isPageLoaded: false,
    currentUrl: '',
  });
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const isPluginAvailable = Capacitor.isNativePlatform();

  const open = useCallback(async (url: string) => {
    if (!isPluginAvailable) return;
    await AideBrowser.open({ url });
    safeLocalStorage.setItem(BROWSER_HISTORY_KEY, url);
    setState(s => ({ ...s, isOpen: true, isPageLoaded: false, currentUrl: url }));
  }, [isPluginAvailable]);

  useEffect(() => {
    if (!isPluginAvailable) return;

    const lastUrl = safeLocalStorage.getItem(BROWSER_HISTORY_KEY);
    // Only restore if the app is freshly loaded and browser isn't open yet.
    if (lastUrl && !state.isOpen) {
      console.log(`[Browser] Restoring last session at: ${lastUrl}`);
      // The `open` function creates the instance, but it remains hidden
      // until the user navigates to the Browser view.
      open(lastUrl);
    }
  }, [isPluginAvailable, state.isOpen, open]);

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
      setState({ isOpen: false, isVisible: false, isPageLoaded: false, currentUrl: '' });
    }).then(handle => closedHandle = handle);

    return () => {
      pageLoadedHandle?.remove();
      closedHandle?.remove();
    };
  }, [isPluginAvailable]);

  const close = useCallback(async () => {
    if (!isPluginAvailable || !state.isOpen) return;
    await AideBrowser.hide();
    setState(s => ({ ...s, isVisible: false }));
  }, [isPluginAvailable, state.isOpen]);

  const show = useCallback(async () => {
    if (!isPluginAvailable || !state.isOpen || state.isVisible) return;
    await AideBrowser.show();
    setState(s => ({ ...s, isVisible: true }));
  }, [isPluginAvailable, state.isOpen, state.isVisible]);

  const hide = useCallback(async () => {
    if (!isPluginAvailable || !state.isOpen || !state.isVisible) return;
    await AideBrowser.hide();
    setState(s => ({ ...s, isVisible: false }));
  }, [isPluginAvailable, state.isOpen, state.isVisible]);

  useEffect(() => {
    if (!isPluginAvailable || !container) return;

    const observer = new ResizeObserver(entries => {
      if (!entries || entries.length === 0 || !state.isOpen) return;
      const rect = entries[0].target.getBoundingClientRect();
      
      AideBrowser.setBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    });

    observer.observe(container);
    
    // Initial bounds setting
    const rect = container.getBoundingClientRect();
    AideBrowser.setBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
    });


    return () => observer.disconnect();
  }, [isPluginAvailable, state.isOpen, container]);

  const executeScript = useCallback(async <T extends any>(code: string): Promise<{ value: T } | null> => {
    if (!isPluginAvailable || !state.isOpen) {
        console.warn('Cannot execute script, browser not available or not open.');
        return null;
    }
    try {
        const result = await AideBrowser.executeScript<T>({ code });
        return result;
    } catch (e) {
        console.error("Error executing browser script:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        // Return an error structure that the AI can understand
        return { value: `Error: ${errorMessage}` as any };
    }
  }, [isPluginAvailable, state.isOpen]);


  const getPageContent = useCallback(async () => {
    const script = `
      (function() {
        let aideIdCounter = 0;
        const interestingTags = new Set(['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'LABEL', 'IMG']);

        function simplifyNode(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            return text ? { tag: 'text', text: text } : null;
          }

          if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') {
            return null;
          }

          let current = node;
          while (current) {
              const style = window.getComputedStyle(current);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                  return null;
              }
              current = current.parentElement;
          }

          const isInteresting = interestingTags.has(node.tagName);
          const simplified = {
            tag: node.tagName.toLowerCase(),
            attributes: {},
            children: []
          };
          
          const isInteractable = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);

          if (isInteractable) {
            aideIdCounter++;
            const aideId = 'aide-' + aideIdCounter;
            node.dataset.aideId = aideId;
            simplified.attributes.aideId = aideId;
          }

          const attrsToKeep = ['href', 'aria-label', 'placeholder', 'type', 'name', 'value', 'alt', 'src'];
          for (const attr of attrsToKeep) {
            if (node.hasAttribute(attr)) {
              simplified.attributes[attr] = node.getAttribute(attr);
            }
          }
          
          let directText = '';
          for (const child of Array.from(node.childNodes)) {
              if (child.nodeType === Node.TEXT_NODE) {
                  directText += child.textContent;
              }
          }
          directText = directText.trim();
          if (directText) {
              simplified.text = directText;
          }

          for (const child of Array.from(node.childNodes)) {
            const simplifiedChild = simplifyNode(child);
            if (simplifiedChild) {
              simplified.children.push(simplifiedChild);
            }
          }
          
          if (simplified.children.length === 1 && simplified.children[0].tag === 'text' && !simplified.text) {
              simplified.text = simplified.children[0].text;
              simplified.children = [];
          }

          if (!isInteresting && simplified.children.length === 0 && !simplified.text) {
              return null;
          }
          if (!isInteresting && simplified.children.length > 0) {
              return simplified.children;
          }

          return simplified;
        }
        
        try {
            const simplifiedBody = simplifyNode(document.body);
            return JSON.stringify(simplifiedBody, null, 2);
        } catch(e) {
            return JSON.stringify({ error: 'Failed to simplify page content: ' + e.message });
        }
      })();
    `;

    const result = await executeScript<string>(script);
    if (typeof result?.value === 'string' && result.value !== 'null') {
      try {
        const jsResultString = JSON.parse(result.value);
        return JSON.parse(jsResultString);
      } catch (e) {
        console.error("Failed to parse simplified page content from browser script:", e, result.value);
        return { error: `Failed to parse page content. Raw value: ${result.value}` };
      }
    }
    return { error: 'Could not retrieve page content.' };
  }, [executeScript]);

  const interactWithPage = useCallback(async (selector: string, action: 'click' | 'type', value?: string) => {
    const script = `
      (function() {
        try {
          const selector = '${selector.replace(/'/g, "\\'")}';
          let el = document.querySelector(\`[data-aide-id="\${selector}"]\`);

          if (!el) {
            el = document.querySelector(selector);
          }

          if (!el) {
            return JSON.stringify({ error: 'Element not found with selector: ' + selector });
          }

          if ('${action}' === 'click') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          } else if ('${action}' === 'type') {
            if ('${value || ''}' === undefined) {
                 return JSON.stringify({ error: 'A "value" must be provided for the "type" action.'});
            }
            el.focus();
            el.value = '${(value || '').replace(/'/g, "\\'")}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
          }
          return JSON.stringify({ success: true, message: 'Interaction successful.' });
        } catch(e) {
          return JSON.stringify({ error: e.message });
        }
      })();
    `;
    const result = await executeScript<string>(script);
    try {
        if (result?.value && result.value !== 'null') {
            const jsResultString = JSON.parse(result.value);
            const parsed = JSON.parse(jsResultString);
            if (parsed.error) {
                return `Error: ${parsed.error}`;
            }
            return parsed.message || 'Success';
        }
    } catch (e) {
        console.error("Failed to parse interaction result from browser script:", e, result?.value);
        return `Error: Failed to process script result. It might not be valid JSON. Raw value: ${result?.value}`;
    }
    return 'Error: Script execution returned no result.';
  }, [executeScript]);
  
  const captureBrowserScreenshot = useCallback(async () => {
    console.warn("captureBrowserScreenshot is not implemented for this native view.");
    return '';
  }, []);

  const controls: BrowserControls = {
    open, close, show, hide, setContainer, getPageContent, interactWithPage, captureBrowserScreenshot
  };

  return { state, controls };
};