import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { View, AppSettings, AiProvider, ToolCall, ToolCallStatus, LiveSessionControls } from './types';
import { dbInitializationError } from './utils/idb';
import { useFiles } from './hooks/useFiles';
import { useThreads } from './hooks/useThreads';
import { useAiLive } from './hooks/useAiLive';
import { createToolImplementations } from './services/toolOrchestrator';

import Header from './components/Header';
import BottomNav from './components/BottomNav';
import CodeView from './components/views/CodeView';
import PreviewView from './components/views/PreviewView';
import AiView from './components/views/AiView';
import SettingsView from './components/views/SettingsView';
import GitView from './components/views/GitView';
import ErrorFallback from './components/ErrorFallback';
import MicPermissionModal from './components/modals/MicPermissionModal';

const defaultSettings: AppSettings = {
  aiProvider: AiProvider.Google,
  aiModel: 'gemini-2.5-flash',
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
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const { files, activeFile, setActiveFile, onWriteFile, onRemoveFile } = useFiles(setChangedFiles);
  const threadsState = useThreads();
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const errorProcessingRef = useRef(false);
  
  const liveSessionControlsRef = useRef<LiveSessionControls>({
    stopLiveSession: () => console.warn("Attempted to stop live session before it was initialized."),
    pauseListening: (duration, options) => console.warn("Attempted to pause listening before session was initialized."),
  });

  useEffect(() => {
    if (process.env.API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } else {
      console.error("API_KEY environment variable not set.");
    }
  }, []);

  const handleSettingsChange = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('vibecode_settings', JSON.stringify(newSettings));
  }, []);
  
  const toolImplementations = useMemo(() => createToolImplementations({
    files, onWriteFile, onRemoveFile, aiRef, setActiveView, setActiveFile,
    activeFile, bundleLogs, settings, onSettingsChange: handleSettingsChange,
    threads: threadsState.threads,
    activeThread: threadsState.activeThread,
    updateThread: threadsState.updateThread,
    sandboxErrors, changedFiles,
    liveSessionControls: liveSessionControlsRef.current,
  }), [
    files, onWriteFile, onRemoveFile, activeFile, bundleLogs, settings, 
    handleSettingsChange, threadsState.threads, threadsState.activeThread, 
    threadsState.updateThread, sandboxErrors, changedFiles
  ]);

  const liveSessionState = useAiLive({ 
    aiRef, settings, addMessage: threadsState.addMessage,
    updateMessage: threadsState.updateMessage, toolImplementations,
    activeThread: threadsState.activeThread, updateHistory: threadsState.updateHistory,
    onPermissionError: setMicPermissionError,
  });

  useEffect(() => {
    liveSessionControlsRef.current.stopLiveSession = liveSessionState.stopLiveSession;
    liveSessionControlsRef.current.pauseListening = liveSessionState.pauseListening;
  }, [liveSessionState.stopLiveSession, liveSessionState.pauseListening]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'sandbox-error') {
        setSandboxErrors(prev => [...prev, event.data.message]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (sandboxErrors.length > 0 && !errorProcessingRef.current) {
      errorProcessingRef.current = true;

      const newToolCall: ToolCall = {
        id: 'sandbox-error-' + Date.now(), name: 'preview.runtimeError',
        args: { errors: sandboxErrors }, status: ToolCallStatus.ERROR,
      };

      threadsState.addMessage({
          id: 'error-report-' + Date.now(), role: 'model',
          content: "I've detected a runtime error in the preview. Would you like me to fix it?",
          toolCalls: [newToolCall]
      });

      setActiveView(View.Ai);
    } else if (sandboxErrors.length === 0) {
      errorProcessingRef.current = false;
    }
  }, [sandboxErrors, threadsState.addMessage, setActiveView]);

  const handleGitImport = () => {
    setIsCloning(true);
    setTimeout(() => {
        alert(`Cloned from ${settings.gitRemoteUrl} (mock). Your workspace has been updated.`);
        setIsCloning(false);
    }, 2000);
  };
  
  const handleCommit = async (message: string) => {
    setIsCommitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network request
    alert(`Committed ${changedFiles.length} files with message: "${message}" (mock)`);
    setChangedFiles([]);
    setIsCommitting(false);
  };

  if (dbInitializationError) {
      return <ErrorFallback error={dbInitializationError} />;
  }

  const renderView = () => {
    switch (activeView) {
      case View.Code:
        return <CodeView files={files} activeFile={activeFile} setActiveFile={setActiveFile} onWriteFile={onWriteFile} />;
      case View.Preview:
        return <PreviewView 
            files={files} isFullScreen={isFullScreen} onToggleFullScreen={() => setIsFullScreen(p => !p)}
            bundleLogs={bundleLogs} setBundleLogs={setBundleLogs} setSandboxErrors={setSandboxErrors}
        />;
      case View.Ai:
        return <AiView
            aiRef={aiRef} settings={settings} toolImplementations={toolImplementations}
            {...threadsState} {...liveSessionState}
        />;
      case View.Git:
        return <GitView changedFiles={changedFiles} onCommit={handleCommit} isCommitting={isCommitting} />;
      case View.Settings:
        return <SettingsView settings={settings} onSettingsChange={handleSettingsChange} onGitImport={handleGitImport} isCloning={isCloning} />;
      default:
        return <CodeView files={files} activeFile={activeFile} setActiveFile={setActiveFile} onWriteFile={onWriteFile} />;
    }
  };
  
  if (isFullScreen) {
      return (
         <div className="h-screen w-screen bg-vibe-bg">
            <PreviewView 
                files={files} isFullScreen={isFullScreen} onToggleFullScreen={() => setIsFullScreen(p => !p)}
                bundleLogs={bundleLogs} setBundleLogs={setBundleLogs} setSandboxErrors={setSandboxErrors}
            />
         </div>
      )
  }

  return (
    <div className="h-screen w-screen bg-vibe-bg flex flex-col p-4 gap-4">
      {micPermissionError && (
        <MicPermissionModal 
            message={micPermissionError} 
            onClose={() => setMicPermissionError(null)} 
        />
      )}
      <Header />
      <main className="flex-1 flex min-h-0">
        {renderView()}
      </main>
      <div className="h-20 flex-shrink-0" />
      <BottomNav activeView={activeView} onNavigate={setActiveView} />
    </div>
  );
}

export default App;