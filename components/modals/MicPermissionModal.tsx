
import React from 'react';
import MicrophoneIcon from '../icons/MicrophoneIcon';

interface MicPermissionModalProps {
  message: string;
  onClose: () => void;
  onRetry?: () => void;
  isRetryable?: boolean;
}

const MicPermissionModal: React.FC<MicPermissionModalProps> = ({ message, onClose, onRetry, isRetryable }) => {
  
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    onClose(); // Always close the modal after action
  };

  return (
    <div 
      className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-md flex flex-col border border-yellow-500/30"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 p-4 border-b border-vibe-bg-deep">
          <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-400">
            <MicrophoneIcon className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-yellow-400">Voice Session Notice</h2>
        </header>
        <div className="p-6 text-vibe-text-secondary">
          <div className="whitespace-pre-wrap">{message}</div>
          { !isRetryable && (
            <p className="mt-4 text-sm text-vibe-comment">
              Voice features are a core part of the VibeCode experience. Granting microphone access will enable the hands-free "Hey Vibe" wake word and real-time voice chat with the AI assistant.
            </p>
          )}
        </div>
        <footer className="p-3 bg-vibe-bg-deep/50 flex justify-end items-center gap-3">
            <button
              onClick={onClose}
              className="bg-vibe-bg-deep px-4 py-2 rounded-md text-sm text-vibe-text-secondary hover:bg-vibe-comment transition-colors"
            >
              {isRetryable ? 'Close' : 'OK, I understand'}
            </button>
            {isRetryable && onRetry && (
              <button
                onClick={handleRetry}
                className="bg-vibe-accent px-5 py-2 rounded-md text-sm text-white font-semibold hover:bg-vibe-accent-hover transition-colors"
              >
                Try Again
              </button>
            )}
        </footer>
      </div>
    </div>
  );
};

export default MicPermissionModal;
