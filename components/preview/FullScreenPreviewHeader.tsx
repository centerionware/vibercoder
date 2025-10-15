import React from 'react';
import CompressIcon from '../icons/CompressIcon';

interface FullScreenPreviewHeaderProps {
  onExitFullScreen: () => void;
  isNative: boolean;
}

const FullScreenPreviewHeader: React.FC<FullScreenPreviewHeaderProps> = ({ onExitFullScreen, isNative }) => {
  const nativeTopPaddingClass = isNative ? 'pt-8' : '';

  return (
    <header className={`flex-shrink-0 bg-vibe-bg-deep p-2 flex justify-end items-center border-b border-vibe-panel ${nativeTopPaddingClass}`}>
      <button
        onClick={onExitFullScreen}
        className="p-2 bg-vibe-panel rounded-full text-vibe-text-secondary hover:bg-vibe-comment transition-colors"
        title="Exit Full Screen"
        aria-label="Exit Full Screen"
      >
        <CompressIcon className="w-5 h-5" />
      </button>
    </header>
  );
};

export default FullScreenPreviewHeader;