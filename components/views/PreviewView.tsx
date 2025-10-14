import React, { useRef, useState, useEffect } from 'react';
import { usePreviewBundler } from '../../hooks/usePreviewBundler';
import CompressIcon from '../icons/CompressIcon';
import ExpandIcon from '../icons/ExpandIcon';
import BuildLogDisplay from '../preview/BuildLogDisplay';
import PreviewIframe from '../preview/PreviewIframe';
import PreviewOverlays from '../preview/PreviewOverlays';

interface PreviewViewProps {
  files: Record<string, string>;
  entryPoint: string;
  onLog: (log: string) => void;
  onRuntimeError: (error: string) => void;
  bundleLogs: string[];
  onClearLogs: () => void;
}

const PreviewView: React.FC<PreviewViewProps> = (props) => {
  const { files, entryPoint, onLog, onClearLogs, onRuntimeError, bundleLogs } = props;

  const { isBundling, bundleError, builtCode, buildId } = usePreviewBundler({
    files,
    entryPoint,
    onLog,
    onClearLogs,
  });

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = document.fullscreenElement === previewContainerRef.current;
      setIsFullscreen(isCurrentlyFullscreen);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullScreen = () => {
    if (!document.fullscreenElement) {
      previewContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-vibe-bg-deep rounded-lg overflow-hidden">
      <div className="flex-shrink-0 bg-vibe-panel p-1 flex justify-between items-center border-b border-vibe-bg">
        <span className="text-sm text-vibe-text-secondary px-2">Preview</span>
        <button onClick={handleToggleFullScreen} className="p-1 hover:bg-vibe-bg-deep rounded" title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}>
          {isFullscreen ? <CompressIcon className="w-4 h-4" /> : <ExpandIcon className="w-4 h-4" />}
        </button>
      </div>
      
      <div id="preview-container" ref={previewContainerRef} className="relative flex-1 overflow-hidden bg-vibe-bg-deep">
        <PreviewOverlays 
            isBundling={isBundling}
            builtCode={builtCode}
            bundleError={bundleError}
        />
        
        {builtCode && buildId && (
            <PreviewIframe
                buildId={buildId}
                builtCode={builtCode}
                onRuntimeError={onRuntimeError}
            />
        )}
      </div>

      {!isFullscreen && (
        <BuildLogDisplay 
          logs={bundleLogs}
          error={bundleError}
          onClear={onClearLogs}
        />
      )}
    </div>
  );
};

export default PreviewView;
