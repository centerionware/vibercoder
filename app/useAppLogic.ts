import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { View, GitService, ChatThread, AppSettings, Project, GitSettings, GitCredential, GitAuthor, LogEntry, GitProgress, GitStatus, CopyOnWriteVFS, DELETED_FILE_SENTINEL } from '../types';

import { useSettings } from '../hooks/useSettings';
import { useFiles, initialFiles } from '../hooks/useFiles';
import { useProjects } from '../hooks/useProjects';
import { useThreads } from '../hooks/useThreads';
import { useGitCredentials } from '../hooks/useGitCredentials';
import { usePrompts } from '../hooks/usePrompts';
import { useAiLive } from '../hooks/useAiLive';
import { useWakeWord } from '../hooks/useWakeWord';
import { isNativeEnvironment } from '../utils/environment';
import { db } from '../utils/idb';


import { createGitService } from '../services/gitService';
import { createToolImplementations } from '../services/toolOrchestrator';
import { startCapturingLogs, clearDebugLogs as clearGlobalLogs } from '../utils/logging';
import { DEFAULT_SETTINGS } from '../app/config';


// This custom hook encapsulates the core application logic.
export const useAppLogic = () => {
  // --- Core Hooks ---
  const { settings, setSettings, isSettingsLoaded } = useSettings();
  const { projects, activeProject, activeProjectId, createNewProject, switchProject, deleteProject, updateProject } = useProjects();
  const { files, setFiles, activeFile, setActiveFile } = useFiles();
  const { threads, activeThread, activeThreadId, createNewThread, switchThread, deleteThread, addMessage, updateMessage, updateHistory, updateThread } = useThreads(activeProjectId);
  const { gitCredentials, createGitCredential, deleteGitCredential, setDefaultGitCredential } = useGitCredentials();
  const { prompts, createPrompt, updatePrompt, revertToVersion, deletePrompt } = usePrompts();
  
  // --- State ---
  const [activeView, setActiveView] = useState<View>(View.Ai);
  const [bundleLogs, setBundleLogs] = useState<string[]>([]);
  const [sandboxErrors, setSandboxErrors] = useState<string[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [cloningProgress, setCloningProgress] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isScreenshotPreviewDisabled, setIsScreenshotPreviewDisabled] = useState(false);
  const [isGitNetworkActivity, setIsGitNetworkActivity] = useState(false);
  const [gitNetworkProgress, setGitNetworkProgress] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  
  // Modal States
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);
  const [isGitCredentialsModalOpen, setIsGitCredentialsModalOpen] = useState(false);
  const [isLiveVideoModalOpen, setIsLiveVideoModalOpen] = useState(false);
  const [isDebugLogModalOpen, setIsDebugLogModalOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<LogEntry[]>([]);

  const [liveFrameData, setLiveFrameData] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [changedFiles, setChangedFiles] = useState<GitStatus[]>([]);
  
  // State to manage clone operations across renders
  const [pendingClone, setPendingClone] = useState<{ projectId: string; url: string; } | null>(null);


  // --- Refs & Services ---
  const aiRef = useRef<GoogleGenAI | null>(null);
  const [gitService, setGitService] = useState<GitService | null>(null);
  const liveSessionControlsRef = useRef<any>(null);
  
  // --- AI Virtual Filesystem (VFS) State ---
  const originalHeadFilesRef = useRef<Record<string, string> | null>(null);
  const aiVirtualFilesRef = useRef<CopyOnWriteVFS | null>(null);
  const vfsReadyPromiseRef = useRef<Promise<void>>(Promise.resolve());
  let vfsReadyResolverRef = useRef<() => void>(() => {});

  // Refs for managing virtualized IndexedDB state
  const idbConnectionsRef = useRef<Map<string, IDBDatabase>>(new Map());
  const idbTransactionsRef = useRef<Map<string, IDBTransaction>>(new Map());
  const idbObjectStoresRef = useRef<Map<string, IDBObjectStore>>(new Map());

  // --- Memoized Callbacks ---
  const clearBundleLogs = useCallback(() => setBundleLogs([]), []);
  const handleLog = useCallback((log: string) => setBundleLogs(prev => [...prev.slice(-100), log]), []);
  const handleRuntimeError = useCallback((error: string) => setSandboxErrors(prev => [...prev, error]), []);

  // --- Initializers ---
  useEffect(() => {
    startCapturingLogs((newLog) => {
        setDebugLogs(prev => [...prev.slice(-500), newLog]);
    });
  }, []);

  useEffect(() => {
    if (settings.apiKey) {
      try { aiRef.current = new GoogleGenAI({ apiKey: settings.apiKey }); }
      catch (error) { console.error("Failed to initialize GoogleGenAI:", error); aiRef.current = null; }
    } else { aiRef.current = null; }
  }, [settings.apiKey]);
  
  const getGitAuth = useCallback((operation: 'read' | 'write'): { token: string | undefined; author: GitAuthor; proxyUrl: string } | null => {
    if (!activeProject) return null;

    const { gitSettings: projectGitSettings } = activeProject;
    const globalAuthor = { name: settings.gitUserName, email: settings.gitUserEmail };
    
    let token: string | undefined;
    let author = globalAuthor;
    let proxyUrl = settings.gitCorsProxy;
    
    const source = projectGitSettings?.source || 'global';

    switch (source) {
        case 'specific':
            token = gitCredentials.find(c => c.id === projectGitSettings?.credentialId)?.token;
            break;
        case 'custom':
            token = projectGitSettings?.custom?.authToken;
            author = {
                name: projectGitSettings?.custom?.userName || globalAuthor.name,
                email: projectGitSettings?.custom?.userEmail || globalAuthor.email,
            };
            proxyUrl = projectGitSettings?.custom?.corsProxy || settings.gitCorsProxy;
            break;
        case 'default':
        case 'global':
        default:
            token = gitCredentials.find(c => c.isDefault)?.token || settings.gitAuthToken;
            break;
    }
    
    if (!token && operation === 'read') {
        return { token: undefined, author, proxyUrl };
    }

    if (!token && operation === 'write') {
        alert("Git write operation failed: No default or project-specific credential found. Please create a credential and set it as default, or configure one for this project in its settings.");
        return null;
    }

    if (!author.name || !author.email) {
        alert("Git user name or email is not configured. Please check your project or global settings.");
        return null;
    }

    return { token: token!, author, proxyUrl };
  }, [activeProject, gitCredentials, settings]);
  
  // This consolidated useEffect hook manages Git service creation, workspace syncing, and now, cloning.
  useEffect(() => {
    if (!activeProjectId) {
      setGitService(null);
      return;
    }

    const project = projects.find(p => p.id === activeProjectId);
    if (!project) {
        return;
    }
    
    const onProgress = (progress: GitProgress) => {
        if (progress.total) {
            setCloningProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
        } else if (progress.loaded) {
            setCloningProgress(`${progress.phase} (${progress.loaded})...`);
        } else {
            setCloningProgress(progress.phase);
        }
    };
    
    const newGitService = createGitService(true, activeProjectId, getGitAuth);
    setGitService(newGitService);

    const runAsyncTasks = async () => {
        if (pendingClone && pendingClone.projectId === activeProjectId) {
            const { url } = pendingClone;
            try {
                const { files: clonedFiles } = await newGitService.clone(url, onProgress);
                setPendingClone(null);
                setFiles(clonedFiles);
                setChangedFiles([]);
                setIsProjectModalOpen(false);
            } catch (error: any) {
                alert(`Cloning failed: ${error.message}`);
                console.error("CLONE FAILED in useEffect:", error);
                setPendingClone(null);
            } finally {
                setIsCloning(false);
                setCloningProgress(null);
            }
        } else {
            console.log(`Syncing workspace for project: "${project.name}"`);
            try {
                const workingDirFiles = await newGitService.getWorkingDirFiles();
                if (Object.keys(workingDirFiles).length > 0) {
                    console.log(`Found ${Object.keys(workingDirFiles).length} files in git working directory. Updating workspace.`);
                    setFiles(workingDirFiles);
                } else if (project.gitRemoteUrl) {
                    console.log("Project is remote but has no files. This could be a new/empty repo. Setting workspace to empty.");
                    setFiles({});
                } else {
                    console.log("Project is local and has no files. Populating with initial template.");
                    setFiles(initialFiles);
                    for (const [filename, content] of Object.entries(initialFiles)) {
                        newGitService.writeFile(filename, content).catch(e => console.error(`Failed to write initial file ${filename}:`, e));
                    }
                }
                setChangedFiles([]);
            } catch (error) {
                console.error(`Failed to sync workspace for project ${project.name}:`, error);
            }
        }
    };

    runAsyncTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, projects, getGitAuth, setFiles, pendingClone]);
  
  useEffect(() => {
    if (gitService?.isReal && activeView === View.Git) {
        gitService.status(files).then(setChangedFiles).catch(err => {
            console.error("Failed to get git status:", err);
            setChangedFiles([]);
        });
    }
  }, [activeView, gitService, files]);

  const handleFileChange = useCallback((filename: string, content: string) => {
    setFiles(prev => ({ ...prev, [filename]: content }));
    gitService?.writeFile(filename, content).catch(e => console.error(`Failed to write file ${filename}:`, e));
  }, [gitService]);

  const handleFileAdd = useCallback((filename: string, content: string) => {
    setFiles(prev => ({ ...prev, [filename]: content }));
    setActiveFile(filename);
    gitService?.writeFile(filename, content).catch(e => console.error(`Failed to add file ${filename}:`, e));
  }, [gitService, setActiveFile]);

  const handleFileRemove = useCallback((filename: string) => {
    setFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[filename];
        return newFiles;
    });
    if (activeFile === filename) {
        setActiveFile(null);
    }
    gitService?.removeFile(filename).catch(e => console.error(`Failed to remove file ${filename}:`, e));
  }, [gitService, activeFile]);
  
  const onNavigate = (view: View) => setActiveView(view);
  
  const onEndAiRequest = useCallback(() => {
    if (aiVirtualFilesRef.current !== null) {
      console.log("Ending AI session, clearing VFS.");
      aiVirtualFilesRef.current = null;
      originalHeadFilesRef.current = null;
      vfsReadyPromiseRef.current = Promise.resolve();
    }
  }, []);

  const handleCommitAiToHead = useCallback(() => {
    const vfs = aiVirtualFilesRef.current;
    if(vfs) {
        const newFiles = { ...vfs.originalFiles };
        const promises: Promise<void>[] = [];

        for (const [filepath, mutation] of Object.entries(vfs.mutations)) {
            if (typeof mutation === 'string') {
                newFiles[filepath] = mutation;
                promises.push(gitService?.writeFile(filepath, mutation) ?? Promise.resolve());
            } else { // DELETED_FILE_SENTINEL
                delete newFiles[filepath];
                promises.push(gitService?.removeFile(filepath) ?? Promise.resolve());
            }
        }
        
        Promise.all(promises).then(() => {
            setFiles(newFiles);
            console.log("Committed AI changes to HEAD and persisted to working directory.");
        }).catch(err => {
            console.error("Failed to persist AI changes:", err);
            alert("Error saving AI changes.");
        });
    }
  }, [setFiles, gitService]);

  const handleStartAiRequest = useCallback(() => {
    if (aiVirtualFilesRef.current !== null) return;

    vfsReadyPromiseRef.current = new Promise<void>((resolve) => {
      vfsReadyResolverRef.current = resolve;
    });
  
    console.log("Starting AI session, initializing CoW VFS from current workspace.");
    const workspaceFiles = files;
    originalHeadFilesRef.current = workspaceFiles;
    aiVirtualFilesRef.current = {
        originalFiles: workspaceFiles,
        mutations: {},
    };
    vfsReadyResolverRef.current();
  }, [files]);

  const handlePush = useCallback(async () => {
    if (!gitService) return;
    setIsGitNetworkActivity(true);
    setGitNetworkProgress('Pushing...');
    
    const onProgress = (progress: GitProgress) => {
        if (progress.total) {
            setGitNetworkProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
        } else if (progress.loaded) {
            setGitNetworkProgress(`${progress.phase} (${progress.loaded})...`);
        } else {
            setGitNetworkProgress(progress.phase);
        }
    };

    try {
        const result = await gitService.push(onProgress);
        if (!result.ok) {
            throw new Error(result.error || 'Push failed. Check credentials and remote repository permissions.');
        }
        alert('Push successful!');
    } catch (e: any) {
        alert(`Push failed: ${e.message}`);
        console.error("PUSH FAILED:", e);
    } finally {
        setIsGitNetworkActivity(false);
        setGitNetworkProgress(null);
    }
  }, [gitService]);

  const handlePull = useCallback(async (rebase: boolean) => {
      if (!gitService) return;
      setIsGitNetworkActivity(true);
      setGitNetworkProgress('Pulling...');

      const onProgress = (progress: GitProgress) => {
        if (progress.total) {
            setGitNetworkProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
        } else if (progress.loaded) {
            setGitNetworkProgress(`${progress.phase} (${progress.loaded})...`);
        } else {
            setGitNetworkProgress(progress.phase);
        }
      };

      try {
          const { files: newFiles, status: newStatus } = await gitService.pull(rebase, onProgress);
          setFiles(newFiles);
          setChangedFiles(newStatus);
          alert('Pull successful!');
      } catch (e: any) {
          alert(`Pull failed: ${e.message}`);
          console.error("PULL FAILED:", e);
      } finally {
          setIsGitNetworkActivity(false);
          setGitNetworkProgress(null);
      }
  }, [gitService, setFiles]);

  const handleRebase = useCallback(async (branch: string) => {
      if (!gitService) return;
      setIsGitNetworkActivity(true);
      setGitNetworkProgress(`Rebasing onto ${branch}...`);
      try {
          const { files: newFiles, status: newStatus } = await gitService.rebase(branch);
          setFiles(newFiles);
          setChangedFiles(newStatus);
          alert('Rebase successful!');
      } catch (e: any) {
          alert(`Rebase failed: ${e.message}`);
          console.error("REBASE FAILED:", e);
      } finally {
          setIsGitNetworkActivity(false);
          setGitNetworkProgress(null);
      }
  }, [gitService, setFiles]);

  const internalHandleCommit = useCallback(async (message: string) => {
    if (!gitService) throw new Error("Git service not available.");
    setIsCommitting(true);
    try {
        const { status } = await gitService.commit(message, files);
        setCommitMessage(''); // Clear message after successful commit
        setChangedFiles(status);
    } catch (error: any) {
        console.error("COMMIT FAILED:", error);
        throw new Error(`Commit failed: ${error.message}`);
    } finally {
        setIsCommitting(false);
    }
  }, [files, gitService]);

  const handleCommit = useCallback(async (message: string) => {
    try {
        await internalHandleCommit(message);
    } catch (e: any) {
        alert(e.message);
    }
  }, [internalHandleCommit]);

  const handleCommitAndPush = useCallback(async (message: string) => {
    try {
        await internalHandleCommit(message);
        await handlePush();
    } catch (e: any) {
        alert(e.message);
    }
  }, [internalHandleCommit, handlePush]);

  const handleDiscardChanges = useCallback(async () => {
    if (!gitService) {
        alert("Git service is not available.");
        return;
    }
    setIsCommitting(true); // Reuse for loading state
    try {
        const headFiles = await gitService.getHeadFiles();
        setFiles(headFiles);
        // After resetting files, the status should be clean.
        setChangedFiles([]);
        alert("Workspace changes have been discarded.");
    } catch (e: any) {
        alert(`Failed to discard changes: ${e.message}`);
        console.error("DISCARD FAILED:", e);
    } finally {
        setIsCommitting(false);
    }
  }, [gitService, setFiles]);

  const handleProxyFetch = useCallback(async (request: { requestId: string; payload: { url: string; options?: RequestInit } }) => {
    const { requestId, payload } = request;
    const { url, options } = payload;
    
    const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
        console.error("Proxy fetch handler: Could not find preview iframe to send response.");
        return;
    }

    try {
        const response = await fetch(url, options);

        const responseBody = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        const serializedResponse = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
        };
        
        iframe.contentWindow.postMessage({
            type: 'proxy-fetch-response',
            requestId,
            response: serializedResponse,
        }, '*');

    } catch (e: any) {
        console.error("Proxy fetch failed:", e);
        iframe.contentWindow.postMessage({
            type: 'proxy-fetch-response',
            requestId,
            error: { message: e.message, name: e.name },
        }, '*');
    }
  }, []);
  
  const handleVirtualStorageRequest = useCallback(async (eventData: any) => {
      const { requestId, storageKey, api, payload } = eventData;
      const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement;
      if (!iframe?.contentWindow) return;
  
      const postResponse = (responsePayload: any) => {
          iframe.contentWindow!.postMessage({
              type: 'virtual-storage-response',
              requestId,
              payload: responsePayload
          }, '*');
      };
  
      const postError = (message: string) => {
          iframe.contentWindow!.postMessage({
              type: 'virtual-storage-response',
              requestId,
              error: { message }
          }, '*');
      };
  
      try {
          if (api === 'localStorage') {
              switch (payload.method) {
                  case 'init': {
                      const items = await db.virtualStorage
                          .where({ storageKey: storageKey, api: 'localStorage' })
                          .toArray();
                      const data = items.reduce((acc: Record<string, string>, item: any) => {
                          acc[item.key] = item.value;
                          return acc;
                      }, {});
                      postResponse({ data });
                      break;
                  }
                  case 'setItem': {
                      await db.virtualStorage.put({
                          storageKey,
                          api: 'localStorage',
                          key: payload.key,
                          value: payload.value
                      });
                      postResponse({ success: true });
                      break;
                  }
                  case 'removeItem': {
                      const item: any = await db.virtualStorage
                          .where({ storageKey, api: 'localStorage', key: payload.key })
                          .first();
                      if (item) {
                          await db.virtualStorage.delete(item.id);
                      }
                      postResponse({ success: true });
                      break;
                  }
                  case 'clear': {
                      await db.virtualStorage
                          .where({ storageKey, api: 'localStorage' })
                          .delete();
                      postResponse({ success: true });
                      break;
                  }
                  default:
                      postError(`Unknown localStorage method: ${payload.method}`);
              }
          } else if (api === 'indexedDB') {
              // Note: This is a simplified proxy. A full implementation would require
              // managing transactions and object stores in memory maps.
              const { method, dbName, dbVersion } = payload;
              const prefixedDbName = `vibecode-virtual-db-${storageKey}-${dbName}`;
              
              if (method === 'open') {
                  const openRequest = indexedDB.open(prefixedDbName, dbVersion);
  
                  openRequest.onsuccess = () => {
                      const db = openRequest.result;
                      const dbId = `db-${storageKey}-${dbName}`;
                      idbConnectionsRef.current.set(dbId, db);
                      postResponse({
                          event: 'success',
                          dbId,
                          result: { name: db.name, version: db.version, objectStoreNames: Array.from(db.objectStoreNames) }
                      });
                  };
                  openRequest.onerror = () => postError(openRequest.error?.message || 'Failed to open IndexedDB.');
                  openRequest.onupgradeneeded = (event) => {
                      const db = openRequest.result;
                      const dbId = `db-${storageKey}-${dbName}`;
                      idbConnectionsRef.current.set(dbId, db);
                      postResponse({
                          event: 'upgradeneeded',
                          dbId,
                          result: { oldVersion: event.oldVersion, newVersion: event.newVersion, objectStoreNames: Array.from(db.objectStoreNames) }
                      });
                  };
              } else {
                  postError(`IndexedDB method '${method}' not yet implemented in proxy.`);
              }
          }
      } catch (e: any) {
          postError(e.message);
      }
  }, []);

  const toolImplementations = useMemo(() => {
    const liveSessionControlsProxy = {
        pauseListening: (...args: any[]) => liveSessionControlsRef.current?.pauseListening(...args),
        stopLiveSession: (...args: any[]) => liveSessionControlsRef.current?.stopLiveSession(...args),
        enableVideoStream: (...args: any[]) => liveSessionControlsRef.current?.enableVideoStream(...args),
        disableVideoStream: (...args: any[]) => liveSessionControlsRef.current?.disableVideoStream(...args),
    };

    const gitServiceRef = { current: gitService };

    return createToolImplementations({
      files, setFiles, activeFile, setActiveFile,
      getOriginalHeadFiles: () => originalHeadFilesRef.current,
      getAiVirtualFiles: () => aiVirtualFilesRef.current,
      setAiVirtualFiles: (updater) => {
          if (typeof updater === 'function') {
              aiVirtualFilesRef.current = updater(aiVirtualFilesRef.current);
          } else {
              aiVirtualFilesRef.current = updater;
          }
      },
      getVfsReadyPromise: () => vfsReadyPromiseRef.current,
      onCommitAiToHead: handleCommitAiToHead,
      activeView, setActiveView,
      bundleLogs, sandboxErrors,
      settings, onSettingsChange: setSettings,
      liveSessionControls: liveSessionControlsProxy,
      setScreenshotPreview, isScreenshotPreviewDisabled, setIsScreenshotPreviewDisabled,
      threads, activeThread, updateThread,
      aiRef, gitServiceRef,
      onGitPush: handlePush,
      onGitPull: handlePull,
      onGitRebase: handleRebase,
      onDiscardChanges: handleDiscardChanges,
      setCommitMessage,
      projects, gitCredentials,
      prompts, createPrompt, updatePrompt, deletePrompt,
    });
  }, [
      files, setFiles, activeFile, setActiveFile,
      handleCommitAiToHead, activeView, bundleLogs, sandboxErrors, settings, 
      setSettings, isScreenshotPreviewDisabled, threads, activeThread, updateThread, projects, gitCredentials, gitService,
      handlePush, handlePull, handleRebase, handleDiscardChanges, setCommitMessage,
      prompts, createPrompt, updatePrompt, deletePrompt,
  ]);

  const liveSession = useAiLive({
    aiRef, settings, activeThread, toolImplementations,
    addMessage, updateMessage, onPermissionError: setPermissionError,
    activeView, setLiveFrameData,
    onStartAiRequest: handleStartAiRequest,
    onEndAiRequest,
  });
  liveSessionControlsRef.current = liveSession;

  useWakeWord({
    wakeWord: settings.wakeWord,
    enabled: settings.wakeWordEnabled && !liveSession.isLive,
    onWake: async () => {
      if (activeView !== View.Ai) setActiveView(View.Ai);
      liveSession.startLiveSession();
    },
    onPermissionError: setPermissionError,
  });

  useEffect(() => {
    if (activeView === View.Ai && settings.autoEnableLiveMode && !liveSession.isLive) {
      liveSession.startLiveSession();
    }
  }, [activeView, settings.autoEnableLiveMode, liveSession.isLive, liveSession.startLiveSession]);
  
  const handleClone = useCallback(async (url: string, name: string, credentialId?: string | null) => {
    if (projects.some(p => p.name === name)) {
        alert(`A project named "${name}" already exists. Please choose a different name.`);
        return;
    }

    setIsCloning(true);
    setCloningProgress('Initializing project...');
    try {
        const projectGitSettings: GitSettings = credentialId
            ? { source: 'specific', credentialId }
            : { source: 'default' };

        const newProject = await createNewProject(name, false, url, projectGitSettings);
        
        setPendingClone({ projectId: newProject.id, url });
        switchProject(newProject.id);
    } catch (error) {
        console.error("Failed to initiate clone:", error);
        alert("Failed to create project for cloning.");
        setIsCloning(false);
        setCloningProgress(null);
    }
  }, [projects, createNewProject, switchProject]);

  const handleClearDebugLogs = useCallback(() => {
    clearGlobalLogs();
    setDebugLogs([]);
  }, []);
  
  const handleBranchSwitch = async (branch: string) => {
      if (!gitService) return;
      setIsCommitting(true); // Re-use for loading state
      try {
          const { files: newFiles } = await gitService.checkout(branch);
          setFiles(newFiles);
          setChangedFiles([]); // Workspace is clean after checkout
      } catch (e: any) {
          alert(`Failed to switch branch: ${e.message}`);
      } finally {
          setIsCommitting(false);
      }
  };

  const handleOpenFileInEditor = useCallback((filepath: string) => {
    if (files[filepath] !== undefined) {
      setActiveFile(filepath);
      setActiveView(View.Code);
    } else {
      alert(`File "${filepath}" does not exist in the current workspace.`);
    }
  }, [files, setActiveFile, setActiveView]);


  return {
    settings, onSettingsChange: setSettings,
    projects, activeProject, createNewProject, switchProject, deleteProject, updateProject,
    files, activeFile, onFileChange: handleFileChange, onFileSelect: setActiveFile, onFileAdd: handleFileAdd, onFileRemove: handleFileRemove,
    threads, activeThread, activeThreadId, createNewThread, switchThread, deleteThread, addMessage, updateMessage, updateHistory, updateThread,
    gitCredentials, createGitCredential, deleteGitCredential, setDefaultGitCredential,
    prompts, createPrompt, updatePrompt, revertToVersion, deletePrompt,
    activeView, onNavigate,
    bundleLogs, handleLog, clearBundleLogs, sandboxErrors, handleRuntimeError,
    isCommitting, handleCommit, handleCommitAndPush, isCloning, handleClone, cloningProgress, changedFiles,
    permissionError, setPermissionError,
    screenshotPreview, setScreenshotPreview, setIsScreenshotPreviewDisabled, isScreenshotPreviewDisabled,
    isProjectModalOpen, setIsProjectModalOpen,
    projectToEdit, setProjectToEdit,
    isProjectSettingsModalOpen, setIsProjectSettingsModalOpen,
    isGitCredentialsModalOpen, setIsGitCredentialsModalOpen,
    liveFrameData, isLiveVideoModalOpen, setIsLiveVideoModalOpen,

    isFullScreen, onToggleFullScreen: () => setIsFullScreen(p => !p),
    aiRef, toolImplementations,
    gitServiceRef: { current: gitService }, 
    handleStartAiRequest,
    onEndAiRequest,
    debugLogs, isDebugLogModalOpen, setIsDebugLogModalOpen, handleClearDebugLogs,
    handleBranchSwitch,
    handleOpenFileInEditor,
    isGitNetworkActivity, gitNetworkProgress, handlePush, handlePull, handleRebase,
    handleDiscardChanges,
    commitMessage, setCommitMessage,
    handleProxyFetch,
    handleVirtualStorageRequest,
    ...liveSession,
  };
};