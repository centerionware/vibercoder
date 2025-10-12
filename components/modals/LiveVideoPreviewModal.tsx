import React from 'react';
import XIcon from '../icons/XIcon';
import SpinnerIcon from '../icons/SpinnerIcon';

interface LiveVideoPreviewModalProps {
  frameDataUrl: string | null;
  onClose: () => void;
}

const LiveVideoPreviewModal: React.FC<LiveVideoPreviewModalProps> = ({ frameDataUrl, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-vibe-accent/30"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-3 border-b border-vibe-bg-deep flex-shrink-0">
          <h2 className="text-lg font-bold text-vibe-text">Live Stream to AI (1 FPS)</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-vibe-text-secondary hover:bg-vibe-bg-deep"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </header>
        <div className="overflow-auto p-4 bg-vibe-bg-deep flex-1 flex items-center justify-center">
          {frameDataUrl ? (
            <img src={frameDataUrl} alt="Live stream preview" className="max-w-full h-auto mx-auto rounded-md shadow-lg" />
          ) : (
            <div className="text-vibe-comment flex flex-col items-center">
                <SpinnerIcon className="w-8 h-8 mb-4"/>
                <p>Waiting for next frame...</p>
            </div>
          )}
        </div>
        <footer className="p-3 border-t border-vibe-bg-deep flex items-center justify-end flex-shrink-0">
            <button
              onClick={onClose}
              className="bg-vibe-accent px-5 py-2 rounded-md text-sm text-white font-semibold hover:bg-vibe-accent-hover transition-colors"
            >
              Close
            </button>
        </footer>
      </div>
    </div>
  );
};

export default LiveVideoPreviewModal;