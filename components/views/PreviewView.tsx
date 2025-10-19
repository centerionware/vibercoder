import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import ExpandIcon from '../icons/ExpandIcon';
import BuildLogDisplay from '../preview/BuildLogDisplay';
import PreviewIframe from '../preview/PreviewIframe';
import PreviewOverlays from '../preview/PreviewOverlays';
import FullScreenPreviewHeader from '../preview/FullScreenPreviewHeader';
import { PreviewLogEntry } from '../../types';
import PreviewConsole from '../preview/PreviewConsole';

interface PreviewViewProps {
  files: Record<string, string>;
  entryPoint: string;
  apiKey: string;
  isBundling: boolean;
  bundleError: string | null;
  builtCode: string | null;
  buildId: string | null;
  bundleLogs: string[];
  onClearLogs: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onProxyFetch: (event: MessageEvent) => void;
  onProxyIframeLoad: (event: MessageEvent) => void;
  onVirtualStorageRequest: (request: any) => void;
  consoleLogs: PreviewLogEntry[];
  onConsoleMessage: (log: Omit<PreviewLogEntry, 'id'>) => void;
  onClearConsole: () => void;
}

const PreviewView: React.FC<PreviewViewProps> = (props) => {
  const {
    isBundling,
    bundleError,
    builtCode,
    buildId,
    bundleLogs,
    onClearLogs,
    isFullScreen,
    onToggleFullScreen,
    onProxyFetch,
    onProxyIframeLoad,
    onVirtualStorageRequest,
    consoleLogs,
    onConsoleMessage,
    onClearConsole,
  } = props;

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
              key={buildId}
              builtCode={builtCode}
              onProxyFetch={onProxyFetch}
              onProxyIframeLoad={onProxyIframeLoad}
              onVirtualStorageRequest={onVirtualStorageRequest}
              onConsoleMessage={onConsoleMessage}
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
            key={buildId}
            builtCode={builtCode}
            onProxyFetch={onProxyFetch}
            onProxyIframeLoad={onProxyIframeLoad}
            onVirtualStorageRequest={onVirtualStorageRequest}
            onConsoleMessage={onConsoleMessage}
          />
        )}
      </div>

      <div className="flex-shrink-0">
        <PreviewConsole
          logs={consoleLogs}
          onClear={onClearConsole}
        />

        <BuildLogDisplay
          logs={bundleLogs}
          // FIX: The 'error' prop was not defined. Corrected to use 'bundleError' from the component's props.
          error={bundleError}
          onClear={onClearLogs}
        />
      </div>
    </div>
  );
};

export default PreviewView;
