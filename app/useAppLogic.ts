import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { View, GitService, ChatThread, AppSettings, Project, GitSettings, GitCredential, GitAuthor, LogEntry, GitProgress, GitStatus, CopyOnWriteVFS } from '../types';

import { useSettings } from '../hooks/useSettings';
import { useFiles, initialFiles } from '../hooks/useFiles';
import { useProjects } from '../hooks/useProjects';
import { useThreads } from '../hooks/useThreads';
import { useGitCredentials } from '../hooks/useGitCredentials';
import { usePrompts } from '../hooks/usePrompts';
import { useAiLive } from '../hooks/useAiLive';
import { useWakeWord } from '../hooks/useWakeWord';
import { isNativeEnvironment } from '../utils/environment';

import { createGitService } from '../services/gitService';
import { createToolImplementations } from '../services/toolOrchestrator';
import { startCapturingLogs, clearDebugLogs as clearGlobalLogs } from '../utils/logging';
import { DEFAULT_SETTINGS } from '../app/config';


// This custom hook encapsulates the core application logic.
export const useAppLogic = () => {
  // --- Core Hooks ---
  const { settings, setSettings, isSettingsLoaded } = useSettings();
  const { projects, activeProject, activeProjectId, createNewProject, switchProject, deleteProject, updateProject } = useProjects();
  const { files, setFiles, activeFile, setActiveFile, onWriteFile, onRemoveFile } = useFiles();
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

  // --- Refs & Services ---
  const aiRef = useRef<GoogleGenAI | null>(null);
  const [gitService, setGitService] = useState<GitService | null>(null);
  const liveSessionControlsRef = useRef<any>(null);
  
  // --- AI Virtual Filesystem (VFS) State ---
  const originalHeadFilesRef = useRef<Record<string, string> | null>(null);
  const aiVirtualFilesRef = useRef<CopyOnWriteVFS | null>(null);
  const vfsReadyPromiseRef = useRef<Promise<void>>(Promise.resolve());
  let vfsReadyResolverRef = useRef<() => void>(() => {});

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

  useEffect(() => {
    setGitService(createGitService(true, activeProjectId));
  }, [activeProjectId]);

  // Effect to load project files when the active project changes. This is the primary sync point.
  useEffect(() => {
    if (!gitService || !activeProject) {
        // If there's no project yet (e.g., initial load), don't do anything.
        return;
    };

    const loadProjectFiles = async () => {
      console.log(`Syncing workspace for project: "${activeProject.name}"`);
      const headFiles = await gitService.getHeadFiles();
      
      if (Object.keys(headFiles).length > 0) {
        // If the repository has files, always use them as the source of truth.
        console.log(`Found ${Object.keys(headFiles).length} files in git HEAD. Updating workspace.`);
        setFiles(headFiles);
      } else if (activeProject.gitRemoteUrl) {
        // If the repository has no files but is linked to a remote, it's a cloned, empty repo.
        console.log("Project is remote but has no files. Setting workspace to empty.");
        setFiles({});
      } else {
        // If there are no files and no remote, it's a new, local project. Populate with the template.
        console.log("Project is local and has no files. Populating with initial template.");
        setFiles(initialFiles);
      }
      
      // The workspace is now in sync with its source (either git HEAD or a template), so there are no pending changes.
      setChangedFiles([]);
    };

    loadProjectFiles();
  }, [activeProject, gitService, setFiles]);
  
  // Fetch git status when the view changes to Git or files change
  useEffect(() => {
    if (gitService?.isReal && activeView === View.Git) {
        gitService.status(files).then(setChangedFiles).catch(err => {
            console.error("Failed to get git status:", err);
            setChangedFiles([]);
        });
    }
  }, [activeView, gitService, files]);
  
  const onNavigate = (view: View) => setActiveView(view);
  
  const onEndAiRequest = useCallback(() => {
    if (aiVirtualFilesRef.current !== null) {
      console.log("Ending AI session, clearing VFS.");
      aiVirtualFilesRef.current = null;
      originalHeadFilesRef.current = null;
      // Reset the promise to a resolved state for the next turn.
      vfsReadyPromiseRef.current = Promise.resolve();
    }
  }, []);

  const handleCommitAiToHead = useCallback(() => {
    const vfs = aiVirtualFilesRef.current;
    if(vfs) {
        // Apply mutations to create the new state
        const newFiles = { ...vfs.originalFiles };
        for (const [filepath, mutation] of Object.entries(vfs.mutations)) {
            if (typeof mutation === 'string') {
                newFiles[filepath] = mutation; // Add or update
            } else { // DELETED_FILE_SENTINEL
                delete newFiles[filepath]; // Delete
            }
        }
        setFiles(newFiles);
        console.log("Committed AI changes to HEAD.");
    }
    // Committing no longer ends the session; the turn's end does.
  }, [setFiles]);

  const handleStartAiRequest = useCallback(() => {
    if (aiVirtualFilesRef.current !== null) return;

    vfsReadyPromiseRef.current = new Promise<void>((resolve) => {
      vfsReadyResolverRef.current = resolve;
    });
  
    // This is now synchronous and fast.
    console.log("Starting AI session, initializing CoW VFS from current workspace.");
    const workspaceFiles = files;
    originalHeadFilesRef.current = workspaceFiles; // Keep for diffing
    aiVirtualFilesRef.current = {
        originalFiles: workspaceFiles, // Read-only reference
        mutations: {}, // Start with no changes
    };
    vfsReadyResolverRef.current(); // VFS is now ready, resolve the promise
  }, [files]);
  
  const getGitAuth = useCallback(() => {
    const token = gitCredentials.find(c => c.isDefault)?.token || settings.gitAuthToken;
    const author = { name: settings.gitUserName, email: settings.gitUserEmail };
    const proxyUrl = settings.gitCorsProxy;

    if (!token || !author.name || !author.email) {
        alert("Git authentication or user details are not configured. Please check your settings.");
        return null;
    }
    return { token, author, proxyUrl };
  }, [gitCredentials, settings]);

  const handlePush = useCallback(async () => {
    if (!gitService) return;
    const auth = getGitAuth();
    if (!auth) return;

    setIsGitNetworkActivity(true);
    setGitNetworkProgress('Pushing...');
    try {
        const result = await gitService.push(auth.author, auth.token, auth.proxyUrl, (progress) => {
            setGitNetworkProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
        });
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
  }, [gitService, getGitAuth]);

  const handlePull = useCallback(async (rebase: boolean) => {
      if (!gitService) return;
      const auth = getGitAuth();
      if (!auth) return;

      setIsGitNetworkActivity(true);
      setGitNetworkProgress('Pulling...');
      try {
          await gitService.pull(auth.author, auth.token, auth.proxyUrl, rebase, (progress) => {
              setGitNetworkProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
          });
          const newFiles = await gitService.getHeadFiles();
          setFiles(newFiles);
          const newStatus = await gitService.status(newFiles);
          setChangedFiles(newStatus);
          alert('Pull successful!');
      } catch (e: any) {
          alert(`Pull failed: ${e.message}`);
          console.error("PULL FAILED:", e);
      } finally {
          setIsGitNetworkActivity(false);
          setGitNetworkProgress(null);
      }
  }, [gitService, getGitAuth, setFiles]);

  const handleRebase = useCallback(async (branch: string) => {
      if (!gitService) return;
      const auth = getGitAuth();
      if (!auth) return;

      setIsGitNetworkActivity(true);
      setGitNetworkProgress(`Rebasing onto ${branch}...`);
      try {
          await gitService.rebase(branch, auth.author);
          const newFiles = await gitService.getHeadFiles();
          setFiles(newFiles);
          const newStatus = await gitService.status(newFiles);
          setChangedFiles(newStatus);
          alert('Rebase successful!');
      } catch (e: any) {
          alert(`Rebase failed: ${e.message}`);
          console.error("REBASE FAILED:", e);
      } finally {
          setIsGitNetworkActivity(false);
          setGitNetworkProgress(null);
      }
  }, [gitService, getGitAuth, setFiles]);

  const internalHandleCommit = useCallback(async (message: string) => {
    if (!gitService) throw new Error("Git service not available.");
    const { gitUserName, gitUserEmail } = settings;
    if (!gitUserName || !gitUserEmail) {
        throw new Error("Please set your Git user name and email in the global settings.");
    }
    setIsCommitting(true);
    try {
        await gitService.commit(message, { name: gitUserName, email: gitUserEmail }, files);
        setCommitMessage(''); // Clear message after successful commit
        const newStatus = await gitService.status(files);
        setChangedFiles(newStatus);
    } catch (error: any) {
        console.error("COMMIT FAILED:", error);
        throw new Error(`Commit failed: ${error.message}`);
    } finally {
        setIsCommitting(false);
    }
  }, [files, settings, gitService]);

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
        await handlePush(); // handlePush has its own internal alerting for success/failure
    } catch (e: any) {
        // This will only catch errors from the commit part
        alert(e.message);
    }
  }, [internalHandleCommit, handlePush]);

  const handleDiscardChanges = useCallback(async () => {
    if (!gitService) {
        alert("Git service is not available.");
        return;
    }
    setIsCommitting(true); // Reuse loading state
    try {
        const headFiles = await gitService.getHeadFiles();
        setFiles(headFiles);
        // After resetting files, the status should be clean.
        const newStatus = await gitService.status(headFiles);
        setChangedFiles(newStatus);
        alert("Workspace changes have been discarded.");
    } catch (e: any) {
        alert(`Failed to discard changes: ${e.message}`);
        console.error("DISCARD FAILED:", e);
    } finally {
        setIsCommitting(false);
    }
  }, [gitService, setFiles]);

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
  
  const handleClone = useCallback(async (url: string, name: string) => {
    setIsCloning(true);
    setCloningProgress('Creating project...');
    try {
        const newProject = await createNewProject(name, false, url);
        // A temporary git service for the new project ID before it's active
        const tempGitService = createGitService(true, newProject.id);
        const token = gitCredentials.find(c => c.isDefault)?.token || settings.gitAuthToken;
        await tempGitService.clone(url, settings.gitCorsProxy, { name: settings.gitUserName, email: settings.gitUserEmail }, token, (progress: GitProgress) => {
            setCloningProgress(`${progress.phase} (${progress.loaded}/${progress.total})`);
        });
        
        // Switch to the new project. The useEffect hook will now handle loading the files.
        switchProject(newProject.id);
    } catch (error: any) {
        alert(`Cloning failed: ${error.message}`);
        console.error("CLONE FAILED:", error);
    } finally {
        setIsCloning(false);
        setCloningProgress(null);
        setIsProjectModalOpen(false);
    }
  }, [settings, gitCredentials, createNewProject, switchProject]);

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
    files, activeFile, onFileChange: onWriteFile, onFileSelect: setActiveFile, onFileAdd: onWriteFile, onFileRemove: onRemoveFile,
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
    ...liveSession,
  };
};