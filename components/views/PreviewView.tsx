import React from 'react';
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
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
}

const PreviewView: React.FC<PreviewViewProps> = (props) => {
  const { files, entryPoint, onLog, onClearLogs, onRuntimeError, bundleLogs, isFullScreen, onToggleFullScreen } = props;

  const { isBundling, bundleError, builtCode, buildId } = usePreviewBundler({
    files,
    entryPoint,
    onLog,
    onClearLogs,
  });

  return (
    <div className="flex-1 grid grid-rows-[auto_1fr_auto] bg-vibe-bg-deep rounded-lg overflow-hidden">
      <div className="flex-shrink-0 bg-vibe-panel p-1 flex justify-between items-center border-b border-vibe-bg">
        <span className="text-sm text-vibe-text-secondary px-2">Preview</span>
        <button onClick={onToggleFullScreen} className="p-1 hover:bg-vibe-bg-deep rounded" title={isFullScreen ? 'Exit Full Screen' : 'Enter Full Screen'}>
          {isFullScreen ? <CompressIcon className="w-4 h-4" /> : <ExpandIcon className="w-4 h-4" />}
        </button>
      </div>
      
      <div id="preview-container" className="relative overflow-hidden">
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

      <BuildLogDisplay 
        logs={bundleLogs}
        error={bundleError}
        onClear={onClearLogs}
      />
    </div>
  );
};

export default PreviewView;
