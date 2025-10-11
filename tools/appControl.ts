import { FunctionDeclaration, Type } from '@google/genai';
import html2canvas from 'html2canvas';
import { ToolImplementationsDependencies, View, AppSettings } from '../types';
import { normalizePath } from '../utils/path';

// --- Static Data for Settings ---
const availableVoices = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];
const availableModels = ['gemini-2.5-flash']; // Only list user-selectable chat models

// --- Function Declarations ---

export const switchViewFunction: FunctionDeclaration = {
  name: 'switchView',
  description: 'Switch the active view in the application UI.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      view: {
        type: Type.STRING,
        description: `The view to switch to. Must be one of: "${Object.values(View).join('", "')}".`,
      },
    },
    required: ['view'],
  },
};

export const openFileFunction: FunctionDeclaration = {
    name: 'openFile',
    description: 'Opens a file in the code editor, making it the active file for viewing/editing.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filename: {
          type: Type.STRING,
          description: 'The full name of the file to open, including the path from the root if in a subdirectory.',
        },
      },
      required: ['filename'],
    },
  };

export const viewActiveFileFunction: FunctionDeclaration = {
    name: 'viewActiveFile',
    description: 'Check which file the user is currently viewing in the code editor.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const viewBuildOutputFunction: FunctionDeclaration = {
    name: 'viewBuildOutput',
    description: 'View the logs from the last build process to help diagnose bundling errors.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const viewRuntimeErrorsFunction: FunctionDeclaration = {
    name: 'viewRuntimeErrors',
    description: 'View the runtime errors captured from the preview pane from the last execution.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const viewBuildEnvironmentFunction: FunctionDeclaration = {
    name: 'viewBuildEnvironment',
    description: 'Inspect the configuration of the in-browser bundler (esbuild-wasm) to understand the build environment, such as JSX settings, module resolution logic, and entry point conventions.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const viewSettingsFunction: FunctionDeclaration = {
    name: 'viewSettings',
    description: "View the application's current settings and the available options for each setting.",
    parameters: { type: Type.OBJECT, properties: {} },
};

export const updateSettingsFunction: FunctionDeclaration = {
    name: 'updateSettings',
    description: 'Update one or more of the application settings.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            aiModel: { 
                type: Type.STRING, 
                description: `The AI model to use. Available options: ${availableModels.join(', ')}` 
            },
            voiceName: {
                type: Type.STRING,
                description: `The voice for the AI assistant. Available options: ${availableVoices.join(', ')}`
            },
            gitRemoteUrl: { type: Type.STRING, description: "The Git remote URL." },
            gitUserName: { type: Type.STRING, description: "The Git user name." },
            gitUserEmail: { type: Type.STRING, description: "The Git user email." },
        },
    },
};

export const pauseListeningFunction: FunctionDeclaration = {
    name: 'pauseListening',
    description: 'Pauses listening to the microphone for a specified duration. The user will not be heard during this time.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            duration: {
                type: Type.NUMBER,
                description: 'The duration to pause listening, in seconds. Defaults to 5 if not provided.',
            },
        },
    },
};

export const stopListeningFunction: FunctionDeclaration = {
    name: 'stopListening',
    description: 'Stops the voice assistant session completely. The microphone will be turned off.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const captureScreenshotFunction: FunctionDeclaration = {
  name: 'captureScreenshot',
  description: 'Captures a screenshot of the current application view and provides it as visual context. Use this when the user asks you to look at the UI, debug a visual issue, or give feedback on the layout.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const declarations = [
    switchViewFunction,
    openFileFunction,
    viewActiveFileFunction,
    viewBuildOutputFunction,
    viewRuntimeErrorsFunction,
    viewBuildEnvironmentFunction,
    viewSettingsFunction,
    updateSettingsFunction,
    pauseListeningFunction,
    stopListeningFunction,
    captureScreenshotFunction,
];

// --- Implementations Factory ---
export const getImplementations = ({ 
    setActiveView, 
    setActiveFile, 
    activeFile, 
    bundleLogs,
    settings,
    onSettingsChange,
    files,
    sandboxErrors,
    liveSessionControls,
}: Pick<ToolImplementationsDependencies, 'setActiveView' | 'setActiveFile' | 'activeFile' | 'bundleLogs' | 'settings' | 'onSettingsChange' | 'files' | 'sandboxErrors' | 'liveSessionControls'>) => ({
    switchView: async (args: { view: View }) => {
        if (Object.values(View).includes(args.view)) {
            setActiveView(args.view);
            return { success: true };
        }
        throw new Error(`Invalid view: ${args.view}. Must be one of: ${Object.values(View).join(', ')}`);
    },
    openFile: async (args: { filename: string }) => {
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("openFile tool call is missing the required 'filename' argument.");
        }
        const filename = normalizePath(args.filename);
        if (files[filename] === undefined) {
            throw new Error(`Cannot open file: "${filename}" not found.`);
        }
        setActiveFile(filename);
        // Also switch to code view to make it obvious
        setActiveView(View.Code);
        return { success: true };
    },
    viewActiveFile: async () => {
        return { activeFile: activeFile || null };
    },
    viewBuildOutput: async () => {
        // FIX: Corrected a reference error. The `bundleLogs` variable is in scope, not `buildLogs`.
        return { buildLogs: bundleLogs };
    },
    viewRuntimeErrors: async () => {
        return { runtimeErrors: sandboxErrors };
    },
    viewBuildEnvironment: async () => {
        const convention = "Each HTML file (e.g., 'index.html') must have a corresponding TypeScript entry point (e.g., 'index.tsx').";
        return {
            bundler: 'esbuild-wasm',
            entryPointConvention: convention,
            entryPointDiscovery: `The bundler uses this file-naming convention to find the entry point. It does NOT parse HTML for <script> tags. The HTML file should not contain a module script tag, as the bundler injects the code automatically.`,
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
            moduleResolution: 'Modules are resolved first from local workspace files, then from the esm.sh CDN for packages.',
            supportedLoaders: ['tsx', 'ts', 'css', 'js', 'jsx'],
            globalDefines: {
                'process.env.NODE_ENV': '"production"',
                'global': 'window',
            },
        };
    },
    viewSettings: async () => {
        return {
            currentSettings: settings,
            availableOptions: {
                aiModel: availableModels,
                voiceName: availableVoices,
            }
        };
    },
    updateSettings: async (args: Partial<AppSettings>) => {
        const newSettings = { ...settings, ...args };
        
        // Validate settings before applying them
        if (args.voiceName && !availableVoices.includes(args.voiceName)) {
            throw new Error(`Invalid voiceName "${args.voiceName}". Please choose from: ${availableVoices.join(', ')}`);
        }
        if (args.aiModel && !availableModels.includes(args.aiModel)) {
            throw new Error(`Invalid aiModel "${args.aiModel}". Please choose from: ${availableModels.join(', ')}`);
        }

        onSettingsChange(newSettings);
        return { success: true };
    },
    pauseListening: async (args: { duration?: number }) => {
        const duration = args.duration ?? 5; // Default to 5 seconds
        liveSessionControls.pauseListening(duration, { immediate: false });
        return { success: true, message: `Listening paused for ${duration} seconds.` };
    },
    stopListening: async () => {
        liveSessionControls.stopLiveSession({ immediate: false });
        return { success: true };
    },
    captureScreenshot: async () => {
        const rootElement = document.getElementById('root');
        if (!rootElement) {
            throw new Error('Could not find the root application element to screenshot.');
        }
        // Temporarily hide the bottom nav to avoid capturing it in screenshots of the main content
        const navElement = document.querySelector('nav');
        const originalDisplay = navElement ? navElement.style.display : '';
        if (navElement) {
            navElement.style.display = 'none';
        }

        const canvas = await html2canvas(rootElement, {
            useCORS: true,
            logging: false,
            // Try to capture the entire scrolled content, not just the visible part
            windowWidth: rootElement.scrollWidth,
            windowHeight: rootElement.scrollHeight,
        });
        
        // Restore the nav
        if (navElement) {
            navElement.style.display = originalDisplay;
        }

        // Get base64 string, removing the data URL prefix
        const base64Image = canvas.toDataURL('image/png').split(',')[1];
        return { base64Image };
    },
});