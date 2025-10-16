
import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { usePreviewBundler } from '../../hooks/usePreviewBundler';
import ExpandIcon from '../icons/ExpandIcon';
import BuildLogDisplay from '../preview/BuildLogDisplay';
import PreviewIframe from '../preview/PreviewIframe';
import PreviewOverlays from '../preview/PreviewOverlays';
import FullScreenPreviewHeader from '../preview/FullScreenPreviewHeader';

interface PreviewViewProps {
  files: Record<string, string>;
  entryPoint: string;
  apiKey: string;
  onLog: (log: string) => void;
  onRuntimeError: (error: string) => void;
  bundleLogs: string[];
  onClearLogs: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onProxyFetch: (request: any) => void;
  onVirtualStorageRequest: (request: any) => void;
}

const PreviewView: React.FC<PreviewViewProps> = (props) => {
  const {
    files,
    entryPoint,
    apiKey,
    onLog,
    onClearLogs,
    onRuntimeError,
    bundleLogs,
    isFullScreen,
    onToggleFullScreen,
    onProxyFetch,
    onVirtualStorageRequest,
  } = props;

  const { isBundling, bundleError, builtCode } = usePreviewBundler({
    files,
    entryPoint,
    apiKey,
    onLog,
    onClearLogs,
  });

  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  if (isFullScreen) {
    return (
      <div className="flex flex-1 flex-col bg-vibe-bg-deep">
        <FullScreenPreviewHeader
          isNative={isNative}
          onExitFullScreen={onToggleFullScreen}
        />
        <div className="relative flex-1 overflow-hidden min-h-0">
          <PreviewOverlays
            isBundling={isBundling}
            builtCode={builtCode}
            bundleError={bundleError}
          />
          {builtCode && (
            <PreviewIframe
              builtCode={builtCode}
              onRuntimeError={onRuntimeError}
              onProxyFetch={onProxyFetch}
              onVirtualStorageRequest={onVirtualStorageRequest}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-vibe-bg-deep overflow-hidden">
      <div className="flex-shrink-0 bg-vibe-panel p-1 flex justify-between items-center border-b border-vibe-bg">
        <span className="text-sm text-vibe-text-secondary px-2">Preview</span>
        <button onClick={onToggleFullScreen} className="p-1 hover:bg-vibe-bg-deep rounded" title="Enter Full Screen">
          <ExpandIcon className="w-4 h-4" />
        </button>
      </div>

      <div id="preview-container" className="relative flex-1 overflow-hidden bg-vibe-bg-deep min-h-0">
        <PreviewOverlays
          isBundling={isBundling}
          builtCode={builtCode}
          bundleError={bundleError}
        />
        {builtCode && (
          <PreviewIframe
            builtCode={builtCode}
            onRuntimeError={onRuntimeError}
            onProxyFetch={onProxyFetch}
            onVirtualStorageRequest={onVirtualStorageRequest}
          />
        )}
      </div>

      <BuildLogDisplay
        logs={bundleLogs}
        error={bundleError}
        onClear={onClearLogs}
      />
    </div>
  );
};

export default PreviewView;