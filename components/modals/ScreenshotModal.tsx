import React from 'react';
import XIcon from '../icons/XIcon';

interface ScreenshotModalProps {
  imageDataUrl: string;
  onClose: () => void;
  onDisable: () => void;
}

const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ imageDataUrl, onClose, onDisable }) => {
  return (
    <div 
      className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-vibe-accent/30"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-3 border-b border-vibe-bg-deep flex-shrink-0">
          <h2 className="text-lg font-bold text-vibe-text">Screenshot Sent to AI</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-vibe-text-secondary hover:bg-vibe-bg-deep"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </header>
        <div className="overflow-auto p-2 bg-vibe-bg-deep flex-1">
          <img src={imageDataUrl} alt="Screenshot preview" className="max-w-full h-auto mx-auto rounded-md" />
        </div>
        <footer className="p-3 border-t border-vibe-bg-deep flex items-center justify-between flex-shrink-0 text-right">
            <div className="flex items-center text-sm">
                <input
                    id="disable-preview"
                    type="checkbox"
                    onChange={onDisable}
                    className="h-4 w-4 rounded bg-vibe-bg-deep border-vibe-comment text-vibe-accent focus:ring-vibe-accent"
                />
                <label htmlFor="disable-preview" className="ml-2 text-vibe-text-secondary">
                    Don't show again this session
                </label>
            </div>
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

export default ScreenshotModal;
