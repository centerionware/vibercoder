import { useState } from 'react';
import { Project } from '../types';

export const useUIState = () => {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [isGitCredentialsModalOpen, setIsGitCredentialsModalOpen] = useState(false);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
    const [isScreenshotPreviewDisabled, setIsScreenshotPreviewDisabled] = useState(false);
    const [isLiveVideoModalOpen, setIsLiveVideoModalOpen] = useState(false);
    const [liveFrameData, setLiveFrameData] = useState<string | null>(null);
    const [isDebugLogModalOpen, setIsDebugLogModalOpen] = useState(false);

    return {
        isFullScreen, setIsFullScreen,
        permissionError, setPermissionError,
        isGitCredentialsModalOpen, setIsGitCredentialsModalOpen,
        isProjectModalOpen, setIsProjectModalOpen,
        isProjectSettingsModalOpen, setIsProjectSettingsModalOpen,
        projectToEdit, setProjectToEdit,
        isHistoryOpen, setIsHistoryOpen,
        screenshotPreview, setScreenshotPreview,
        isScreenshotPreviewDisabled, setIsScreenshotPreviewDisabled,
        isLiveVideoModalOpen, setIsLiveVideoModalOpen,
        liveFrameData, setLiveFrameData,
        isDebugLogModalOpen, setIsDebugLogModalOpen,
    };
};
