import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, View } from '../types';

// --- Function Declarations ---

export const openUrlFunction: FunctionDeclaration = {
  name: 'openUrl',
  description: 'Opens a web browser in the dedicated browser view to the specified URL. If the browser is already open, it navigates to the new URL.',
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
  description: 'Closes and destroys the current browser view.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const getBrowserPageContentFunction: FunctionDeclaration = {
  name: 'getBrowserPageContent',
  description: "Retrieves the HTML content of the document's body from the currently active web page in the browser. Use this to 'see' the structure of the page and find CSS selectors for interaction.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
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
  description: 'Performs a web search using Google, opening the results in the browser view.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query.' },
    },
    required: ['query'],
  },
};

export const captureBrowserScreenshotFunction: FunctionDeclaration = {
  name: 'captureBrowserScreenshot',
  description: 'Captures a screenshot of the content inside the currently open web browser. Use this as your "eyes" to see the content of external websites.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const declarations = [
  openUrlFunction,
  closeBrowserFunction,
  getBrowserPageContentFunction,
  interactWithBrowserPageFunction,
  searchWebFunction,
  captureBrowserScreenshotFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ browserControlsRef, setActiveView }: Pick<ToolImplementationsDependencies, 'browserControlsRef' | 'setActiveView'>) => {
    const getControls = () => {
        const controls = browserControlsRef.current;
        if (!controls) throw new Error("Browser controls are not available.");
        return controls;
    };

    return {
        openUrl: async (args: { url: string }) => {
            await getControls().open(args.url);
            setActiveView(View.Browser);
            return { success: true, message: `Browser opened to ${args.url}.` };
        },
        closeBrowser: async () => {
            await getControls().close();
            // The logic to switch to the previous view is handled by app logic reacting to the browser state.
            return { success: true, message: "Browser has been closed." };
        },
        getBrowserPageContent: async () => {
            const content = await getControls().getPageContent();
            return { content };
        },
        interactWithBrowserPage: async (args: { selector: string, action: 'click' | 'type', value?: string }) => {
            const result = await getControls().interactWithPage(args.selector, args.action, args.value);
            if (result.startsWith('Error:')) {
                throw new Error(result);
            }
            return { result };
        },
        searchWeb: async (args: { query: string }) => {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(args.query)}`;
            await getControls().open(searchUrl);
            setActiveView(View.Browser);
            return { success: true, message: `Browser opened with search results for "${args.query}".` };
        },
        captureBrowserScreenshot: async () => {
            const base64Image = await getControls().captureBrowserScreenshot();
            if (!base64Image) {
                return { base64Image: null, message: "Screenshot capture is not supported in this browser implementation." };
            }
            return { base64Image };
        },
    };
};