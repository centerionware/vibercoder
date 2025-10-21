import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const listTabsFunction: FunctionDeclaration = {
  name: 'listTabs',
  description: 'List all currently open browser tabs.',
};

export const openTabFunction: FunctionDeclaration = {
  name: 'openTab',
  description: 'Opens a new browser tab and navigates to the specified URL.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: 'The URL to open in the new tab. Defaults to a search engine if not provided.',
      },
    },
  },
};

export const closeTabFunction: FunctionDeclaration = {
  name: 'closeTab',
  description: 'Closes a specific browser tab.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tabId: { type: Type.STRING, description: 'The ID of the tab to close.' },
    },
    required: ['tabId'],
  },
};

export const switchToTabFunction: FunctionDeclaration = {
  name: 'switchToTab',
  description: 'Switches the active browser view to a different tab.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tabId: { type: Type.STRING, description: 'The ID of the tab to make active.' },
    },
    required: ['tabId'],
  },
};

export const navigateToFunction: FunctionDeclaration = {
    name: 'navigateTo',
    description: 'Navigates an existing tab to a new URL.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            tabId: { type: Type.STRING, description: 'The ID of the tab to navigate.' },
            url: { type: Type.STRING, description: 'The new URL to load in the tab.' },
        },
        required: ['tabId', 'url'],
    },
};

export const getBrowserPageContentFunction: FunctionDeclaration = {
  name: 'getBrowserPageContent',
  description: 'Retrieves the visible text content from the currently active web page in the browser.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tabId: { type: Type.STRING, description: 'The ID of the tab to get content from.' },
    },
    required: ['tabId'],
  },
};

export const interactWithBrowserPageFunction: FunctionDeclaration = {
  name: 'interactWithBrowserPage',
  description: 'Interacts with an element on a web page, like clicking a button or typing into a field.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tabId: { type: Type.STRING, description: 'The ID of the tab to interact with.' },
      selector: { type: Type.STRING, description: 'A CSS selector to find the element.' },
      action: { type: Type.STRING, description: 'The action to perform.', enum: ['click', 'type'] },
      value: { type: Type.STRING, description: 'The text to type (required for "type" action).' },
    },
    required: ['tabId', 'selector', 'action'],
  },
};

export const declarations = [
  listTabsFunction,
  openTabFunction,
  closeTabFunction,
  switchToTabFunction,
  navigateToFunction,
  getBrowserPageContentFunction,
  interactWithBrowserPageFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ browserControlsRef }: Pick<ToolImplementationsDependencies, 'browserControlsRef'>) => {
    const getControls = () => {
        const controls = browserControlsRef.current;
        if (!controls) throw new Error("Browser controls are not available.");
        return controls;
    };

    return {
        listTabs: async () => {
            const { tabs } = getControls();
            return { tabs: tabs.map(({ id, url, title }) => ({ id, url, title })) };
        },
        openTab: async (args: { url?: string }) => {
            const { openNewTab } = getControls();
            const tabId = openNewTab(args.url);
            return { tabId };
        },
        closeTab: async (args: { tabId: string }) => {
            getControls().closeTab(args.tabId);
            return { success: true };
        },
        switchToTab: async (args: { tabId: string }) => {
            getControls().switchToTab(args.tabId);
            return { success: true };
        },
        navigateTo: async (args: { tabId: string, url: string }) => {
            getControls().navigateTo(args.tabId, args.url);
            return { success: true };
        },
        getBrowserPageContent: async (args: { tabId: string }) => {
            const controls = getControls();
            const content = await controls.getPageContent(args.tabId);
            return { content };
        },
        interactWithBrowserPage: async (args: { tabId: string, selector: string, action: 'click' | 'type', value?: string }) => {
            const controls = getControls();
            const result = await controls.interactWithPage(args.tabId, args.selector, args.action, args.value);
            return { result };
        },
    };
};