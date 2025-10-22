import { FunctionDeclaration, Type } from '@google/genai';
import html2canvas from 'html2canvas';
import { ToolImplementationsDependencies, View, AppSettings, PreviewLogEntry } from '../types';
import { normalizePath } from '../utils/path';
// FIX: Import `postMessageToPreviewAndWait` to make it available for the `interactWithPreview` tool.
import { getPreviewState, postMessageToPreviewAndWait } from '../utils/preview';

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
        description: `The view to switch to. Must be one of: "${Object.values(View).filter(v => v !== 'prompts').join('", "')}".`,
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
};

export const viewBuildOutputFunction: FunctionDeclaration = {
    name: 'viewBuildOutput',
    description: 'View the logs from the last build process to help diagnose bundling errors.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            level: {
                type: Type.STRING,
                description: "Optional. Filter logs to show only errors or all logs.",
                enum: ['error', 'all']
            }
        },
    },
};

export const viewConsoleLogsFunction: FunctionDeclaration = {
  name: 'viewConsoleLogs',
  description: 'View console logs (log, warn, error) captured from the running application preview. This is the primary tool for debugging runtime issues.',
  parameters: {
    type: Type.OBJECT,
    properties: {
        level: {
            type: Type.STRING,
            description: "Optional. Filter logs by a specific level.",
            enum: ['error', 'warn', 'log', 'all']
        }
    },
  },
};

export const viewBuildEnvironmentFunction: FunctionDeclaration = {
    name: 'viewBuildEnvironment',
    description: 'Inspect the configuration of the in-browser bundler (esbuild-wasm) to understand the build environment, such as JSX settings, module resolution logic, and entry point conventions.',
};

export const viewSettingsFunction: FunctionDeclaration = {
    name: 'viewSettings',
    description: "View the application's current settings and the available options for each setting.",
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
};

export const captureScreenshotFunction: FunctionDeclaration = {
  name: 'captureScreenshot',
  description: "Captures a real-time screenshot of the user's entire application window, exactly as they see it. Use this tool as your 'eyes' to analyze the UI, read text, inspect layouts, or see the output of code. Your subsequent analysis MUST be grounded exclusively in the content of the image provided by this tool.",
};

export const enableScreenshotPreviewFunction: FunctionDeclaration = {
    name: 'enableScreenshotPreview',
    description: 'Re-enables the screenshot preview modal if the user has previously disabled it for the session. Use this if the user asks to see the screenshots again.',
};

export const interactWithPreviewFunction: FunctionDeclaration = {
  name: 'interactWithPreview',
  description: 'Interacts with an element inside the live preview iframe, like clicking a button or typing in an input field. Use this to test application behavior or manipulate the UI state.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: {
        type: Type.STRING,
        description: 'A CSS selector to identify the target element (e.g., "#my-button", ".form-input", "button[type=submit]").',
      },
      action: {
        type: Type.STRING,
        description: "The action to perform on the element.",
        enum: ['click', 'type', 'focus', 'blur'],
      },
      value: {
        type: Type.STRING,
        description: 'Optional. The text value to type into the element. Required for the "type" action.',
      },
    },
    required: ['selector', 'action'],
  },
};

export const enableLiveVideoFunction: FunctionDeclaration = {
  name: 'enableLiveVideo',
  description: 'Enables the live video stream of the user\'s screen. The stream provides a 1 FPS feed and acts as your "eyes", providing visual context for your next turn. It will automatically disable after 30 seconds to save resources. Use this when you need to see the UI to perform a task or answer a visual question.',
};

export const disableLiveVideoFunction: FunctionDeclaration = {
  name: 'disableLiveVideo',
  description: 'Manually disables the live video stream. The stream also disables automatically after a short period, so this is only needed for explicit control.',
};

export const declarations = [
    switchViewFunction,
    openFileFunction,
    viewActiveFileFunction,
    viewBuildOutputFunction,
    viewConsoleLogsFunction,
    viewBuildEnvironmentFunction,
    viewSettingsFunction,
    updateSettingsFunction,
    pauseListeningFunction,
    stopListeningFunction,
    captureScreenshotFunction,
    enableScreenshotPreviewFunction,
    interactWithPreviewFunction,
    enableLiveVideoFunction,
    disableLiveVideoFunction,
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
    previewConsoleLogs,
    // FIX: Destructure the ref instead of the value to break a circular dependency.
    liveSessionControlsRef,
    activeView,
    setScreenshotPreview,
    isScreenshotPreviewDisabled,
    setIsScreenshotPreviewDisabled,
}: ToolImplementationsDependencies) => ({
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
    viewBuildOutput: async (args: { level?: 'error' | 'all' }) => {
        const level = args.level || 'all';
        if (level === 'error') {
            const errors = bundleLogs.filter(log => /error/i.test(log) || /failed/i.test(log));
            return { buildErrors: errors };
        }
        return { buildLogs: bundleLogs };
    },
    viewConsoleLogs: async (args: { level?: 'error' | 'warn' | 'log' | 'all' }) => {
        const level = args.level || 'all';
        if (level === 'all') {
            const formattedLogs = previewConsoleLogs.map(log => `[${log.type.toUpperCase()}] ${log.message}`);
            return { consoleLogs: formattedLogs };
        }
        const filteredLogs = previewConsoleLogs
            .filter(log => log.type === level)
            .map(log => log.message);
        return { consoleLogs: filteredLogs };
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
                'process.env.API_KEY': `"${process.env.API_KEY}"`,
                global: 'window',
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
        // FIX: Access the controls via the ref's `.current` property.
        liveSessionControlsRef.current?.pauseListening(duration, { immediate: false });
        return { success: true, message: `Listening paused for ${duration} seconds.` };
    },
    stopListening: async () => {
        // FIX: Access the controls via the ref's `.current` property.
        liveSessionControlsRef.current?.stopLiveSession({ immediate: false });
        return { success: true };
    },
    captureScreenshot: async () => {
        const captureTarget = document.getElementById('app-container');
        if (!captureTarget) throw new Error('Could not find app container to capture.');

        // Get the preview state only if the preview view is active.
        const previewState = activeView === View.Preview ? await getPreviewState() : null;

        const canvas = await html2canvas(captureTarget, {
            useCORS: true,
            logging: false,
            allowTaint: true,
            onclone: (clonedDoc) => {
                const clonedIframe = clonedDoc.querySelector('#preview-iframe') as HTMLIFrameElement | null;
                
                if (clonedIframe && previewState?.htmlContent) {
                    const rect = clonedIframe.getBoundingClientRect();
                    const replacementDiv = clonedDoc.createElement('div');
                    replacementDiv.style.width = `${rect.width}px`;
                    replacementDiv.style.height = `${rect.height}px`;

                    try {
                        const shadow = replacementDiv.attachShadow({ mode: 'open' });
                        shadow.innerHTML = previewState.htmlContent;
                        
                        if (previewState.videoFrameDataUrl && previewState.videoFrameRect) {
                            const videoEl = shadow.querySelector('video');
                            if (videoEl) {
                                const img = clonedDoc.createElement('img');
                                img.src = previewState.videoFrameDataUrl;
                                const wrapper = clonedDoc.createElement('div');
                                wrapper.style.position = 'relative';
                                videoEl.parentNode?.insertBefore(wrapper, videoEl);
                                
                                img.style.position = 'absolute';
                                img.style.left = `${previewState.videoFrameRect.left}px`;
                                img.style.top = `${previewState.videoFrameRect.top}px`;
                                img.style.width = `${previewState.videoFrameRect.width}px`;
                                img.style.height = `${previewState.videoFrameRect.height}px`;
                                
                                wrapper.appendChild(img);
                                videoEl.style.visibility = 'hidden';
                            }
                        }
                    } catch (e) {
                        console.error("Error reconstructing preview in screenshot clone:", e);
                    }
                    
                    clonedIframe.parentNode?.replaceChild(replacementDiv, clonedIframe);
                }
            },
        });

        const dataURL = canvas.toDataURL('image/png');
        
        if (!isScreenshotPreviewDisabled) {
            setScreenshotPreview(dataURL);
        }
        
        const base64Image = dataURL.split(',')[1];
        return { base64Image };
    },
    enableScreenshotPreview: async () => {
        setIsScreenshotPreviewDisabled(false);
        return { success: true, message: "Screenshot preview has been re-enabled for this session." };
    },
    interactWithPreview: async (args: { selector: string; action: string; value?: string }) => {
        try {
            const { message } = await postMessageToPreviewAndWait<{ message: string }>(
                { type: 'interact-with-element', payload: args },
                'interaction-success',
                'interaction-error'
            );
            return { success: true, message };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Interaction failed in preview: ${message}`);
        }
    },
    enableLiveVideo: async () => {
        // FIX: Access the controls via the ref's `.current` property.
        liveSessionControlsRef.current?.enableVideoStream();
        return { 
            success: true, 
            message: 'Live video stream enabled. It will automatically disable after 30 seconds.',
            instruction: 'The video stream is now active. Your next turn should be to analyze the visual information and respond to the user\'s original request.'
        };
    },
    disableLiveVideo: async () => {
        // FIX: Access the controls via the ref's `.current` property.
        liveSessionControlsRef.current?.disableVideoStream();
        return { success: true, message: 'Live video stream disabled.' };
    },
});