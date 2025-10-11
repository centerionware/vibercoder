import React from 'react';
import HistoryIcon from '../icons/HistoryIcon';
import MicrophoneIcon from '../icons/MicrophoneIcon';
import MicrophoneOffIcon from '../icons/MicrophoneOffIcon';

interface AiHeaderProps {
  isLive: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  onHistoryClick: () => void;
}

const AiHeader: React.FC<AiHeaderProps> = ({ isLive, isMuted, toggleMute, onHistoryClick }) => {
  return (
    <header className="flex items-center justify-between p-3 border-b border-vibe-panel flex-shrink-0">
      <h2 className="text-lg font-bold text-vibe-text">AI Assistant</h2>
      <div className="flex items-center space-x-2">
        <button
          onClick={onHistoryClick}
          className="p-2 rounded-md text-vibe-text-secondary hover:bg-vibe-panel"
          aria-label="View chat history"
        >
          <HistoryIcon className="w-5 h-5" />
        </button>

        {isLive && (
          <>
            <div className="w-px h-6 bg-vibe-panel"></div>
            <div className="flex items-center gap-2 text-sm text-green-400">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span>Live</span>
            </div>
            <button
              onClick={toggleMute}
              className={`p-2 rounded-full transition-colors ${
                isMuted
                  ? 'bg-yellow-500/30 text-yellow-300'
                  : 'bg-vibe-panel text-vibe-text-secondary'
              }`}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? (
                <MicrophoneOffIcon className="w-5 h-5" />
              ) : (
                <MicrophoneIcon className="w-5 h-5" />
              )}
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default AiHeader;
