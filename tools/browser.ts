import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const openUrlFunction: FunctionDeclaration = {
  name: 'openUrl',
  description: 'Opens a web browser as a full-screen overlay to the specified URL. Any previously open browser will be closed.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING, description: 'The full URL to navigate to (e.g., "https://www.google.com").' },
    },
    required: ['url'],
  },
};

export const closeBrowserFunction: FunctionDeclaration = {
  name: 'closeBrowser',
  description: 'Closes the currently open browser overlay.',
};

export const getBrowserPageContentFunction: FunctionDeclaration = {
  name: 'getBrowserPageContent',
  description: 'Retrieves the visible text content from the currently active web page in the browser.',
};

export const interactWithBrowserPageFunction: FunctionDeclaration = {
  name: 'interactWithBrowserPage',
  description: 'Interacts with an element on the currently active web page, like clicking a button or typing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: 'A CSS selector to find the element.' },
      action: { type: Type.STRING, description: 'The action to perform.', enum: ['click', 'type'] },
      value: { type: Type.STRING, description: 'The text to type (required for "type" action).' },
    },
    required: ['selector', 'action'],
  },
};

export const searchWebFunction: FunctionDeclaration = {
  name: 'searchWeb',
  description: 'Performs a web search using Google, opening the results in a browser overlay.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query.' },
    },
    required: ['query'],
  },
};

export const declarations = [
  openUrlFunction,
  closeBrowserFunction,
  getBrowserPageContentFunction,
  interactWithBrowserPageFunction,
  searchWebFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ browserControlsRef }: Pick<ToolImplementationsDependencies, 'browserControlsRef'>) => {
    const getControls = () => {
        const controls = browserControlsRef.current;
        if (!controls) throw new Error("Browser controls are not available.");
        return controls;
    };

    return {
        openUrl: async (args: { url: string }) => {
            getControls().openUrl(args.url);
            return { success: true, message: `Browser opened to ${args.url}.` };
        },
        closeBrowser: async () => {
            getControls().closeBrowser();
            return { success: true, message: "Browser has been closed." };
        },
        getBrowserPageContent: async () => {
            const content = await getControls().getPageContent();
            return { content };
        },
        interactWithBrowserPage: async (args: { selector: string, action: 'click' | 'type', value?: string }) => {
            const result = await getControls().interactWithPage(args.selector, args.action, args.value);
            return { result };
        },
        searchWeb: async (args: { query: string }) => {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
            getControls().openUrl(searchUrl);
            return { success: true, message: `Browser opened with search results for "${args.query}".` };
        },
    };
};