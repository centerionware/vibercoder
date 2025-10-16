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
  // By rendering all views and using CSS to hide/show them, we preserve the state
  // of each view component. This is crucial for the PreviewView's iframe, which
  // will now maintain its state and not trigger a rebundle on view switching.
  return (
    <>
      <div className={`h-full w-full ${app.activeView === View.Code ? 'flex flex-col' : 'hidden'}`}>
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
      </div>
      <div className={`h-full w-full ${app.activeView === View.Preview ? 'flex flex-col' : 'hidden'}`}>
        <PreviewView
          files={app.files}
          entryPoint={app.activeProject.entryPoint}
          apiKey={app.settings.apiKey}
          onLog={app.handleLog}
          onRuntimeError={app.handleRuntimeError}
          bundleLogs={app.bundleLogs}
          onClearLogs={app.clearBundleLogs}
          isFullScreen={app.isFullScreen}
          onToggleFullScreen={app.onToggleFullScreen}
          onProxyFetch={app.handleProxyFetch}
          onVirtualStorageRequest={app.handleVirtualStorageRequest}
        />
      </div>
      <div className={`h-full w-full ${app.activeView === View.Ai ? 'flex flex-col' : 'hidden'}`}>
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
      </div>
      <div className={`h-full w-full ${app.activeView === View.Git ? 'flex flex-col' : 'hidden'}`}>
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
      </div>
      <div className={`h-full w-full ${app.activeView === View.Settings ? 'flex flex-col' : 'hidden'}`}>
        <SettingsView
          settings={app.settings}
          onSettingsChange={app.onSettingsChange}
          gitCredentials={app.gitCredentials}
          onManageCredentials={() => app.setIsGitCredentialsModalOpen(true)}
          onOpenDebugLog={() => app.setIsDebugLogModalOpen(true)}
          onNavigate={app.onNavigate}
        />
      </div>
      <div className={`h-full w-full ${app.activeView === View.Prompts ? 'flex flex-col' : 'hidden'}`}>
        <PromptsView
            prompts={app.prompts}
            createPrompt={app.createPrompt}
            updatePrompt={app.updatePrompt}
            revertToVersion={app.revertToVersion}
            deletePrompt={app.deletePrompt}
        />
      </div>
    </>
  );
};

export default ViewRenderer;