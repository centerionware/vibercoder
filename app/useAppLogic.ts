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
import { View, GitService, UseAiLiveProps, GitCredential, AppSettings, GitAuthor, LiveSessionControls, PreviewLogEntry, Project, BrowserControls } from '../types';
import { db } from '../utils/idb';

// Core Data Hooks
import { useFiles, initialFiles } from '../hooks/useFiles';
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
import { useBrowser } from '../hooks/useBrowser';

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
    const { files, setFiles, activeFile, setActiveFile, onWriteFile, onRemoveFile } = useFiles(activeProject?.id || null);
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
    const [isProjectLoaded, setIsProjectLoaded] = useState(false);
    
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
        const token = finalSettings.gitAuthToken || credential?.token || settings.gitAuthToken;
        const proxyUrl = finalSettings.gitCorsProxy || settings.gitCorsProxy;
        
        if (operation === 'write' && (!author.name || !author.email)) return null;

        return { token, author, proxyUrl };
    }, [activeProject, settings, gitCredentials]);

    useEffect(() => {
        gitServiceRef.current = createGitService(true, activeProject?.id || null, getAuth);
    }, [activeProject?.id, getAuth]);

    // Effect to load files when the active project changes.
    useEffect(() => {
        if (!activeProject || !isSettingsLoaded) {
            if (!activeProject) setIsProjectLoaded(true); // If there are no projects, we are "loaded"
            return;
        }

        const loadFilesForProject = async () => {
            setIsProjectLoaded(false);
            setActiveFile(null);

            // 1. Check for local changes first.
            const dbFiles = await db.projectFiles.where('projectId').equals(activeProject.id).toArray();
            
            let finalFiles: Record<string, string>;

            if (dbFiles.length > 0) {
                // 2. If local files exist, they are the complete source of truth. No Git needed.
                console.log(`Loading project '${activeProject.name}' from IndexedDB.`);
                finalFiles = dbFiles.reduce((acc, file) => {
                    acc[file.filepath] = file.content;
                    return acc;
                }, {} as Record<string, string>);
                // This call just updates the in-memory state. It will trigger the `useFiles` `handleSetFiles`,
                // but since the content is identical, it's a quick operation.
                setFiles(finalFiles);
            } else {
                // 3. If NO local files exist, establish a baseline from Git or defaults.
                console.log(`No local data for '${activeProject.name}'. Establishing baseline.`);
                const svc = gitServiceRef.current;
                if (svc && svc.isReal && activeProject.gitRemoteUrl) {
                    console.log(`Fetching from Git HEAD for '${activeProject.name}'.`);
                    try {
                        finalFiles = await svc.getHeadFiles();
                        if (Object.keys(finalFiles).length === 0) {
                            console.log("Git repository is empty. Initializing with default files.");
                            finalFiles = initialFiles;
                        }
                    } catch (e) {
                        console.error("Failed to fetch from git, using initial files as fallback:", e);
                        finalFiles = initialFiles;
                    }
                } else {
                    console.log(`Initializing project '${activeProject.name}' with default files.`);
                    finalFiles = initialFiles;
                }
                
                // 4. CRITICAL: Persist this complete baseline to IndexedDB for future loads.
                // The `setFiles` hook will handle wiping any old entries and bulk-adding the new set.
                console.log(`Persisting baseline for '${activeProject.name}' to IndexedDB.`);
                await setFiles(finalFiles);
            }
            
            // 5. Set the active file for the UI.
            if (finalFiles[activeProject.entryPoint]) {
                setActiveFile(activeProject.entryPoint);
            } else if (Object.keys(finalFiles).length > 0) {
                // Sort to get a predictable file if entryPoint is missing
                setActiveFile(Object.keys(finalFiles).sort()[0]);
            }
            
            setIsProjectLoaded(true);
        };

        loadFilesForProject();
    }, [activeProject, isSettingsLoaded]);


    const gitLogic = useGitLogic({
        gitServiceRef, activeProject, files, setFiles, setActiveFile,
    });
    
    const handleClone = async (url: string, name: string, credentialId?: string | null) => {
        setIsCloning(true);
        setCloningProgress("Creating project entry...");
        
        // 1. Create the project entry, but DO NOT switch to it yet.
        const newProject = await createNewProject(name, false, url, { source: 'specific', credentialId: credentialId || undefined });

        // 2. Create a temporary, isolated Git service for the new project's ID.
        const cloneService = createGitService(true, newProject.id, getAuth);

        if (!cloneService.isReal) {
            setIsCloning(false);
            setCloningProgress(null);
            alert("Git service could not be initialized. Cannot clone.");
            await deleteProject(newProject.id); // Cleanup
            return;
        }

        try {
            setCloningProgress("Initializing clone...");
            // 3. Perform the clone. This populates the FS for the new project.
            const { files: clonedFiles } = await cloneService.clone(url, (progress) => {
                setCloningProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
            });
            
            // 4. Manually save the cloned files to the database for the new project ID.
            const filesToBulkAdd = Object.entries(clonedFiles).map(([filepath, content]) => ({ projectId: newProject.id, filepath, content }));
            if (filesToBulkAdd.length > 0) {
                await db.projectFiles.bulkAdd(filesToBulkAdd);
            }

            setCloningProgress("Clone complete. Finalizing...");
            
            // 5. Now that files are persisted, switch to the project.
            // The file loading useEffect will then automatically pick up the files from the DB.
            switchProject(newProject.id);
            
        } catch (error) {
            console.error("Clone failed:", error);
            alert(`Clone failed: ${error instanceof Error ? error.message : String(error)}`);
            // Cleanup the failed project entry.
            await deleteProject(newProject.id);
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

    const browser = useBrowser();
    const browserControlsRef = useRef<BrowserControls>();
    browserControlsRef.current = browser.controls;

    const liveControlsRef = useRef<LiveSessionControls>();
    
    const activeThreadRef = useRef(activeThread);
    useEffect(() => {
        activeThreadRef.current = activeThread;
    }, [activeThread]);
    const getActiveThread = useCallback(() => activeThreadRef.current, []);
    
    const toolImplementations = createToolImplementations({
        files, setFiles, activeFile, setActiveFile, activeView, setActiveView,
        aiRef, gitServiceRef, settings, onSettingsChange: setSettings,
        bundleLogs, 
        previewConsoleLogs,
        liveSessionControlsRef: liveControlsRef,
        browserControlsRef: browserControlsRef,
        getActiveThread, 
        updateThread,
        setScreenshotPreview: uiState.setScreenshotPreview,
        isScreenshotPreviewDisabled: uiState.isScreenshotPreviewDisabled,
        setIsScreenshotPreviewDisabled: uiState.setIsScreenshotPreviewDisabled,
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
        activeProject, projects, files, activeFile, isProjectLoaded,
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
        onRemoveFile,
        // Prompt Management
        createPrompt, updatePrompt, revertToVersion, deletePrompt: deletePromptHook,
        // Preview & Bundler State
        isBundling, bundleError, builtCode, buildId,
        bundleLogs, handleClearBundleLogs,
        previewConsoleLogs, handleConsoleMessage, handleClearConsoleLogs,
        onProxyFetch: handleProxyFetch,
        onProxyIframeLoad: handleProxyIframeLoad,
        onProxyNavigate: handleProxyNavigate,
        // Browser State
        browser,
    };
};