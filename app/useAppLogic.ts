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
// FIX: Import `LiveSessionControls` to correctly type the ref for live session methods.
import { View, GitService, UseAiLiveProps, GitCredential, AppSettings, GitAuthor, LiveSessionControls, PreviewLogEntry } from '../types';

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
        gitServiceRef, activeProject, files, setFiles, setActiveFile, createNewProject,
    });

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

        try {
            const response = await fetch(url, options);
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
    }, []);

    const handleProxyIframeLoad = useCallback(async (event: MessageEvent) => {
        const { requestId, payload } = event.data;
        const { url } = payload;
        const source = event.source as Window;
        if (!source) return;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const html = await response.text();

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
    }, []);

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
        ...gitLogic, gitService: gitServiceRef.current,
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
    };
};
