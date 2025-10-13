import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { View, GitService, ChatThread, AppSettings, Project, GitSettings, GitCredential, GitAuthor, LogEntry, GitProgress, GitStatus } from '../types';

import { useSettings } from '../hooks/useSettings';
import { useFiles, initialFiles } from '../hooks/useFiles';
import { useProjects } from '../hooks/useProjects';
import { useThreads } from '../hooks/useThreads';
import { useGitCredentials } from '../hooks/useGitCredentials';
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
  const aiVirtualFilesRef = useRef<Record<string, string> | null>(null);
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
    if(aiVirtualFilesRef.current) {
        setFiles(aiVirtualFilesRef.current);
        console.log("Committed AI changes to HEAD.");
    }
    // Committing no longer ends the session; the turn's end does.
  }, [setFiles]);

  const handleStartAiRequest = useCallback(() => {
    if (aiVirtualFilesRef.current !== null) return;

    vfsReadyPromiseRef.current = new Promise<void>((resolve) => {
      vfsReadyResolverRef.current = resolve;
    });
  
    (async () => {
      console.log("Starting AI session, initializing VFS.");
      const headFiles = await gitService?.getHeadFiles() ?? files;
      originalHeadFilesRef.current = headFiles;
      aiVirtualFilesRef.current = JSON.parse(JSON.stringify(headFiles));
      vfsReadyResolverRef.current(); // VFS is now ready, resolve the promise
    })();
  }, [files, gitService]);

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
      projects, gitCredentials,
    });
  }, [
      files, setFiles, activeFile, setActiveFile,
      handleCommitAiToHead, activeView, bundleLogs, sandboxErrors, settings, 
      setSettings, isScreenshotPreviewDisabled, threads, activeThread, updateThread, projects, gitCredentials, gitService
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

  const handleCommit = useCallback(async (message: string) => {
    if (!gitService) return;
    const { gitUserName, gitUserEmail } = settings;
    if (!gitUserName || !gitUserEmail) {
        alert("Please set your Git user name and email in the global settings.");
        return;
    }
    setIsCommitting(true);
    try {
        await gitService.commit(message, { name: gitUserName, email: gitUserEmail }, files);
        // Refresh status after commit
        const newStatus = await gitService.status(files);
        setChangedFiles(newStatus);
    } catch (error: any) {
        alert(`Commit failed: ${error.message}`);
        console.error("COMMIT FAILED:", error);
    } finally {
        setIsCommitting(false);
    }
  }, [files, settings, gitService]);

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
    activeView, onNavigate,
    bundleLogs, handleLog, clearBundleLogs, sandboxErrors, handleRuntimeError,
    isCommitting, handleCommit, isCloning, handleClone, cloningProgress, changedFiles,
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
    ...liveSession,
  };
};