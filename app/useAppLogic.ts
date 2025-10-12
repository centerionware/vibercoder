import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { View, GitService, ChatThread, AppSettings, Project, GitSettings, GitCredential, GitAuthor, LogEntry, GitProgress } from '../types';

import { useSettings } from '../hooks/useSettings';
import { useFiles } from '../hooks/useFiles';
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

  // --- Refs ---
  const aiRef = useRef<GoogleGenAI | null>(null);
  const gitServiceRef = useRef<GitService | null>(null);
  const liveSessionControlsRef = useRef<any>(null); // Ref to break circular dependency
  
  // --- AI Virtual Filesystem (VFS) State ---
  const [originalHeadFiles, setOriginalHeadFiles] = useState<Record<string, string> | null>(null);
  const [aiVirtualFiles, setAiVirtualFiles] = useState<Record<string, string> | null>(null);
  
  // --- Memoized Callbacks ---
  const clearBundleLogs = useCallback(() => {
    setBundleLogs([]);
  }, []);

  const handleLog = useCallback((log: string) => {
    // Keep the log array from growing indefinitely
    setBundleLogs(prev => [...prev.slice(-100), log]);
  }, []);

  const handleRuntimeError = useCallback((error: string) => {
    setSandboxErrors(prev => [...prev, error]);
  }, []);

  // --- Initializers ---
  useEffect(() => {
    startCapturingLogs((newLog) => {
        setDebugLogs(prev => [...prev.slice(-500), newLog]); // Keep max 500 logs in state
    });
  }, []);

  useEffect(() => {
    if (settings.apiKey) {
      try { aiRef.current = new GoogleGenAI({ apiKey: settings.apiKey }); }
      catch (error) { console.error("Failed to initialize GoogleGenAI:", error); aiRef.current = null; }
    } else { aiRef.current = null; }
  }, [settings.apiKey]);

  useEffect(() => { gitServiceRef.current = createGitService(true); }, []);
  
  // --- Callbacks ---
  const onNavigate = (view: View) => setActiveView(view);
  
  const handleCommitAiToHead = useCallback(() => {
    if(aiVirtualFiles) setFiles(aiVirtualFiles);
    setAiVirtualFiles(null);
    setOriginalHeadFiles(null);
  }, [aiVirtualFiles, setFiles]);

  const handleStartAiRequest = useCallback(async () => {
    if (aiVirtualFiles !== null) return; 
    const headFiles = await gitServiceRef.current?.getHeadFiles() ?? files;
    setOriginalHeadFiles(headFiles);
    setAiVirtualFiles(headFiles);
  }, [aiVirtualFiles, files]);

  // --- Tooling ---
  const toolImplementations = useMemo(() => {
    // A proxy allows the live session to have a stable reference to the controls,
    // while allowing the controls to be defined later, breaking the dependency cycle.
    const liveSessionControlsProxy = {
        pauseListening: (...args: any[]) => liveSessionControlsRef.current?.pauseListening(...args),
        stopLiveSession: (...args: any[]) => liveSessionControlsRef.current?.stopLiveSession(...args),
        enableVideoStream: (...args: any[]) => liveSessionControlsRef.current?.enableVideoStream(...args),
        disableVideoStream: (...args: any[]) => liveSessionControlsRef.current?.disableVideoStream(...args),
    };

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
      setSettings, isScreenshotPreviewDisabled, threads, activeThread, updateThread, projects, gitCredentials
  ]);

  // --- Live Session & Wake Word ---
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
  
  const resolveGitSettings = useCallback(() => {
    const projectSettings = activeProject?.gitSettings;
    const defaultCredential = gitCredentials.find(c => c.isDefault);

    const remoteUrl = activeProject?.gitRemoteUrl || settings.gitRemoteUrl;

    let userName = settings.gitUserName;
    let userEmail = settings.gitUserEmail;
    let authToken = settings.gitAuthToken;
    let corsProxy: string | undefined = settings.gitCorsProxy;

    if (projectSettings?.source === 'default' && defaultCredential) {
        authToken = defaultCredential.token;
    } else if (projectSettings?.source === 'specific' && projectSettings.credentialId) {
        const specificCred = gitCredentials.find(c => c.id === projectSettings.credentialId);
        if (specificCred) authToken = specificCred.token;
    } else if (projectSettings?.source === 'custom' && projectSettings.custom) {
        userName = projectSettings.custom.userName;
        userEmail = projectSettings.custom.userEmail;
        authToken = projectSettings.custom.authToken;
        corsProxy = projectSettings.custom.corsProxy;
    }
    
    return { remoteUrl, userName, userEmail, authToken, corsProxy };
  }, [activeProject, settings, gitCredentials]);
  
  const handleClone = useCallback(async (url: string, name: string) => {
    if (!gitServiceRef.current) return;

    if (!url || !url.trim() || !name || !name.trim()) {
      alert("Please provide both a Git repository URL and a local project name.");
      return;
    }
    if (!url.trim().startsWith('https://')) {
      alert("Invalid Git URL. Only HTTPS URLs (e.g., 'https://github.com/user/repo.git') are supported.");
      return;
    }
    
    const cloneConfig = {
      url: url,
      proxy: settings.gitCorsProxy || DEFAULT_SETTINGS.gitCorsProxy,
      author: { name: settings.gitUserName, email: settings.gitUserEmail },
      token: gitCredentials.find(c => c.isDefault)?.token || settings.gitAuthToken,
    };
    
    setIsCloning(true);
    setCloningProgress('Preparing to clone...');
    try {
      const onProgress = (progress: GitProgress) => {
        const percent = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
        setCloningProgress(`Phase: ${progress.phase} (${percent}%)`);
      };

      await gitServiceRef.current.clone(
        cloneConfig.url,
        cloneConfig.proxy,
        cloneConfig.author,
        cloneConfig.token,
        onProgress
      );
      
      setCloningProgress('Reading project files...');
      const newProject = await createNewProject(name, false, url);
      
      const headFiles = await gitServiceRef.current.getHeadFiles();
      setFiles(headFiles);
      switchProject(newProject.id); // Switch after files are ready

    } catch (error: any) {
        alert(`Cloning failed: ${error.message}`);
        console.error("CLONE FAILED:", error);
    } finally {
      setIsCloning(false);
      setCloningProgress(null);
      setIsProjectModalOpen(false);
    }
  }, [settings, gitCredentials, createNewProject, setFiles, switchProject]);

  const handleCommit = useCallback(async (message: string) => {
    if (!gitServiceRef.current) return;
    const { userName, userEmail } = resolveGitSettings();
    setIsCommitting(true);
    await gitServiceRef.current.commit(message, { name: userName, email: userEmail }, files);
    setIsCommitting(false);
  }, [files, resolveGitSettings]);

  const handleClearDebugLogs = useCallback(() => {
    clearGlobalLogs();
    setDebugLogs([]);
  }, []);
  
  return {
    settings, onSettingsChange: setSettings,
    projects, activeProject, createNewProject, switchProject, deleteProject, updateProject,
    files, activeFile, onFileChange: onWriteFile, onFileSelect: setActiveFile, onFileAdd: onWriteFile, onFileRemove: onRemoveFile,
    threads, activeThread, activeThreadId, createNewThread, switchThread, deleteThread, addMessage, updateMessage, updateHistory, updateThread,
    gitCredentials, createGitCredential, deleteGitCredential, setDefaultGitCredential,
    activeView, onNavigate,
    bundleLogs, handleLog, clearBundleLogs, sandboxErrors, handleRuntimeError,
    isCommitting, handleCommit, isCloning, handleClone, cloningProgress,
    permissionError, setPermissionError,
    screenshotPreview, setScreenshotPreview, setIsScreenshotPreviewDisabled, isScreenshotPreviewDisabled,
    isProjectModalOpen, setIsProjectModalOpen,
    projectToEdit, setProjectToEdit,
    isProjectSettingsModalOpen, setIsProjectSettingsModalOpen,
    isGitCredentialsModalOpen, setIsGitCredentialsModalOpen,
    liveFrameData, isLiveVideoModalOpen, setIsLiveVideoModalOpen,

    isFullScreen, onToggleFullScreen: () => setIsFullScreen(p => !p),
    aiRef, toolImplementations, gitServiceRef,
    handleStartAiRequest,
    debugLogs, isDebugLogModalOpen, setIsDebugLogModalOpen, handleClearDebugLogs,
    ...liveSession,
  };
};