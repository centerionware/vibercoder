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
  const [originalHeadFiles, setOriginalHeadFiles] = useState<Record<string, string> | null>(null);
  const [aiVirtualFiles, setAiVirtualFiles] = useState<Record<string, string> | null>(null);
  
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

  // Effect to load project files when the active project changes.
  useEffect(() => {
    if (!gitService || !activeProject) return;

    const loadProjectFiles = async () => {
      console.log(`Loading files for project: ${activeProject.name}`);
      const headFiles = await gitService.getHeadFiles();
      
      if (activeProject.gitRemoteUrl && Object.keys(headFiles).length === 0) {
        // This is a cloned, but empty, repository.
        setFiles({});
      } else if (!activeProject.gitRemoteUrl && Object.keys(headFiles).length === 0) {
        // This is a new, local project that hasn't been committed yet.
        setFiles(initialFiles);
      } else {
        // This is an existing project with files.
        setFiles(headFiles);
      }
      // After loading files from the definitive source (git HEAD), the workspace is clean.
      setChangedFiles([]);
    };

    loadProjectFiles();
  }, [activeProjectId, gitService]); // This effect synchronizes the workspace.
  
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
  
  const handleCommitAiToHead = useCallback(() => {
    if(aiVirtualFiles) setFiles(aiVirtualFiles);
    setAiVirtualFiles(null);
    setOriginalHeadFiles(null);
  }, [aiVirtualFiles, setFiles]);

  const handleStartAiRequest = useCallback(async () => {
    if (aiVirtualFiles !== null) return;
    const headFiles = await gitService?.getHeadFiles() ?? files;
    setOriginalHeadFiles(headFiles);
    setAiVirtualFiles(headFiles);
  }, [aiVirtualFiles, files, gitService]);

  const toolImplementations = useMemo(() => {
    const liveSessionControlsProxy = {
        pauseListening: (...args: any[]) => liveSessionControlsRef.current?.pauseListening(...args),
        stopLiveSession: (...args: any[]) => liveSessionControlsRef.current?.stopLiveSession(...args),
        enableVideoStream: (...args: any[]) => liveSessionControlsRef.current?.enableVideoStream(...args),
        disableVideoStream: (...args: any[]) => liveSessionControlsRef.current?.disableVideoStream(...args),
    };

    const gitServiceRef = { current: gitService }; // Create a ref-like object for dependencies

    return createToolImplementations({
      files, setFiles, activeFile, setActiveFile,
      originalHeadFiles, aiVirtualFiles, setAiVirtualFiles,
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
      files, setFiles, activeFile, setActiveFile, originalHeadFiles, aiVirtualFiles, 
      handleCommitAiToHead, activeView, bundleLogs, sandboxErrors, settings, 
      setSettings, isScreenshotPreviewDisabled, threads, activeThread, updateThread, projects, gitCredentials, gitService
  ]);

  const liveSession = useAiLive({
    aiRef, settings, activeThread, toolImplementations,
    addMessage, updateMessage, onPermissionError: setPermissionError,
    activeView, setLiveFrameData,
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
    debugLogs, isDebugLogModalOpen, setIsDebugLogModalOpen, handleClearDebugLogs,
    handleBranchSwitch,
    handleOpenFileInEditor,
    ...liveSession,
  };
};