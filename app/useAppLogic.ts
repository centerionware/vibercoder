


// =================================================================================================
// ARCHITECTURAL NOTE: This file is an ORCHESTRATOR.
//
// Its primary purpose is to compose smaller, feature-specific custom hooks together.
// It should contain minimal to no actual feature logic itself.
//
// When adding a new feature, DO NOT add the logic directly to this file.
// Instead, follow this pattern:
// 1. Create a new, dedicated custom hook for the feature (e.g., `hooks/useNewFeature.ts`).
// 2. Encapsulate all state and logic for that feature within the new hook.
// 3. Import and call the new hook from within `useAppLogic`.
// 4. Wire the new hook's props and return values into the main application state.
//
// This approach keeps the application modular, stable, and easier to maintain.
// =================================================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
// FIX: Import `Project` to resolve the 'Cannot find name' error.
// FIX: Import `LiveSessionControls` to correctly type the ref for live session methods.
import { View, GitService, UseAiLiveProps, GitCredential, AppSettings, GitAuthor, LiveSessionControls, PreviewLogEntry, Project } from '../types';

// Core Data Hooks
import { useFiles } from '../hooks/useFiles';
import { useThreads } from '../hooks/useThreads';
import { useSettings } from '../hooks/useSettings';
import { useProjects } from '../hooks/useProjects';
import { useGitCredentials } from '../hooks/useGitCredentials';
import { usePrompts } from '../hooks/usePrompts';

// AI Hooks
import { useAiChat } from '../hooks/useAiChat';
import { useAiLive } from '../hooks/useAiLive';
import { useWakeWord } from '../hooks/useWakeWord';
import { usePreviewBundler } from '../hooks/usePreviewBundler';

// Services
import { createGitService } from '../services/gitService';
import { createToolImplementations } from '../services/toolOrchestrator';

// New Refactored Logic Hooks
import { useUIState } from '../hooks/useUIState';
import { useVFS } from '../hooks/useVFS';
import { useGitLogic } from '../hooks/useGitLogic';
import { useDebug } from '../hooks/useDebug';
import { isNativeEnvironment } from '../utils/environment';

export const useAppLogic = () => {
    // --- 1. Core Data Hooks ---
    const { settings, setSettings, isSettingsLoaded } = useSettings();
    const { projects, activeProject, createNewProject, switchProject, deleteProject, updateProject } = useProjects();
    const { files, setFiles, activeFile, setActiveFile, onWriteFile, onRemoveFile } = useFiles();
    const { gitCredentials, createGitCredential, deleteGitCredential, setDefaultGitCredential } = useGitCredentials();
    const { prompts, createPrompt, updatePrompt, revertToVersion, deletePrompt: deletePromptHook } = usePrompts();
    const { threads, activeThread, activeThreadId, createNewThread, switchThread, deleteThread, addMessage, updateMessage, updateHistory, updateThread } = useThreads(activeProject?.id || null);

    // --- 2. Refactored Logic Hooks ---
    const uiState = useUIState();
    const { debugLogs, handleClearDebugLogs } = useDebug();
    const vfs = useVFS(activeThread, files, setFiles);
    
    // --- 3. Git Service and Logic ---
    const gitServiceRef = useRef<GitService | null>(null);
    const [isCloning, setIsCloning] = useState(false);
    const [cloningProgress, setCloningProgress] = useState<string | null>(null);
    
    const getAuth = useCallback((operation: 'read' | 'write'): ({ token: string | undefined; author: GitAuthor; proxyUrl: string; }) | null => {
        const projectGitSettings = activeProject?.gitSettings || { source: 'global' };
        let credential: GitCredential | undefined;
        let finalSettings: Partial<AppSettings> = {};

        switch (projectGitSettings.source) {
            case 'specific':
                credential = gitCredentials.find(c => c.id === projectGitSettings.credentialId);
                break;
            case 'default':
                credential = gitCredentials.find(c => c.isDefault);
                break;
            case 'custom':
                // FIX: Map the properties from the 'custom' git settings object to the expected 'Partial<AppSettings>' type.
                if (projectGitSettings.custom) {
                    finalSettings = {
                        gitUserName: projectGitSettings.custom.userName,
                        gitUserEmail: projectGitSettings.custom.userEmail,
                        gitAuthToken: projectGitSettings.custom.authToken,
                        gitCorsProxy: projectGitSettings.custom.corsProxy,
                    };
                }
                break;
            case 'global':
            default:
                break;
        }

        const author = {
            name: finalSettings.gitUserName || settings.gitUserName,
            email: finalSettings.gitUserEmail || settings.gitUserEmail,
        };
        // FIX: Correctly access 'gitAuthToken' on 'finalSettings' to match the 'AppSettings' type.
        const token = finalSettings.gitAuthToken || credential?.token || settings.gitAuthToken;
        const proxyUrl = finalSettings.gitCorsProxy || settings.gitCorsProxy;
        
        if (operation === 'write' && (!author.name || !author.email)) return null;

        return { token, author, proxyUrl };
    }, [activeProject, settings, gitCredentials]);

    useEffect(() => {
        gitServiceRef.current = createGitService(true, activeProject?.id || null, getAuth);
    }, [activeProject?.id, getAuth]);

    const gitLogic = useGitLogic({
        gitServiceRef, activeProject, files, setFiles, setActiveFile,
    });
    
    const handleClone = async (url: string, name: string, credentialId?: string | null) => {
        setIsCloning(true);
        setCloningProgress("Creating new project...");
        let tempGitService: GitService | null = null;
        let newProject: Project | null = null;
        try {
            // Create the project entry first, but don't switch to it yet.
            newProject = await createNewProject(name, false, url, { source: 'specific', credentialId: credentialId || undefined });
            
            // Create a temporary, dedicated git service for this new project ID.
            tempGitService = createGitService(true, newProject.id, (op) => getAuth(op)); // Pass getAuth to create a valid closure
            if (!tempGitService || !tempGitService.isReal) {
                throw new Error("Git is not initialized. Cannot clone.");
            }
            
            setCloningProgress("Initializing clone...");
            const { files: clonedFiles } = await tempGitService.clone(url, (progress) => {
                setCloningProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
            });
            
            // Now, switch to the project and set the files.
            switchProject(newProject.id);
            setFiles(clonedFiles);

        } catch (e) {
            console.error("Clone failed:", e);
            let errorMessage = e instanceof Error ? e.message : String(e);
            
            // If the project was created but clone failed, delete it to avoid leaving an empty project.
            if (newProject) {
                deleteProject(newProject.id);
            }

            if (errorMessage.toLowerCase().includes('network error')) {
                errorMessage += '\n\nThis often means the CORS proxy is unavailable, rate-limiting requests, or being blocked. \n\n1. Please check your network connection and try again. \n2. For a more reliable connection, we highly recommend deploying your own CORS proxy and configuring its URL in Settings > Git Configuration.';
            }
            
            alert(`Clone failed: ${errorMessage}`);
        } finally {
            setIsCloning(false);
            setCloningProgress(null);
        }
    };

    // --- 4. Main UI State & Bundler ---
    const [activeView, setActiveView] = useState<View>(View.Ai);
    const [previewConsoleLogs, setPreviewConsoleLogs] = useState<PreviewLogEntry[]>([]);
    const [bundleLogs, setBundleLogs] = useState<string[]>([]);

    const handleConsoleMessage = useCallback((log: Omit<PreviewLogEntry, 'id'>) => {
        setPreviewConsoleLogs(prev => [...prev.slice(-100), { ...log, id: uuidv4() }]);
    }, []);
    const handleClearConsoleLogs = useCallback(() => {
        setPreviewConsoleLogs([]);
    }, []);

    const handleBundleLog = useCallback((log: string) => {
      setBundleLogs(prev => [...prev, log]);
    }, []);

    const handleClearBundleLogs = useCallback(() => {
        setBundleLogs([]);
    }, []);

    const { isBundling, bundleError, builtCode, buildId } = usePreviewBundler({
        files,
        entryPoint: activeProject?.entryPoint || 'index.tsx',
        apiKey: settings.apiKey,
        onLog: handleBundleLog,
        onClearLogs: handleClearBundleLogs,
    });
    
    const handleProxyFetch = useCallback(async (event: MessageEvent) => {
        const { requestId, payload } = event.data;
        const { url, options } = payload;
        const source = event.source as Window;

        if (!source) return;

        console.log(`[Proxy] Received fetch request from preview for URL: ${url}`);

        try {
            const isNative = isNativeEnvironment();
            const proxyUrl = settings.gitCorsProxy;

            if (!isNative && !proxyUrl) {
                throw new Error("Cannot proxy fetch: CORS Proxy URL is not configured in settings for web environment.");
            }

            const finalUrl = isNative ? url : `${proxyUrl.replace(/\/$/, '')}/${url}`;
            console.log(`[Proxy] Fetching final URL: ${finalUrl}`);
            
            const response = await fetch(finalUrl, options);
            console.log(`[Proxy] Main thread fetch for ${finalUrl} completed with status: ${response.status}`);
            
            const responseBody = await response.arrayBuffer();
            
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            
            source.postMessage({
                type: 'proxy-fetch-response',
                requestId,
                payload: {
                    body: responseBody,
                    status: response.status,
                    statusText: response.statusText,
                    headers,
                }
            }, { targetOrigin: event.origin, transfer: [responseBody] });

        } catch (error) {
            console.error('Proxy fetch failed in main app:', error);
            source.postMessage({
                type: 'proxy-fetch-error',
                requestId,
                error: error instanceof Error ? error.message : 'An unknown proxy error occurred.',
            }, { targetOrigin: event.origin });
        }
    }, [settings.gitCorsProxy]);

    const handleProxyIframeLoad = useCallback(async (event: MessageEvent) => {
        const { requestId, payload } = event.data;
        const { url } = payload;
        const source = event.source as Window;
        if (!source) return;

        console.log(`[Proxy] Received iframe load request from preview for URL: ${url}`);

        try {
            const isNative = isNativeEnvironment();
            let finalUrl = url;

            if (!isNative) {
                const proxyUrl = settings.gitCorsProxy;
                if (!proxyUrl) {
                    throw new Error("Cannot proxy iframe content: CORS Proxy URL is not configured in settings for web environment.");
                }
                finalUrl = `${proxyUrl.replace(/\/$/, '')}/${url}`;
            }

            console.log(`[Proxy] Fetching proxied iframe content from: ${finalUrl}`);

            const response = await fetch(finalUrl);
            console.log(`[Proxy] Fetch for ${finalUrl} completed with status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            let html = await response.text();
            console.log(`[Proxy] Successfully fetched HTML content (${html.length} bytes). Sending back to preview.`);
            
            const baseHref = new URL('./', response.url).href;
            if (!html.includes('<base')) {
              html = html.replace(/(<head[^>]*>)/i, '$1' + '<base href="' + baseHref + '">');
            }

            source.postMessage({
                type: 'proxy-iframe-response',
                requestId,
                payload: { html },
            }, { targetOrigin: event.origin });
        } catch (error) {
            console.error('Proxy iframe load failed in main app:', error);
            source.postMessage({
                type: 'proxy-iframe-error',
                requestId,
                payload: { error: error instanceof Error ? error.message : 'An unknown proxy error occurred.' },
            }, { targetOrigin: event.origin });
        }
    }, [settings.gitCorsProxy]);
    
    const handleProxyNavigate = useCallback(async (event: MessageEvent) => {
        const { requestId, payload } = event.data;
        const { url, method, body, encoding } = payload;
        const source = event.source as Window;
        if (!source) return;

        console.log(`[Proxy] Received navigation request from preview for URL: ${url} with method: ${method || 'GET'}`);

        try {
            const isNative = isNativeEnvironment();
            const proxyUrl = settings.gitCorsProxy;
            if (!isNative && !proxyUrl) {
                throw new Error("Cannot proxy navigation: CORS Proxy URL is not configured in settings for web environment.");
            }
            
            const finalUrl = isNative ? url : `${proxyUrl.replace(/\/$/, '')}/${url}`;

            const fetchOptions: RequestInit = { method: method || 'GET', headers: {} };

            if (method === 'POST' && body) {
                if (encoding === 'application/x-www-form-urlencoded') {
                    (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
                    fetchOptions.body = body;
                } else if (encoding === 'multipart/form-data') {
                    const formData = new FormData();
                    for (const key in body) {
                        formData.append(key, body[key]);
                    }
                    fetchOptions.body = formData;
                } else {
                    (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
                    fetchOptions.body = JSON.stringify(body);
                }
            }
            
            console.log(`[Proxy] Executing navigation fetch to: ${finalUrl}`, fetchOptions);
            const response = await fetch(finalUrl, fetchOptions);
            console.log(`[Proxy] Navigation fetch for ${finalUrl} completed with status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`Navigation request failed with status ${response.status}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('text/html')) {
                throw new Error(`Proxied navigation did not return HTML. Content-Type: ${contentType}`);
            }

            let html = await response.text();
            console.log(`[Proxy] Successfully fetched navigation HTML content (${html.length} bytes). Sending back to preview.`);
            
            const baseHref = new URL('./', response.url).href; // Use final URL after redirects
            if (!html.includes('<base')) {
              html = html.replace(/(<head[^>]*>)/i, '$1' + '<base href="' + baseHref + '">');
            }

            source.postMessage({
                type: 'proxy-navigate-response',
                requestId,
                payload: { html },
            }, { targetOrigin: event.origin });

        } catch (error) {
            console.error('Proxy navigation failed in main app:', error);
            source.postMessage({
                type: 'proxy-navigate-error',
                requestId,
                payload: { error: error instanceof Error ? error.message : 'An unknown proxy error occurred.' },
            }, { targetOrigin: event.origin });
        }
    }, [settings.gitCorsProxy]);

    // --- 5. AI Services ---
    const aiRef = useRef<GoogleGenAI | null>(null);
    useEffect(() => {
        if (settings.apiKey && isSettingsLoaded) {
            aiRef.current = new GoogleGenAI({ apiKey: settings.apiKey });
        }
    }, [settings.apiKey, isSettingsLoaded]);

    // FIX: Correctly type the ref that holds the live session controls.
    const liveControlsRef = useRef<LiveSessionControls>();
    
    // FIX: Create a stable getter for the active thread to prevent stale state in tools.
    const activeThreadRef = useRef(activeThread);
    useEffect(() => {
        activeThreadRef.current = activeThread;
    }, [activeThread]);
    const getActiveThread = useCallback(() => activeThreadRef.current, []);
    
    // FIX: Pass the ref itself to `createToolImplementations` to break the circular dependency. The tool functions will access `.current` at execution time.
    const toolImplementations = createToolImplementations({
        files, setFiles, activeFile, setActiveFile, activeView, setActiveView,
        aiRef, gitServiceRef, settings, onSettingsChange: setSettings,
        bundleLogs, 
        previewConsoleLogs,
        liveSessionControlsRef: liveControlsRef,
        getActiveThread, 
        updateThread,
        setScreenshotPreview: uiState.setScreenshotPreview,
        isScreenshotPreviewDisabled: uiState.isScreenshotPreviewDisabled,
        setIsScreenshotPreviewDisabled: uiState.setIsScreenshotPreviewDisabled,
        // FIX: Renamed properties to match the return values from useGitLogic (e.g., onGitPush -> onPush).
        onGitPush: gitLogic.onPush,
        onGitPull: gitLogic.onPull,
        onGitRebase: gitLogic.onRebase,
        onDiscardChanges: gitLogic.onDiscardChanges,
        setCommitMessage: gitLogic.setCommitMessage,
        getAiVirtualFiles: () => vfs.aiVirtualFiles,
        setAiVirtualFiles: vfs.setAiVirtualFiles,
        onCommitAiToHead: vfs.onCommitAiToHead,
        getVfsReadyPromise: () => vfs.vfsReadyPromiseRef.current,
        saveVfsSession: vfs.saveVfsSession,
        deleteVfsSession: vfs.deleteVfsSession,
        prompts, createPrompt, updatePrompt, deletePrompt: deletePromptHook,
    });
    
    const { isResponding, sendMessage } = useAiChat({
        aiRef, settings, activeThread, addMessage, updateMessage, updateHistory, toolImplementations,
        onStartAiRequest: vfs.initVfsSession, onEndAiRequest: vfs.saveVfsSession
    });
    // FIX: The props object now correctly matches the `UseAiLiveProps` type, so the erroneous type cast is removed.
    const liveSessionControls = useAiLive({
        aiRef, settings, activeThread, addMessage, updateMessage, updateHistory, toolImplementations,
        activeView, onPermissionError: uiState.setPermissionError, setLiveFrameData: uiState.setLiveFrameData,
        onStartAiRequest: vfs.initVfsSession, onEndAiRequest: vfs.saveVfsSession,
    });
    liveControlsRef.current = liveSessionControls;

    useWakeWord({
        wakeWord: settings.wakeWord,
        enabled: settings.wakeWordEnabled && !liveSessionControls.isLive,
        onWake: () => {
            if (activeView !== View.Ai) setActiveView(View.Ai);
            if (!liveSessionControls.isLive) liveSessionControls.startLiveSession();
        },
        onPermissionError: uiState.setPermissionError,
    });
    
    // --- 6. Return Aggregated State ---
    return {
        // Project & File State
        activeProject, projects, files, activeFile,
        // UI State & Navigation
        activeView, onNavigate: setActiveView, ...uiState,
        isFullScreen: uiState.isFullScreen, onToggleFullScreen: () => uiState.setIsFullScreen(p => !p),
        // Settings, Credentials, Prompts
        settings, setSettings, gitCredentials, prompts,
        // AI State & Actions
        isResponding, onSend: sendMessage, ...liveSessionControls,
        // Thread Management
        threads, activeThreadId, activeThread,
        onNewThread: createNewThread, onSwitchThread: switchThread, onDeleteThread: deleteThread,
        // Git State & Actions
        ...gitLogic, gitService: gitServiceRef.current, handleClone, isCloning, cloningProgress,
        onOpenFileInEditor: setActiveFile,
        // Debug
        debugLogs, handleClearDebugLogs,
        // Project Management
        createNewProject, switchProject, deleteProject, updateProject,
        createGitCredential, deleteGitCredential, setDefaultGitCredential,
        // File Management
        onFileChange: onWriteFile, onFileSelect: setActiveFile, onFileAdd: onWriteFile, 
        // FIX: Corrected the shorthand property to match the destructured variable name 'onRemoveFile'.
        onFileRemove: onRemoveFile,
        // Prompt Management
        createPrompt, updatePrompt, revertToVersion, deletePrompt: deletePromptHook,
        // Preview & Bundler State
        isBundling, bundleError, builtCode, buildId,
        bundleLogs, handleClearBundleLogs,
        previewConsoleLogs, handleConsoleMessage, handleClearConsoleLogs,
        onProxyFetch: handleProxyFetch,
        onProxyIframeLoad: handleProxyIframeLoad,
        onProxyNavigate: handleProxyNavigate,
    };
};