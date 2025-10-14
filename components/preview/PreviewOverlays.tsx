import React from 'react';
import SpinnerIcon from '../icons/SpinnerIcon';

interface PreviewOverlaysProps {
  isBundling: boolean;
  builtCode: string | null;
  bundleError: string | null;
}

const PreviewOverlays: React.FC<PreviewOverlaysProps> = ({ isBundling, builtCode, bundleError }) => {
  if (isBundling) {
    return (
      <div className="absolute inset-0 bg-vibe-bg-deep/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-vibe-panel p-4 rounded-lg border border-vibe-accent/30 text-center">
          <h3 className="text-lg font-bold text-vibe-accent flex items-center gap-2">
            <SpinnerIcon className="w-5 h-5" /> Building...
          </h3>
          <p className="text-sm text-vibe-text-secondary mt-2">Check the build output below for progress.</p>
        </div>
      </div>
    );
  }

  if (bundleError) {
    return (
      <div className="absolute inset-0 bg-vibe-bg-deep/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-vibe-panel p-4 rounded-lg border border-red-500/30 text-center">
          <h3 className="text-lg font-bold text-red-400">Build Failed</h3>
          <p className="text-sm text-vibe-text-secondary mt-2">Check build output for details.</p>
        </div>
      </div>
    );
  }

  if (!builtCode) {
    return (
      <div className="flex h-full items-center justify-center text-vibe-comment">
        <p>Preview will appear here after a successful build.</p>
      </div>
    );
  }

  return null;
};

export default PreviewOverlays;
