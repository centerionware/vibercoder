





// FIX: Imported useState and useEffect from React, as they were being used without being imported.
import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
// FIX: Corrected import paths for useAppLogic and ViewRenderer to be relative to the current file location, resolving module not found errors.
import { useAppLogic } from './app/useAppLogic';

import Header from './components/Header';
import BottomNav from './components/BottomNav';
// FIX: Corrected import paths for useAppLogic and ViewRenderer to be relative to the current file location, resolving module not found errors.
import ViewRenderer from './app/ViewRenderer';
import SpinnerIcon from './components/icons/SpinnerIcon';
import GitCredentialsModal from './components/modals/GitCredentialsModal';
import MicPermissionModal from './components/modals/MicPermissionModal';
import ScreenshotModal from './components/modals/ScreenshotModal';
import ProjectManagementModal from './components/modals/ProjectManagementModal';
import ProjectSettingsModal from './components/modals/ProjectSettingsModal';
import LiveVideoPreviewModal from './components/modals/LiveVideoPreviewModal';
import DebugLogModal from './components/modals/DebugLogModal';

const App = () => {
  const app = useAppLogic();
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // This check runs once on mount to determine the platform.
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // FIX: Added a check for `app.activeProject`. The component was attempting to render before an active project was loaded, causing a crash. This ensures we show the loading screen until a project is fully initialized.
  if (!app.isProjectLoaded || !app.activeProject) {
    return (
      <div className="bg-vibe-bg-deep h-screen w-screen flex flex-col items-center justify-center">
        <SpinnerIcon className="w-8 h-8 text-vibe-accent" />
        <p className="mt-4 text-vibe-text-secondary">Loading project...</p>
      </div>
    );
  }

  const mainContentClass = app.isFullScreen ? 'fixed inset-0 z-50 bg-vibe-bg-deep flex flex-col' : 'relative flex flex-col h-full';
  const nativeTopPaddingClass = isNative ? 'pt-8' : ''; // Add padding for the native status bar

  return (
    <div id="app-container" className="bg-vibe-bg text-vibe-text font-sans h-screen">
      <div key={app.activeProject.id} className={`${mainContentClass} ${nativeTopPaddingClass}`}>
        {!app.isFullScreen && (
          <Header
            isLiveVideoEnabled={app.isVideoStreamEnabled}
            onLiveVideoIconClick={() => app.setIsLiveVideoModalOpen(true)}
            projectName={app.activeProject.name}
            onProjectNameClick={() => app.setIsProjectModalOpen(true)}
            onTitleClick={() => window.location.reload()}
            isLive={app.isLive}
            isMuted={app.isMuted}
            onToggleMute={app.toggleMute}
          />
        )}
        <main className={`flex-1 flex flex-col overflow-hidden ${app.isFullScreen ? '' : 'pb-20'}`}>
          <ViewRenderer {...app} />
        </main>
        {!app.isFullScreen && (
          <div className="hidden md:block">
            <BottomNav activeView={app.activeView} onNavigate={app.onNavigate} />
          </div>
        )}
      </div>

      {/* Modals & Overlays */}
      <GitCredentialsModal
        isOpen={app.isGitCredentialsModalOpen}
        onClose={() => app.setIsGitCredentialsModalOpen(false)}
        credentials={app.gitCredentials}
        onCreate={app.createGitCredential}
        onDelete={app.deleteGitCredential}
        onSetDefault={app.setDefaultGitCredential}
      />
      {app.permissionError && (
        <MicPermissionModal
          message={app.permissionError}
          onClose={() => app.setPermissionError(null)}
        />
      )}
      {app.screenshotPreview && (
        <ScreenshotModal
          imageDataUrl={app.screenshotPreview}
          onClose={() => app.setScreenshotPreview(null)}
          onDisable={() => app.setIsScreenshotPreviewDisabled(true)}
        />
      )}
      <ProjectManagementModal
        isOpen={app.isProjectModalOpen}
        onClose={() => app.setIsProjectModalOpen(false)}
        projects={app.projects}
        activeProject={app.activeProject}
        onNewProject={app.createNewProject}
        onSwitchProject={(id) => { app.switchProject(id); app.setIsProjectModalOpen(false); }}
        onDeleteProject={app.deleteProject}
        onOpenProjectSettings={(p) => { app.setProjectToEdit(p); app.setIsProjectSettingsModalOpen(true); }}
        onCloneProject={app.handleClone}
        isCloning={app.isCloning}
        cloningProgress={app.cloningProgress}
        gitCredentials={app.gitCredentials}
        onManageCredentials={() => {
            app.setIsProjectModalOpen(false);
            app.setIsGitCredentialsModalOpen(true);
        }}
      />
      <ProjectSettingsModal
        isOpen={app.isProjectSettingsModalOpen}
        onClose={() => { app.setIsProjectSettingsModalOpen(false); app.setProjectToEdit(null); }}
        project={app.projectToEdit}
        onSave={(p) => { app.updateProject(p); }}
        credentials={app.gitCredentials}
        globalSettings={app.settings}
      />
      {app.isLiveVideoModalOpen && (
        <LiveVideoPreviewModal
            frameDataUrl={app.liveFrameData}
            onClose={() => app.setIsLiveVideoModalOpen(false)}
        />
      )}
      <DebugLogModal
        isOpen={app.isDebugLogModalOpen}
        onClose={() => app.setIsDebugLogModalOpen(false)}
        logs={app.debugLogs}
        onClear={app.handleClearDebugLogs}
      />


      {/* Mobile Nav */}
      {!app.isFullScreen && (
        <div className="md:hidden">
          <BottomNav activeView={app.activeView} onNavigate={app.onNavigate} />
        </div>
      )}
    </div>
  );
};

export default App;