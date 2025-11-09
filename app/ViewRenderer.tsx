// FIX: Recreated the `ViewRenderer` component. This file was missing, causing build errors. The new content acts as a router, dynamically rendering the correct view (`CodeView`, `AiView`, etc.) based on the application's active view state and passing down all necessary props from the main app logic.
import React from 'react';
import { View } from '../types';
import CodeView from '../components/views/CodeView';
import PreviewView from '../components/views/PreviewView';
import AiView from '../components/views/AiView';
import GitView from '../components/views/GitView';
import SettingsView from '../components/views/SettingsView';
import PromptsView from '../components/views/PromptsView';
import BrowserView from '../components/views/BrowserView';
import { useAppLogic } from './useAppLogic';

type AppLogic = ReturnType<typeof useAppLogic>;

const ViewRenderer: React.FC<AppLogic> = (props) => {
    if (!props.activeProject) return null; // Should be handled by App.tsx, but as a safeguard.

    switch (props.activeView) {
        case View.Code:
            return <CodeView 
                files={props.files}
                activeFile={props.activeFile}
                onFileChange={props.onFileChange}
                onFileSelect={props.onFileSelect}
                onFileAdd={props.onFileAdd}
                onFileRemove={props.onFileRemove}
                isFullScreen={props.isFullScreen}
                onToggleFullScreen={props.onToggleFullScreen}
            />;
        case View.Preview:
            return <PreviewView 
                files={props.files}
                entryPoint={props.activeProject.entryPoint || 'index.tsx'}
                apiKey={props.settings.apiKey}
                isBundling={props.isBundling}
                bundleError={props.bundleError}
                builtCode={props.builtCode}
                buildId={props.buildId}
                bundleLogs={props.bundleLogs}
                onClearLogs={props.handleClearBundleLogs}
                isFullScreen={props.isFullScreen}
                onToggleFullScreen={props.onToggleFullScreen}
                onProxyFetch={props.onProxyFetch}
                onProxyIframeLoad={props.onProxyIframeLoad}
                onProxyNavigate={props.onProxyNavigate}
                onVirtualStorageRequest={() => {}} // Placeholder
                consoleLogs={props.previewConsoleLogs}
                onConsoleMessage={props.handleConsoleMessage}
                onClearConsole={props.handleClearConsoleLogs}
            />;
        case View.Browser:
            return <BrowserView />;
        case View.Ai:
            return <AiView 
                activeThread={props.activeThread}
                isResponding={props.isResponding}
                onSend={props.onSend}
                isLive={props.isLive}
                isMuted={props.isMuted}
                isSpeaking={props.isSpeaking}
                isAiTurn={props.isAiTurn}
                isWakeWordEnabled={props.settings.wakeWordEnabled}
                onStartLiveSession={props.startLiveSession}
                onStopLiveSession={props.stopLiveSession}
                onToggleMute={props.toggleMute}
                isHistoryOpen={props.isHistoryOpen}
                // FIX: The `useUIState` hook returns `setIsHistoryOpen`. These props are adapted to use that state setter function.
                onOpenHistory={() => props.setIsHistoryOpen(true)}
                onCloseHistory={() => props.setIsHistoryOpen(false)}
                threads={props.threads}
                activeThreadId={props.activeThreadId}
                onNewThread={props.onNewThread}
                onSwitchThread={props.onSwitchThread}
                onDeleteThread={props.onDeleteThread}
            />;
        case View.Git:
            return <GitView 
                files={props.files}
                changedFiles={props.changedFiles}
                onCommit={props.onCommit}
                onCommitAndPush={props.onCommitAndPush}
                isCommitting={props.isCommitting}
                gitService={props.gitService}
                onBranchSwitch={props.onBranchSwitch}
                onOpenFileInEditor={props.onOpenFileInEditor}
                onPush={props.onPush}
                onPull={props.onPull}
                onRebase={props.onRebase}
                isGitNetworkActivity={props.isGitNetworkActivity}
                gitNetworkProgress={props.gitNetworkProgress}
                onDiscardChanges={props.onDiscardChanges}
                commitMessage={props.commitMessage}
                onCommitMessageChange={props.setCommitMessage}
            />;
        case View.Settings:
            return <SettingsView 
                settings={props.settings}
                onSettingsChange={props.setSettings}
                gitCredentials={props.gitCredentials}
                onManageCredentials={() => props.setIsGitCredentialsModalOpen(true)}
                onOpenDebugLog={() => props.setIsDebugLogModalOpen(true)}
                onNavigate={props.onNavigate}
            />;
        case View.Prompts:
            return <PromptsView
                prompts={props.prompts}
                createPrompt={props.createPrompt}
                updatePrompt={props.updatePrompt}
                revertToVersion={props.revertToVersion}
                deletePrompt={props.deletePrompt}
            />;
        default:
            return <div className="p-4 text-vibe-comment">Select a view</div>;
    }
};

export default ViewRenderer;
