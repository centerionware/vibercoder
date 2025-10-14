import React from 'react';
import { useAppLogic } from './useAppLogic'; // We need the return type of our main hook
import CodeView from '../components/views/CodeView';
import PreviewView from '../components/views/PreviewView';
import AiView from '../components/views/AiView';
import GitView from '../components/views/GitView';
import SettingsView from '../components/views/SettingsView';
import PromptsView from '../components/views/PromptsView';
import { View } from '../types';

type ViewRendererProps = ReturnType<typeof useAppLogic>;

const ViewRenderer: React.FC<ViewRendererProps> = (app) => {
  switch (app.activeView) {
    case View.Code:
      return (
        <CodeView
          files={app.files}
          activeFile={app.activeFile}
          onFileChange={app.onFileChange}
          onFileSelect={app.onFileSelect}
          onFileAdd={(filename) => app.onFileAdd(filename, '')}
          onFileRemove={app.onFileRemove}
          isFullScreen={app.isFullScreen}
          onToggleFullScreen={app.onToggleFullScreen}
        />
      );
    case View.Preview:
      return (
        <PreviewView
          files={app.files}
          entryPoint={app.activeProject.entryPoint}
          onLog={app.handleLog}
          onRuntimeError={app.handleRuntimeError}
          bundleLogs={app.bundleLogs}
          onClearLogs={app.clearBundleLogs}
          isFullScreen={app.isFullScreen}
          onToggleFullScreen={app.onToggleFullScreen}
        />
      );
    case View.Ai:
      return (
        <AiView
          aiRef={app.aiRef}
          settings={app.settings}
          threads={app.threads}
          activeThread={app.activeThread}
          activeThreadId={app.activeThreadId}
          toolImplementations={app.toolImplementations}
          addMessage={app.addMessage}
          updateMessage={app.updateMessage}
          updateHistory={app.updateHistory}
          updateThread={app.updateThread}
          createNewThread={app.createNewThread}
          switchThread={app.switchThread}
          deleteThread={app.deleteThread}
          isLive={app.isLive}
          isMuted={app.isMuted}
          isSpeaking={app.isSpeaking}
          startLiveSession={app.startLiveSession}
          stopLiveSession={app.stopLiveSession}
          toggleMute={app.toggleMute}
          onStartAiRequest={app.handleStartAiRequest}
          onEndAiRequest={app.onEndAiRequest}
        />
      );
    case View.Git:
      return (
        <GitView
          files={app.files}
          changedFiles={app.changedFiles}
          onCommit={app.handleCommit}
          onCommitAndPush={app.handleCommitAndPush}
          isCommitting={app.isCommitting}
          gitService={app.gitServiceRef.current} // Pass the actual service
          onBranchSwitch={app.handleBranchSwitch}
          onOpenFileInEditor={app.handleOpenFileInEditor}
          onPush={app.handlePush}
          onPull={app.handlePull}
          onRebase={app.handleRebase}
          isGitNetworkActivity={app.isGitNetworkActivity}
          gitNetworkProgress={app.gitNetworkProgress}
          onDiscardChanges={app.handleDiscardChanges}
          commitMessage={app.commitMessage}
          onCommitMessageChange={app.setCommitMessage}
        />
      );
    case View.Settings:
      return (
        <SettingsView
          settings={app.settings}
          onSettingsChange={app.onSettingsChange}
          gitCredentials={app.gitCredentials}
          onManageCredentials={() => app.setIsGitCredentialsModalOpen(true)}
          onOpenDebugLog={() => app.setIsDebugLogModalOpen(true)}
          onNavigate={app.onNavigate}
        />
      );
    case View.Prompts:
      return (
        <PromptsView
            prompts={app.prompts}
            createPrompt={app.createPrompt}
            updatePrompt={app.updatePrompt}
            revertToVersion={app.revertToVersion}
            deletePrompt={app.deletePrompt}
        />
      );
    default:
      return <div>Unknown View</div>;
  }
};

export default ViewRenderer;