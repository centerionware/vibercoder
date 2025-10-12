import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { View, AppSettings, AiProvider, ToolCall, ToolCallStatus, LiveSessionControls, GitService, GitStatus, GitAuthor } from './types';
import { dbInitializationError } from './utils/idb';
import { useFiles } from './hooks/useFiles';
import { useThreads } from './hooks/useThreads';
import { useAiLive } from './hooks/useAiLive';
import { createToolImplementations } from './services/toolOrchestrator';
import { createGitService } from './services/gitService';

import Header from './components/Header';
import BottomNav from './components/BottomNav';
import CodeView from './components/views/CodeView';
import PreviewView from './components/views/PreviewView';
import AiView from './components/views/AiView';
import SettingsView from './components/views/SettingsView';
import GitView from './components/views/GitView';
import ErrorFallback from './components/ErrorFallback';
import MicPermissionModal from './components/modals/MicPermissionModal';
import ScreenshotModal from './components/modals/ScreenshotModal';
import LiveVideoPreviewModal from './components/modals/LiveVideoPreviewModal';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

const defaultSettings: AppSettings = {
  aiProvider: AiProvider.Google,
  aiModel: 'gemini-2.5-flash',
  geminiApiKey: '',
  voiceName: 'Zephyr',
  aiEndpoint: '',
  gitRemoteUrl: '',
  gitUserName: 'vibecoder',
  gitUserEmail: 'vibecoder@example.com',
  gitProxyUrl: '',
  thinkingBudget: 100,
};

function App() {
  const [activeView, setActiveView] = useState<View>(View.Ai);
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const savedSettings = localStorage.getItem('vibecode_settings');
      return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [sandboxErrors, setSandboxErrors] = useState<string[]>([]);
  const [bundleLogs, setBundleLogs] = useState<string[]>([]);
  const [isCloning, setIsCloning] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isScreenshotPreviewDisabled, setIsScreenshotPreviewDisabled] = useState(false);
  const [liveFrameData, setLiveFrameData] = useState<string | null>(null);
  const [isLiveVideoModalOpen, setIsLiveVideoModalOpen] = useState(false);
  
  const { files, setFiles, activeFile, setActiveFile, onWriteFile, onRemoveFile } = useFiles();
  const threadsState = useThreads();
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const gitServiceRef = useRef<GitService | null>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);

  // Initialize the Git service once based on the platform
  useEffect(() => {
    if (!gitServiceRef.current) {
      const isRealGit = Capacitor.isNativePlatform() || (window as any).electron?.isElectron;
      gitServiceRef.current = createGitService(isRealGit);
      console.log(`Git Service Initialized. Mode: ${isRealGit ? 'Real' : 'Mock'}`);
    }
  }, []);

  const refreshGitStatus = useCallback(async () => {
    if (!gitServiceRef.current) return;
    try {
      const status = await gitServiceRef.current.status(files);
      setGitStatus(status);
    } catch (e) {
      console.error("Failed to get git status:", e);
      // You could set an error state here to show in the UI
    }
  }, [files]);
  
  // Refresh git status when the view changes to 'git' or files are modified
  useEffect(() => {
    if (activeView === View.Git) {
      refreshGitStatus();
    }
  }, [activeView, files, refreshGitStatus]);
  
  const liveSessionControlsRef = useRef<LiveSessionControls>({
    stopLiveSession: () => console.warn("Attempted to stop live session before it was initialized."),
    pauseListening: (duration, options) => console.warn("Attempted to pause listening before session was initialized."),
    enableVideoStream: () => console.warn("Attempted to enable video before session was initialized."),
    disableVideoStream: () => console.warn("Attempted to disable video before session was initialized."),
  });

  useEffect(() => {
    const requestNativePermissions = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await Camera.requestPermissions({ permissions: ['camera', 'microphone'] });
        } catch (e) {
          console.error("Error requesting native permissions:", e);
          setMicPermissionError("Failed to request camera/microphone permissions on the native device.");
        }
      }
    };
    requestNativePermissions();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('vibecode_settings', JSON.stringify(settings));
      const effectiveApiKey = settings.geminiApiKey || process.env.API_KEY;
      if (effectiveApiKey) {
        aiRef.current = new GoogleGenAI({ apiKey: effectiveApiKey });
      } else {
        aiRef.current = null;
      }
    } catch (e) {
      console.error("Failed to initialize Gemini AI or save settings:", e);
      aiRef.current = null;
    }
  }, [settings]);

  const { isLive, isMuted, isSpeaking, startLiveSession, stopLiveSession, toggleMute, isVideoStreamEnabled } = useAiLive({
    ...({} as any) // Placeholder for dependencies
  });

  const toolImplementations = useMemo(() => createToolImplementations({
    files, onWriteFile, onRemoveFile, aiRef, setActiveView, setActiveFile,
    activeFile, bundleLogs, settings, onSettingsChange: setSettings,
    threads: threadsState.threads, activeThread: threadsState.activeThread,
    updateThread: threadsState.updateThread, sandboxErrors, changedFiles: gitStatus.map(s => s.filepath),
    liveSessionControls: liveSessionControlsRef.current, activeView,
    setScreenshotPreview, isScreenshotPreviewDisabled, setIsScreenshotPreviewDisabled,
  }), [
    files, onWriteFile, onRemoveFile, activeFile, bundleLogs, settings,
    threadsState.threads, threadsState.activeThread, threadsState.updateThread,
    sandboxErrors, gitStatus, activeView, isScreenshotPreviewDisabled
  ]);
  
  const handleSendErrorToAi = (errors: string[]) => {
    // This is a placeholder for the actual implementation
    console.log("Sending errors to AI:", errors);
  };
  
  const handleGitImport = useCallback(async () => {
    if (!gitServiceRef.current || !settings.gitRemoteUrl) {
        alert("Please set the Git Remote URL in settings first.");
        return;
    }
    setIsCloning(true);
    try {
        const author: GitAuthor = { name: settings.gitUserName, email: settings.gitUserEmail };
        const { files: clonedFiles } = await gitServiceRef.current.clone(settings.gitRemoteUrl, settings.gitProxyUrl, author);
        setFiles(clonedFiles);
        setActiveFile(Object.keys(clonedFiles)[0] || null);
        setActiveView(View.Code); // Switch to code view after clone
        await refreshGitStatus();
    } catch (e) {
        console.error("Git clone failed:", e);
        alert(`Git clone failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        setIsCloning(false);
    }
  }, [settings.gitRemoteUrl, settings.gitProxyUrl, settings.gitUserName, settings.gitUserEmail, setFiles, refreshGitStatus]);

  const handleCommit = useCallback(async (message: string) => {
    if (!gitServiceRef.current || gitStatus.length === 0) return;
    setIsCommitting(true);
    try {
      const author: GitAuthor = { name: settings.gitUserName, email: settings.gitUserEmail };
      await gitServiceRef.current.commit(message, author, files);
      await refreshGitStatus(); // Refresh status to show a clean state
    } catch (e) {
      console.error("Git commit failed:", e);
      alert(`Git commit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCommitting(false);
    }
  }, [gitStatus, files, settings.gitUserName, settings.gitUserEmail, refreshGitStatus]);
  

  if (dbInitializationError) {
    return <ErrorFallback error={dbInitializationError} />;
  }

  return (
    <div id="app-container" ref={appContainerRef} className={`h-screen w-screen flex flex-col font-sans ${isFullScreen ? 'fixed inset-0 z-50 bg-vibe-bg-deep' : ''}`}>
      {!isFullScreen && <Header isLiveVideoEnabled={isVideoStreamEnabled} onLiveVideoIconClick={() => setIsLiveVideoModalOpen(true)} />}
      
      <main className={`flex-1 overflow-auto p-2 pb-20`}>
        {activeView === View.Code && <CodeView files={files} activeFile={activeFile} setActiveFile={setActiveFile} onWriteFile={onWriteFile} />}
        {activeView === View.Preview && <PreviewView files={files} isFullScreen={isFullScreen} onToggleFullScreen={() => setIsFullScreen(p => !p)} bundleLogs={bundleLogs} setBundleLogs={setBundleLogs} setSandboxErrors={setSandboxErrors} sandboxErrors={sandboxErrors} isLive={isLive} onSendErrorToAi={handleSendErrorToAi}/>}
        {activeView === View.Ai && <AiView aiRef={aiRef} settings={settings} {...threadsState} toolImplementations={toolImplementations} isLive={isLive} isMuted={isMuted} isSpeaking={isSpeaking} startLiveSession={startLiveSession} stopLiveSession={stopLiveSession} toggleMute={toggleMute} />}
        {activeView === View.Git && <GitView changedFiles={gitStatus} onCommit={handleCommit} isCommitting={isCommitting} />}
        {activeView === View.Settings && <SettingsView settings={settings} onSettingsChange={setSettings} onGitImport={handleGitImport} isCloning={isCloning} />}
      </main>

      {!isFullScreen && <BottomNav activeView={activeView} onNavigate={setActiveView} />}
      
      {micPermissionError && <MicPermissionModal message={micPermissionError} onClose={() => setMicPermissionError(null)} />}
      {screenshotPreview && <ScreenshotModal imageDataUrl={screenshotPreview} onClose={() => setScreenshotPreview(null)} onDisable={() => setIsScreenshotPreviewDisabled(true)} />}
      {isLiveVideoModalOpen && <LiveVideoPreviewModal frameDataUrl={liveFrameData} onClose={() => setIsLiveVideoModalOpen(false)} />}
    </div>
  );
}

export default App;
