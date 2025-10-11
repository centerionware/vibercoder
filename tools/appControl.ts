import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, View, AppSettings } from '../types';
import { normalizePath } from '../utils/path';

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
    description: "View the application's current settings.",
    parameters: { type: Type.OBJECT, properties: {} },
};

export const updateSettingsFunction: FunctionDeclaration = {
    name: 'updateSettings',
    description: 'Update one or more of the application settings.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            aiModel: { type: Type.STRING, description: "The AI model to use." },
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
];

// --- Implementations Factory ---
// Note: pauseListening and stopListening are implemented directly in the useAiLive hook
// as they need access to the hook's internal state and methods.
export const getImplementations = ({ 
    setActiveView, 
    setActiveFile, 
    activeFile, 
    bundleLogs,
    settings,
    onSettingsChange,
    files, // Need files to check if the file exists before opening
    sandboxErrors,
}: Pick<ToolImplementationsDependencies, 'setActiveView' | 'setActiveFile' | 'activeFile' | 'bundleLogs' | 'settings' | 'onSettingsChange' | 'files' | 'sandboxErrors'>) => ({
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
        return {
            bundler: 'esbuild-wasm',
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
            entryPointConvention: 'For an active HTML file like "index.html", the bundler looks for a corresponding entry point like "index.tsx".',
            moduleResolution: 'Modules are resolved first from local workspace files, then from the esm.sh CDN for packages.',
            supportedLoaders: ['tsx', 'ts', 'css'],
            globalDefines: {
                'process.env.NODE_ENV': '"production"',
                'global': 'window',
            },
        };
    },
    viewSettings: async () => {
        return { settings };
    },
    updateSettings: async (args: Partial<AppSettings>) => {
        onSettingsChange({ ...settings, ...args });
        return { success: true };
    },
});